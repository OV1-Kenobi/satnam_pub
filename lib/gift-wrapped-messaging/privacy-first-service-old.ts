/**
 * Privacy-First Gift-Wrapped Communications Service
 *
 * This service provides secure messaging with privacy-first architecture:
 * - Uses encrypted UUIDs instead of storing npub/identifiers directly
 * - Implements session-based authentication and operations
 * - Includes comprehensive encryption and security measures
 * - Compatible with existing OTP storage security protocols
 * - Browser-compatible: uses Web Crypto API, no Node.js dependencies
 */

import {
  NostrEvent as Event,
  getPublicKey,
  nip04,
  nip59,
  SimplePool,
} from "../../src/lib/nostr-browser";
import { supabase } from "../../src/lib/supabase";
import { generateRandomHex, sha256, encryptData, decryptData } from "../../utils/crypto-factory";
import { PrivacyUtils as BrowserPrivacyUtils } from "../../src/lib/privacy/encryption";

/**
 * Security Configuration
 */
export const MESSAGING_CONFIG = {
  SESSION_TTL_HOURS: 24,
  CONTACT_CACHE_TTL_HOURS: 12,
  MESSAGE_BATCH_SIZE: 50,
  RATE_LIMITS: {
    SEND_MESSAGE_PER_HOUR: 100,
    ADD_CONTACT_PER_HOUR: 20,
    CREATE_GROUP_PER_DAY: 5,
    GROUP_INVITE_PER_HOUR: 50,
  },
  // NIP-05 Identity Disclosure Settings
  IDENTITY_DISCLOSURE: {
    DEFAULT_PRIVATE: true, // Private messaging is the default
    REQUIRE_EXPLICIT_CONSENT: true, // Users must explicitly choose to reveal identity
    PRIVACY_WARNING_REQUIRED: true, // Show privacy consequences before enabling
  },
} as const;

/**
 * NIP-05 Identity Disclosure Preferences
 */
export interface IdentityDisclosurePreferences {
  sessionId: string; // Session-based preference identifier
  userHash: string; // Hashed user identifier
  allowNip05InDirectMessages: boolean; // Allow NIP-05 in DMs (default: false)
  allowNip05InGroupMessages: boolean; // Allow NIP-05 in groups (default: false)
  allowNip05InSpecificGroups: string[]; // Specific group session IDs where NIP-05 is allowed
  encryptedNip05?: string; // Encrypted NIP-05 (only stored if user consents)
  consentTimestamp: Date; // When user gave consent
  consentIpAddress?: string; // Privacy audit trail
  privacyWarningAcknowledged: boolean; // User acknowledged privacy risks
  lastUpdated: Date;
}

/**
 * Privacy Warning Response
 */
export interface PrivacyConsentResponse {
  consentGiven: boolean;
  warningAcknowledged: boolean;
  selectedScope: "direct" | "groups" | "specific-groups" | "none";
  specificGroupIds?: string[]; // If specific-groups selected
  timestamp: Date;
}

export interface PrivacyContact {
  sessionId: string; // Encrypted session-based identifier
  encryptedNpub: string; // Encrypted npub
  nip05Hash?: string; // Hashed nip05 for privacy-safe lookup
  displayNameHash: string; // Hashed display name
  familyRole?: "adult" | "child" | "guardian" | "advisor" | "friend";
  trustLevel: "family" | "trusted" | "known" | "unverified";
  supportsGiftWrap: boolean;
  preferredEncryption: "gift-wrap" | "nip04" | "auto";
  lastSeenHash?: string; // Privacy-safe timestamp hash
  tagsHash: string[]; // Hashed tags for privacy
  addedAt: Date;
  addedByHash: string; // Hashed identifier of who added
}

export interface PrivacyGroup {
  sessionId: string; // Encrypted session-based group identifier
  nameHash: string; // Hashed group name
  descriptionHash: string; // Hashed description
  groupType: "family" | "business" | "friends" | "advisors";
  memberCount: number; // Only store count, not actual members
  adminHashes: string[]; // Hashed admin identifiers
  encryptionType: "gift-wrap" | "nip04";
  createdAt: Date;
  createdByHash: string; // Hashed creator identifier
  lastActivityHash?: string; // Privacy-safe activity timestamp
}

export interface PrivacyGroupMember {
  memberHash: string; // Hashed member identifier
  displayNameHash: string; // Hashed display name
  role: "admin" | "member" | "viewer";
  joinedAt: Date;
  invitedByHash: string; // Hashed inviter identifier
}

export interface PrivacyGroupMessage {
  messageSessionId: string; // Encrypted message session ID
  groupSessionId: string; // Encrypted group session ID
  senderHash: string; // Hashed sender identifier
  encryptedContent: string; // Fully encrypted content
  messageType: "text" | "announcement" | "poll" | "file" | "payment-request";
  metadataHash?: string; // Hashed metadata
  timestamp: Date;
  editedHash?: string; // Privacy-safe edit indicator
  replyToHash?: string; // Hashed reply reference
}

export interface MessagingSession {
  sessionId: string;
  userHash: string;
  encryptedNsec: string; // Encrypted with session key
  sessionKey: string; // For encrypting sensitive data
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  identityPreferences?: IdentityDisclosurePreferences; // NIP-05 disclosure preferences
}

/**
 * Privacy-preserving identifier utilities
 */
class PrivacyUtils {
  /**
   * Generate a privacy-preserving identifier hash
   */
  static async hashIdentifier(
    identifier: string,
    salt?: string
  ): Promise<string> {
    const actualSalt = salt || (await generateRandomHex(32));
    return await sha256(identifier + actualSalt);
  }

  /**
   * Generate encrypted UUID for session management
   */
  static async generateEncryptedUUID(): Promise<string> {
    const uuid = crypto.randomUUID();
    const timestamp = Date.now().toString();
    const randomBytes = await generateRandomHex(32);

    const combinedData = `${uuid}-${timestamp}-${randomBytes}`;
    return await sha256(combinedData);
  }

  /**
   * Generate session key for encrypting sensitive data
   */
  static async generateSessionKey(): Promise<string> {
    return await generateRandomHex(64); // 32 bytes = 64 hex chars
  }

  /**
   * Encrypt sensitive data with session key
   */
  static async encryptWithSessionKey(
    data: string,
    sessionKey: string
  ): Promise<string> {
    return await encryptData(data, sessionKey);
  }

  /**
   * Decrypt sensitive data with session key
   */
  static async decryptWithSessionKey(
    encryptedData: string,
    sessionKey: string
  ): Promise<string> {
    return await decryptData(encryptedData, sessionKey);
  }

  /**
   * Create privacy-safe timestamp hash
   */
  static async hashTimestamp(timestamp: Date): Promise<string> {
    // Hash only the hour to preserve privacy while allowing some analytics
    const hourlyTimestamp = new Date(timestamp);
    hourlyTimestamp.setMinutes(0, 0, 0);
    return await this.hashIdentifier(hourlyTimestamp.toISOString());
  }
}

export class SatnamPrivacyFirstCommunications {
  private pool: SimplePool;
  private userSession: MessagingSession | null = null;
  private contactSessions: Map<string, PrivacyContact> = new Map();
  private groupSessions: Map<string, PrivacyGroup> = new Map();
  private messageListeners: Map<string, (message: any) => void> = new Map();

  constructor() {
    this.pool = new SimplePool();
  }

  /**
   * Initialize secure session with privacy-first approach
   */
  async initializeSession(
    nsec: string,
    options?: {
      ipAddress?: string;
      userAgent?: string;
      ttlHours?: number;
    }
  ): Promise<string> {
    try {
      // Generate session identifiers
      const sessionId = await PrivacyUtils.generateEncryptedUUID();
      const userHash = await PrivacyUtils.hashIdentifier(nsec);
      const sessionKey = await PrivacyUtils.generateSessionKey();

      // Encrypt nsec with session key for temporary storage
      const encryptedNsec = await PrivacyUtils.encryptWithSessionKey(nsec, sessionKey);

      // Calculate expiration
      const ttlHours = options?.ttlHours || MESSAGING_CONFIG.SESSION_TTL_HOURS;
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

      // Create session
      this.userSession = {
        sessionId,
        userHash,
        encryptedNsec,
        sessionKey,
        expiresAt,
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent,
      };

      // Store session in database with privacy-first approach
      await this.storeSessionInDatabase(this.userSession);

      return sessionId;
    } catch (error) {
      console.error("Failed to initialize session:", error);
      throw new Error("Session initialization failed");
    }
  }

  /**
   * Store session in database with privacy-first encryption
   */
  private async storeSessionInDatabase(session: MessagingSession): Promise<void> {
    try {
      const { error } = await supabase
        .from("messaging_sessions")
        .upsert({
          session_id: session.sessionId,
          user_hash: session.userHash,
          encrypted_nsec: session.encryptedNsec,
          session_key_hash: await PrivacyUtils.hashIdentifier(session.sessionKey),
          expires_at: session.expiresAt.toISOString(),
          ip_address: session.ipAddress,
          user_agent: session.userAgent,
          created_at: new Date().toISOString(),
        });

      if (error) {
        console.error("Failed to store session:", error);
        throw new Error("Session storage failed");
      }
    } catch (error) {
      console.error("Database error:", error);
      throw new Error("Session storage failed");
    }
  }

  /**
   * Validate session and return user info
   */
  async validateSession(sessionId: string): Promise<boolean> {
    try {
      if (!this.userSession || this.userSession.sessionId !== sessionId) {
        return false;
      }

      // Check expiration
      if (new Date() > this.userSession.expiresAt) {
        await this.destroySession();
        return false;
      }

      return true;
    } catch (error) {
      console.error("Session validation failed:", error);
      return false;
    }
  }

  /**
   * Destroy current session and clear sensitive data
   */
  async destroySession(): Promise<void> {
    try {
      if (this.userSession) {
        // Remove from database
        const { error } = await supabase
          .from("messaging_sessions")
          .delete()
          .eq("session_id", this.userSession.sessionId);

        if (error) {
          console.error("Failed to remove session from database:", error);
        }

        // Clear sensitive data from memory
        this.userSession = null;
        this.contactSessions.clear();
        this.groupSessions.clear();
        this.messageListeners.clear();
      }
    } catch (error) {
      console.error("Session destruction failed:", error);
    }
  }

  /**
   * Show privacy warning and get user consent for NIP-05 disclosure
   */
  async showPrivacyWarningAndGetConsent(
    scope: "direct" | "groups" | "specific-groups",
    specificGroupIds?: string[]
  ): Promise<PrivacyConsentResponse> {
    const warningContent = this.getPrivacyWarningContent(scope, specificGroupIds);

    // In a real implementation, this would show a modal to the user
    // For now, we'll return a default response
    const response: PrivacyConsentResponse = {
      consentGiven: false, // Default to privacy-first
      warningAcknowledged: true,
      selectedScope: "none",
      timestamp: new Date(),
    };

    return response;
  }

  /**
   * Update identity disclosure preferences based on user consent
   */
  async updateIdentityDisclosurePreferences(
    consentResponse: PrivacyConsentResponse,
    nip05?: string
  ): Promise<boolean> {
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      let encryptedNip05: string | undefined;
      if (consentResponse.consentGiven && nip05) {
        encryptedNip05 = await PrivacyUtils.encryptWithSessionKey(
          nip05,
          this.userSession.sessionKey
        );
      }

      const preferences: IdentityDisclosurePreferences = {
        sessionId: await PrivacyUtils.generateEncryptedUUID(),
        userHash: this.userSession.userHash,
        allowNip05InDirectMessages: consentResponse.selectedScope === "direct",
        allowNip05InGroupMessages: consentResponse.selectedScope === "groups",
        allowNip05InSpecificGroups: consentResponse.specificGroupIds || [],
        encryptedNip05,
        consentTimestamp: consentResponse.timestamp,
        privacyWarningAcknowledged: consentResponse.warningAcknowledged,
        lastUpdated: new Date(),
      };

      this.userSession.identityPreferences = preferences;

      // Store preferences in database
      await this.storeIdentityPreferences(preferences);

      return true;
    } catch (error) {
      console.error("Failed to update identity preferences:", error);
      return false;
    }
  }

  /**
   * Store identity preferences in database
   */
  private async storeIdentityPreferences(
    preferences: IdentityDisclosurePreferences
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from("identity_disclosure_preferences")
        .upsert({
          session_id: preferences.sessionId,
          user_hash: preferences.userHash,
          allow_nip05_dm: preferences.allowNip05InDirectMessages,
          allow_nip05_group: preferences.allowNip05InGroupMessages,
          specific_groups: preferences.allowNip05InSpecificGroups,
          encrypted_nip05: preferences.encryptedNip05,
          consent_timestamp: preferences.consentTimestamp.toISOString(),
          privacy_warning_acknowledged: preferences.privacyWarningAcknowledged,
          last_updated: preferences.lastUpdated.toISOString(),
        });

      if (error) {
        console.error("Failed to store identity preferences:", error);
        throw new Error("Identity preferences storage failed");
      }
    } catch (error) {
      console.error("Database error:", error);
      throw new Error("Identity preferences storage failed");
    }
  }

  /**
   * Get current identity disclosure preferences
   */
  async getIdentityDisclosurePreferences(): Promise<IdentityDisclosurePreferences | null> {
    try {
      if (!this.userSession) {
        return null;
      }

      return this.userSession.identityPreferences || null;
    } catch (error) {
      console.error("Failed to get identity preferences:", error);
      return null;
    }
  }

  /**
   * Check if NIP-05 disclosure is allowed in current context
   */
  private async isNip05DisclosureAllowed(
    context: "direct" | "group",
    groupSessionId?: string
  ): Promise<boolean> {
    try {
      const preferences = await this.getIdentityDisclosurePreferences();
      if (!preferences) {
        return false; // Default to privacy-first
      }

      if (context === "direct") {
        return preferences.allowNip05InDirectMessages;
      } else if (context === "group") {
        if (preferences.allowNip05InGroupMessages) {
          return true;
        }
        if (groupSessionId && preferences.allowNip05InSpecificGroups.includes(groupSessionId)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("Failed to check NIP-05 disclosure permission:", error);
      return false; // Default to privacy-first
    }
  }

  /**
   * Get decrypted NIP-05 if disclosure is allowed
   */
  private async getDecryptedNip05(): Promise<string | null> {
    try {
      if (!this.userSession?.identityPreferences?.encryptedNip05) {
        return null;
      }

      return await PrivacyUtils.decryptWithSessionKey(
        this.userSession.identityPreferences.encryptedNip05,
        this.userSession.sessionKey
      );
    } catch (error) {
      console.error("Failed to decrypt NIP-05:", error);
      return null;
    }
  }

  /**
   * Disable identity disclosure and clear stored NIP-05
   */
  async disableIdentityDisclosure(): Promise<boolean> {
    try {
      if (!this.userSession) {
        return false;
      }

      const preferences = await this.getIdentityDisclosurePreferences();
      if (preferences) {
        preferences.allowNip05InDirectMessages = false;
        preferences.allowNip05InGroupMessages = false;
        preferences.allowNip05InSpecificGroups = [];
        preferences.encryptedNip05 = undefined;
        preferences.lastUpdated = new Date();

        await this.storeIdentityPreferences(preferences);
      }

      return true;
    } catch (error) {
      console.error("Failed to disable identity disclosure:", error);
      return false;
    }
  }

  /**
   * Get privacy warning content for user consent
   */
  getPrivacyWarningContent(
    scope: "direct" | "groups" | "specific-groups",
    specificGroupIds?: string[]
  ): {
    title: string;
    message: string;
    consequences: string[];
    recommendations: string[];
    scopeDescription: string;
  } {
    const scopeDescription = scope === "direct" 
      ? "direct messages only" 
      : scope === "groups" 
      ? "all group messages" 
      : `specific groups (${specificGroupIds?.length || 0} groups)`;

    return {
      title: "Privacy Warning: Identity Disclosure",
      message: `You are about to enable NIP-05 identifier disclosure in ${scopeDescription}. This will make your identity visible to message recipients.`,
      consequences: [
        "Your NIP-05 identifier will be visible to message recipients",
        "This may reduce your privacy and anonymity",
        "Recipients could potentially link your messages across different contexts",
        "This action is logged for security and audit purposes",
      ],
      recommendations: [
        "Only enable this for trusted contacts and groups",
        "Consider using different NIP-05 identifiers for different contexts",
        "Regularly review and update your disclosure preferences",
        "Disable disclosure when no longer needed",
      ],
      scopeDescription,
    };
  }

  /**
   * Get current identity disclosure status
   */
  async getIdentityDisclosureStatus(): Promise<{
    hasNip05: boolean;
    isDisclosureEnabled: boolean;
    directMessagesEnabled: boolean;
    groupMessagesEnabled: boolean;
    specificGroupsCount: number;
    lastUpdated?: Date;
  }> {
    try {
      const preferences = await this.getIdentityDisclosurePreferences();
      
      return {
        hasNip05: !!preferences?.encryptedNip05,
        isDisclosureEnabled: !!(preferences?.allowNip05InDirectMessages || preferences?.allowNip05InGroupMessages || preferences?.allowNip05InSpecificGroups.length),
        directMessagesEnabled: preferences?.allowNip05InDirectMessages || false,
        groupMessagesEnabled: preferences?.allowNip05InGroupMessages || false,
        specificGroupsCount: preferences?.allowNip05InSpecificGroups.length || 0,
        lastUpdated: preferences?.lastUpdated,
      };
    } catch (error) {
      console.error("Failed to get identity disclosure status:", error);
      return {
        hasNip05: false,
        isDisclosureEnabled: false,
        directMessagesEnabled: false,
        groupMessagesEnabled: false,
        specificGroupsCount: 0,
      };
    }
  }

  /**
   * Enable NIP-05 disclosure workflow with privacy warnings
   */
  async enableNip05DisclosureWorkflow(
    nip05: string,
    scope: "direct" | "groups" | "specific-groups",
    specificGroupIds?: string[]
  ): Promise<{
    success: boolean;
    requiresUserConfirmation: boolean;
    warningContent?: any;
    error?: string;
  }> {
    try {
      // Always show privacy warning first
      const warningContent = this.getPrivacyWarningContent(scope, specificGroupIds);

      return {
        success: true,
        requiresUserConfirmation: true,
        warningContent,
      };
    } catch (error) {
      console.error("Failed to start NIP-05 disclosure workflow:", error);
      return {
        success: false,
        requiresUserConfirmation: false,
        error: "Failed to start disclosure workflow",
      };
    }
  }

  /**
   * PRIVACY-FIRST CONTACTS MANAGEMENT
   */
  async addContact(contactData: {
    npub: string;
    nip05?: string;
    displayName: string;
    familyRole?: "adult" | "child" | "guardian" | "advisor" | "friend";
    trustLevel: "family" | "trusted" | "known" | "unverified";
    preferredEncryption: "gift-wrap" | "nip04" | "auto";
    notes?: string;
    tags: string[];
  }): Promise<string> {
    if (!this.userSession) {
      throw new Error("No active session. Please initialize session first.");
    }

    // Check rate limit
    const rateLimitKey = `add_contact:${this.userSession.userHash}`;
    const rateLimit = await this.checkRateLimit(
      rateLimitKey,
      MESSAGING_CONFIG.RATE_LIMITS.ADD_CONTACT_PER_HOUR,
      60
    );

    if (!rateLimit.allowed) {
      throw new Error("Rate limit exceeded for adding contacts");
    }

    const contactSessionId = PrivacyUtils.generateEncryptedUUID();
    const encryptedNpub = PrivacyUtils.encryptWithSessionKey(
      contactData.npub,
      this.userSession.sessionKey
    );

    const privacyContact: PrivacyContact = {
      sessionId: await contactSessionId,
      encryptedNpub: await encryptedNpub,
      nip05Hash: contactData.nip05
        ? await PrivacyUtils.hashIdentifier(contactData.nip05)
        : undefined,
      displayNameHash: await PrivacyUtils.hashIdentifier(contactData.displayName),
      familyRole: contactData.familyRole,
      trustLevel: contactData.trustLevel,
      supportsGiftWrap: await this.detectGiftWrapSupport(contactData.npub),
      preferredEncryption: contactData.preferredEncryption,
      tagsHash: await Promise.all(contactData.tags.map((tag) => PrivacyUtils.hashIdentifier(tag))),
      addedAt: new Date(),
      addedByHash: this.userSession.userHash,
    };

    // Store encrypted contact
    try {
      const { error } = await supabase.from("encrypted_contacts").insert({
        id: contactSessionId,
        owner_hash: this.userSession.userHash,
        encrypted_npub: encryptedNpub,
        nip05_hash: privacyContact.nip05Hash,
        display_name_hash: privacyContact.displayNameHash,
        family_role: privacyContact.familyRole,
        trust_level: privacyContact.trustLevel,
        supports_gift_wrap: privacyContact.supportsGiftWrap,
        preferred_encryption: privacyContact.preferredEncryption,
        tags_hash: privacyContact.tagsHash,
        added_at: privacyContact.addedAt.toISOString(),
        added_by_hash: privacyContact.addedByHash,
        metadata: {
          notes_hash: contactData.notes
            ? PrivacyUtils.hashIdentifier(contactData.notes)
            : null,
        },
      });

      if (error) {
        console.error("Failed to store encrypted contact:", error);
        throw new Error("Failed to add contact");
      }

      // Cache contact in session
      this.contactSessions.set(await contactSessionId, privacyContact);

      // Log security event
      await this.logSecurityEvent("contact_added", {
        contactSessionId,
        ownerHash: this.userSession.userHash,
        trustLevel: privacyContact.trustLevel,
      });

      return contactSessionId;
    } catch (error) {
      console.error("Add contact error:", error);
      throw new Error("Failed to add contact securely");
    }
  }

  /**
   * Update contact with privacy preservation
   */
  async updateContact(
    contactSessionId: string,
    updates: Partial<
      Omit<PrivacyContact, "sessionId" | "addedAt" | "addedByHash">
    >
  ): Promise<boolean> {
    if (!this.userSession) {
      throw new Error("No active session");
    }

    const existingContact = this.contactSessions.get(contactSessionId);
    if (!existingContact) {
      return false;
    }

    const updatedContact = { ...existingContact, ...updates };

    try {
      const { error } = await supabase
        .from("encrypted_contacts")
        .update({
          nip05_hash: updatedContact.nip05Hash,
          display_name_hash: updatedContact.displayNameHash,
          family_role: updatedContact.familyRole,
          trust_level: updatedContact.trustLevel,
          supports_gift_wrap: updatedContact.supportsGiftWrap,
          preferred_encryption: updatedContact.preferredEncryption,
          tags_hash: updatedContact.tagsHash,
          last_seen_hash: updatedContact.lastSeenHash,
        })
        .eq("id", contactSessionId)
        .eq("owner_hash", this.userSession.userHash);

      if (error) {
        console.error("Failed to update contact:", error);
        return false;
      }

      // Update cached contact
      this.contactSessions.set(contactSessionId, updatedContact);

      // Log security event
      await this.logSecurityEvent("contact_updated", {
        contactSessionId,
        ownerHash: this.userSession.userHash,
      });

      return true;
    } catch (error) {
      console.error("Update contact error:", error);
      return false;
    }
  }

  /**
   * Delete contact securely
   */
  async deleteContact(contactSessionId: string): Promise<boolean> {
    if (!this.userSession) {
      throw new Error("No active session");
    }

    try {
      const { error } = await supabase
        .from("encrypted_contacts")
        .delete()
        .eq("id", contactSessionId)
        .eq("owner_hash", this.userSession.userHash);

      if (error) {
        console.error("Failed to delete contact:", error);
        return false;
      }

      // Remove from cache
      this.contactSessions.delete(contactSessionId);

      // Log security event
      await this.logSecurityEvent("contact_deleted", {
        contactSessionId,
        ownerHash: this.userSession.userHash,
      });

      return true;
    } catch (error) {
      console.error("Delete contact error:", error);
      return false;
    }
  }

  /**
   * Get contacts (returns session IDs only for privacy)
   */
  getContactSessions(): string[] {
    return Array.from(this.contactSessions.keys());
  }

  /**
   * Get contact by session ID (decrypts for current session only)
   */
  async getContactBySession(contactSessionId: string): Promise<{
    sessionId: string;
    displayName: string;
    familyRole?: string;
    trustLevel: string;
    supportsGiftWrap: boolean;
  } | null> {
    if (!this.userSession) {
      throw new Error("No active session");
    }

    const contact = this.contactSessions.get(contactSessionId);
    if (!contact) {
      return null;
    }

    // For security, we don't decrypt the npub or other sensitive data
    // Only return minimal necessary information
    return {
      sessionId: contact.sessionId,
      displayName: "Contact", // Placeholder - would need secure decryption
      familyRole: contact.familyRole,
      trustLevel: contact.trustLevel,
      supportsGiftWrap: contact.supportsGiftWrap,
    };
  }

  /**
   * PRIVACY-FIRST GROUP MANAGEMENT
   */
  async createPrivateGroup(groupData: {
    name: string;
    description: string;
    groupType: "family" | "business" | "friends" | "advisors";
    encryptionType: "gift-wrap" | "nip04";
    initialMemberSessionIds?: string[]; // Contact session IDs to invite
  }): Promise<string> {
    if (!this.userSession) {
      throw new Error("No active session. Please initialize session first.");
    }

    // Check rate limit
    const rateLimitKey = `create_group:${this.userSession.userHash}`;
    const rateLimit = await this.checkRateLimit(
      rateLimitKey,
      MESSAGING_CONFIG.RATE_LIMITS.CREATE_GROUP_PER_DAY,
      24 * 60 // 24 hours in minutes
    );

    if (!rateLimit.allowed) {
      throw new Error("Rate limit exceeded for creating groups");
    }

    const groupSessionId = PrivacyUtils.generateEncryptedUUID();
    const nameHash = PrivacyUtils.hashIdentifier(groupData.name);
    const descriptionHash = PrivacyUtils.hashIdentifier(groupData.description);

    const privacyGroup: PrivacyGroup = {
      sessionId: await groupSessionId,
      nameHash: await nameHash,
      descriptionHash: await descriptionHash,
      groupType: groupData.groupType,
      memberCount: 1, // Creator is the first member
      adminHashes: [this.userSession.userHash],
      encryptionType: groupData.encryptionType,
      createdAt: new Date(),
      createdByHash: this.userSession.userHash,
    };

    // Store encrypted group
    try {
      const { error } = await supabase.from("encrypted_groups").insert({
        id: groupSessionId,
        name_hash: nameHash,
        description_hash: descriptionHash,
        group_type: groupData.groupType,
        member_count: privacyGroup.memberCount,
        admin_hashes: privacyGroup.adminHashes,
        encryption_type: groupData.encryptionType,
        created_at: privacyGroup.createdAt.toISOString(),
        created_by_hash: privacyGroup.createdByHash,
        metadata: {
          encrypted_name: PrivacyUtils.encryptWithSessionKey(
            groupData.name,
            this.userSession.sessionKey
          ),
          encrypted_description: PrivacyUtils.encryptWithSessionKey(
            groupData.description,
            this.userSession.sessionKey
          ),
        },
      });

      if (error) {
        console.error("Failed to store encrypted group:", error);
        throw new Error("Failed to create group");
      }

      // Add creator as first member
      await this.addGroupMemberRecord(
        groupSessionId,
        this.userSession.userHash,
        "admin"
      );

      // Cache group in session
      this.groupSessions.set(groupSessionId, privacyGroup);

      // Send invitations to initial members if provided
      if (groupData.initialMemberSessionIds?.length) {
        await this.sendGroupInvitations(
          groupSessionId,
          groupData.initialMemberSessionIds
        );
      }

      // Log security event
      await this.logSecurityEvent("group_created", {
        groupSessionId,
        createdByHash: this.userSession.userHash,
        groupType: groupData.groupType,
        encryptionType: groupData.encryptionType,
        memberCount: privacyGroup.memberCount,
      });

      return groupSessionId;
    } catch (error) {
      console.error("Create group error:", error);
      throw new Error("Failed to create group securely");
    }
  }

  /**
   * Add member to group with privacy preservation
   */
  async addGroupMember(
    groupSessionId: string,
    contactSessionId: string,
    role: "admin" | "member" | "viewer" = "member"
  ): Promise<boolean> {
    if (!this.userSession) {
      throw new Error("No active session");
    }

    // Check if group exists and user is admin
    const group = this.groupSessions.get(groupSessionId);
    if (!group) {
      throw new Error("Group not found");
    }

    if (!group.adminHashes.includes(this.userSession.userHash)) {
      throw new Error("Only group admins can add members");
    }

    // Check if contact exists
    const contact = this.contactSessions.get(contactSessionId);
    if (!contact) {
      throw new Error("Contact not found");
    }

    // Check rate limit
    const rateLimitKey = `group_invite:${this.userSession.userHash}`;
    const rateLimit = await this.checkRateLimit(
      rateLimitKey,
      MESSAGING_CONFIG.RATE_LIMITS.GROUP_INVITE_PER_HOUR,
      60
    );

    if (!rateLimit.allowed) {
      throw new Error("Rate limit exceeded for group invitations");
    }

    try {
      // Get the actual npub for invitation (decrypt from contact)
      const memberNpub = PrivacyUtils.decryptWithSessionKey(
        contact.encryptedNpub,
        this.userSession.sessionKey
      );
      const memberHash = PrivacyUtils.hashIdentifier(memberNpub);

      // Check if member already exists
      const { data: existingMember, error: checkError } = await supabase
        .from("encrypted_group_members")
        .select("id")
        .eq("group_session_id", groupSessionId)
        .eq("member_hash", memberHash)
        .single();

      if (existingMember) {
        throw new Error("Member already exists in group");
      }

      // Add member record
      const success = await this.addGroupMemberRecord(
        groupSessionId,
        memberHash,
        role
      );
      if (!success) {
        throw new Error("Failed to add member record");
      }

      // Update group member count
      group.memberCount += 1;
      await supabase
        .from("encrypted_groups")
        .update({
          member_count: group.memberCount,
          last_activity_hash: PrivacyUtils.hashTimestamp(new Date()),
        })
        .eq("id", groupSessionId);

      // Update cached group
      group.lastActivityHash = PrivacyUtils.hashTimestamp(new Date());
      this.groupSessions.set(groupSessionId, group);

      // Send encrypted invitation
      await this.sendGroupInvitation(groupSessionId, memberNpub, role);

      // Log security event
      await this.logSecurityEvent("group_member_added", {
        groupSessionId,
        memberHash,
        role,
        invitedByHash: this.userSession.userHash,
      });

      return true;
    } catch (error) {
      console.error("Add group member error:", error);
      throw error;
    }
  }

  /**
   * Remove member from group
   */
  async removeGroupMember(
    groupSessionId: string,
    memberHash: string
  ): Promise<boolean> {
    if (!this.userSession) {
      throw new Error("No active session");
    }

    const group = this.groupSessions.get(groupSessionId);
    if (!group) {
      throw new Error("Group not found");
    }

    if (!group.adminHashes.includes(this.userSession.userHash)) {
      throw new Error("Only group admins can remove members");
    }

    try {
      const { error } = await supabase
        .from("encrypted_group_members")
        .delete()
        .eq("group_session_id", groupSessionId)
        .eq("member_hash", memberHash);

      if (error) {
        console.error("Failed to remove group member:", error);
        return false;
      }

      // Update group member count
      group.memberCount = Math.max(1, group.memberCount - 1); // Keep at least creator
      await supabase
        .from("encrypted_groups")
        .update({
          member_count: group.memberCount,
          last_activity_hash: PrivacyUtils.hashTimestamp(new Date()),
        })
        .eq("id", groupSessionId);

      // Update cached group
      group.lastActivityHash = PrivacyUtils.hashTimestamp(new Date());
      this.groupSessions.set(groupSessionId, group);

      // Log security event
      await this.logSecurityEvent("group_member_removed", {
        groupSessionId,
        memberHash,
        removedByHash: this.userSession.userHash,
      });

      return true;
    } catch (error) {
      console.error("Remove group member error:", error);
      return false;
    }
  }

  /**
   * Update group with privacy preservation
   */
  async updateGroup(
    groupSessionId: string,
    updates: {
      name?: string;
      description?: string;
      groupType?: "family" | "business" | "friends" | "advisors";
    }
  ): Promise<boolean> {
    if (!this.userSession) {
      throw new Error("No active session");
    }

    const group = this.groupSessions.get(groupSessionId);
    if (!group) {
      throw new Error("Group not found");
    }

    if (!group.adminHashes.includes(this.userSession.userHash)) {
      throw new Error("Only group admins can update group");
    }

    try {
      const updateData: any = {
        last_activity_hash: PrivacyUtils.hashTimestamp(new Date()),
        metadata: {},
      };

      if (updates.name) {
        updateData.name_hash = PrivacyUtils.hashIdentifier(updates.name);
        updateData.metadata.encrypted_name = PrivacyUtils.encryptWithSessionKey(
          updates.name,
          this.userSession.sessionKey
        );
        group.nameHash = updateData.name_hash;
      }

      if (updates.description) {
        updateData.description_hash = PrivacyUtils.hashIdentifier(
          updates.description
        );
        updateData.metadata.encrypted_description =
          PrivacyUtils.encryptWithSessionKey(
            updates.description,
            this.userSession.sessionKey
          );
        group.descriptionHash = updateData.description_hash;
      }

      if (updates.groupType) {
        updateData.group_type = updates.groupType;
        group.groupType = updates.groupType;
      }

      const { error } = await supabase
        .from("encrypted_groups")
        .update(updateData)
        .eq("id", groupSessionId);

      if (error) {
        console.error("Failed to update group:", error);
        return false;
      }

      // Update cached group
      group.lastActivityHash = updateData.last_activity_hash;
      this.groupSessions.set(groupSessionId, group);

      // Log security event
      await this.logSecurityEvent("group_updated", {
        groupSessionId,
        updatedByHash: this.userSession.userHash,
      });

      return true;
    } catch (error) {
      console.error("Update group error:", error);
      return false;
    }
  }

  /**
   * Delete group securely
   */
  async deleteGroup(groupSessionId: string): Promise<boolean> {
    if (!this.userSession) {
      throw new Error("No active session");
    }

    const group = this.groupSessions.get(groupSessionId);
    if (!group) {
      throw new Error("Group not found");
    }

    if (!group.adminHashes.includes(this.userSession.userHash)) {
      throw new Error("Only group admins can delete group");
    }

    try {
      // Delete all group members first
      await supabase
        .from("encrypted_group_members")
        .delete()
        .eq("group_session_id", groupSessionId);

      // Delete all group messages
      await supabase
        .from("encrypted_group_messages")
        .delete()
        .eq("group_session_id", groupSessionId);

      // Delete the group
      const { error } = await supabase
        .from("encrypted_groups")
        .delete()
        .eq("id", groupSessionId);

      if (error) {
        console.error("Failed to delete group:", error);
        return false;
      }

      // Remove from cache
      this.groupSessions.delete(groupSessionId);

      // Log security event
      await this.logSecurityEvent("group_deleted", {
        groupSessionId,
        deletedByHash: this.userSession.userHash,
      });

      return true;
    } catch (error) {
      console.error("Delete group error:", error);
      return false;
    }
  }

  /**
   * Get user's groups (returns session IDs only for privacy)
   */
  getGroupSessions(): string[] {
    return Array.from(this.groupSessions.keys());
  }

  /**
   * Get group by session ID (returns minimal info for privacy)
   */
  getGroupBySession(groupSessionId: string): {
    sessionId: string;
    groupType: string;
    memberCount: number;
    encryptionType: string;
    isAdmin: boolean;
  } | null {
    if (!this.userSession) {
      throw new Error("No active session");
    }

    const group = this.groupSessions.get(groupSessionId);
    if (!group) {
      return null;
    }

    return {
      sessionId: group.sessionId,
      groupType: group.groupType,
      memberCount: group.memberCount,
      encryptionType: group.encryptionType,
      isAdmin: group.adminHashes.includes(this.userSession.userHash),
    };
  }

  /**
   * PRIVACY-FIRST GROUP MESSAGING
   */
  async sendGroupMessage(
    groupSessionId: string,
    content: string,
    messageType:
      | "text"
      | "announcement"
      | "poll"
      | "file"
      | "payment-request" = "text",
    metadata?: Record<string, any>
  ): Promise<string> {
    if (!this.userSession) {
      throw new Error("No active session. Please initialize session first.");
    }

    // Validate group exists and user is member
    const group = this.groupSessions.get(groupSessionId);
    if (!group) {
      throw new Error("Group not found");
    }

    // Check if user is member of the group
    const isMember = await this.isGroupMember(
      groupSessionId,
      this.userSession.userHash
    );
    if (!isMember) {
      throw new Error("User is not a member of this group");
    }

    // Check rate limit
    const rateLimitKey = `send_message:${this.userSession.userHash}`;
    const rateLimit = await this.checkRateLimit(
      rateLimitKey,
      MESSAGING_CONFIG.RATE_LIMITS.SEND_MESSAGE_PER_HOUR,
      60
    );

    if (!rateLimit.allowed) {
      throw new Error("Rate limit exceeded for sending messages");
    }

    const messageSessionId = PrivacyUtils.generateEncryptedUUID();
    const encryptedContent = PrivacyUtils.encryptWithSessionKey(
      content,
      this.userSession.sessionKey
    );

    const privacyMessage: PrivacyGroupMessage = {
      messageSessionId,
      groupSessionId,
      senderHash: this.userSession.userHash,
      encryptedContent,
      messageType,
      metadataHash: metadata
        ? PrivacyUtils.hashIdentifier(JSON.stringify(metadata))
        : undefined,
      timestamp: new Date(),
    };

    try {
      // Store encrypted message
      const { error } = await supabase.from("encrypted_group_messages").insert({
        id: messageSessionId,
        group_session_id: groupSessionId,
        sender_hash: this.userSession.userHash,
        encrypted_content: encryptedContent,
        message_type: messageType,
        metadata_hash: privacyMessage.metadataHash,
        timestamp: privacyMessage.timestamp.toISOString(),
        metadata: {
          encrypted_metadata: metadata
            ? PrivacyUtils.encryptWithSessionKey(
                JSON.stringify(metadata),
                this.userSession.sessionKey
              )
            : null,
        },
      });

      if (error) {
        console.error("Failed to store encrypted message:", error);
        throw new Error("Failed to send message");
      }

      // Update group last activity
      await supabase
        .from("encrypted_groups")
        .update({
          last_activity_hash: PrivacyUtils.hashTimestamp(new Date()),
        })
        .eq("id", groupSessionId);

      // Update cached group
      group.lastActivityHash = PrivacyUtils.hashTimestamp(new Date());
      this.groupSessions.set(groupSessionId, group);

      // Send encrypted message to group members via Nostr
      await this.broadcastGroupMessage(groupSessionId, privacyMessage);

      // Log security event
      await this.logSecurityEvent("group_message_sent", {
        messageSessionId,
        groupSessionId,
        senderHash: this.userSession.userHash,
        messageType,
      });

      return messageSessionId;
    } catch (error) {
      console.error("Send group message error:", error);
      throw new Error("Failed to send message securely");
    }
  }

  /**
   * Get group messages with privacy preservation
   */
  async getGroupMessages(
    groupSessionId: string,
    options: {
      limit?: number;
      before?: Date;
      after?: Date;
    } = {}
  ): Promise<
    Array<{
      messageSessionId: string;
      senderHash: string;
      messageType: string;
      timestamp: Date;
      isFromCurrentUser: boolean;
    }>
  > {
    if (!this.userSession) {
      throw new Error("No active session");
    }

    // Validate group exists and user is member
    const group = this.groupSessions.get(groupSessionId);
    if (!group) {
      throw new Error("Group not found");
    }

    const isMember = await this.isGroupMember(
      groupSessionId,
      this.userSession.userHash
    );
    if (!isMember) {
      throw new Error("User is not a member of this group");
    }

    try {
      let query = supabase
        .from("encrypted_group_messages")
        .select("*")
        .eq("group_session_id", groupSessionId)
        .order("timestamp", { ascending: false });

      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.before) {
        query = query.lt("timestamp", options.before.toISOString());
      }

      if (options.after) {
        query = query.gt("timestamp", options.after.toISOString());
      }

      const { data: messages, error } = await query;

      if (error) {
        console.error("Failed to fetch group messages:", error);
        throw new Error("Failed to fetch messages");
      }

      // Return minimal message info for privacy (don't decrypt content here)
      return (
        messages?.map((msg) => ({
          messageSessionId: msg.id,
          senderHash: msg.sender_hash,
          messageType: msg.message_type,
          timestamp: new Date(msg.timestamp),
          isFromCurrentUser: msg.sender_hash === this.userSession?.userHash,
        })) || []
      );
    } catch (error) {
      console.error("Get group messages error:", error);
      throw new Error("Failed to fetch messages");
    }
  }

  /**
   * Decrypt specific message content (only for current session)
   */
  async decryptGroupMessage(messageSessionId: string): Promise<{
    content: string;
    metadata?: Record<string, any>;
  } | null> {
    if (!this.userSession) {
      throw new Error("No active session");
    }

    try {
      const { data: message, error } = await supabase
        .from("encrypted_group_messages")
        .select("*")
        .eq("id", messageSessionId)
        .single();

      if (error || !message) {
        return null;
      }

      // Verify user is member of the group
      const isMember = await this.isGroupMember(
        message.group_session_id,
        this.userSession.userHash
      );
      if (!isMember) {
        throw new Error("Access denied: not a group member");
      }

      // Decrypt content
      const content = PrivacyUtils.decryptWithSessionKey(
        message.encrypted_content,
        this.userSession.sessionKey
      );

      let metadata: Record<string, any> | undefined;
      if (message.metadata?.encrypted_metadata) {
        try {
          const decryptedMetadata = PrivacyUtils.decryptWithSessionKey(
            message.metadata.encrypted_metadata,
            this.userSession.sessionKey
          );
          metadata = JSON.parse(decryptedMetadata);
        } catch (metadataError) {
          console.warn("Failed to decrypt message metadata:", metadataError);
        }
      }

      return { content, metadata };
    } catch (error) {
      console.error("Decrypt group message error:", error);
      return null;
    }
  }

  /**
   * Edit group message (privacy-preserved)
   */
  async editGroupMessage(
    messageSessionId: string,
    newContent: string,
    newMetadata?: Record<string, any>
  ): Promise<boolean> {
    if (!this.userSession) {
      throw new Error("No active session");
    }

    try {
      // Get message and verify ownership
      const { data: message, error } = await supabase
        .from("encrypted_group_messages")
        .select("*")
        .eq("id", messageSessionId)
        .single();

      if (error || !message) {
        return false;
      }

      // Verify user owns the message
      if (message.sender_hash !== this.userSession.userHash) {
        throw new Error("Can only edit your own messages");
      }

      // Encrypt new content
      const encryptedContent = PrivacyUtils.encryptWithSessionKey(
        newContent,
        this.userSession.sessionKey
      );

      const updateData: any = {
        encrypted_content: encryptedContent,
        edited_hash: PrivacyUtils.hashTimestamp(new Date()),
        metadata: {
          ...message.metadata,
          encrypted_metadata: newMetadata
            ? PrivacyUtils.encryptWithSessionKey(
                JSON.stringify(newMetadata),
                this.userSession.sessionKey
              )
            : message.metadata?.encrypted_metadata,
        },
      };

      const { error: updateError } = await supabase
        .from("encrypted_group_messages")
        .update(updateData)
        .eq("id", messageSessionId);

      if (updateError) {
        console.error("Failed to edit message:", updateError);
        return false;
      }

      // Log security event
      await this.logSecurityEvent("group_message_edited", {
        messageSessionId,
        groupSessionId: message.group_session_id,
        senderHash: this.userSession.userHash,
      });

      return true;
    } catch (error) {
      console.error("Edit group message error:", error);
      return false;
    }
  }

  /**
   * Delete group message securely
   */
  async deleteGroupMessage(messageSessionId: string): Promise<boolean> {
    if (!this.userSession) {
      throw new Error("No active session");
    }

    try {
      // Get message and verify ownership or admin rights
      const { data: message, error } = await supabase
        .from("encrypted_group_messages")
        .select("*")
        .eq("id", messageSessionId)
        .single();

      if (error || !message) {
        return false;
      }

      // Verify user can delete (owner or group admin)
      const isOwner = message.sender_hash === this.userSession.userHash;
      const group = this.groupSessions.get(message.group_session_id);
      const isAdmin =
        group?.adminHashes.includes(this.userSession.userHash) || false;

      if (!isOwner && !isAdmin) {
        throw new Error(
          "Can only delete your own messages or admin can delete any"
        );
      }

      const { error: deleteError } = await supabase
        .from("encrypted_group_messages")
        .delete()
        .eq("id", messageSessionId);

      if (deleteError) {
        console.error("Failed to delete message:", deleteError);
        return false;
      }

      // Log security event
      await this.logSecurityEvent("group_message_deleted", {
        messageSessionId,
        groupSessionId: message.group_session_id,
        deletedByHash: this.userSession.userHash,
        wasOwner: isOwner,
        wasAdmin: isAdmin,
      });

      return true;
    } catch (error) {
      console.error("Delete group message error:", error);
      return false;
    }
  }

  /**
   * Check if user is member of group
   */
  private async isGroupMember(
    groupSessionId: string,
    userHash: string
  ): Promise<boolean> {
    try {
      const { data: member, error } = await supabase
        .from("encrypted_group_members")
        .select("id")
        .eq("group_session_id", groupSessionId)
        .eq("member_hash", userHash)
        .single();

      return !error && !!member;
    } catch (error) {
      return false;
    }
  }

  /**
   * Broadcast encrypted message to group members via Nostr
   */
  private async broadcastGroupMessage(
    groupSessionId: string,
    message: PrivacyGroupMessage
  ): Promise<void> {
    if (!this.userSession) return;

    try {
      // Get group encryption preference
      const group = this.groupSessions.get(groupSessionId);
      if (!group) return;

      // Get group members (for sending individual encrypted messages)
      const { data: members, error } = await supabase
        .from("encrypted_group_members")
        .select("member_hash")
        .eq("group_session_id", groupSessionId);

      if (error || !members) {
        console.error("Failed to get group members for broadcast:", error);
        return;
      }

      // Get user's nsec for signing (decrypt from session)
      const userNsec = PrivacyUtils.decryptWithSessionKey(
        this.userSession.encryptedNsec,
        this.userSession.sessionKey
      );

      // Send Gift Wrapped message to each group member
      const sendPromises = members.map(async (member) => {
        if (member.member_hash === this.userSession!.userHash) return; // Don't send to self

        // Find contact by member hash to get their encrypted npub and preferences
        const contact = await this.findContactByMemberHash(member.member_hash);
        if (!contact) return;

        try {
          // Decrypt recipient npub from contact (privacy-safe within session)
          const recipientNpub = PrivacyUtils.decryptWithSessionKey(
            contact.encryptedNpub,
            this.userSession!.sessionKey
          );

          await this.sendGiftWrappedGroupMessage(
            group,
            message,
            contact,
            recipientNpub,
            userNsec
          );
        } catch (memberError) {
          console.error(
            `Failed to send to member hash ${member.member_hash}:`,
            memberError
          );
        }
      });

      await Promise.all(sendPromises);

      // Store message in encrypted group history
      await this.storeGroupMessage(groupSessionId, message);
    } catch (error) {
      console.error("Broadcast group message error:", error);
    }
  }

  /**
   * Send Gift Wrapped message to individual group member (privacy-first)
   */
  private async sendGiftWrappedGroupMessage(
    group: PrivacyGroup,
    message: PrivacyGroupMessage,
    contact: PrivacyContact,
    recipientNpub: string,
    userNsec: string
  ): Promise<void> {
    try {
      // Decrypt the message content for sending (privacy-safe within session)
      const messageContent = PrivacyUtils.decryptWithSessionKey(
        message.encryptedContent,
        this.userSession!.sessionKey
      );

      const formattedMessage = await this.formatGroupMessage(
        group,
        message,
        messageContent
      );

      // Calculate privacy delay to prevent traffic analysis
      const delay = this.calculatePrivacyDelay("medium");

      if (contact.supportsGiftWrap && group.encryptionType === "gift-wrap") {
        // Send Gift Wrapped message (NIP-59)
        const giftWrappedEvent = await nip59.wrapEvent(
          {
            kind: 14,
            content: formattedMessage,
            tags: [
              ["p", recipientNpub],
              ["group-id", group.sessionId], // Use session ID, not actual group data
              ["group-name-hash", group.nameHash], // Use hash, not actual name
              ["message-type", message.messageType],
              ["sender-hash", message.senderHash], // Use hash, not actual sender
            ],
            created_at: Math.floor(Date.now() / 1000) + delay,
          },
          userNsec,
          recipientNpub
        );

        // Publish with privacy delay to prevent timing correlation
        setTimeout(async () => {
          await this.publishToRelays(giftWrappedEvent);
        }, delay * 1000);
      } else {
        // Fallback to NIP-04 DM
        const encryptedContent = await nip04.encrypt(
          userNsec,
          recipientNpub,
          formattedMessage
        );

        const dmEvent = finishEvent(
          {
            kind: 4,
            content: encryptedContent,
            tags: [
              ["p", recipientNpub],
              ["group-id", group.sessionId], // Use session ID for privacy
              ["group-name-hash", group.nameHash], // Use hash for privacy
            ],
            created_at: Math.floor(Date.now() / 1000),
          },
          userNsec
        );

        await this.publishToRelays(dmEvent);
      }
    } catch (error) {
      console.error("Send gift wrapped group message error:", error);
    }
  }

  /**
   * PRIVACY-FIRST DIRECT MESSAGING
   */
  async sendDirectMessage(
    contactSessionId: string,
    content: string,
    messageType: "text" | "file" | "payment" | "credential" = "text"
  ): Promise<string> {
    if (!this.userSession) {
      throw new Error("No active session. Please initialize session first.");
    }

    // Get contact by session ID (privacy-safe)
    const contact = this.contactSessions.get(contactSessionId);
    if (!contact) {
      throw new Error("Contact not found");
    }

    // Check rate limit
    const rateLimitKey = `send_dm:${this.userSession.userHash}`;
    const rateLimit = await this.checkRateLimit(
      rateLimitKey,
      MESSAGING_CONFIG.RATE_LIMITS.SEND_MESSAGE_PER_HOUR,
      60
    );

    if (!rateLimit.allowed) {
      throw new Error("Rate limit exceeded for sending direct messages");
    }

    const messageSessionId = PrivacyUtils.generateEncryptedUUID();

    // Decrypt recipient npub from contact (privacy-safe within session)
    const recipientNpub = PrivacyUtils.decryptWithSessionKey(
      contact.encryptedNpub,
      this.userSession.sessionKey
    );

    // Decrypt user's nsec for signing
    const userNsec = PrivacyUtils.decryptWithSessionKey(
      this.userSession.encryptedNsec,
      this.userSession.sessionKey
    );

    try {
      // Store encrypted message in database
      const encryptedContent = PrivacyUtils.encryptWithSessionKey(
        content,
        this.userSession.sessionKey
      );

      await supabase.from("encrypted_direct_messages").insert({
        id: messageSessionId,
        sender_hash: this.userSession.userHash,
        recipient_contact_session_id: contactSessionId,
        encrypted_content: encryptedContent,
        message_type: messageType,
        timestamp: new Date().toISOString(),
        metadata: {
          recipient_npub_hash: PrivacyUtils.hashIdentifier(recipientNpub),
        },
      });

      // Format message for sending (with optional NIP-05 disclosure)
      const messageContent = await this.formatDirectMessage(
        content,
        messageType,
        contact
      );

      if (contact.supportsGiftWrap && contact.preferredEncryption !== "nip04") {
        // Send Gift Wrapped DM
        const delay = this.calculatePrivacyDelay("medium");

        const giftWrappedEvent = await nip59.wrapEvent(
          {
            kind: 14,
            content: messageContent,
            tags: [
              ["p", recipientNpub],
              ["message-type", messageType],
              ["sender-hash", this.userSession.userHash], // Use hash for privacy
            ],
            created_at: Math.floor(Date.now() / 1000) + delay,
          },
          userNsec,
          recipientNpub
        );

        setTimeout(async () => {
          await this.publishToRelays(giftWrappedEvent);
        }, delay * 1000);
      } else {
        // Send NIP-04 DM
        const encryptedContent = await nip04.encrypt(
          userNsec,
          recipientNpub,
          messageContent
        );

        const dmEvent = finishEvent(
          {
            kind: 4,
            content: encryptedContent,
            tags: [
              ["p", recipientNpub],
              ["message-type", messageType],
            ],
            created_at: Math.floor(Date.now() / 1000),
          },
          userNsec
        );

        await this.publishToRelays(dmEvent);
      }

      // Store in local encrypted message history (privacy-first)
      await this.storeDirectMessage({
        messageSessionId,
        recipientContactSessionId: contactSessionId,
        encryptedContent: encryptedContent,
        messageType,
        timestamp: new Date(),
        sent: true,
      });

      // Log security event with hashed data
      await this.logSecurityEvent("direct_message_sent", {
        messageSessionId,
        senderHash: this.userSession.userHash,
        recipientContactSessionId: contactSessionId,
        messageType,
      });

      return messageSessionId;
    } catch (error) {
      console.error("Send direct message error:", error);
      throw new Error("Failed to send direct message securely");
    }
  }

  /**
   * Privacy-first helper methods
   */
  private async findContactByMemberHash(
    memberHash: string
  ): Promise<PrivacyContact | null> {
    // Search through cached contacts to find match by member hash
    // This avoids database queries and maintains privacy
    for (const contact of this.contactSessions.values()) {
      try {
        const contactNpub = PrivacyUtils.decryptWithSessionKey(
          contact.encryptedNpub,
          this.userSession!.sessionKey
        );
        const contactHash = PrivacyUtils.hashIdentifier(contactNpub);

        if (contactHash === memberHash) {
          return contact;
        }
      } catch (error) {
        // Skip contacts that can't be decrypted (shouldn't happen in valid session)
        continue;
      }
    }
    return null;
  }

  private async formatGroupMessage(
    group: PrivacyGroup,
    message: PrivacyGroupMessage,
    content: string
  ): Promise<string> {
    // Enhanced human-readable formatting with optional NIP-05 disclosure
    let senderInfo = `Member (${message.senderHash.substring(0, 8)}...)`;
    let identityDisclaimer = "";

    // Check if NIP-05 disclosure is allowed for this group
    const nip05Allowed = await this.isNip05DisclosureAllowed(
      "group",
      group.sessionId
    );

    if (nip05Allowed) {
      const nip05 = await this.getDecryptedNip05();
      if (nip05) {
        senderInfo = `${nip05} (verified)`;
        identityDisclaimer =
          "\n⚠️ Sender chose to disclose their verified identity in this group";
      }
    }

    return `🏛️ Private Group Message

From: ${senderInfo}
Type: ${message.messageType}
Time: ${message.timestamp.toLocaleString()}${identityDisclaimer}

${content}

${
  message.metadataHash
    ? `\nMessage ID: ${message.messageSessionId.substring(0, 12)}...`
    : ""
}

---
This message is Gift Wrapped for enhanced privacy
Group Type: ${group.groupType} 
Satnam.pub Sovereign Family Communications`;
  }

  private async formatDirectMessage(
    content: string,
    messageType: string,
    contact: PrivacyContact
  ): Promise<string> {
    if (!this.userSession) {
      return content; // Privacy-safe fallback
    }

    // Enhanced human-readable formatting with optional NIP-05 disclosure
    let senderInfo = `Family Member (${this.userSession.userHash.substring(
      0,
      8
    )}...)`;
    let identityDisclaimer = "";

    // Check if NIP-05 disclosure is allowed for direct messages
    const nip05Allowed = await this.isNip05DisclosureAllowed("direct");

    if (nip05Allowed) {
      const nip05 = await this.getDecryptedNip05();
      if (nip05) {
        senderInfo = `${nip05} (verified)`;
        identityDisclaimer =
          "\n⚠️ Sender chose to disclose their verified identity";
      }
    }

    return `💬 Private Message

From: ${senderInfo}
Type: ${messageType}
Trust Level: ${contact.trustLevel}
Time: ${new Date().toLocaleString()}${identityDisclaimer}

${content}

---
This message is Gift Wrapped for enhanced privacy
Satnam.pub Sovereign Family Communications`;
  }

  private async publishToRelays(event: Event): Promise<void> {
    try {
      // Enhanced relay list with satnam.pub priority
      const relays = [
        "wss://relay.satnam.pub", // Priority relay
        "wss://relay.damus.io",
        "wss://nos.lol",
        "wss://relay.nostr.band",
      ];

      // Publish to all relays with enhanced error handling
      const publishPromises = relays.map(async (relay) => {
        try {
          const pub = this.pool.publish([relay], event);

          return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`Publish timeout for ${relay}`));
            }, 10000); // 10 second timeout

            pub.on("ok", () => {
              clearTimeout(timeout);
              console.log(`Event published successfully to ${relay}`);
              resolve();
            });

            pub.on("failed", (reason: string) => {
              clearTimeout(timeout);
              console.warn(`Failed to publish to ${relay}: ${reason}`);
              reject(new Error(reason));
            });
          });
        } catch (relayError) {
          console.warn(`Error publishing to ${relay}:`, relayError);
          throw relayError;
        }
      });

      // Wait for at least one successful publish
      const results = await Promise.allSettled(publishPromises);
      const successes = results.filter(
        (result) => result.status === "fulfilled"
      );

      if (successes.length === 0) {
        throw new Error("Failed to publish to any relay");
      }

      // Log successful publishes
      await this.logSecurityEvent("event_published", {
        eventId: event.id,
        eventKind: event.kind,
        successfulRelays: successes.length,
        totalRelays: relays.length,
        userHash: this.userSession?.userHash,
      });
    } catch (error) {
      console.error("Enhanced publish to relays error:", error);
      throw error;
    }
  }

  private async storeGroupMessage(
    groupSessionId: string,
    message: PrivacyGroupMessage
  ): Promise<void> {
    // The message is already stored in the database via sendGroupMessage
    // This method could be used for additional encrypted history storage
    // or backup mechanisms while maintaining privacy
    try {
      // Update group's last activity hash
      await supabase
        .from("encrypted_groups")
        .update({
          last_activity_hash: PrivacyUtils.hashTimestamp(new Date()),
        })
        .eq("id", groupSessionId);

      // Log activity without exposing content
      await this.logSecurityEvent("group_message_stored", {
        groupSessionId,
        messageSessionId: message.messageSessionId,
        senderHash: message.senderHash,
        messageType: message.messageType,
      });
    } catch (error) {
      console.error("Store group message error:", error);
    }
  }

  /**
   * PRIVACY-FIRST MESSAGE LISTENING AND PROCESSING
   */
  async startMessageListener(): Promise<void> {
    if (!this.userSession) {
      throw new Error("No active session. Please initialize session first.");
    }

    try {
      // Decrypt user's npub and nsec for message listening (privacy-safe within session)
      const userNpub = getPublicKey(
        PrivacyUtils.decryptWithSessionKey(
          this.userSession.encryptedNsec,
          this.userSession.sessionKey
        )
      );

      const filter = {
        kinds: [1059, 4], // Gift Wrapped and regular DMs
        "#p": [userNpub],
        since: Math.floor(Date.now() / 1000),
      };

      // Use privacy-conscious relay selection
      const relays = [
        "wss://relay.satnam.pub",
        "wss://relay.damus.io",
        "wss://nos.lol",
        "wss://relay.nostr.band",
      ];

      this.pool.subscribeMany(relays, [filter], {
        onevent: async (event) => {
          await this.processIncomingMessage(event);
        },
      });

      // Log security event
      await this.logSecurityEvent("message_listener_started", {
        userHash: this.userSession.userHash,
        sessionId: this.userSession.sessionId,
      });
    } catch (error) {
      console.error("Failed to start message listener:", error);
      throw new Error("Failed to start secure message listener");
    }
  }

  private async processIncomingMessage(event: Event): Promise<void> {
    if (!this.userSession) return;

    try {
      let decryptedContent = "";
      let senderNpub = "";
      let messageType = "unknown";
      let groupSessionId: string | undefined;

      // Decrypt user's nsec for message decryption (privacy-safe within session)
      const userNsec = PrivacyUtils.decryptWithSessionKey(
        this.userSession.encryptedNsec,
        this.userSession.sessionKey
      );

      if (event.kind === 1059) {
        // Gift Wrapped message (NIP-59)
        const unwrapped = await nip59.unwrapEvent(event, userNsec);
        if (unwrapped) {
          decryptedContent = unwrapped.content;
          senderNpub = unwrapped.pubkey;
          messageType = "gift-wrap";
          groupSessionId = unwrapped.tags.find(
            (tag) => tag[0] === "group-id"
          )?.[1];
        }
      } else if (event.kind === 4) {
        // Regular NIP-04 DM
        senderNpub = event.pubkey;
        decryptedContent = await nip04.decrypt(
          userNsec,
          senderNpub,
          event.content
        );
        messageType = "nip04";
        groupSessionId = event.tags.find((tag) => tag[0] === "group-id")?.[1];
      }

      if (decryptedContent && senderNpub) {
        if (groupSessionId) {
          // Group message - verify group exists and user is member
          if (this.groupSessions.has(groupSessionId)) {
            await this.handleIncomingGroupMessage(
              groupSessionId,
              senderNpub,
              decryptedContent,
              event
            );
          }
        } else {
          // Direct message - process securely
          await this.handleIncomingDirectMessage(
            senderNpub,
            decryptedContent,
            event
          );
        }
      }
    } catch (error) {
      console.error("Failed to process incoming message:", error);
      // Log security event for failed message processing
      await this.logSecurityEvent("message_processing_failed", {
        eventId: event.id,
        eventKind: event.kind,
        userHash: this.userSession.userHash,
      });
    }
  }

  private async handleIncomingGroupMessage(
    groupSessionId: string,
    senderNpub: string,
    content: string,
    event: Event
  ): Promise<void> {
    if (!this.userSession) return;

    try {
      // Verify user is member of the group
      const isMember = await this.isGroupMember(
        groupSessionId,
        this.userSession.userHash
      );
      if (!isMember) {
        console.warn("Received group message for non-member group");
        return;
      }

      // Hash sender npub for privacy
      const senderHash = PrivacyUtils.hashIdentifier(senderNpub);
      const messageSessionId = PrivacyUtils.generateEncryptedUUID();

      // Encrypt and store the incoming message
      const encryptedContent = PrivacyUtils.encryptWithSessionKey(
        content,
        this.userSession.sessionKey
      );

      // Parse message content safely
      let messageData: any = {};
      try {
        messageData = JSON.parse(content);
      } catch (parseError) {
        // Treat as plain text if JSON parsing fails
        messageData = { content, type: "text" };
      }

      await supabase.from("encrypted_group_messages").insert({
        id: messageSessionId,
        group_session_id: groupSessionId,
        sender_hash: senderHash,
        encrypted_content: encryptedContent,
        message_type: messageData.messageType || "text",
        timestamp: new Date().toISOString(),
        metadata: {
          event_id: event.id,
          received_at: new Date().toISOString(),
        },
      });

      // Notify listeners if any
      const listeners = this.messageListeners.get(groupSessionId);
      if (listeners) {
        listeners({
          type: "group_message",
          groupSessionId,
          messageSessionId,
          senderHash,
          messageType: messageData.messageType || "text",
          timestamp: new Date(),
        });
      }

      // Log security event
      await this.logSecurityEvent("group_message_received", {
        groupSessionId,
        messageSessionId,
        senderHash,
        userHash: this.userSession.userHash,
      });
    } catch (error) {
      console.error("Handle incoming group message error:", error);
    }
  }

  private async handleIncomingDirectMessage(
    senderNpub: string,
    content: string,
    event: Event
  ): Promise<void> {
    if (!this.userSession) return;

    try {
      // Find contact by npub to get session ID
      const senderContact = await this.findContactByNpub(senderNpub);
      const messageSessionId = PrivacyUtils.generateEncryptedUUID();
      const senderHash = PrivacyUtils.hashIdentifier(senderNpub);

      // Encrypt and store the incoming message
      const encryptedContent = PrivacyUtils.encryptWithSessionKey(
        content,
        this.userSession.sessionKey
      );

      // Parse message content safely
      let messageData: any = {};
      try {
        messageData = JSON.parse(content);
      } catch (parseError) {
        // Treat as plain text if JSON parsing fails
        messageData = { content, type: "text" };
      }

      await supabase.from("encrypted_direct_messages").insert({
        id: messageSessionId,
        sender_hash: senderHash,
        recipient_contact_session_id: senderContact?.sessionId || null,
        encrypted_content: encryptedContent,
        message_type: messageData.messageType || "text",
        timestamp: new Date().toISOString(),
        metadata: {
          event_id: event.id,
          received_at: new Date().toISOString(),
          sender_npub_hash: senderHash,
        },
      });

      // Store DM in history
      await this.storeDirectMessage({
        messageSessionId,
        recipientContactSessionId: senderContact?.sessionId || null,
        encryptedContent,
        messageType: messageData.messageType || "text",
        timestamp: new Date(),
        sent: false,
      });

      // Notify listeners if any
      const listeners = this.messageListeners.get("direct_messages");
      if (listeners) {
        listeners({
          type: "direct_message",
          messageSessionId,
          senderHash,
          contactSessionId: senderContact?.sessionId,
          messageType: messageData.messageType || "text",
          timestamp: new Date(),
        });
      }

      // Log security event
      await this.logSecurityEvent("direct_message_received", {
        messageSessionId,
        senderHash,
        userHash: this.userSession.userHash,
      });
    } catch (error) {
      console.error("Handle incoming direct message error:", error);
    }
  }

  /**
   * PRIVACY-FIRST UTILITY METHODS
   */
  private async findContactByNpub(
    npub: string
  ): Promise<PrivacyContact | null> {
    if (!this.userSession) return null;

    // Search through cached contacts to find match by npub (privacy-safe within session)
    for (const contact of this.contactSessions.values()) {
      try {
        const contactNpub = PrivacyUtils.decryptWithSessionKey(
          contact.encryptedNpub,
          this.userSession.sessionKey
        );

        if (contactNpub === npub) {
          return contact;
        }
      } catch (error) {
        // Skip contacts that can't be decrypted
        continue;
      }
    }
    return null;
  }

  private async storeDirectMessage(messageData: {
    messageSessionId: string;
    recipientContactSessionId: string | null;
    encryptedContent: string;
    messageType: string;
    timestamp: Date;
    sent: boolean;
  }): Promise<void> {
    if (!this.userSession) return;

    try {
      // Store in encrypted message history with privacy-first approach
      await supabase.from("encrypted_message_history").insert({
        id: PrivacyUtils.generateEncryptedUUID(),
        user_hash: this.userSession.userHash,
        message_session_id: messageData.messageSessionId,
        contact_session_id: messageData.recipientContactSessionId,
        encrypted_content: messageData.encryptedContent,
        message_type: messageData.messageType,
        timestamp: messageData.timestamp.toISOString(),
        sent: messageData.sent,
        metadata: {
          stored_at: new Date().toISOString(),
        },
      });

      // Log storage event
      await this.logSecurityEvent("message_stored_locally", {
        messageSessionId: messageData.messageSessionId,
        userHash: this.userSession.userHash,
        messageType: messageData.messageType,
        sent: messageData.sent,
      });
    } catch (error) {
      console.error("Store direct message error:", error);
    }
  }

  private async detectGiftWrapSupport(npub: string): Promise<boolean> {
    // Privacy-safe Gift Wrap support detection
    try {
      const filter = {
        kinds: [0, 10002],
        authors: [npub],
        limit: 5,
      };

      // Use privacy-conscious relay selection
      const events = await this.pool.querySync(
        ["wss://relay.damus.io", "wss://nos.lol"],
        filter
      );

      for (const event of events) {
        if (event.kind === 0) {
          try {
            const profile = JSON.parse(event.content);
            if (
              profile.about?.toLowerCase().includes("gift wrap") ||
              profile.about?.toLowerCase().includes("nip-59") ||
              profile.nip05?.includes("amethyst")
            ) {
              return true;
            }
          } catch (e) {
            // Profile parsing failed - continue checking
          }
        }
      }

      return false;
    } catch (error) {
      console.error("Gift wrap detection error:", error);
      return false; // Default to false for privacy
    }
  }

  private calculatePrivacyDelay(
    priority: "urgent" | "high" | "medium" | "low"
  ): number {
    // Enhanced privacy delay calculation with randomization
    const delays = {
      urgent: 30,
      high: 120,
      medium: 300,
      low: 900,
    };

    const baseDelay = delays[priority] || 300;
    // Add randomization to prevent timing analysis
    return baseDelay + Math.floor(Math.random() * 60);
  }

  /**
   * Enhanced group invitation sending with OTP integration
   */
  private async sendGroupInvitation(
    groupSessionId: string,
    memberNpub: string,
    role: "admin" | "member" | "viewer"
  ): Promise<void> {
    if (!this.userSession) return;

    try {
      const group = this.groupSessions.get(groupSessionId);
      if (!group) return;

      // Create invitation payload
      const invitationData = {
        type: "group_invitation",
        groupSessionId,
        inviterHash: this.userSession.userHash,
        role,
        encryptionType: group.encryptionType,
        timestamp: new Date().toISOString(),
      };

      // Encrypt invitation content
      const encryptedInvitation = PrivacyUtils.encryptWithSessionKey(
        JSON.stringify(invitationData),
        this.userSession.sessionKey
      );

      // Store invitation record for tracking
      const invitationId = PrivacyUtils.generateEncryptedUUID();
      await supabase.from("encrypted_invitations").insert({
        id: invitationId,
        type: "group_invitation",
        group_session_id: groupSessionId,
        inviter_hash: this.userSession.userHash,
        invitee_npub_hash: PrivacyUtils.hashIdentifier(memberNpub),
        encrypted_content: encryptedInvitation,
        status: "pending",
        expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString(), // 7 days
      });

      // Send via appropriate method (gift-wrap or nip04)
      if (group.encryptionType === "gift-wrap") {
        await this.sendGiftWrappedInvitation(memberNpub, invitationData);
      } else {
        await this.sendNip04Invitation(memberNpub, invitationData);
      }

      // Log security event
      await this.logSecurityEvent("group_invitation_sent", {
        invitationId,
        groupSessionId,
        inviterHash: this.userSession.userHash,
        inviteeNpubHash: PrivacyUtils.hashIdentifier(memberNpub),
        encryptionType: group.encryptionType,
      });
    } catch (error) {
      console.error("Send group invitation error:", error);
    }
  }

  /**
   * Send gift-wrapped invitation
   */
  private async sendGiftWrappedInvitation(
    recipientNpub: string,
    invitationData: any
  ): Promise<void> {
    // Placeholder for gift-wrap implementation
    console.log(
      `Sending gift-wrapped invitation to ${recipientNpub}`,
      invitationData
    );
    // TODO: Implement actual NIP-59 gift-wrap event creation
  }

  /**
   * Send NIP-04 encrypted invitation
   */
  private async sendNip04Invitation(
    recipientNpub: string,
    invitationData: any
  ): Promise<void> {
    // Placeholder for NIP-04 implementation
    console.log(
      `Sending NIP-04 invitation to ${recipientNpub}`,
      invitationData
    );
    // TODO: Implement actual NIP-04 encrypted event creation
  }

  /**
   * Add group member record to database
   */
  private async addGroupMemberRecord(
    groupSessionId: string,
    memberHash: string,
    role: "admin" | "member" | "viewer"
  ): Promise<boolean> {
    if (!this.userSession) return false;

    try {
      const memberSessionId = PrivacyUtils.generateEncryptedUUID();

      const { error } = await supabase.from("encrypted_group_members").insert({
        id: memberSessionId,
        group_session_id: groupSessionId,
        member_hash: memberHash,
        display_name_hash: "member", // Placeholder - would be filled from contact
        role,
        joined_at: new Date().toISOString(),
        invited_by_hash: this.userSession.userHash,
      });

      if (error) {
        console.error("Failed to add group member record:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Add group member record error:", error);
      return false;
    }
  }

  /**
   * Send encrypted group invitations
   */
  private async sendGroupInvitations(
    groupSessionId: string,
    contactSessionIds: string[]
  ): Promise<void> {
    if (!this.userSession) return;

    for (const contactSessionId of contactSessionIds) {
      try {
        const contact = this.contactSessions.get(contactSessionId);
        if (!contact) continue;

        const memberNpub = PrivacyUtils.decryptWithSessionKey(
          contact.encryptedNpub,
          this.userSession.sessionKey
        );

        await this.sendGroupInvitation(groupSessionId, memberNpub, "member");
      } catch (error) {
        console.error(
          `Failed to send invitation to ${contactSessionId}:`,
          error
        );
        // Continue with other invitations
      }
    }
  }

  /**
   * Load user's contacts from encrypted storage (Enhanced with validation)
   */
  private async loadUserContacts(): Promise<void> {
    if (!this.userSession) return;

    try {
      const { data: contacts, error } = await supabase
        .from("encrypted_contacts")
        .select("*")
        .eq("owner_hash", this.userSession.userHash);

      if (error) {
        console.error("Failed to load contacts:", error);
        return;
      }

      // Enhanced contact loading with additional validation and logging
      let successCount = 0;
      let errorCount = 0;

      for (const contact of contacts || []) {
        try {
          // Validate contact structure before loading
          if (
            !contact.id ||
            !contact.encrypted_npub ||
            !contact.display_name_hash
          ) {
            console.warn("Invalid contact structure, skipping");
            errorCount++;
            continue;
          }

          const privacyContact: PrivacyContact = {
            sessionId: contact.id,
            encryptedNpub: contact.encrypted_npub,
            nip05Hash: contact.nip05_hash,
            displayNameHash: contact.display_name_hash,
            familyRole: contact.family_role,
            trustLevel: contact.trust_level,
            supportsGiftWrap: contact.supports_gift_wrap,
            preferredEncryption: contact.preferred_encryption,
            tagsHash: contact.tags_hash || [],
            addedAt: new Date(contact.added_at),
            addedByHash: contact.added_by_hash,
            lastSeenHash: contact.last_seen_hash,
          };

          this.contactSessions.set(contact.id, privacyContact);
          successCount++;
        } catch (contactError) {
          console.error(`Failed to load contact ${contact.id}:`, contactError);
          errorCount++;
        }
      }

      // Log loading results
      await this.logSecurityEvent("contacts_loaded", {
        userHash: this.userSession.userHash,
        successCount,
        errorCount,
        totalContacts: contacts?.length || 0,
      });
    } catch (error) {
      console.error("Enhanced load contacts error:", error);
    }
  }

  /**
   * Load user's groups from encrypted storage (Enhanced with validation)
   */
  private async loadUserGroups(): Promise<void> {
    if (!this.userSession) return;

    try {
      const { data: groups, error } = await supabase
        .from("encrypted_groups")
        .select("*")
        .contains("admin_hashes", [this.userSession.userHash]);

      if (error) {
        console.error("Failed to load groups:", error);
        return;
      }

      // Enhanced group loading with additional validation and logging
      let successCount = 0;
      let errorCount = 0;

      for (const group of groups || []) {
        try {
          // Validate group structure before loading
          if (!group.id || !group.name_hash || !group.group_type) {
            console.warn("Invalid group structure, skipping");
            errorCount++;
            continue;
          }

          const privacyGroup: PrivacyGroup = {
            sessionId: group.id,
            nameHash: group.name_hash,
            descriptionHash: group.description_hash,
            groupType: group.group_type,
            memberCount: group.member_count,
            adminHashes: group.admin_hashes,
            encryptionType: group.encryption_type,
            createdAt: new Date(group.created_at),
            createdByHash: group.created_by_hash,
            lastActivityHash: group.last_activity_hash,
          };

          this.groupSessions.set(group.id, privacyGroup);
          successCount++;
        } catch (groupError) {
          console.error(`Failed to load group ${group.id}:`, groupError);
          errorCount++;
        }
      }

      // Log loading results
      await this.logSecurityEvent("groups_loaded", {
        userHash: this.userSession.userHash,
        successCount,
        errorCount,
        totalGroups: groups?.length || 0,
      });
    } catch (error) {
      console.error("Enhanced load groups error:", error);
    }
  }

  /**
   * Rate limiting check (using existing rate limit system)
   */
  private async checkRateLimit(
    key: string,
    maxRequests: number,
    windowMinutes: number = 60
  ): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
    const windowStart = new Date();
    windowStart.setMinutes(windowStart.getMinutes() - windowMinutes);

    try {
      const { data, error } = await supabase.rpc("check_rate_limit", {
        p_key: key,
        p_window_start: windowStart.toISOString(),
        p_max_requests: maxRequests,
      });

      if (error) {
        // Fail open for rate limiting errors
        return {
          allowed: true,
          remaining: maxRequests,
          resetTime: new Date(Date.now() + windowMinutes * 60 * 1000),
        };
      }

      const totalHits = data?.[0]?.total_hits || 0;
      const allowed = totalHits <= maxRequests;
      const remaining = Math.max(0, maxRequests - totalHits);

      const resetTime = new Date(windowStart);
      resetTime.setMinutes(resetTime.getMinutes() + windowMinutes);

      return { allowed, remaining, resetTime };
    } catch (error) {
      console.warn("Rate limit check error, failing open:", error);
      return {
        allowed: true,
        remaining: maxRequests,
        resetTime: new Date(Date.now() + windowMinutes * 60 * 1000),
      };
    }
  }

  /**
   * Log security events (using existing security audit system)
   */
  private async logSecurityEvent(
    eventType: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await supabase.from("security_audit_log").insert({
        event_type: eventType,
        details,
        ip_address: details.ipAddress,
        user_agent: details.userAgent,
        session_id: details.sessionId,
      });
    } catch (error) {
      console.error("Failed to log security event:", error);
      // Don't throw - logging failures shouldn't break functionality
    }
  }

  /**
   * PRIVACY-FIRST DATA ENCRYPTION UTILITIES
   */
  private async encryptData(data: string): Promise<string> {
    if (!this.userSession) {
      throw new Error("No active session for data encryption");
    }

    try {
      // Use session-based encryption instead of direct user keys for privacy
      return PrivacyUtils.encryptWithSessionKey(
        data,
        this.userSession.sessionKey
      );
    } catch (error) {
      console.error("Data encryption error:", error);
      throw new Error("Failed to encrypt data securely");
    }
  }

  private async decryptData(encryptedData: string): Promise<string> {
    if (!this.userSession) {
      throw new Error("No active session for data decryption");
    }

    try {
      // Use session-based decryption instead of direct user keys for privacy
      return PrivacyUtils.decryptWithSessionKey(
        encryptedData,
        this.userSession.sessionKey
      );
    } catch (error) {
      console.error("Data decryption error:", error);
      throw new Error("Failed to decrypt data securely");
    }
  }

  /**
   * ENHANCED PRIVACY-FIRST UTILITY METHODS
   */
  private getUserDisplayName(): string {
    if (!this.userSession) {
      return "Family Member"; // Privacy-safe fallback
    }

    // Return privacy-safe display using hash prefix - never actual names
    return `Member ${this.userSession.userHash.substring(0, 8)}...`;
  }

  /**
   * Cleanup expired sessions and data
   */
  static async cleanupExpiredSessions(): Promise<number> {
    try {
      const { count, error } = await supabase
        .from("messaging_sessions")
        .delete({ count: "exact" })
        .lt("expires_at", new Date().toISOString());

      if (error) {
        console.error("Failed to cleanup expired sessions:", error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error("Session cleanup error:", error);
      return 0;
    }
  }
}

/**
 * DATABASE SCHEMA REQUIREMENTS FOR NIP-05 IDENTITY DISCLOSURE
 *
 * Required table: identity_disclosure_preferences
 *
 * CREATE TABLE identity_disclosure_preferences (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_hash VARCHAR(64) UNIQUE NOT NULL, -- Hashed user identifier
 *   allow_direct_messages BOOLEAN DEFAULT FALSE,
 *   allow_group_messages BOOLEAN DEFAULT FALSE,
 *   allowed_group_session_ids TEXT[] DEFAULT '{}', -- Array of group session IDs
 *   encrypted_nip05 TEXT, -- Encrypted NIP-05 (only if user consents)
 *   consent_timestamp TIMESTAMPTZ NOT NULL,
 *   consent_ip_hash VARCHAR(64), -- Hashed IP for audit trail
 *   privacy_warning_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
 *   last_updated TIMESTAMPTZ DEFAULT NOW(),
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * Indexes:
 * CREATE INDEX idx_identity_disclosure_user_hash ON identity_disclosure_preferences(user_hash);
 * CREATE INDEX idx_identity_disclosure_updated ON identity_disclosure_preferences(last_updated);
 *
 * Row Level Security (RLS) Policies:
 * ALTER TABLE identity_disclosure_preferences ENABLE ROW LEVEL SECURITY;
 *
 * -- Only allow users to access their own preferences
 * CREATE POLICY identity_disclosure_own_data ON identity_disclosure_preferences
 *   FOR ALL USING (user_hash = current_setting('request.jwt.claims')::json->>'user_hash');
 *
 * PRIVACY FEATURES IMPLEMENTED:
 * ✅ Default to private messaging (no NIP-05 disclosure)
 * ✅ Explicit user consent required with privacy warnings
 * ✅ Granular control (direct, groups, specific groups)
 * ✅ Minimal PII exposure (hashed identifiers, encrypted NIP-05)
 * ✅ Audit trail with privacy protection
 * ✅ Session-based security with encryption
 * ✅ Easy disable/remove preferences
 * ✅ Clear privacy warnings and consequences
 * ✅ UI helper methods for React integration
 *
 * USAGE EXAMPLES:
 *
 * // Initialize service
 * const messaging = new SatnamPrivacyFirstCommunications();
 * await messaging.initializeSession(nsec);
 *
 * // Get privacy warning for UI
 * const warning = messaging.getPrivacyWarningContent('direct');
 *
 * // Enable NIP-05 disclosure after user consent
 * const consentResponse: PrivacyConsentResponse = {
 *   consentGiven: true,
 *   warningAcknowledged: true,
 *   selectedScope: 'direct',
 *   timestamp: new Date()
 * };
 * await messaging.updateIdentityDisclosurePreferences(consentResponse, 'user@example.com');
 *
 * // Check current status
 * const status = await messaging.getIdentityDisclosureStatus();
 *
 * // Disable disclosure (return to private)
 * await messaging.disableIdentityDisclosure();
 *
 * Messages will now automatically include NIP-05 when:
 * - User has opted in for the message context
 * - Privacy preferences allow it
 * - NIP-05 is properly encrypted and stored
 * - All while maintaining maximum privacy protection
 */
