// Type declarations for z32 (z-base32 encoding)
declare module "z32" {
  export function encode(buffer: Buffer | Uint8Array): string;
  export function decode(str: string): Buffer;
}
