/**
 * Production Hook for Privacy-First Messaging with Unified Messaging Service
 * Updated to use UnifiedMessagingService instead of deprecated SatnamPrivacyFirstCommunications
 */

type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags?: string[][];
  content: string;
  sig: string;
};
import { useCallback, useEffect, useRef, useState } from "react";
import { central_event_publishing_service as CEPS } from "../../lib/central_event_publishing_service";
import {
  DEFAULT_UNIFIED_CONFIG,
  UnifiedMessagingConfig,
  UnifiedMessagingService,
} from "../../lib/unified-messaging-service";
import fetchWithAuth from "../lib/auth/fetch-with-auth";
import { clientMessageService } from "../lib/messaging/client-message-service";
import { secureNsecManager } from "../lib/secure-nsec-manager";

export interface PrivacyWarningContent {
  title: string;
  message: string;
  risks: string[];
  recommendations: string[];
  consequences?: string[];
  scopeDescription?: string;
  severity?: "low" | "medium" | "high";
  timestamp?: number;
}

export interface PrivacyMessagingState {
  communications: UnifiedMessagingService | null;
  sessionId: string | null;
  connected: boolean;
  loading: boolean;
  error: string | null;

  // Incoming NIP-59 messaging state
  incomingMessages: NostrEvent[];
  messageSubscription: unknown | null;
  lastMessageReceived: Date | null;
  // Identity disclosure status
  identityStatus: {
    hasNip05: boolean;
    isDisclosureEnabled: boolean;
    directMessagesEnabled: boolean;
    groupMessagesEnabled: boolean;
    specificGroupsCount: number;
    lastUpdated?: Date;
  };

  // Privacy warning state
  showingPrivacyWarning: boolean;
  privacyWarningContent: PrivacyWarningContent | null;
  pendingDisclosureConfig: {
    nip05?: string;
    scope?: "direct" | "groups" | "specific-groups";
    specificGroupIds?: string[];
  } | null;
}

export interface PrivacyMessagingActions {
  initializeSession: (
    nsec: string,
    options?: {
      ipAddress?: string;
      userAgent?: string;
      ttlHours?: number;
    }
  ) => Promise<string | null>;
  destroySession: () => Promise<void>;

  // Incoming message subscription (NIP-59)
  startMessageSubscription: () => Promise<boolean>;
  stopMessageSubscription: () => void;
  subscribeToIncomingMessages: () => Promise<boolean>; // alias to start

  // NIP-05 Identity Disclosure (Legacy compatibility)
  enableNip05Disclosure: (
    nip05: string,
    scope: "direct" | "groups" | "specific-groups",
    specificGroupIds?: string[]
  ) => Promise<void>;

  confirmDisclosureConsent: (consent: {
    consentGiven: boolean;
    warningAcknowledged: boolean;
  }) => Promise<boolean>;

  cancelDisclosure: () => void;
  disableDisclosure: () => Promise<boolean>;
  getNip05DisclosureStatus: () => Promise<{
    enabled: boolean;
    nip05?: string;
    scope?: "direct" | "groups" | "specific-groups";
    specificGroupIds?: string[];
    lastUpdated?: Date;
    verificationStatus?: "pending" | "verified" | "failed";
    lastVerified?: Date;
  }>;

  // Contact Management - Master Context Role Hierarchy
  addContact: (contactData: {
    npub: string;
    nip05?: string;
    displayName: string;
    familyRole?: "private" | "offspring" | "adult" | "steward" | "guardian";
    trustLevel: "family" | "trusted" | "known" | "unverified";
    preferredEncryption: "gift-wrap" | "nip04" | "auto";
    notes?: string;
    tags: string[];
  }) => Promise<string | null>;

  // Group Management
  createGroup: (groupData: {
    name: string;
    description?: string;
    groupType: "family" | "business" | "friends" | "advisors";
    encryptionType: "gift-wrap" | "nip04";
    initialMembers?: string[];
  }) => Promise<string | null>;

  // Messaging
  sendDirectMessage: (
    recipientNpub: string,
    content: string,
    encryptionType?: "gift-wrap" | "nip04"
  ) => Promise<boolean>;

  sendGroupMessage: (
    groupId: string,
    content: string,
    messageType?: "text" | "sensitive"
  ) => Promise<boolean>;

  // Utility
  refreshIdentityStatus: () => Promise<void>;
}

export function usePrivacyFirstMessaging(): PrivacyMessagingState &
  PrivacyMessagingActions {
  const [state, setState] = useState<PrivacyMessagingState>({
    communications: null,
    sessionId: null,
    connected: false,
    loading: false,
    error: null,
    incomingMessages: [],
    messageSubscription: null,
    lastMessageReceived: null,
    identityStatus: {
      hasNip05: false,
      isDisclosureEnabled: false,
      directMessagesEnabled: false,
      groupMessagesEnabled: false,
      specificGroupsCount: 0,
    },
    showingPrivacyWarning: false,
    privacyWarningContent: null,
    pendingDisclosureConfig: null,
  });

  const communicationsRef = useRef<UnifiedMessagingService | null>(null);

  type SubscriptionLike =
    | { close?: () => void }
    | (() => void)
    | null
    | undefined;
  const subscriptionRef = useRef<SubscriptionLike>(null);

  const cleanupSubscription = useCallback((sub: SubscriptionLike): void => {
    if (!sub) return;
    try {
      if (typeof sub === "function") {
        sub();
      } else if (typeof sub.close === "function") {
        sub.close();
      }
    } catch (error) {
      console.warn(
        "Subscription cleanup error:",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }, []);

  // Resolve current user's public key (hex) for subscription filters
  // IMPORTANT: Do NOT auto-trigger NIP-07. Default flows must use Client Vault/session only.
  const resolveRecipient = useCallback(async (): Promise<string | null> => {
    // Prefer session-derived pubkey; avoid calling window.nostr automatically
    if (state.sessionId) {
      try {
        const hex = await secureNsecManager.useTemporaryNsec(
          state.sessionId,
          async (nsecHex: string) => CEPS.getPublicKeyHex(nsecHex)
        );
        if (hex && typeof hex === "string") return hex;
      } catch (error) {
        console.warn("NIP59-RX: failed to derive pubkey from session", error);
      }
    }

    // No session or failed derivation — do not fall back to NIP-07 implicitly
    return null;
  }, [state.sessionId]);

  const startMessageSubscription = useCallback(async (): Promise<boolean> => {
    try {
      const recipient = await resolveRecipient();
      if (!recipient) {
        setState((prev) => ({
          ...prev,
          error: "No recipient public key available",
        }));
        return false;
      }

      // Cleanup any existing subscription first
      if (subscriptionRef.current) {
        cleanupSubscription(subscriptionRef.current);
        subscriptionRef.current = null;
      }

      const USE_NIP17 = (import.meta as any).env?.VITE_USE_NIP17 === "true";
      const sub = (
        USE_NIP17
          ? clientMessageService.subscribeToNip17ForRecipient
          : clientMessageService.subscribeToGiftWrappedForRecipient
      ).call(clientMessageService, recipient, {
        onInner: (inner: NostrEvent) => {
          setState((prev) => ({
            ...prev,
            // Keep only last 1000 messages to prevent memory issues
            incomingMessages: [...prev.incomingMessages.slice(-999), inner],
            lastMessageReceived: new Date(),
          }));
        },
        onRaw: (outer: NostrEvent) => {
          console.debug("NIP-RX: raw outer event", {
            id: (outer as any)?.id,
            kind: (outer as any)?.kind,
          });
        },
        onError: (reason: string) => {
          setState((prev) => ({
            ...prev,
            error: reason || "subscription_error",
          }));
          try {
            cleanupSubscription(subscriptionRef.current);
          } catch {
            // no-op
          }
          subscriptionRef.current = null;
        },
        onEose: () => {
          console.info("NIP-RX: subscription established");
        },
      });

      // Parallel subscription: standard NIP-04 DMs addressed to this recipient
      const recipientHex = recipient.startsWith("npub1")
        ? CEPS.npubToHex(recipient)
        : recipient;
      const stdSub = CEPS.subscribeMany(
        [],
        [{ kinds: [4], "#p": [recipientHex] }],
        {
          onevent: async (e: any) => {
            try {
              const { plaintext, protocol } =
                await CEPS.decryptStandardDirectMessageWithActiveSession(
                  e?.pubkey,
                  e?.content
                );
              const myNpub = CEPS.encodeNpub(recipientHex);
              const senderNpub = CEPS.encodeNpub(e?.pubkey);
              await fetchWithAuth("/api/communications/giftwrapped", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  content: plaintext,
                  recipient: myNpub,
                  sender: senderNpub,
                  communicationType: "individual",
                  messageType: "direct",
                  encryptionLevel: "standard",
                  standardDm: true,
                  protocol,
                  direction: "incoming",
                }),
                timeoutMs: 15000,
              });
            } catch (err) {
              console.warn("STD-DM RX: failed to decrypt/log", err);
            }
          },
          oneose: () => {
            console.info("STD-DM-RX: subscription established");
          },
        }
      );

      const composite: SubscriptionLike = {
        close: () => {
          try {
            if (typeof sub === "function") (sub as any)();
            else (sub as any)?.close?.();
          } catch {}
          try {
            if (typeof stdSub === "function") (stdSub as any)();
            else (stdSub as any)?.close?.();
          } catch {}
        },
      } as any;

      subscriptionRef.current = composite;
      setState((prev) => ({
        ...prev,
        messageSubscription: composite as unknown,
      }));
      return true;
    } catch (error) {
      console.error("Failed to start message subscription", error);
      setState((prev) => ({ ...prev, error: "subscription_start_failed" }));
      return false;
    }
  }, [resolveRecipient, cleanupSubscription]);

  const stopMessageSubscription = useCallback((): void => {
    try {
      cleanupSubscription(subscriptionRef.current);
    } catch (error) {
      console.warn("Failed to stop message subscription", error);
    } finally {
      subscriptionRef.current = null;
      setState((prev) => ({ ...prev, messageSubscription: null }));
    }
  }, [cleanupSubscription]);

  const subscribeToIncomingMessages =
    useCallback(async (): Promise<boolean> => {
      return await startMessageSubscription();
    }, [startMessageSubscription]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupSubscription(subscriptionRef.current);
      subscriptionRef.current = null;
    };
  }, [cleanupSubscription]);

  const initializeSession = useCallback(
    async (
      nsec: string,
      options?: {
        ipAddress?: string;
        userAgent?: string;
        ttlHours?: number;
      }
    ): Promise<string | null> => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        // Create unified messaging service with default config
        const config: UnifiedMessagingConfig = {
          ...DEFAULT_UNIFIED_CONFIG,
          session: {
            ttlHours: options?.ttlHours || 24,
            maxConcurrentSessions: 3,
          },
        };

        const communications = new UnifiedMessagingService(config);
        const sessionId = await communications.initializeSession(nsec, options);

        communicationsRef.current = communications;

        setState((prev) => ({
          ...prev,
          communications,
          sessionId,
          connected: true,
          loading: false,
          identityStatus: {
            hasNip05: false,
            isDisclosureEnabled: false,
            directMessagesEnabled: true,
            groupMessagesEnabled: true,
            specificGroupsCount: 0,
            lastUpdated: new Date(),
          },
        }));

        // Auto-start NIP-59 incoming message subscription (non-blocking)
        void startMessageSubscription();

        return sessionId;
      } catch (error) {
        console.error("Failed to initialize session:", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to initialize session",
        }));
        return null;
      }
    },
    []
  );

  const destroySession = useCallback(async (): Promise<void> => {
    try {
      // Stop incoming subscription first
      stopMessageSubscription();
      if (communicationsRef.current) {
        await communicationsRef.current.destroySession();
      }
    } catch (error) {
      console.error("Session destruction error:", error);
    } finally {
      setState({
        communications: null,
        sessionId: null,
        connected: false,
        loading: false,
        error: null,
        incomingMessages: [],
        messageSubscription: null,
        lastMessageReceived: null,
        identityStatus: {
          hasNip05: false,
          isDisclosureEnabled: false,
          directMessagesEnabled: false,
          groupMessagesEnabled: false,
          specificGroupsCount: 0,
        },
        showingPrivacyWarning: false,
        privacyWarningContent: null,
        pendingDisclosureConfig: null,
      });
      communicationsRef.current = null;
    }
  }, [stopMessageSubscription]);

  const addContact = useCallback(
    async (contactData: {
      npub: string;
      nip05?: string;
      displayName: string;
      familyRole?: "private" | "offspring" | "adult" | "steward" | "guardian";
      trustLevel: "family" | "trusted" | "known" | "unverified";
      preferredEncryption: "gift-wrap" | "nip04" | "auto";
      notes?: string;
      tags: string[];
    }): Promise<string | null> => {
      if (!communicationsRef.current) {
        setState((prev) => ({ ...prev, error: "No active session" }));
        return null;
      }

      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const contactSessionId = await communicationsRef.current.addContact(
          contactData
        );

        setState((prev) => ({ ...prev, loading: false }));

        return contactSessionId;
      } catch (error) {
        console.error("Failed to add contact:", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error ? error.message : "Failed to add contact",
        }));
        return null;
      }
    },
    []
  );

  const createGroup = useCallback(
    async (groupData: {
      name: string;
      description?: string;
      groupType: "family" | "business" | "friends" | "advisors";
      encryptionType: "gift-wrap" | "nip04";
      initialMembers?: string[];
    }): Promise<string | null> => {
      if (!communicationsRef.current) {
        setState((prev) => ({ ...prev, error: "No active session" }));
        return null;
      }

      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const groupSessionId = await communicationsRef.current.createGroup(
          groupData
        );

        setState((prev) => ({ ...prev, loading: false }));

        return groupSessionId;
      } catch (error) {
        console.error("Failed to create group:", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error ? error.message : "Failed to create group",
        }));
        return null;
      }
    },
    []
  );

  const sendDirectMessage = useCallback(
    async (
      recipientNpub: string,
      content: string,
      encryptionType: "gift-wrap" | "nip04" = "gift-wrap"
    ): Promise<boolean> => {
      if (!communicationsRef.current) {
        setState((prev) => ({ ...prev, error: "No active session" }));
        return false;
      }

      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        // Map encryption type to message type for the unified messaging service
        // Gift-wrap encryption indicates sensitive content, NIP-04 is standard text
        const messageType:
          | "text"
          | "file"
          | "payment"
          | "credential"
          | "sensitive" = encryptionType === "gift-wrap" ? "sensitive" : "text";

        const messageId = await communicationsRef.current.sendDirectMessage(
          recipientNpub,
          content,
          messageType
        );

        setState((prev) => ({ ...prev, loading: false }));

        // Return boolean success based on whether we got a messageId
        return Boolean(messageId);
      } catch (error) {
        console.error("Failed to send direct message:", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error ? error.message : "Failed to send message",
        }));
        return false;
      }
    },
    []
  );

  const sendGroupMessage = useCallback(
    async (
      groupId: string,
      content: string,
      messageType: "text" | "sensitive" = "text"
    ): Promise<boolean> => {
      if (!communicationsRef.current) {
        setState((prev) => ({ ...prev, error: "No active session" }));
        return false;
      }

      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const messageId = await communicationsRef.current.sendGroupMessage(
          groupId,
          content,
          messageType
        );

        setState((prev) => ({ ...prev, loading: false }));

        // Return boolean success based on whether we got a messageId
        return Boolean(messageId);
      } catch (error) {
        console.error("Failed to send group message:", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to send group message",
        }));
        return false;
      }
    },
    []
  );

  const refreshIdentityStatus = useCallback(async (): Promise<void> => {
    if (!communicationsRef.current) return;

    try {
      // Since UnifiedMessagingService doesn't have identity disclosure,
      // we'll just update the timestamp
      setState((prev) => ({
        ...prev,
        identityStatus: {
          ...prev.identityStatus,
          lastUpdated: new Date(),
        },
      }));
    } catch (error) {
      console.error("Failed to refresh identity status:", error);
      setState((prev) => ({
        ...prev,
        error:
          error instanceof Error ? error.message : "Failed to refresh status",
      }));
    }
  }, []);

  // NIP-05 Identity Disclosure functions - Full implementation
  const enableNip05Disclosure = useCallback(
    async (
      nip05: string,
      scope: "direct" | "groups" | "specific-groups",
      specificGroupIds?: string[]
    ): Promise<void> => {
      try {
        if (!communicationsRef.current) {
          throw new Error("Communications service not initialized");
        }

        // Show privacy warning first
        setState((prev) => ({
          ...prev,
          showingPrivacyWarning: true,
          privacyWarningContent: {
            title: "NIP-05 Identity Disclosure Warning",
            message: `Enabling NIP-05 disclosure will publicly link your identity to ${nip05}. This action cannot be easily undone.`,
            risks: [
              "Your identity will be publicly linkable to this NIP-05 identifier",
              "Messages may become traceable to your real identity",
              "Privacy protection will be reduced for disclosed communications",
              "Third parties may correlate your activities across platforms",
            ],
            recommendations: [
              "Only enable if you fully understand the privacy implications",
              "Consider using a pseudonymous NIP-05 identifier",
              "Review the scope of disclosure carefully",
              "Regularly audit your disclosure settings",
            ],
            consequences: [
              "Public association between your Nostr identity and NIP-05",
              "Potential correlation of messaging patterns",
              "Reduced anonymity in disclosed communication contexts",
            ],
            scopeDescription:
              scope === "direct"
                ? "Direct messages only"
                : scope === "groups"
                ? "All group communications"
                : `Specific groups: ${specificGroupIds?.join(", ") || "none"}`,
            severity: "high",
            timestamp: Date.now(),
          },
          pendingDisclosureConfig: { nip05, scope, specificGroupIds },
        }));

        // Attempt to enable disclosure
        const result = await communicationsRef.current.enableNip05Disclosure(
          nip05,
          scope,
          specificGroupIds
        );

        if (!result.success) {
          setState((prev) => ({
            ...prev,
            showingPrivacyWarning: false,
            privacyWarningContent: {
              title: "NIP-05 Disclosure Failed",
              message: `Failed to enable NIP-05 disclosure: ${result.error}`,
              risks: ["Disclosure configuration was not saved"],
              recommendations: [
                "Verify your NIP-05 identifier is correct",
                "Check your internet connection",
                "Try again in a few moments",
              ],
              severity: "medium",
              timestamp: Date.now(),
            },
          }));
          return;
        }

        // Success - update identity status
        setState((prev) => ({
          ...prev,
          identityStatus: {
            ...prev.identityStatus,
            nip05Disclosed: true,
            disclosureScope: scope,
            disclosedNip05: nip05,
          },
          showingPrivacyWarning: false,
          privacyWarningContent: null,
          pendingDisclosureConfig: null,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          showingPrivacyWarning: false,
          privacyWarningContent: {
            title: "NIP-05 Disclosure Error",
            message: `An error occurred while enabling NIP-05 disclosure: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
            risks: ["Disclosure configuration may not have been saved"],
            recommendations: [
              "Check your internet connection",
              "Verify your session is still active",
              "Try again in a few moments",
            ],
            severity: "high",
            timestamp: Date.now(),
          },
        }));
      }
    },
    []
  );

  const confirmDisclosureConsent = useCallback(
    async (consent: {
      consentGiven: boolean;
      warningAcknowledged: boolean;
    }): Promise<boolean> => {
      if (!consent.consentGiven || !consent.warningAcknowledged) {
        return false;
      }

      // Update identity status to reflect disclosure enabled
      setState((prev) => ({
        ...prev,
        identityStatus: {
          ...prev.identityStatus,
          hasNip05: true,
          isDisclosureEnabled: true,
          directMessagesEnabled:
            prev.pendingDisclosureConfig?.scope === "direct" ||
            prev.pendingDisclosureConfig?.scope === "groups",
          groupMessagesEnabled:
            prev.pendingDisclosureConfig?.scope === "groups" ||
            prev.pendingDisclosureConfig?.scope === "specific-groups",
          specificGroupsCount:
            prev.pendingDisclosureConfig?.specificGroupIds?.length || 0,
          lastUpdated: new Date(),
        },
        showingPrivacyWarning: false,
        privacyWarningContent: null,
        pendingDisclosureConfig: null,
      }));

      return true;
    },
    []
  );

  const cancelDisclosure = useCallback((): void => {
    setState((prev) => ({
      ...prev,
      showingPrivacyWarning: false,
      privacyWarningContent: null,
      pendingDisclosureConfig: null,
    }));
  }, []);

  const disableDisclosure = useCallback(async (): Promise<boolean> => {
    try {
      if (!communicationsRef.current) {
        throw new Error("Communications service not initialized");
      }

      const result = await communicationsRef.current.disableNip05Disclosure();

      if (!result.success) {
        setState((prev) => ({
          ...prev,
          privacyWarningContent: {
            title: "Failed to Disable NIP-05 Disclosure",
            message: `Error: ${result.error}`,
            risks: ["Disclosure settings may still be active"],
            recommendations: [
              "Check your internet connection",
              "Try again in a few moments",
            ],
            severity: "medium",
            timestamp: Date.now(),
          },
        }));
        return false;
      }

      setState((prev) => ({
        ...prev,
        identityStatus: {
          ...prev.identityStatus,
          hasNip05: false,
          isDisclosureEnabled: false,
          directMessagesEnabled: false,
          groupMessagesEnabled: false,
          specificGroupsCount: 0,
          lastUpdated: new Date(),
        },
        privacyWarningContent: null,
      }));
      return true;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        privacyWarningContent: {
          title: "Error Disabling NIP-05 Disclosure",
          message: `An error occurred: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          risks: ["Disclosure settings may still be active"],
          recommendations: [
            "Check your internet connection",
            "Verify your session is still active",
            "Try again in a few moments",
          ],
          severity: "high",
          timestamp: Date.now(),
        },
      }));
      return false;
    }
  }, []);

  const getNip05DisclosureStatus = useCallback(async () => {
    try {
      if (!communicationsRef.current) {
        return { enabled: false };
      }

      return await communicationsRef.current.getNip05DisclosureStatus();
    } catch (error) {
      console.error("Error fetching NIP-05 disclosure status:", error);
      return { enabled: false };
    }
  }, []);

  return {
    ...state,
    initializeSession,
    destroySession,
    // NIP-59 incoming subscription controls
    startMessageSubscription,
    stopMessageSubscription,
    subscribeToIncomingMessages,
    // Disclosure
    enableNip05Disclosure,
    confirmDisclosureConsent,
    cancelDisclosure,
    disableDisclosure,
    getNip05DisclosureStatus,
    // Contacts & groups
    addContact,
    createGroup,
    // Messaging
    sendDirectMessage,
    sendGroupMessage,
    // Utility
    refreshIdentityStatus,
  };
}
