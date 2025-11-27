/**
 * Phase 4: Geo Payment Types
 *
 * Type definitions for geo-room payment integration.
 * Enables safe, optional payments initiated from geo-room contexts
 * with trust-aware safeguards and account context detection.
 */

// ============================================================================
// Trust Level Types
// ============================================================================

/**
 * Trust levels for geo-room contacts in payment context.
 * Determines warning thresholds and blocking behavior.
 */
export type GeoPaymentTrustLevel = "unknown" | "known" | "verified";

/**
 * Payment warning severity levels
 */
export type PaymentWarningSeverity = "info" | "warning" | "block";

/**
 * Payment warning returned when trust thresholds are exceeded
 */
export interface PaymentWarning {
  severity: PaymentWarningSeverity;
  message: string;
  trustLevel: GeoPaymentTrustLevel;
  amount: number;
  threshold: number;
  /** If true, payment should be blocked entirely */
  shouldBlock: boolean;
}

// ============================================================================
// Account Context Types
// ============================================================================

/**
 * Account type detection for payment modal routing.
 * - "individual": Private user, uses individual payment modal
 * - "federation": Family federation member, uses federated group payment modal
 */
export type AccountType = "individual" | "federation";

/**
 * Account context for payment routing decisions.
 * Determines which payment modal and approval workflow to use.
 */
export interface AccountContext {
  type: AccountType;
  /** User's npub */
  userNpub: string;
  /** Family federation ID (if federation member) */
  federationId?: string;
  /** Federation name for display (if federation member) */
  federationName?: string;
  /** Whether guardian approval may be required (federation only) */
  hasGuardianApproval?: boolean;
}

// ============================================================================
// Geo Payment Context Types
// ============================================================================

/**
 * Payment method hints for routing preference.
 * "auto" allows determineOptimalRouting() to select.
 */
export type PaymentMethodHint = "lightning" | "cashu" | "fedimint" | "auto";

/**
 * Privacy level for payment metadata protection.
 * "auto" is the default, allowing automatic selection.
 */
export type PaymentPrivacyLevel = "minimal" | "encrypted" | "giftwrapped" | "auto";

/**
 * Context extracted from a geo-room message for payment initiation.
 * Contains all information needed to pre-fill a payment form.
 */
export interface GeoPaymentContext {
  /** Truncated origin geohash (precision-4, ~20km) */
  originGeohash: string;
  /** Recipient's Nostr public key (npub or hex) */
  recipientNpub: string;
  /** Display name for recipient (from profile or NIP-05) */
  recipientDisplayName?: string;
  /** Lightning address if known */
  recipientLightningAddress?: string;
  /** Trust level of the recipient contact */
  trustLevel: GeoPaymentTrustLevel;
  /** Preferred payment method hint */
  paymentMethodHint: PaymentMethodHint;
  /** Account context for modal routing */
  accountContext: AccountContext;
}

/**
 * Request parameters for creating a geo-room payment.
 */
export interface GeoPaymentRequest {
  context: GeoPaymentContext;
  /** Amount in satoshis */
  amount: number;
  /** Optional payment memo/description */
  memo?: string;
  /** Privacy level (default: "auto") */
  privacyLevel: PaymentPrivacyLevel;
  /** Maximum fee in satoshis (default: 1000) */
  maxFee?: number;
}

/**
 * Result of a geo-room payment attempt.
 */
export interface GeoPaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  errorType?: "insufficient_funds" | "network_error" | "authorization_failed" | "recipient_invalid" | "blocked_by_trust" | "unknown";
  /** Which routing method was actually used */
  routingUsed?: string;
  /** Fee paid in satoshis */
  fee?: number;
}

// ============================================================================
// Trust Threshold Configuration
// ============================================================================

/**
 * Configurable trust thresholds for payment warnings and blocks.
 * All amounts in satoshis.
 */
export interface TrustThresholdConfig {
  /** Threshold for warning on unknown contacts (default: 5000) */
  unknownWarnThreshold: number;
  /** Threshold for blocking unknown contacts (default: 50000) */
  unknownBlockThreshold: number;
  /** Threshold for warning on known contacts (default: 50000) */
  knownWarnThreshold: number;
  /** Verified contacts have no automatic blocks */
}

/**
 * Default trust thresholds as confirmed in Phase 4 spec.
 */
export const DEFAULT_TRUST_THRESHOLDS: TrustThresholdConfig = {
  unknownWarnThreshold: 5000,
  unknownBlockThreshold: 50000,
  knownWarnThreshold: 50000,
};

/**
 * Error class for geo payment operations
 */
export class GeoPaymentError extends Error {
  constructor(
    message: string,
    public readonly code: "TRUST_BLOCKED" | "INVALID_CONTEXT" | "PAYMENT_FAILED" | "ACCOUNT_ERROR",
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GeoPaymentError";
  }
}

