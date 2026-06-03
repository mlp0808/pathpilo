/** Company plan display pricing (must match Stripe price amounts). */
export const MONTHLY_PRICE = 39
export const ANNUAL_PRICE = 299

const monthlyYearTotal = MONTHLY_PRICE * 12

export const ANNUAL_SAVING = monthlyYearTotal - ANNUAL_PRICE
/** Rounded % off vs paying monthly for 12 months */
export const ANNUAL_SAVE_PERCENT = Math.round((ANNUAL_SAVING / monthlyYearTotal) * 100)
