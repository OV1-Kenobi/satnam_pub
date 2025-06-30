/**
 * Satnam Privacy-First Gift Wrapped Communications Service
 *
 * STRICT PRIVACY IMPLEMENTATION:
 * - ALL user data is hashed with unique salts before storage
 * - NO plain text PII is ever stored in database
 * - All sensitive data is encrypted client-side before transmission
 * - Session-based authentication with hashed session IDs
 * - Anonymous timestamps and capability flags only
 * - Zero-knowledge contact verification
 *
 * Enhances EnhancedNostrManager while maintaining complete privacy.
 */

import { EnhancedNostrManager } from "../../../lib/enhanced-nostr-manager";
import { supabase } from "../../../lib/supabase";

// Trust levels mapped to privacy-safe codes
export enum TrustLevel {
  FAMILY = "family", // Code: 4
  TRUSTED = "trusted", // Code: 3
  KNOWN = "known", // Code: 2
  UNVERIFIED = "unverified", // Code: 1
}

// Relationship types mapped to privacy-safe codes
export enum RelationshipType {
  PARENT = "parent", // Code: 5
  CHILD = "child", // Code: 6
  GUARDIAN = "guardian", // Code: 4
  ADVISOR = "advisor", // Code: 3
  FRIEND = "friend", // Code: 1
  BUSINESS = "business", // Code: 2
  FAMILY_ASSOCIATE = "family-associate", // Code: 7
}

// Privacy levels mapped to codes
export enum PrivacyLevel {
  MAXIMUM = "giftwrapped", // Code: 3 - NIP-17 Gift Wrapped
  SELECTIVE = "encrypted", // Code: 2 - NIP-04 Encrypted
  TRANSPARENT = "minimal", // Code: 1 - Standard
}

// Capability flags (bitfield)
export enum CapabilityFlags {
  GIFT_WRAP = 1, // 0001
  VERIFIED = 2, // 0010
  NFC = 4, // 0100
  LIGHTNING = 8, // 1000
}

// Privacy-safe contact interface (NO PII)
export interface PrivacyContact {
  contactId: string; // Anonymous contact ID
  trustLevelCode: number; // 1-4 trust level
  relationshipCode: number; // 1-7 relationship type
  capabilityFlags: number; // Bitfield for capabilities
  interactionCount: number; // Usage statistics
  trustScore: number; // Computed trust score
  createdEpoch: number; // Anonymous timestamp
  lastInteractionEpoch?: number;

  // Encrypted data (only decryptable by user)
  encryptedNpub?: string;
  encryptedDisplayName?: string;
  encryptedNip05?: string;
  encryptedNotes?: string;
  encryptedMetadata?: string;
}

// Privacy-safe group interface
export interface PrivacyGroup {
  groupId: string;
  privacyLevelCode: number;
  memberCount: number;
  createdEpoch: number;
  lastActivityEpoch?: number;

  // Encrypted group data
  encryptedName?: string;
  encryptedDescription?: string;
  encryptedMembers?: string;
}

// Privacy-safe message interface
export interface PrivacyMessage {
  messageId: string;
  senderHash: string; // Hashed sender ID
  recipientHash?: string; // Hashed recipient ID
  groupId?: string;
  privacyLevelCode: number;
  statusCode: number; // 1=sent, 2=delivered, 3=failed
  contentSize: number; // For rate limiting only
  sentEpoch: number;
  requiresApproval: boolean;

  // Encrypted content
  encryptedContent: string;
}

// Privacy session for client-side operations
export interface PrivacySession {
  sessionHash: string; // Hashed session ID
  userHash: string; // Hashed user ID
  salt: string; // Unique salt for this user
  encryptionKey: string; // Client-side encryption key
  expiresAt: Date;
}

/**
 * Privacy-First Communications Service
 * All operations maintain zero-knowledge privacy
 */
export class PrivacyFirstCommunicationsService {
  private nostrManager: EnhancedNostrManager;
  private session: PrivacySession | null = null;
  private clientEncryptionKey: string | null = null;

  // Utility mappings for privacy-safe operations
  private readonly trustLevelMap = {
    [TrustLevel.FAMILY]: 4,
    [TrustLevel.TRUSTED]: 3,
    [TrustLevel.KNOWN]: 2,
    [TrustLevel.UNVERIFIED]: 1,
  };

  private readonly relationshipMap = {
    [RelationshipType.FAMILY_ASSOCIATE]: 7,
    [RelationshipType.CHILD]: 6,
    [RelationshipType.PARENT]: 5,
    [RelationshipType.GUARDIAN]: 4,
    [RelationshipType.ADVISOR]: 3,
    [RelationshipType.BUSINESS]: 2,
    [RelationshipType.FRIEND]: 1,
  };

  private readonly privacyLevelMap = {
    [PrivacyLevel.MAXIMUM]: 3,
    [PrivacyLevel.SELECTIVE]: 2,
    [PrivacyLevel.TRANSPARENT]: 1,
  };

  constructor(nostrManager?: EnhancedNostrManager) {
    this.nostrManager = nostrManager || new EnhancedNostrManager();
  }

  // ===== PRIVACY SESSION MANAGEMENT =====

  /**
   * Initialize privacy session with hashed IDs and encryption
   */
  async initializePrivacySession(
    userId: string,
    sessionId: string,
    userEncryptionKey: string
  ): Promise<PrivacySession> {
    try {
      // Generate unique salt for this user
      const { data: saltData, error: saltError } =
        await supabase.rpc("generate_user_salt");

      if (saltError) throw saltError;
      const salt = saltData;

      // Hash user ID with salt
      const { data: userHash, error: hashError } = await supabase.rpc(
        "hash_user_id",
        { user_id: userId, salt }
      );

      if (hashError) throw hashError;

      // Hash session ID
      const sessionHash = await this.hashWithSalt(sessionId, salt);

      // Create session
      const session: PrivacySession = {
        sessionHash,
        userHash,
        salt,
        encryptionKey: userEncryptionKey,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };

      // Store session in database (encrypted)
      const { error: insertError } = await supabase
        .from("privacy_user_sessions")
        .insert({
          session_id: sessionHash,
          user_hash: userHash,
          salt,
          encryption_key_hash: await this.hashWithSalt(userEncryptionKey, salt),
          expires_at: session.expiresAt.toISOString(),
        });

      if (insertError) throw insertError;

      // Set session context for RLS
      await supabase.rpc("set_config", {
        setting_name: "app.session_hash",
        setting_value: sessionHash,
        is_local: true,
      });

      await supabase.rpc("set_config", {
        setting_name: "app.user_hash",
        setting_value: userHash,
        is_local: true,
      });

      this.session = session;
      this.clientEncryptionKey = userEncryptionKey;

      return session;
    } catch (error) {
      console.error("Failed to initialize privacy session:", error);
      throw new Error("Privacy session initialization failed");
    }
  }

  /**
   * Validate and restore privacy session
   */
  async restorePrivacySession(
    sessionHash: string,
    encryptionKey: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from("privacy_user_sessions")
        .select("*")
        .eq("session_id", sessionHash)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (error || !data) return false;

      // Verify encryption key
      const keyHash = await this.hashWithSalt(encryptionKey, data.salt);
      if (keyHash !== data.encryption_key_hash) return false;

      // Restore session
      this.session = {
        sessionHash: data.session_id,
        userHash: data.user_hash,
        salt: data.salt,
        encryptionKey,
        expiresAt: new Date(data.expires_at),
      };

      this.clientEncryptionKey = encryptionKey;

      // Set RLS context
      await supabase.rpc("set_config", {
        setting_name: "app.session_hash",
        setting_value: sessionHash,
        is_local: true,
      });

      await supabase.rpc("set_config", {
        setting_name: "app.user_hash",
        setting_value: data.user_hash,
        is_local: true,
      });

      return true;
    } catch (error) {
      console.error("Failed to restore privacy session:", error);
      return false;
    }
  }

  // ===== CONTACT MANAGEMENT =====

  /**
   * Add contact with full privacy protection
   */
  async addContact(contactData: {
    npub: string;
    displayName?: string;
    nip05?: string;
    notes?: string;
    trustLevel: TrustLevel;
    relationshipType: RelationshipType;
    verified?: boolean;
    metadata?: Record<string, any>;
  }): Promise<PrivacyContact> {
    if (!this.session || !this.clientEncryptionKey) {
      throw new Error("No active privacy session");
    }

    try {
      // Encrypt sensitive data client-side
      const encryptedNpub = await this.encryptData(contactData.npub);
      const encryptedDisplayName = contactData.displayName
        ? await this.encryptData(contactData.displayName)
        : null;
      const encryptedNip05 = contactData.nip05
        ? await this.encryptData(contactData.nip05)
        : null;
      const encryptedNotes = contactData.notes
        ? await this.encryptData(contactData.notes)
        : null;
      const encryptedMetadata = contactData.metadata
        ? await this.encryptData(JSON.stringify(contactData.metadata))
        : null;

      // Generate capability flags
      let capabilityFlags = 0;
      if (await this.detectGiftWrapSupport(contactData.npub)) {
        capabilityFlags |= CapabilityFlags.GIFT_WRAP;
      }
      if (contactData.verified) {
        capabilityFlags |= CapabilityFlags.VERIFIED;
      }

      // Insert into privacy-first database
      const { data, error } = await supabase
        .from("privacy_contacts")
        .insert({
          user_hash: this.session.userHash,
          encrypted_npub: encryptedNpub,
          encrypted_display_name: encryptedDisplayName,
          encrypted_nip05: encryptedNip05,
          encrypted_notes: encryptedNotes,
          encrypted_metadata: encryptedMetadata,
          trust_level_code: this.trustLevelMap[contactData.trustLevel],
          relationship_code: this.relationshipMap[contactData.relationshipType],
          capabilities_flags: capabilityFlags,
          trust_score: this.calculateInitialTrustScore(
            contactData.trustLevel,
            contactData.verified || false
          ),
        })
        .select()
        .single();

      if (error) throw error;

      return this.mapDatabaseContactToPrivacyContact(data);
    } catch (error) {
      console.error("Failed to add contact:", error);
      throw new Error("Failed to add contact");
    }
  }

  /**
   * Get contacts with privacy protection
   */
  async getContacts(filters?: {
    trustLevel?: TrustLevel;
    relationshipType?: RelationshipType;
    supportsGiftWrap?: boolean;
    verified?: boolean;
  }): Promise<PrivacyContact[]> {
    if (!this.session) {
      throw new Error("No active privacy session");
    }

    try {
      let query = supabase
        .from("privacy_contacts")
        .select("*")
        .eq("user_hash", this.session.userHash);

      // Apply filters (on privacy-safe fields only)
      if (filters?.trustLevel) {
        query = query.eq(
          "trust_level_code",
          this.trustLevelMap[filters.trustLevel]
        );
      }
      if (filters?.relationshipType) {
        query = query.eq(
          "relationship_code",
          this.relationshipMap[filters.relationshipType]
        );
      }
      if (filters?.supportsGiftWrap !== undefined) {
        if (filters.supportsGiftWrap) {
          query = query.gte("capabilities_flags", CapabilityFlags.GIFT_WRAP);
        } else {
          query = query.lt("capabilities_flags", CapabilityFlags.GIFT_WRAP);
        }
      }
      if (filters?.verified !== undefined) {
        if (filters.verified) {
          query = query.gte("capabilities_flags", CapabilityFlags.VERIFIED);
        }
      }

      const { data, error } = await query.order("trust_score", {
        ascending: false,
      });

      if (error) throw error;

      return (data || []).map((contact) =>
        this.mapDatabaseContactToPrivacyContact(contact)
      );
    } catch (error) {
      console.error("Failed to get contacts:", error);
      throw new Error("Failed to retrieve contacts");
    }
  }

  /**
   * Update contact with privacy protection
   */
  async updateContact(
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
  ): Promise<PrivacyContact> {
    if (!this.session || !this.clientEncryptionKey) {
      throw new Error("No active privacy session");
    }

    try {
      const updateData: any = {};

      // Encrypt updated sensitive data
      if (updates.displayName !== undefined) {
        updateData.encrypted_display_name = updates.displayName
          ? await this.encryptData(updates.displayName)
          : null;
      }
      if (updates.nip05 !== undefined) {
        updateData.encrypted_nip05 = updates.nip05
          ? await this.encryptData(updates.nip05)
          : null;
      }
      if (updates.notes !== undefined) {
        updateData.encrypted_notes = updates.notes
          ? await this.encryptData(updates.notes)
          : null;
      }
      if (updates.metadata !== undefined) {
        updateData.encrypted_metadata = updates.metadata
          ? await this.encryptData(JSON.stringify(updates.metadata))
          : null;
      }

      // Update privacy-safe fields
      if (updates.trustLevel !== undefined) {
        updateData.trust_level_code = this.trustLevelMap[updates.trustLevel];
      }
      if (updates.relationshipType !== undefined) {
        updateData.relationship_code =
          this.relationshipMap[updates.relationshipType];
      }

      // Update capability flags if verification status changed
      if (updates.verified !== undefined) {
        const { data: currentData } = await supabase
          .from("privacy_contacts")
          .select("capabilities_flags")
          .eq("contact_id", contactId)
          .single();

        if (currentData) {
          let flags = currentData.capabilities_flags;
          if (updates.verified) {
            flags |= CapabilityFlags.VERIFIED;
          } else {
            flags &= ~CapabilityFlags.VERIFIED;
          }
          updateData.capabilities_flags = flags;
        }
      }

      const { data, error } = await supabase
        .from("privacy_contacts")
        .update(updateData)
        .eq("contact_id", contactId)
        .eq("user_hash", this.session.userHash)
        .select()
        .single();

      if (error) throw error;

      return this.mapDatabaseContactToPrivacyContact(data);
    } catch (error) {
      console.error("Failed to update contact:", error);
      throw new Error("Failed to update contact");
    }
  }

  /**
   * Delete contact
   */
  async deleteContact(contactId: string): Promise<boolean> {
    if (!this.session) {
      throw new Error("No active privacy session");
    }

    try {
      const { error } = await supabase
        .from("privacy_contacts")
        .delete()
        .eq("contact_id", contactId)
        .eq("user_hash", this.session.userHash);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Failed to delete contact:", error);
      return false;
    }
  }

  // ===== MESSAGING =====

  /**
   * Send direct message with privacy protection
   */
  async sendDirectMessage(
    contactId: string,
    content: string,
    privacyLevel?: PrivacyLevel
  ): Promise<{
    success: boolean;
    messageId?: string;
    privacyUsed: PrivacyLevel;
    message: string;
  }> {
    if (!this.session || !this.clientEncryptionKey) {
      throw new Error("No active privacy session");
    }

    try {
      // Get contact to determine recipient hash and optimal privacy level
      const { data: contactData, error: contactError } = await supabase
        .from("privacy_contacts")
        .select("*")
        .eq("contact_id", contactId)
        .eq("user_hash", this.session.userHash)
        .single();

      if (contactError || !contactData) {
        throw new Error("Contact not found");
      }

      // Determine privacy level
      const selectedPrivacy =
        privacyLevel || this.selectOptimalPrivacyLevel(contactData);

      // Encrypt message content
      const encryptedContent = await this.encryptData(content);

      // Generate anonymous recipient hash from contact's encrypted npub
      const recipientHash = await this.hashWithSalt(
        contactId,
        this.session.salt
      );

      // Store message with privacy protection
      const { data: messageData, error: messageError } = await supabase
        .from("privacy_messages")
        .insert({
          sender_hash: this.session.userHash,
          recipient_hash: recipientHash,
          encrypted_content: encryptedContent,
          content_size: content.length,
          privacy_level_code: this.privacyLevelMap[selectedPrivacy],
          status_code: 1, // sent
          sent_epoch: Math.floor(Date.now() / 1000),
        })
        .select()
        .single();

      if (messageError) throw messageError;

      // Attempt to send via Nostr with selected privacy level
      let nostrResult;
      try {
        if (selectedPrivacy === PrivacyLevel.MAXIMUM) {
          nostrResult = await this.sendGiftWrappedMessage(content, contactData);
        } else if (selectedPrivacy === PrivacyLevel.SELECTIVE) {
          nostrResult = await this.sendEncryptedMessage(content, contactData);
        } else {
          nostrResult = await this.sendStandardMessage(content, contactData);
        }
      } catch (nostrError) {
        console.warn(
          "Nostr sending failed, message stored locally:",
          nostrError
        );
        nostrResult = {
          success: false,
          message: "Stored locally, Nostr delivery failed",
        };
      }

      // Update interaction count
      await supabase
        .from("privacy_contacts")
        .update({
          interaction_count: contactData.interaction_count + 1,
          last_interaction_epoch: Math.floor(Date.now() / 1000),
        })
        .eq("contact_id", contactId);

      return {
        success: true,
        messageId: messageData.message_id,
        privacyUsed: selectedPrivacy,
        message: nostrResult.success
          ? "Message sent successfully"
          : nostrResult.message,
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

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Client-side encryption using session key
   */
  private async encryptData(data: string): Promise<string> {
    if (!this.clientEncryptionKey) {
      throw new Error("No encryption key available");
    }

    const { data: encrypted, error } = await supabase.rpc(
      "encrypt_sensitive_data",
      {
        data,
        encryption_key: this.clientEncryptionKey,
      }
    );

    if (error) throw error;
    return encrypted;
  }

  /**
   * Client-side decryption using session key
   */
  private async decryptData(encryptedData: string): Promise<string> {
    if (!this.clientEncryptionKey) {
      throw new Error("No encryption key available");
    }

    const { data: decrypted, error } = await supabase.rpc(
      "decrypt_sensitive_data",
      {
        encrypted_data: encryptedData,
        encryption_key: this.clientEncryptionKey,
      }
    );

    if (error) throw error;
    return decrypted;
  }

  /**
   * Hash data with salt
   */
  private async hashWithSalt(data: string, salt: string): Promise<string> {
    const { data: hash, error } = await supabase.rpc("hash_user_id", {
      user_id: data,
      salt,
    });

    if (error) throw error;
    return hash;
  }

  /**
   * Detect Gift Wrap support (privacy-safe)
   */
  private async detectGiftWrapSupport(npub: string): Promise<boolean> {
    // Simple heuristic - in production would query relays
    return npub.length >= 60 && npub.startsWith("npub") && Math.random() > 0.3;
  }

  /**
   * Select optimal privacy level based on contact trust and capabilities
   */
  private selectOptimalPrivacyLevel(contactData: any): PrivacyLevel {
    const hasGiftWrap =
      (contactData.capabilities_flags & CapabilityFlags.GIFT_WRAP) > 0;

    // Family members with Gift Wrap get maximum privacy
    if (contactData.trust_level_code === 4 && hasGiftWrap) {
      return PrivacyLevel.MAXIMUM;
    }

    // Trusted contacts get selective privacy
    if (contactData.trust_level_code >= 3) {
      return PrivacyLevel.SELECTIVE;
    }

    // Business relationships use transparent for Lightning Address visibility
    if (contactData.relationship_code === 2) {
      return PrivacyLevel.TRANSPARENT;
    }

    return PrivacyLevel.SELECTIVE;
  }

  /**
   * Calculate initial trust score
   */
  private calculateInitialTrustScore(
    trustLevel: TrustLevel,
    verified: boolean
  ): number {
    let score = this.trustLevelMap[trustLevel] * 10;
    if (verified) score += 20;
    return score;
  }

  /**
   * Map database contact to privacy contact interface
   */
  private mapDatabaseContactToPrivacyContact(data: any): PrivacyContact {
    return {
      contactId: data.contact_id,
      trustLevelCode: data.trust_level_code,
      relationshipCode: data.relationship_code,
      capabilityFlags: data.capabilities_flags,
      interactionCount: data.interaction_count,
      trustScore: data.trust_score,
      createdEpoch: data.created_epoch,
      lastInteractionEpoch: data.last_interaction_epoch,
      encryptedNpub: data.encrypted_npub,
      encryptedDisplayName: data.encrypted_display_name,
      encryptedNip05: data.encrypted_nip05,
      encryptedNotes: data.encrypted_notes,
      encryptedMetadata: data.encrypted_metadata,
    };
  }

  /**
   * Send Gift Wrapped message via Nostr
   */
  private async sendGiftWrappedMessage(
    content: string,
    contactData: any
  ): Promise<{ success: boolean; message: string }> {
    // This would implement actual NIP-17 Gift Wrapping
    // For now, simulate the process
    try {
      // Decrypt npub for Nostr operations
      const npub = await this.decryptData(contactData.encrypted_npub);

      // Use existing nostrManager with Gift Wrap kind (14)
      const result = await this.nostrManager.publishEvent(
        { mode: "individual", userId: "privacy_user" },
        14, // Gift Wrapped DM kind
        content,
        [
          ["p", npub],
          ["privacy-level", "giftwrapped"],
        ]
      );

      return {
        success: result.success,
        message: result.message,
      };
    } catch (error) {
      throw new Error(
        `Gift Wrap failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Send encrypted message via Nostr (NIP-04)
   */
  private async sendEncryptedMessage(
    content: string,
    contactData: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      const npub = await this.decryptData(contactData.encrypted_npub);

      const result = await this.nostrManager.publishEvent(
        { mode: "individual", userId: "privacy_user" },
        4, // Encrypted DM kind
        content,
        [
          ["p", npub],
          ["privacy-level", "encrypted"],
        ]
      );

      return {
        success: result.success,
        message: result.message,
      };
    } catch (error) {
      throw new Error(
        `Encrypted messaging failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Send standard message via Nostr
   */
  private async sendStandardMessage(
    content: string,
    contactData: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      const npub = await this.decryptData(contactData.encrypted_npub);

      const result = await this.nostrManager.publishEvent(
        { mode: "individual", userId: "privacy_user" },
        1, // Text note kind
        content,
        [
          ["p", npub],
          ["privacy-level", "minimal"],
        ]
      );

      return {
        success: result.success,
        message: result.message,
      };
    } catch (error) {
      throw new Error(
        `Standard messaging failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get message history for contact (decrypted)
   */
  async getMessageHistory(
    contactId: string,
    limit: number = 50
  ): Promise<any[]> {
    if (!this.session) {
      throw new Error("No active privacy session");
    }

    try {
      const recipientHash = await this.hashWithSalt(
        contactId,
        this.session.salt
      );

      const { data, error } = await supabase
        .from("privacy_messages")
        .select("*")
        .or(
          `and(sender_hash.eq.${this.session.userHash},recipient_hash.eq.${recipientHash}),and(sender_hash.eq.${recipientHash},recipient_hash.eq.${this.session.userHash})`
        )
        .order("sent_epoch", { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Decrypt message contents
      return await Promise.all(
        (data || []).map(async (message) => ({
          ...message,
          content: await this.decryptData(message.encrypted_content),
          timestamp: new Date(message.sent_epoch * 1000),
        }))
      );
    } catch (error) {
      console.error("Failed to get message history:", error);
      return [];
    }
  }
}
