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
  familyRole?: "offspring" | "adult" | "steward" | "guardian"; // Correct family roles
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
   * Add a new contact with privacy-first approach
   */
  async addContact(contactData: {
    npub: string;
    displayName: string;
    nip05?: string;
    familyRole?: "offspring" | "adult" | "steward" | "guardian"; // Correct family roles
    trustLevel: "family" | "trusted" | "known" | "unverified";
    tags?: string[];
    preferredEncryption?: "gift-wrap" | "nip04" | "auto";
  }): Promise<string> {
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      // Generate privacy-safe identifiers
      const contactSessionId = await PrivacyUtils.generateEncryptedUUID();
      const encryptedNpub = await PrivacyUtils.encryptWithSessionKey(
        contactData.npub,
        this.userSession.sessionKey
      );

      // Create privacy contact
      const privacyContact: PrivacyContact = {
        sessionId: contactSessionId,
        encryptedNpub,
        nip05Hash: contactData.nip05
          ? await PrivacyUtils.hashIdentifier(contactData.nip05)
          : undefined,
        displayNameHash: await PrivacyUtils.hashIdentifier(contactData.displayName),
        familyRole: contactData.familyRole,
        trustLevel: contactData.trustLevel,
        supportsGiftWrap: await this.detectGiftWrapSupport(contactData.npub),
        preferredEncryption: contactData.preferredEncryption || "auto",
        tagsHash: await Promise.all(
          (contactData.tags || []).map((tag) => PrivacyUtils.hashIdentifier(tag))
        ),
        addedAt: new Date(),
        addedByHash: this.userSession.userHash,
      };

      // Store in memory and database
      this.contactSessions.set(contactSessionId, privacyContact);
      await this.storeContactInDatabase(privacyContact);

      return contactSessionId;
    } catch (error) {
      console.error("Failed to add contact:", error);
      throw new Error("Contact addition failed");
    }
  }

  /**
   * Store contact in database with privacy-first encryption
   */
  private async storeContactInDatabase(contact: PrivacyContact): Promise<void> {
    try {
      const { error } = await supabase
        .from("privacy_contacts")
        .upsert({
          session_id: contact.sessionId,
          user_hash: this.userSession!.userHash,
          encrypted_npub: contact.encryptedNpub,
          nip05_hash: contact.nip05Hash,
          display_name_hash: contact.displayNameHash,
          family_role: contact.familyRole,
          trust_level: contact.trustLevel,
          supports_gift_wrap: contact.supportsGiftWrap,
          preferred_encryption: contact.preferredEncryption,
          tags_hash: contact.tagsHash,
          added_at: contact.addedAt.toISOString(),
          added_by_hash: contact.addedByHash,
        });

      if (error) {
        console.error("Failed to store contact:", error);
        throw new Error("Contact storage failed");
      }
    } catch (error) {
      console.error("Database error:", error);
      throw new Error("Contact storage failed");
    }
  }

  /**
   * Detect if a contact supports gift-wrapped messaging
   */
  private async detectGiftWrapSupport(npub: string): Promise<boolean> {
    try {
      // For now, assume all contacts support gift-wrap
      // In production, this would query relays for NIP-59 support
      return true;
    } catch (error) {
      console.error("Failed to detect gift-wrap support:", error);
      return false;
    }
  }

  /**
   * Create a new group with privacy-first approach
   */
  async createGroup(groupData: {
    name: string;
    description: string;
    groupType: "family" | "business" | "friends" | "advisors";
    encryptionType: "gift-wrap" | "nip04";
  }): Promise<string> {
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      // Generate privacy-safe identifiers
      const groupSessionId = await PrivacyUtils.generateEncryptedUUID();
      const nameHash = await PrivacyUtils.hashIdentifier(groupData.name);
      const descriptionHash = await PrivacyUtils.hashIdentifier(groupData.description);

      // Create privacy group
      const privacyGroup: PrivacyGroup = {
        sessionId: groupSessionId,
        nameHash,
        descriptionHash,
        groupType: groupData.groupType,
        memberCount: 1, // Creator is the first member
        adminHashes: [this.userSession.userHash],
        encryptionType: groupData.encryptionType,
        createdAt: new Date(),
        createdByHash: this.userSession.userHash,
      };

      // Store in memory and database
      this.groupSessions.set(groupSessionId, privacyGroup);
      await this.storeGroupInDatabase(privacyGroup);

      return groupSessionId;
    } catch (error) {
      console.error("Failed to create group:", error);
      throw new Error("Group creation failed");
    }
  }

  /**
   * Store group in database with privacy-first encryption
   */
  private async storeGroupInDatabase(group: PrivacyGroup): Promise<void> {
    try {
      const { error } = await supabase
        .from("privacy_groups")
        .upsert({
          session_id: group.sessionId,
          user_hash: this.userSession!.userHash,
          name_hash: group.nameHash,
          description_hash: group.descriptionHash,
          group_type: group.groupType,
          member_count: group.memberCount,
          admin_hashes: group.adminHashes,
          encryption_type: group.encryptionType,
          created_at: group.createdAt.toISOString(),
          created_by_hash: group.createdByHash,
        });

      if (error) {
        console.error("Failed to store group:", error);
        throw new Error("Group storage failed");
      }
    } catch (error) {
      console.error("Database error:", error);
      throw new Error("Group storage failed");
    }
  }

  /**
   * Send a direct message with privacy-first encryption
   */
  async sendDirectMessage(
    contactSessionId: string,
    content: string,
    messageType: "text" | "announcement" | "file" | "payment-request" = "text"
  ): Promise<string> {
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      const contact = this.contactSessions.get(contactSessionId);
      if (!contact) {
        throw new Error("Contact not found");
      }

      // Decrypt contact npub
      const recipientNpub = await PrivacyUtils.decryptWithSessionKey(
        contact.encryptedNpub,
        this.userSession.sessionKey
      );

      // Check NIP-05 disclosure permission
      const allowNip05 = await this.isNip05DisclosureAllowed("direct");
      const nip05 = allowNip05 ? await this.getDecryptedNip05() : undefined;

      // Create message content
      const messageContent = {
        content,
        messageType,
        timestamp: Date.now(),
        sender: {
          npub: getPublicKey(await this.getNsecBytes()),
          nip05,
        },
      };

      // Encrypt message based on contact preference
      let encryptedContent: string;
      if (contact.preferredEncryption === "gift-wrap" || contact.supportsGiftWrap) {
        // Use NIP-59 gift-wrapped encryption
        const giftWrappedEvent = await nip59.wrapEvent(
          {
            kind: 14, // Gift-wrapped event
            content: JSON.stringify(messageContent),
            tags: [
              ["p", recipientNpub],
              ["message-type", messageType],
              ["sender", getPublicKey(await this.getNsecBytes())],
              ["created", Date.now().toString()],
            ],
            created_at: Math.floor(Date.now() / 1000),
          },
          recipientNpub,
          await this.getNsecBytes()
        );
        encryptedContent = JSON.stringify(giftWrappedEvent);
      } else {
        // Use NIP-04 encryption
        encryptedContent = await nip04.encrypt(
          JSON.stringify(messageContent),
          recipientNpub,
          await this.getNsecBytes()
        );
      }

      // Publish to relays
      const relays = ["wss://relay.satnam.pub", "wss://nos.lol"];
      await this.publishToRelays(relays, {
        kind: 4,
        content: encryptedContent,
        tags: [["p", recipientNpub]],
        created_at: Math.floor(Date.now() / 1000),
      });

      return await PrivacyUtils.generateEncryptedUUID();
    } catch (error) {
      console.error("Failed to send direct message:", error);
      throw new Error("Message sending failed");
    }
  }

  /**
   * Send a group message with privacy-first encryption
   */
  async sendGroupMessage(
    groupSessionId: string,
    content: string,
    messageType: "text" | "announcement" | "poll" | "file" | "payment-request" = "text"
  ): Promise<string> {
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      const group = this.groupSessions.get(groupSessionId);
      if (!group) {
        throw new Error("Group not found");
      }

      // Check NIP-05 disclosure permission
      const allowNip05 = await this.isNip05DisclosureAllowed("group", groupSessionId);
      const nip05 = allowNip05 ? await this.getDecryptedNip05() : undefined;

      // Create message content
      const messageContent = {
        content,
        messageType,
        groupId: groupSessionId,
        timestamp: Date.now(),
        sender: {
          npub: getPublicKey(await this.getNsecBytes()),
          nip05,
        },
      };

      // Encrypt message based on group encryption type
      let encryptedContent: string;
      if (group.encryptionType === "gift-wrap") {
        // Use NIP-59 gift-wrapped encryption for group
        const giftWrappedEvent = await nip59.wrapEvent(
          {
            kind: 14, // Gift-wrapped event
            content: JSON.stringify(messageContent),
            tags: [
              ["group-id", groupSessionId],
              ["message-type", messageType],
              ["sender", getPublicKey(await this.getNsecBytes())],
              ["created", Date.now().toString()],
            ],
            created_at: Math.floor(Date.now() / 1000),
          },
          "", // Group messages are broadcast to all members
          await this.getNsecBytes()
        );
        encryptedContent = JSON.stringify(giftWrappedEvent);
      } else {
        // Use NIP-04 encryption for group
        encryptedContent = await nip04.encrypt(
          JSON.stringify(messageContent),
          "", // Group encryption key would be derived from group session
          await this.getNsecBytes()
        );
      }

      // Publish to relays
      const relays = ["wss://relay.satnam.pub", "wss://nos.lol"];
      await this.publishToRelays(relays, {
        kind: 4,
        content: encryptedContent,
        tags: [
          ["group-id", groupSessionId],
          ["message-type", messageType],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      return await PrivacyUtils.generateEncryptedUUID();
    } catch (error) {
      console.error("Failed to send group message:", error);
      throw new Error("Group message sending failed");
    }
  }

  /**
   * Get nsec bytes for cryptographic operations
   */
  private async getNsecBytes(): Promise<Uint8Array> {
    if (!this.userSession) {
      throw new Error("No active session");
    }

    const nsec = await PrivacyUtils.decryptWithSessionKey(
      this.userSession.encryptedNsec,
      this.userSession.sessionKey
    );

    // Convert hex string to Uint8Array
    const hex = nsec.replace(/^nsec1/, "");
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Publish event to multiple relays
   */
  private async publishToRelays(relays: string[], event: any): Promise<void> {
    const publishPromises = relays.map(async (relay) => {
      try {
        await this.pool.publish(relay, event);
      } catch (error) {
        console.warn(`Failed to publish to ${relay}:`, error);
      }
    });

    await Promise.all(publishPromises);
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      // Close all relay connections
      const relays = ["wss://relay.satnam.pub", "wss://nos.lol"];
      relays.forEach(relay => {
        this.pool.close(relay);
      });

      // Clear sensitive data
      this.contactSessions.clear();
      this.groupSessions.clear();
      this.messageListeners.clear();
    } catch (error) {
      console.error("Cleanup failed:", error);
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
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      const existingContact = this.contactSessions.get(contactSessionId);
      if (!existingContact) {
        return false;
      }

      const updatedContact = { ...existingContact, ...updates };

      // Update in database
      const { error } = await supabase
        .from("privacy_contacts")
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
        .eq("session_id", contactSessionId)
        .eq("user_hash", this.userSession.userHash);

      if (error) {
        console.error("Failed to update contact:", error);
        return false;
      }

      // Update cached contact
      this.contactSessions.set(contactSessionId, updatedContact);

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
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      const { error } = await supabase
        .from("privacy_contacts")
        .delete()
        .eq("session_id", contactSessionId)
        .eq("user_hash", this.userSession.userHash);

      if (error) {
        console.error("Failed to delete contact:", error);
        return false;
      }

      // Remove from cache
      this.contactSessions.delete(contactSessionId);

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
    try {
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
    } catch (error) {
      console.error("Get contact error:", error);
      return null;
    }
  }

  /**
   * Add group member with privacy-first approach
   */
  async addGroupMember(
    groupSessionId: string,
    contactSessionId: string,
    role: "admin" | "member" | "viewer" = "member"
  ): Promise<boolean> {
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      const group = this.groupSessions.get(groupSessionId);
      const contact = this.contactSessions.get(contactSessionId);

      if (!group || !contact) {
        return false;
      }

      // Check if user is admin
      if (!group.adminHashes.includes(this.userSession.userHash)) {
        return false;
      }

      // Create member record
      const memberHash = await PrivacyUtils.hashIdentifier(contactSessionId);
      const memberRecord: PrivacyGroupMember = {
        memberHash,
        displayNameHash: contact.displayNameHash,
        role,
        joinedAt: new Date(),
        invitedByHash: this.userSession.userHash,
      };

      // Store in database
      const { error } = await supabase
        .from("privacy_group_members")
        .upsert({
          group_session_id: groupSessionId,
          member_hash: memberHash,
          display_name_hash: memberRecord.displayNameHash,
          role: memberRecord.role,
          joined_at: memberRecord.joinedAt.toISOString(),
          invited_by_hash: memberRecord.invitedByHash,
        });

      if (error) {
        console.error("Failed to add group member:", error);
        return false;
      }

      // Update group member count
      group.memberCount += 1;
      await this.storeGroupInDatabase(group);

      return true;
    } catch (error) {
      console.error("Add group member error:", error);
      return false;
    }
  }

  /**
   * Remove group member
   */
  async removeGroupMember(
    groupSessionId: string,
    memberHash: string
  ): Promise<boolean> {
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      const group = this.groupSessions.get(groupSessionId);
      if (!group) {
        return false;
      }

      // Check if user is admin
      if (!group.adminHashes.includes(this.userSession.userHash)) {
        return false;
      }

      // Remove from database
      const { error } = await supabase
        .from("privacy_group_members")
        .delete()
        .eq("group_session_id", groupSessionId)
        .eq("member_hash", memberHash);

      if (error) {
        console.error("Failed to remove group member:", error);
        return false;
      }

      // Update group member count
      group.memberCount = Math.max(0, group.memberCount - 1);
      await this.storeGroupInDatabase(group);

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
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      const group = this.groupSessions.get(groupSessionId);
      if (!group) {
        return false;
      }

      // Check if user is admin
      if (!group.adminHashes.includes(this.userSession.userHash)) {
        return false;
      }

      // Update fields
      if (updates.name) {
        group.nameHash = await PrivacyUtils.hashIdentifier(updates.name);
      }
      if (updates.description) {
        group.descriptionHash = await PrivacyUtils.hashIdentifier(updates.description);
      }
      if (updates.groupType) {
        group.groupType = updates.groupType;
      }

      // Store updated group
      await this.storeGroupInDatabase(group);

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
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      const group = this.groupSessions.get(groupSessionId);
      if (!group) {
        return false;
      }

      // Check if user is admin
      if (!group.adminHashes.includes(this.userSession.userHash)) {
        return false;
      }

      // Delete from database
      const { error } = await supabase
        .from("privacy_groups")
        .delete()
        .eq("session_id", groupSessionId)
        .eq("user_hash", this.userSession.userHash);

      if (error) {
        console.error("Failed to delete group:", error);
        return false;
      }

      // Remove from cache
      this.groupSessions.delete(groupSessionId);

      return true;
    } catch (error) {
      console.error("Delete group error:", error);
      return false;
    }
  }

  /**
   * Get groups (returns session IDs only for privacy)
   */
  getGroupSessions(): string[] {
    return Array.from(this.groupSessions.keys());
  }

  /**
   * Get group by session ID
   */
  getGroupBySession(groupSessionId: string): {
    sessionId: string;
    groupType: string;
    memberCount: number;
    encryptionType: string;
    isAdmin: boolean;
  } | null {
    if (!this.userSession) {
      return null;
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
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      // In a real implementation, this would query the database
      // For now, return empty array
      return [];
    } catch (error) {
      console.error("Get group messages error:", error);
      return [];
    }
  }

  /**
   * Decrypt group message
   */
  async decryptGroupMessage(messageSessionId: string): Promise<{
    content: string;
    metadata?: Record<string, any>;
  } | null> {
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      // In a real implementation, this would decrypt the message
      // For now, return null
      return null;
    } catch (error) {
      console.error("Decrypt group message error:", error);
      return null;
    }
  }

  /**
   * Edit group message
   */
  async editGroupMessage(
    messageSessionId: string,
    newContent: string,
    newMetadata?: Record<string, any>
  ): Promise<boolean> {
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      // In a real implementation, this would update the message
      // For now, return false
      return false;
    } catch (error) {
      console.error("Edit group message error:", error);
      return false;
    }
  }

  /**
   * Delete group message
   */
  async deleteGroupMessage(messageSessionId: string): Promise<boolean> {
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      // In a real implementation, this would delete the message
      // For now, return false
      return false;
    } catch (error) {
      console.error("Delete group message error:", error);
      return false;
    }
  }

  /**
   * Start message listener for real-time updates
   */
  async startMessageListener(): Promise<void> {
    try {
      if (!this.userSession) {
        throw new Error("No active session");
      }

      // In a real implementation, this would start listening to relays
      // For now, just log that it's started
      console.log("Message listener started");
    } catch (error) {
      console.error("Start message listener error:", error);
    }
  }

  /**
   * Check rate limit for operations
   */
  private async checkRateLimit(
    key: string,
    maxRequests: number,
    windowMinutes: number = 60
  ): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
    try {
      // In a real implementation, this would check rate limits
      // For now, always allow
      return {
        allowed: true,
        remaining: maxRequests,
        resetTime: new Date(Date.now() + windowMinutes * 60 * 1000),
      };
    } catch (error) {
      console.error("Rate limit check error:", error);
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(),
      };
    }
  }

  /**
   * Log security events
   */
  private async logSecurityEvent(
    eventType: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      // In a real implementation, this would log security events
      console.log("Security event:", eventType, details);
    } catch (error) {
      console.error("Log security event error:", error);
    }
  }

  /**
   * Load user contacts from database
   */
  private async loadUserContacts(): Promise<void> {
    try {
      if (!this.userSession) {
        return;
      }

      const { data, error } = await supabase
        .from("privacy_contacts")
        .select("*")
        .eq("user_hash", this.userSession.userHash);

      if (error) {
        console.error("Failed to load contacts:", error);
        return;
      }

      // Load contacts into memory
      for (const contactData of data || []) {
        const contact: PrivacyContact = {
          sessionId: contactData.session_id,
          encryptedNpub: contactData.encrypted_npub,
          nip05Hash: contactData.nip05_hash,
          displayNameHash: contactData.display_name_hash,
          familyRole: contactData.family_role,
          trustLevel: contactData.trust_level,
          supportsGiftWrap: contactData.supports_gift_wrap,
          preferredEncryption: contactData.preferred_encryption,
          tagsHash: contactData.tags_hash || [],
          addedAt: new Date(contactData.added_at),
          addedByHash: contactData.added_by_hash,
        };
        this.contactSessions.set(contact.sessionId, contact);
      }
    } catch (error) {
      console.error("Load user contacts error:", error);
    }
  }

  /**
   * Load user groups from database
   */
  private async loadUserGroups(): Promise<void> {
    try {
      if (!this.userSession) {
        return;
      }

      const { data, error } = await supabase
        .from("privacy_groups")
        .select("*")
        .eq("user_hash", this.userSession.userHash);

      if (error) {
        console.error("Failed to load groups:", error);
        return;
      }

      // Load groups into memory
      for (const groupData of data || []) {
        const group: PrivacyGroup = {
          sessionId: groupData.session_id,
          nameHash: groupData.name_hash,
          descriptionHash: groupData.description_hash,
          groupType: groupData.group_type,
          memberCount: groupData.member_count,
          adminHashes: groupData.admin_hashes || [],
          encryptionType: groupData.encryption_type,
          createdAt: new Date(groupData.created_at),
          createdByHash: groupData.created_by_hash,
        };
        this.groupSessions.set(group.sessionId, group);
      }
    } catch (error) {
      console.error("Load user groups error:", error);
    }
  }

  /**
   * Static method to cleanup expired sessions
   */
  static async cleanupExpiredSessions(): Promise<number> {
    try {
      const { data, error } = await supabase
        .from("messaging_sessions")
        .delete()
        .lt("expires_at", new Date().toISOString())
        .select("session_id");

      if (error) {
        console.error("Failed to cleanup expired sessions:", error);
        return 0;
      }

      return data?.length || 0;
    } catch (error) {
      console.error("Cleanup expired sessions error:", error);
      return 0;
    }
  }
} 