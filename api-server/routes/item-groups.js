const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const {
  ensureItemCatalogSchema,
  ensureCompanyServicesGroup,
  SYSTEM_SERVICES_GROUP_KEY,
  normalizeMetaFields,
  slugifyGroupKey,
} = require('../utils/itemCatalogSchema');

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

function getActiveCompanyId(req) {
  const activeCompanyId = req.user?.activeCompanyId;
  if (!activeCompanyId) return { error: 'No active company found in token', status: 400 };
  return { companyId: activeCompanyId };
}

router.use(authenticateToken);

async function uniqueGroupKey(companyId, baseName) {
  const base = slugifyGroupKey(baseName);
  let candidate = base;
  let n = 2;
  for (;;) {
    const hit = await pool.query(
      `SELECT 1 FROM item_groups WHERE company_id = $1 AND key = $2 LIMIT 1`,
      [companyId, candidate],
    );
    if (hit.rows.length === 0) return candidate;
    candidate = `${base}-${n}`.slice(0, 64);
    n += 1;
  }
}

// GET /api/item-groups — groups with item counts (+ items if ?include_items=true)
router.get('/', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    await ensureCompanyServicesGroup(pool, companyId);

    const includeItems = String(req.query.include_items || '').toLowerCase() === 'true';

    const groupsRes = await pool.query(
      `SELECT
         g.*,
         COUNT(s.id) FILTER (
           WHERE s.archived_at IS NULL
             AND COALESCE(s.is_system, FALSE) = FALSE
             AND s.system_key IS NULL
         )::int AS item_count
       FROM item_groups g
       LEFT JOIN services s ON s.group_id = g.id AND s.company_id = g.company_id
       WHERE g.company_id = $1
       GROUP BY g.id
       ORDER BY g.sort_order ASC, g.id ASC`,
      [companyId],
    );

    let itemsByGroup = {};
    if (includeItems) {
      const itemsRes = await pool.query(
        `SELECT s.*
         FROM services s
         WHERE s.company_id = $1
           AND s.archived_at IS NULL
           AND COALESCE(s.is_system, FALSE) = FALSE
           AND s.system_key IS NULL
         ORDER BY s.title ASC`,
        [companyId],
      );
      for (const row of itemsRes.rows) {
        const gid = row.group_id;
        if (gid == null) continue;
        if (!itemsByGroup[gid]) itemsByGroup[gid] = [];
        itemsByGroup[gid].push(row);
      }
    }

    res.json({
      groups: groupsRes.rows.map((g) => ({
        ...g,
        meta_fields: Array.isArray(g.meta_fields) ? g.meta_fields : normalizeMetaFields(g.meta_fields),
        items: includeItems ? (itemsByGroup[g.id] || []) : undefined,
      })),
    });
  } catch (error) {
    console.error('Error listing item groups:', error);
    res.status(500).json({ error: 'Failed to list item groups' });
  }
});

// POST /api/item-groups
router.post('/', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    await ensureCompanyServicesGroup(pool, companyId);

    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const meta = normalizeMetaFields(req.body?.meta_fields);
    const key = await uniqueGroupKey(companyId, name);

    const maxSort = await pool.query(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM item_groups WHERE company_id = $1`,
      [companyId],
    );
    const sortOrder = (maxSort.rows[0]?.m || 0) + 1;

    const ins = await pool.query(
      `INSERT INTO item_groups (company_id, key, name, is_system, meta_fields, sort_order)
       VALUES ($1, $2, $3, FALSE, $4::text[], $5)
       RETURNING *`,
      [companyId, key, name, meta, sortOrder],
    );

    res.status(201).json({ group: { ...ins.rows[0], item_count: 0, items: [] } });
  } catch (error) {
    console.error('Error creating item group:', error);
    res.status(500).json({ error: 'Failed to create item group' });
  }
});

// PUT /api/item-groups/:id
router.put('/:id', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const groupId = parseInt(req.params.id, 10);
    if (!Number.isFinite(groupId)) return res.status(400).json({ error: 'Invalid group id' });

    const existing = await pool.query(
      `SELECT * FROM item_groups WHERE id = $1 AND company_id = $2`,
      [groupId, companyId],
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    const row = existing.rows[0];
    if (row.is_system || row.key === SYSTEM_SERVICES_GROUP_KEY) {
      return res.status(400).json({ error: 'The default Services group cannot be changed' });
    }

    const name = req.body?.name != null ? String(req.body.name).trim() : row.name;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    let meta = row.meta_fields;
    if (req.body?.meta_fields !== undefined) {
      meta = normalizeMetaFields(req.body.meta_fields);
    }

    const updated = await pool.query(
      `UPDATE item_groups
       SET name = $1, meta_fields = $2::text[]
       WHERE id = $3
       RETURNING *`,
      [name, meta, groupId],
    );

    res.json({ group: updated.rows[0] });
  } catch (error) {
    console.error('Error updating item group:', error);
    res.status(500).json({ error: 'Failed to update item group' });
  }
});

// DELETE /api/item-groups/:id — only empty, non-system groups
router.delete('/:id', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const groupId = parseInt(req.params.id, 10);
    if (!Number.isFinite(groupId)) return res.status(400).json({ error: 'Invalid group id' });

    const existing = await pool.query(
      `SELECT * FROM item_groups WHERE id = $1 AND company_id = $2`,
      [groupId, companyId],
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    const row = existing.rows[0];
    if (row.is_system || row.key === SYSTEM_SERVICES_GROUP_KEY) {
      return res.status(400).json({ error: 'The default Services group cannot be deleted' });
    }

    const count = await pool.query(
      `SELECT COUNT(*)::int AS c FROM services
       WHERE company_id = $1 AND group_id = $2 AND archived_at IS NULL`,
      [companyId, groupId],
    );
    if ((count.rows[0]?.c || 0) > 0) {
      return res.status(400).json({
        error: 'Move or archive all items in this group before deleting it',
      });
    }

    await pool.query(`DELETE FROM item_groups WHERE id = $1`, [groupId]);
    res.json({ message: 'Group deleted' });
  } catch (error) {
    console.error('Error deleting item group:', error);
    res.status(500).json({ error: 'Failed to delete item group' });
  }
});

module.exports = router;
