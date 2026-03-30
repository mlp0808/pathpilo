'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
  PlayIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'

interface VideoGuide {
  id: number
  title: string
  description: string
  duration: string
  videoId: string
  languageCode: string
  sortOrder: number
  createdAt: string
}

const normalizeLang = (value: unknown): string => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw.startsWith('da')) return 'da'
  if (raw.startsWith('de')) return 'de'
  if (raw.startsWith('sv')) return 'sv'
  if (raw.startsWith('no') || raw.startsWith('nb') || raw.startsWith('nn')) return 'no'
  return 'en'
}

export default function AdminVideoGuidesPage() {
  const router = useRouter()
  const [videos, setVideos] = useState<VideoGuide[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingVideo, setEditingVideo] = useState<VideoGuide | null>(null)
  const [selectedLanguage, setSelectedLanguage] = useState('en')
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    duration: '0:00',
    videoId: '',
    languageCode: 'en',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('token')
      const userData = localStorage.getItem('user')

      if (!token || !userData) {
        router.push('/admin')
        return false
      }

      try {
        const user = JSON.parse(userData)
        if (user.role !== 'admin') {
          router.push('/admin')
          return false
        }
        return true
      } catch {
        router.push('/admin')
        return false
      }
    }

    if (checkAuth()) {
      setIsAuthenticated(true)
    }
  }, [router])

  const fetchVideos = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      if (!token) {
        setError('Not authenticated.')
        return
      }

      const response = await fetch(
        apiUrl(`/admin/video-guides?languageCode=${encodeURIComponent(selectedLanguage)}&language_code=${encodeURIComponent(selectedLanguage)}`),
        {
        headers: { Authorization: `Bearer ${token}` },
        }
      )
      const data = await response.json()

      if (response.ok) {
        const normalized = (Array.isArray(data.videos) ? data.videos : []).map((v: any) => ({
          ...v,
          languageCode: normalizeLang(v.languageCode || v.language_code || 'en'),
        }))
        // Frontend guard: if backend returns mixed languages, keep selected only.
        setVideos(normalized.filter((v: VideoGuide) => v.languageCode === selectedLanguage))
      } else {
        setError(data.error || 'Failed to fetch video guides')
      }
    } catch (err) {
      setError('Network error: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const openAddForm = () => {
    setEditingVideo(null)
    setFormData({ title: '', description: '', duration: '0:00', videoId: '', languageCode: selectedLanguage })
    setShowForm(true)
  }

  const openEditForm = (video: VideoGuide) => {
    setEditingVideo(video)
    setFormData({
      title: video.title,
      description: video.description || '',
      duration: video.duration || '0:00',
      videoId: video.videoId,
      languageCode: video.languageCode || 'en',
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingVideo(null)
    setFormData({ title: '', description: '', duration: '0:00', videoId: '', languageCode: selectedLanguage })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return

    setSaving(true)
    try {
      const url = editingVideo
        ? apiUrl(`/admin/video-guides/${editingVideo.id}`)
        : apiUrl('/admin/video-guides')
      const method = editingVideo ? 'PUT' : 'POST'
      const body = JSON.stringify({
        title: formData.title,
        description: formData.description,
        duration: formData.duration,
        videoId: formData.videoId,
        languageCode: formData.languageCode,
        language_code: formData.languageCode,
      })

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body,
      })

      const data = await response.json()

      if (response.ok) {
        closeForm()
        fetchVideos()
      } else {
        alert(data.error || 'Failed to save')
      }
    } catch (err) {
      alert('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this video guide?')) return

    const token = localStorage.getItem('token')
    if (!token) return

    try {
      const response = await fetch(apiUrl(`/admin/video-guides/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.ok) {
        fetchVideos()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to delete')
      }
    } catch {
      alert('Network error. Please try again.')
    }
  }

  useEffect(() => {
    if (isAuthenticated) fetchVideos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguage, isAuthenticated])

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="mt-2 text-gray-600">Verifying admin access...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">P</span>
              </div>
              <span className="text-xl font-bold text-gray-900">PathPilo Admin</span>
            </Link>
            <div className="flex items-center space-x-4">
              <Link href="/admin/overview" className="text-gray-600 hover:text-gray-900">
                Overview
              </Link>
              <Link href="/admin/users" className="text-gray-600 hover:text-gray-900">
                Users
              </Link>
              <Link href="/admin/companies" className="text-gray-600 hover:text-gray-900">
                Companies
              </Link>
              <Link href="/admin/video-guides" className="text-accent-600 hover:text-accent-700 font-medium">
                Video Guides
              </Link>
              <Link href="/admin/trials" className="text-gray-600 hover:text-gray-900">
                Trials
              </Link>
              <button
                onClick={() => {
                  localStorage.removeItem('token')
                  localStorage.removeItem('user')
                  router.push('/admin')
                }}
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Video Guides</h1>
            <p className="text-gray-600 mt-1">
              Manage videos shown in the Get Started modal by language
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
            >
              <option value="en">English</option>
              <option value="da">Danish</option>
              <option value="de">German</option>
              <option value="sv">Swedish</option>
              <option value="no">Norwegian</option>
            </select>
            <button
              onClick={openAddForm}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white font-medium rounded-lg transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Add video
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500" />
            <p className="mt-2 text-gray-600">Loading...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-800">{error}</p>
            <button
              onClick={fetchVideos}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Try again
            </button>
          </div>
        ) : videos.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <PlayIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No video guides yet.</p>
            <p className="text-sm text-gray-500 mb-6">
              Add videos to show in the Get Started modal. If no videos exist for a language, users will see English videos.
            </p>
            <button
              onClick={openAddForm}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white font-medium rounded-lg"
            >
              <PlusIcon className="w-5 h-5" />
              Add your first video
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {videos.map((video) => (
              <div
                key={video.id}
                className="bg-white rounded-lg border border-gray-200 p-4 flex items-start gap-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex-shrink-0 w-24 h-14 rounded-lg overflow-hidden bg-gray-200">
                  {video.videoId ? (
                    <img
                      src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <PlayIcon className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{video.title}</p>
                  {video.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{video.description}</p>
                  )}
                <p className="text-xs text-gray-400 mt-1">{video.duration} · {(video.languageCode || 'en').toUpperCase()}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openEditForm(video)}
                    className="p-2 text-gray-500 hover:text-accent-600 hover:bg-accent-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <PencilSquareIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(video.id)}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingVideo ? 'Edit video' : 'Add video'}
              </h2>
              <button
                onClick={closeForm}
                className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                  placeholder="e.g. Welcome to PathPilo"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500 resize-none"
                  placeholder="Short description shown under the title"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Language *</label>
                <select
                  value={formData.languageCode}
                  onChange={(e) => setFormData({ ...formData, languageCode: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                  required
                >
                  <option value="en">English</option>
                  <option value="da">Danish</option>
                  <option value="de">German</option>
                  <option value="sv">Swedish</option>
                  <option value="no">Norwegian</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                <input
                  type="text"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                  placeholder="e.g. 3:24"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">YouTube Video ID *</label>
                <input
                  type="text"
                  value={formData.videoId}
                  onChange={(e) => setFormData({ ...formData, videoId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                  placeholder="e.g. YE7VzlLtp-4 (from youtube.com/watch?v=...)"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  From a YouTube URL: youtube.com/watch?v=<strong>VIDEO_ID</strong>
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingVideo ? 'Update' : 'Add video'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
