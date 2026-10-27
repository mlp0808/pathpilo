import { getCountryRule, isSupportedCountry, type BankScheme } from '../config/countryRules'

/** Bank transfer config stored on company_integrations.config */
export type BankTransferConfig = {
  accountHolder?: string
  iban?: string
  accountNumber?: string
  /** GB: sort code · US: routing number · DK: reg. no. */
  registrationNumber?: string
}

/**
 * How the company's clients pay by bank transfer:
 * gb = sort code + account no., us = routing + account no.,
 * dk = reg. no. + account no. or IBAN, iban = IBAN.
 */
export function bankSchemeFor(countryCode?: string | null): BankScheme {
  return isSupportedCountry(countryCode) ? getCountryRule(countryCode).bank : 'iban'
}

export function usesUkBankFields(countryCode?: string | null): boolean {
  return bankSchemeFor(countryCode) === 'gb'
}

function normalizeDigits(value: string): string {
  return String(value || '').replace(/[\s-]/g, '')
}

export function isValidUkSortCode(value: string): boolean {
  return /^\d{6}$/.test(normalizeDigits(value))
}

export function isValidUkAccountNumber(value: string): boolean {
  const digits = normalizeDigits(value)
  return /^\d{6,10}$/.test(digits)
}

export function isValidUsRoutingNumber(value: string): boolean {
  return /^\d{9}$/.test(normalizeDigits(value))
}

export function isValidUsAccountNumber(value: string): boolean {
  return /^\d{4,17}$/.test(normalizeDigits(value))
}

export function isValidDkRegNumber(value: string): boolean {
  return /^\d{4}$/.test(normalizeDigits(value))
}

export function isValidDkAccountNumber(value: string): boolean {
  return /^\d{6,10}$/.test(normalizeDigits(value))
}

/** True when bank transfer can be enabled for this company country. */
export function isBankTransferConfigComplete(
  config: BankTransferConfig,
  countryCode?: string | null,
): boolean {
  return validateBankTransferForEnable(config, countryCode) === null
}

/** Human-readable validation error when enabling bank transfer, or null if OK. */
export function validateBankTransferForEnable(
  config: BankTransferConfig,
  countryCode?: string | null,
): string | null {
  const holder = String(config.accountHolder || '').trim()
  if (!holder) return 'Account holder is required before enabling.'

  const regNo = String(config.registrationNumber || '').trim()
  const accountNo = String(config.accountNumber || '').trim()
  const iban = String(config.iban || '').trim()

  switch (bankSchemeFor(countryCode)) {
    case 'gb':
      if (!regNo || !accountNo) return 'Sort code and account number are required before enabling.'
      if (!isValidUkSortCode(regNo)) return 'Sort code must be 6 digits (e.g. 12-34-56).'
      if (!isValidUkAccountNumber(accountNo)) return 'Account number must be 6–10 digits.'
      return null
    case 'us':
      if (!regNo || !accountNo) return 'Routing number and account number are required before enabling.'
      if (!isValidUsRoutingNumber(regNo)) return 'Routing number must be 9 digits.'
      if (!isValidUsAccountNumber(accountNo)) return 'Account number must be 4–17 digits.'
      return null
    case 'dk':
      if (iban) return null
      if (!regNo && !accountNo) return 'Add a reg. no. and account number, or an IBAN, before enabling.'
      if (!isValidDkRegNumber(regNo)) return 'Reg. no. must be 4 digits.'
      if (!isValidDkAccountNumber(accountNo)) return 'Account number must be 6–10 digits.'
      return null
    default:
      if (!iban) return 'IBAN is required before enabling.'
      return null
  }
}
