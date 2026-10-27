const { bankSchemeForCountry, isSupportedCountry } = require('./countryRules');

/**
 * How the company's clients pay by bank transfer:
 * gb = sort code + account no., us = routing + account no.,
 * dk = reg. no. + account no. or IBAN, iban = IBAN.
 * `registrationNumber` holds the sort code / routing number / reg. no.
 */
function bankSchemeFor(countryCode) {
  return isSupportedCountry(countryCode) ? bankSchemeForCountry(countryCode) : 'iban';
}

function usesUkBankFields(countryCode) {
  return bankSchemeFor(countryCode) === 'gb';
}

function normalizeDigits(value) {
  return String(value || '').replace(/[\s-]/g, '');
}

const digits = (min, max) => (value) => new RegExp(`^\\d{${min},${max}}$`).test(normalizeDigits(value));
const isValidUkSortCode = digits(6, 6);
const isValidUkAccountNumber = digits(6, 10);
const isValidUsRoutingNumber = digits(9, 9);
const isValidUsAccountNumber = digits(4, 17);
const isValidDkRegNumber = digits(4, 4);
const isValidDkAccountNumber = digits(6, 10);

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

  const regNo = String(config.registrationNumber || '').trim();
  const accountNo = String(config.accountNumber || '').trim();
  const iban = String(config.iban || '').trim();

  switch (bankSchemeFor(countryCode)) {
    case 'gb':
      if (!regNo || !accountNo) return 'Sort code and account number are required before enabling.';
      if (!isValidUkSortCode(regNo)) return 'Sort code must be 6 digits (e.g. 12-34-56).';
      if (!isValidUkAccountNumber(accountNo)) return 'Account number must be 6–10 digits.';
      return null;
    case 'us':
      if (!regNo || !accountNo) return 'Routing number and account number are required before enabling.';
      if (!isValidUsRoutingNumber(regNo)) return 'Routing number must be 9 digits.';
      if (!isValidUsAccountNumber(accountNo)) return 'Account number must be 4–17 digits.';
      return null;
    case 'dk':
      if (iban) return null;
      if (!regNo && !accountNo) return 'Add a reg. no. and account number, or an IBAN, before enabling.';
      if (!isValidDkRegNumber(regNo)) return 'Reg. no. must be 4 digits.';
      if (!isValidDkAccountNumber(accountNo)) return 'Account number must be 6–10 digits.';
      return null;
    default:
      if (!iban) return 'IBAN is required before enabling.';
      return null;
  }
}

module.exports = {
  bankSchemeFor,
  usesUkBankFields,
  normalizeBankTransferConfig,
  validateBankTransferConfig,
};
