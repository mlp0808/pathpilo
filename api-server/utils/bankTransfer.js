function usesUkBankFields(countryCode) {
  return String(countryCode || '').trim().toUpperCase() === 'GB';
}

function normalizeDigits(value) {
  return String(value || '').replace(/[\s-]/g, '');
}

function isValidUkSortCode(value) {
  return /^\d{6}$/.test(normalizeDigits(value));
}

function isValidUkAccountNumber(value) {
  const digits = normalizeDigits(value);
  return /^\d{6,10}$/.test(digits);
}

function normalizeBankTransferConfig(input) {
  const body = input || {};
  return {
    accountHolder: String(body.accountHolder || '').trim(),
    iban: String(body.iban || '').trim().replace(/\s+/g, ''),
    accountNumber: String(body.accountNumber || '').trim(),
    registrationNumber: String(body.registrationNumber || '').trim(),
  };
}

function validateBankTransferConfig(config, enabled, countryCode) {
  if (!enabled) return null;

  const holder = String(config.accountHolder || '').trim();
  if (!holder) return 'Account holder is required before enabling.';

  if (usesUkBankFields(countryCode)) {
    const sortCode = String(config.registrationNumber || '').trim();
    const accountNo = String(config.accountNumber || '').trim();
    if (!sortCode || !accountNo) {
      return 'Sort code and account number are required before enabling.';
    }
    if (!isValidUkSortCode(sortCode)) {
      return 'Sort code must be 6 digits (e.g. 12-34-56).';
    }
    if (!isValidUkAccountNumber(accountNo)) {
      return 'Account number must be 6–10 digits.';
    }
    return null;
  }

  if (!String(config.iban || '').trim()) {
    return 'IBAN is required before enabling.';
  }
  return null;
}

module.exports = {
  usesUkBankFields,
  normalizeBankTransferConfig,
  validateBankTransferConfig,
};
