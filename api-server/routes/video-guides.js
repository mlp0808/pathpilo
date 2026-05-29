const express = require('express');
const { pool } = require('../utils/database');

const router = express.Router();

const SUPPORTED_LANGUAGES = new Set(['en', 'da', 'de', 'sv', 'no']);

function normalizeLanguageCode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'en';
  if (raw.startsWith('da')) return 'da';
  if (raw.startsWith('de')) return 'de';
  if (raw.startsWith('sv')) return 'sv';
  if (raw.startsWith('no') || raw.startsWith('nb') || raw.startsWith('nn')) return 'no';
  return 'en';
}

// GET /api/video-guides - Public, no auth. Returns all video guides for the Get Started modal.
router.get('/', async (req, res) => {
  try {
    const requested = normalizeLanguageCode(
      req.query.languageCode || req.query.language_code || req.query.lang || req.headers['accept-language']
    );
    const languageCode = SUPPORTED_LANGUAGES.has(requested) ? requested : 'en';

    let result = await pool.query(
      `SELECT id, title, description, duration, video_id, sort_order, created_at, language_code, guide_link
       FROM video_guides
       WHERE language_code = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [languageCode]
    );

    // Always fallback to English if no videos exist for requested language.
    if (result.rows.length === 0 && languageCode !== 'en') {
      result = await pool.query(
        `SELECT id, title, description, duration, video_id, sort_order, created_at, language_code, guide_link
         FROM video_guides
         WHERE language_code = 'en'
         ORDER BY sort_order ASC, created_at ASC`
      );
    }

    const videos = result.rows.map((row) => ({
      id: String(row.id),
      title: row.title,
      description: row.description || '',
      duration: row.duration || '0:00',
      videoId: row.video_id,
      languageCode: row.language_code || 'en',
      thumbnail: row.video_id
        ? `https://img.youtube.com/vi/${row.video_id}/maxresdefault.jpg`
        : undefined,
      guideLink: row.guide_link || undefined,
    }));

    res.json({ videos });
  } catch (error) {
    console.error('Error fetching video guides:', error);
    res.status(500).json({ error: 'Failed to fetch video guides' });
  }
});

module.exports = router;
