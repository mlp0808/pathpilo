import React, { forwardRef } from 'react';
import {
  Text as RNText,
  type TextProps,
  Platform,
  type TextStyle,
} from 'react-native';

/**
 * Android (especially Fabric) can clip the last glyph on single-line / tight layouts.
 * textBreakStrategy + includeFontPadding tweaks are common mitigations before turning off New Arch.
 */
const ANDROID_TEXT_FIX: TextStyle | Record<string, never> =
  Platform.OS === 'android'
    ? ({ textBreakStrategy: 'simple', includeFontPadding: false } as TextStyle)
    : {};

const AndroidSafeText = forwardRef<RNText, TextProps>(function AndroidSafeText(
  { style, ...rest },
  ref,
) {
  return (
    <RNText ref={ref} {...rest} style={[ANDROID_TEXT_FIX, style]} />
  );
});

export default AndroidSafeText;
