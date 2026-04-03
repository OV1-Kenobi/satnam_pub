// NIP-SKL Attestation Verifier
// Implements: kind 1985 guardian attestation verification, tier validation
// Aligned with docs/planning/NIP-Triumvirate-Satnam-Integration-Plan.md §5.1

import type {
  SkillManifest,
  AttestationVerificationResult,
  VerificationTier,
} from '../../../types/nip-skl';
import { getEnvVar } from '../../config/env.client';

/**
 * Verify guardian attestation for a skill manifest
 * Validates kind 1985 guardian attestations from trusted pubkeys
 * Reads trusted guardian pubkeys from VITE_GUARDIAN_PUBKEYS env var
 *
 * @param manifest - SkillManifest with attestations array
 * @returns AttestationVerificationResult
 */
export async function verifyGuardianAttestation(
  manifest: SkillManifest
): Promise<AttestationVerificationResult> {
  // Get trusted guardian pubkeys from env
  const guardianPubkeysEnv = getEnvVar('VITE_GUARDIAN_PUBKEYS');
  if (!guardianPubkeysEnv) {
    return {
      valid: false,
      reason: 'No trusted guardian pubkeys configured (VITE_GUARDIAN_PUBKEYS not set)',
    };
  }

  // Parse comma-separated pubkeys
  const trustedPubkeys = guardianPubkeysEnv.split(',').map((pk) => pk.trim());

  if (trustedPubkeys.length === 0) {
    return {
      valid: false,
      reason: 'No trusted guardian pubkeys configured',
    };
  }

  // Check if manifest has any attestations
  if (!manifest.attestations || manifest.attestations.length === 0) {
    return {
      valid: false,
      reason: 'No guardian attestations found for this skill',
    };
  }

  // Find attestations from trusted guardians
  const trustedAttestations = manifest.attestations.filter((att) =>
    trustedPubkeys.includes(att.guardianPubkey)
  );

  if (trustedAttestations.length === 0) {
    return {
      valid: false,
      reason: 'No attestations from trusted guardians',
    };
  }

  // Validate attestation labels
  for (const attestation of trustedAttestations) {
    const labelResult = validateAttestationLabel(attestation.label);
    if (labelResult.valid) {
      return {
        valid: true,
        reason: 'Valid guardian attestation found',
        tier: labelResult.tier,
        guardianPubkey: attestation.guardianPubkey,
      };
    }
  }

  return {
    valid: false,
    reason: 'Attestations found but labels are invalid',
  };
}

/**
 * Validate attestation label format
 * Accepts: "skill/verified", "skill/audited", "skill/verified/tier1", etc.
 *
 * @param label - NIP-32 label string
 * @returns {valid: boolean, tier?: VerificationTier}
 */
function validateAttestationLabel(label: string): {
  valid: boolean;
  tier?: VerificationTier;
} {
  // Valid base labels
  const validBaseLabels = ['skill/verified', 'skill/audited'];

  // Check base labels
  if (validBaseLabels.includes(label)) {
    return { valid: true };
  }

  // Check tier labels (e.g. "skill/verified/tier3")
  const tierMatch = label.match(/^skill\/(verified|audited)\/tier([1-4])$/);
  if (tierMatch) {
    const tier = `tier${tierMatch[2]}` as VerificationTier;
    return { valid: true, tier };
  }

  return { valid: false };
}

/**
 * Check attestation tier level
 * Validates that the tier matches the guardian's declared capability
 * (Guardian capability checking is a future enhancement)
 *
 * @param guardianPubkey - Guardian's public key
 * @param tier - Verification tier
 * @returns true if guardian is authorized for this tier
 */
export function checkAttestationTier(
  guardianPubkey: string,
  tier: VerificationTier
): boolean {
  // TODO: Implement guardian capability checking
  // For now, assume all trusted guardians can issue any tier
  // Real implementation would:
  // 1. Query guardian profile (kind 39200 or similar)
  // 2. Check declared verification capabilities
  // 3. Validate tier is within guardian's authority

  console.warn(
    `checkAttestationTier stub: assuming guardian ${guardianPubkey} can issue ${tier}`
  );
  return true;
}

/**
 * Parse tier from attestation label
 * @param label - NIP-32 label string
 * @returns VerificationTier or undefined
 */
export function parseTierFromLabel(label: string): VerificationTier | undefined {
  const tierMatch = label.match(/tier([1-4])$/);
  if (tierMatch) {
    return `tier${tierMatch[1]}` as VerificationTier;
  }
  return undefined;
}

/**
 * Get minimum required tier for cross-platform consumption
 * Per Integration Plan §5.1: Tier 3+ recommended for cross-platform
 * @returns VerificationTier
 */
export function getMinimumCrossPlatformTier(): VerificationTier {
  return 'tier3';
}

/**
 * Check if tier meets minimum requirement
 * @param tier - Verification tier to check
 * @param minimum - Minimum required tier
 * @returns true if tier meets or exceeds minimum
 */
export function tierMeetsMinimum(
  tier: VerificationTier | undefined,
  minimum: VerificationTier
): boolean {
  if (!tier) {
    return false;
  }

  const tierLevels: Record<VerificationTier, number> = {
    tier1: 1,
    tier2: 2,
    tier3: 3,
    tier4: 4,
  };

  return tierLevels[tier] >= tierLevels[minimum];
}

