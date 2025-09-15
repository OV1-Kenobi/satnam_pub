/**
 * Hybrid Message Signing System
 *
 * Implements multi-method signing approach for gift-wrapped messages:
 * 1. NIP-07 Browser Extension (Preferred - Zero Knowledge)
 * 2. Session-Based Signing (Fallback - Convenient)
 * 3. Future NFC Physical MFA (Most Secure)
 *
 * Maintains compatibility with anon-key + custom JWT authentication
 * and preserves zero-knowledge privacy architecture.
 */

import { Event as NostrEvent } from "nostr-tools";
import {
  SigningMethod,
  userSigningPreferences,
} from "../user-signing-preferences";
// CEPS singleton (exported as central_event_publishing_service)
import { central_event_publishing_service as CEPS } from "../../../lib/central_event_publishing_service";

// Security level types
export type SecurityLevel = "maximum" | "high" | "medium" | "low";

export interface SigningResult {
  success: boolean;
  signedEvent?: NostrEvent;
  method: SigningMethod;
  securityLevel: SecurityLevel;
  error?: string;
  userMessage?: string;
  timestamp: number;
}
// Align with user-signing-preferences SigningMethodInfo
export interface SigningMethodInfo {
  id: SigningMethod;
  name: string;
  description: string;
  securityLevel: SecurityLevel;
  convenience: "high" | "medium" | "low";
  available: boolean;
  requiresSetup: boolean;
  setupInstructions?: string;
  // extra metadata retained for UI but not required elsewhere
  requiresExtension?: boolean;
  requiresAuthentication?: boolean;
  comingSoon?: boolean;
}

export class HybridMessageSigning {
  constructor() {}

  /**
   * Sign message using hybrid approach with automatic fallback
   * @param event - Unsigned Nostr event
   * @returns Promise<SigningResult>
   */
  async signMessage(event: Partial<NostrEvent>): Promise<SigningResult> {
    console.log(
      "🔐 HybridMessageSigning: Starting user-preference-aware signing"
    );

    // Load user preferences to respect their choices
    const preferences = await userSigningPreferences.getUserPreferences();

    if (preferences) {
      console.log("🔐 HybridMessageSigning: Using user preferences:", {
        preferred: preferences.preferredMethod,
        fallback: preferences.fallbackMethod,
        autoFallback: preferences.autoFallback,
      });

      // Try preferred method first
      const preferredResult = await this.attemptMethodSigning(
        event,
        preferences.preferredMethod
      );
      if (preferredResult.success) {
        console.log(
          `🔐 HybridMessageSigning: Preferred method (${preferences.preferredMethod}) successful`
        );
        await userSigningPreferences.recordMethodUsage(
          preferences.preferredMethod
        );
        return preferredResult;
      }

      // Try fallback method if auto-fallback is enabled
      if (
        preferences.autoFallback &&
        preferences.fallbackMethod &&
        preferences.fallbackMethod !== preferences.preferredMethod
      ) {
        console.log(
          `🔐 HybridMessageSigning: Trying fallback method (${preferences.fallbackMethod})`
        );
        const fallbackResult = await this.attemptMethodSigning(
          event,
          preferences.fallbackMethod
        );
        if (fallbackResult.success) {
          console.log(
            `🔐 HybridMessageSigning: Fallback method (${preferences.fallbackMethod}) successful`
          );
          await userSigningPreferences.recordMethodUsage(
            preferences.fallbackMethod
          );
          return fallbackResult;
        }
      }
    } else {
      // No preferences found — default to session only; NIP‑07 is opt‑in
      console.log(
        "🔐 HybridMessageSigning: No user preferences; using session-only (NIP-07 opt-in)"
      );

      const sessionResult = await this.attemptSessionSigning(event);
      if (sessionResult.success) {
        return sessionResult;
      }

      // Do NOT auto-fallback to NIP-07 here
      return {
        success: false,
        method: "session",
        securityLevel: "high",
        error: "No active secure session available",
        userMessage:
          "Create a signing session or set NIP-07 as your preferred method.",
        timestamp: Date.now(),
      };
    }

    console.log(
      "🔐 HybridMessageSigning: All available signing methods failed"
    );

    // Return user-friendly error based on preferences
    const preferredMethod = preferences?.preferredMethod || "session";
    return {
      success: false,
      method: preferredMethod,
      securityLevel: "low",
      error: this.getMethodSpecificError(preferredMethod),
      userMessage: this.getMethodSpecificUserMessage(preferredMethod),
      timestamp: Date.now(),
    };
  }

  /**
   * Attempt NIP-07 browser extension signing
   * @param event - Unsigned Nostr event
   * @returns Promise<SigningResult>
   */
  private async attemptNIP07Signing(
    event: Partial<NostrEvent>
  ): Promise<SigningResult> {
    try {
      // Check if NIP-07 extension is available
      if (typeof window === "undefined" || !window.nostr) {
        return {
          success: false,
          method: "nip07",
          securityLevel: "maximum",
          error: "NIP-07 browser extension not available",
          userMessage:
            "Please install a NIP-07 compatible browser extension (e.g., Alby, nos2x)",
          timestamp: Date.now(),
        };
      }

      // Prepare event for signing
      const eventToSign = {
        ...event,
        created_at: event.created_at || Math.floor(Date.now() / 1000),
        pubkey: event.pubkey || (await window.nostr.getPublicKey()),
      };

      console.log("🔐 HybridMessageSigning: Requesting NIP-07 signature...");

      // Sign with browser extension
      const signedEvent = await window.nostr.signEvent(eventToSign);

      return {
        success: true,
        signedEvent: signedEvent as NostrEvent,
        method: "nip07",
        securityLevel: "maximum",
        userMessage:
          "Message signed with NIP-07 browser extension (most secure)",
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "NIP-07 signing failed";

      return {
        success: false,
        method: "nip07",
        securityLevel: "maximum",
        error: errorMessage,
        userMessage: "NIP-07 signing failed. User may have denied the request.",
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Attempt session-based signing using SecureNsecManager
   * @param event - Unsigned Nostr event
   * @returns Promise<SigningResult>
   */
  private async attemptSessionSigning(
    event: Partial<NostrEvent>
  ): Promise<SigningResult> {
    try {
      console.log(
        "🔐 HybridMessageSigning: Attempting session-based signing..."
      );

      // Ask CEPS if a signing session exists (RecoverySessionBridge or SecureNsecManager)
      const sessionId = CEPS.getActiveSigningSessionId();
      console.log(
        "🔐 HybridMessageSigning: CEPS session check:",
        sessionId ? "EXISTS" : "NONE"
      );

      if (!sessionId) {
        console.log("🔐 HybridMessageSigning: No active session available");
        return {
          success: false,
          method: "session",
          securityLevel: "high",
          error: "No active secure session available",
          userMessage:
            "Please create a signing session using your recovery credentials or sign in to create a secure session",
          timestamp: Date.now(),
        };
      }

      // Inject pubkey before delegating to CEPS
      const pubkeyHex = await (
        CEPS as unknown as {
          getUserPubkeyHexForVerification: () => Promise<string>;
        }
      ).getUserPubkeyHexForVerification();
      const eventToSign = {
        ...event,
        pubkey: (event as any).pubkey ?? pubkeyHex,
        created_at: event.created_at || Math.floor(Date.now() / 1000),
      };
      const signedEvent = await CEPS.signEventWithActiveSession(eventToSign);

      return {
        success: true,
        signedEvent: signedEvent as NostrEvent,
        method: "session",
        securityLevel: "high",
        userMessage:
          "Message signed with secure session (convenient but less secure than NIP-07)",
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Session-based signing failed";
      console.error(
        "🔐 HybridMessageSigning: Session signing error:",
        errorMessage
      );

      return {
        success: false,
        method: "session",
        securityLevel: "high",
        error: errorMessage,
        userMessage: "Session signing failed. Please sign in again.",
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Get available signing methods for user education
   * @returns Promise<SigningMethodInfo[]>
   */
  async getAvailableSigningMethods(): Promise<SigningMethodInfo[]> {
    const methods: SigningMethodInfo[] = [];

    // NFC Physical MFA (Future - Most Secure)
    methods.push({
      id: "nfc",
      name: "NFC Physical MFA",
      description: "Hardware-based signing with physical device (most secure)",
      securityLevel: "maximum",
      convenience: "low",
      available: false,
      requiresSetup: true,
      setupInstructions:
        "NFC Physical MFA will be available in a future update",
      comingSoon: true,
    });

    // Secure Session (Primary Method) via CEPS session bridge
    const activeSessionId = CEPS.getActiveSigningSessionId();
    const hasActiveSession = !!activeSessionId;
    console.log("🔐 HybridMessageSigning: Session availability check:", {
      activeSessionId: activeSessionId ? "EXISTS" : "NONE",
      hasActiveSession,
      available: hasActiveSession,
    });

    methods.push({
      id: "session",
      name: "Secure Session",
      description:
        "Temporary key storage for convenient signing (primary method)",
      securityLevel: "high",
      convenience: "high",
      available: hasActiveSession,
      requiresSetup: true,
      setupInstructions:
        "Sign in to create a secure session for message signing",
      requiresAuthentication: true,
    });

    // NIP-07 Browser Extension (Fallback)
    const hasNIP07 = typeof window !== "undefined" && !!window.nostr;
    console.log("🔐 HybridMessageSigning: NIP-07 availability check:", {
      hasWindow: typeof window !== "undefined",
      hasNostr: typeof window !== "undefined" && !!window.nostr,
      available: hasNIP07,
    });

    methods.push({
      id: "nip07",
      name: "NIP-07 Browser Extension",
      description:
        "Zero-knowledge signing with browser extension (fallback method)",
      securityLevel: "maximum",
      convenience: "medium",
      available: hasNIP07,
      requiresSetup: !hasNIP07,
      setupInstructions:
        "Install a NIP-07 compatible browser extension like Alby or nos2x",
      requiresExtension: true,
    });

    console.log(
      "🔐 HybridMessageSigning: Available methods summary:",
      methods.map((m) => ({ name: m.name, available: m.available }))
    );

    return methods;
  }

  /**
   * Check if any signing method is available
   * @returns Promise<boolean>
   */
  async hasAvailableSigningMethod(): Promise<boolean> {
    const methods = await this.getAvailableSigningMethods();
    return methods.some((method) => method.available && !method.comingSoon);
  }

  /**
   * Attempt signing with a specific method
   * @param event - Unsigned Nostr event
   * @param method - Signing method to attempt
   * @returns Promise<SigningResult>
   */
  private async attemptMethodSigning(
    event: Partial<NostrEvent>,
    method: SigningMethod
  ): Promise<SigningResult> {
    switch (method) {
      case "session":
        return await this.attemptSessionSigning(event);
      case "nip07":
        return await this.attemptNIP07Signing(event);
      case "nfc":
        // NFC not implemented yet
        return {
          success: false,
          method: "nfc",
          securityLevel: "maximum",
          error: "NFC Physical MFA not yet available",
          userMessage: "NFC Physical MFA will be available in a future update",
          timestamp: Date.now(),
        };
      default:
        return {
          success: false,
          method: method,
          securityLevel: "low",
          error: `Unknown signing method: ${method}`,
          userMessage: "Invalid signing method selected",
          timestamp: Date.now(),
        };
    }
  }

  /**
   * Get method-specific error message
   * @param method - Signing method
   * @returns Error message
   */
  private getMethodSpecificError(method: SigningMethod): string {
    switch (method) {
      case "session":
        return "No active secure session available. Please sign in to create a session.";
      case "nip07":
        return "NIP-07 browser extension not available. Please install a compatible extension.";
      case "nfc":
        return "NFC Physical MFA not yet available.";
      default:
        return "No signing methods available.";
    }
  }

  /**
   * Get method-specific user message
   * @param method - Signing method
   * @returns User-friendly message
   */
  private getMethodSpecificUserMessage(method: SigningMethod): string {
    switch (method) {
      case "session":
        return "Sign in to create a secure session for convenient message signing.";
      case "nip07":
        return "Install a NIP-07 browser extension like Alby or nos2x for secure message signing.";
      case "nfc":
        return "NFC Physical MFA will provide the highest security when available in a future update.";
      default:
        return "Please configure a signing method in your Privacy & Security settings.";
    }
  }
}

// Global instance for easy access
export const hybridMessageSigning = new HybridMessageSigning();
