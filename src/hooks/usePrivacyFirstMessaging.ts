/**
 * Production Hook for Privacy-First Messaging with NIP-05 Identity Disclosure
 */

import { useCallback, useRef, useState } from "react";
import {
  PrivacyConsentResponse,
  SatnamPrivacyFirstCommunications,
} from "../../lib/gift-wrapped-messaging/privacy-first-service";

export interface PrivacyMessagingState {
  communications: SatnamPrivacyFirstCommunications | null;
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
  privacyWarningContent: any;
  pendingDisclosureConfig: {
    nip05?: string;
    scope?: "direct" | "groups" | "specific-groups";
    specificGroupIds?: string[];
  } | null;
}

export interface PrivacyMessagingActions {
  initializeSession: (nsec: string, options?: any) => Promise<string | null>;
  destroySession: () => Promise<void>;

  // NIP-05 Identity Disclosure
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

  // Contact Management
  addContact: (contactData: {
    npub: string;
    nip05?: string;
    displayName: string;
    familyRole?: "adult" | "child" | "guardian" | "advisor" | "friend";
    trustLevel: "family" | "trusted" | "known" | "unverified";
    preferredEncryption: "gift-wrap" | "nip04" | "auto";
    notes?: string;
    tags: string[];
  }) => Promise<string | null>;

  // Utility
  refreshIdentityStatus: () => Promise<void>;
  checkDisclosureAllowed: (
    context: "direct" | "group",
    groupId?: string
  ) => boolean;
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

  const communicationsRef = useRef<SatnamPrivacyFirstCommunications | null>(
    null
  );

  const initializeSession = useCallback(
    async (nsec: string, options?: any): Promise<string | null> => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const communications = new SatnamPrivacyFirstCommunications();
        const sessionId = await communications.initializeSession(nsec, options);

        communicationsRef.current = communications;

        // Load identity status
        const status = await communications.getIdentityDisclosureStatus();

        setState((prev) => ({
          ...prev,
          communications,
          sessionId,
          connected: true,
          loading: false,
          identityStatus: status,
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

  const enableNip05Disclosure = useCallback(
    async (
      nip05: string,
      scope: "direct" | "groups" | "specific-groups",
      specificGroupIds?: string[]
    ): Promise<void> => {
      if (!communicationsRef.current) {
        setState((prev) => ({ ...prev, error: "No active session" }));
        return;
      }

      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const workflowResult =
          await communicationsRef.current.enableNip05DisclosureWorkflow(
            nip05,
            scope,
            specificGroupIds
          );

        if (
          workflowResult.requiresUserConfirmation &&
          workflowResult.warningContent
        ) {
          setState((prev) => ({
            ...prev,
            showingPrivacyWarning: true,
            privacyWarningContent: workflowResult.warningContent,
            pendingDisclosureConfig: { nip05, scope, specificGroupIds },
            loading: false,
          }));
        } else if (workflowResult.error) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: workflowResult.error || null,
          }));
        }
      } catch (error) {
        console.error("Failed to start disclosure workflow:", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error ? error.message : "Failed to start workflow",
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
      if (!communicationsRef.current || !state.pendingDisclosureConfig) {
        return false;
      }

      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const consentResponse: PrivacyConsentResponse = {
          consentGiven: consent.consentGiven,
          warningAcknowledged: consent.warningAcknowledged,
          selectedScope: state.pendingDisclosureConfig.scope || "none",
          specificGroupIds: state.pendingDisclosureConfig.specificGroupIds,
          timestamp: new Date(),
        };

        const success =
          await communicationsRef.current.updateIdentityDisclosurePreferences(
            consentResponse,
            state.pendingDisclosureConfig.nip05
          );

        if (success) {
          const status =
            await communicationsRef.current.getIdentityDisclosureStatus();
          setState((prev) => ({
            ...prev,
            identityStatus: status,
            showingPrivacyWarning: false,
            privacyWarningContent: null,
            pendingDisclosureConfig: null,
            loading: false,
          }));
        } else {
          setState((prev) => ({ ...prev, loading: false }));
        }

        return success;
      } catch (error) {
        console.error("Failed to confirm disclosure consent:", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to update preferences",
        }));
        return false;
      }
    },
    [state.pendingDisclosureConfig]
  );

  const cancelDisclosure = useCallback((): void => {
    setState((prev) => ({
      ...prev,
      showingPrivacyWarning: false,
      privacyWarningContent: null,
      pendingDisclosureConfig: null,
      error: null,
    }));
  }, []);

  const disableDisclosure = useCallback(async (): Promise<boolean> => {
    if (!communicationsRef.current) return false;

    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const success =
        await communicationsRef.current.disableIdentityDisclosure();

      if (success) {
        setState((prev) => ({
          ...prev,
          identityStatus: {
            hasNip05: false,
            isDisclosureEnabled: false,
            directMessagesEnabled: false,
            groupMessagesEnabled: false,
            specificGroupsCount: 0,
          },
          loading: false,
        }));
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }

      return success;
    } catch (error) {
      console.error("Failed to disable disclosure:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to disable disclosure",
      }));
      return false;
    }
  }, []);

  const refreshIdentityStatus = useCallback(async (): Promise<void> => {
    if (!communicationsRef.current) return;

    try {
      const status =
        await communicationsRef.current.getIdentityDisclosureStatus();
      setState((prev) => ({ ...prev, identityStatus: status }));
    } catch (error) {
      console.error("Failed to refresh identity status:", error);
    }
  }, []);

  const addContact = useCallback(
    async (contactData: {
      npub: string;
      nip05?: string;
      displayName: string;
      familyRole?: "adult" | "child" | "guardian" | "advisor" | "friend";
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

        const contactId = await communicationsRef.current.addContact(
          contactData
        );

        setState((prev) => ({ ...prev, loading: false }));
        return contactId;
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

  const checkDisclosureAllowed = useCallback(
    (context: "direct" | "group", groupId?: string): boolean => {
      const { identityStatus } = state;

      if (!identityStatus.isDisclosureEnabled) return false;

      switch (context) {
        case "direct":
          return identityStatus.directMessagesEnabled;
        case "group":
          return (
            identityStatus.groupMessagesEnabled ||
            (groupId ? identityStatus.specificGroupsCount > 0 : false)
          );
        default:
          return false;
      }
    },
    [state.identityStatus]
  );

  return {
    ...state,
    initializeSession,
    destroySession,
    enableNip05Disclosure,
    confirmDisclosureConsent,
    cancelDisclosure,
    disableDisclosure,
    addContact,
    refreshIdentityStatus,
    checkDisclosureAllowed,
  };
}
