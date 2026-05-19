import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Horizontal flex rows (icon + text + badge) often clip children because the
 * default flex min-width is content-sized. Wrap any expanding text column in
 * a View with flexRowTextSlot, and apply flexRowText on Text so it can shrink
 * and wrap instead of overflowing the row.
 */
export const flexRowTextSlot: ViewStyle = {
  flex: 1,
  minWidth: 0,
};

export const flexRowText: TextStyle = {
  flexShrink: 1,
  minWidth: 0,
  alignSelf: 'stretch',
};
