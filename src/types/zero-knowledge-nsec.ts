/**
 * @fileoverview Zero-Knowledge Nsec TypeScript Definitions
 * @description Comprehensive type definitions for browser-compatible zero-knowledge nsec handling
 * @compliance Browser-compatible, no Node.js modules, strict TypeScript
 */

/**
 * Secure Share for encrypted key shares
 * @description Represents an encrypted FROST share with all necessary cryptographic metadata
 * @security Never store decrypted shares - only encrypted versions with proper authentication
 */
export interface SecureShare {
  /** Salt-hashed UUID to identify participant without exposing identity */
  participantUUID: string;
  /** AES-256-GCM encrypted share data in hex format */
  encryptedShare: string;
  /** FROST share index (1-based) for polynomial reconstruction */
  shareIndex: number;
  /** PBKDF2 salt for password-based key derivation (hex) */
  salt: string;
  /** AES-GCM initialization vector (hex) */
  iv: string;
  /** AES-GCM authentication tag for integrity verification (hex) */
  authTag: string;
  /** Creation timestamp for expiration and audit purposes */
  createdAt: Date;
}

/**
 * Recovery Context for emergency nsec reconstruction
 * @description Contains all necessary information for authorized nsec recovery
 * @security Only use for emergency operations, immediately destroy after use
 */
export interface RecoveryContext {
  /** Encrypted federation identifier to prevent correlation attacks */
  federationId: string;
  /** Family Federation public key for verification */
  publicKey: string;
  /** Minimum number of participants required for recovery */
  requiredThreshold: number;
  /** Array of encrypted shares from authorized participants */
  participantShares: SecureShare[];
  /** Type of emergency recovery being performed */
  emergencyType: "standard" | "guardian_override" | "steward_emergency";
}

/**
 * Zero-Knowledge Nsec management structure
 * @description Core structure for managing family federation nsec without storing complete key
 * @security Complete nsec NEVER stored - only public key and encrypted shares
 */
export interface ZeroKnowledgeNsec {
  /** Only public key stored permanently - NEVER store nsec */
  federationPublicKey: string;
  /** Array of encrypted shares distributed to participants */
  frostShares: SecureShare[];
  /** Required number of signatures for nsec reconstruction */
  recoveryThreshold: number;
  /** Encrypted verification data for integrity checks */
  verificationData: string;
  /** Creation timestamp for audit trail */
  createdAt: Date;
  /** Optional expiration for enhanced security */
  expiresAt?: Date;
}

/**
 * Trust Founder definition
 * @description Represents the founder of a family federation trust
 * @security Founder password used for encrypting founder's share - never stored in plaintext
 */
export interface TrustFounder {
  /** Salt-hashed UUID for privacy protection */
  saltedUUID: string;
  /** Display name for user interface */
  displayName: string;
  /** Email address for communication */
  email: string;
  /** Whether founder retains guardian status after federation creation */
  retainGuardianStatus: boolean;
  /** Password for encrypting founder's nsec share - NEVER store plaintext */
  founderPassword: string;
}

/**
 * Trust Participant definition
 * @description Represents a guardian or steward in the family federation
 * @security UUIDs generated after invitation acceptance to prevent tracking
 */
export interface TrustParticipant {
  /** Generated after invitation acceptance - not available during invitation */
  saltedUUID?: string;
  /** Email address for invitation delivery */
  email: string;
  /** Display name for user interface */
  displayName: string;
  /** Role in the federation trust */
  role: "guardian" | "steward";
  /** Temporary password for share encryption during invitation process */
  invitationCode?: string;
  /** FROST share index assigned to participant */
  shareIndex?: number;
}

/**
 * FROST Polynomial for secret sharing
 * @description Mathematical structure for Shamir's Secret Sharing with finite field arithmetic
 * @security Coefficients must be cleared from memory after share generation
 */
export interface FrostPolynomial {
  /** Polynomial coefficients in finite field - first coefficient is the secret */
  coefficients: bigint[];
  /** Minimum number of shares needed for secret reconstruction */
  threshold: number;
  /** Finite field prime (secp256k1 curve order) */
  prime: bigint;
}

/**
 * Memory Wipe Target for secure cleanup
 * @description Represents sensitive data that needs secure memory wiping
 * @security Critical for preventing memory-based attacks in browser environment
 */
export interface MemoryWipeTarget {
  /** Sensitive data to be wiped */
  data: string | bigint | Uint8Array;
  /** Type of data for proper cleaning strategy */
  type: "string" | "bigint" | "array";
}

/**
 * Federation Configuration for trust creation
 * @description Complete configuration for creating a family federation trust
 * @security Threshold values must ensure proper security while maintaining usability
 */
export interface FederationConfig {
  /** Human-readable federation name */
  federationName: string;
  /** Encrypted federation identifier */
  federationId: string;
  /** Trust founder information */
  founder: TrustFounder;
  /** Array of guardian participants */
  guardians: TrustParticipant[];
  /** Array of steward participants */
  stewards: TrustParticipant[];
  /** Threshold configuration for various operations */
  thresholdConfig: {
    /** Minimum guardians required for nsec reconstruction */
    guardianThreshold: number;
    /** Minimum stewards required for operations */
    stewardThreshold: number;
    /** Emergency override threshold */
    emergencyThreshold: number;
    /** Threshold for creating new accounts */
    accountCreationThreshold: number;
  };
  /** Encrypted recovery instructions */
  nsecRecoveryInstructions: string;
}

/**
 * Encryption Configuration for cryptographic operations
 * @description Standard encryption parameters for consistent security
 * @security Use only well-tested parameters - no custom crypto
 */
export interface EncryptionConfig {
  /** AES-GCM algorithm identifier */
  algorithm: "AES-GCM";
  /** Key length in bits */
  keyLength: 256;
  /** IV length in bits */
  ivLength: 96;
  /** Authentication tag length in bits */
  tagLength: 128;
  /** PBKDF2 iteration count */
  pbkdf2Iterations: 100000;
  /** PBKDF2 hash function */
  pbkdf2Hash: "SHA-256";
}

/**
 * Share Validation Result
 * @description Result of validating an encrypted share
 * @security Always validate shares before using in reconstruction
 */
export interface ShareValidationResult {
  /** Whether the share is valid */
  isValid: boolean;
  /** Validation error messages */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Share integrity score (0-100) */
  integrityScore: number;
}

/**
 * Nsec Reconstruction Result
 * @description Result of nsec reconstruction process
 * @security Reconstructed nsec must be immediately used and destroyed
 */
export interface NsecReconstructionResult {
  /** Whether reconstruction was successful */
  success: boolean;
  /** Reconstructed nsec - MUST be immediately destroyed after use */
  nsec?: string;
  /** Derived public key for verification */
  publicKey?: string;
  /** Reconstruction errors */
  errors: string[];
  /** Timestamp of reconstruction */
  timestamp: Date;
}

/**
 * Invitation Data for secure share distribution
 * @description Contains encrypted share and delivery information
 * @security Invitation codes expire and are single-use only
 */
export interface InvitationData {
  /** Recipient's email address */
  recipientEmail: string;
  /** Recipient's display name */
  recipientName: string;
  /** Role being invited to */
  role: "guardian" | "steward";
  /** Temporary invitation code */
  invitationCode: string;
  /** Encrypted share data */
  encryptedShare: string;
  /** Share index for reconstruction */
  shareIndex: number;
  /** Invitation expiration date */
  expiresAt: Date;
  /** Federation identifier */
  federationId: string;
  /** Federation name (optional for display) */
  federationName?: string;
  /** Participant role (alternative to role) */
  participantRole?: "guardian" | "steward";
  /** Display name (alternative to recipientName) */
  displayName?: string;
  /** Setup instructions */
  instructions?: string[];
  /** Security warnings */
  securityWarnings?: string[];
}

/**
 * Audit Log Entry for security monitoring
 * @description Tamper-evident log entry for nsec operations
 * @security Never log sensitive data - only operation metadata
 */
export interface AuditLogEntry {
  /** Unique log entry identifier */
  id: string;
  /** Operation type */
  operation:
    | "generate"
    | "reconstruct"
    | "validate"
    | "distribute"
    | "emergency";
  /** Participant UUID (if applicable) */
  participantUUID?: string;
  /** Operation timestamp */
  timestamp: Date;
  /** Operation result */
  result: "success" | "failure" | "warning";
  /** Additional metadata (non-sensitive) */
  metadata: Record<string, any>;
  /** Hash of previous log entry for integrity */
  previousHash?: string;
}

/**
 * Emergency Recovery Instructions
 * @description Comprehensive recovery instructions for emergency situations
 * @security Instructions must be encrypted and only accessible to authorized participants
 */
export interface EmergencyRecoveryInstructions {
  /** Federation identifier */
  federationId: string;
  /** Federation name */
  federationName: string;
  /** Public key for verification */
  publicKey: string;
  /** Required threshold for recovery */
  requiredThreshold: number;
  /** Step-by-step recovery process */
  recoverySteps: string[];
  /** Security warnings */
  securityWarnings: string[];
  /** Emergency contact information */
  emergencyContacts: string[];
  /** Last updated timestamp */
  lastUpdated: Date;
}

/**
 * Password Strength Requirements
 * @description Validation rules for secure passwords
 * @security Enforce strong passwords for all participants
 */
export interface PasswordStrengthRequirements {
  /** Minimum password length */
  minLength: number;
  /** Require uppercase letters */
  requireUppercase: boolean;
  /** Require lowercase letters */
  requireLowercase: boolean;
  /** Require numbers */
  requireNumbers: boolean;
  /** Require special characters */
  requireSpecialChars: boolean;
  /** Minimum entropy bits */
  minEntropy: number;
}

/**
 * Crypto Operation Result
 * @description Generic result for cryptographic operations
 * @security Always check success before using result data
 */
export interface CryptoOperationResult<T = any> {
  /** Whether operation was successful */
  success: boolean;
  /** Operation result data */
  data?: T;
  /** Error message if operation failed */
  error?: string;
  /** Operation warnings */
  warnings?: string[];
  /** Operation metadata */
  metadata?: Record<string, any>;
}

/**
 * Federation Status
 * @description Current status of a family federation
 * @security Status changes must be audited and verified
 */
export interface FederationStatus {
  /** Federation identifier */
  federationId: string;
  /** Current status */
  status: "creating" | "active" | "suspended" | "emergency" | "archived";
  /** Active participant count */
  activeParticipants: number;
  /** Available shares for reconstruction */
  availableShares: number;
  /** Last activity timestamp */
  lastActivity: Date;
  /** Security alerts */
  securityAlerts: string[];
}

// Constants for cryptographic operations
export const CRYPTO_CONSTANTS = {
  /** secp256k1 curve order for finite field arithmetic */
  SECP256K1_ORDER: BigInt(
    "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
  ),
  /** Maximum safe integer for JavaScript */
  MAX_SAFE_INTEGER: BigInt(Number.MAX_SAFE_INTEGER),
  /** Minimum entropy bits for secure passwords */
  MIN_PASSWORD_ENTROPY: 80,
  /** Maximum share index */
  MAX_SHARE_INDEX: 255,
  /** Default PBKDF2 iterations */
  DEFAULT_PBKDF2_ITERATIONS: 100000,
  /** Default encryption algorithm */
  DEFAULT_ALGORITHM: "AES-GCM" as const,
  /** Default key length */
  DEFAULT_KEY_LENGTH: 256,
  /** Default IV length */
  DEFAULT_IV_LENGTH: 96,
  /** Default tag length */
  DEFAULT_TAG_LENGTH: 128,
} as const;

// Default encryption configuration
export const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = {
  algorithm: "AES-GCM",
  keyLength: 256,
  ivLength: 96,
  tagLength: 128,
  pbkdf2Iterations: 100000,
  pbkdf2Hash: "SHA-256",
};

// Default password strength requirements
export const DEFAULT_PASSWORD_REQUIREMENTS: PasswordStrengthRequirements = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  minEntropy: 80,
};

// Type guards for runtime validation
export const isSecureShare = (obj: any): obj is SecureShare => {
  return (
    obj &&
    typeof obj.participantUUID === "string" &&
    typeof obj.encryptedShare === "string" &&
    typeof obj.shareIndex === "number" &&
    typeof obj.salt === "string" &&
    typeof obj.iv === "string" &&
    typeof obj.authTag === "string" &&
    obj.createdAt instanceof Date
  );
};

export const isRecoveryContext = (obj: any): obj is RecoveryContext => {
  return (
    obj &&
    typeof obj.federationId === "string" &&
    typeof obj.publicKey === "string" &&
    typeof obj.requiredThreshold === "number" &&
    Array.isArray(obj.participantShares) &&
    ["standard", "guardian_override", "steward_emergency"].includes(
      obj.emergencyType
    )
  );
};

export const isTrustFounder = (obj: any): obj is TrustFounder => {
  return (
    obj &&
    typeof obj.saltedUUID === "string" &&
    typeof obj.displayName === "string" &&
    typeof obj.email === "string" &&
    typeof obj.retainGuardianStatus === "boolean" &&
    typeof obj.founderPassword === "string"
  );
};

export const isTrustParticipant = (obj: any): obj is TrustParticipant => {
  return (
    obj &&
    typeof obj.email === "string" &&
    typeof obj.displayName === "string" &&
    ["guardian", "steward"].includes(obj.role)
  );
};

// Utility types
export type SensitiveDataType = string | bigint | Uint8Array;
export type CryptoOperation =
  | "encrypt"
  | "decrypt"
  | "generate"
  | "reconstruct"
  | "validate"
  | "distribute";
export type FederationRole = "founder" | "guardian" | "steward";
export type EmergencyType =
  | "standard"
  | "guardian_override"
  | "steward_emergency";
export type FederationStatusType =
  | "creating"
  | "active"
  | "suspended"
  | "emergency"
  | "archived";

// Export only runtime values (constants, functions, etc.) in default export
// Interfaces are exported individually above
export default {
  CRYPTO_CONSTANTS,
  DEFAULT_ENCRYPTION_CONFIG,
  DEFAULT_PASSWORD_REQUIREMENTS,
  isSecureShare,
  isRecoveryContext,
  isTrustFounder,
  isTrustParticipant,
};
