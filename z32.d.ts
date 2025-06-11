/**
 * Type declarations for z32 module
 * Based on the z32 module which provides z-base32 encoding and decoding
 * https://github.com/mafintosh/z32
 */

declare module 'z32' {
  /**
   * Encode a Buffer to a z-base32 string
   * @param buffer - The buffer to encode
   * @returns A z-base32 encoded string
   */
  export function encode(buffer: Buffer | Uint8Array): string;

  /**
   * Decode a z-base32 string to a Buffer
   * @param string - The z-base32 string to decode
   * @returns A Buffer containing the decoded data
   */
  export function decode(string: string): Buffer;

  /**
   * Check if a string is valid z-base32
   * @param string - The string to validate
   * @returns True if the string is valid z-base32, false otherwise
   */
  export function validate(string: string): boolean;
}