export interface CountryRule {
  countryCode: string
  countryName: string
  postalCodeLabel: string
  stateLabel: string
  showStateField: boolean
  taxLabel: string
  companyNumberLabel: string
  defaultTaxRate: number
  defaultCurrency: 'DKK' | 'SEK' | 'NOK' | 'EUR' | 'GBP' | 'USD'
  /** BCP 47 locale for Intl currency formatting (same money rules as company country) */
  currencyDisplayLocale: string
  mapboxCountryFilter?: string
}

const DEFAULT_RULE: CountryRule = {
  countryCode: 'DK',
  countryName: 'Denmark',
  postalCodeLabel: 'Postal code',
  stateLabel: 'State/Region',
  showStateField: false,
  taxLabel: 'VAT',
  companyNumberLabel: 'CVR Number',
  defaultTaxRate: 25,
  defaultCurrency: 'DKK',
  currencyDisplayLocale: 'da-DK',
  mapboxCountryFilter: 'dk',
}

export const countryRules: Record<string, CountryRule> = {
  DK: DEFAULT_RULE,
  SE: {
    countryCode: 'SE',
    countryName: 'Sweden',
    postalCodeLabel: 'Postcode',
    stateLabel: 'County',
    showStateField: false,
    taxLabel: 'Moms',
    companyNumberLabel: 'Org.nr',
    defaultTaxRate: 25,
    defaultCurrency: 'SEK',
    mapboxCountryFilter: 'se',
  },
  NO: {
    countryCode: 'NO',
    countryName: 'Norway',
    postalCodeLabel: 'Postcode',
    stateLabel: 'County',
    showStateField: false,
    taxLabel: 'MVA',
    companyNumberLabel: 'Org.nr',
    defaultTaxRate: 25,
    defaultCurrency: 'NOK',
    currencyDisplayLocale: 'nb-NO',
    mapboxCountryFilter: 'no',
  },
  DE: {
    countryCode: 'DE',
    countryName: 'Germany',
    postalCodeLabel: 'PLZ',
    stateLabel: 'State',
    showStateField: true,
    taxLabel: 'VAT',
    companyNumberLabel: 'USt-IdNr.',
    defaultTaxRate: 19,
    defaultCurrency: 'EUR',
    mapboxCountryFilter: 'de',
  },
  US: {
    countryCode: 'US',
    countryName: 'United States',
    postalCodeLabel: 'ZIP code',
    stateLabel: 'State',
    showStateField: true,
    taxLabel: 'Sales tax',
    companyNumberLabel: 'EIN',
    defaultTaxRate: 0,
    defaultCurrency: 'USD',
    currencyDisplayLocale: 'en-US',
    mapboxCountryFilter: 'us',
  },
  GB: {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    postalCodeLabel: 'Postcode',
    stateLabel: 'County',
    showStateField: false,
    taxLabel: 'VAT',
    // Companies House registration number — separate from the VAT number.
    companyNumberLabel: 'Co. Reg. No.',
    defaultTaxRate: 20,
    defaultCurrency: 'GBP',
    currencyDisplayLocale: 'en-GB',
    mapboxCountryFilter: 'gb',
  },
}

export function getCountryRule(countryCode?: string | null): CountryRule {
  const code = String(countryCode || '').trim().toUpperCase()
  return countryRules[code] || DEFAULT_RULE
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

