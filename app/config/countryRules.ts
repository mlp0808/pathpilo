import countryData from '@/shared/countries.json'

export type CurrencyCode = 'DKK' | 'SEK' | 'NOK' | 'EUR' | 'GBP' | 'USD'

/** Postal fields shown after the street line, in the order the country writes them. */
export type LocalityField = 'zip' | 'city' | 'state'

/** How bank details are collected for bank-transfer payments. */
export type BankScheme = 'iban' | 'gb' | 'us' | 'dk'

export interface CountryAddressRule {
  order: LocalityField[]
  streetLabel: string
  streetPlaceholder: string
  postalLabel: string
  postalPlaceholder: string
  cityLabel: string
  cityPlaceholder: string
  stateLabel?: string
  stateRequired?: boolean
  /** e.g. "{zip} {city}" or "{city}, {state} {zip}" */
  localityFormat: string
  /** [code, name] pairs; only countries that use a state/region on addresses have this. */
  states?: [string, string][]
}

export interface CountryRule {
  countryCode: string
  countryName: string
  flag: string
  postalCodeLabel: string
  stateLabel: string
  showStateField: boolean
  /** Tax name shown in the app UI. */
  taxLabel: string
  /** Tax name printed on invoices and offers (local legal term, e.g. Moms, MVA, USt.). */
  documentTaxLabel: string
  companyNumberLabel: string
  companyNumberPlaceholder: string
  /** Whether a separate VAT registration number is normally used in this country. */
  showVatNumber: boolean
  vatNumberLabel: string
  vatNumberPlaceholder: string
  defaultTaxRate: number
  defaultCurrency: CurrencyCode
  /** BCP 47 locale for Intl currency and number formatting. */
  currencyDisplayLocale: string
  mapboxCountryFilter: string
  timezone: string
  callingCode: string
  phonePlaceholder: string
  bank: BankScheme
  address: CountryAddressRule
}

type RawCountry = (typeof countryData.countries)[keyof typeof countryData.countries]

function toRule(code: string, raw: RawCountry): CountryRule {
  const address = raw.address as unknown as CountryAddressRule
  return {
    countryCode: code,
    countryName: raw.name,
    flag: raw.flag,
    postalCodeLabel: address.postalLabel,
    stateLabel: address.stateLabel || 'State/Region',
    showStateField: Array.isArray(address.states) && address.states.length > 0,
    taxLabel: raw.tax.label,
    documentTaxLabel: raw.tax.documentLabel,
    companyNumberLabel: raw.companyNumber.label,
    companyNumberPlaceholder: raw.companyNumber.placeholder,
    showVatNumber: raw.vatNumber.show,
    vatNumberLabel: raw.vatNumber.label,
    vatNumberPlaceholder: raw.vatNumber.placeholder,
    defaultTaxRate: raw.tax.defaultRate,
    defaultCurrency: raw.currency as CurrencyCode,
    currencyDisplayLocale: raw.locale,
    mapboxCountryFilter: code.toLowerCase(),
    timezone: raw.timezone,
    callingCode: raw.callingCode,
    phonePlaceholder: raw.phonePlaceholder,
    bank: raw.bank as BankScheme,
    address,
  }
}

export const DEFAULT_COUNTRY_CODE = countryData.defaultCountry

export const countryRules: Record<string, CountryRule> = Object.fromEntries(
  Object.entries(countryData.countries).map(([code, raw]) => [code, toRule(code, raw as RawCountry)]),
)

/** Countries a company can operate in, in the order the picker shows them. */
export const SUPPORTED_COUNTRIES: CountryRule[] = countryData.pickerOrder.map((code) => countryRules[code])

export function isSupportedCountry(countryCode?: string | null): boolean {
  return Boolean(countryRules[String(countryCode || '').trim().toUpperCase()])
}

export function getCountryRule(countryCode?: string | null): CountryRule {
  const code = String(countryCode || '').trim().toUpperCase()
  return countryRules[code] || countryRules[DEFAULT_COUNTRY_CODE]
}

/** Full state name for a code (e.g. CA -> California); returns the input when unknown. */
export function stateName(countryCode: string | null | undefined, state: string | null | undefined): string {
  const code = String(state || '').trim()
  if (!code) return ''
  const match = getCountryRule(countryCode).address.states?.find(([c]) => c === code.toUpperCase())
  return match ? match[1] : code
}

/**
 * The postal line after the street, written the way the country does it:
 * "2100 Copenhagen", "London SW1A 1AA", "Austin, TX 78701".
 */
export function formatLocality(
  parts: { zip?: string | null; city?: string | null; state?: string | null },
  countryCode?: string | null,
): string {
  const rule = getCountryRule(countryCode)
  const zip = String(parts.zip || '').trim()
  const city = String(parts.city || '').trim()
  const state = String(parts.state || '').trim()
  return rule.address.localityFormat
    .replace('{zip}', zip)
    .replace('{city}', city)
    .replace('{state}', state)
    .replace(/,\s*(?=,|$)/g, '')
    .replace(/^\s*,\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Street + locality on one line, e.g. "123 Main St, Austin, TX 78701". */
export function formatAddressLine(
  parts: { address?: string | null; zip?: string | null; city?: string | null; state?: string | null },
  countryCode?: string | null,
): string {
  const street = String(parts.address || '').trim()
  const locality = formatLocality(parts, countryCode)
  if (street && locality) return `${street}, ${locality}`
  return street || locality
}

/**
 * Format a number as money using the company's country (currency + locale).
 * Use this anywhere amounts are shown so UI matches Business / invoice defaults.
 */
export function formatMoney(amount: number, countryCode?: string | null): string {
  const rule = getCountryRule(countryCode)
  const n = Number(amount) || 0
  return new Intl.NumberFormat(rule.currencyDisplayLocale, {
    style: 'currency',
    currency: rule.defaultCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

/** Money with decimals in an explicit currency, formatted the company country's way. */
export function formatMoneyExact(amount: number, currency: string, countryCode?: string | null): string {
  const rule = getCountryRule(countryCode)
  const n = Number(amount) || 0
  try {
    return new Intl.NumberFormat(rule.currencyDisplayLocale, {
      style: 'currency',
      currency: currency || rule.defaultCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)
  } catch {
    return `${n.toFixed(2)} ${currency || rule.defaultCurrency}`
  }
}
