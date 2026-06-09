/** Bank transfer config stored on company_integrations.config */
export type BankTransferConfig = {
  accountHolder?: string
  iban?: string
  accountNumber?: string
  registrationNumber?: string
}

export function usesUkBankFields(countryCode?: string | null): boolean {
  return String(countryCode || '').trim().toUpperCase() === 'GB'
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

/** True when bank transfer can be enabled for this company country. */
export function isBankTransferConfigComplete(
  config: BankTransferConfig,
  countryCode?: string | null,
): boolean {
  const holder = String(config.accountHolder || '').trim()
  if (!holder) return false

  if (usesUkBankFields(countryCode)) {
    return (
      isValidUkSortCode(String(config.registrationNumber || '')) &&
      isValidUkAccountNumber(String(config.accountNumber || ''))
    )
  }

  return Boolean(String(config.iban || '').trim())
}

/** Human-readable validation error when enabling bank transfer, or null if OK. */
export function validateBankTransferForEnable(
  config: BankTransferConfig,
  countryCode?: string | null,
): string | null {
  const holder = String(config.accountHolder || '').trim()
  if (!holder) return 'Account holder is required before enabling.'

  if (usesUkBankFields(countryCode)) {
    const sortCode = String(config.registrationNumber || '').trim()
    const accountNo = String(config.accountNumber || '').trim()
    if (!sortCode || !accountNo) {
      return 'Sort code and account number are required before enabling.'
    }
    if (!isValidUkSortCode(sortCode)) {
      return 'Sort code must be 6 digits (e.g. 12-34-56).'
    }
    if (!isValidUkAccountNumber(accountNo)) {
      return 'Account number must be 6–10 digits.'
    }
    return null
  }

  if (!String(config.iban || '').trim()) {
    return 'IBAN is required before enabling.'
  }
  return null
}
