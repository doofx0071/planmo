/**
 * A file whose name starts with two dots. Legal on every major platform
 * (Windows, macOS, Linux) yet deliberately awkward for naive path handling.
 * The scanner must treat it as an ordinary source file.
 */
export function hiddenMarker(): string {
  return '..hidden';
}
