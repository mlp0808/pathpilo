const express = require('express');
const { pool } = require('../utils/database');

const router = express.Router();

// GET /api/video-guides - Public, no auth. Returns all video guides for the Get Started modal.
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, title, description, duration, video_id, sort_order, created_at
      FROM video_guides
      ORDER BY sort_order ASC, created_at ASC
    `);

    const videos = result.rows.map((row) => ({
      id: String(row.id),
      title: row.title,
      description: row.description || '',
      duration: row.duration || '0:00',
      videoId: row.video_id,
      thumbnail: row.video_id
        ? `https://img.youtube.com/vi/${row.video_id}/maxresdefault.jpg`
        : undefined,
    }));

    res.json({ videos });
  } catch (error) {
    console.error('Error fetching video guides:', error);
    res.status(500).json({ error: 'Failed to fetch video guides' });
  }
});

module.exports = router;
