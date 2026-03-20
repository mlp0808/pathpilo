const express = require('express');
const { pool } = require('../utils/database');

const router = express.Router();

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Helper function to get active company ID
const getActiveCompanyId = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return { error: 'User not authenticated', status: 401 };
    }

    const userId = req.user.userId;

    const result = await pool.query(`
      SELECT uc.company_id, c.name as company_name
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      return { error: 'No active company found', status: 400 };
    }

    return { companyId: result.rows[0].company_id };
  } catch (error) {
    console.error('Error getting active company:', error);
    return { error: 'Failed to get company access', status: 500 };
  }
};

// Helper to format date as local YYYY-MM-DD (no UTC shift)
const toLocalYmd = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to calculate first occurrence
const calculateFirstOccurrence = (startingDateStr, dayOfWeek) => {
  if (!startingDateStr) {
    throw new Error(`Invalid starting date: ${startingDateStr}`);
  }

  const startingDate = new Date(startingDateStr + 'T00:00:00');
  const targetDayOfWeek = dayOfWeek;

  // Find the first occurrence ON or AFTER the starting date.
  // If starting_date already matches the chosen weekday, we keep that date.
  let daysToAdd = (targetDayOfWeek - startingDate.getDay() + 7) % 7;

  const firstOccurrence = new Date(startingDate);
  firstOccurrence.setDate(startingDate.getDate() + daysToAdd);

  // IMPORTANT: use local date formatting to avoid timezone shifting to previous day
  // (e.g. Monday local midnight becoming Sunday in UTC).
  return toLocalYmd(firstOccurrence);
};

// Helper function to calculate first monthly occurrence
const calculateFirstMonthlyOccurrence = (startingDateStr, dayOfMonth) => {
  if (!startingDateStr) {
    throw new Error(`Invalid starting date: ${startingDateStr}`);
  }

  // Parse starting date as YYYY-MM-DD string (avoid timezone issues)
  let year, month, day;
  if (typeof startingDateStr === 'string') {
    const parts = startingDateStr.split('T')[0].split('-');
    if (parts.length !== 3) {
      throw new Error(`Invalid date format: ${startingDateStr}`);
    }
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
    day = parseInt(parts[2], 10);
  } else {
    // Handle Date object
    const d = new Date(startingDateStr);
    year = d.getFullYear();
    month = d.getMonth();
    day = d.getDate();
  }

  const targetDayOfMonth = parseInt(dayOfMonth, 10);
  if (isNaN(targetDayOfMonth) || targetDayOfMonth < 1 || targetDayOfMonth > 31) {
    throw new Error(`Invalid day of month: ${dayOfMonth}`);
  }

  // Calculate the date for the target day of this month
  let targetYear = year;
  let targetMonth = month;
  let targetDay = targetDayOfMonth;

  // If the target day is before the starting day, move to next month
  if (targetDayOfMonth < day) {
    targetMonth = month + 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear = year + 1;
    }
  }

  // Handle invalid dates (e.g., February 31st)
  // Check if the target day exists in the target month
  const testDate = new Date(targetYear, targetMonth, targetDayOfMonth);
  if (testDate.getMonth() !== targetMonth) {
    // Date wrapped to next month (e.g., Feb 31 -> Mar 3), use last day of target month
    const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    targetDay = Math.min(targetDayOfMonth, lastDayOfMonth);
  }

  // Format as YYYY-MM-DD (avoid timezone conversion by using string formatting)
  const resultMonth = String(targetMonth + 1).padStart(2, '0');
  const resultDay = String(targetDay).padStart(2, '0');
  return `${targetYear}-${resultMonth}-${resultDay}`;
};

// GET /api/subscriptions - Get all subscriptions for company
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Get user's company
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Check if recurring_jobs table exists
    let subscriptions = [];
    try {
      const result = await pool.query(`
        SELECT
          rj.*,
          c.name, c.last_name,
          COUNT(rjs.id) as service_count,
          COALESCE(SUM(COALESCE(rjs.custom_price, s.price)), 0) as total_price
        FROM recurring_jobs rj
        LEFT JOIN clients c ON rj.client_id = c.id
        LEFT JOIN recurring_job_services rjs ON rj.id = rjs.recurring_job_id
        LEFT JOIN services s ON rjs.service_id = s.id
        WHERE rj.company_id = $1
        GROUP BY rj.id, c.name, c.last_name
        ORDER BY rj.created_at DESC
      `, [companyId]);

      subscriptions = result.rows;
    } catch (error) {
      // Table might not exist in demo setups
      if (error.code === '42P01') {
        console.log('⚠️ recurring_jobs table not found - skipping subscriptions');
        subscriptions = [];
      } else {
        throw error;
      }
    }

    res.json({
      subscriptions,
      total: subscriptions.length
    });

  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions: ' + error.message });
  }
});

// POST /api/subscriptions - Create new subscription
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      title,
      client_id,
      assigned_user_id,
      services,
      starting_date,
      recurrence_type,
      day_of_week,
      day_of_month,
      interval_value,
      scheduled_time_from,
      scheduled_time_to,
      note
    } = req.body;
    const userId = req.user?.userId;

    console.log('Creating subscription:', {
      title, client_id, assigned_user_id, services, starting_date,
      recurrence_type, day_of_week, day_of_month, interval_value
    });

    // Validate required fields
    if (!title || !client_id || !services ||
        !Array.isArray(services) || services.length === 0 || !starting_date || !recurrence_type || 
        interval_value === null || interval_value === undefined || interval_value <= 0) {
      return res.status(400).json({
        error: 'Title, client, services, starting date, recurrence type, and interval are required'
      });
    }

    // Validate client_id is a positive integer
    const clientIdNum = typeof client_id === 'string' ? parseInt(client_id, 10) : client_id;
    if (!Number.isFinite(clientIdNum) || clientIdNum <= 0) {
      return res.status(400).json({
        error: `Invalid client ID: ${client_id}. Please create or select a valid client first.`
      });
    }

    // Get user's company
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify client belongs to company
    const clientCheck = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND company_id = $2',
      [clientIdNum, companyId]
    );

    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: `Client not found or access denied. Client ID: ${clientIdNum}. Please create the client first or select an existing client.`
      });
    }

    // Verify assigned user belongs to company (if provided)
    if (assigned_user_id) {
      const userCheck = await pool.query(
        'SELECT user_id FROM user_companies WHERE user_id = $1 AND company_id = $2',
        [assigned_user_id, companyId]
      );

      if (userCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Assigned user not found or access denied' });
      }
    }

    // Calculate first occurrence
    let firstOccurrence;
    let finalDayOfWeek = day_of_week;
    try {
      if (recurrence_type === 'weekly') {
        if (day_of_week === null || day_of_week === undefined) {
          return res.status(400).json({ error: 'Day of week is required for weekly recurrence' });
        }
        firstOccurrence = calculateFirstOccurrence(starting_date, day_of_week);
      } else if (recurrence_type === 'monthly') {
        if (day_of_month === null || day_of_month === undefined) {
          return res.status(400).json({ error: 'Day of month is required for monthly recurrence' });
        }
        firstOccurrence = calculateFirstMonthlyOccurrence(starting_date, day_of_month);
        // For monthly subscriptions, set day_of_week to the day of week of starting_date
        // This satisfies the NOT NULL constraint even though it's not used for monthly recurrence
        if (finalDayOfWeek === null || finalDayOfWeek === undefined) {
          const startDate = new Date(starting_date);
          finalDayOfWeek = startDate.getDay(); // 0 = Sunday, 6 = Saturday
        }
      } else {
        return res.status(400).json({ error: 'Invalid recurrence type' });
      }
    } catch (error) {
      return res.status(400).json({ error: 'Invalid date calculation: ' + error.message });
    }

    // Start transaction
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // Create the recurring job
      const subscriptionResult = await dbClient.query(`
        INSERT INTO recurring_jobs
        (company_id, client_id, assigned_user_id, title, note, starting_date,
         recurrence_type, day_of_week, day_of_month, interval_value,
         scheduled_time_from, scheduled_time_to, next_occurrence_date, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `, [companyId, clientIdNum, assigned_user_id, title, note, starting_date,
          recurrence_type, finalDayOfWeek, day_of_month, interval_value,
          scheduled_time_from, scheduled_time_to, firstOccurrence, true]);

      const subscription = subscriptionResult.rows[0];

      // Add services
      if (services.length > 0) {
        for (const service of services) {
          if (service.service_id) {
            await dbClient.query(`
              INSERT INTO recurring_job_services
              (recurring_job_id, service_id, custom_price, custom_duration_minutes)
              VALUES ($1, $2, $3, $4)
            `, [subscription.id, service.service_id, service.custom_price, service.custom_duration]);
          } else if (service.custom_title) {
            await dbClient.query(`
              INSERT INTO recurring_job_services
              (recurring_job_id, custom_title, custom_price, custom_duration_minutes)
              VALUES ($1, $2, $3, $4)
            `, [subscription.id, service.custom_title, service.custom_price, service.custom_duration]);
          }
        }
      }

      // Create the first job only if a user is assigned
      let firstJob = null;
      if (assigned_user_id) {
        const firstJobResult = await dbClient.query(`
          INSERT INTO jobs
          (company_id, client_id, assigned_user_id, title, note, scheduled_date,
           scheduled_time_from, scheduled_time_to, recurring_job_id, recurring_occurrence, is_generated, status, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE((SELECT sort_order FROM recurring_jobs WHERE id = $9), 0))
          RETURNING *
        `, [companyId, clientIdNum, assigned_user_id, title, note, firstOccurrence,
            scheduled_time_from, scheduled_time_to, subscription.id, 1, true, 'scheduled']);

        // Add services to the first job
        firstJob = firstJobResult.rows[0];
        if (services.length > 0) {
          for (const service of services) {
            if (service.service_id) {
              await dbClient.query(`
                INSERT INTO job_services (job_id, service_id, custom_price, custom_duration_minutes, status)
                VALUES ($1, $2, $3, $4, 'scheduled')
              `, [firstJob.id, service.service_id, service.custom_price, service.custom_duration]);
            } else if (service.custom_title) {
              await dbClient.query(`
                INSERT INTO job_services (job_id, custom_title, custom_price, custom_duration_minutes, status)
                VALUES ($1, $2, $3, $4, 'scheduled')
              `, [firstJob.id, service.custom_title, service.custom_price, service.custom_duration]);
            }
          }
        }
      }

      await dbClient.query('COMMIT');

      console.log('Subscription created successfully:', {
        id: subscription.id,
        title: subscription.title,
        client_id: subscription.client_id,
        firstJob: firstJob ? firstJob.id : null
      });

      res.status(201).json({
        message: 'Subscription created successfully',
        subscription,
        firstJob: firstJob || null
      });

    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      dbClient.release();
    }

  } catch (error) {
    console.error('Error creating subscription:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to create subscription: ' + error.message });
  }
});

// PUT /api/subscriptions/:subscriptionId - Update subscription
router.put('/:subscriptionId', authenticateToken, async (req, res) => {
  const dbClient = await pool.connect();
  try {
    const { subscriptionId } = req.params;
    const {
      title,
      assigned_user_id,
      services,
      starting_date,
      recurrence_type,
      day_of_week,
      day_of_month,
      interval_value,
      interval_weeks,   // legacy field sent by frontend – maps to interval_value
      scheduled_time_from,
      scheduled_time_to,
      note,
    } = req.body;

    // Get user's company
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      dbClient.release();
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify subscription belongs to user's company
    const subscriptionCheck = await dbClient.query(
      'SELECT id FROM recurring_jobs WHERE id = $1 AND company_id = $2',
      [subscriptionId, companyId]
    );
    if (subscriptionCheck.rows.length === 0) {
      dbClient.release();
      return res.status(404).json({ error: 'Subscription not found or access denied' });
    }

    // Resolve interval: prefer interval_value, fall back to interval_weeks
    const resolvedInterval = (interval_value != null && interval_value > 0)
      ? interval_value
      : (interval_weeks != null && interval_weeks > 0 ? interval_weeks : null);

    // Recalculate next_occurrence_date if schedule changed
    let nextOccurrenceDate = undefined;
    if (starting_date && recurrence_type) {
      try {
        if (recurrence_type === 'monthly') {
          nextOccurrenceDate = calculateFirstMonthlyOccurrence(starting_date, day_of_month);
        } else {
          nextOccurrenceDate = calculateFirstOccurrence(starting_date, day_of_week);
        }
      } catch (e) {
        // non-fatal – just skip updating next_occurrence_date
      }
    }

    // Build update for recurring_jobs (only real columns)
    const fields = [];
    const values = [];
    let p = 1;

    const addField = (col, val) => {
      if (val !== undefined) {
        fields.push(`${col} = $${p++}`);
        values.push(val);
      }
    };

    addField('title', title);
    addField('assigned_user_id', assigned_user_id !== undefined ? (assigned_user_id || null) : undefined);
    addField('starting_date', starting_date);
    addField('recurrence_type', recurrence_type);
    addField('day_of_week', day_of_week !== undefined ? day_of_week : undefined);
    addField('day_of_month', day_of_month !== undefined ? (day_of_month || null) : undefined);
    addField('interval_value', resolvedInterval);
    addField('scheduled_time_from', scheduled_time_from !== undefined ? (scheduled_time_from || null) : undefined);
    addField('scheduled_time_to', scheduled_time_to !== undefined ? (scheduled_time_to || null) : undefined);
    addField('note', note !== undefined ? (note || null) : undefined);
    if (nextOccurrenceDate) addField('next_occurrence_date', nextOccurrenceDate);

    await dbClient.query('BEGIN');

    let subscription = subscriptionCheck.rows[0];

    if (fields.length > 0) {
      values.push(subscriptionId);
      const result = await dbClient.query(
        `UPDATE recurring_jobs SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${p} RETURNING *`,
        values
      );
      subscription = result.rows[0];
    }

    // Replace services if provided
    if (Array.isArray(services) && services.length > 0) {
      await dbClient.query(
        'DELETE FROM recurring_job_services WHERE recurring_job_id = $1',
        [subscriptionId]
      );
      for (const service of services) {
        if (service.service_id) {
          await dbClient.query(
            `INSERT INTO recurring_job_services (recurring_job_id, service_id, custom_price, custom_duration_minutes)
             VALUES ($1, $2, $3, $4)`,
            [subscriptionId, service.service_id, service.custom_price ?? null, service.custom_duration ?? null]
          );
        } else if (service.custom_title) {
          await dbClient.query(
            `INSERT INTO recurring_job_services (recurring_job_id, custom_title, custom_price, custom_duration_minutes)
             VALUES ($1, $2, $3, $4)`,
            [subscriptionId, service.custom_title, service.custom_price ?? null, service.custom_duration ?? null]
          );
        }
      }
    }

    await dbClient.query('COMMIT');

    res.json({ message: 'Subscription updated successfully', subscription });

  } catch (error) {
    try { await dbClient.query('ROLLBACK'); } catch {}
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription: ' + error.message });
  } finally {
    dbClient.release();
  }
});

// DELETE /api/subscriptions/:subscriptionId - Delete subscription
router.delete('/:subscriptionId', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user.userId;

    // Get user's company
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify subscription belongs to user's company
    const subscriptionCheck = await pool.query(
      'SELECT id FROM recurring_jobs WHERE id = $1 AND company_id = $2',
      [subscriptionId, companyId]
    );

    if (subscriptionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found or access denied' });
    }

    // Mark as inactive (don't delete to preserve job history)
    await pool.query(
      'UPDATE recurring_jobs SET is_active = false, updated_at = NOW() WHERE id = $1',
      [subscriptionId]
    );

    res.json({
      message: 'Subscription deactivated successfully'
    });

  } catch (error) {
    console.error('Error deleting subscription:', error);
    res.status(500).json({ error: 'Failed to delete subscription: ' + error.message });
  }
});

// PATCH /api/subscriptions/:subscriptionId/pause - Pause or resume subscription
router.patch('/:subscriptionId/pause', authenticateToken, async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.subscriptionId, 10);
    const { paused } = req.body || {};

    if (!Number.isFinite(subscriptionId) || subscriptionId <= 0) {
      return res.status(400).json({ error: 'Invalid subscription ID' });
    }

    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const subCheck = await pool.query(
      'SELECT id, paused_at FROM recurring_jobs WHERE id = $1 AND company_id = $2 AND is_active = true',
      [subscriptionId, companyId]
    );
    if (subCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found or access denied' });
    }

    if (paused === true) {
      // Pause from today
      const today = new Date().toISOString().split('T')[0];
      await pool.query(
        'UPDATE recurring_jobs SET paused_at = $1, updated_at = NOW() WHERE id = $2',
        [today, subscriptionId]
      );
      res.json({ message: 'Subscription paused', paused_at: today });
    } else if (paused === false) {
      // Resume
      await pool.query(
        'UPDATE recurring_jobs SET paused_at = NULL, updated_at = NOW() WHERE id = $1',
        [subscriptionId]
      );
      res.json({ message: 'Subscription resumed' });
    } else {
      res.status(400).json({ error: 'Missing or invalid body: { paused: true | false }' });
    }
  } catch (error) {
    console.error('Error pausing subscription:', error);
    res.status(500).json({ error: 'Failed to pause subscription: ' + error.message });
  }
});

// POST /api/subscriptions/:subscriptionId/occurrences/:occurrence/materialize - Materialize subscription occurrence
router.post('/:subscriptionId/occurrences/:occurrence/materialize', authenticateToken, async (req, res) => {
  const dbClient = await pool.connect();
  try {
    const subscriptionId = parseInt(req.params.subscriptionId, 10);
    const occurrence = parseInt(req.params.occurrence, 10);
    const { scheduled_date } = req.body || {};
    const userId = req.user.userId;

    if (!Number.isFinite(subscriptionId) || subscriptionId <= 0) {
      dbClient.release();
      return res.status(400).json({ error: 'Invalid subscriptionId' });
    }
    if (!Number.isFinite(occurrence) || occurrence <= 0) {
      dbClient.release();
      return res.status(400).json({ error: 'Invalid occurrence (must be >= 1)' });
    }

    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      dbClient.release();
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const subRes = await dbClient.query(
      `SELECT * FROM recurring_jobs WHERE id = $1 AND company_id = $2 AND is_active = true`,
      [subscriptionId, companyId]
    );
    if (subRes.rows.length === 0) {
      dbClient.release();
      return res.status(404).json({ error: 'Subscription not found or access denied' });
    }
    const sub = subRes.rows[0];

    const existing = await dbClient.query(
      `SELECT id FROM jobs
       WHERE company_id = $1 AND recurring_job_id = $2 AND recurring_occurrence = $3
       LIMIT 1`,
      [companyId, subscriptionId, occurrence]
    );
    if (existing.rows.length > 0) {
      dbClient.release();
      return res.json({ message: 'Already materialized', jobId: existing.rows[0].id });
    }

    const formatDateString = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const calculateFirstOccurrence = (startingDateStr, dayOfWeek) => {
      const [year, month, day] = String(startingDateStr).split('-').map(Number);
      const startDate = new Date(year, month - 1, day);
      const startDay = startDate.getDay();
      const daysUntilTargetDay = (dayOfWeek - startDay + 7) % 7;
      if (daysUntilTargetDay === 0) return formatDateString(startDate);
      const first = new Date(startDate);
      first.setDate(startDate.getDate() + daysUntilTargetDay);
      return formatDateString(first);
    };

    const calculateFirstMonthlyOccurrence = (startingDateStr, dayOfMonth) => {
      const [year, month, day] = String(startingDateStr).split('-').map(Number);
      const startingDate = new Date(year, month - 1, day);
      const targetDate = new Date(startingDate.getFullYear(), startingDate.getMonth(), dayOfMonth);
      
      if (targetDate <= startingDate) {
        targetDate.setMonth(targetDate.getMonth() + 1);
      }
      
      // Handle invalid dates (e.g., February 31st)
      if (targetDate.getDate() !== dayOfMonth) {
        targetDate.setDate(1);
        targetDate.setMonth(targetDate.getMonth() + 1);
      }
      
      return formatDateString(targetDate);
    };

    let starting = sub.starting_date || sub.next_occurrence_date;
    if (starting instanceof Date) starting = formatDateString(starting);
    else if (typeof starting === 'string' && starting.includes('T')) starting = starting.split('T')[0];

    let computedDate;
    if (sub.recurrence_type === 'monthly') {
      // For monthly subscriptions, calculate using months
      const firstOccStr = calculateFirstMonthlyOccurrence(starting, sub.day_of_month);
      const [fy, fm, fd] = firstOccStr.split('-').map(Number);
      const base = new Date(fy, fm - 1, fd);
      
      // Add months for each occurrence (occurrence - 1 because first occurrence is already calculated)
      const monthsToAdd = (occurrence - 1) * (sub.interval_value || 1);
      const targetYear = base.getFullYear() + Math.floor((base.getMonth() + monthsToAdd) / 12);
      const targetMonth = (base.getMonth() + monthsToAdd) % 12;
      
      // Create date for target month and day
      const tempDate = new Date(targetYear, targetMonth, sub.day_of_month);
      
      // Handle months that don't have enough days (e.g., Feb 31 -> use last day of Feb)
      if (tempDate.getMonth() !== targetMonth) {
        const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        computedDate = formatDateString(new Date(targetYear, targetMonth, Math.min(sub.day_of_month, lastDayOfMonth)));
      } else {
        computedDate = formatDateString(tempDate);
      }
    } else {
      // For weekly subscriptions, use the original logic
      const firstOccStr = calculateFirstOccurrence(starting, sub.day_of_week);
      const [fy, fm, fd] = firstOccStr.split('-').map(Number);
      const base = new Date(fy, fm - 1, fd);
      const daysToAdd = (occurrence - 1) * 7 * (sub.interval_value || 1);
      base.setDate(base.getDate() + daysToAdd);
      computedDate = formatDateString(base);
    }

    const jobDate = (typeof scheduled_date === 'string' && scheduled_date.length === 10) ? scheduled_date : computedDate;

    // Block materialization if subscription is paused from this date
    if (sub.paused_at) {
      const pausedStr = sub.paused_at instanceof Date
        ? formatDateString(sub.paused_at)
        : (typeof sub.paused_at === 'string' ? sub.paused_at.split('T')[0] : String(sub.paused_at));
      if (pausedStr && jobDate >= pausedStr) {
        dbClient.release();
        return res.status(400).json({
          error: 'Subscription is paused. Future jobs from the pause date cannot be materialized.',
          paused_at: pausedStr
        });
      }
    }

    const subServicesRes = await dbClient.query(
      `SELECT rjs.service_id, rjs.custom_price, rjs.custom_duration_minutes
       FROM recurring_job_services rjs
       WHERE rjs.recurring_job_id = $1
       ORDER BY rjs.created_at ASC`,
      [subscriptionId]
    );
    const subServices = subServicesRes.rows;
    if (!subServices || subServices.length === 0) {
      dbClient.release();
      return res.status(400).json({ error: 'Subscription has no services to materialize' });
    }

    await dbClient.query('BEGIN');

    const jobRes = await dbClient.query(
      `INSERT INTO jobs (
        company_id, client_id, assigned_user_id, title, note,
        scheduled_date, scheduled_time_from, scheduled_time_to,
        status, recurring_job_id, recurring_occurrence, is_generated, sort_order
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13, 0))
      RETURNING id`,
      [
        companyId,
        sub.client_id,
        sub.assigned_user_id || userId,
        sub.title,
        sub.note || null,
        jobDate,
        sub.scheduled_time_from || null,
        sub.scheduled_time_to || null,
        'scheduled',
        subscriptionId,
        occurrence,
        true,
        sub.sort_order || 0
      ]
    );
    const jobId = jobRes.rows[0].id;

    for (const s of subServices) {
      await dbClient.query(
        `INSERT INTO job_services (job_id, service_id, custom_price, custom_duration_minutes, status)
         VALUES ($1,$2,$3,$4,'scheduled')
         ON CONFLICT (job_id, service_id) DO NOTHING`,
        [jobId, s.service_id, s.custom_price || null, s.custom_duration_minutes || null]
      );
    }

    try {
      await dbClient.query(
        'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
        [jobId, userId, 'materialized', 'Created by subscription']
      );
    } catch (logErr) {
      // Ignore if job_logs doesn't exist or columns are missing
      console.warn('Could not log materialization:', logErr.message);
    }

    await dbClient.query('COMMIT');
    dbClient.release();

    return res.status(201).json({ message: 'Materialized', jobId, scheduled_date: jobDate, recurring_occurrence: occurrence });
  } catch (error) {
    try { await dbClient.query('ROLLBACK'); } catch {}
    console.error('Error materializing occurrence:', error);
    return res.status(500).json({ error: 'Failed to materialize occurrence', details: error.message });
  } finally {
    try { dbClient.release(); } catch {}
  }
});

// GET /api/subscriptions/:subscriptionId/jobs - Fetch all jobs generated by a subscription
router.get('/:subscriptionId/jobs', authenticateToken, async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.subscriptionId, 10);
    if (!Number.isFinite(subscriptionId) || subscriptionId <= 0) {
      return res.status(400).json({ error: 'Invalid subscription ID' });
    }

    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify subscription belongs to company
    const subCheck = await pool.query(
      'SELECT id FROM recurring_jobs WHERE id = $1 AND company_id = $2',
      [subscriptionId, companyId]
    );
    if (subCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found or access denied' });
    }

    const result = await pool.query(`
      SELECT
        j.id, j.title, j.status, j.scheduled_date, j.scheduled_time_from, j.scheduled_time_to,
        j.recurring_occurrence,
        COALESCE(SUM(COALESCE(js.custom_price, s.price)), 0) AS total_price,
        u.first_name, u.last_name
      FROM jobs j
      LEFT JOIN job_services js ON js.job_id = j.id
      LEFT JOIN services s ON s.id = js.service_id
      LEFT JOIN users u ON u.id = j.assigned_user_id
      WHERE j.recurring_job_id = $1 AND j.company_id = $2
      GROUP BY j.id, u.first_name, u.last_name
      ORDER BY j.scheduled_date DESC
    `, [subscriptionId, companyId]);

    res.json({ jobs: result.rows });
  } catch (error) {
    console.error('Error fetching subscription jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs: ' + error.message });
  }
});

module.exports = router;
