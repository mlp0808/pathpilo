const { ensureSchema } = require('./automatedEmails');
const { ensureInvoiceReminderSchema } = require('./invoiceReminderAutomation');

function channelFromKey(key) {
  return String(key || '').startsWith('sms_') ? 'sms' : 'email';
}

/**
 * All pending outbound automations for the active company (email + SMS).
 * Used by the global bottom-right countdown stack in the app shell.
 */
async function getPendingAutomationsForCompany(pool, companyId) {
  await ensureSchema(pool);
  await ensureInvoiceReminderSchema(pool);

  const serverNow = new Date().toISOString();

  const jobRes = await pool.query(
    `SELECT sas.automation_key,
            sas.send_at,
            sas.job_id,
            NULL::integer AS invoice_id,
            TRIM(CONCAT(COALESCE(c.name, ''), ' ', COALESCE(c.last_name, ''))) AS client_label
     FROM scheduled_automation_sends sas
     JOIN jobs j ON j.id = sas.job_id
     JOIN clients c ON c.id = j.client_id
     WHERE sas.company_id = $1
       AND j.status IS DISTINCT FROM 'cancelled'
     ORDER BY sas.send_at ASC`,
    [companyId]
  );

  const invoiceRes = await pool.query(
    `SELECT 'email_invoice_due_reminder' AS automation_key,
            sirs.send_at,
            NULL::integer AS job_id,
            sirs.invoice_id,
            COALESCE(
              NULLIF(TRIM(CONCAT(COALESCE(cl.name, ''), ' ', COALESCE(cl.last_name, ''))), ''),
              i.invoice_number,
              'Invoice'
            ) AS client_label
     FROM scheduled_invoice_reminder_sends sirs
     JOIN invoices i ON i.id = sirs.invoice_id
     LEFT JOIN clients cl ON cl.id = i.client_id
     WHERE sirs.company_id = $1
     ORDER BY sirs.send_at ASC`,
    [companyId]
  );

  const pending = [...jobRes.rows, ...invoiceRes.rows]
    .map((row) => ({
      key: row.automation_key,
      channel: channelFromKey(row.automation_key),
      sendAt: new Date(row.send_at).toISOString(),
      jobId: row.job_id ?? null,
      invoiceId: row.invoice_id ?? null,
      label: String(row.client_label || '').trim() || null,
    }))
    .sort((a, b) => Date.parse(a.sendAt) - Date.parse(b.sendAt));

  return { pending, serverNow };
}

module.exports = {
  getPendingAutomationsForCompany,
  channelFromKey,
};
