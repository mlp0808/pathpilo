/**
 * Active company's ISO country code from the cached session, without a network call.
 * Returns '' on the server or when nothing is cached.
 */
export function getStoredCompanyCountryCode(): string {
  if (typeof window === 'undefined') return ''
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const fromUser =
      user.activeCompany?.countryCode ||
      (Array.isArray(user.companies)
        ? user.companies.find((c: { id?: number }) => c?.id === user.companyId)?.countryCode
        : undefined)
    if (fromUser) return String(fromUser).toUpperCase()
    const company = JSON.parse(localStorage.getItem('company') || 'null')
    return company?.countryCode ? String(company.countryCode).toUpperCase() : ''
  } catch {
    return ''
  }
}

/** `&country=xx` for Mapbox geocoding — limits search to the given (or active company's) country. */
export function mapboxCountryParam(countryCode?: string | null): string {
  const code = String(countryCode || getStoredCompanyCountryCode() || '').trim().toLowerCase()
  return /^[a-z]{2}$/.test(code) ? `&country=${code}` : ''
}

/** Writes the active company's country into the cached session so later reads see it. */
export function rememberCompanyCountryCode(countryCode: string, companyId?: number | null): void {
  if (typeof window === 'undefined' || !countryCode) return
  const code = countryCode.toUpperCase()
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    if (user && typeof user === 'object') {
      const id = companyId ?? user.companyId
      if (user.activeCompany && (id == null || user.activeCompany.id == null || user.activeCompany.id === id)) {
        user.activeCompany = { ...user.activeCompany, countryCode: code }
      }
      if (Array.isArray(user.companies)) {
        user.companies = user.companies.map((c: { id?: number }) =>
          c?.id === id ? { ...c, countryCode: code } : c,
        )
      }
      localStorage.setItem('user', JSON.stringify(user))
    }
    const company = JSON.parse(localStorage.getItem('company') || 'null')
    if (company && typeof company === 'object' && (companyId == null || company.id === companyId)) {
      localStorage.setItem('company', JSON.stringify({ ...company, countryCode: code }))
    }
  } catch {
    /* ignore */
  }
}
