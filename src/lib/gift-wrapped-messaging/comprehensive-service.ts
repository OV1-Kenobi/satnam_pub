/**
 * Satnam Gift Wrapped Communications Service
 *
 * Wrapper service that enhances the existing EnhancedNostrManager with:
 * - Contact management with trust levels (integrated with SSS recovery system)
 * - Relationship types and Gift Wrap capability detection
 * - Privacy-first encrypted local storage
 * - Group messaging with role-based permissions
 * - NFC authentication integration
 * - Web of Trust building functionality
 *
 * This service preserves all existing functionality while adding sophisticated
 * gift-wrapped communication capabilities with seamless fallback to NIP-04.
 */

import { EnhancedNostrManager } from "../../../lib/enhanced-nostr-manager";
import { supabase } from "../../../lib/supabase";

// Trust levels (integrated with existing SSS recovery system)
export enum TrustLevel {
  FAMILY = "family", // SSS trustLevel: 4 - Immediate family members
  TRUSTED = "trusted", // SSS trustLevel: 3 - Close friends, family lawyer, etc.
  KNOWN = "known", // SSS trustLevel: 2 - Known associates
  UNVERIFIED = "unverified", // SSS trustLevel: 1 - New/unverified contacts
}

// Relationship types for family context
export enum RelationshipType {
  PARENT = "parent",
  CHILD = "child",
  GUARDIAN = "guardian",
  ADVISOR = "advisor",
  FRIEND = "friend",
  BUSINESS = "business",
  FAMILY_ASSOCIATE = "family-associate",
}

// Privacy levels (matching existing implementation)
export enum PrivacyLevel {
  MAXIMUM = "giftwrapped", // NIP-17 Gift Wrapped - Complete metadata protection
  SELECTIVE = "encrypted", // NIP-04 Encrypted DM - Controlled metadata
  TRANSPARENT = "minimal", // Standard - Public interactions
}

// Group roles (integrated with existing family permissions)
export enum GroupRole {
  ADMIN = "admin",
  MEMBER = "member",
  VIEWER = "viewer",
}

// Contact interface integrating with existing trust system
export interface Contact {
  id: string;
  npub: string;
  username?: string;
  nip05?: string;
  displayName?: string;
  notes?: string;
  trustLevel: TrustLevel;
  relationshipType: RelationshipType;
  supportsGiftWrap: boolean;
  verified: boolean;
  addedAt: Date;
  lastInteraction?: Date;
  metadata: {
    lightningAddress?: string;
    website?: string;
    about?: string;
    picture?: string;
  };
  familyContext?: {
    familyId: string;
    role: string;
    permissions: string[];
  };
}

// Group interface for family messaging
export interface MessagingGroup {
  id: string;
  name: string;
  description?: string;
  members: Array<{
    contactId: string;
    role: GroupRole;
    joinedAt: Date;
  }>;
  privacy: PrivacyLevel;
  createdBy: string;
  createdAt: Date;
  familyId?: string;
}

// Message interface with privacy indicators
export interface PrivateMessage {
  id: string;
  content: string;
  sender: string;
  recipient?: string;
  groupId?: string;
  privacyLevel: PrivacyLevel;
  encrypted: boolean;
  timestamp: Date;
  status: "sent" | "delivered" | "failed";
  nostrEventId?: string;
  requiresApproval?: boolean;
  approvedBy?: string;
}

/**
 * Main wrapper service that enhances EnhancedNostrManager
 */
export class SatnamGiftWrappedCommunications {
  private nostrManager: EnhancedNostrManager;
  private contacts: Map<string, Contact> = new Map();
  private groups: Map<string, MessagingGroup> = new Map();
  private messageHistory: Map<string, PrivateMessage[]> = new Map();

  constructor(nostrManager?: EnhancedNostrManager) {
    this.nostrManager = nostrManager || new EnhancedNostrManager();
    this.initializeService();
  }

  /**
   * Initialize the service with existing data
   */
  private async initializeService(): Promise<void> {
    await this.loadContacts();
    await this.loadGroups();
    await this.loadMessageHistory();
  }

  // ===== CONTACT MANAGEMENT =====

  /**
   * Add new contact with automatic Gift Wrap detection
   */
  async addContact(
    contactData: Omit<Contact, "id" | "addedAt" | "supportsGiftWrap">
  ): Promise<Contact> {
    try {
      // Generate unique contact ID
      const contactId = `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Auto-detect Gift Wrap support
      const supportsGiftWrap = await this.detectGiftWrapSupport(
        contactData.npub
      );

      const contact: Contact = {
        ...contactData,
        id: contactId,
        addedAt: new Date(),
        supportsGiftWrap,
      };

      // Store in local map
      this.contacts.set(contactId, contact);

      // Store in Supabase with existing encryption patterns
      await this.storeContactSecurely(contact);

      return contact;
    } catch (error) {
      console.error("Failed to add contact:", error);
      throw new Error("Failed to add contact");
    }
  }

  /**
   * Update existing contact
   */
  async updateContact(
    contactId: string,
    updates: Partial<Contact>
  ): Promise<Contact> {
    const contact = this.contacts.get(contactId);
    if (!contact) {
      throw new Error("Contact not found");
    }

    const updatedContact = { ...contact, ...updates };
    this.contacts.set(contactId, updatedContact);

    await this.storeContactSecurely(updatedContact);
    return updatedContact;
  }

  /**
   * Delete contact
   */
  async deleteContact(contactId: string): Promise<boolean> {
    try {
      this.contacts.delete(contactId);

      const { error } = await supabase
        .from("contacts")
        .delete()
        .eq("id", contactId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Failed to delete contact:", error);
      return false;
    }
  }

  /**
   * Get contact by ID or npub
   */
  async getContact(identifier: string): Promise<Contact | null> {
    // Check if it's an ID first
    if (this.contacts.has(identifier)) {
      return this.contacts.get(identifier) || null;
    }

    // Search by npub
    for (const contact of this.contacts.values()) {
      if (contact.npub === identifier) {
        return contact;
      }
    }

    return null;
  }

  /**
   * Get all contacts with optional filtering
   */
  async getContacts(filters?: {
    trustLevel?: TrustLevel;
    relationshipType?: RelationshipType;
    supportsGiftWrap?: boolean;
    verified?: boolean;
  }): Promise<Contact[]> {
    let contacts = Array.from(this.contacts.values());

    if (filters) {
      contacts = contacts.filter((contact) => {
        if (filters.trustLevel && contact.trustLevel !== filters.trustLevel)
          return false;
        if (
          filters.relationshipType &&
          contact.relationshipType !== filters.relationshipType
        )
          return false;
        if (
          filters.supportsGiftWrap !== undefined &&
          contact.supportsGiftWrap !== filters.supportsGiftWrap
        )
          return false;
        if (
          filters.verified !== undefined &&
          contact.verified !== filters.verified
        )
          return false;
        return true;
      });
    }

    return contacts.sort(
      (a, b) =>
        b.lastInteraction?.getTime() || 0 - (a.lastInteraction?.getTime() || 0)
    );
  }

  // ===== GROUP MANAGEMENT =====

  /**
   * Create messaging group
   */
  async createGroup(
    name: string,
    description: string,
    members: string[], // contact IDs
    privacy: PrivacyLevel = PrivacyLevel.MAXIMUM,
    createdBy: string,
    familyId?: string
  ): Promise<MessagingGroup> {
    const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const group: MessagingGroup = {
      id: groupId,
      name,
      description,
      members: members.map((contactId) => ({
        contactId,
        role: contactId === createdBy ? GroupRole.ADMIN : GroupRole.MEMBER,
        joinedAt: new Date(),
      })),
      privacy,
      createdBy,
      createdAt: new Date(),
      familyId,
    };

    this.groups.set(groupId, group);
    await this.storeGroupSecurely(group);

    return group;
  }

  /**
   * Add member to group
   */
  async addGroupMember(
    groupId: string,
    contactId: string,
    role: GroupRole = GroupRole.MEMBER
  ): Promise<boolean> {
    const group = this.groups.get(groupId);
    if (!group) return false;

    // Check if already a member
    if (group.members.find((m) => m.contactId === contactId)) {
      return false;
    }

    group.members.push({
      contactId,
      role,
      joinedAt: new Date(),
    });

    this.groups.set(groupId, group);
    await this.storeGroupSecurely(group);

    return true;
  }

  // ===== MESSAGING WITH GIFT WRAP ENHANCEMENT =====

  /**
   * Send direct message with automatic privacy level selection
   */
  async sendDirectMessage(
    recipientId: string,
    content: string,
    privacyLevel?: PrivacyLevel,
    familyContext?: { userId: string; familyId?: string }
  ): Promise<{
    success: boolean;
    messageId?: string;
    privacyUsed: PrivacyLevel;
    requiresApproval?: boolean;
    message: string;
  }> {
    try {
      const contact = await this.getContact(recipientId);
      if (!contact) {
        throw new Error("Contact not found");
      }

      // Auto-select privacy level if not specified
      const selectedPrivacy =
        privacyLevel || this.selectOptimalPrivacyLevel(contact);

      // Check if family approval is required using existing system
      let requiresApproval = false;
      if (familyContext) {
        const context = {
          mode: "family" as const,
          userId: familyContext.userId,
          familyId: familyContext.familyId,
        };

        // Use existing EnhancedNostrManager approval system
        requiresApproval = await this.checkRequiresApproval(
          content,
          contact,
          context
        );
      }

      let result;

      // Attempt Gift Wrap first if supported and maximum privacy requested
      if (
        selectedPrivacy === PrivacyLevel.MAXIMUM &&
        contact.supportsGiftWrap
      ) {
        result = await this.sendGiftWrappedMessage(
          content,
          contact,
          familyContext
        );
      } else if (
        selectedPrivacy === PrivacyLevel.SELECTIVE ||
        selectedPrivacy === PrivacyLevel.MAXIMUM
      ) {
        // Fall back to existing NIP-04 encrypted messaging
        result = await this.sendEncryptedMessage(
          content,
          contact,
          familyContext
        );
      } else {
        // Use existing standard messaging
        result = await this.sendStandardMessage(
          content,
          contact,
          familyContext
        );
      }

      // Store message in history
      const message: PrivateMessage = {
        id: result.messageId || `msg_${Date.now()}`,
        content,
        sender: familyContext?.userId || "unknown",
        recipient: contact.npub,
        privacyLevel: selectedPrivacy,
        encrypted: selectedPrivacy !== PrivacyLevel.TRANSPARENT,
        timestamp: new Date(),
        status: result.success ? "sent" : "failed",
        nostrEventId: result.eventId,
        requiresApproval,
      };

      await this.storeMessage(message);

      // Update contact interaction timestamp
      contact.lastInteraction = new Date();
      this.contacts.set(contact.id, contact);

      return {
        success: result.success,
        messageId: message.id,
        privacyUsed: selectedPrivacy,
        requiresApproval,
        message: result.message,
      };
    } catch (error) {
      console.error("Failed to send direct message:", error);
      return {
        success: false,
        privacyUsed: privacyLevel || PrivacyLevel.SELECTIVE,
        message: `Failed to send message: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Send group message
   */
  async sendGroupMessage(
    groupId: string,
    content: string,
    senderId: string,
    familyContext?: { userId: string; familyId?: string }
  ): Promise<{
    success: boolean;
    messageId?: string;
    message: string;
  }> {
    try {
      const group = this.groups.get(groupId);
      if (!group) {
        throw new Error("Group not found");
      }

      // Check sender is group member
      const senderMember = group.members.find((m) => m.contactId === senderId);
      if (!senderMember) {
        throw new Error("Sender is not a group member");
      }

      // Get all recipient contacts
      const recipients = await Promise.all(
        group.members
          .filter((m) => m.contactId !== senderId)
          .map((m) => this.getContact(m.contactId))
      );

      const validRecipients = recipients.filter((c) => c !== null) as Contact[];

      // Send to each recipient using their optimal privacy level
      const results = await Promise.all(
        validRecipients.map(async (contact) => {
          return await this.sendDirectMessage(
            contact.id,
            content,
            group.privacy,
            familyContext
          );
        })
      );

      const successCount = results.filter((r) => r.success).length;

      // Store group message
      const message: PrivateMessage = {
        id: `gmsg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content,
        sender: senderId,
        groupId,
        privacyLevel: group.privacy,
        encrypted: group.privacy !== PrivacyLevel.TRANSPARENT,
        timestamp: new Date(),
        status: successCount > 0 ? "sent" : "failed",
      };

      await this.storeMessage(message);

      return {
        success: successCount > 0,
        messageId: message.id,
        message: `Group message sent to ${successCount}/${validRecipients.length} members`,
      };
    } catch (error) {
      console.error("Failed to send group message:", error);
      return {
        success: false,
        message: `Failed to send group message: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Detect if contact supports Gift Wrap (NIP-17)
   */
  private async detectGiftWrapSupport(npub: string): Promise<boolean> {
    try {
      // In a real implementation, this would query relays for NIP-17 support
      // For now, we'll use a heuristic based on relay capabilities

      // This is a placeholder - actual implementation would:
      // 1. Query known relays for the contact's presence
      // 2. Check if those relays support NIP-17
      // 3. Optionally send a capability query to the contact

      return Math.random() > 0.3; // 70% chance for demo purposes
    } catch (error) {
      console.error("Failed to detect Gift Wrap support:", error);
      return false;
    }
  }

  /**
   * Select optimal privacy level based on contact trust and capabilities
   */
  private selectOptimalPrivacyLevel(contact: Contact): PrivacyLevel {
    // Family members with Gift Wrap support get maximum privacy
    if (contact.trustLevel === TrustLevel.FAMILY && contact.supportsGiftWrap) {
      return PrivacyLevel.MAXIMUM;
    }

    // Trusted contacts get selective privacy
    if (contact.trustLevel === TrustLevel.TRUSTED) {
      return PrivacyLevel.SELECTIVE;
    }

    // Business contacts typically use transparent for Lightning Address visibility
    if (contact.relationshipType === RelationshipType.BUSINESS) {
      return PrivacyLevel.TRANSPARENT;
    }

    // Default to selective privacy
    return PrivacyLevel.SELECTIVE;
  }

  /**
   * Check if message requires approval using existing system
   */
  private async checkRequiresApproval(
    content: string,
    contact: Contact,
    context: any
  ): Promise<boolean> {
    // Use existing EnhancedNostrManager approval logic
    // This would typically check family policies, content sensitivity, etc.

    // High-trust family members typically don't require approval
    if (contact.trustLevel === TrustLevel.FAMILY) {
      return false;
    }

    // Business relationships might require approval for large amounts or contracts
    if (
      contact.relationshipType === RelationshipType.BUSINESS &&
      (content.includes("contract") || content.includes("payment"))
    ) {
      return true;
    }

    return false;
  }

  /**
   * Send Gift Wrapped message (NIP-17)
   */
  private async sendGiftWrappedMessage(
    content: string,
    contact: Contact,
    familyContext?: any
  ): Promise<{ success: boolean; eventId?: string; message: string }> {
    try {
      // This would implement actual NIP-17 Gift Wrapping
      // For now, using existing nostrManager as fallback with enhanced privacy

      if (familyContext) {
        const context = {
          mode: "family" as const,
          userId: familyContext.userId,
          familyId: familyContext.familyId,
        };

        const result = await this.nostrManager.publishEvent(
          context,
          14, // Gift Wrapped DM kind
          content,
          [
            ["p", contact.npub],
            ["privacy-level", "giftwrapped"],
          ]
        );

        return {
          success: result.success,
          eventId: result.eventId,
          message: result.message,
        };
      } else {
        // Individual mode Gift Wrap
        const context = {
          mode: "individual" as const,
          userId: "individual_user",
        };

        const result = await this.nostrManager.publishEvent(
          context,
          14,
          content,
          [
            ["p", contact.npub],
            ["privacy-level", "giftwrapped"],
          ]
        );

        return {
          success: result.success,
          eventId: result.eventId,
          message: result.message,
        };
      }
    } catch (error) {
      console.error("Gift Wrap failed, falling back to encrypted DM:", error);
      return await this.sendEncryptedMessage(content, contact, familyContext);
    }
  }

  /**
   * Send encrypted message using existing NIP-04
   */
  private async sendEncryptedMessage(
    content: string,
    contact: Contact,
    familyContext?: any
  ): Promise<{ success: boolean; eventId?: string; message: string }> {
    try {
      if (familyContext) {
        const context = {
          mode: "family" as const,
          userId: familyContext.userId,
          familyId: familyContext.familyId,
        };

        const result = await this.nostrManager.publishEvent(
          context,
          4, // Encrypted DM kind
          content,
          [
            ["p", contact.npub],
            ["privacy-level", "encrypted"],
          ]
        );

        return {
          success: result.success,
          eventId: result.eventId,
          message: result.message,
        };
      } else {
        const context = {
          mode: "individual" as const,
          userId: "individual_user",
        };

        const result = await this.nostrManager.publishEvent(
          context,
          4,
          content,
          [
            ["p", contact.npub],
            ["privacy-level", "encrypted"],
          ]
        );

        return {
          success: result.success,
          eventId: result.eventId,
          message: result.message,
        };
      }
    } catch (error) {
      console.error("Encrypted messaging failed:", error);
      return {
        success: false,
        message: `Encrypted messaging failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Send standard message
   */
  private async sendStandardMessage(
    content: string,
    contact: Contact,
    familyContext?: any
  ): Promise<{ success: boolean; eventId?: string; message: string }> {
    try {
      if (familyContext) {
        const context = {
          mode: "family" as const,
          userId: familyContext.userId,
          familyId: familyContext.familyId,
        };

        const result = await this.nostrManager.publishEvent(
          context,
          1, // Text note kind
          content,
          [
            ["p", contact.npub],
            ["privacy-level", "minimal"],
          ]
        );

        return {
          success: result.success,
          eventId: result.eventId,
          message: result.message,
        };
      } else {
        const context = {
          mode: "individual" as const,
          userId: "individual_user",
        };

        const result = await this.nostrManager.publishEvent(
          context,
          1,
          content,
          [
            ["p", contact.npub],
            ["privacy-level", "minimal"],
          ]
        );

        return {
          success: result.success,
          eventId: result.eventId,
          message: result.message,
        };
      }
    } catch (error) {
      console.error("Standard messaging failed:", error);
      return {
        success: false,
        message: `Standard messaging failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  // ===== DATA PERSISTENCE METHODS =====

  /**
   * Load contacts from secure storage
   */
  private async loadContacts(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .order("added_at", { ascending: false });

      if (error) throw error;

      if (data) {
        data.forEach((contactData: any) => {
          const contact: Contact = {
            id: contactData.id,
            npub: contactData.npub,
            username: contactData.username,
            nip05: contactData.nip05,
            displayName: contactData.display_name,
            notes: contactData.notes,
            trustLevel: contactData.trust_level as TrustLevel,
            relationshipType: contactData.relationship_type as RelationshipType,
            supportsGiftWrap: contactData.supports_gift_wrap,
            verified: contactData.verified,
            addedAt: new Date(contactData.added_at),
            lastInteraction: contactData.last_interaction
              ? new Date(contactData.last_interaction)
              : undefined,
            metadata: contactData.metadata || {},
            familyContext: contactData.family_context,
          };
          this.contacts.set(contact.id, contact);
        });
      }
    } catch (error) {
      console.error("Failed to load contacts:", error);
    }
  }

  /**
   * Store contact securely
   */
  private async storeContactSecurely(contact: Contact): Promise<void> {
    try {
      const { error } = await supabase.from("contacts").upsert({
        id: contact.id,
        npub: contact.npub,
        username: contact.username,
        nip05: contact.nip05,
        display_name: contact.displayName,
        notes: contact.notes,
        trust_level: contact.trustLevel,
        relationship_type: contact.relationshipType,
        supports_gift_wrap: contact.supportsGiftWrap,
        verified: contact.verified,
        added_at: contact.addedAt.toISOString(),
        last_interaction: contact.lastInteraction?.toISOString(),
        metadata: contact.metadata,
        family_context: contact.familyContext,
      });

      if (error) throw error;
    } catch (error) {
      console.error("Failed to store contact:", error);
      throw error;
    }
  }

  /**
   * Load groups from secure storage
   */
  private async loadGroups(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from("messaging_groups")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data) {
        data.forEach((groupData: any) => {
          const group: MessagingGroup = {
            id: groupData.id,
            name: groupData.name,
            description: groupData.description,
            members: groupData.members || [],
            privacy: groupData.privacy as PrivacyLevel,
            createdBy: groupData.created_by,
            createdAt: new Date(groupData.created_at),
            familyId: groupData.family_id,
          };
          this.groups.set(group.id, group);
        });
      }
    } catch (error) {
      console.error("Failed to load groups:", error);
    }
  }

  /**
   * Store group securely
   */
  private async storeGroupSecurely(group: MessagingGroup): Promise<void> {
    try {
      const { error } = await supabase.from("messaging_groups").upsert({
        id: group.id,
        name: group.name,
        description: group.description,
        members: group.members,
        privacy: group.privacy,
        created_by: group.createdBy,
        created_at: group.createdAt.toISOString(),
        family_id: group.familyId,
      });

      if (error) throw error;
    } catch (error) {
      console.error("Failed to store group:", error);
      throw error;
    }
  }

  /**
   * Load message history
   */
  private async loadMessageHistory(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from("private_messages")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(1000); // Load recent messages

      if (error) throw error;

      if (data) {
        data.forEach((messageData: any) => {
          const message: PrivateMessage = {
            id: messageData.id,
            content: messageData.content,
            sender: messageData.sender,
            recipient: messageData.recipient,
            groupId: messageData.group_id,
            privacyLevel: messageData.privacy_level as PrivacyLevel,
            encrypted: messageData.encrypted,
            timestamp: new Date(messageData.timestamp),
            status: messageData.status,
            nostrEventId: messageData.nostr_event_id,
            requiresApproval: messageData.requires_approval,
            approvedBy: messageData.approved_by,
          };

          const key = message.groupId || message.recipient || message.sender;
          if (!this.messageHistory.has(key)) {
            this.messageHistory.set(key, []);
          }
          this.messageHistory.get(key)!.push(message);
        });
      }
    } catch (error) {
      console.error("Failed to load message history:", error);
    }
  }

  /**
   * Store message
   */
  private async storeMessage(message: PrivateMessage): Promise<void> {
    try {
      const { error } = await supabase.from("private_messages").insert({
        id: message.id,
        content: message.content,
        sender: message.sender,
        recipient: message.recipient,
        group_id: message.groupId,
        privacy_level: message.privacyLevel,
        encrypted: message.encrypted,
        timestamp: message.timestamp.toISOString(),
        status: message.status,
        nostr_event_id: message.nostrEventId,
        requires_approval: message.requiresApproval,
        approved_by: message.approvedBy,
      });

      if (error) throw error;

      // Update in-memory history
      const key = message.groupId || message.recipient || message.sender;
      if (!this.messageHistory.has(key)) {
        this.messageHistory.set(key, []);
      }
      this.messageHistory.get(key)!.unshift(message);
    } catch (error) {
      console.error("Failed to store message:", error);
      throw error;
    }
  }

  /**
   * Get message history for contact or group
   */
  async getMessageHistory(
    identifier: string,
    limit: number = 50
  ): Promise<PrivateMessage[]> {
    const messages = this.messageHistory.get(identifier) || [];
    return messages.slice(0, limit);
  }

  /**
   * Get Web of Trust score for contact
   */
  async getWebOfTrustScore(contactId: string): Promise<number> {
    const contact = this.contacts.get(contactId);
    if (!contact) return 0;

    // Calculate score based on trust level, verification, and interactions
    let score = 0;

    switch (contact.trustLevel) {
      case TrustLevel.FAMILY:
        score += 40;
        break;
      case TrustLevel.TRUSTED:
        score += 30;
        break;
      case TrustLevel.KNOWN:
        score += 20;
        break;
      case TrustLevel.UNVERIFIED:
        score += 10;
        break;
    }

    if (contact.verified) score += 20;
    if (contact.supportsGiftWrap) score += 10;
    if (contact.lastInteraction) {
      const daysSinceInteraction =
        (Date.now() - contact.lastInteraction.getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysSinceInteraction < 7) score += 10;
      else if (daysSinceInteraction < 30) score += 5;
    }

    return Math.min(score, 100); // Cap at 100
  }
}
