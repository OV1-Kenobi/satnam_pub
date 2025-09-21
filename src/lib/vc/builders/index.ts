/**
 * VC Builders (SCDiD) — W3C VC Data Model v2.0 aligned
 * Minimal builder utilities for self-credentialed credentials (issuer === holder)
 */

export type VCContext = string | Record<string, unknown>;

export interface VerifiableCredential {
  '@context': VCContext[];
  type: string[];
  issuer: string; // DID-like or npub-based URI
  holder?: string; // explicit holder when different; for SCDiD issuer===holder
  issuanceDate: string; // ISO 8601
  expirationDate?: string; // ISO 8601
  credentialSubject: Record<string, unknown> & { id?: string };
  proof?: Record<string, unknown>;
}

export interface BuildVCOptions {
  context?: VCContext[];
  types?: string[];
  expiresAt?: string; // ISO string
}

export const VC_V2_CONTEXT = 'https://www.w3.org/ns/credentials/v2';

function assertNonEmptyString(val: unknown, name: string): asserts val is string {
  if (typeof val !== 'string' || !val.trim()) throw new Error(`${name} must be a non-empty string`);
}

function isoNow(): string {
  return new Date().toISOString();
}

/**
 * Build a self-issued (self-credentialed) VC where issuer === holder
 */
export function buildSelfIssuedVC(params: {
  holderId: string; // e.g., did:nostr:<npub-hex> or nostr:npub1...
  subject: Record<string, unknown> & { id?: string };
  options?: BuildVCOptions;
}): VerifiableCredential {
  assertNonEmptyString(params.holderId, 'holderId');
  const ctx = [VC_V2_CONTEXT, ...(params.options?.context ?? [])];
  const types = ['VerifiableCredential', ...(params.options?.types ?? [])];
  const issuanceDate = isoNow();

  const vc: VerifiableCredential = {
    '@context': ctx,
    type: types,
    issuer: params.holderId,
    holder: params.holderId,
    issuanceDate,
    ...(params.options?.expiresAt ? { expirationDate: params.options.expiresAt } : {}),
    credentialSubject: {
      ...(params.subject || {}),
      ...(params.subject?.id ? {} : { id: params.holderId }),
    },
  };
  return vc;
}

