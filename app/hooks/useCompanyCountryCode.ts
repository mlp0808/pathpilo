'use client'

import { useState, useEffect, useLayoutEffect } from 'react'
import { apiUrl } from '../utils/api'

export type CompanyCountryUser = {
  companyId?: number | null
  activeCompany?: { countryCode?: string; id?: number } | null
  companies?: Array<{ id?: number; countryCode?: string }>
} | null

/**
 * Resolves ISO country code for the active company (DB + localStorage).
 * Drives currency display via `formatMoney` / `getCountryRule` everywhere in the app.
 */
export function useCompanyCountryCode(user?: CompanyCountryUser): string {
  const [countryCode, setCountryCode] = useState('DK')

  useLayoutEffect(() => {
    try {
      const rawCompany = localStorage.getItem('company')
      if (rawCompany) {
        const c = JSON.parse(rawCompany)
        if (c?.countryCode) {
          setCountryCode(String(c.countryCode))
          return
        }
      }
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      const code =
        u.activeCompany?.countryCode ||
        (Array.isArray(u.companies)
          ? u.companies.find((co: { id?: number }) => co?.id === u.companyId)?.countryCode
          : undefined)
      if (code) setCountryCode(String(code))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(apiUrl('/companies/profile'), {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        const code = data.company?.countryCode || 'DK'
        setCountryCode(String(code))
      } catch {
        /* keep cached */
      }
    }
    load()
  }, [])

  useEffect(() => {
    const c = user?.activeCompany?.countryCode
    if (c) setCountryCode(String(c))
  }, [user])

  return countryCode
}
