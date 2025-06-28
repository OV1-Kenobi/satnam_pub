declare module "bech32" {
  export interface Decoded {
    prefix: string;
    words: number[];
  }

  export function decode(str: string, limit?: number): Decoded;
  export function encode(
    prefix: string,
    words: number[],
    limit?: number
  ): string;
  export function toWords(bytes: Uint8Array): number[];
  export function fromWords(words: number[]): Uint8Array;
  export function toWordsUnsafe(bytes: Uint8Array): number[] | null;
  export function fromWordsUnsafe(words: number[]): Uint8Array | null;
}
