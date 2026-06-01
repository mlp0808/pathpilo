/** Fixed topic tags for in-app video guides. Keep in sync with app/config/videoGuideTopics.ts */
const VIDEO_GUIDE_TOPICS = [
  'getting_started',
  'invoicing',
  'settings',
  'route_planning',
  'quotes_leads',
]

const DEFAULT_VIDEO_GUIDE_TOPIC = 'getting_started'

function normalizeVideoGuideTopic(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[\s-]+/g, '_')
  if (VIDEO_GUIDE_TOPICS.includes(raw)) return raw
  return DEFAULT_VIDEO_GUIDE_TOPIC
}

module.exports = {
  VIDEO_GUIDE_TOPICS,
  DEFAULT_VIDEO_GUIDE_TOPIC,
  normalizeVideoGuideTopic,
}
