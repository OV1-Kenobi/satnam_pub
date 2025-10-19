/**
 * SignerAdapter interface and core signing types
 *
 * This abstraction allows pluggable signing backends (NIP-05/password, NIP-07, NIP-46/NIP-55 Amber,
 * NTAG424 physical MFA) to be registered with CEPS and used for:
 *  - Event signing (single-user Nostr events and NIP-42 AUTH challenges)
 *  - Payment authorization signing (e.g., LNbits transactions)
 *  - Threshold/federated signing (partial signatures for m-of-n workflows)
 *
 * Browser-only, zero-knowledge friendly. No Node.js APIs. Web Crypto only where needed.
 */

export type SigningMethodId = "nip05_password" | "nip07" | "amber" | "ntag424";

/**
 * Actions that require signing. Used by CEPS routing and adapters for capability checks.
 */
export type SignAction = "event" | "payment" | "threshold";

/**
 * Current status of a signer adapter.
 * - unavailable: not supported on this platform or missing prerequisites
 * - available: supported and ready to connect/initialize
 * - connected: has an active connection/session
 * - locked: requires user unlock/auth (e.g., vault locked, NFC PIN required)
 * - error: adapter encountered an error condition
 */
export type SignerStatus =
  | "unavailable"
  | "available"
  | "connected"
  | "locked"
  | "error";

/**
 * Declares which actions this adapter supports.
 */
export interface SignerCapability {
  event: boolean;
  payment: boolean;
  threshold: boolean;
}

/**
 * Result from payment authorization. Proof may be a signed event or method-specific artifact.
 */
export interface PaymentAuthorizationResult {
  authorized: boolean;
  proof?: unknown;
  error?: string;
}

/**
 * Result from threshold signing. Partial is adapter-specific partial signature or share.
 */
export interface ThresholdSigningResult {
  partial: unknown;
  meta?: Record<string, unknown>;
}

/**
 * Unified adapter interface. Concrete implementations must be browser-compatible and avoid
 * persisting plaintext secrets. All sensitive operations should be interactive or gated by policy
 * (e.g., ClientSessionVault unlock, NTAG424 PIN, extension prompt).
 */
export interface SignerAdapter {
  /** Stable identifier for this adapter */
  id: SigningMethodId;
  /** Human-readable label for UI */
  label: string;
  /** Capability flags indicating supported actions */
  capabilities: SignerCapability;

  /**
   * Initialize the adapter (detect availability, hydrate session handles, etc.).
   * Should not prompt the user.
   */
  initialize(): Promise<void>;

  /**
   * Report current status for UI and routing decisions.
   */
  getStatus(): Promise<SignerStatus>;

  /**
   * Optional: Establish a connection/session (e.g., Nostr Connect pairing). May prompt user.
   */
  connect?(): Promise<void>;

  /**
   * Optional: Disconnect or dispose any active session.
   */
  disconnect?(): Promise<void>;

  /**
   * Sign a single Nostr event or challenge using the adapter's method.
   * @param unsigned - Unsigned Nostr event (including kind/created_at/tags/content)
   * @param options - Adapter-specific options (e.g., prompt behavior)
   * @returns Signed event (must pass CEPS.verifyEvent)
   */
  signEvent(unsigned: unknown, options?: Record<string, unknown>): Promise<unknown>;

  /**
   * Authorize a payment (e.g., LNbits). Implementations may produce a signed event or a
   * method-specific proof acceptable to the payment subsystem.
   * @param request - Arbitrary payment request payload (amount, invoice, metadata, etc.)
   */
  authorizePayment(request: unknown): Promise<PaymentAuthorizationResult>;

  /**
   * Produce a threshold/federated partial signature or approval artifact.
   * @param payload - Threshold signing payload for this session
   * @param sessionId - Federated signing session identifier
   */
  signThreshold(payload: unknown, sessionId: string): Promise<ThresholdSigningResult>;
}

export type { SignerCapability as TSignerCapability };

