/**
 * usePrivacyFirstCommunications Hook
 *
 * React hook for privacy-first Gift Wrapped Communications
 *
 * PRIVACY FEATURES:
 * - All user data hashed with unique salts before storage
 * - Client-side encryption of all PII before transmission
 * - Session-based authentication with hashed session IDs
 * - Zero-knowledge contact management
 * - Anonymous usage analytics only
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { EnhancedNostrManager } from "../../lib/enhanced-nostr-manager";
import {
  CapabilityFlags,
  PrivacyContact,
  PrivacyFirstCommunicationsService,
  PrivacyLevel,
  PrivacySession,
  RelationshipType,
  TrustLevel,
} from "../lib/gift-wrapped-messaging/privacy-first-service";
import { useAuth } from "./useAuth";

// Privacy-safe contact interface for UI
export interface UIContact {
  contactId: string;
  displayName: string; // Decrypted for display
  npub: string; // Decrypted for operations
  nip05?: string; // Decrypted for display
  notes?: string; // Decrypted for display
  trustLevel: TrustLevel; // Mapped from code
  relationshipType: RelationshipType; // Mapped from code
  supportsGiftWrap: boolean; // From capability flags
  verified: boolean; // From capability flags
  interactionCount: number;
  trustScore: number;
  activityStatus: "active" | "recent" | "inactive" | "never";
  addedAt: Date; // From epoch
  lastInteraction?: Date; // From epoch
  metadata?: Record<string, any>; // Decrypted JSON
}

// Hook state interfaces
interface ContactsState {
  contacts: UIContact[];
  loading: boolean;
  error: string | null;
}

interface MessagesState {
  messages: any[];
  loading: boolean;
  error: string | null;
}

interface SendMessageState {
  sending: boolean;
  error: string | null;
}

interface SessionState {
  session: PrivacySession | null;
  loading: boolean;
  error: string | null;
}

// Hook return interface
export interface UsePrivacyFirstCommunicationsReturn {
  // Service instance
  service: PrivacyFirstCommunicationsService | null;

  // Session state
  session: SessionState;

  // State
  contacts: ContactsState;
  messages: MessagesState;
  sendMessage: SendMessageState;

  // Session management
  initializeSession: (
    userId: string,
    sessionId: string,
    encryptionKey: string
  ) => Promise<boolean>;
  restoreSession: (
    sessionHash: string,
    encryptionKey: string
  ) => Promise<boolean>;

  // Contact management
  addContact: (contactData: {
    npub: string;
    displayName?: string;
    nip05?: string;
    notes?: string;
    trustLevel: TrustLevel;
    relationshipType: RelationshipType;
    verified?: boolean;
    metadata?: Record<string, any>;
  }) => Promise<UIContact | null>;

  updateContact: (
    contactId: string,
    updates: Partial<{
      displayName: string;
      nip05: string;
      notes: string;
      trustLevel: TrustLevel;
      relationshipType: RelationshipType;
      verified: boolean;
      metadata: Record<string, any>;
    }>
  ) => Promise<UIContact | null>;

  deleteContact: (contactId: string) => Promise<boolean>;

  getContacts: (filters?: {
    trustLevel?: TrustLevel;
    relationshipType?: RelationshipType;
    supportsGiftWrap?: boolean;
    verified?: boolean;
  }) => Promise<UIContact[]>;

  // Messaging
  sendDirectMessage: (
    contactId: string,
    content: string,
    privacyLevel?: PrivacyLevel
  ) => Promise<{
    success: boolean;
    messageId?: string;
    privacyUsed: PrivacyLevel;
    message: string;
  }>;

  // Message history
  getMessageHistory: (contactId: string, limit?: number) => Promise<any[]>;

  // Utilities
  refreshContacts: () => Promise<void>;
  refreshMessages: (contactId: string) => Promise<void>;
}

/**
 * Main hook for Privacy-First Communications
 */
export function usePrivacyFirstCommunications(): UsePrivacyFirstCommunicationsReturn {
  // Get auth context
  const { user } = useAuth();

  // Service instance
  const [service, setService] =
    useState<PrivacyFirstCommunicationsService | null>(null);

  // Session state
  const [session, setSession] = useState<SessionState>({
    session: null,
    loading: false,
    error: null,
  });

  // State management
  const [contacts, setContacts] = useState<ContactsState>({
    contacts: [],
    loading: false,
    error: null,
  });

  const [messages, setMessages] = useState<MessagesState>({
    messages: [],
    loading: false,
    error: null,
  });

  const [sendMessage, setSendMessage] = useState<SendMessageState>({
    sending: false,
    error: null,
  });

  // Refs for cleanup
  const serviceRef = useRef<PrivacyFirstCommunicationsService | null>(null);

  // Initialize service
  useEffect(() => {
    const initializeService = async () => {
      try {
        // Initialize the EnhancedNostrManager
        const nostrManager = new EnhancedNostrManager();

        // Create the privacy-first service
        const privacyService = new PrivacyFirstCommunicationsService(
          nostrManager
        );

        setService(privacyService);
        serviceRef.current = privacyService;
      } catch (error) {
        console.error(
          "Failed to initialize Privacy-First Communications service:",
          error
        );
        setSession((prev) => ({
          ...prev,
          error: "Failed to initialize service",
        }));
      }
    };

    initializeService();

    // Cleanup on unmount
    return () => {
      if (serviceRef.current) {
        serviceRef.current = null;
      }
    };
  }, []);

  // Helper function to map privacy contact to UI contact
  const mapPrivacyContactToUIContact = useCallback(
    async (privacyContact: PrivacyContact): Promise<UIContact> => {
      if (!service) throw new Error("Service not available");

      // Decrypt sensitive data for UI display
      const displayName = privacyContact.encryptedDisplayName
        ? await (service as any).decryptData(
            privacyContact.encryptedDisplayName
          )
        : "Unknown";
      const npub = privacyContact.encryptedNpub
        ? await (service as any).decryptData(privacyContact.encryptedNpub)
        : "";
      const nip05 = privacyContact.encryptedNip05
        ? await (service as any).decryptData(privacyContact.encryptedNip05)
        : undefined;
      const notes = privacyContact.encryptedNotes
        ? await (service as any).decryptData(privacyContact.encryptedNotes)
        : undefined;
      const metadata = privacyContact.encryptedMetadata
        ? JSON.parse(
            await (service as any).decryptData(privacyContact.encryptedMetadata)
          )
        : undefined;

      // Map codes to enums
      const trustLevel = mapTrustLevelCodeToEnum(privacyContact.trustLevelCode);
      const relationshipType = mapRelationshipCodeToEnum(
        privacyContact.relationshipCode
      );

      // Extract capability flags
      const supportsGiftWrap =
        (privacyContact.capabilityFlags & CapabilityFlags.GIFT_WRAP) > 0;
      const verified =
        (privacyContact.capabilityFlags & CapabilityFlags.VERIFIED) > 0;

      // Calculate activity status
      const now = Date.now() / 1000;
      const lastInteraction = privacyContact.lastInteractionEpoch;
      let activityStatus: "active" | "recent" | "inactive" | "never" = "never";

      if (lastInteraction) {
        const daysSince = (now - lastInteraction) / (24 * 60 * 60);
        if (daysSince < 7) activityStatus = "active";
        else if (daysSince < 30) activityStatus = "recent";
        else activityStatus = "inactive";
      }

      return {
        contactId: privacyContact.contactId,
        displayName,
        npub,
        nip05,
        notes,
        trustLevel,
        relationshipType,
        supportsGiftWrap,
        verified,
        interactionCount: privacyContact.interactionCount,
        trustScore: privacyContact.trustScore,
        activityStatus,
        addedAt: new Date(privacyContact.createdEpoch * 1000),
        lastInteraction: lastInteraction
          ? new Date(lastInteraction * 1000)
          : undefined,
        metadata,
      };
    },
    [service]
  );

  // Session management functions
  const initializeSession = useCallback(
    async (
      userId: string,
      sessionId: string,
      encryptionKey: string
    ): Promise<boolean> => {
      if (!service) return false;

      try {
        setSession((prev) => ({ ...prev, loading: true, error: null }));

        const privacySession = await service.initializePrivacySession(
          userId,
          sessionId,
          encryptionKey
        );

        setSession({
          session: privacySession,
          loading: false,
          error: null,
        });

        return true;
      } catch (error) {
        setSession((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to initialize session",
        }));
        return false;
      }
    },
    [service]
  );

  const restoreSession = useCallback(
    async (sessionHash: string, encryptionKey: string): Promise<boolean> => {
      if (!service) return false;

      try {
        setSession((prev) => ({ ...prev, loading: true, error: null }));

        const success = await service.restorePrivacySession(
          sessionHash,
          encryptionKey
        );

        if (success) {
          setSession((prev) => ({
            ...prev,
            loading: false,
            error: null,
          }));
        } else {
          setSession((prev) => ({
            ...prev,
            loading: false,
            error: "Failed to restore session",
          }));
        }

        return success;
      } catch (error) {
        setSession((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to restore session",
        }));
        return false;
      }
    },
    [service]
  );

  // Contact management functions
  const addContact = useCallback(
    async (contactData: {
      npub: string;
      displayName?: string;
      nip05?: string;
      notes?: string;
      trustLevel: TrustLevel;
      relationshipType: RelationshipType;
      verified?: boolean;
      metadata?: Record<string, any>;
    }): Promise<UIContact | null> => {
      if (!service) return null;

      try {
        setContacts((prev) => ({ ...prev, loading: true, error: null }));

        const privacyContact = await service.addContact(contactData);
        const uiContact = await mapPrivacyContactToUIContact(privacyContact);

        // Refresh contacts list
        await refreshContactsInternal();

        return uiContact;
      } catch (error) {
        setContacts((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error ? error.message : "Failed to add contact",
        }));
        return null;
      }
    },
    [service, mapPrivacyContactToUIContact]
  );

  const updateContact = useCallback(
    async (
      contactId: string,
      updates: Partial<{
        displayName: string;
        nip05: string;
        notes: string;
        trustLevel: TrustLevel;
        relationshipType: RelationshipType;
        verified: boolean;
        metadata: Record<string, any>;
      }>
    ): Promise<UIContact | null> => {
      if (!service) return null;

      try {
        const privacyContact = await service.updateContact(contactId, updates);
        const uiContact = await mapPrivacyContactToUIContact(privacyContact);

        // Update local state
        setContacts((prev) => ({
          ...prev,
          contacts: prev.contacts.map((contact) =>
            contact.contactId === contactId ? uiContact : contact
          ),
        }));

        return uiContact;
      } catch (error) {
        setContacts((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Failed to update contact",
        }));
        return null;
      }
    },
    [service, mapPrivacyContactToUIContact]
  );

  const deleteContact = useCallback(
    async (contactId: string): Promise<boolean> => {
      if (!service) return false;

      try {
        const success = await service.deleteContact(contactId);

        if (success) {
          // Remove from local state
          setContacts((prev) => ({
            ...prev,
            contacts: prev.contacts.filter(
              (contact) => contact.contactId !== contactId
            ),
          }));
        }

        return success;
      } catch (error) {
        setContacts((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Failed to delete contact",
        }));
        return false;
      }
    },
    [service]
  );

  const getContacts = useCallback(
    async (filters?: {
      trustLevel?: TrustLevel;
      relationshipType?: RelationshipType;
      supportsGiftWrap?: boolean;
      verified?: boolean;
    }): Promise<UIContact[]> => {
      if (!service) return [];

      try {
        const privacyContacts = await service.getContacts(filters);
        const uiContacts = await Promise.all(
          privacyContacts.map((contact) =>
            mapPrivacyContactToUIContact(contact)
          )
        );

        return uiContacts;
      } catch (error) {
        console.error("Failed to get contacts:", error);
        return [];
      }
    },
    [service, mapPrivacyContactToUIContact]
  );

  // Messaging functions
  const sendDirectMessage = useCallback(
    async (contactId: string, content: string, privacyLevel?: PrivacyLevel) => {
      if (!service) {
        return {
          success: false,
          privacyUsed: privacyLevel || PrivacyLevel.SELECTIVE,
          message: "Service not available",
        };
      }

      try {
        setSendMessage({ sending: true, error: null });

        const result = await service.sendDirectMessage(
          contactId,
          content,
          privacyLevel
        );

        setSendMessage({ sending: false, error: null });
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to send message";
        setSendMessage({ sending: false, error: errorMessage });

        return {
          success: false,
          privacyUsed: privacyLevel || PrivacyLevel.SELECTIVE,
          message: errorMessage,
        };
      }
    },
    [service]
  );

  // Message history functions
  const getMessageHistory = useCallback(
    async (contactId: string, limit: number = 50): Promise<any[]> => {
      if (!service) return [];

      try {
        setMessages((prev) => ({ ...prev, loading: true, error: null }));

        const history = await service.getMessageHistory(contactId, limit);

        setMessages({
          messages: history,
          loading: false,
          error: null,
        });

        return history;
      } catch (error) {
        setMessages((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to load message history",
        }));
        return [];
      }
    },
    [service]
  );

  // Internal refresh function
  const refreshContactsInternal = useCallback(async () => {
    if (!service) return;

    try {
      setContacts((prev) => ({ ...prev, loading: true, error: null }));

      const privacyContacts = await service.getContacts();
      const uiContacts = await Promise.all(
        privacyContacts.map((contact) => mapPrivacyContactToUIContact(contact))
      );

      setContacts({
        contacts: uiContacts,
        loading: false,
        error: null,
      });
    } catch (error) {
      setContacts((prev) => ({
        ...prev,
        loading: false,
        error:
          error instanceof Error ? error.message : "Failed to load contacts",
      }));
    }
  }, [service, mapPrivacyContactToUIContact]);

  // Refresh functions
  const refreshContacts = useCallback(async (): Promise<void> => {
    await refreshContactsInternal();
  }, [refreshContactsInternal]);

  const refreshMessages = useCallback(
    async (contactId: string): Promise<void> => {
      await getMessageHistory(contactId);
    },
    [getMessageHistory]
  );

  return {
    // Service instance
    service,

    // Session state
    session,

    // State
    contacts,
    messages,
    sendMessage,

    // Session management
    initializeSession,
    restoreSession,

    // Contact management
    addContact,
    updateContact,
    deleteContact,
    getContacts,

    // Messaging
    sendDirectMessage,

    // Message history
    getMessageHistory,

    // Utilities
    refreshContacts,
    refreshMessages,
  };
}

// Helper functions to map codes to enums
function mapTrustLevelCodeToEnum(code: number): TrustLevel {
  switch (code) {
    case 4:
      return TrustLevel.FAMILY;
    case 3:
      return TrustLevel.TRUSTED;
    case 2:
      return TrustLevel.KNOWN;
    case 1:
      return TrustLevel.UNVERIFIED;
    default:
      return TrustLevel.UNVERIFIED;
  }
}

function mapRelationshipCodeToEnum(code: number): RelationshipType {
  switch (code) {
    case 7:
      return RelationshipType.FAMILY_ASSOCIATE;
    case 6:
      return RelationshipType.CHILD;
    case 5:
      return RelationshipType.PARENT;
    case 4:
      return RelationshipType.GUARDIAN;
    case 3:
      return RelationshipType.ADVISOR;
    case 2:
      return RelationshipType.BUSINESS;
    case 1:
      return RelationshipType.FRIEND;
    default:
      return RelationshipType.FRIEND;
  }
}

// Convenience hook for contacts with privacy protection
export function usePrivacyContacts(filters?: {
  trustLevel?: TrustLevel;
  relationshipType?: RelationshipType;
  supportsGiftWrap?: boolean;
  verified?: boolean;
}) {
  const {
    contacts,
    addContact,
    updateContact,
    deleteContact,
    refreshContacts,
  } = usePrivacyFirstCommunications();

  // Filter contacts based on criteria
  const filteredContacts = contacts.contacts.filter((contact) => {
    if (filters?.trustLevel && contact.trustLevel !== filters.trustLevel)
      return false;
    if (
      filters?.relationshipType &&
      contact.relationshipType !== filters.relationshipType
    )
      return false;
    if (
      filters?.supportsGiftWrap !== undefined &&
      contact.supportsGiftWrap !== filters.supportsGiftWrap
    )
      return false;
    if (
      filters?.verified !== undefined &&
      contact.verified !== filters.verified
    )
      return false;
    return true;
  });

  return {
    contacts: filteredContacts,
    loading: contacts.loading,
    error: contacts.error,
    addContact,
    updateContact,
    deleteContact,
    refreshContacts,
  };
}

// Convenience hook for messaging with privacy protection
export function usePrivacyMessaging(contactId?: string) {
  const {
    sendDirectMessage,
    getMessageHistory,
    messages,
    sendMessage,
    refreshMessages,
  } = usePrivacyFirstCommunications();

  return {
    sendDirectMessage,
    getMessageHistory,
    messages: messages.messages,
    loading: messages.loading || sendMessage.sending,
    error: messages.error || sendMessage.error,
    refreshMessages: contactId ? () => refreshMessages(contactId) : undefined,
  };
}
