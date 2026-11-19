/**
 * Public demo: POST /api/demo/start kicks off a fresh workspace, the page
 * polls GET /api/demo/status/:jobId for the setup bar and receives a normal
 * login payload when it is ready.
 *
 * Progress lives in memory — the API runs as a single process.
 */
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const { ensureDemoSchema } = require('../utils/demoGuard');
const { createDemoWorkspace, DEMO_TTL_DAYS } = require('../services/demo/createDemoWorkspace');
const { fetchUserCompanies, DEFAULT_LANGUAGE_CODE } = require('../utils/userLoginPayload');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const MAX_ACTIVE = Number(process.env.DEMO_MAX_ACTIVE) || 150;
const PER_IP_PER_DAY = Number(process.env.DEMO_PER_IP_PER_DAY) || 6;
const MAX_CONCURRENT = 2;
const JOB_TTL_MS = 15 * 60 * 1000;

const jobs = new Map();
const startsByIp = new Map();
const queue = [];
let running = 0;

function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf).trim();
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) {
    const parts = String(fwd).split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return String(req.socket?.remoteAddress || 'unknown');
}

function pruneJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const [ip, list] of startsByIp) {
    const recent = list.filter((t) => t > dayAgo);
    if (recent.length) startsByIp.set(ip, recent);
    else startsByIp.delete(ip);
  }
}

function pump() {
  while (running < MAX_CONCURRENT && queue.length) {
    const task = queue.shift();
    running += 1;
    task().finally(() => {
      running -= 1;
      pump();
    });
  }
}

async function buildLoginPayload({ userId, companyId, email, expiresAt }) {
  const companies = await fetchUserCompanies(userId);
  const active = companies.find((c) => Number(c.id) === Number(companyId)) || companies[0];
  const token = jwt.sign(
    {
      userId,
      email,
      firstName: 'Dan',
      lastName: 'Whitaker',
      role: active.role,
      activeCompanyId: active.id,
    },
    JWT_SECRET,
    { expiresIn: `${DEMO_TTL_DAYS}d` }
  );
  const activeCompany = {
    id: active.id,
    name: active.name,
    slug: active.slug,
    countryCode: active.countryCode,
    role: active.role,
    isOwner: active.isOwner,
    suspendedAt: null,
    onboardingCompleted: true,
    onboardingStep: 'done',
    isDemo: true,
    demoExpiresAt: expiresAt.toISOString(),
  };
  return {
    token,
    expiresAt: expiresAt.toISOString(),
    user: {
      id: userId,
      firstName: 'Dan',
      lastName: 'Whitaker',
      email,
      languageCode: DEFAULT_LANGUAGE_CODE,
      role: 'company-owner',
      companyId: active.id,
      companyName: active.name,
      companies,
      activeCompany,
      pendingInvites: [],
    },
  };
}

router.post('/start', async (req, res) => {
  try {
    pruneJobs();
    await ensureDemoSchema();

    const ip = clientIp(req);
    const recent = startsByIp.get(ip) || [];
    if (recent.length >= PER_IP_PER_DAY) {
      return res.status(429).json({
        error: 'DEMO_RATE_LIMIT',
        message: "You've started a few demos today. Try again tomorrow, or sign up for a free account.",
      });
    }

    const active = await pool.query(
      `SELECT COUNT(*)::int AS n FROM companies WHERE is_demo = TRUE AND demo_expires_at > NOW()`
    );
    if (active.rows[0].n + queue.length + running >= MAX_ACTIVE) {
      return res.status(503).json({
        error: 'DEMO_CAPACITY',
        message: 'The demo is very popular right now. Please try again in a little while.',
      });
    }

    startsByIp.set(ip, [...recent, Date.now()]);
    const jobId = crypto.randomBytes(18).toString('hex');
    const job = { createdAt: Date.now(), progress: 1, step: 'Waiting for a free slot', done: false, error: null, result: null };
    jobs.set(jobId, job);

    queue.push(async () => {
      try {
        job.step = 'Starting';
        const created = await createDemoWorkspace({
          onProgress: (pct, label) => {
            job.progress = Math.max(job.progress, pct);
            job.step = label;
          },
        });
        job.result = await buildLoginPayload(created);
        job.progress = 100;
        job.done = true;
      } catch (e) {
        console.error('[demo] create failed:', e);
        job.error = 'Something went wrong while setting up the demo. Please try again.';
      }
    });
    pump();

    res.status(202).json({ jobId });
  } catch (e) {
    console.error('[demo] start failed:', e);
    res.status(500).json({ error: 'Could not start the demo' });
  }
});

router.get('/status/:jobId', (req, res) => {
  const job = jobs.get(String(req.params.jobId || ''));
  if (!job) return res.status(404).json({ error: 'Demo setup not found' });
  res.json({
    progress: job.progress,
    step: job.step,
    done: job.done,
    error: job.error,
    ...(job.done ? job.result : {}),
  });
});

module.exports = router;
