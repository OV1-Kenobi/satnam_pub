export const nip19: {
  npubEncode: (pubkey: string) => string;
  decode: (s: string) => { type: string; data: unknown };
};
export function getPublicKey(privateKey: string | Uint8Array): string;
export function generateSecretKey(): Uint8Array | string;

