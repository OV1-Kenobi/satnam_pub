/**
 * useGiftWrappedCommunications Hook
 *
 * React hook that provides access to the SatnamGiftWrappedCommunications service
 * with real-time updates, loading states, and error handling.
 *
 * Integrates with existing Supabase database and auth systems.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { EnhancedNostrManager } from "../../lib/enhanced-nostr-manager";
import {
  Contact,
  GroupRole,
  MessagingGroup,
  PrivacyLevel,
  PrivateMessage,
  RelationshipType,
  SatnamGiftWrappedCommunications,
  TrustLevel,
} from "../lib/gift-wrapped-messaging/comprehensive-service";
import { useAuth } from "./useAuth";

// Hook state interfaces
interface ContactsState {
  contacts: Contact[];
  loading: boolean;
  error: string | null;
}

interface GroupsState {
  groups: MessagingGroup[];
  loading: boolean;
  error: string | null;
}

interface MessagesState {
  messages: PrivateMessage[];
  loading: boolean;
  error: string | null;
}

interface SendMessageState {
  sending: boolean;
  error: string | null;
}

// Hook return interface
export interface UseGiftWrappedCommunicationsReturn {
  // Service instance
  service: SatnamGiftWrappedCommunications | null;

  // State
  contacts: ContactsState;
  groups: GroupsState;
  messages: MessagesState;
  sendMessage: SendMessageState;

  // Contact management
  addContact: (
    contactData: Omit<Contact, "id" | "addedAt" | "supportsGiftWrap">
  ) => Promise<Contact | null>;
  updateContact: (
    contactId: string,
    updates: Partial<Contact>
  ) => Promise<Contact | null>;
  deleteContact: (contactId: string) => Promise<boolean>;
  getContact: (identifier: string) => Promise<Contact | null>;
  getContacts: (filters?: {
    trustLevel?: TrustLevel;
    relationshipType?: RelationshipType;
    supportsGiftWrap?: boolean;
    verified?: boolean;
  }) => Promise<Contact[]>;

  // Group management
  createGroup: (
    name: string,
    description: string,
    members: string[],
    privacy?: PrivacyLevel,
    familyId?: string
  ) => Promise<MessagingGroup | null>;
  addGroupMember: (
    groupId: string,
    contactId: string,
    role?: GroupRole
  ) => Promise<boolean>;

  // Messaging
  sendDirectMessage: (
    recipientId: string,
    content: string,
    privacyLevel?: PrivacyLevel
  ) => Promise<{
    success: boolean;
    messageId?: string;
    privacyUsed: PrivacyLevel;
    requiresApproval?: boolean;
    message: string;
  }>;
  sendGroupMessage: (
    groupId: string,
    content: string
  ) => Promise<{
    success: boolean;
    messageId?: string;
    message: string;
  }>;

  // Message history
  getMessageHistory: (
    identifier: string,
    limit?: number
  ) => Promise<PrivateMessage[]>;

  // Utilities
  getWebOfTrustScore: (contactId: string) => Promise<number>;
  refreshContacts: () => Promise<void>;
  refreshGroups: () => Promise<void>;
  refreshMessages: (identifier: string) => Promise<void>;
}

/**
 * Main hook for Gift Wrapped Communications
 */
export function useGiftWrappedCommunications(): UseGiftWrappedCommunicationsReturn {
  // Get auth context for family/user info
  const { user, familyId } = useAuth();

  // Service instance
  const [service, setService] =
    useState<SatnamGiftWrappedCommunications | null>(null);

  // State management
  const [contacts, setContacts] = useState<ContactsState>({
    contacts: [],
    loading: true,
    error: null,
  });

  const [groups, setGroups] = useState<GroupsState>({
    groups: [],
    loading: true,
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
  const serviceRef = useRef<SatnamGiftWrappedCommunications | null>(null);

  // Initialize service
  useEffect(() => {
    const initializeService = async () => {
      try {
        // Initialize the EnhancedNostrManager
        const nostrManager = new EnhancedNostrManager();

        // Initialize user account if authenticated
        if (user) {
          await nostrManager.initializeIndividualAccount(
            user.id,
            user.username || user.email?.split("@")[0] || "user",
            undefined, // Let it generate a new key
            {
              privacyMode: true,
              encryptDMs: true,
              autoPublishProfile: false, // Don't auto-publish for privacy
            }
          );
        }

        // Create the wrapper service
        const giftWrappedService = new SatnamGiftWrappedCommunications(
          nostrManager
        );

        setService(giftWrappedService);
        serviceRef.current = giftWrappedService;

        // Load initial data
        await refreshContactsInternal(giftWrappedService);
        await refreshGroupsInternal(giftWrappedService);
      } catch (error) {
        console.error(
          "Failed to initialize Gift Wrapped Communications service:",
          error
        );
        setContacts((prev) => ({
          ...prev,
          loading: false,
          error: "Failed to initialize service",
        }));
        setGroups((prev) => ({
          ...prev,
          loading: false,
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
  }, [user]);

  // Internal refresh functions
  const refreshContactsInternal = async (
    serviceInstance: SatnamGiftWrappedCommunications
  ) => {
    try {
      setContacts((prev) => ({ ...prev, loading: true, error: null }));
      const contactsList = await serviceInstance.getContacts();
      setContacts({
        contacts: contactsList,
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
  };

  const refreshGroupsInternal = async (
    serviceInstance: SatnamGiftWrappedCommunications
  ) => {
    try {
      setGroups((prev) => ({ ...prev, loading: true, error: null }));
      // Note: We'd need to add a getGroups method to the service
      // For now, we'll use the internal groups map
      setGroups({
        groups: [], // Placeholder
        loading: false,
        error: null,
      });
    } catch (error) {
      setGroups((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load groups",
      }));
    }
  };

  // Contact management functions
  const addContact = useCallback(
    async (
      contactData: Omit<Contact, "id" | "addedAt" | "supportsGiftWrap">
    ): Promise<Contact | null> => {
      if (!service) return null;

      try {
        setContacts((prev) => ({ ...prev, loading: true, error: null }));
        const newContact = await service.addContact(contactData);

        // Refresh contacts list
        await refreshContactsInternal(service);

        return newContact;
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
    [service]
  );

  const updateContact = useCallback(
    async (
      contactId: string,
      updates: Partial<Contact>
    ): Promise<Contact | null> => {
      if (!service) return null;

      try {
        const updatedContact = await service.updateContact(contactId, updates);

        // Update local state
        setContacts((prev) => ({
          ...prev,
          contacts: prev.contacts.map((contact) =>
            contact.id === contactId ? updatedContact : contact
          ),
        }));

        return updatedContact;
      } catch (error) {
        setContacts((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Failed to update contact",
        }));
        return null;
      }
    },
    [service]
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
              (contact) => contact.id !== contactId
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

  const getContact = useCallback(
    async (identifier: string): Promise<Contact | null> => {
      if (!service) return null;

      try {
        return await service.getContact(identifier);
      } catch (error) {
        console.error("Failed to get contact:", error);
        return null;
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
    }): Promise<Contact[]> => {
      if (!service) return [];

      try {
        return await service.getContacts(filters);
      } catch (error) {
        console.error("Failed to get contacts:", error);
        return [];
      }
    },
    [service]
  );

  // Group management functions
  const createGroup = useCallback(
    async (
      name: string,
      description: string,
      members: string[],
      privacy: PrivacyLevel = PrivacyLevel.MAXIMUM,
      familyIdParam?: string
    ): Promise<MessagingGroup | null> => {
      if (!service || !user) return null;

      try {
        setGroups((prev) => ({ ...prev, loading: true, error: null }));

        const group = await service.createGroup(
          name,
          description,
          members,
          privacy,
          user.id,
          familyIdParam || familyId
        );

        // Refresh groups list
        await refreshGroupsInternal(service);

        return group;
      } catch (error) {
        setGroups((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error ? error.message : "Failed to create group",
        }));
        return null;
      }
    },
    [service, user, familyId]
  );

  const addGroupMember = useCallback(
    async (
      groupId: string,
      contactId: string,
      role: GroupRole = GroupRole.MEMBER
    ): Promise<boolean> => {
      if (!service) return false;

      try {
        const success = await service.addGroupMember(groupId, contactId, role);

        if (success) {
          // Refresh groups list
          await refreshGroupsInternal(service);
        }

        return success;
      } catch (error) {
        setGroups((prev) => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : "Failed to add group member",
        }));
        return false;
      }
    },
    [service]
  );

  // Messaging functions
  const sendDirectMessage = useCallback(
    async (
      recipientId: string,
      content: string,
      privacyLevel?: PrivacyLevel
    ) => {
      if (!service || !user) {
        return {
          success: false,
          privacyUsed: privacyLevel || PrivacyLevel.SELECTIVE,
          message: "Service not available",
        };
      }

      try {
        setSendMessage({ sending: true, error: null });

        const result = await service.sendDirectMessage(
          recipientId,
          content,
          privacyLevel,
          {
            userId: user.id,
            familyId: familyId,
          }
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
    [service, user, familyId]
  );

  const sendGroupMessage = useCallback(
    async (groupId: string, content: string) => {
      if (!service || !user) {
        return {
          success: false,
          message: "Service not available",
        };
      }

      try {
        setSendMessage({ sending: true, error: null });

        const result = await service.sendGroupMessage(
          groupId,
          content,
          user.id,
          {
            userId: user.id,
            familyId: familyId,
          }
        );

        setSendMessage({ sending: false, error: null });
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to send group message";
        setSendMessage({ sending: false, error: errorMessage });

        return {
          success: false,
          message: errorMessage,
        };
      }
    },
    [service, user, familyId]
  );

  // Message history functions
  const getMessageHistory = useCallback(
    async (
      identifier: string,
      limit: number = 50
    ): Promise<PrivateMessage[]> => {
      if (!service) return [];

      try {
        setMessages((prev) => ({ ...prev, loading: true, error: null }));

        const history = await service.getMessageHistory(identifier, limit);

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

  // Utility functions
  const getWebOfTrustScore = useCallback(
    async (contactId: string): Promise<number> => {
      if (!service) return 0;

      try {
        return await service.getWebOfTrustScore(contactId);
      } catch (error) {
        console.error("Failed to get Web of Trust score:", error);
        return 0;
      }
    },
    [service]
  );

  // Refresh functions
  const refreshContacts = useCallback(async (): Promise<void> => {
    if (service) {
      await refreshContactsInternal(service);
    }
  }, [service]);

  const refreshGroups = useCallback(async (): Promise<void> => {
    if (service) {
      await refreshGroupsInternal(service);
    }
  }, [service]);

  const refreshMessages = useCallback(
    async (identifier: string): Promise<void> => {
      if (service) {
        await getMessageHistory(identifier);
      }
    },
    [service, getMessageHistory]
  );

  return {
    // Service instance
    service,

    // State
    contacts,
    groups,
    messages,
    sendMessage,

    // Contact management
    addContact,
    updateContact,
    deleteContact,
    getContact,
    getContacts,

    // Group management
    createGroup,
    addGroupMember,

    // Messaging
    sendDirectMessage,
    sendGroupMessage,

    // Message history
    getMessageHistory,

    // Utilities
    getWebOfTrustScore,
    refreshContacts,
    refreshGroups,
    refreshMessages,
  };
}

// Convenience hooks for specific use cases
export function useContacts(filters?: {
  trustLevel?: TrustLevel;
  relationshipType?: RelationshipType;
  supportsGiftWrap?: boolean;
  verified?: boolean;
}) {
  const {
    contacts,
    getContacts,
    addContact,
    updateContact,
    deleteContact,
    refreshContacts,
  } = useGiftWrappedCommunications();

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

export function useMessaging(contactId?: string) {
  const {
    sendDirectMessage,
    sendGroupMessage,
    getMessageHistory,
    messages,
    sendMessage,
    refreshMessages,
  } = useGiftWrappedCommunications();

  return {
    sendDirectMessage,
    sendGroupMessage,
    getMessageHistory,
    messages: messages.messages,
    loading: messages.loading || sendMessage.sending,
    error: messages.error || sendMessage.error,
    refreshMessages: contactId ? () => refreshMessages(contactId) : undefined,
  };
}
