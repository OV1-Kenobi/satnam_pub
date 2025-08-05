/**
 * Production Hook for Privacy-First Messaging with Unified Messaging Service
 * Updated to use UnifiedMessagingService instead of deprecated SatnamPrivacyFirstCommunications
 */

import { useCallback, useRef, useState } from "react";
import {
  DEFAULT_UNIFIED_CONFIG,
  UnifiedMessagingConfig,
  UnifiedMessagingService,
} from "../../lib/unified-messaging-service.js";

export interface PrivacyMessagingState {
  communications: UnifiedMessagingService | null;
  sessionId: string | null;
  connected: boolean;
  loading: boolean;
  error: string | null;

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
  privacyWarningContent: any | null; // Updated to generic type
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
  }, []);

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
        // The service handles encryption internally based on contact preferences
        const messageType:
          | "text"
          | "file"
          | "payment"
          | "credential"
          | "sensitive" = "text";

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

  // NIP-05 Identity Disclosure functions (Legacy compatibility - simplified implementations)
  const enableNip05Disclosure = useCallback(
    async (
      nip05: string,
      scope: "direct" | "groups" | "specific-groups",
      specificGroupIds?: string[]
    ): Promise<void> => {
      // Since UnifiedMessagingService doesn't have NIP-05 disclosure,
      // we'll simulate the workflow for compatibility
      setState((prev) => ({
        ...prev,
        showingPrivacyWarning: true,
        privacyWarningContent: {
          title: "Privacy Warning",
          message:
            "Enabling NIP-05 disclosure will link your identity to this identifier.",
          risks: [
            "Your identity will be publicly linkable",
            "Messages may be traceable",
          ],
          recommendations: [
            "Consider privacy implications",
            "Use only if necessary",
          ],
        },
        pendingDisclosureConfig: { nip05, scope, specificGroupIds },
      }));
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
    }));
    return true;
  }, []);

  return {
    ...state,
    initializeSession,
    destroySession,
    enableNip05Disclosure,
    confirmDisclosureConsent,
    cancelDisclosure,
    disableDisclosure,
    addContact,
    createGroup,
    sendDirectMessage,
    sendGroupMessage,
    refreshIdentityStatus,
  };
}
