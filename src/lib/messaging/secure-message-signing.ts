/**
 * Secure Message Signing Service
 *
 * Provides dual authentication pathways for Nostr message signing:
 * 1. NIP-07 Browser Extension (PREFERRED) - Zero-knowledge approach
 * 2. Encrypted Nsec Retrieval (FALLBACK) - Secure database retrieval with user consent
 *
 * Supports all Nostr messaging protocols:
 * - Group messaging (NIP-58)
 * - Gift-wrapped direct messages (NIP-59)
 * - Invitation messages
 * - General Nostr events
 */

import React from "react";
import { useAuth } from "../../components/auth/AuthProvider";

// Signing method types
export type SigningMethod = "nip07" | "encrypted-nsec";

// Message types that require signing
export type MessageType =
  | "group-message"
  | "direct-message"
  | "invitation"
  | "general-event";

// Signing configuration
export interface SigningConfig {
  method: SigningMethod;
  requireUserConsent: boolean;
  sessionTimeout?: number; // For encrypted-nsec method
  securityWarnings: boolean;
}

// Event to be signed
export interface UnsignedEvent {
  kind: number;
  content: string;
  tags: string[][];
  created_at?: number;
  pubkey?: string;
}

// Signed event result
export interface SignedEvent extends UnsignedEvent {
  id: string;
  pubkey: string;
  sig: string;
  created_at: number;
}

// Signing result
export interface SigningResult {
  success: boolean;
  signedEvent?: SignedEvent;
  error?: string;
  method: SigningMethod;
  timestamp: number;
}

// User consent for nsec access
export interface NsecConsentData {
  granted: boolean;
  timestamp: number;
  sessionId: string;
  expiresAt: number;
  warningAcknowledged: boolean;
}

// Signing session for encrypted nsec
export interface SigningSession {
  sessionId: string;
  userId: string;
  method: SigningMethod;
  createdAt: number;
  expiresAt: number;
  isActive: boolean;
}

/**
 * Secure Message Signing Hook
 */
export function useSecureMessageSigning() {
  const auth = useAuth();
  const [signingPreference, setSigningPreference] =
    React.useState<SigningMethod>("nip07");
  const [activeSession, setActiveSession] =
    React.useState<SigningSession | null>(null);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [showConsentModal, setShowConsentModal] = React.useState(false);
  const [showMethodSelectionModal, setShowMethodSelectionModal] =
    React.useState(false);
  const [pendingSigningRequest, setPendingSigningRequest] = React.useState<{
    event: UnsignedEvent;
    messageType: MessageType;
    resolve: (result: SigningResult) => void;
  } | null>(null);

  /**
   * Check if NIP-07 browser extension is available
   */
  const isNIP07Available = (): boolean => {
    return !!(
      typeof window !== "undefined" &&
      window.nostr &&
      typeof window.nostr.signEvent === "function"
    );
  };

  /**
   * Sign event using NIP-07 browser extension (PREFERRED METHOD)
   */
  const signWithNIP07 = async (
    event: UnsignedEvent
  ): Promise<SigningResult> => {
    try {
      if (!isNIP07Available()) {
        return {
          success: false,
          error: "NIP-07 browser extension not available",
          method: "nip07",
          timestamp: Date.now(),
        };
      }

      // Prepare event for signing
      if (!window.nostr) {
        throw new Error("NIP-07 extension not available");
      }

      const eventToSign = {
        ...event,
        created_at: event.created_at || Math.floor(Date.now() / 1000),
        pubkey: event.pubkey || (await window.nostr.getPublicKey()),
      };

      // Sign with browser extension
      const signedEvent = await window.nostr.signEvent(eventToSign);

      return {
        success: true,
        signedEvent: signedEvent as SignedEvent,
        method: "nip07",
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "NIP-07 signing failed";
      setLastError(errorMessage);

      return {
        success: false,
        error: errorMessage,
        method: "nip07",
        timestamp: Date.now(),
      };
    }
  };

  /**
   * Request explicit method selection from user when preferred method unavailable
   */
  const requestMethodSelection = async (
    messageType: MessageType
  ): Promise<SigningMethod | null> => {
    return new Promise((resolve) => {
      // Store the resolve function for the modal to call
      const handleMethodSelection = (method: SigningMethod | null) => {
        setShowMethodSelectionModal(false);
        resolve(method);
      };

      // Set up the pending request for the modal to access
      setPendingSigningRequest({
        event: {} as UnsignedEvent, // Will be set by the calling function
        messageType,
        resolve: (result: SigningResult) => {
          // This is handled differently - the modal calls handleMethodSelection
        },
      });

      // Show the method selection modal
      setShowMethodSelectionModal(true);

      // The modal component will call handleMethodSelection when user decides
    });
  };

  /**
   * Request user consent for encrypted nsec access
   */
  const requestNsecConsent = async (
    messageType: MessageType
  ): Promise<NsecConsentData> => {
    return new Promise((resolve) => {
      // Store the resolve function for the modal to call
      const handleConsentResponse = (consent: NsecConsentData) => {
        setShowConsentModal(false);
        resolve(consent);
      };

      // Set up the pending request for the modal to access
      setPendingSigningRequest({
        event: {} as UnsignedEvent, // Will be set by the calling function
        messageType,
        resolve: (result: SigningResult) => {
          // This is handled differently - the modal calls handleConsentResponse
        },
      });

      // Show the consent modal
      setShowConsentModal(true);

      // The modal component will call handleConsentResponse when user decides
    });
  };

  /**
   * Retrieve and decrypt user's nsec from database
   */
  const retrieveEncryptedNsec = async (): Promise<string | null> => {
    try {
      if (!auth.user || !auth.authenticated) {
        throw new Error("User not authenticated");
      }

      // Import the user identities auth module
      const { userIdentitiesAuth } = await import(
        "../auth/user-identities-auth"
      );

      // Get user's encrypted nsec from database
      const userRecord = await userIdentitiesAuth.getUserById(auth.user.id);

      if (!userRecord || !userRecord.hashed_encrypted_nsec) {
        throw new Error("No encrypted nsec found for user");
      }

      // Decrypt the nsec using user's unique salt
      const { decryptNsecSimple } = await import("../privacy/encryption");
      const decryptedNsec = await decryptNsecSimple(
        userRecord.hashed_encrypted_nsec,
        auth.user.user_salt || ""
      );

      return decryptedNsec;
    } catch (error) {
      console.error("Failed to retrieve encrypted nsec:", error);
      return null;
    }
  };

  /**
   * Sign event using encrypted nsec (FALLBACK METHOD)
   */
  const signWithEncryptedNsec = async (
    event: UnsignedEvent,
    consent: NsecConsentData
  ): Promise<SigningResult> => {
    let nsecKey: string | null = null;

    try {
      if (!consent.granted || !consent.warningAcknowledged) {
        return {
          success: false,
          error: "User consent required for nsec access",
          method: "encrypted-nsec",
          timestamp: Date.now(),
        };
      }

      if (Date.now() > consent.expiresAt) {
        return {
          success: false,
          error: "Consent session expired",
          method: "encrypted-nsec",
          timestamp: Date.now(),
        };
      }

      // Retrieve and decrypt nsec
      nsecKey = await retrieveEncryptedNsec();
      if (!nsecKey) {
        return {
          success: false,
          error: "Failed to retrieve encrypted nsec",
          method: "encrypted-nsec",
          timestamp: Date.now(),
        };
      }

      // Import nostr tools for signing
      const { finalizeEvent, getPublicKey } = await import("nostr-tools");

      // Get public key from private key
      const pubkey = getPublicKey(nsecKey);

      // Prepare event for signing
      const eventToSign = {
        ...event,
        created_at: event.created_at || Math.floor(Date.now() / 1000),
        pubkey: event.pubkey || pubkey,
      };

      // Sign the event
      const signedEvent = finalizeEvent(eventToSign, nsecKey);

      return {
        success: true,
        signedEvent: signedEvent as SignedEvent,
        method: "encrypted-nsec",
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Encrypted nsec signing failed";
      setLastError(errorMessage);

      return {
        success: false,
        error: errorMessage,
        method: "encrypted-nsec",
        timestamp: Date.now(),
      };
    } finally {
      // CRITICAL: Clear nsec from memory immediately
      if (nsecKey) {
        nsecKey = "";
        nsecKey = null;

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
    }
  };

  /**
   * Main signing function with explicit user opt-in (no automatic fallback)
   */
  const signMessage = async (
    event: UnsignedEvent,
    messageType: MessageType,
    config?: Partial<SigningConfig>
  ): Promise<SigningResult> => {
    const signingConfig: SigningConfig = {
      method: signingPreference,
      requireUserConsent: true,
      sessionTimeout: 30 * 60 * 1000, // 30 minutes
      securityWarnings: true,
      ...config,
    };

    setLastError(null);
    let effectiveMethod = signingConfig.method;

    // Check if user's preferred method is available
    if (signingConfig.method === "nip07" && !isNIP07Available()) {
      // User prefers NIP-07 but it's not available - request explicit method selection
      const selectedMethod = await requestMethodSelection(messageType);

      if (!selectedMethod) {
        return {
          success: false,
          error: "User cancelled method selection. No signing method chosen.",
          method: "nip07",
          timestamp: Date.now(),
        };
      }

      effectiveMethod = selectedMethod;
    }

    // Use the determined signing method (either original preference or user-selected)
    if (effectiveMethod === "nip07") {
      // Double-check NIP-07 availability (in case selection modal returned it incorrectly)
      if (!isNIP07Available()) {
        return {
          success: false,
          error:
            "NIP-07 browser extension not available. Please install a NIP-07 compatible extension.",
          method: "nip07",
          timestamp: Date.now(),
        };
      }

      return await signWithNIP07(event);
    }

    if (effectiveMethod === "encrypted-nsec") {
      // Request user consent for nsec access
      const consent = await requestNsecConsent(messageType);

      if (!consent.granted) {
        return {
          success: false,
          error: "User denied consent for nsec access",
          method: "encrypted-nsec",
          timestamp: Date.now(),
        };
      }

      return await signWithEncryptedNsec(event, consent);
    }

    return {
      success: false,
      error:
        "No valid signing method available. Please choose either NIP-07 or encrypted nsec method.",
      method: effectiveMethod,
      timestamp: Date.now(),
    };
  };

  /**
   * Sign group message (NIP-58)
   */
  const signGroupMessage = async (
    content: string,
    groupId: string,
    tags: string[][] = []
  ): Promise<SigningResult> => {
    const event: UnsignedEvent = {
      kind: 9, // Group message kind (NIP-58)
      content,
      tags: [["h", groupId], ...tags],
    };

    return signMessage(event, "group-message");
  };

  /**
   * Sign direct message for gift-wrapping (NIP-59)
   */
  const signDirectMessage = async (
    content: string,
    recipientPubkey: string,
    tags: string[][] = []
  ): Promise<SigningResult> => {
    const event: UnsignedEvent = {
      kind: 14, // Direct message kind
      content,
      tags: [["p", recipientPubkey], ...tags],
    };

    return signMessage(event, "direct-message");
  };

  /**
   * Sign invitation message
   */
  const signInvitationMessage = async (
    content: string,
    recipientPubkey: string,
    invitationType: string = "peer"
  ): Promise<SigningResult> => {
    const event: UnsignedEvent = {
      kind: 1, // Text note kind
      content,
      tags: [
        ["p", recipientPubkey],
        ["t", "invitation"],
        ["t", "satnam-pub"],
        ["invitation-type", invitationType],
      ],
    };

    return signMessage(event, "invitation");
  };

  return {
    // State
    signingPreference,
    activeSession,
    lastError,
    isNIP07Available: isNIP07Available(),
    showConsentModal,
    showMethodSelectionModal,
    pendingSigningRequest,

    // Actions
    setSigningPreference,
    signMessage,
    signGroupMessage,
    signDirectMessage,
    signInvitationMessage,
    signWithNIP07,
    signWithEncryptedNsec,
    requestNsecConsent,
    requestMethodSelection,
    clearError: () => setLastError(null),
    setShowConsentModal,
    setShowMethodSelectionModal,
    setPendingSigningRequest,
  };
}
