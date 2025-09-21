/**
 * VC Validators — W3C VC Data Model v2.0 compliance checks (strict, JSON-only)
 * Note: JSON-LD processing is intentionally minimized; contexts are validated by URL and shape.
 */

import { VC_V2_CONTEXT, type VerifiableCredential } from "../builders";
import { resolveContext } from "../contexts/cache";
import { verifyDataIntegrityProof } from "../proofs";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function validateVC(vc: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(vc)) return { valid: false, errors: ["VC must be an object"] };

  const ctx = vc["@context"];
  if (!Array.isArray(ctx) || !ctx.length)
    errors.push("@context must be a non-empty array");
  else if (!ctx.some((c) => c === VC_V2_CONTEXT))
    errors.push(`@context must include ${VC_V2_CONTEXT}`);
  else {
    // Try resolve known contexts (offline-first)
    for (const c of ctx) {
      if (typeof c === "string") {
        const r = resolveContext(c);
        if (!r.ok) errors.push(`Failed to resolve context: ${c} (${r.error})`);
      }
    }
  }

  const types = vc["type"];
  if (!Array.isArray(types) || !types.includes("VerifiableCredential")) {
    errors.push('type must include "VerifiableCredential"');
  }

  if (typeof vc["issuer"] !== "string" || !vc["issuer"])
    errors.push("issuer must be a string");
  const holder = vc["holder"];
  if (typeof holder !== "string" || !holder)
    errors.push("holder must be a string");
  if (holder !== vc["issuer"])
    errors.push("issuer must equal holder for SCDiD");

  const iss = vc["issuanceDate"];
  if (typeof iss !== "string" || !iss)
    errors.push("issuanceDate must be ISO string");

  const subj = vc["credentialSubject"];
  if (!isObject(subj)) errors.push("credentialSubject must be an object");

  return { valid: errors.length === 0, errors };
}

/**
 * Validate proof compliance and optionally verify cryptographic signature.
 * When verifySignature is true, verifies the proof with verifyDataIntegrityProof.
 */
export async function validateProofCompliance(
  vc: VerifiableCredential,
  verifySignature?: boolean
): Promise<ValidationResult> {
  const errors: string[] = [];
  if (!vc.proof || !isObject(vc.proof)) {
    errors.push(
      "Missing or invalid proof. Expected JOSE/Data Integrity proof per VC v2.0 Sec 4.12"
    );
  }
  if (verifySignature && errors.length === 0) {
    try {
      const res = await verifyDataIntegrityProof(vc);
      if (!res.valid) {
        for (const e of res.errors || []) {
          errors.push(`proof verification failed: ${e}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(`proof verification error: ${msg}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
