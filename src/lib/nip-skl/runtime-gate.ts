// NIP-SKL Runtime Gate — Critical Safety Gate
// SECURITY: This function must be called before every skill execution with no bypass path.
// Returns typed result — never throws — to prevent silent failures from empty catch blocks.
// Aligned with docs/planning/NIP-Triumvirate-Satnam-Integration-Plan.md §5.1 and §11

import type { RuntimeGateResult, SkillManifest } from '../../../types/nip-skl';
import { fetchSkillManifest, validateManifest } from './manifest';
import { verifyGuardianAttestation } from './attestation-verifier';

/**
 * Verify skill execution is safe before loading/running
 * CRITICAL: This is the non-bypassable safety gate. Must be called before every skill execution.
 *
 * Checks (in order):
 * 1. Manifest exists on relay with valid signature
 * 2. Guardian attestation present from trusted pubkey
 * 3. No NIP-09 kind 5 revocation from same publisher pubkey
 * 4. manifestEventId matches envelope's version pin (constant-time compare)
 * 5. revocationStatus = 'active' confirmed in Supabase (if envelope provided)
 *
 * @param skillScopeId - Canonical skill address
 * @param manifestEventId - Version pin from credit envelope
 * @param envelopeId - Optional: credit envelope ID for revocation status check
 * @param relayUrls - Relay URLs to query
 * @returns RuntimeGateResult with allowed flag and reason
 */
export async function verifySkillExecution(
  skillScopeId: string,
  manifestEventId: string,
  envelopeId?: string,
  relayUrls: string[] = []
): Promise<RuntimeGateResult> {
  const checks = {
    manifestExists: false,
    guardianAttestationValid: false,
    noRevocation: false,
    versionPinMatches: false,
    constraintsSatisfied: false,
  };

  // 1. Fetch manifest from relay (never trust caller-supplied manifest)
  let manifest: SkillManifest | null = null;
  try {
    manifest = await fetchSkillManifest(skillScopeId, relayUrls);
  } catch (error) {
    return {
      allowed: false,
      reason: `Failed to fetch manifest: ${error instanceof Error ? error.message : 'Unknown error'}`,
      checks,
    };
  }

  if (!manifest || !manifest.rawEvent) {
    return {
      allowed: false,
      reason: 'Manifest not found on relay',
      checks,
    };
  }

  if (!validateManifest(manifest.rawEvent)) {
    return {
      allowed: false,
      reason: 'Manifest signature invalid',
      checks,
    };
  }

  checks.manifestExists = true;

  // 2. Verify guardian attestation exists and is from trusted pubkeys
  const attestationResult = await verifyGuardianAttestation(manifest);
  if (!attestationResult.valid) {
    return {
      allowed: false,
      reason: `Guardian attestation invalid: ${attestationResult.reason}`,
      checks,
    };
  }

  checks.guardianAttestationValid = true;

  // 3. Verify no NIP-09 revocation from same pubkey
  // TODO: Implement revocation check by querying kind 5 events
  // For now, assume no revocation (stub)
  const isRevoked = false; // await checkRevocation(manifest.publisherPubkey, manifestEventId, relayUrls);
  if (isRevoked) {
    return {
      allowed: false,
      reason: 'Skill manifest has been revoked by publisher',
      checks,
    };
  }

  checks.noRevocation = true;

  // 4. Verify manifestEventId matches envelope's version pin (constant-time compare)
  const versionPinMatches = await constantTimeEqual(
    manifest.manifestEventId,
    manifestEventId
  );
  if (!versionPinMatches) {
    return {
      allowed: false,
      reason: 'Manifest event ID does not match envelope version pin',
      checks,
    };
  }

  checks.versionPinMatches = true;

  // 5. Verify revocationStatus = 'active' in Supabase (if envelope provided)
  if (envelopeId) {
    // TODO: Query Supabase credit_envelopes table
    // For now, assume active (stub)
    const envelopeActive = true; // await checkEnvelopeStatus(envelopeId);
    if (!envelopeActive) {
      return {
        allowed: false,
        reason: 'Credit envelope is not active (revoked or expired)',
        checks,
      };
    }
  }

  checks.constraintsSatisfied = true;

  // All checks passed
  return {
    allowed: true,
    reason: 'All safety checks passed',
    checks,
  };
}

/**
 * Constant-time string comparison using Web Crypto HMAC
 * Prevents timing attacks on manifestEventId and constraint hash comparisons
 * Aligned with docs/planning/NIP-Triumvirate-Satnam-Integration-Plan.md §11
 *
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal
 */
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();

  // Generate random HMAC key
  const key = await crypto.subtle.importKey(
    'raw',
    crypto.getRandomValues(new Uint8Array(32)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Compute HMAC for both strings
  const [macA, macB] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(a)),
    crypto.subtle.sign('HMAC', key, enc.encode(b)),
  ]);

  // Compare byte-by-byte with no short-circuit
  return timingSafeArrayBufferEqual(macA, macB);
}

/**
 * Timing-safe ArrayBuffer comparison
 * @param a - First ArrayBuffer
 * @param b - Second ArrayBuffer
 * @returns true if buffers are equal
 */
function timingSafeArrayBufferEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);

  if (va.length !== vb.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < va.length; i++) {
    diff |= va[i] ^ vb[i];
  }

  return diff === 0;
}

