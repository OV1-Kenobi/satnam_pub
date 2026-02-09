/**
 * High-Volume Physical Peer Onboarding Type Definitions
 *
 * Supports coordinator-led onboarding of 1-100+ participants with:
 * - Nostr identity creation/migration
 * - NFC card programming (NTAG424/Boltcard/Tapsigner)
 * - Lightning wallet integration
 * - Keet P2P identity
 * - Attestation publishing
 */

// ============================================================================
// Session Management
// ============================================================================

export type OnboardingMode = "single" | "batch";
export type OnboardingSessionStatus =
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export interface OnboardingSession {
  sessionId: string;
  coordinatorUserId: string;
  mode: OnboardingMode;
  status: OnboardingSessionStatus;
  participantCount: number;
  completedCount: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Participant Management
// ============================================================================

export type OnboardingStep =
  | "intake"
  | "identity"
  | "password"
  | "migration"
  | "nfc"
  | "lightning"
  | "keet"
  | "backup"
  | "attestation"
  | "complete";

export type ParticipantStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";
export type TechnicalComfort = "low" | "medium" | "high";

export interface OnboardingParticipant {
  participantId: string;
  sessionId: string;
  /** Set after user_identities record created */
  userId?: string;
  trueName: string;
  displayName?: string;
  language: string;
  npub: string;
  nip05?: string;
  /** Indicates if participant already has an existing Nostr npub (drives migration flow) */
  existingNostrAccount?: boolean;
  /** Indicates if participant already has an existing Lightning wallet */
  existingLightningWallet?: boolean;
  migrationFlag: boolean;
  oldNpub?: string;
  federationId?: string;
  referralId?: string;
  technicalComfort?: TechnicalComfort;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  status: ParticipantStatus;
  createdAt: Date;
  updatedAt: Date;

  // Encrypted secrets (set during identity and keet steps)
  /** Encrypted nsec (format: salt:iv:ciphertext in hex) - set by NostrIdentityStep */
  encrypted_nsec?: string;
  /** Encrypted Keet seed (base64url) - set by KeetIdentityStep */
  encrypted_keet_seed?: string;
  /** Keet seed salt (base64url) - set by KeetIdentityStep */
  keet_seed_salt?: string;
  /** Keet Peer ID (hex string) - set by KeetIdentityStep */
  keet_peer_id?: string;

  // Password Recovery Keys (PRK) - for password recovery via nsec or Keet seed
  /** PRK for nsec-based password recovery */
  prkNsec?: PRKEncryptionResult;
  /** PRK for Keet seed-based password recovery */
  prkKeet?: PRKEncryptionResult;

  // Attestation data (set during attestation step)
  /** NIP-03 attestation event ID (Kind:1040) */
  nip03_event_id?: string;
  /** OpenTimestamps proof */
  ots_proof?: string;
  /** Whether participant has been linked to family federation */
  federation_linked?: boolean;
  /** Whether coordinator attestation has been published */
  attestation_published?: boolean;
}

/** PRK encryption result structure */
export interface PRKEncryptionResult {
  encrypted: string; // Base64url-encoded encrypted password
  salt: string; // Base64url-encoded 32-byte salt
  iv: string; // Base64url-encoded 12-byte IV
}

// ============================================================================
// Password Management
// ============================================================================

export type PasswordMode = "coordinator-assigned" | "user-chosen";
export type PasswordType = "phrase" | "complex" | "invalid";
export type PasswordStrength = "weak" | "medium" | "strong" | "very_strong";

export interface PasswordConfig {
  mode: PasswordMode;
  minPhraseLength: number; // Default: 26
  minPhraseWords: number; // Default: 4
  maxPhraseWords: number; // Default: 5
  minComplexLength: number; // Default: 12
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

export interface PasswordValidationResult {
  valid: boolean;
  type: PasswordType;
  errors: string[];
  strength: PasswordStrength;
  entropyBits: number;
}

// ============================================================================
// NFC Card Management
// ============================================================================

export type NFCCardType = "ntag424" | "boltcard" | "tapsigner";
export type NFCCardStatus = "pending" | "programmed" | "verified" | "failed";

export interface NFCCard {
  cardId: string;
  participantId: string;
  userId: string;
  cardUid: string;
  cardType: NFCCardType;
  lnbitsCardId?: string; // For Boltcard
  mfaFactorId?: string; // Link to MFA system
  pinHash?: string; // Salted hash, never plaintext
  pinSalt?: string;
  programmedAt?: Date;
  verifiedAt?: Date;
  status: NFCCardStatus;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface PINConfig {
  length: 6;
  cardType: NFCCardType;
  userConfigurable: boolean; // false for Tapsigner
}

export interface PINEnrollmentResult {
  pinHash: string;
  pinSalt: string;
  enrolledAt: number;
}

// ============================================================================
// Lightning Integration
// ============================================================================

export interface LightningLink {
  linkId: string;
  participantId: string;
  userId: string;
  lightningAddress?: string; // username@satnam.pub
  externalLightningAddress?: string; // For Scrub forwarding
  lnbitsWalletId?: string;
  lnbitsAdminKeyEncrypted?: string; // Encrypted with user password
  nwcConnectionStringEncrypted?: string; // Encrypted NWC URI
  nwcPermissions?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Nostr Migration (OTP)
// ============================================================================

export type MigrationMethod = "otp" | "manual";
export type MigrationStatus =
  | "pending"
  | "otp_sent"
  | "verified"
  | "completed"
  | "failed";

export interface NostrMigration {
  migrationId: string;
  participantId: string;
  oldNpub: string;
  newNpub: string;
  migrationMethod: MigrationMethod;
  otpSessionId?: string;
  status: MigrationStatus;
  createdAt: Date;
  verifiedAt?: Date;
  completedAt?: Date;
}

// ============================================================================
// Keet P2P Identity
// ============================================================================

export interface KeetIdentity {
  peerId: string; // Derived from seed
  seedEncrypted: string; // AES-256-GCM encrypted 24-word BIP39 seed
  seedSalt: string;
  createdAt: Date;
}

// ============================================================================
// Attestation
// ============================================================================

export type AttestationType = "opentimestamps" | "nip03";

export interface OnboardingAttestation {
  attestationId: string;
  participantId: string;
  type: AttestationType;
  commitment: string; // OTS commitment or NIP-03 event ID
  timestamp: Date;
  publishedAt?: Date;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// UI State Management
// ============================================================================

export interface OnboardingSessionState {
  session: OnboardingSession | null;
  currentParticipant: OnboardingParticipant | null;
  participantQueue: OnboardingParticipant[];
  isLoading: boolean;
  error: string | null;
}

export interface OnboardingStepProps {
  participant: OnboardingParticipant;
  onNext: (data: Partial<OnboardingParticipant>) => void;
  onBack: () => void;
  onError: (error: string) => void;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateSessionRequest {
  mode: OnboardingMode;
  expiresInMinutes?: number;
}

export interface CreateSessionResponse {
  session: OnboardingSession;
}

export interface RegisterParticipantRequest {
  sessionId: string;
  trueName: string;
  displayName?: string;
  language: string;
  /** Indicates if participant already has an existing Nostr npub (drives migration flow) */
  existingNostrAccount?: boolean;
  /** Indicates if participant already has an existing Lightning wallet */
  existingLightningWallet?: boolean;
  migrationFlag: boolean;
  oldNpub?: string;
  technicalComfort?: TechnicalComfort;
}

export interface RegisterParticipantResponse {
  participant: OnboardingParticipant;
}

export interface GenerateOTPRequest {
  participantId: string;
  oldNpub: string;
  newNpub: string;
}

export interface GenerateOTPResponse {
  otpSessionId: string;
  expiresAt: Date;
}

export interface VerifyOTPRequest {
  otpSessionId: string;
  otp: string;
}

export interface VerifyOTPResponse {
  verified: boolean;
  migrationId?: string;
}

export interface RegisterCardRequest {
  participantId: string;
  cardUid: string;
  cardType: NFCCardType;
  pinHash?: string;
  pinSalt?: string;
  lnbitsCardId?: string;
}

export interface RegisterCardResponse {
  card: NFCCard;
}

export interface PublishAttestationRequest {
  participantId: string;
  type: AttestationType;
  commitment: string;
}

export interface PublishAttestationResponse {
  attestation: OnboardingAttestation;
}
