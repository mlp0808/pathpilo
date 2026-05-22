import { Platform, type TextStyle } from 'react-native';

/** Invisible suffix so Android measures the full last glyph (Fabric clip fix). */
export function padAndroidText(value: string): string {
  if (!value) return value;
  return Platform.OS === 'android' ? `${value}\u2009\u00A0` : value;
}

/** Extra padding for currency/numbers where the last digit is often clipped. */
export function padAndroidMoney(formatted: string): string {
  if (!formatted) return formatted;
  return Platform.OS === 'android' ? `${formatted}\u2009\u00A0\u2009` : formatted;
}

export function fmtMoneyDisplay(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return padAndroidMoney('—');
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'DKK',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    formatted = `${amount.toFixed(2)} ${currency || 'DKK'}`;
  }
  return padAndroidMoney(formatted);
}

/** Spread onto RNText styles for labels, buttons, badges. */
export const androidTextFix: TextStyle =
  Platform.OS === 'android'
    ? {
        textBreakStrategy: 'simple',
        includeFontPadding: false,
        paddingRight: 10,
      }
    : {};

export const androidPillTextFix: TextStyle =
  Platform.OS === 'android'
    ? {
        textBreakStrategy: 'simple',
        includeFontPadding: false,
        letterSpacing: 0,
        paddingRight: 8,
      }
    : {};
