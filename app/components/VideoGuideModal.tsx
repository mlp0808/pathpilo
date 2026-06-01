'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { PlayIcon, XMarkIcon } from '@heroicons/react/24/solid'
import { apiUrl } from '../utils/api'
import { useAppI18n } from './I18nProvider'
import {
  VIDEO_GUIDE_TOPICS,
  DEFAULT_VIDEO_GUIDE_TOPIC,
  normalizeVideoGuideTopic,
  topicLabel,
  type VideoGuideTopicId,
} from '../config/videoGuideTopics'

export interface VideoItem {
  id: string
  title: string
  description?: string
  duration: string
  videoId: string
  languageCode?: string
  thumbnail?: string
  guideLink?: string
  topic?: VideoGuideTopicId | string
}

const normalizeLang = (value: unknown): string => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw.startsWith('da')) return 'da'
  if (raw.startsWith('de')) return 'de'
  if (raw.startsWith('sv')) return 'sv'
  if (raw.startsWith('no') || raw.startsWith('nb') || raw.startsWith('nn')) return 'no'
  return 'en'
}

const DUMMY_VIDEOS: VideoItem[] = [
  {
    id: '1',
    title: 'Welcome to PathPilo',
    duration: '3:24',
    videoId: 'YE7VzlLtp-4',
    topic: 'getting_started',
    thumbnail: 'https://img.youtube.com/vi/YE7VzlLtp-4/maxresdefault.jpg',
  },
  {
    id: '2',
    title: 'Creating your first job',
    duration: '2:15',
    videoId: 'YE7VzlLtp-4',
    topic: 'getting_started',
    thumbnail: 'https://img.youtube.com/vi/YE7VzlLtp-4/maxresdefault.jpg',
  },
  {
    id: '3',
    title: 'Adding and managing clients',
    duration: '4:02',
    videoId: 'YE7VzlLtp-4',
    topic: 'getting_started',
    thumbnail: 'https://img.youtube.com/vi/YE7VzlLtp-4/maxresdefault.jpg',
  },
  {
    id: '4',
    title: 'Sending invoices',
    duration: '3:41',
    videoId: 'YE7VzlLtp-4',
    topic: 'invoicing',
    thumbnail: 'https://img.youtube.com/vi/YE7VzlLtp-4/maxresdefault.jpg',
  },
  {
    id: '5',
    title: 'Managing your team',
    duration: '2:58',
    videoId: 'YE7VzlLtp-4',
    topic: 'settings',
    thumbnail: 'https://img.youtube.com/vi/YE7VzlLtp-4/maxresdefault.jpg',
  },
  {
    id: '6',
    title: 'Using the dashboard',
    duration: '3:12',
    videoId: 'YE7VzlLtp-4',
    topic: 'route_planning',
    thumbnail: 'https://img.youtube.com/vi/YE7VzlLtp-4/maxresdefault.jpg',
  },
]

function firstVideoForTopic(list: VideoItem[], topic: VideoGuideTopicId): VideoItem | null {
  return list.find((v) => normalizeVideoGuideTopic(v.topic) === topic) || list[0] || null
}

interface VideoGuideModalProps {
  isOpen: boolean
  onClose: () => void
  videos?: VideoItem[]
}

export default function VideoGuideModal({
  isOpen,
  onClose,
  videos: videosProp,
}: VideoGuideModalProps) {
  const { t } = useAppI18n()
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(null)
  const [selectedTopic, setSelectedTopic] = useState<VideoGuideTopicId>(DEFAULT_VIDEO_GUIDE_TOPIC)
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    setSelectedTopic(DEFAULT_VIDEO_GUIDE_TOPIC)

    if (videosProp && videosProp.length > 0) {
      const normalized = videosProp.map((v) => ({
        ...v,
        topic: normalizeVideoGuideTopic(v.topic),
      }))
      setVideos(normalized)
      setCurrentVideo(firstVideoForTopic(normalized, DEFAULT_VIDEO_GUIDE_TOPIC))
      setLoading(false)
      return
    }

    setLoading(true)
    const languageCode = (() => {
      try {
        const userRaw = localStorage.getItem('user')
        if (userRaw) {
          const parsed = JSON.parse(userRaw) as Record<string, unknown>
          const v = parsed.languageCode || parsed.language_code || parsed.language
          if (typeof v === 'string' && v.trim()) return v.trim()
        }
      } catch {
        // ignore and fallback
      }
      return document.documentElement.lang || 'en'
    })()
    const wantedLang = normalizeLang(languageCode)
    fetch(apiUrl(`/video-guides?languageCode=${encodeURIComponent(wantedLang)}&language_code=${encodeURIComponent(wantedLang)}`))
      .then((res) => res.json())
      .then((data) => {
        const listRaw = Array.isArray(data.videos) ? data.videos : []
        const list: VideoItem[] = listRaw.map((v: VideoItem & { language_code?: string }) => ({
          ...v,
          languageCode: normalizeLang(v.languageCode || v.language_code || 'en'),
          topic: normalizeVideoGuideTopic(v.topic),
        }))
        const exact = list.filter((v) => v.languageCode === wantedLang)
        const english = list.filter((v) => v.languageCode === 'en')
        const chosen = exact.length > 0 ? exact : english.length > 0 ? english : list
        if (chosen.length > 0) {
          setVideos(chosen)
          setCurrentVideo(firstVideoForTopic(chosen, DEFAULT_VIDEO_GUIDE_TOPIC))
        } else {
          setVideos(DUMMY_VIDEOS)
          setCurrentVideo(firstVideoForTopic(DUMMY_VIDEOS, DEFAULT_VIDEO_GUIDE_TOPIC))
        }
      })
      .catch(() => {
        setVideos(DUMMY_VIDEOS)
        setCurrentVideo(firstVideoForTopic(DUMMY_VIDEOS, DEFAULT_VIDEO_GUIDE_TOPIC))
      })
      .finally(() => setLoading(false))
  }, [isOpen, videosProp])

  const displayVideos = videos.length > 0 ? videos : DUMMY_VIDEOS

  const filteredVideos = useMemo(
    () => displayVideos.filter((v) => normalizeVideoGuideTopic(v.topic) === selectedTopic),
    [displayVideos, selectedTopic],
  )

  useEffect(() => {
    if (!isOpen || filteredVideos.length === 0) return
    const stillVisible = currentVideo && filteredVideos.some((v) => v.id === currentVideo.id)
    if (!stillVisible) {
      setCurrentVideo(filteredVideos[0])
    }
  }, [selectedTopic, filteredVideos, isOpen, currentVideo])

  if (!isOpen || !mounted) return null

  const displayCurrent = currentVideo || filteredVideos[0] || displayVideos[0]

  const modal = (
    <div className="fixed inset-0 z-[9999]" style={{ isolation: 'isolate' }}>
      <div
        className="absolute inset-0 bg-primary-500/40 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
        <div
          className="w-full max-w-3xl bg-page rounded-2xl shadow-2xl overflow-hidden animate-slideDown flex flex-col max-h-[90vh] border border-gray-200/80"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-4 px-5 py-3.5 bg-primary-500 border-b border-primary-600/50">
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm leading-snug">
                {t('app.videoGuide.headerTitle', 'Need help using the system?')}
              </p>
              <p className="text-white/70 text-xs mt-0.5">
                {t('app.videoGuide.headerSubtitle', 'Check out our help portal for guides and articles.')}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <a
                href="https://help.pathpilo.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 bg-white text-primary-700 hover:bg-white/90 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shadow-sm"
              >
                {t('app.videoGuide.visitPortal', 'Visit help portal →')}
              </a>
              <button
                onClick={onClose}
                className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200"
                aria-label={t('app.modal.close', 'Close')}
              >
                <span className="text-xs font-medium">{t('app.modal.close', 'Close')}</span>
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-5 bg-white/60 border-b border-gray-200/60">
            {loading ? (
              <div className="aspect-video rounded-xl bg-primary-500/10 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-500 border-t-transparent" />
              </div>
            ) : displayCurrent ? (
              <>
                <div className="relative aspect-video rounded-xl overflow-hidden bg-primary-500/10 ring-1 ring-gray-200/80 shadow-sm">
                  <iframe
                    key={displayCurrent.id}
                    src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(displayCurrent.videoId)}`}
                    title={displayCurrent.title}
                    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="absolute inset-0 w-full h-full"
                  />
                </div>
                <p className="mt-4 text-primary-800 font-medium text-base">{displayCurrent.title}</p>
                {displayCurrent.description && (
                  <p className="mt-1 text-sm text-gray-600">{displayCurrent.description}</p>
                )}
              </>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-3">
              {t('app.videoGuide.moreGuides', 'More guides')}
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
              {VIDEO_GUIDE_TOPICS.map((topic) => {
                const active = selectedTopic === topic.id
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => setSelectedTopic(topic.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                    }`}
                  >
                    {topicLabel(topic.id, t)}
                  </button>
                )
              })}
            </div>

            {filteredVideos.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                {t('app.videoGuide.noVideosForTopic', 'No videos in this topic yet.')}
              </p>
            ) : (
              <div className="space-y-1.5">
                {filteredVideos.map((video) => {
                  const isActive = displayCurrent?.id === video.id
                  const videoTopic = normalizeVideoGuideTopic(video.topic)
                  return (
                    <div
                      key={video.id}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                        isActive
                          ? 'bg-accent-50 ring-1 ring-accent-500/40 shadow-sm'
                          : 'bg-white/80 hover:bg-white border border-gray-200/60 hover:border-gray-300/80 hover:shadow-sm'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setCurrentVideo(video)}
                        className="flex items-center gap-4 flex-1 min-w-0 text-left"
                      >
                        <div className="relative flex-shrink-0 w-16 h-10 rounded-lg overflow-hidden bg-gray-200/80">
                          <img
                            src={video.thumbnail || `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                              <PlayIcon className="w-4 h-4 text-accent-500 ml-0.5" />
                            </div>
                          </div>
                          <span className="absolute bottom-1 right-1 text-[10px] font-medium text-white bg-black/60 px-1.5 py-0.5 rounded">
                            {video.duration}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`font-medium text-sm truncate ${
                              isActive ? 'text-primary-800' : 'text-gray-700 group-hover:text-primary-800'
                            }`}
                          >
                            {video.title}
                          </p>
                          {video.description && (
                            <p className="text-xs text-gray-500 truncate mt-0.5">{video.description}</p>
                          )}
                          <span className="mt-1 inline-block rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                            {topicLabel(videoTopic, t)}
                          </span>
                        </div>
                      </button>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isActive && (
                          <span className="text-[11px] font-semibold text-accent-600 bg-accent-500/15 px-2.5 py-1 rounded-lg">
                            {t('app.videoGuide.nowPlaying', 'Now playing')}
                          </span>
                        )}
                        {video.guideLink && (
                          <a
                            href={video.guideLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-semibold text-primary-600 hover:text-primary-700 bg-primary-500/10 hover:bg-primary-500/20 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
                          >
                            {t('app.videoGuide.seeFullGuide', 'See full guide →')}
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
