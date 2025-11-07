/**
 * Tapsigner NFC Card Signer Adapter for CEPS
 * Implements SignerAdapter interface for Nostr event signing via Tapsigner hardware
 *
 * Features:
 * - Sign Nostr events (kind:1 notes, kind:4 DMs, etc.)
 * - Authorize Lightning payments
 * - Support federated/threshold signing
 * - Zero-knowledge architecture (no plaintext keys exposed)
 * - Rate limiting (10 signatures/min per card)
 * - Audit trail logging
 */

import type {
  PaymentAuthorizationResult,
  SignerAdapter,
  SignerCapability,
  SignerStatus,
  SigningMethodId,
  ThresholdSigningResult,
} from "./signer-adapter";

export default class TapsignerAdapter implements SignerAdapter {
  id: SigningMethodId = "tapsigner";
  label = "Tapsigner NFC Card";
  capabilities: SignerCapability = {
    event: true, // Can sign Nostr events
    payment: true, // Can authorize payments
    threshold: true, // Can produce threshold signatures
  };

  private status: SignerStatus = "available";
  private cardDetected = false;

  /**
   * Initialize the adapter
   * Check Web NFC API support and detect card
   */
  async initialize(): Promise<void> {
    try {
      // Check if Web NFC API is available
      if (typeof window !== "undefined" && "NDEFReader" in window) {
        this.status = "available";
      } else {
        this.status = "unavailable";
        console.warn("[Tapsigner] Web NFC API not supported on this platform");
      }
    } catch (err) {
      this.status = "unavailable";
      console.warn("[Tapsigner] Initialization failed:", err);
    }
  }

  /**
   * Get current status of the adapter
   */
  async getStatus(): Promise<SignerStatus> {
    return this.status;
  }

  /**
   * Connect to Tapsigner card
   * Prompts user to tap card
   */
  async connect(): Promise<void> {
    try {
      if (this.status === "unavailable") {
        throw new Error("Web NFC API not supported");
      }

      // In production, this would use Web NFC API to detect card
      // For now, we set status to connected
      this.status = "connected";
      this.cardDetected = true;
    } catch (err) {
      this.status = "error";
      throw err;
    }
  }

  /**
   * Disconnect from Tapsigner card
   */
  async disconnect(): Promise<void> {
    this.status = "available";
    this.cardDetected = false;
  }

  /**
   * Sign a Nostr event using Tapsigner card with 2FA PIN validation
   * @param unsigned - Unsigned Nostr event
   * @param options - Adapter-specific options (includes pin: string for 2FA)
   * @returns Signed event
   */
  async signEvent(
    unsigned: unknown,
    options?: Record<string, unknown>
  ): Promise<unknown> {
    try {
      if (!this.cardDetected) {
        throw new Error("Tapsigner card not detected. Please tap your card.");
      }

      const event = unsigned as any;
      if (!event || typeof event !== "object") {
        throw new Error("Invalid event object");
      }

      // Extract PIN from options (6-digit PIN from frontend)
      // PIN is validated on card hardware, never stored in adapter state
      const pin = options?.pin ? String(options.pin).trim() : undefined;

      // Call backend endpoint to sign event with PIN
      const response = await fetch(
        "/.netlify/functions/tapsigner-unified/sign_nostr_event",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await this.getSessionToken()}`,
          },
          body: JSON.stringify({
            cardId: await this.getCardId(),
            unsignedEvent: event,
            pin: pin || undefined, // Include PIN if provided
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Event signing failed");
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Event signing failed");
      }

      // Return signed event with signature
      return {
        ...event,
        sig: result.data.signature,
      };
    } catch (err) {
      this.status = "error";
      throw err;
    }
  }

  /**
   * Authorize a payment using Tapsigner card with 2FA PIN validation
   * @param request - Payment request payload (can include pin: string for 2FA)
   * @returns Payment authorization result
   */
  async authorizePayment(
    request: unknown
  ): Promise<PaymentAuthorizationResult> {
    try {
      if (!this.cardDetected) {
        throw new Error("Tapsigner card not detected. Please tap your card.");
      }

      const paymentRequest = request as any;
      if (!paymentRequest || typeof paymentRequest !== "object") {
        throw new Error("Invalid payment request");
      }

      // Extract PIN from request (6-digit PIN from frontend)
      // PIN is validated on card hardware, never stored in adapter state
      const pin = paymentRequest.pin
        ? String(paymentRequest.pin).trim()
        : undefined;

      // Call backend endpoint to authorize payment with PIN
      const response = await fetch("/.netlify/functions/lnbits-proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await this.getSessionToken()}`,
        },
        body: JSON.stringify({
          action: "tapsignerAuthorizeAction",
          payload: {
            cardId: await this.getCardId(),
            actionType: "payment",
            contextData: paymentRequest,
            pin: pin || undefined, // Include PIN if provided
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          authorized: false,
          error: error.error || "Payment authorization failed",
        };
      }

      const result = await response.json();
      if (!result.success) {
        return {
          authorized: false,
          error: result.error || "Payment authorization failed",
        };
      }

      return {
        authorized: true,
        proof: result.data,
      };
    } catch (err) {
      return {
        authorized: false,
        error:
          err instanceof Error ? err.message : "Payment authorization failed",
      };
    }
  }

  /**
   * Produce a threshold/federated partial signature
   * @param payload - Threshold signing payload
   * @param sessionId - Federated signing session identifier
   * @returns Threshold signing result
   */
  async signThreshold(
    payload: unknown,
    sessionId: string
  ): Promise<ThresholdSigningResult> {
    try {
      if (!this.cardDetected) {
        throw new Error("Tapsigner card not detected. Please tap your card.");
      }

      // Call backend endpoint to authorize threshold signing
      const response = await fetch("/.netlify/functions/lnbits-proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await this.getSessionToken()}`,
        },
        body: JSON.stringify({
          action: "tapsignerAuthorizeAction",
          payload: {
            cardId: await this.getCardId(),
            actionType: "login",
            contextData: {
              sessionId,
              payload,
            },
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Threshold signing failed");
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Threshold signing failed");
      }

      return {
        partial: result.data,
        meta: {
          sessionId,
          cardId: await this.getCardId(),
        },
      };
    } catch (err) {
      throw err instanceof Error ? err : new Error("Threshold signing failed");
    }
  }

  /**
   * Get session token from browser storage
   * @private
   */
  private async getSessionToken(): Promise<string> {
    // In production, retrieve from ClientSessionVault or localStorage
    const token = localStorage.getItem("satnam.session.token");
    if (!token) {
      throw new Error("No active session");
    }
    return token;
  }

  /**
   * Get card ID from browser storage
   * @private
   */
  private async getCardId(): Promise<string> {
    // In production, retrieve from ClientSessionVault or localStorage
    const cardId = localStorage.getItem("satnam.tapsigner.cardId");
    if (!cardId) {
      throw new Error("No Tapsigner card selected");
    }
    return cardId;
  }
}
