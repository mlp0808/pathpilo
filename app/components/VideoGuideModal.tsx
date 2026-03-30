'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PlayIcon, XMarkIcon } from '@heroicons/react/24/solid'
import { apiUrl } from '../utils/api'
import { useAppI18n } from './I18nProvider'

export interface VideoItem {
  id: string
  title: string
  description?: string
  duration: string
  videoId: string
  languageCode?: string
  thumbnail?: string
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
    thumbnail: 'https://img.youtube.com/vi/YE7VzlLtp-4/maxresdefault.jpg',
  },
  {
    id: '2',
    title: 'Creating your first job',
    duration: '2:15',
    videoId: 'YE7VzlLtp-4',
    thumbnail: 'https://img.youtube.com/vi/YE7VzlLtp-4/maxresdefault.jpg',
  },
  {
    id: '3',
    title: 'Adding and managing clients',
    duration: '4:02',
    videoId: 'YE7VzlLtp-4',
    thumbnail: 'https://img.youtube.com/vi/YE7VzlLtp-4/maxresdefault.jpg',
  },
  {
    id: '4',
    title: 'Sending invoices',
    duration: '3:41',
    videoId: 'YE7VzlLtp-4',
    thumbnail: 'https://img.youtube.com/vi/YE7VzlLtp-4/maxresdefault.jpg',
  },
  {
    id: '5',
    title: 'Managing your team',
    duration: '2:58',
    videoId: 'YE7VzlLtp-4',
    thumbnail: 'https://img.youtube.com/vi/YE7VzlLtp-4/maxresdefault.jpg',
  },
  {
    id: '6',
    title: 'Using the dashboard',
    duration: '3:12',
    videoId: 'YE7VzlLtp-4',
    thumbnail: 'https://img.youtube.com/vi/YE7VzlLtp-4/maxresdefault.jpg',
  },
]

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
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    if (videosProp && videosProp.length > 0) {
      setVideos(videosProp)
      setCurrentVideo(videosProp[0])
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
        }))
        const exact = list.filter((v) => v.languageCode === wantedLang)
        const english = list.filter((v) => v.languageCode === 'en')
        const chosen = exact.length > 0 ? exact : english.length > 0 ? english : list
        if (chosen.length > 0) {
          setVideos(chosen)
          setCurrentVideo(chosen[0])
        } else {
          setVideos(DUMMY_VIDEOS)
          setCurrentVideo(DUMMY_VIDEOS[0])
        }
      })
      .catch(() => {
        setVideos(DUMMY_VIDEOS)
        setCurrentVideo(DUMMY_VIDEOS[0])
      })
      .finally(() => setLoading(false))
  }, [isOpen, videosProp])

  if (!isOpen || !mounted) return null

  const displayVideos = videos.length > 0 ? videos : DUMMY_VIDEOS
  const displayCurrent = currentVideo || displayVideos[0]

  const modal = (
    <div className="fixed inset-0 z-[9999]" style={{ isolation: 'isolate' }}>
      {/* Backdrop - soft, on-brand */}
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
          {/* Header - brand dark teal */}
          <div className="flex items-center justify-between px-6 py-4 bg-primary-500 border-b border-primary-600/50">
            <h2 className="text-lg font-semibold text-white tracking-tight">
              {t('app.sidebar.getStarted', 'Get started')}
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200"
              aria-label={t('app.modal.close', 'Close')}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Main video player - no autoplay */}
          <div className="p-4 sm:p-5 bg-white/60 border-b border-gray-200/60">
            {loading ? (
              <div className="aspect-video rounded-xl bg-primary-500/10 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-500 border-t-transparent" />
              </div>
            ) : (
              <>
                <div className="relative aspect-video rounded-xl overflow-hidden bg-primary-500/10 ring-1 ring-gray-200/80 shadow-sm">
                  <iframe
                    key={displayCurrent.id}
                    src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(displayCurrent.videoId)}`}
                    title={displayCurrent.title}
                    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    // YouTube Error 153: embed needs a non-empty referrer; strict-origin matches YouTube’s expectations
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="absolute inset-0 w-full h-full"
                  />
                </div>
                <p className="mt-4 text-primary-800 font-medium text-base">
                  {displayCurrent.title}
                </p>
                {displayCurrent.description && (
                  <p className="mt-1 text-sm text-gray-600">{displayCurrent.description}</p>
                )}
              </>
            )}
          </div>

          {/* Video list - clean, modern */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-3">
              More guides
            </p>
            <div className="space-y-1.5">
              {displayVideos.map((video) => {
                const isActive = displayCurrent.id === video.id
                return (
                  <button
                    key={video.id}
                    onClick={() => setCurrentVideo(video)}
                    className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-left transition-all duration-200 group ${
                      isActive
                        ? 'bg-accent-50 ring-1 ring-accent-500/40 shadow-sm'
                        : 'bg-white/80 hover:bg-white border border-gray-200/60 hover:border-gray-300/80 hover:shadow-sm'
                    }`}
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
                    </div>
                    {isActive && (
                      <span className="flex-shrink-0 text-[11px] font-semibold text-accent-600 bg-accent-500/15 px-2.5 py-1 rounded-lg">
                        {t('app.videoGuide.nowPlaying', 'Now playing')}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
