/**
 * Tapsigner NFC Card Integration - Type Definitions
 * Phase 1: Physical MFA with ECDSA signature verification
 * 
 * Privacy-First Architecture:
 * - Card IDs are hashed with per-user salts
 * - Public keys only (no private keys stored)
 * - ECDSA secp256k1 for signature verification
 * - Zero-knowledge design (server never sees plaintext card UID)
 */

/**
 * Registered Tapsigner Card
 * Represents a card that has been registered with the user's account
 */
export interface TapsignerCard {
  /** Unique card identifier (hashed) */
  cardId: string;

  /** ECDSA secp256k1 public key in hex format */
  publicKeyHex: string;

  /** BIP32 extended public key (optional, for advanced features) */
  xpub?: string;

  /** BIP32 derivation path (default: m/84h/0h/0h for Bitcoin) */
  derivationPath: string;

  /** Family role for this card (private, offspring, adult, steward, guardian) */
  familyRole: "private" | "offspring" | "adult" | "steward" | "guardian";

  /** Timestamp when card was created */
  createdAt?: Date;

  /** Timestamp of last successful authentication */
  lastUsed?: Date;
}

/**
 * ECDSA Signature
 * Represents an ECDSA signature from Tapsigner card
 */
export interface ECDSASignature {
  /** Signature r component (hex) */
  r: string;

  /** Signature s component (hex) */
  s: string;

  /** Recovery ID (optional, for key recovery) */
  v?: number;
}

/**
 * Tapsigner Authentication Response
 * Response from server after signature verification
 */
export interface TapsignerAuthResponse {
  /** Whether authentication was successful */
  success: boolean;

  /** Session token for authenticated requests */
  sessionToken?: string;

  /** User's Nostr public key (npub) */
  userNpub?: string;

  /** User's family role */
  familyRole?: string;

  /** Wallet access information */
  walletAccess?: {
    walletId: string;
    spendLimitSats: number;
    tapToSpendEnabled: boolean;
  };

  /** Error message if authentication failed */
  error?: string;
}

/**
 * Tapsigner LNbits Link
 * Maps a Tapsigner card to an LNbits wallet for payment authorization
 */
export interface TapsignerLnbitsLink {
  /** Tapsigner card ID */
  cardId: string;

  /** LNbits wallet ID */
  walletId: string;

  /** Daily spend limit in satoshis */
  spendLimitSats: number;

  /** Whether tap-to-spend is enabled for this card */
  tapToSpendEnabled: boolean;

  /** Timestamp when link was created */
  createdAt?: Date;

  /** Timestamp of last update */
  updatedAt?: Date;
}

/**
 * Tapsigner Operation
 * Audit trail entry for Tapsigner operations
 */
export interface TapsignerOperation {
  /** Unique operation ID */
  id: string;

  /** Type of operation performed */
  operationType:
    | "register"
    | "auth"
    | "sign"
    | "payment"
    | "verify"
    | "error";

  /** Whether operation was successful */
  success: boolean;

  /** Error message if operation failed */
  errorMessage?: string;

  /** Signature hex if operation involved signing */
  signatureHex?: string;

  /** Timestamp of operation */
  timestamp: Date;

  /** Additional metadata (JSON) */
  metadata?: Record<string, any>;
}

/**
 * Tapsigner Registration Request
 * Request to register a new Tapsigner card
 */
export interface TapsignerRegistrationRequest {
  /** Hashed card ID */
  cardId: string;

  /** ECDSA secp256k1 public key (hex) */
  publicKey: string;

  /** BIP32 extended public key (optional) */
  xpub?: string;

  /** BIP32 derivation path (optional) */
  derivationPath?: string;

  /** Family role for this card (optional, default: private) */
  familyRole?: "private" | "offspring" | "adult" | "steward" | "guardian";
}

/**
 * Tapsigner Registration Response
 * Response from server after card registration
 */
export interface TapsignerRegistrationResponse {
  /** Whether registration was successful */
  success: boolean;

  /** Registered card details */
  card?: TapsignerCard;

  /** Error message if registration failed */
  error?: string;
}

/**
 * Tapsigner Verification Request
 * Request to verify a Tapsigner signature
 */
export interface TapsignerVerificationRequest {
  /** Hashed card ID */
  cardId: string;

  /** ECDSA secp256k1 public key (hex) */
  publicKey: string;

  /** ECDSA signature to verify */
  signature: ECDSASignature;

  /** Challenge that was signed */
  challenge: string;
}

/**
 * Tapsigner LNbits Link Request
 * Request to link a Tapsigner card to an LNbits wallet
 */
export interface TapsignerLnbitsLinkRequest {
  /** Hashed card ID */
  cardId: string;

  /** LNbits wallet ID */
  walletId: string;

  /** Daily spend limit in satoshis (optional, default: 50000) */
  spendLimitSats?: number;

  /** Enable tap-to-spend (optional, default: false) */
  tapToSpendEnabled?: boolean;
}

/**
 * Tapsigner LNbits Link Response
 * Response from server after linking card to wallet
 */
export interface TapsignerLnbitsLinkResponse {
  /** Whether linking was successful */
  success: boolean;

  /** Link details */
  link?: TapsignerLnbitsLink;

  /** Error message if linking failed */
  error?: string;
}

/**
 * Tapsigner Status
 * Current status of a Tapsigner card
 */
export interface TapsignerStatus {
  /** Card ID */
  cardId: string;

  /** Whether card is registered */
  isRegistered: boolean;

  /** Whether card is linked to a wallet */
  isLinkedToWallet: boolean;

  /** Linked wallet ID (if applicable) */
  linkedWalletId?: string;

  /** Number of failed PIN attempts */
  pinAttempts: number;

  /** Whether card is currently locked */
  isLocked: boolean;

  /** Timestamp when card will be unlocked (if locked) */
  unlockedAt?: Date;

  /** Last successful authentication timestamp */
  lastUsed?: Date;
}

/**
 * Tapsigner Configuration
 * Configuration for Tapsigner integration
 */
export interface TapsignerConfig {
  /** Master toggle for Tapsigner integration */
  enabled: boolean;

  /** LNbits integration enabled */
  lnbitsEnabled: boolean;

  /** Tap-to-spend functionality enabled */
  tapToSpendEnabled: boolean;

  /** Debug logging enabled */
  debugEnabled: boolean;

  /** Default daily spend limit in satoshis */
  defaultSpendLimitSats: number;

  /** Maximum PIN attempts before lockout */
  maxPinAttempts: number;

  /** PIN lockout duration in seconds */
  pinLockoutDurationSeconds: number;
}

