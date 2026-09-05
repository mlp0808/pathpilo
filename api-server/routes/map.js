/**
 * Map multitool API — powers /[company]/map.
 *
 * GET /api/map/nearest-routes?lat=&lng=&from=&to=&radius=&sort=&limit=
 * GET /api/map/nearest-clients?lat=&lng=&radius=&limit=
 * GET /api/map/client/:id/routes?from=&to=
 * GET /api/map/employee/:id/days?from=&to=
 *
 * All scoped by the active company in the JWT (same pattern as daily-routes).
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const mapTool = require('../services/mapTool');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

const getActiveCompanyId = (req) => {
  const activeCompanyId = req.user?.activeCompanyId;
  if (!activeCompanyId) return { error: 'No active company found in token', status: 400 };
  return { companyId: activeCompanyId };
};

router.use(authenticateToken);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(v, fallback) {
  return typeof v === 'string' && DATE_RE.test(v) ? v : fallback;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysStr(base, days) {
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// GET /api/map/nearest-routes
router.get('/nearest-routes', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });

    const lat = parseFloat(String(req.query.lat));
    const lng = parseFloat(String(req.query.lng));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng query params required' });
    }

    const from = parseDate(req.query.from, todayStr());
    const to = parseDate(req.query.to, addDaysStr(from, 13));
    const radiusKm = Math.min(Math.max(parseFloat(String(req.query.radius)) || 15, 0.5), 100);
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 10, 30);
    const sort = req.query.sort === 'soonest' ? 'soonest' : 'closest';

    const routes = await mapTool.nearestRoutes(companyAccess.companyId, {
      lat, lng, from, to, radiusKm, limit, sort,
    });
    res.json({ routes, from, to, radius_km: radiusKm, sort });
  } catch (error) {
    console.error('Error in nearest-routes:', error);
    res.status(500).json({ error: 'Failed to compute nearest routes' });
  }
});

// GET /api/map/nearest-clients
router.get('/nearest-clients', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });

    const lat = parseFloat(String(req.query.lat));
    const lng = parseFloat(String(req.query.lng));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng query params required' });
    }
    const radiusKm = Math.min(Math.max(parseFloat(String(req.query.radius)) || 10, 0.5), 100);
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 20, 100);

    const clients = await mapTool.nearestClients(companyAccess.companyId, { lat, lng, radiusKm, limit });
    res.json({ clients, radius_km: radiusKm });
  } catch (error) {
    console.error('Error in nearest-clients:', error);
    res.status(500).json({ error: 'Failed to find nearest clients' });
  }
});

// GET /api/map/client/:id/routes
router.get('/client/:id/routes', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });

    const clientId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(clientId)) return res.status(400).json({ error: 'Invalid client id' });

    const from = parseDate(req.query.from, todayStr());
    const to = parseDate(req.query.to, addDaysStr(from, 55)); // 8 weeks default

    const routes = await mapTool.clientRoutes(companyAccess.companyId, clientId, from, to);
    res.json({ routes, from, to });
  } catch (error) {
    console.error('Error in client routes:', error);
    res.status(500).json({ error: 'Failed to fetch client routes' });
  }
});

// GET /api/map/employee/:id/days
router.get('/employee/:id/days', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });

    const userId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const from = parseDate(req.query.from, todayStr());
    const to = parseDate(req.query.to, addDaysStr(from, 13));

    const days = await mapTool.employeeDays(companyAccess.companyId, userId, from, to);
    res.json({ days, from, to });
  } catch (error) {
    console.error('Error in employee days:', error);
    res.status(500).json({ error: 'Failed to fetch employee days' });
  }
});

module.exports = router;
