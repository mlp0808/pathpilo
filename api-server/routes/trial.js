const express = require('express');
const { pool } = require('../utils/database');

const router = express.Router();

// GET /api/trial/:token — public; marks link as viewed and returns prefill data
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(
      'SELECT * FROM trial_invites WHERE token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired trial link' });
    }

    const trial = result.rows[0];

    // Track first view + increment view count
    await pool.query(
      `UPDATE trial_invites
       SET view_count = view_count + 1,
           viewed_at  = COALESCE(viewed_at, NOW())
       WHERE id = $1`,
      [trial.id]
    );

    res.json({
      trial: {
        email:       trial.email,
        firstName:   trial.first_name,
        lastName:    trial.last_name,
        companyName: trial.company_name,
        trialDays:   trial.trial_days,
        alreadyRegistered: !!trial.registered_at,
      },
    });
  } catch (err) {
    console.error('[trial] GET error:', err);
    res.status(500).json({ error: 'Failed to load trial info' });
  }
});

module.exports = router;
