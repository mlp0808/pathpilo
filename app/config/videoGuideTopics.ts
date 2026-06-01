/** Fixed topic tags for in-app video guides. Keep in sync with api-server/utils/videoGuideTopics.js */

export const VIDEO_GUIDE_TOPICS = [
  {
    id: 'getting_started',
    labelKey: 'app.videoGuide.topic.gettingStarted',
    label: 'Getting started',
  },
  {
    id: 'invoicing',
    labelKey: 'app.videoGuide.topic.invoicing',
    label: 'Invoicing',
  },
  {
    id: 'settings',
    labelKey: 'app.videoGuide.topic.settings',
    label: 'Settings',
  },
  {
    id: 'route_planning',
    labelKey: 'app.videoGuide.topic.routePlanning',
    label: 'Route planning',
  },
  {
    id: 'quotes_leads',
    labelKey: 'app.videoGuide.topic.quotesLeads',
    label: 'Quotes & leads',
  },
] as const

export type VideoGuideTopicId = (typeof VIDEO_GUIDE_TOPICS)[number]['id']

export const DEFAULT_VIDEO_GUIDE_TOPIC: VideoGuideTopicId = 'getting_started'

export function normalizeVideoGuideTopic(value: unknown): VideoGuideTopicId {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[\s-]+/g, '_')
  const found = VIDEO_GUIDE_TOPICS.find((t) => t.id === raw)
  return found ? found.id : DEFAULT_VIDEO_GUIDE_TOPIC
}

export function topicLabel(
  topicId: string,
  t?: (key: string, fallback: string) => string,
): string {
  const entry = VIDEO_GUIDE_TOPICS.find((tpc) => tpc.id === topicId)
  if (!entry) return topicId
  return t ? t(entry.labelKey, entry.label) : entry.label
}
