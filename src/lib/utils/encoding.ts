/**
 * UTF-8 to Base64 encoding using modern Web APIs.
 * - Uses TextEncoder to convert string to Uint8Array
 * - Converts bytes to a binary string in chunks
 * - Encodes with btoa
 */
export function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  // Build binary string in chunks to avoid stack limits on very large inputs
  const CHUNK_SIZE = 0x8000; // 32KB
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

