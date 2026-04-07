'use client'

const OVERWATCH_BACKUP_TOKEN_KEY = 'overwatch_admin_token_backup'
const OVERWATCH_BACKUP_USER_KEY = 'overwatch_admin_user_backup'
const OVERWATCH_ACTIVE_KEY = 'overwatch_active'

export function isOverwatchActive(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(OVERWATCH_ACTIVE_KEY) === '1'
}

export function startOverwatchSession(nextToken: string, nextUser: unknown): void {
  if (typeof window === 'undefined') return
  const currentToken = localStorage.getItem('token')
  const currentUser = localStorage.getItem('user')
  if (currentToken && currentUser) {
    localStorage.setItem(OVERWATCH_BACKUP_TOKEN_KEY, currentToken)
    localStorage.setItem(OVERWATCH_BACKUP_USER_KEY, currentUser)
  }
  localStorage.setItem('token', nextToken)
  localStorage.setItem('user', JSON.stringify(nextUser))
  localStorage.setItem(OVERWATCH_ACTIVE_KEY, '1')
}

export function stopOverwatchSession(): boolean {
  if (typeof window === 'undefined') return false
  const backupToken = localStorage.getItem(OVERWATCH_BACKUP_TOKEN_KEY)
  const backupUser = localStorage.getItem(OVERWATCH_BACKUP_USER_KEY)
  if (!backupToken || !backupUser) return false

  localStorage.setItem('token', backupToken)
  localStorage.setItem('user', backupUser)
  localStorage.removeItem(OVERWATCH_BACKUP_TOKEN_KEY)
  localStorage.removeItem(OVERWATCH_BACKUP_USER_KEY)
  localStorage.removeItem(OVERWATCH_ACTIVE_KEY)
  return true
}
