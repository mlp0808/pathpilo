'use client'

import { useState, useEffect, useLayoutEffect } from 'react'
import { apiUrl } from '../utils/api'
import { getStoredCompanyCountryCode, rememberCompanyCountryCode } from '../utils/companyCountry'

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
    const code = getStoredCompanyCountryCode()
    if (code) setCountryCode(code)
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
        const code = String(data.company?.countryCode || 'DK').toUpperCase()
        setCountryCode(code)
        rememberCompanyCountryCode(code, data.company?.id)
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
