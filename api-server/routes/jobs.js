const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const {
  getPendingAutomationBadgesForJob,
  scheduleAutomationSendsForJob,
  rescheduleReminderForJob,
  cancelPendingForJob,
} = require('../utils/automatedEmails');
const { sendEmail, STANDARD_FOOTER_PLACEHOLDER } = require('../utils/email');
const { setJobAutoTitleIfEmpty } = require('../utils/jobAutoTitle');

const router = express.Router();

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainMessageToHtml(text) {
  return escapeHtml(String(text || '').trim()).replace(/\r\n/g, '\n').replace(/\n/g, '<br>\n');
}

/** HTML wrapper for manual job emails — company header, readable body, footer. */
function buildManualJobEmailHtml(companyName, bodyPlain) {
  const company = escapeHtml(companyName || 'Your service provider');
  const paragraphs = String(bodyPlain || '')
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px 0;">${plainMessageToHtml(p).replace(/<br>\n/g, '<br>')}</p>`)
    .join('');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background-color:#eef2f2;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#eef2f2;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;border-collapse:collapse;">
      <tr>
        <td style="background-color:#193434;color:#ffffff;padding:22px 24px;border-radius:12px 12px 0 0;">
          <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.85;margin-bottom:6px;">Message from</div>
          <div style="font-size:20px;font-weight:600;line-height:1.25;">${company}</div>
        </td>
      </tr>
      <tr>
        <td style="background-color:#ffffff;padding:0;border-left:1px solid #e2e8e0;border-right:1px solid #e2e8e0;border-bottom:1px solid #e2e8e0;border-radius:0 0 12px 12px;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.65;color:#1e293b;padding:26px 24px 0 24px;">
            ${paragraphs || `<p style="margin:0;">${plainMessageToHtml(bodyPlain)}</p>`}
            ${STANDARD_FOOTER_PLACEHOLDER}
          </div>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Send email for manual “notify customer” actions (templates edited in app, body from client). */
async function sendJobCustomerEmail(pool, companyId, { to, subject, text }) {
  const addr = to && String(to).trim();
  const subj = subject && String(subject).trim();
  const body = text && String(text).trim();
  if (!addr || !subj || !body) return;
  const companyRes = await pool.query('SELECT name FROM companies WHERE id = $1', [companyId]);
  const companyName = companyRes.rows[0]?.name || '';
  const fromName = companyName || undefined;
  await sendEmail({
    to: addr,
    subject: subj,
    text: body,
    html: buildManualJobEmailHtml(companyName, body),
    fromName,
    companyId,
  });
}

// JWT Secret - should match auth.js
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Apply authentication to all routes
router.use(authenticateToken);

// Helper function to get active company ID from JWT token
const getActiveCompanyId = (req) => {
  const activeCompanyId = req.user?.activeCompanyId;
  
  if (!activeCompanyId) {
    return { error: 'No active company found in token', status: 400 };
  }

  return { companyId: activeCompanyId };
};

// Compute job status from its job_services and update jobs.status.
// Rules:
// - All services completed            -> completed
// - All services cancelled            -> cancelled
// - Mix of completed and cancelled    -> sub_completed
// - Any service still without status
//   (scheduled / null / anything else)-> scheduled
async function computeAndUpdateJobStatus(jobId) {
  const r = await pool.query(
    `SELECT status FROM job_services WHERE job_id = $1`,
    [jobId]
  );
  const statuses = (r.rows || []).map((row) => row.status);
  if (statuses.length === 0) {
    await pool.query(
      `UPDATE jobs SET status = 'scheduled', updated_at = NOW() WHERE id = $1`,
      [jobId]
    );
    return 'scheduled';
  }
  const allCompleted = statuses.every((s) => s === 'completed');
  const allCancelled = statuses.every((s) => s === 'cancelled');
  const hasCompleted = statuses.some((s) => s === 'completed');
  const hasCancelled = statuses.some((s) => s === 'cancelled');

  let jobStatus = 'scheduled';

  if (allCompleted) {
    // Every task explicitly completed
    jobStatus = 'completed';
  } else if (allCancelled) {
    // Every task explicitly cancelled
    jobStatus = 'cancelled';
  } else if (hasCompleted && hasCancelled) {
    // All tasks have an explicit status (completed/cancelled), and there is a mix
    // This represents a partially done job where some tasks were cancelled.
    jobStatus = 'sub_completed';
  } else {
    // At least one task is still "blank"/scheduled (no explicit completed/cancelled),
    // so the overall job should NOT be treated as completed yet.
    jobStatus = 'scheduled';
  }
  await pool.query(
    `UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2`,
    [jobStatus, jobId]
  );
  return jobStatus;
}

// DELETE /api/jobs/:jobId/automation-cancel/:automationKey — cancel a pending scheduled send
router.delete('/:jobId/automation-cancel/:automationKey', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const jobId = parseInt(req.params.jobId, 10);
    const { automationKey } = req.params;
    if (Number.isNaN(jobId) || !automationKey) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    const { cancelPendingByKey } = require('../utils/automatedEmails');
    await cancelPendingByKey(pool, companyId, jobId, automationKey);
    res.json({ ok: true });
  } catch (e) {
    console.error('automation-cancel:', e);
    res.status(500).json({ error: 'Failed to cancel automation send' });
  }
});

// GET /api/jobs/:jobId/automation-badges — pending automated email ETAs for job footer badges
router.get('/:jobId/automation-badges', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const jobId = parseInt(req.params.jobId, 10);
    if (Number.isNaN(jobId)) {
      return res.status(400).json({ error: 'Invalid job id' });
    }
    const result = await getPendingAutomationBadgesForJob(pool, jobId, companyId);
    res.json(result);
  } catch (e) {
    console.error('automation-badges:', e);
    res.status(500).json({ error: 'Failed to load automation status' });
  }
});

// GET /api/jobs/:jobId - Get single job with full details (MUST come before GET /)
// Note: authenticateToken is already applied via router.use() above
router.get('/:jobId', async (req, res) => {
  console.log('🎯 Route /:jobId hit!', { jobId: req.params.jobId, method: req.method, path: req.path, url: req.url });
  try {
    const { jobId } = req.params;
    const userId = req.user?.userId;

    console.log('🔍 Fetching job details:', { jobId, userId, jobIdType: typeof jobId });

    // Get user's company
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    console.log('🏢 Company ID:', companyId);

    // Get job with client details
    const jobQuery = `
      SELECT
        j.*,
        c.name,
        c.last_name,
        c.email as client_email,
        c.phone as client_phone,
        c.address,
        c.zip_code,
        c.city,
        c.lat as client_lat,
        c.lng as client_lng,
        c.client_type,
        CASE WHEN c.client_type = 'company' THEN true ELSE false END as is_company
      FROM jobs j
      LEFT JOIN clients c ON j.client_id = c.id
      WHERE j.id = $1 AND j.company_id = $2
    `;

    console.log('📝 Query params:', [jobId, companyId]);
    const jobResult = await pool.query(jobQuery, [parseInt(jobId), companyId]);
    console.log('📊 Job query result:', jobResult.rows.length, 'rows found');

    if (jobResult.rows.length === 0) {
      console.log('❌ Job not found - checking if job exists at all...');
      // Debug query to see if job exists
      const debugResult = await pool.query('SELECT id, company_id FROM jobs WHERE id = $1', [parseInt(jobId)]);
      console.log('🔍 Debug query result:', debugResult.rows);
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    const job = jobResult.rows[0];

    // Get all services for this job
    // Note: job_services can have either service_id (references services table) or custom_title (custom service)
    // Each service has status: scheduled | completed | cancelled; job status is derived from these.
    const servicesQuery = `
      SELECT
        js.id,
        js.job_id,
        js.service_id,
        js.custom_title,
        js.custom_price,
        js.custom_duration_minutes,
        COALESCE(js.status, 'scheduled') as status,
        js.completed_at,
        js.custom_title as service_name,
        NULL as service_description,
        COALESCE(js.custom_price, s.price) as price,
        COALESCE(js.custom_duration_minutes, s.duration_minutes) as duration_minutes,
        (COALESCE(js.status, 'scheduled') = 'completed') as is_completed
      FROM job_services js
      LEFT JOIN jobs j ON js.job_id = j.id
      LEFT JOIN services s ON js.service_id = s.id
      WHERE js.job_id = $1
      ORDER BY js.id ASC
    `;
    
    const servicesResult = await pool.query(servicesQuery, [jobId]);
    let services = servicesResult.rows;
    
    // If service has service_id but no custom_title, fetch service name from services table
    // We'll fetch them separately to avoid column name issues
    for (let service of services) {
      if (service.service_id && !service.service_name) {
        try {
          const serviceResult = await pool.query(
            'SELECT * FROM services WHERE id = $1',
            [service.service_id]
          );
          if (serviceResult.rows.length > 0) {
            const svc = serviceResult.rows[0];
            // Try common column names for service name
            service.service_name = svc.title || svc.name || svc.service_name || `Service #${service.service_id}`;
            service.service_description = svc.description || null;
          }
        } catch (err) {
          console.log('Could not fetch service details for service_id:', service.service_id);
          service.service_name = service.service_name || `Service #${service.service_id}`;
        }
      }
    }

    // Calculate totals
    const totalPrice = services.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);
    const totalDuration = services.reduce((sum, s) => sum + (parseInt(s.duration_minutes) || 0), 0);
    const completedCount = services.filter((s) => s.status === 'completed').length;
    const isJobCompleted = job.status === 'completed' || job.status === 'sub_completed';

    // Get timeline (job_logs) for this job
    let timeline = [];
    try {
      const timelineQuery = `
        SELECT 
          jl.id,
          jl.action,
          jl.description,
          jl.note_content,
          jl.created_at,
          u.first_name,
          u.last_name
        FROM job_logs jl
        LEFT JOIN users u ON jl.user_id = u.id
        WHERE jl.job_id = $1
        ORDER BY jl.created_at ASC
      `;
      const timelineResult = await pool.query(timelineQuery, [jobId]);
      timeline = timelineResult.rows.map(log => ({
        id: log.id,
        description: log.description || log.note_content || '',
        message: log.description || log.note_content || '',
        action: log.action,
        created_at: log.created_at,
        user_id: log.user_id,
        user_name: log.first_name && log.last_name ? `${log.first_name} ${log.last_name}` : null
      }));
    } catch (timelineError) {
      console.log('⚠️ Could not fetch timeline (job_logs might not exist):', timelineError.message);
      // If table doesn't exist, just return empty array
      timeline = [];
    }

    res.json({
      job: {
        ...job,
        services,
        timeline,
        total_price: totalPrice,
        total_duration: totalDuration,
        completed_tasks: completedCount,
        total_tasks: services.length
      }
    });

  } catch (error) {
    console.error('Error fetching job details:', error);
    res.status(500).json({ error: 'Failed to fetch job details: ' + error.message });
  }
});

// GET /api/jobs - Get all jobs for company
router.get('/', async (req, res) => {
  try {
    const { start_date, end_date, status: statusFilter } = req.query;
    const userId = req.user.userId;

    console.log('Fetching jobs for company:', { start_date, end_date, status: statusFilter, userId });

    // Get user's company
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const onlyCompleted = statusFilter === 'completed';

    // js_totals: completed services only (for invoice/price totals)
    // js_all:    all services regardless of status (for time planning bar)
    let query = `
      SELECT
        j.*,
        c.name,
        c.last_name,
        c.email as client_email,
        c.phone as client_phone,
        c.address,
        c.zip_code,
        c.city,
        c.lat as client_lat,
        c.lng as client_lng,
        COALESCE(js_totals.service_count, 0) as service_count,
        COALESCE(jn.note_count, 0) as note_count,
        COALESCE(js_totals.calculated_price, 0) as total_price,
        COALESCE(js_totals.calculated_duration, 0) as total_duration,
        COALESCE(js_all.estimated_duration, 0) as estimated_duration
      FROM jobs j
      LEFT JOIN clients c ON j.client_id = c.id
      LEFT JOIN (
        SELECT 
          js.job_id,
          COUNT(js.id) as service_count,
          SUM(COALESCE(js.custom_price, s.price, 0)) as calculated_price,
          SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes, 0)) as calculated_duration
        FROM job_services js
        LEFT JOIN services s ON js.service_id = s.id
        WHERE js.status = 'completed'
        GROUP BY js.job_id
      ) js_totals ON j.id = js_totals.job_id
      LEFT JOIN (
        SELECT
          js.job_id,
          SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes, 0)) as estimated_duration
        FROM job_services js
        LEFT JOIN services s ON js.service_id = s.id
        GROUP BY js.job_id
      ) js_all ON j.id = js_all.job_id
      LEFT JOIN (
        SELECT
          jn.job_id,
          COUNT(jn.id) as note_count
        FROM job_notes jn
        GROUP BY jn.job_id
      ) jn ON j.id = jn.job_id
      WHERE j.company_id = $1
    `;

    const params = [companyId];

    if (onlyCompleted) {
      query += " AND (j.status = 'completed' OR j.status = 'sub_completed' OR j.status = 'cancelled')";
    }

    if (start_date && end_date && !onlyCompleted) {
      query += ' AND j.scheduled_date >= $2 AND j.scheduled_date <= $3';
      params.push(start_date, end_date);
    }

    if (onlyCompleted) {
      query += `
        ORDER BY COALESCE(j.updated_at, j.created_at) DESC, j.id DESC
      `;
    } else {
      query += `
        ORDER BY j.scheduled_date ASC, COALESCE(j.route_order, j.sort_order, 999999) ASC, j.created_at ASC
      `;
    }

    const realJobsResult = await pool.query(query, params);
    let realJobs = realJobsResult.rows;
    
    // Debug: Log cancelled jobs count
    const cancelledCount = realJobs.filter(j => j.status === 'cancelled').length
    if (cancelledCount > 0) {
      console.log(`📋 [api-server] Found ${cancelledCount} cancelled job(s) in query results`)
    }

    // Get projected jobs from active subscriptions if date range is provided (skip when fetching completed only)
    // NOTE: Some lightweight/demo DB setups may not include recurring_jobs tables.
    // In that case, we gracefully skip projected jobs instead of failing the whole jobs page.
    let projectedJobs = []
    if (start_date && end_date && !onlyCompleted) {
      let subscriptions = []
      try {
        // Get all active subscriptions for the company
        const subscriptionsResult = await pool.query(
          `SELECT
            rj.*,
            c.name,
            c.last_name,
            c.address,
            c.zip_code,
            c.city
          FROM recurring_jobs rj
          LEFT JOIN clients c ON rj.client_id = c.id
          WHERE rj.company_id = $1 AND rj.is_active = true`,
          [companyId]
        )

        subscriptions = subscriptionsResult.rows
      } catch (err) {
        // 42P01 = undefined_table
        if (err && (err.code === '42P01' || String(err.message || '').includes('recurring_jobs') || String(err.message || '').includes('does not exist'))) {
          console.log('⚠️ [api-server] Skipping projected jobs: recurring_jobs table not present in this DB setup.');
          subscriptions = []
        } else {
          throw err
        }
      }
      
      // Helper function to format date as YYYY-MM-DD string without timezone conversion
      const formatDateString = (date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      // Use calendar-day math (UTC midnight) so DST shifts don't break weekly occurrence indexing.
      const diffCalendarDays = (a, b) => {
        const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
        const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
        return Math.floor((aUtc - bUtc) / (1000 * 60 * 60 * 24))
      }
      
      // Parse date strings directly (they're already in YYYY-MM-DD format)
      const startDateStr = start_date
      const endDateStr = end_date
      
      // Calculate the first occurrence after starting_date
      const calculateFirstOccurrence = (startingDateStr, dayOfWeek) => {
        if (!startingDateStr) {
          throw new Error(`Invalid starting date: ${startingDateStr}`)
        }
        
        let dateStr = startingDateStr
        if (startingDateStr instanceof Date) {
          dateStr = formatDateString(startingDateStr)
        } else if (typeof startingDateStr !== 'string') {
          throw new Error(`Invalid starting date type: ${typeof startingDateStr}, value: ${startingDateStr}`)
        } else if (startingDateStr.includes('T')) {
          dateStr = startingDateStr.split('T')[0]
        }
        
        const dateParts = dateStr.split('-')
        if (dateParts.length !== 3) {
          throw new Error(`Invalid date format: ${dateStr}`)
        }
        
        const [year, month, day] = dateParts.map(Number)
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
          throw new Error(`Invalid date values: ${dateStr}`)
        }
        
        const startDate = new Date(year, month - 1, day)
        const startDay = startDate.getDay()
        
        let daysUntilTargetDay = (dayOfWeek - startDay + 7) % 7
        
        if (daysUntilTargetDay === 0) {
          return formatDateString(startDate)
        } else {
          const firstOccurrence = new Date(startDate)
          firstOccurrence.setDate(startDate.getDate() + daysUntilTargetDay)
          return formatDateString(firstOccurrence)
        }
      }

      const calculateFirstMonthlyOccurrence = (startingDateStr, dayOfMonth) => {
        if (!startingDateStr) {
          throw new Error(`Invalid starting date: ${startingDateStr}`)
        }
        
        let dateStr = startingDateStr
        if (startingDateStr instanceof Date) {
          dateStr = formatDateString(startingDateStr)
        } else if (typeof startingDateStr !== 'string') {
          throw new Error(`Invalid starting date type: ${typeof startingDateStr}, value: ${startingDateStr}`)
        } else if (startingDateStr.includes('T')) {
          dateStr = startingDateStr.split('T')[0]
        }
        
        const dateParts = dateStr.split('-')
        if (dateParts.length !== 3) {
          throw new Error(`Invalid date format: ${dateStr}`)
        }
        
        const [year, month, day] = dateParts.map(Number)
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
          throw new Error(`Invalid date values: ${dateStr}`)
        }
        
        const startingDate = new Date(year, month - 1, day)
        const targetDayOfMonth = dayOfMonth

        // Calculate the date for the target day of this month
        const targetDate = new Date(startingDate.getFullYear(), startingDate.getMonth(), targetDayOfMonth)

        // If the target date is before or on the starting date, move to next month
        if (targetDate <= startingDate) {
          targetDate.setMonth(targetDate.getMonth() + 1)
        }

        // Handle invalid dates (e.g., February 31st)
        if (targetDate.getDate() !== targetDayOfMonth) {
          // Date was adjusted, move to first day of next month
          targetDate.setDate(1)
          targetDate.setMonth(targetDate.getMonth() + 1)
        }

        return formatDateString(targetDate)
      }

      // For each subscription, generate projected jobs for the date range
      // We track occurrences so a moved/completed materialized occurrence does not reappear as a ghost.
      const occurrencePairs = [] // [{ subId:number, occ:number, dateStr:string, subscription:any, services:any[], totals:{price,duration} }]
      for (const subscription of subscriptions) {
        try {
          // Get services for this subscription
          const servicesResult = await pool.query(
            `SELECT 
              rjs.*,
              s.title
            FROM recurring_job_services rjs
            LEFT JOIN services s ON rjs.service_id = s.id
            WHERE rjs.recurring_job_id = $1`,
            [subscription.id]
          )

          const subscriptionServices = servicesResult.rows

          // Calculate total price and duration
          const totalPrice = subscriptionServices.reduce((sum, s) => sum + parseFloat(s.custom_price || 0), 0)
          const totalDuration = subscriptionServices.reduce((sum, s) => sum + parseInt(s.custom_duration_minutes || 0), 0)

          // Use starting_date as the minimum date for generating jobs
          let subscriptionStartingDate = subscription.starting_date || subscription.next_occurrence_date
          if (!subscriptionStartingDate) {
            console.log(`⚠️ [api-server] Subscription ${subscription.id} has no starting_date, skipping`)
            continue
          }
          
          // Convert Date object to string if needed (PostgreSQL returns DATE as Date object)
          if (subscriptionStartingDate instanceof Date) {
            subscriptionStartingDate = formatDateString(subscriptionStartingDate)
          } else if (typeof subscriptionStartingDate === 'string' && subscriptionStartingDate.includes('T')) {
            subscriptionStartingDate = subscriptionStartingDate.split('T')[0]
          }
          
          // Validate recurrence pattern based on type
          let firstOccurrenceDateStr;
          if (subscription.recurrence_type === 'weekly') {
            if (subscription.day_of_week === null || subscription.day_of_week === undefined) {
              console.log(`⚠️ [api-server] Subscription ${subscription.id} has no day_of_week for weekly recurrence, skipping`)
              continue
            }
            firstOccurrenceDateStr = calculateFirstOccurrence(subscriptionStartingDate, subscription.day_of_week)
          } else if (subscription.recurrence_type === 'monthly') {
            if (subscription.day_of_month === null || subscription.day_of_month === undefined) {
              console.log(`⚠️ [api-server] Subscription ${subscription.id} has no day_of_month for monthly recurrence, skipping`)
              continue
            }
            firstOccurrenceDateStr = calculateFirstMonthlyOccurrence(subscriptionStartingDate, subscription.day_of_month)
          } else {
            console.log(`⚠️ [api-server] Subscription ${subscription.id} has invalid recurrence_type: ${subscription.recurrence_type}, skipping`)
            continue
          }
          
          // Parse for comparison
          const [firstYear, firstMonth, firstDay] = firstOccurrenceDateStr.split('-').map(Number)
          const firstOccurrenceDateObj = new Date(firstYear, firstMonth - 1, firstDay)
          
          const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number)
          const startDateObj = new Date(startYear, startMonth - 1, startDay)
          
          const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number)
          const endDateObj = new Date(endYear, endMonth - 1, endDay)
          
          // Start from the first occurrence
          let currentDate = new Date(firstOccurrenceDateObj)
          
          // If the date range starts after the first occurrence, we need to find the correct occurrence
          if (startDateObj > firstOccurrenceDateObj) {
            if (subscription.recurrence_type === 'weekly') {
              currentDate = new Date(startDateObj)
              const currentDay = currentDate.getDay()
              let daysUntilTargetDay = (subscription.day_of_week - currentDay + 7) % 7

              if (daysUntilTargetDay > 0) {
                currentDate.setDate(currentDate.getDate() + daysUntilTargetDay)
              }

              const daysSinceFirst = diffCalendarDays(currentDate, firstOccurrenceDateObj)
              const intervalsSinceFirst = Math.floor(daysSinceFirst / (7 * subscription.interval_value))
              const remainderDays = daysSinceFirst % (7 * subscription.interval_value)

              if (remainderDays !== 0 || currentDate < firstOccurrenceDateObj) {
                const nextIntervalOccurrence = new Date(firstOccurrenceDateObj)
                nextIntervalOccurrence.setDate(firstOccurrenceDateObj.getDate() + ((intervalsSinceFirst + 1) * 7 * subscription.interval_value))
                currentDate = nextIntervalOccurrence
              }
            } else if (subscription.recurrence_type === 'monthly') {
              // For monthly subscriptions, find the correct occurrence that falls on or after startDate
              // Start from the first occurrence and advance by interval_value months until we're >= startDate
              currentDate = new Date(firstOccurrenceDateObj)
              
              while (currentDate < startDateObj) {
                // Advance by interval_value months
                const currentYear = currentDate.getFullYear()
                const currentMonth = currentDate.getMonth()
                const targetMonth = currentMonth + subscription.interval_value
                const targetYear = currentYear + Math.floor(targetMonth / 12)
                const finalMonth = targetMonth % 12
                
                // Create date for target month and day
                const tempDate = new Date(targetYear, finalMonth, subscription.day_of_month)
                
                // Handle months that don't have enough days (e.g., Feb 31 -> use last day of Feb)
                if (tempDate.getMonth() !== finalMonth) {
                  const lastDayOfMonth = new Date(targetYear, finalMonth + 1, 0).getDate()
                  currentDate = new Date(targetYear, finalMonth, Math.min(subscription.day_of_month, lastDayOfMonth))
                } else {
                  currentDate = tempDate
                }
              }
            }
          }
          
          // Paused subscriptions: skip dates on or after paused_at
          let pausedAtStr = null
          if (subscription.paused_at) {
            const p = subscription.paused_at
            pausedAtStr = p instanceof Date ? formatDateString(p) : (typeof p === 'string' ? p.split('T')[0] : null)
          }

          // Generate dates for this subscription
          while (currentDate <= endDateObj) {
            // Only generate if the date is >= first occurrence (subscription has started) and >= startDate
            if (currentDate >= firstOccurrenceDateObj && currentDate >= startDateObj) {
              const dateStr = formatDateString(currentDate)
              if (pausedAtStr && dateStr >= pausedAtStr) {
                // Skip this and all future dates (subscription paused from paused_at)
                break
              }
              
              // Compute occurrence index within subscription pattern (1-based)
              let occ;
              if (subscription.recurrence_type === 'weekly') {
                const daysSinceFirst = diffCalendarDays(currentDate, firstOccurrenceDateObj)
                occ = Math.floor(daysSinceFirst / (7 * subscription.interval_value)) + 1
              } else if (subscription.recurrence_type === 'monthly') {
                const monthsSinceFirst = (currentDate.getFullYear() - firstOccurrenceDateObj.getFullYear()) * 12 +
                                         (currentDate.getMonth() - firstOccurrenceDateObj.getMonth())
                occ = Math.floor(monthsSinceFirst / subscription.interval_value) + 1
              }

              occurrencePairs.push({
                subId: subscription.id,
                occ,
                dateStr,
                subscription,
                subscriptionServices,
                totalPrice,
                totalDuration
              })
            }

            // Move to next occurrence based on recurrence type and interval
            if (subscription.recurrence_type === 'weekly') {
              currentDate.setDate(currentDate.getDate() + (7 * subscription.interval_value))
            } else if (subscription.recurrence_type === 'monthly') {
              // For monthly, add months and then set the day
              // This ensures we always land on the correct day of month
              const currentYear = currentDate.getFullYear()
              const currentMonth = currentDate.getMonth()
              const targetMonth = currentMonth + subscription.interval_value
              const targetYear = currentYear + Math.floor(targetMonth / 12)
              const finalMonth = targetMonth % 12
              
              // Create a new date for the target month and day
              // If the day doesn't exist in that month (e.g., Feb 31), JavaScript will wrap to next month
              // So we need to check and adjust
              const tempDate = new Date(targetYear, finalMonth, subscription.day_of_month)
              
              // If the date wrapped (e.g., Feb 31 -> Mar 3), use the last day of the target month instead
              if (tempDate.getMonth() !== finalMonth) {
                // Use the last day of the target month
                const lastDayOfMonth = new Date(targetYear, finalMonth + 1, 0).getDate()
                currentDate = new Date(targetYear, finalMonth, Math.min(subscription.day_of_month, lastDayOfMonth))
              } else {
                currentDate = tempDate
              }
            }
          }
        } catch (subscriptionError) {
          console.error(`❌ [api-server] Error processing subscription ${subscription.id}:`, subscriptionError)
          continue
        }
      }

      // Fetch any materialized jobs for the occurrences in this range (by recurring_job_id + recurring_occurrence),
      // regardless of their current scheduled_date (they may have been moved).
      if (occurrencePairs.length > 0) {
        const valuesSql = occurrencePairs
          .map((_, i) => `($${i * 2 + 1}::int, $${i * 2 + 2}::int)`)
          .join(', ')

        const occParams = occurrencePairs.flatMap((p) => [p.subId, p.occ])

        const existingOccJobsResult = await pool.query(
          `
            WITH occ(recurring_job_id, recurring_occurrence) AS (VALUES ${valuesSql})
            SELECT j.id, j.recurring_job_id, j.recurring_occurrence, j.status
            FROM jobs j
            JOIN occ ON j.recurring_job_id = occ.recurring_job_id AND j.recurring_occurrence = occ.recurring_occurrence
            WHERE j.company_id = $${occParams.length + 1}
          `,
          [...occParams, companyId]
        )

        const existingSet = new Set(
          existingOccJobsResult.rows
            .filter((r) => r.recurring_job_id != null && r.recurring_occurrence != null)
            .map((r) => `${r.recurring_job_id}:${r.recurring_occurrence}`)
        )

        // Legacy safety net:
        // older generated jobs may have NULL recurring_occurrence.
        // De-dupe projected jobs by (subscription,date) too so we don't show doubles.
        const existingDateSet = new Set(
          realJobs
            .filter((j) => j.recurring_job_id != null && !!j.scheduled_date)
            .map((j) => `${j.recurring_job_id}:${j.scheduled_date}`)
        )

        for (const p of occurrencePairs) {
          // If an occurrence has been materialized (even if moved/cancelled), do not show it as projected.
          if (existingSet.has(`${p.subId}:${p.occ}`)) continue
          // Also suppress if a real job already exists on same sub+date (legacy rows with NULL occurrence)
          if (existingDateSet.has(`${p.subId}:${p.dateStr}`)) continue

          projectedJobs.push({
            id: `subscription-${p.subId}-${p.occ}`, // Virtual ID (stable even if moved)
            company_id: companyId,
            client_id: p.subscription.client_id,
            assigned_user_id: p.subscription.assigned_user_id,
            title: p.subscription.title,
            note: p.subscription.note,
            scheduled_date: p.dateStr,
            scheduled_time_from: p.subscription.scheduled_time_from,
            scheduled_time_to: p.subscription.scheduled_time_to,
            status: 'scheduled',
            recurring_job_id: p.subId,
            recurring_occurrence: p.occ,
            is_generated: true,
            name: p.subscription.name,
            last_name: p.subscription.last_name,
            address: p.subscription.address,
            zip_code: p.subscription.zip_code,
            city: p.subscription.city,
            service_count: p.subscriptionServices.length,
            total_price: p.totalPrice,
            total_duration: p.totalDuration,
            is_projected: true
          })
        }
      }
    }

    // Combine real jobs and projected jobs (when not filtering by completed); sort by date only for calendar view
    const allJobs = onlyCompleted
      ? realJobs
      : [...realJobs, ...projectedJobs].sort((a, b) => {
          if (a.scheduled_date < b.scheduled_date) return -1
          if (a.scheduled_date > b.scheduled_date) return 1
          return 0
        })

    // Log all job statuses for debugging
    const statusCounts = allJobs.reduce((acc, job) => {
      const status = job.status || 'undefined';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    console.log('📊 [api-server] Jobs returned by status:', statusCounts)
    console.log(`📊 [api-server] Total jobs: ${allJobs.length} (${realJobs.length} real, ${projectedJobs.length} projected) for company ${companyId}, date range: ${start_date} to ${end_date}`)

    res.json({
      jobs: allJobs,
      total: allJobs.length,
      filters: { start_date, end_date, status: statusFilter }
    });

  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs: ' + error.message });
  }
});

// POST /api/jobs - Create new job
router.post('/', async (req, res) => {
  try {
    const {
      title,
      client_id,
      assigned_user_id,
      services,
      note,
      scheduled_date,
      scheduled_time_from,
      scheduled_time_to
    } = req.body;
    const userId = req.user.userId;

    console.log('Creating job:', {
      title,
      client_id,
      assigned_user_id,
      services,
      note,
      scheduled_date,
      scheduled_time_from,
      scheduled_time_to,
      userId
    });

    // Validate input
    if (!client_id || !assigned_user_id || !services || !Array.isArray(services) || !scheduled_date) {
      return res.status(400).json({ error: 'Client, assigned user, services, and scheduled date are required' });
    }

    // Get user's company
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify client belongs to user's company
    const clientCheck = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND company_id = $2',
      [client_id, companyId]
    );

    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found or access denied' });
    }

    // Verify assigned user belongs to user's company
    const assignedUserCheck = await pool.query(
      'SELECT user_id FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [assigned_user_id, companyId]
    );

    if (assignedUserCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Assigned user not found or access denied' });
    }

    // Start transaction
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // Get the max sort_order for this day and user to place new job at the end
      const maxSortResult = await dbClient.query(
        `SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM jobs 
         WHERE company_id = $1 AND scheduled_date = $2 AND assigned_user_id = $3`,
        [companyId, scheduled_date, assigned_user_id]
      );
      const nextSortOrder = (maxSortResult.rows[0]?.max_sort || 0) + 1;

      // Create the job
      const jobResult = await dbClient.query(
        `INSERT INTO jobs
         (company_id, client_id, assigned_user_id, title, note, scheduled_date,
          scheduled_time_from, scheduled_time_to, recurring_job_id, is_generated, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [companyId, client_id, assigned_user_id, title || '', note, scheduled_date,
         scheduled_time_from, scheduled_time_to, null, false, nextSortOrder]
      );

      const job = jobResult.rows[0];

      // Add services to job_services table
      if (services.length > 0) {
        for (const service of services) {
          if (service.service_id) {
            // Existing service
            await dbClient.query(
              `INSERT INTO job_services (job_id, service_id, custom_price, custom_duration_minutes, status)
               VALUES ($1, $2, $3, $4, 'scheduled')`,
              [job.id, service.service_id, service.custom_price, service.custom_duration]
            );
          } else if (service.custom_title) {
            // Custom/ad-hoc service
            await dbClient.query(
              `INSERT INTO job_services (job_id, custom_title, custom_price, custom_duration_minutes, status)
               VALUES ($1, $2, $3, $4, 'scheduled')`,
              [job.id, service.custom_title, service.custom_price, service.custom_duration]
            );
          }
        }
      }

      // Persist a sensible default title built from the job's services when
      // the caller didn't supply one. Done inside the transaction so the
      // read-back below sees the final value.
      await setJobAutoTitleIfEmpty(dbClient, job.id);

      await dbClient.query('COMMIT');

      // Schedule automation sends before responding so the badge is immediately visible.
      await scheduleAutomationSendsForJob(pool, companyId, job.id);

      // Return job with client and service info
      const jobWithDetails = await pool.query(`
        SELECT
          j.*,
          c.name, c.last_name, c.address, c.zip_code, c.city, c.lat as client_lat, c.lng as client_lng,
          COUNT(js.id) as service_count,
          COALESCE(SUM(COALESCE(js.custom_price, s.price)), 0) as total_price,
          COALESCE(SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes)), 0) as total_duration
        FROM jobs j
        LEFT JOIN clients c ON j.client_id = c.id
        LEFT JOIN job_services js ON j.id = js.job_id
        LEFT JOIN services s ON js.service_id = s.id
        WHERE j.id = $1
        GROUP BY j.id, c.name, c.last_name, c.address, c.zip_code, c.city, c.lat, c.lng
      `, [job.id]);

      res.status(201).json({
        message: 'Job created successfully',
        job: jobWithDetails.rows[0]
      });

    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      dbClient.release();
    }

  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Failed to create job: ' + error.message });
  }
});

// PUT /api/jobs/reorder - Reorder jobs within a day or move between days
// MUST come before /:jobId route to avoid matching "reorder" as a jobId
router.put('/reorder', async (req, res) => {
  try {
    const { jobId, targetDate, targetIndex, sourceDate } = req.body;
    const userId = req.user.userId;

    if (!jobId || !targetDate || targetIndex === undefined) {
      return res.status(400).json({ error: 'jobId, targetDate, and targetIndex are required' });
    }

    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify job belongs to user's company
    const jobCheck = await pool.query(
      'SELECT id, company_id, scheduled_date, assigned_user_id, recurring_job_id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    const job = jobCheck.rows[0];
    const isSameDay = job.scheduled_date === targetDate;
    const isSameDate = sourceDate ? sourceDate === targetDate : isSameDay;

    // If moving to a different day, update scheduled_date
    if (!isSameDate) {
      await pool.query(
        'UPDATE jobs SET scheduled_date = $1, updated_at = NOW() WHERE id = $2',
        [targetDate, jobId]
      );
    }

    // Get all jobs for the target date and assigned user
    const targetJobs = await pool.query(
      `SELECT id, sort_order FROM jobs 
       WHERE company_id = $1 AND scheduled_date = $2 AND assigned_user_id = $3 AND id != $4
       ORDER BY COALESCE(sort_order, 0) ASC, created_at ASC`,
      [companyId, targetDate, job.assigned_user_id, jobId]
    );

    // Calculate new sort_order values
    const jobsToUpdate = [];
    let newSortOrder = targetIndex;

    // Update sort_order for jobs that come after the insertion point
    targetJobs.rows.forEach((targetJob, idx) => {
      if (idx >= targetIndex) {
        jobsToUpdate.push({ id: targetJob.id, sort_order: idx + 1 });
      } else {
        jobsToUpdate.push({ id: targetJob.id, sort_order: idx });
      }
    });

    // Add the moved job
    jobsToUpdate.push({ id: jobId, sort_order: targetIndex });

    // Update all sort_orders in a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const update of jobsToUpdate) {
        // Keep sort_order and route_order in sync so all views show the same order
        await client.query(
          'UPDATE jobs SET sort_order = $1, route_order = $1, updated_at = NOW() WHERE id = $2',
          [update.sort_order, update.id]
        );
      }

      // If this is a recurring job, update the recurring_job's sort_order for future jobs
      if (job.recurring_job_id) {
        await client.query(
          'UPDATE recurring_jobs SET sort_order = $1, updated_at = NOW() WHERE id = $2',
          [targetIndex, job.recurring_job_id]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // If moved to a different day, recalculate reminder
    if (!isSameDate) {
      setImmediate(() =>
        rescheduleReminderForJob(pool, companyId, parseInt(jobId, 10)).catch((err) =>
          console.error('rescheduleReminderForJob after reorder:', err.message || err)
        )
      );
    }

    res.json({
      message: 'Jobs reordered successfully',
      isSameDay: isSameDate
    });

  } catch (error) {
    console.error('Error reordering jobs:', error);
    res.status(500).json({ error: 'Failed to reorder jobs: ' + error.message });
  }
});

// PUT /api/jobs/route-order — save day-view route order for the route planner
// MUST come before /:jobId route to avoid matching "route-order" as a jobId
router.put('/route-order', authenticateToken, async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ error: 'orderedIds array required' });
    }
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const companyId = companyAccess.companyId;

    // Filter to integer IDs only — projected/subscription jobs have string IDs that
    // would cause a PostgreSQL type error and silently abort the entire update.
    const validIds = orderedIds.filter(id => Number.isInteger(Number(id)));
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'No valid integer job IDs provided' });
    }

    // Update both route_order AND sort_order so the order propagates to all views and the mobile app
    await Promise.all(
      validIds.map((id, index) =>
        pool.query(
          'UPDATE jobs SET route_order = $1, sort_order = $1 WHERE id = $2 AND company_id = $3',
          [index, Number(id), companyId]
        )
      )
    );
    res.json({ ok: true, saved: validIds.length });
  } catch (error) {
    console.error('Error saving route order:', error);
    res.status(500).json({ error: 'Failed to save route order' });
  }
});

// PUT /api/jobs/:jobId - Update job
router.put('/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const updates = req.body;
    const userId = req.user.userId;

    // Get user's company
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify job belongs to user's company
    const jobCheck = await pool.query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    // Build update query dynamically
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined && key !== 'id') {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(jobId);

    const updateQuery = `
      UPDATE jobs
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(updateQuery, values);

    // If the caller cleared the title (sent "" or whitespace), fall back to
    // a derived title from the job's services so the row never ends up
    // showing as "Untitled job" in the UI.
    if (updates.title !== undefined && (updates.title == null || String(updates.title).trim() === '')) {
      try {
        await setJobAutoTitleIfEmpty(pool, jobId);
        const refreshed = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
        if (refreshed.rows[0]) {
          result.rows[0] = refreshed.rows[0];
        }
      } catch (autoErr) {
        console.warn('setJobAutoTitleIfEmpty after PUT /jobs failed:', autoErr.message || autoErr);
      }
    }

    // If date changed, recalculate reminder send time
    if (updates.scheduled_date !== undefined) {
      setImmediate(() =>
        rescheduleReminderForJob(pool, companyId, parseInt(jobId, 10)).catch((err) =>
          console.error('rescheduleReminderForJob after update:', err.message || err)
        )
      );
    }

    res.json({
      message: 'Job updated successfully',
      job: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: 'Failed to update job: ' + error.message });
  }
});

// PUT /api/jobs/:jobId/services/:serviceId/status - Update a single job service status (scheduled | completed | cancelled). Job status is then recomputed.
router.put('/:jobId/services/:serviceId/status', async (req, res) => {
  try {
    const { jobId, serviceId } = req.params;
    const { status } = req.body;

    if (!status || !['scheduled', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Status must be scheduled, completed, or cancelled' });
    }

    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const jobCheck = await pool.query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );
    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    if (status === 'completed') {
      await pool.query(
        `UPDATE job_services SET status = 'completed', completed_at = COALESCE(completed_at, NOW()) WHERE id = $1 AND job_id = $2`,
        [serviceId, jobId]
      );
    } else if (status === 'cancelled') {
      await pool.query(
        `UPDATE job_services SET status = 'cancelled', completed_at = NULL WHERE id = $1 AND job_id = $2`,
        [serviceId, jobId]
      );
    } else {
      await pool.query(
        `UPDATE job_services SET status = 'scheduled', completed_at = NULL WHERE id = $1 AND job_id = $2`,
        [serviceId, jobId]
      );
    }

    const updated = await pool.query(
      'SELECT * FROM job_services WHERE id = $1 AND job_id = $2',
      [serviceId, jobId]
    );
    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Job service not found' });
    }

    // Recompute overall job status based on all services
    const newJobStatus = await computeAndUpdateJobStatus(parseInt(jobId, 10));

    // Log this service status change in job_logs (timeline)
    try {
      const userId = req.user?.userId || null;
      const svcInfo = await pool.query(
        `SELECT 
           COALESCE(js.custom_title, s.title) AS title, 
           js.status
         FROM job_services js
         LEFT JOIN services s ON js.service_id = s.id
         WHERE js.id = $1 AND js.job_id = $2`,
        [serviceId, jobId]
      );
      const svc = svcInfo.rows[0] || {};
      const title = svc.title || 'Service';
      let statusLabel = 'scheduled';
      if (status === 'completed') statusLabel = 'completed';
      else if (status === 'cancelled') statusLabel = 'cancelled';

      await pool.query(
        'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
        [
          jobId,
          userId,
          'service-status-change',
          `${title} -> ${statusLabel}`,
        ]
      );
    } catch (logError) {
      console.error('Failed to log service status change', { jobId, serviceId, error: logError.message });
      // Do not fail the main request if logging fails
    }

    const jobResult = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    res.json({
      message: 'Service status updated',
      service: updated.rows[0],
      job: jobResult.rows[0] || null,
    });
  } catch (error) {
    console.error('Error updating job service status:', error);
    res.status(500).json({ error: 'Failed to update service status: ' + error.message });
  }
});

// PUT /api/jobs/:jobId/status - Update job status
router.put('/:jobId/status', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { status, notify_customer, notification_subject, notification_message } = req.body;
    const userId = req.user.userId;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Get user's company
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify job belongs to user's company
    const jobCheck = await pool.query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    const validStatuses = ['scheduled', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status must be scheduled, completed, or cancelled' });
    }

    // Update all job_services for this job to the new status; then derive job.status
    if (status === 'completed') {
      await pool.query(
        `UPDATE job_services SET status = 'completed', completed_at = COALESCE(completed_at, NOW()) WHERE job_id = $1`,
        [jobId]
      );
    } else if (status === 'cancelled') {
      await pool.query(
        `UPDATE job_services SET status = 'cancelled', completed_at = NULL WHERE job_id = $1`,
        [jobId]
      );
    } else {
      await pool.query(
        `UPDATE job_services SET status = 'scheduled', completed_at = NULL WHERE job_id = $1`,
        [jobId]
      );
    }

    await computeAndUpdateJobStatus(jobId);

    // If cancelled, remove any pending scheduled emails
    if (status === 'cancelled') {
      setImmediate(() =>
        cancelPendingForJob(pool, companyId, parseInt(jobId, 10)).catch((err) =>
          console.error('cancelPendingForJob after cancel:', err.message || err)
        )
      );
    }

    if (
      status === 'cancelled' &&
      notify_customer &&
      notification_message &&
      String(notification_message).trim()
    ) {
      const subj =
        (notification_subject && String(notification_subject).trim()) || 'Job update';
      try {
        const clientRes = await pool.query(
          `SELECT c.email FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = $1 AND j.company_id = $2`,
          [jobId, companyId]
        );
        const clientEmail = clientRes.rows[0]?.email;
        if (clientEmail) {
          await sendJobCustomerEmail(pool, companyId, {
            to: clientEmail,
            subject: subj,
            text: String(notification_message).trim(),
          });
        }
      } catch (emailErr) {
        console.error('Cancel notification email failed:', emailErr.message || emailErr);
      }
    }

    const result = await pool.query(
      'SELECT * FROM jobs WHERE id = $1',
      [jobId]
    );

    res.json({
      message: 'Job status updated successfully',
      job: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating job status:', error);
    res.status(500).json({ error: 'Failed to update job status: ' + error.message });
  }
});

// POST /api/jobs/:jobId/notes - Add note to job timeline
router.post('/:jobId/notes', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { content } = req.body;
    const userId = req.user.userId;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    // Get user's company
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify job belongs to user's company
    const jobCheck = await pool.query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    // Insert note into job_logs table
    const noteResult = await pool.query(
      `INSERT INTO job_logs (job_id, user_id, action, description, note_content, created_at)
       VALUES ($1, $2, 'note', $3, $3, NOW())
       RETURNING *`,
      [jobId, userId, content.trim()]
    );

    res.status(201).json({
      message: 'Note added successfully',
      note: noteResult.rows[0]
    });

  } catch (error) {
    console.error('Error adding note:', error);
    // If job_logs table doesn't exist, provide helpful error
    if (error.message && error.message.includes('does not exist')) {
      return res.status(500).json({ error: 'Timeline feature not available. job_logs table does not exist.' });
    }
    res.status(500).json({ error: 'Failed to add note: ' + error.message });
  }
});

// DELETE /api/jobs/:jobId - Delete job
router.delete('/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.userId;

    // Get user's company
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify job belongs to user's company
    const jobCheck = await pool.query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    // Delete job (cascade will handle related records)
    await pool.query('DELETE FROM jobs WHERE id = $1', [jobId]);

    res.json({
      message: 'Job deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job: ' + error.message });
  }
});

// PUT /api/jobs/:jobId/time - Update job time
router.put('/:jobId/time', async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId, 10);
    const { scheduled_time_from, scheduled_time_to, notifyCustomer, notification_message, notification_subject } = req.body || {};
    const userId = req.user.userId;
    
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    
    const jobResult = await pool.query(
      'SELECT id, company_id, scheduled_time_from, scheduled_time_to, client_id FROM jobs WHERE id = $1',
      [jobId]
    );
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const job = jobResult.rows[0];
    if (job.company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const oldFrom = job.scheduled_time_from;
    const oldTo = job.scheduled_time_to;
    
    const client = await pool.query('SELECT email FROM clients WHERE id = $1', [job.client_id]);
    const clientEmail = client.rows[0]?.email || null;
    
    await pool.query(
      'UPDATE jobs SET scheduled_time_from = $1, scheduled_time_to = $2, updated_at = NOW() WHERE id = $3',
      [scheduled_time_from || null, scheduled_time_to || null, jobId]
    );
    
    try {
      await pool.query('ALTER TABLE job_logs ADD COLUMN IF NOT EXISTS notification_subject TEXT');
    } catch {}

    const fmt = (t) => {
      if (!t) return 'unset';
      const s = String(t);
      return s.length >= 5 ? s.substring(0, 5) : s;
    };
    const description = `Time changed from ${fmt(oldFrom)} - ${fmt(oldTo)} to ${fmt(scheduled_time_from)} - ${fmt(scheduled_time_to)}`;
    
    try {
      try {
        await pool.query(
          'INSERT INTO job_logs (job_id, user_id, action, description, notification_subject, notification_message, notification_email) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [jobId, userId, 'time-changed', description, notifyCustomer ? (notification_subject || null) : null, notifyCustomer ? (notification_message || null) : null, notifyCustomer ? clientEmail : null]
        );
      } catch (colErr) {
        if (colErr.code === '42703') {
          await pool.query(
            'INSERT INTO job_logs (job_id, user_id, action, description, notification_message, notification_email) VALUES ($1, $2, $3, $4, $5, $6)',
            [jobId, userId, 'time-changed', description, notifyCustomer ? (notification_message || null) : null, notifyCustomer ? clientEmail : null]
          );
        } else {
          throw colErr;
        }
      }
    } catch (logError) {
      if (logError.code === '42703') {
        await pool.query(
          'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
          [jobId, userId, 'time-changed', description]
        );
      } else {
        throw logError;
      }
    }

    if (notifyCustomer && clientEmail && notification_subject && notification_message) {
      try {
        await sendJobCustomerEmail(pool, companyId, {
          to: clientEmail,
          subject: notification_subject,
          text: notification_message,
        });
      } catch (emailErr) {
        console.error('Time-change notification email failed:', emailErr.message || emailErr);
      }
    }

    res.json({ message: 'Job time updated' });
  } catch (error) {
    console.error('Error updating job time:', error);
    return res.status(500).json({ error: 'Failed to update job time', details: error.message });
  }
});

// PUT /api/jobs/:jobId/assignee - Update job assignee
router.put('/:jobId/assignee', async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId, 10);
    const { assigned_user_id, notifyCustomer, notification_message, notification_subject } = req.body || {};
    const userId = req.user.userId;
    
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    
    const jobResult = await pool.query(
      'SELECT id, company_id, assigned_user_id, client_id FROM jobs WHERE id = $1',
      [jobId]
    );
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const job = jobResult.rows[0];
    if (job.company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const membership = await pool.query(
      'SELECT user_id FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [assigned_user_id, companyId]
    );
    if (membership.rows.length === 0) {
      return res.status(400).json({ error: 'Assigned user not found or access denied' });
    }
    
    await pool.query(
      'UPDATE jobs SET assigned_user_id = $1, updated_at = NOW() WHERE id = $2',
      [assigned_user_id, jobId]
    );
    
    const client = await pool.query('SELECT email FROM clients WHERE id = $1', [job.client_id]);
    const clientEmail = client.rows[0]?.email || null;
    
    try {
      await pool.query('ALTER TABLE job_logs ADD COLUMN IF NOT EXISTS notification_subject TEXT');
    } catch {}

    const oldAssignee = job.assigned_user_id;
    const description = `Assignee changed from ${oldAssignee ?? 'unset'} to ${assigned_user_id}`;
    try {
      try {
        await pool.query(
          'INSERT INTO job_logs (job_id, user_id, action, description, notification_subject, notification_message, notification_email) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [jobId, userId, 'assignee-changed', description, notifyCustomer ? (notification_subject || null) : null, notifyCustomer ? (notification_message || null) : null, notifyCustomer ? clientEmail : null]
        );
      } catch (colErr) {
        if (colErr.code === '42703') {
          await pool.query(
            'INSERT INTO job_logs (job_id, user_id, action, description, notification_message, notification_email) VALUES ($1, $2, $3, $4, $5, $6)',
            [jobId, userId, 'assignee-changed', description, notifyCustomer ? (notification_message || null) : null, notifyCustomer ? clientEmail : null]
          );
        } else {
          throw colErr;
        }
      }
    } catch (logError) {
      if (logError.code === '42703') {
        await pool.query(
          'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
          [jobId, userId, 'assignee-changed', description]
        );
      } else {
        throw logError;
      }
    }

    if (notifyCustomer && clientEmail && notification_subject && notification_message) {
      try {
        await sendJobCustomerEmail(pool, companyId, {
          to: clientEmail,
          subject: notification_subject,
          text: notification_message,
        });
      } catch (emailErr) {
        console.error('Assignee-change notification email failed:', emailErr.message || emailErr);
      }
    }
    
    res.json({ message: 'Job assignee updated' });
  } catch (error) {
    console.error('Error updating assignee:', error);
    return res.status(500).json({ error: 'Failed to update assignee', details: error.message });
  }
});

// PUT /api/jobs/:jobId/move - Move job to new date
router.put('/:jobId/move', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { new_date, notify_customer, notification_message, notification_subject, notification_email } = req.body;
    const userId = req.user.userId;

    if (!new_date) {
      return res.status(400).json({ error: 'New date is required' });
    }

    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const jobCheck = await pool.query(
      `SELECT j.id, j.scheduled_date, c.name, c.last_name,
              COALESCE(NULLIF(TRIM(c.email), ''), NULLIF(TRIM(c.billing_email), '')) AS resolved_email
       FROM jobs j
       JOIN clients c ON j.client_id = c.id
       WHERE j.id = $1 AND j.company_id = $2`,
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    const currentJob = jobCheck.rows[0];
    const oldDate = currentJob.scheduled_date;
    const clientEmail = currentJob.resolved_email || null;

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      await dbClient.query(
        'UPDATE jobs SET scheduled_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [new_date, jobId]
      );

      const oldFormattedDate = new Date(oldDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      const newFormattedDate = new Date(new_date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

      try {
        await dbClient.query('ALTER TABLE job_logs ADD COLUMN IF NOT EXISTS notification_subject TEXT');
      } catch {}

      let logDescription = `Job moved to ${newFormattedDate}`;
      if (notify_customer && notification_message) {
        logDescription += ' (customer notified)';
      }
      
      try {
        try {
          await dbClient.query(
            'INSERT INTO job_logs (job_id, user_id, action, description, notification_subject, notification_message, notification_email) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [jobId, userId, 'moved', logDescription, notify_customer ? (notification_subject || null) : null, notify_customer && notification_message ? notification_message : null, notify_customer ? clientEmail : null]
          );
        } catch (colErr) {
          if (colErr.code === '42703') {
            await dbClient.query(
              'INSERT INTO job_logs (job_id, user_id, action, description, notification_message, notification_email) VALUES ($1, $2, $3, $4, $5, $6)',
              [jobId, userId, 'moved', logDescription, notify_customer && notification_message ? notification_message : null, notify_customer ? clientEmail : null]
            );
          } else {
            throw colErr;
          }
        }
      } catch (logError) {
        if (logError.code === '42703') {
          try {
            await dbClient.query(
              'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
              [jobId, userId, 'moved', logDescription]
            );
          } catch (logError2) {
            if (logError2.code === '42703' || (logError2.message && logError2.message.includes('user_id'))) {
              await dbClient.query(
                'INSERT INTO job_logs (job_id, action, description) VALUES ($1, $2, $3)',
                [jobId, 'moved', logDescription]
              );
            } else {
              throw logError2;
            }
          }
        } else {
          throw logError;
        }
      }

      await dbClient.query('COMMIT');

      const wantsNotify =
        notify_customer === true ||
        notify_customer === 'true' ||
        notify_customer === 1 ||
        notify_customer === '1';
      const overrideTo =
        wantsNotify && notification_email && String(notification_email).trim().includes('@')
          ? String(notification_email).trim()
          : null;
      const toEmail = overrideTo || clientEmail;
      let msgBody = notification_message != null ? String(notification_message).trim() : '';
      if (wantsNotify && toEmail && !msgBody) {
        const co = await pool.query('SELECT name, country_code FROM companies WHERE id = $1', [companyId]);
        const brand = co.rows[0]?.name || 'Our team';
        const countryCode = String(co.rows[0]?.country_code || '').trim().toUpperCase();
        const clientName = [currentJob.name, currentJob.last_name].filter(Boolean).join(' ').trim();
        const MOVE_FALLBACKS = {
          DK: { greeting: 'Hej', name: 'der', body: `Din aftale med ${brand} er blevet rykket.\n\n• Tidligere dato: ${oldFormattedDate}\n• Ny dato: ${newFormattedDate}\n\nHvis den nye dato ikke passer dig, er du velkommen til at svare på denne e-mail.`, signOff: 'Med venlig hilsen,' },
          NO: { greeting: 'Hei', name: 'der', body: `Avtalen din med ${brand} er blitt utsatt.\n\n• Tidligere dato: ${oldFormattedDate}\n• Ny dato: ${newFormattedDate}\n\nHvis den nye datoen ikke passer, er du velkommen til å svare på denne e-posten.`, signOff: 'Med vennlig hilsen,' },
          SE: { greeting: 'Hej', name: 'där', body: `Ditt möte med ${brand} har schemalagts om.\n\n• Tidigare datum: ${oldFormattedDate}\n• Nytt datum: ${newFormattedDate}\n\nOm det nya datumet inte passar dig, är du välkommen att svara på detta e-postmeddelande.`, signOff: 'Med vänliga hälsningar,' },
          DE: { greeting: 'Hallo', name: '', body: `Ihr Termin bei ${brand} wurde verschoben.\n\n• Vorheriges Datum: ${oldFormattedDate}\n• Neues Datum: ${newFormattedDate}\n\nFalls das neue Datum nicht passt, antworten Sie bitte auf diese E-Mail.`, signOff: 'Mit freundlichen Grüßen,' },
        };
        const fb = MOVE_FALLBACKS[countryCode] || null;
        if (fb) {
          const salutation = clientName ? `${fb.greeting} ${clientName},` : `${fb.greeting},`;
          msgBody = `${salutation}\n\n${fb.body}\n\n${fb.signOff}\n${brand}`;
        } else {
          const dear = clientName || 'there';
          msgBody = `Dear ${dear},\n\nYour appointment with ${brand} has been rescheduled.\n\n• Previous date: ${oldFormattedDate}\n• New date: ${newFormattedDate}\n\nIf the new date does not work for you, reply to this email.\n\nBest regards,\n${brand}`;
        }
      }
      if (wantsNotify && toEmail && msgBody) {
        const subj =
          (notification_subject != null && String(notification_subject).trim()) ||
          'Job date update';
        try {
          await sendJobCustomerEmail(pool, companyId, {
            to: toEmail,
            subject: subj,
            text: msgBody,
          });
        } catch (emailErr) {
          console.error('Move notification email failed:', emailErr.message || emailErr);
        }
      } else if (wantsNotify && !toEmail) {
        console.warn('[jobs/move] notify_customer set but no recipient email (client email + billing empty, override missing)');
      }

      // Recalculate reminder send time now that the date has changed
      setImmediate(() =>
        rescheduleReminderForJob(pool, companyId, parseInt(jobId, 10)).catch((err) =>
          console.error('rescheduleReminderForJob after move:', err.message || err)
        )
      );

      res.json({
        message: 'Job moved successfully',
        job: {
          id: parseInt(jobId),
          scheduled_date: new_date
        },
        old_date: oldDate,
        new_date: new_date
      });
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      dbClient.release();
    }
  } catch (error) {
    console.error('Error moving job:', error);
    res.status(500).json({ 
      error: 'Failed to move job',
      details: error.message 
    });
  }
});

// GET /api/jobs/:jobId/logs - Get job logs
router.get('/:jobId/logs', async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.userId;

    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const jobCheck = await pool.query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    let logsResult;
    try {
      logsResult = await pool.query(
        `SELECT 
          jl.id,
          jl.action,
          jl.description,
          jl.notification_subject,
          jl.notification_message,
          jl.notification_email,
          jl.note_content,
          jl.created_at,
          u.first_name,
          u.last_name
        FROM job_logs jl
        LEFT JOIN users u ON jl.user_id = u.id
        WHERE jl.job_id = $1
        ORDER BY jl.created_at ASC`,
        [jobId]
      );
    } catch (selErr) {
      if (selErr.code === '42703') {
        logsResult = await pool.query(
          `SELECT 
            jl.id,
            jl.action,
            jl.description,
            jl.notification_message,
            jl.notification_email,
            jl.note_content,
            jl.created_at,
            u.first_name,
            u.last_name
          FROM job_logs jl
          LEFT JOIN users u ON jl.user_id = u.id
          WHERE jl.job_id = $1
          ORDER BY jl.created_at ASC`,
          [jobId]
        );
      } else {
        throw selErr;
      }
    }

    res.json({
      logs: logsResult.rows
    });
  } catch (error) {
    console.error('Error fetching job logs:', error);
    res.status(500).json({ error: 'Failed to fetch job logs' });
  }
});

// DELETE /api/jobs/:jobId/notes/:noteId - Delete a note
router.delete('/:jobId/notes/:noteId', async (req, res) => {
  try {
    const { jobId, noteId } = req.params;
    const userId = req.user.userId;

    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const jobCheck = await pool.query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    // Delete note from job_logs (where note_content exists)
    const deleteResult = await pool.query(
      'DELETE FROM job_logs WHERE id = $1 AND job_id = $2 AND user_id = $3 AND note_content IS NOT NULL RETURNING *',
      [noteId, jobId, userId]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found or access denied' });
    }

    res.json({
      message: 'Note deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// ── Route planner: geocode coordinates ────────────────────────────────────────
router.patch('/:jobId/coordinates', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { lat, lng } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });

    // Subscription/projected jobs have string IDs — skip them silently
    const numericId = parseInt(jobId, 10);
    if (isNaN(numericId)) return res.json({ ok: true, skipped: true });

    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const companyId = companyAccess.companyId;

    await pool.query(
      'UPDATE jobs SET lat = $1, lng = $2 WHERE id = $3 AND company_id = $4',
      [lat, lng, numericId, companyId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error saving coordinates:', error);
    res.status(500).json({ error: 'Failed to save coordinates' });
  }
});

module.exports = router;
