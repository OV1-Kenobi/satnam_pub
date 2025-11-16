/**
 * Privacy Types for Satnam.pub Communication System
 *
 * Defines privacy levels and messaging options for all communication modals
 */

export enum PrivacyLevel {
  GIFTWRAPPED = "giftwrapped", // Complete metadata protection
  ENCRYPTED = "encrypted", // Encrypted with controlled metadata
  MINIMAL = "minimal", // Standard encryption for public interactions
}

export interface MessagePrivacyOptions {
  privacyLevel: PrivacyLevel;
  description: string;
  features: string[];
  icon: string;
  useCase: string;
  protectionLevel: number;
  metadataVisibility: number;
  anonymityScore: number;
}

export interface PrivacyMetrics {
  encryptionStrength: number;
  metadataProtection: number;
  anonymityLevel: number;
}

export interface PrivacySettings {
  defaultPrivacyLevel: PrivacyLevel;
  allowMinimalPrivacy: boolean;
  requireGuardianApprovalForGiftwrapped: boolean;
}

export interface PrivacyPreferences {
  default_privacy_level: PrivacyLevel;
  auto_upgrade_threshold: number;
  require_guardian_approval: boolean;
  guardian_approval_threshold: number;
  require_adult_approval: boolean;
  adult_approval_threshold: number;
}

export const PRIVACY_OPTIONS: MessagePrivacyOptions[] = [
  {
    privacyLevel: PrivacyLevel.GIFTWRAPPED,
    description: "Gift Wrapped - Complete metadata protection",
    features: [
      "Hidden identity",
      "Timing obfuscation",
      "Zero PII exposure",
      "Complete sender/recipient anonymity",
      "Decoy message generation",
      "Forward secrecy guarantees",
    ],
    icon: "🔒",
    useCase: "Sensitive family communications and financial discussions",
    protectionLevel: 100,
    metadataVisibility: 0,
    anonymityScore: 95,
  },
  {
    privacyLevel: PrivacyLevel.ENCRYPTED,
    description: "Encrypted with controlled metadata",
    features: [
      "Encrypted content",
      "Some metadata visible",
      "Family context preserved",
      "Sender verification",
      "NIP-04 encryption",
    ],
    icon: "🛡️",
    useCase: "Regular family coordination and planning",
    protectionLevel: 80,
    metadataVisibility: 40,
    anonymityScore: 70,
  },
  {
    privacyLevel: PrivacyLevel.MINIMAL,
    description: "Standard encryption for public interactions",
    features: [
      "Public Lightning Address",
      "Business communications",
      "Social interactions",
      "Immediate delivery",
      "Public discoverability",
    ],
    icon: "👁️",
    useCase: "Public Bitcoin transactions and external communications",
    protectionLevel: 60,
    metadataVisibility: 90,
    anonymityScore: 30,
  },
];

// Helper functions
export function getPrivacyOption(
  level: PrivacyLevel
): MessagePrivacyOptions | undefined {
  return PRIVACY_OPTIONS.find((option) => option.privacyLevel === level);
}

export function getDefaultPrivacyLevel(): PrivacyLevel {
  return PrivacyLevel.GIFTWRAPPED; // Gift wrapped by default
}

export function calculatePrivacyMetrics(level: PrivacyLevel): PrivacyMetrics {
  const option = getPrivacyOption(level);
  if (!option) {
    return { encryptionStrength: 0, metadataProtection: 0, anonymityLevel: 0 };
  }

  return {
    encryptionStrength: option.protectionLevel,
    metadataProtection: 100 - option.metadataVisibility,
    anonymityLevel: option.anonymityScore,
  };
}
