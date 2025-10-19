/**
 * Shared signing-related types for federation and payments
 * Keep generic to avoid leaking adapter internals.
 */

import type { SigningMethodId } from "../lib/signers/signer-adapter";

export interface GuardianSignature {
  guardianId: string; // hashed/user-safe identifier
  method: SigningMethodId;
  signature: unknown; // adapter-specific artifact
  createdAt?: string;
}

export interface PaymentAuthorizationRequest {
  amountSats: number;
  invoice?: string;
  meta?: Record<string, unknown>;
}

export interface PaymentAuthorizationProof {
  // Could be a signed Nostr event, JWT, or adapter-specific object
  type: "nostr-event" | "jwt" | "amber" | "nfc" | "other";
  payload: unknown;
}

export interface PaymentAuthorizationResult {
  authorized: boolean;
  proof?: PaymentAuthorizationProof;
  error?: string;
}

export interface ThresholdSigningPayload {
  data: unknown; // canonical payload to sign (serialized or structured)
  requiredSigners: number;
  totalSigners: number;
}

export interface ThresholdSigningResult {
  partial: unknown; // partial signature/share
  method: SigningMethodId;
  meta?: Record<string, unknown>;
}

