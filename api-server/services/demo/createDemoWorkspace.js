/**
 * Builds one public demo workspace: a solo window cleaner based in Harrogate
 * (with rounds across nearby towns) who has used PathPilo for a little over a year.
 *
 * Content is fixed (ukDemoDataset.json + the tables below) so every demo
 * looks the same, but every date is relative to "today" in Europe/London:
 * past visits are done and mostly invoiced, today's round is part-way
 * through, and the next year is planned.
 *
 * Shapes follow what the app itself writes: library rounds with round-owned
 * subscriptions (roundSubscriptions.js), one materialized job per occurrence
 * (subscriptionProjection.js), planned daily_routes packages
 * (roundPackages.js) and frozen invoice snapshots (invoiceSnapshot.js).
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../../utils/database');
const dataset = require('./ukDemoDataset.json');
const {
  ensureDemoSchema,
  ensureDemoLogoAsset,
  markDemoCompany,
  DEMO_EMAIL_DOMAIN,
  DEMO_LOGO_URL,
} = require('../../utils/demoGuard');
const { getSendInvoiceDefaults } = require('../../utils/companyInvoiceEmailLocale');

const TZ = 'Europe/London';
const DEMO_TTL_DAYS = 3;
const HISTORY_DAYS = 400;
const FUTURE_DAYS = 364;
const WORK_START = 8 * 60 + 30;
/** Work + driving on a round day; leaves room before the 16:00–16:30 finish. */
const DAY_BUDGET_MINUTES = 420;
const DUE_DAYS = 14;
const CHUNK = 500;

const COMPANY = {
  name: 'Brightside Window Cleaning',
  ownerFirst: 'Dan',
  ownerLast: 'Whitaker',
  phone: '07700 900900',
  country: 'United Kingdom',
};

const SERVICES = {
  window: { title: 'Window clean', price: 16, duration: 20 },
  inside: { title: 'Inside windows', price: 25, duration: 30 },
  conservatory: { title: 'Conservatory roof clean', price: 55, duration: 60 },
  gutter: { title: 'Gutter clear', price: 70, duration: 60 },
  fascia: { title: 'Fascia & soffit clean', price: 60, duration: 50 },
  solar: { title: 'Solar panel clean', price: 45, duration: 40 },
};

// ── Deterministic "randomness" ─────────────────────────────────────────────
function rng(...parts) {
  let h = 2166136261;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = (h + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pickBy = (arr, ...parts) => arr[Math.floor(rng(...parts) * arr.length)];

// ── Dates (plain YYYY-MM-DD strings, UTC arithmetic so DST never shifts days) ─
const DAY = 86400000;
const toUtc = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (ymd, n) => fromUtc(toUtc(ymd) + n * DAY);
const dowOf = (ymd) => new Date(toUtc(ymd)).getUTCDay();
const diffDays = (a, b) => Math.round((toUtc(a) - toUtc(b)) / DAY);
const monthOf = (ymd) => +ymd.slice(5, 7);

function londonNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, minutes: +parts.hour * 60 + +parts.minute };
}

const clock = (mins) => {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const stamp = (ymd, mins) => `${ymd} ${clock(mins)}:00`;

// ── Geometry ───────────────────────────────────────────────────────────────
const toRad = (d) => (d * Math.PI) / 180;
function km(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}
const roadKm = (a, b) => km(a, b) * 1.35;
const driveMinutes = (a, b) => Math.max(1, Math.round((roadKm(a, b) / 24) * 60 * 10) / 10);

const windowDuration = (price) => Math.min(35, Math.max(15, Math.round((8 + price * 0.75) / 5) * 5));
const round2 = (n) => Math.round(n * 100) / 100;

// ── Bulk insert ────────────────────────────────────────────────────────────
async function insertRows(db, table, columns, rows, { returning = null, casts = {} } = {}) {
  const ids = [];
  const per = Math.max(1, Math.min(CHUNK, Math.floor(60000 / columns.length)));
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const values = [];
    const tuples = chunk.map((row) => {
      const ph = columns.map((col) => {
        values.push(row[col] === undefined ? null : row[col]);
        return `$${values.length}${casts[col] ? `::${casts[col]}` : ''}`;
      });
      return `(${ph.join(',')})`;
    });
    const res = await db.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${tuples.join(',')}${returning ? ` RETURNING ${returning}` : ''}`,
      values
    );
    if (returning) for (const r of res.rows) ids.push(r[returning]);
  }
  return ids;
}

// ── Pipeline content (days are relative to today) ──────────────────────────
const LEADS = [
  { key: 'kate', first: 'Kate', last: 'Brennan', status: 'new', source: 'form', daysAgo: 0, minutes: -150,
    message: 'Hi, just moved in. Could you do front and back every 4 weeks? 3 bed semi with a small conservatory.' },
  { key: 'raj', first: 'Raj', last: 'Mistry', status: 'new', source: 'form', daysAgo: 1, minutes: 19 * 60 + 12,
    message: 'Looking for a regular window cleaner for a detached house. Also keen to get the gutters cleared before winter.' },
  { key: 'pat', first: 'Pat', last: 'Doyle', status: 'new', source: 'manual', daysAgo: 2, minutes: 12 * 60 + 40,
    message: 'Rang up. Wants a price for fascias and soffits, white uPVC, two storey.' },
  { key: 'lauren', first: 'Lauren', last: 'Fox', status: 'contacted', source: 'form', daysAgo: 4, minutes: 8 * 60 + 5,
    message: 'Every 8 weeks would suit us. 2 bed terrace.', notes: 'Left a voicemail, try again Thursday.' },
  { key: 'gareth', first: 'Gareth', last: 'Lloyd', status: 'contacted', source: 'form', daysAgo: 11, minutes: 17 * 60 + 30,
    message: 'Bungalow, front and back please.', notes: 'Spoke on the phone. Wants a price for inside as well.' },
  { key: 'sophie', first: 'Sophie', last: 'Grant', status: 'quoted', source: 'form', daysAgo: 7, minutes: 9 * 60 + 50,
    message: 'Gutters are overflowing at the back. Could you also do the windows?',
    offer: { status: 'sent', sentDaysAgo: 6, viewedDaysAgo: 2, items: [['gutter', 75], ['window', 18]] } },
  { key: 'martin', first: 'Martin', last: 'Hale', status: 'quoted', source: 'form', daysAgo: 3, minutes: 20 * 60 + 15,
    message: 'Need a window cleaner, last one retired. 4 bed detached.',
    offer: { status: 'sent', sentDaysAgo: 2, items: [['window', 24]] } },
  { key: 'diane', first: 'Diane', last: 'Mercer', status: 'quoted', source: 'form', daysAgo: 15, minutes: 13 * 60 + 5,
    message: 'Solar panels on the south roof need a clean, 12 panels.',
    offer: { status: 'sent', sentDaysAgo: 13, viewedDaysAgo: 12, items: [['solar', 55]] } },
  { key: 'neil', first: 'Neil', last: 'Barton', status: 'quoted', source: 'form', daysAgo: 21, minutes: 18 * 60,
    message: 'Price for windows and conservatory roof please.',
    offer: { status: 'declined', sentDaysAgo: 19, viewedDaysAgo: 18, declinedDaysAgo: 16, reason: 'A bit more than we wanted to spend for now.',
      items: [['window', 20], ['conservatory', 60]] } },
  { key: 'chloe', first: 'Chloe', last: 'Pennington', status: 'quoted', source: 'form', daysAgo: 10, minutes: 10 * 60 + 20,
    message: 'Can you clear our gutters and give the fascias a wash?',
    offer: { status: 'accepted', sentDaysAgo: 9, viewedDaysAgo: 8, acceptedDaysAgo: 5, bookInDays: 9, items: [['gutter', 70], ['fascia', 55]] } },
  { key: 'won1', status: 'won', source: 'form', wonClient: 0, message: 'Hi, do you cover our street? Front and back every month.' },
  { key: 'won2', status: 'won', source: 'manual', wonClient: 1, message: 'Neighbour recommended you. Semi, 3 bed.' },
  { key: 'won3', status: 'won', source: 'form', wonClient: 2, message: 'Looking for a reliable window cleaner, every 4 weeks.' },
  { key: 'steve', first: 'Steve', last: 'Malik', status: 'lost', source: 'form', daysAgo: 41, minutes: 11 * 60,
    message: 'How much for a 3 bed semi?', notes: 'Went with someone else.' },
  { key: 'joanne', first: 'Joanne', last: 'Carver', status: 'lost', source: 'manual', daysAgo: 29, minutes: 15 * 60 + 45,
    message: 'Quote for windows, end terrace.', notes: 'Moving house next month.' },
];

/**
 * Create a demo workspace. `onProgress(percent, label)` is called as it goes.
 * Returns { userId, companyId, slug, email, expiresAt }.
 */
/** Columns the demo seeder needs on daily_routes — production may predate them. */
async function ensureDemoDailyRoutesColumns(db) {
  await db.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS leg_minutes REAL[]`);
  await db.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS total_job_minutes INTEGER`);
  await db.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS route_geometry TEXT`);
  await db.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS name TEXT`);
  await db.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS status VARCHAR(12) DEFAULT 'draft'`);
  await db.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS round_template_id INTEGER`);
  await db.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS is_occurrence_override BOOLEAN DEFAULT FALSE`);
  await db.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS round_id INTEGER`);
  await db.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS round_job_ids INTEGER[]`);
  // Early installs used INTEGER; floats from drive times need a wider type.
  await db.query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'daily_routes'
          AND column_name = 'total_minutes'
          AND data_type = 'integer'
      ) THEN
        ALTER TABLE daily_routes ALTER COLUMN total_minutes TYPE REAL USING total_minutes::real;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'daily_routes'
          AND column_name = 'total_km'
          AND data_type = 'numeric'
      ) THEN
        ALTER TABLE daily_routes ALTER COLUMN total_km TYPE REAL USING total_km::real;
      END IF;
    END $$
  `).catch(() => {});
}

async function createDemoWorkspace({ onProgress = () => {} } = {}) {
  await ensureDemoSchema();
  // Must run outside the seed transaction — ALTER TABLE + big INSERTs don't mix well
  // when production is missing newer planned-package columns.
  await ensureDemoDailyRoutesColumns(pool);
  const progress = (pct, label) => {
    try { onProgress(pct, label); } catch { /* ignore */ }
  };

  const now = londonNow();
  const T = now.ymd;
  /** Never stamp something later than right now. */
  const pastStamp = (ymd, mins) =>
    ymd > T || (ymd === T && mins > now.minutes) ? stamp(addDays(T, -1), mins) : stamp(ymd, mins);
  const START = addDays(T, -HISTORY_DAYS);
  const END = addDays(T, FUTURE_DAYS);
  const monday = addDays(T, -((dowOf(T) + 6) % 7));
  const depot = dataset.depot;
  const suffix = crypto.randomBytes(4).toString('hex');
  const slug = `demo-${suffix}`;
  const email = `${slug}@${DEMO_EMAIL_DOMAIN}`;
  const companyEmail = `hello.${suffix}@${DEMO_EMAIL_DOMAIN}`;
  const expiresAt = new Date(Date.now() + DEMO_TTL_DAYS * DAY);

  // Company address: an unused house number on the street nearest the depot.
  const allStops = dataset.rounds.flatMap((r) => r.stops);
  const usedAddresses = new Set(allStops.map((s) => s.address.toLowerCase()));
  const homeStop = allStops.slice().sort((a, b) => km(a, depot) - km(b, depot))[0];
  const homeStreet = homeStop.address.replace(/^\d+\s+/, '');
  let homeNo = 3;
  while (usedAddresses.has(`${homeNo} ${homeStreet}`.toLowerCase())) homeNo += 2;
  usedAddresses.add(`${homeNo} ${homeStreet}`.toLowerCase());
  const home = { address: `${homeNo} ${homeStreet}`, zip: homeStop.zip, city: homeStop.city };
  const homeFull = `${home.address}, ${home.city} ${home.zip}`;

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    progress(4, `Setting up ${COMPANY.name}`);

    // ── Owner + company ──────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(crypto.randomBytes(18).toString('base64'), 8);
    const startStamp = stamp(START, 9 * 60 + 12);
    const userId = (
      await db.query(
        `INSERT INTO users (first_name, last_name, email, password_hash, role, language_code, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'company-owner', 'en', $5, $5) RETURNING id`,
        [COMPANY.ownerFirst, COMPANY.ownerLast, email, passwordHash, startStamp]
      )
    ).rows[0].id;

    const logoUrl = ensureDemoLogoAsset() || DEMO_LOGO_URL;

    const companyId = (
      await db.query(
        `INSERT INTO companies (
           name, slug, owner_id, country, country_code, timezone,
           address, city, zip_code, address_lat, address_lng,
           default_start_address, default_end_address,
           email, phone, logo_url, plan, onboarding_completed, onboarding_step, trial_used,
           invoicing_enabled, leads_enabled, invoice_numbering_configured,
           invoice_vat_enabled, invoice_default_tax_rate, invoice_default_due_days,
           industry, usage_goals, is_demo, demo_expires_at, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, 'GB', $5,
           $6, $7, $8, $9, $10,
           $11, $11,
           $12, $13, $14, 'standard', TRUE, 'done', TRUE,
           TRUE, TRUE, TRUE,
           FALSE, 0, $15,
           'window_cleaning', $16::jsonb, TRUE, $17, $18, $18
         ) RETURNING id`,
        [
          COMPANY.name, slug, userId, COMPANY.country, TZ,
          home.address, home.city, home.zip, depot.lat, depot.lng,
          homeFull,
          companyEmail, COMPANY.phone, logoUrl, DUE_DAYS,
          JSON.stringify(['routes', 'recurring', 'invoicing']),
          expiresAt, startStamp,
        ]
      )
    ).rows[0].id;

    await db.query(`UPDATE users SET company_id = $1 WHERE id = $2`, [companyId, userId]);
    await db.query(
      `INSERT INTO user_companies (user_id, company_id, role, created_at) VALUES ($1, $2, 'owner', $3)`,
      [userId, companyId, startStamp]
    );

    const weekday = (d) => [`${d}_start`, `${d}_end`, `${d}_break_minutes`, `${d}_hours`];
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const hours = {
      monday: ['08:30', '16:30', 30, 7.5], tuesday: ['08:30', '16:30', 30, 7.5],
      wednesday: ['08:30', '16:30', 30, 7.5], thursday: ['08:30', '16:30', 30, 7.5],
      friday: ['08:30', '16:00', 30, 7], saturday: ['08:30', '12:30', 0, 4], sunday: [null, null, 0, 0],
    };
    const whCols = days.flatMap(weekday);
    const whVals = days.flatMap((d) => hours[d]);
    await db.query(
      `INSERT INTO user_company_work_hours (user_id, company_id, work_hours_mode, use_company_default_location, ${whCols.join(', ')})
       VALUES ($1, $2, 'fixed', TRUE, ${whCols.map((_, i) => `$${i + 3}`).join(', ')})`,
      [userId, companyId, ...whVals]
    );
    await db.query('SAVEPOINT default_hours');
    try {
      await db.query(
        `INSERT INTO company_default_work_hours (company_id, work_hours_mode, ${whCols.join(', ')})
         VALUES ($1, 'fixed', ${whCols.map((_, i) => `$${i + 2}`).join(', ')})`,
        [companyId, ...whVals]
      );
    } catch {
      await db.query('ROLLBACK TO SAVEPOINT default_hours');
    }

    // ── Catalogue ─────────────────────────────────────────────────────────
    const groupId = (
      await db.query(
        `INSERT INTO item_groups (company_id, key, name, is_system, meta_fields, sort_order)
         VALUES ($1, 'services', 'Services', TRUE, ARRAY['price','duration']::TEXT[], 0) RETURNING id`,
        [companyId]
      )
    ).rows[0].id;
    const svcKeys = Object.keys(SERVICES);
    const svcIds = await insertRows(
      db,
      'services',
      ['company_id', 'title', 'price', 'duration_minutes', 'group_id', 'created_at'],
      svcKeys.map((k) => ({ company_id: companyId, ...SERVICES[k], duration_minutes: SERVICES[k].duration, group_id: groupId, created_at: startStamp })),
      { returning: 'id' }
    );
    const svcId = Object.fromEntries(svcKeys.map((k, i) => [k, svcIds[i]]));

    const sendInv = getSendInvoiceDefaults('GB');
    await db.query(
      `INSERT INTO email_templates (company_id, template_type, subject, message) VALUES ($1, 'send_invoice', $2, $3)`,
      [companyId, sendInv.subject, sendInv.message]
    );

    await db.query('SAVEPOINT bank');
    try {
      await db.query(
        `INSERT INTO company_integrations (company_id, provider, enabled, config)
         VALUES ($1, 'bank_transfer', TRUE, $2::jsonb)`,
        [companyId, JSON.stringify({ accountHolder: COMPANY.name, registrationNumber: '000000', accountNumber: '12345678', iban: '' })]
      );
    } catch {
      await db.query('ROLLBACK TO SAVEPOINT bank');
    }

    progress(14, `Adding ${allStops.length} customers around ${dataset.town}`);

    // ── Customers ─────────────────────────────────────────────────────────
    const roundBase = (ri) => addDays(monday, 7 * (dataset.rounds[ri].week - 1) + (dataset.rounds[ri].weekday - 1));
    const people = [];
    dataset.rounds.forEach((round, ri) => {
      round.stops.forEach((stop, pos) => {
        const original = rng('original', stop.address) < 0.74;
        const join = original
          ? addDays(START, Math.floor(rng('import', stop.address) * 10))
          : addDays(START, 30 + Math.floor(rng('join', stop.address) * (HISTORY_DAYS - 45)));
        people.push({ ri, pos, stop, original, join });
      });
    });
    const recentJoiners = people.filter((p) => !p.original).sort((a, b) => (a.join < b.join ? 1 : -1)).slice(0, 3);
    [44, 30, 17].forEach((daysAgo, i) => {
      recentJoiners[i].join = addDays(T, -daysAgo);
      recentJoiners[i].wonLead = i;
    });

    const clientRows = people.map((p) => ({
      company_id: companyId,
      client_type: 'person',
      name: p.stop.firstName,
      last_name: p.stop.lastName,
      address: p.stop.address,
      zip_code: p.stop.zip,
      city: p.stop.city,
      email: p.stop.email.replace(/@example\.com$/, `@${DEMO_EMAIL_DOMAIN}`),
      phone: p.stop.phone,
      lat: p.stop.lat,
      lng: p.stop.lng,
      created_at: stamp(p.join, 10 * 60 + Math.floor(rng('jt', p.stop.address) * 420)),
      updated_at: stamp(p.join, 10 * 60 + Math.floor(rng('jt', p.stop.address) * 420)),
    }));
    const clientIds = await insertRows(
      db,
      'clients',
      ['company_id', 'client_type', 'name', 'last_name', 'address', 'zip_code', 'city', 'email', 'phone', 'lat', 'lng', 'created_at', 'updated_at'],
      clientRows,
      { returning: 'id' }
    );
    people.forEach((p, i) => { p.clientId = clientIds[i]; });

    progress(24, `Building ${dataset.rounds.length} rounds`);

    // ── Rounds + round-owned subscriptions ────────────────────────────────
    const lineFor = (key, price, duration) => ({
      service_id: svcId[key],
      title: SERVICES[key].title,
      custom_price: price,
      custom_duration_minutes: duration ?? SERVICES[key].duration,
    });

    const roundStart = (ri) => {
      const base = roundBase(ri);
      return addDays(base, 28 * Math.ceil(diffDays(addDays(START, 7), base) / 28));
    };
    const roundRows = dataset.rounds.map((round, ri) => {
      const legs = (round.route?.legMinutes || []).slice(0, round.stops.length);
      return {
        company_id: companyId,
        name: round.name,
        status: 'saved',
        assigned_user_id: userId,
        total_minutes: Math.round((round.route?.legMinutes || []).reduce((s, m) => s + m, 0)),
        total_km: round.route?.km ?? null,
        leg_minutes: legs,
        schedule_kind: 'recurring',
        day_of_week: round.weekday,
        interval_value: 4,
        recurrence_type: 'weekly',
        starting_date: roundStart(ri),
        in_library: true,
        created_at: startStamp,
        updated_at: startStamp,
      };
    });
    const roundIds = await insertRows(
      db,
      'rounds',
      ['company_id', 'name', 'status', 'assigned_user_id', 'total_minutes', 'total_km', 'leg_minutes', 'schedule_kind',
        'day_of_week', 'interval_value', 'recurrence_type', 'starting_date', 'in_library', 'created_at', 'updated_at'],
      roundRows,
      { returning: 'id', casts: { leg_minutes: 'real[]' } }
    );

    // 8-weekly houses alternate between two cycles; split them so both cycles
    // are about equally long and no round day overruns.
    // Heavy rounds lose a few inside cleans so a full day stays under budget.
    const noInside = new Set();
    const hasInside = (s) => s.insideToo && !noInside.has(s.address);
    const stopMinutes = (s) => windowDuration(s.price) + 2 + (hasInside(s) ? 30 : 0);
    for (const round of dataset.rounds) {
      const drive = (round.route?.legMinutes || []).reduce((sum, m) => sum + m, 0);
      const peak = () =>
        drive + round.stops.reduce((sum, s) => sum + stopMinutes(s) / (s.intervalWeeks === 8 ? 2 : 1), 0) + 20;
      const candidates = round.stops
        .filter((s) => s.insideToo)
        .sort((a, b) => a.intervalWeeks - b.intervalWeeks || a.address.localeCompare(b.address));
      while (peak() > DAY_BUDGET_MINUTES && candidates.length) noInside.add(candidates.shift().address);
    }

    const phaseOf = new Map();
    for (const round of dataset.rounds) {
      const load = [0, 0];
      round.stops
        .filter((s) => s.intervalWeeks === 8)
        .map((s) => ({ s, mins: stopMinutes(s) }))
        .sort((a, b) => b.mins - a.mins || a.s.address.localeCompare(b.s.address))
        .forEach(({ s, mins }) => {
          const ph = load[0] <= load[1] ? 0 : 1;
          load[ph] += mins;
          phaseOf.set(s.address, ph);
        });
    }

    // Subscriptions: every round house, plus Saturday conservatory roofs.
    const subs = [];
    for (const p of people) {
      const { stop, ri } = p;
      const factor = stop.intervalWeeks === 8 ? 2 : 1;
      const phase = factor === 2 ? phaseOf.get(stop.address) ?? 0 : 0;
      const base = roundBase(ri);
      let k = Math.ceil(diffDays(addDays(p.join, p.original ? 7 : 3), base) / 28);
      while (factor === 2 && ((k % 2) + 2) % 2 !== phase) k += 1;
      const lines = [lineFor('window', stop.price, windowDuration(stop.price))];
      if (hasInside(stop)) lines.push(lineFor('inside', 20 + Math.round(stop.price * 0.5), 30));
      p.lines = lines;
      subs.push({
        kind: 'round',
        person: p,
        roundId: roundIds[ri],
        dow: dataset.rounds[ri].weekday,
        intervalWeeks: stop.intervalWeeks,
        stepDays: 28 * factor,
        first: addDays(base, 28 * k),
        lines,
        title: lines.map((l) => l.title).join(' + '),
        note: stop.note || null,
      });
    }
    for (const p of people) {
      if (!p.stop.conservatory) continue;
      const roundSub = subs.find((s) => s.person === p);
      let first = addDays(roundSub.first, 7 + Math.floor(rng('cons', p.stop.address) * 84));
      first = addDays(first, (6 - dowOf(first) + 7) % 7);
      if (first > addDays(T, 60)) continue;
      const price = pickBy([45, 50, 55, 60, 65], 'consp', p.stop.address);
      const lines = [lineFor('conservatory', price, 60)];
      subs.push({
        kind: 'saturday',
        person: p,
        roundId: null,
        dow: 6,
        intervalWeeks: 12,
        stepDays: 84,
        first,
        lines,
        title: lines[0].title,
        note: null,
      });
    }

    // Older databases still carry a NOT NULL legacy interval_weeks column; newer ones don't have it.
    const legacyInterval = (
      await db.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'recurring_jobs' AND column_name = 'interval_weeks'`
      )
    ).rowCount > 0;
    const subIds = await insertRows(
      db,
      'recurring_jobs',
      ['company_id', 'client_id', 'assigned_user_id', 'title', 'note', 'day_of_week',
        ...(legacyInterval ? ['interval_weeks'] : []), 'interval_value', 'is_active', 'starting_date', 'next_occurrence_date', 'recurrence_type', 'sort_order', 'round_id', 'created_at', 'updated_at'],
      subs.map((s) => ({
        company_id: companyId,
        client_id: s.person.clientId,
        assigned_user_id: userId,
        title: s.title,
        note: s.note,
        day_of_week: s.dow,
        interval_weeks: s.intervalWeeks,
        interval_value: s.intervalWeeks,
        is_active: true,
        starting_date: s.first,
        next_occurrence_date: s.first,
        recurrence_type: 'weekly',
        sort_order: s.person.pos,
        round_id: s.roundId,
        created_at: clientRows[people.indexOf(s.person)].created_at,
        updated_at: clientRows[people.indexOf(s.person)].created_at,
      })),
      { returning: 'id' }
    );
    subs.forEach((s, i) => { s.id = subIds[i]; });

    const rjsRows = subs.flatMap((s) =>
      s.lines.map((l) => ({
        recurring_job_id: s.id,
        service_id: l.service_id,
        custom_price: l.custom_price,
        custom_duration_minutes: l.custom_duration_minutes,
      }))
    );
    await insertRows(db, 'recurring_job_services', ['recurring_job_id', 'service_id', 'custom_price', 'custom_duration_minutes'], rjsRows);

    const stopRows = subs
      .filter((s) => s.kind === 'round')
      .map((s) => ({
        round_id: s.roundId,
        position: s.person.pos,
        client_id: s.person.clientId,
        recurring_job_id: s.id,
        label: `${s.person.stop.firstName} ${s.person.stop.lastName}`,
        address: s.person.stop.address,
        zip_code: s.person.stop.zip,
        city: s.person.stop.city,
        lat: s.person.stop.lat,
        lng: s.person.stop.lng,
        estimated_duration_minutes: s.lines.reduce((sum, l) => sum + l.custom_duration_minutes, 0),
        services: JSON.stringify(s.lines.map(({ title, ...rest }) => ({ ...rest, custom_title: null }))),
      }));
    await insertRows(
      db,
      'round_stops',
      ['round_id', 'position', 'client_id', 'recurring_job_id', 'label', 'address', 'zip_code', 'city', 'lat', 'lng', 'estimated_duration_minutes', 'services'],
      stopRows,
      { casts: { services: 'jsonb' } }
    );

    progress(36, 'Filling in a year of visits');

    // ── Visits ────────────────────────────────────────────────────────────
    const visits = [];
    for (const s of subs) {
      let occ = 1;
      for (let date = s.first; date <= END; date = addDays(date, s.stepDays), occ += 1) {
        visits.push({
          kind: s.kind,
          person: s.person,
          sub: s,
          date,
          occ,
          lines: s.lines,
          title: s.title,
          generated: true,
        });
      }
    }

    // One-off extras on Saturdays: gutters in autumn/winter, fascias and solar in spring/summer.
    const oneOffFor = (date, n) => {
      const m = monthOf(date);
      const autumn = m >= 10 || m <= 1;
      const key = autumn
        ? (rng('svc', date, n) < 0.75 ? 'gutter' : 'fascia')
        : pickBy(['fascia', 'solar', 'gutter', 'solar'], 'svc', date, n);
      const prices = { gutter: [60, 70, 80, 95], fascia: [55, 65, 80], solar: [40, 50, 60] }[key];
      return lineFor(key, pickBy(prices, 'price', date, n));
    };
    let firstSat = addDays(START, 21);
    firstSat = addDays(firstSat, (6 - dowOf(firstSat) + 7) % 7);
    for (let sat = firstSat; sat <= addDays(T, 21); sat = addDays(sat, 7)) {
      if (rng('oneoff', sat) > 0.5) continue;
      const count = rng('oneoff2', sat) < 0.15 ? 2 : 1;
      const active = people.filter((p) => p.join < addDays(sat, -14));
      for (let n = 0; n < count; n++) {
        const person = pickBy(active, 'who', sat, n);
        const line = oneOffFor(sat, n);
        visits.push({
          kind: 'oneoff',
          person,
          sub: null,
          date: sat,
          lines: [line],
          title: line.title,
          generated: false,
          createdAt: pastStamp(addDays(sat, -(4 + Math.floor(rng('booked', sat, n) * 9))), 11 * 60 + Math.floor(rng('bt', sat, n) * 300)),
        });
      }
    }

    // Day plans: order + clock times per date, so completion times and today's progress line up.
    const byDay = new Map();
    for (const v of visits) {
      const key = v.kind === 'round' ? `r|${v.person.ri}|${v.date}` : `s|${v.date}`;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(v);
    }
    for (const [key, list] of byDay) {
      if (key.startsWith('r|')) {
        list.sort((a, b) => a.person.pos - b.person.pos);
      } else {
        const left = list.slice();
        const ordered = [];
        let cur = depot;
        while (left.length) {
          left.sort((a, b) => km(cur, a.person.stop) - km(cur, b.person.stop));
          const next = left.shift();
          ordered.push(next);
          cur = next.person.stop;
        }
        list.splice(0, list.length, ...ordered);
      }
      for (const v of list) {
        v.status = v.date < T ? (rng('cancel', v.person.stop.address, v.date) < 0.022 ? 'cancelled' : 'completed') : 'scheduled';
      }
      // Road legs from the dataset (depot → stop 0 → … → depot) where stops are adjacent.
      const roadLegs = key.startsWith('r|') ? dataset.rounds[list[0].person.ri].route?.legMinutes || null : null;
      let t = WORK_START;
      let prev = depot;
      let prevPos = -1;
      list.forEach((v, i) => {
        v.routeOrder = i;
        if (v.status === 'cancelled') return;
        v.leg = roadLegs && v.person.pos === prevPos + 1 && roadLegs[v.person.pos] != null
          ? roadLegs[v.person.pos]
          : driveMinutes(prev, v.person.stop);
        t += v.leg;
        v.start = t;
        t += v.lines.reduce((s, l) => s + l.custom_duration_minutes, 0) + 2;
        v.finish = t;
        prev = v.person.stop;
        prevPos = v.person.pos;
        if (v.date === T) v.status = v.finish <= now.minutes ? 'completed' : 'scheduled';
      });
      const lastStop = roadLegs ? roadLegs.length - 2 : -2;
      list.returnLeg = roadLegs && prevPos === lastStop ? roadLegs[lastStop + 1] : driveMinutes(prev, depot);
    }

    const jobIds = await insertRows(
      db,
      'jobs',
      ['company_id', 'client_id', 'assigned_user_id', 'title', 'note', 'scheduled_date', 'status', 'recurring_job_id',
        'recurring_occurrence', 'is_generated', 'sort_order', 'route_order', 'lat', 'lng', 'scheduling_flexibility',
        'allowed_weekdays', 'job_kind', 'created_at', 'updated_at'],
      visits.map((v) => {
        const joined = clientRows[people.indexOf(v.person)].created_at;
        const created = v.createdAt
          || (v.date < addDays(v.person.join, 28) ? joined : pastStamp(addDays(v.date, -28), 7 * 60));
        v.created = created < joined ? joined : created;
        const updated = v.status === 'completed' && v.finish ? stamp(v.date, v.finish) : v.created;
        return {
          company_id: companyId,
          client_id: v.person.clientId,
          assigned_user_id: userId,
          title: v.title,
          note: null,
          scheduled_date: v.date,
          status: v.status,
          recurring_job_id: v.sub?.id ?? null,
          recurring_occurrence: v.sub ? v.occ : null,
          is_generated: v.generated,
          sort_order: v.routeOrder,
          route_order: v.routeOrder,
          lat: v.person.stop.lat,
          lng: v.person.stop.lng,
          scheduling_flexibility: v.generated ? 'fixed_weekday' : 'fixed_date',
          allowed_weekdays: v.generated ? [dowOf(v.date)] : null,
          job_kind: 'standard',
          created_at: v.created,
          updated_at: updated,
        };
      }),
      { returning: 'id', casts: { allowed_weekdays: 'int[]' } }
    );
    visits.forEach((v, i) => { v.jobId = jobIds[i]; });

    progress(52, 'Recording completed work');

    const jsRows = visits.flatMap((v) =>
      v.lines.map((l) => ({
        job_id: v.jobId,
        service_id: l.service_id,
        custom_price: l.custom_price,
        custom_duration_minutes: l.custom_duration_minutes,
        status: v.status === 'completed' ? 'completed' : v.status === 'cancelled' ? 'cancelled' : 'scheduled',
        completed_at: v.status === 'completed' ? stamp(v.date, v.finish) : null,
        quantity: 1,
        created_at: v.created,
      }))
    );
    await insertRows(
      db,
      'job_services',
      ['job_id', 'service_id', 'custom_price', 'custom_duration_minutes', 'status', 'completed_at', 'quantity', 'created_at'],
      jsRows
    );

    progress(64, 'Writing invoices and payments');

    // ── Invoices: one per visit, issued the same evening ──────────────────
    const workedDays = [...new Set(visits.filter((v) => v.status === 'completed' && v.date < T).map((v) => v.date))].sort().reverse();
    const notYetInvoiced = new Set([T, ...workedDays.slice(0, 2)]);
    const toInvoice = visits
      .filter((v) => v.status === 'completed' && !notYetInvoiced.has(v.date))
      .sort((a, b) => (a.date === b.date ? a.routeOrder - b.routeOrder : a.date < b.date ? -1 : 1));

    const invoiceRows = [];
    const invoiceMeta = [];
    toInvoice.forEach((v, i) => {
      const total = round2(v.lines.reduce((s, l) => s + l.custom_price, 0));
      const issue = v.date;
      const due = addDays(issue, DUE_DAYS);
      const r = rng('pay', v.person.stop.address, v.date);
      const delay = r < 0.6 ? Math.floor(r * 9) : r < 0.9 ? 6 + Math.floor((r - 0.6) * 30) : 15 + Math.floor((r - 0.9) * 160);
      const latePayer = diffDays(T, issue) >= 25 && diffDays(T, issue) <= 120 && rng('late', v.person.stop.address, v.date) < 0.012;
      const paidOn = addDays(issue, delay);
      const paid = !latePayer && (paidOn < T || (paidOn === T && now.minutes > 12 * 60));
      const source = r < 0.75 ? 'bank_transfer' : r < 0.95 ? 'cash' : 'card';
      const sentAt = stamp(issue, 18 * 60 + Math.floor(rng('sent', issue) * 90));
      const paidAt = paid ? stamp(paidOn, 9 * 60 + Math.floor(rng('paidt', v.person.stop.address, issue) * 600)) : null;
      invoiceMeta.push({ visit: v, total, paid, paidAt, source });
      invoiceRows.push({
        company_id: companyId,
        client_id: v.person.clientId,
        invoice_number: String(i + 1).padStart(4, '0'),
        status: paid ? 'paid' : 'sent',
        issue_date: issue,
        due_date: due,
        subtotal: total,
        tax_rate: 0,
        tax_amount: 0,
        total,
        currency: 'GBP',
        created_by: userId,
        sent_at: sentAt,
        paid_at: paidAt,
        paid_amount: paid ? total : null,
        payment_source: paid ? source : null,
        created_at: sentAt,
        updated_at: paidAt || sentAt,
        from_company_name: COMPANY.name,
        from_address: home.address,
        from_zip_code: home.zip,
        from_city: home.city,
        from_country: COMPANY.country,
        from_country_code: 'GB',
        from_company_number_label: 'Co. Reg. No.',
        from_email: companyEmail,
        from_phone: COMPANY.phone,
        from_logo_url: logoUrl,
        bill_to_name: `${v.person.stop.firstName} ${v.person.stop.lastName}`,
        tax_label: 'VAT',
        invoice_locale: 'en',
        frozen_at: sentAt,
      });
    });
    const invoiceCols = Object.keys(invoiceRows[0] || { company_id: 1 });
    const invoiceIds = invoiceRows.length
      ? await insertRows(db, 'invoices', invoiceCols, invoiceRows, { returning: 'id' })
      : [];
    invoiceMeta.forEach((m, i) => { m.id = invoiceIds[i]; });

    await insertRows(
      db,
      'invoice_items',
      ['invoice_id', 'job_id', 'service_id', 'description', 'quantity', 'unit_price', 'line_total'],
      invoiceMeta.flatMap((m) =>
        m.visit.lines.map((l) => ({
          invoice_id: m.id,
          job_id: m.visit.jobId,
          service_id: l.service_id,
          description: l.title,
          quantity: 1,
          unit_price: l.custom_price,
          line_total: l.custom_price,
        }))
      )
    );
    await insertRows(
      db,
      'invoice_transactions',
      ['invoice_id', 'type', 'amount', 'description', 'payment_source', 'transaction_date', 'created_at'],
      invoiceMeta
        .filter((m) => m.paid)
        .map((m) => ({
          invoice_id: m.id,
          type: 'payment',
          amount: m.total,
          description: 'Payment',
          payment_source: m.source,
          transaction_date: m.paidAt,
          created_at: m.paidAt,
        }))
    );
    if (invoiceMeta.length) {
      await db.query(
        `UPDATE jobs SET invoice_id = v.invoice_id
         FROM (SELECT UNNEST($1::int[]) AS job_id, UNNEST($2::int[]) AS invoice_id) v
         WHERE jobs.id = v.job_id`,
        [invoiceMeta.map((m) => m.visit.jobId), invoiceMeta.map((m) => m.id)]
      );
    }
    await db.query(
      `UPDATE companies SET invoice_next_number = $2, invoice_number_pad_width = 4 WHERE id = $1`,
      [companyId, invoiceMeta.length + 1]
    );

    progress(78, 'Planning routes');

    // ── Planned round days (daily_routes packages) ────────────────────────
    const routeRows = [];
    const seenRouteDays = new Set();
    for (const [key, list] of byDay) {
      if (!key.startsWith('r|')) continue;
      const ri = Number(key.split('|')[1]);
      const date = key.split('|')[2];
      const live = list.filter((v) => v.status !== 'cancelled' && v.jobId != null);
      if (!live.length) continue;
      const dayKey = `${userId}|${date}`;
      if (seenRouteDays.has(dayKey)) continue;
      seenRouteDays.add(dayKey);
      const round = dataset.rounds[ri];
      const complete = live.length === round.stops.length;
      const legs = live.map((v) => {
        const n = Number(v.leg);
        return Number.isFinite(n) ? n : driveMinutes(depot, v.person.stop);
      });
      const backRaw = Number(list.returnLeg);
      const back = Number.isFinite(backRaw) ? backRaw : driveMinutes(live[live.length - 1].person.stop, depot);
      let distance = 0;
      let prev = depot;
      for (const v of live) {
        distance += roadKm(prev, v.person.stop);
        prev = v.person.stop;
      }
      distance += roadKm(prev, depot);
      const ids = live.map((v) => v.jobId);
      const driveTotal = legs.reduce((s, m) => s + m, 0) + back;
      routeRows.push({
        company_id: companyId,
        user_id: userId,
        scheduled_date: date,
        job_ids: ids,
        round_job_ids: ids,
        leg_minutes: legs,
        total_km: complete && round.route?.km ? Number(round.route.km) : Math.round(distance * 10) / 10,
        total_minutes: Math.round(driveTotal * 10) / 10,
        total_job_minutes: live.reduce((s, v) => s + v.lines.reduce((x, l) => x + l.custom_duration_minutes, 0), 0),
        // Skip bulky GeoJSON in the seed transaction — large multi-row inserts
        // with geometry have been failing the live demo at this step. The map
        // fills road geometry on demand via Directions.
        route_geometry: null,
        name: round.name,
        status: 'planned',
        round_id: roundIds[ri],
        updated_at: stamp(addDays(date, -1), 19 * 60),
      });
    }
    // Smaller chunks than the generic bulk helper — thousands of int[] params
    // in one statement have tripped production timeouts.
    const ROUTE_CHUNK = 40;
    for (let i = 0; i < routeRows.length; i += ROUTE_CHUNK) {
      await insertRows(
        db,
        'daily_routes',
        ['company_id', 'user_id', 'scheduled_date', 'job_ids', 'round_job_ids', 'leg_minutes', 'total_km', 'total_minutes',
          'total_job_minutes', 'route_geometry', 'name', 'status', 'round_id', 'updated_at'],
        routeRows.slice(i, i + ROUTE_CHUNK),
        { casts: { job_ids: 'int[]', round_job_ids: 'int[]', leg_minutes: 'real[]' } }
      );
    }

    progress(88, 'Catching up on new enquiries');

    // ── Leads, quotes and notifications ───────────────────────────────────
    await seedPipeline(db, {
      companyId, userId, T, now, people, recentJoiners, visits, svcId, usedAddresses, lineFor,
    });

    await db.query('COMMIT');
    markDemoCompany(companyId);
    progress(100, 'Ready');
    return { userId, companyId, slug, email, expiresAt };
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}

/** A real street from the dataset with a house number no client uses. */
function neighbourAddress(people, usedAddresses, i) {
  const base = people[(i * 37 + 11) % people.length].stop;
  const street = base.address.replace(/^\d+\s+/, '');
  let n = (parseInt(base.address, 10) || 1) + 2;
  while (usedAddresses.has(`${n} ${street}`.toLowerCase())) n += 2;
  usedAddresses.add(`${n} ${street}`.toLowerCase());
  return {
    address: `${n} ${street}`,
    zip: base.zip,
    city: base.city,
    lat: Math.round((base.lat + (rng('nlat', i) - 0.5) * 0.0006) * 1e6) / 1e6,
    lng: Math.round((base.lng + (rng('nlng', i) - 0.5) * 0.0009) * 1e6) / 1e6,
  };
}

async function seedPipeline(db, { companyId, userId, T, now, people, recentJoiners, visits, svcId, usedAddresses, lineFor }) {
  const leadRows = [];
  const plans = [];
  let phoneSeq = 500;
  LEADS.forEach((lead, i) => {
    let first = lead.first;
    let last = lead.last;
    let place;
    let createdYmd;
    let createdMin = lead.minutes ?? 10 * 60;
    let clientId = null;
    let convertedAt = null;
    let wonPerson = null;
    if (lead.wonClient != null) {
      wonPerson = recentJoiners[lead.wonClient];
      first = wonPerson.stop.firstName;
      last = wonPerson.stop.lastName;
      place = { address: wonPerson.stop.address, zip: wonPerson.stop.zip, city: wonPerson.stop.city, lat: wonPerson.stop.lat, lng: wonPerson.stop.lng };
      createdYmd = addDays(wonPerson.join, -(6 + lead.wonClient));
      createdMin = 19 * 60 + 5 * i;
      clientId = wonPerson.clientId;
      convertedAt = stamp(wonPerson.join, 10 * 60);
    } else {
      place = neighbourAddress(people, usedAddresses, i);
      createdYmd = addDays(T, -lead.daysAgo);
      if (lead.daysAgo === 0) {
        createdMin = now.minutes + lead.minutes;
        if (createdMin < 7 * 60) {
          createdYmd = addDays(T, -1);
          createdMin = 21 * 60 + 40;
        }
      }
    }
    const createdAt = stamp(createdYmd, createdMin);
    const phone = `07700 900${String(phoneSeq++).padStart(3, '0')}`;
    const emailAddr = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + `@${DEMO_EMAIL_DOMAIN}`;
    const updatedAt = lead.status === 'new' ? createdAt : stamp(addDays(createdYmd, Math.min(2, lead.daysAgo ?? 2)), 18 * 60);
    plans.push({ lead, i, first, last, place, createdYmd, createdAt, clientId, wonPerson, phone, emailAddr });
    leadRows.push({
      company_id: companyId,
      status: lead.status,
      source: lead.source,
      first_name: first,
      last_name: last,
      email: emailAddr,
      phone,
      message: lead.message,
      notes: lead.notes || null,
      meta: lead.source === 'form'
        ? JSON.stringify({
          version: 3,
          answers: [
            { label: 'Name', value: `${first} ${last}`, type: 'text' },
            { label: 'Address', value: `${place.address}, ${place.city} ${place.zip}`, type: 'text' },
            { label: 'How can we help?', value: lead.message, type: 'textarea' },
          ],
        })
        : null,
      address: place.address,
      zip_code: place.zip,
      city: place.city,
      country: 'GB',
      client_id: clientId,
      converted_at: convertedAt,
      created_at: createdAt,
      updated_at: lead.wonClient != null ? convertedAt : updatedAt,
    });
  });
  const leadIds = await insertRows(
    db,
    'leads',
    ['company_id', 'status', 'source', 'first_name', 'last_name', 'email', 'phone', 'message', 'notes', 'meta', 'address',
      'zip_code', 'city', 'country', 'client_id', 'converted_at', 'created_at', 'updated_at'],
    leadRows,
    { returning: 'id', casts: { meta: 'jsonb' } }
  );
  plans.forEach((p, i) => { p.leadId = leadIds[i]; });

  // Quotes. Won leads were quoted a first clean that became their first round visit.
  let offerNumber = 0;
  const offerRows = [];
  const offerPlans = [];
  const notifications = [];
  for (const p of plans) {
    const { lead } = p;
    let spec = lead.offer;
    if (lead.wonClient != null) {
      const firstVisit = visits
        .filter((v) => v.person === p.wonPerson && v.kind === 'round')
        .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
      spec = {
        status: 'accepted',
        confirmed: true,
        sentAt: stamp(addDays(p.createdYmd, 1), 9 * 60 + 30),
        viewedAt: stamp(addDays(p.createdYmd, 1), 20 * 60 + 10),
        acceptedAt: stamp(addDays(p.createdYmd, 2), 7 * 60 + 45),
        acceptedDate: firstVisit?.date,
        jobVisit: firstVisit,
        items: p.wonPerson.lines.map((l) => [Object.keys(svcId).find((k) => svcId[k] === l.service_id), l.custom_price]),
      };
    }
    if (!spec) continue;
    offerNumber += 1;
    const items = spec.items.map(([key, price]) => ({
      service_id: svcId[key],
      title: lineFor(key, price).title,
      unit_price: price,
      duration_minutes: lineFor(key, price).custom_duration_minutes,
      quantity: 1,
    }));
    const total = round2(items.reduce((s, it) => s + it.unit_price, 0));
    const minutes = items.reduce((s, it) => s + it.duration_minutes, 0);
    const sentAt = spec.sentAt || stamp(addDays(T, -spec.sentDaysAgo), 8 * 60 + 40);
    const sentYmd = sentAt.slice(0, 10);
    const proposed = [7, 9, 14].map((d) => {
      let day = addDays(sentYmd, d);
      day = addDays(day, (6 - dowOf(day) + 7) % 7);
      return { date: day, user_id: userId, user_name: `${COMPANY.ownerFirst} ${COMPANY.ownerLast}`, extra_minutes: null };
    }).filter((d, i, arr) => arr.findIndex((x) => x.date === d.date) === i);

    let acceptedDate = spec.acceptedDate || null;
    let jobVisit = spec.jobVisit || null;
    let pendingJob = null;
    if (spec.status === 'accepted' && !spec.confirmed) {
      let day = addDays(T, spec.bookInDays);
      day = addDays(day, (6 - dowOf(day) + 7) % 7);
      acceptedDate = day;
      pendingJob = { day, items };
    }
    offerPlans.push({ p, spec, items, total, pendingJob, jobVisit });
    offerRows.push({
      company_id: companyId,
      client_id: p.clientId,
      lead_id: p.leadId,
      token: crypto.randomBytes(24).toString('hex'),
      status: spec.status,
      title: items[0].title,
      message: `Hi ${p.first}, thanks for getting in touch. Here's the price we talked about.`,
      contact_name: `${p.first} ${p.last}`,
      contact_email: p.emailAddr,
      contact_phone: p.phone,
      address: p.place.address,
      zip_code: p.place.zip,
      city: p.place.city,
      lat: p.place.lat,
      lng: p.place.lng,
      service_minutes: minutes,
      price: total,
      items: JSON.stringify(items),
      proposed_dates: JSON.stringify(proposed),
      accepted_date: acceptedDate,
      accepted_user_id: spec.status === 'accepted' ? userId : null,
      created_job_id: jobVisit?.jobId ?? null,
      offer_number: offerNumber,
      tax_rate: 0,
      valid_until: addDays(sentYmd, 30),
      sent_at: sentAt,
      viewed_at: spec.viewedAt || (spec.viewedDaysAgo != null ? stamp(addDays(T, -spec.viewedDaysAgo), 20 * 60 + 30) : null),
      accepted_at: spec.acceptedAt || (spec.acceptedDaysAgo != null ? stamp(addDays(T, -spec.acceptedDaysAgo), 7 * 60 + 55) : null),
      declined_at: spec.declinedDaysAgo != null ? stamp(addDays(T, -spec.declinedDaysAgo), 21 * 60 + 5) : null,
      decline_reason: spec.reason || null,
      confirmed_at: spec.confirmed ? spec.acceptedAt : null,
      created_at: stamp(sentYmd, 8 * 60 + 20),
      updated_at: sentAt,
    });
  }

  // A draft quote for an existing customer: gutters before winter.
  const regular = people[5];
  offerNumber += 1;
  const draftItems = [{ service_id: svcId.gutter, title: SERVICES.gutter.title, unit_price: 70, duration_minutes: 60, quantity: 1 }];
  offerRows.push({
    company_id: companyId,
    client_id: regular.clientId,
    lead_id: null,
    token: crypto.randomBytes(24).toString('hex'),
    status: 'draft',
    title: SERVICES.gutter.title,
    message: null,
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    address: regular.stop.address,
    zip_code: regular.stop.zip,
    city: regular.stop.city,
    lat: regular.stop.lat,
    lng: regular.stop.lng,
    service_minutes: 60,
    price: 70,
    items: JSON.stringify(draftItems),
    proposed_dates: '[]',
    offer_number: offerNumber,
    tax_rate: 0,
    valid_until: addDays(T, 30),
    created_at: stamp(addDays(T, -1), 20 * 60 + 40),
    updated_at: stamp(addDays(T, -1), 20 * 60 + 40),
  });

  const offerCols = ['company_id', 'client_id', 'lead_id', 'token', 'status', 'title', 'message', 'contact_name', 'contact_email',
    'contact_phone', 'address', 'zip_code', 'city', 'lat', 'lng', 'service_minutes', 'price', 'items', 'proposed_dates',
    'accepted_date', 'accepted_user_id', 'created_job_id', 'offer_number', 'tax_rate', 'valid_until', 'sent_at', 'viewed_at',
    'accepted_at', 'declined_at', 'decline_reason', 'confirmed_at', 'created_at', 'updated_at'];
  const offerIds = await insertRows(db, 'offers', offerCols, offerRows, {
    returning: 'id',
    casts: { items: 'jsonb', proposed_dates: 'jsonb' },
  });

  for (let i = 0; i < offerPlans.length; i++) {
    const op = offerPlans[i];
    const offerId = offerIds[i];
    if (op.jobVisit) {
      await db.query(`UPDATE jobs SET offer_id = $2 WHERE id = $1`, [op.jobVisit.jobId, offerId]);
    }
    if (op.pendingJob) {
      // Accepting a quote creates the customer and a pending booking (offers.js accept flow).
      const p = op.p;
      const acceptedStamp = offerRows[i].accepted_at;
      const clientId = (
        await db.query(
          `INSERT INTO clients (company_id, client_type, name, last_name, address, zip_code, city, email, phone, lat, lng, created_at, updated_at)
           VALUES ($1, 'person', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) RETURNING id`,
          [companyId, p.first, p.last, p.place.address, p.place.zip, p.place.city, p.emailAddr, p.phone, p.place.lat, p.place.lng, acceptedStamp]
        )
      ).rows[0].id;
      const jobId = (
        await db.query(
          `INSERT INTO jobs (company_id, client_id, assigned_user_id, title, scheduled_date, status, sort_order, route_order,
                             lat, lng, booking_status, offer_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'scheduled', 0, 0, $6, $7, 'pending', $8, $9, $9) RETURNING id`,
          [companyId, clientId, userId, op.items.map((it) => it.title).join(' + '), op.pendingJob.day, p.place.lat, p.place.lng, offerId, acceptedStamp]
        )
      ).rows[0].id;
      await insertRows(
        db,
        'job_services',
        ['job_id', 'service_id', 'custom_price', 'custom_duration_minutes', 'quantity', 'status'],
        op.items.map((it) => ({ job_id: jobId, service_id: it.service_id, custom_price: it.unit_price, custom_duration_minutes: it.duration_minutes, quantity: 1, status: 'scheduled' }))
      );
      await db.query(`UPDATE offers SET client_id = $2, created_job_id = $3 WHERE id = $1`, [offerId, clientId, jobId]);
      await db.query(`UPDATE leads SET client_id = $2 WHERE id = $1`, [p.leadId, clientId]);
      notifications.push({
        type: 'offer.accepted', entity_type: 'offer', entity_id: offerId, created_at: acceptedStamp,
        meta: { name: `${p.first} ${p.last}`, number: String(offerRows[i].offer_number).padStart(4, '0'), total: op.total, date: op.pendingJob.day, job_id: jobId },
      });
    }
    if (op.spec.status === 'declined') {
      notifications.push({
        type: 'offer.declined', entity_type: 'offer', entity_id: offerId, created_at: offerRows[i].declined_at,
        meta: { name: `${op.p.first} ${op.p.last}`, number: String(offerRows[i].offer_number).padStart(4, '0'), total: op.total, reason: op.spec.reason },
      });
    }
  }

  for (const p of plans) {
    if (p.lead.source !== 'form' || p.lead.status !== 'new') continue;
    notifications.push({
      type: 'lead.new', entity_type: 'lead', entity_id: p.leadId, created_at: p.createdAt,
      meta: { name: `${p.first} ${p.last}`, city: p.place.city, message: p.lead.message.slice(0, 140) },
    });
  }
  await insertRows(
    db,
    'notifications',
    ['company_id', 'type', 'entity_type', 'entity_id', 'meta', 'created_at'],
    notifications.map((n) => ({ company_id: companyId, ...n, meta: JSON.stringify(n.meta) })),
    { casts: { meta: 'jsonb' } }
  );
}

module.exports = { createDemoWorkspace, DEMO_TTL_DAYS };
