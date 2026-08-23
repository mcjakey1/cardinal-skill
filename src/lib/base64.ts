const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Cross-platform base64 without relying on browser-only FileReader or Node Buffer. */
export function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const combined = (a << 16) | (b << 8) | c;
    result += ALPHABET[(combined >> 18) & 63];
    result += ALPHABET[(combined >> 12) & 63];
    result += index + 1 < bytes.length ? ALPHABET[(combined >> 6) & 63] : '=';
    result += index + 2 < bytes.length ? ALPHABET[combined & 63] : '=';
  }
  return result;
}
