/**
 * Debugging “last character missing” on Android:
 * 1. In Metro, watch logs when you navigate to a broken label.
 * 2. If code units / JSON here show the full string but the screen does not, the bug is
 *    native text layout (not API/DB).
 * 3. Optional: in remote JS console, run global.probePathPiloText('jobTitle', title).
 */

export function probeText(tag: string, value: unknown): void {
  if (typeof value !== 'string') {
    console.log(`[PathPilo TEXT-PROBE:${tag}]`, { value, type: typeof value });
    return;
  }
  console.log(`[PathPilo TEXT-PROBE:${tag}]`, {
    json: JSON.stringify(value),
    length: value.length,
    codePoints: [...value].length,
    lastChar: value.length ? JSON.stringify(value[value.length - 1]) : null,
  });
}
