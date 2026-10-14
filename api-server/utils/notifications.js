const { ensurePipelineSchema } = require('./pipelineSchema');

/**
 * Company-wide notification. Text is rendered client-side from `type` + `meta`
 * so it follows each reader's language.
 *
 * Types: lead.new, offer.viewed, offer.accepted, offer.declined
 */
async function createNotification(pool, { companyId, type, entityType = null, entityId = null, meta = {} }) {
  try {
    await ensurePipelineSchema(pool);
    await pool.query(
      `INSERT INTO notifications (company_id, type, entity_type, entity_id, meta)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [companyId, type, entityType, entityId, JSON.stringify(meta || {})]
    );
  } catch (err) {
    console.warn('[notifications] create failed:', err?.message || err);
  }
}

module.exports = { createNotification };
