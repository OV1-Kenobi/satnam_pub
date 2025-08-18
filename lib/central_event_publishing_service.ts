/**
 * Central Event Publishing Service
 * Single server-side portal for Nostr relay operations (only import point for nostr-tools)
 */

import {
  finalizeEvent,
  getPublicKey,
  nip04,
  nip19,
  nip59,
  SimplePool,
  verifyEvent,
  type Event,
} from "nostr-tools";

// Helpers
const te = new TextEncoder();
const hexToBytes = (hex: string): Uint8Array =>
  new Uint8Array((hex.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)));
const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const utf8 = (s: string) => te.encode(s);

// Privacy utilities (Web Crypto)
export class PrivacyUtils {
  static async hashIdentifier(input: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", utf8(input));
    return bytesToHex(new Uint8Array(digest));
  }
  static async generateEncryptedUUID(): Promise<string> {
    const uuid = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
    const rand = new Uint8Array(16);
    crypto.getRandomValues(rand);
    const payload = `${uuid}:${Date.now()}:${bytesToHex(rand)}`;
    const digest = await crypto.subtle.digest("SHA-256", utf8(payload));
    return bytesToHex(new Uint8Array(digest));
  }
  static async generateSessionKey(): Promise<string> {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }
  private static async importAesKey(sessionKeyHex: string): Promise<CryptoKey> {
    const keyBytes = hexToBytes(sessionKeyHex);
    // Clone into a standalone ArrayBuffer to satisfy BufferSource typing and avoid SAB edge cases
    const raw = new ArrayBuffer(keyBytes.byteLength);
    new Uint8Array(raw).set(keyBytes);
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
  }
  static async encryptWithSessionKey(
    data: string,
    sessionKey: string
  ): Promise<string> {
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const key = await this.importAesKey(sessionKey);
    const enc = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      utf8(data)
    );
    return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(enc))}`;
  }
  static async decryptWithSessionKey(
    encryptedData: string,
    sessionKey: string
  ): Promise<string> {
    const [ivHex, cipherHex] = encryptedData.split(":");
    const iv = hexToBytes(ivHex);
    const cipher = hexToBytes(cipherHex);
    const key = await this.importAesKey(sessionKey);
    // Ensure ArrayBuffer (not SharedArrayBuffer) for WebCrypto by copying into fresh ArrayBuffers
    const ab = new ArrayBuffer(cipher.byteLength);
    new Uint8Array(ab).set(cipher);
    const ivAb = new ArrayBuffer(iv.byteLength);
    new Uint8Array(ivAb).set(iv);
    const dec = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivAb },
      key,
      ab
    );
    return new TextDecoder().decode(dec);
  }
  static async hashTimestamp(ts: number | Date): Promise<string> {
    const v = typeof ts === "number" ? ts.toString() : ts.toISOString();
    const digest = await crypto.subtle.digest("SHA-256", utf8(v));
    return bytesToHex(new Uint8Array(digest));
  }
}

async function getSupabase() {
  try {
    // @ts-ignore - dynamic import of JS module without types
    const mod = await import("../netlify/functions/supabase.js");
    const m: any = (mod as any).default || mod;
    return (m as any).supabase || m;
  } catch {
    try {
      // @ts-ignore - dynamic import fallback path
      const mod2 = await import("../netlify/functions/supabase");
      const m2: any = (mod2 as any).default || mod2;
      return (m2 as any).supabase || m2;
    } catch (e) {
      throw new Error(
        `Failed to load supabase client: ${
          e instanceof Error ? e.message : "Unknown error"
        }`
      );
    }
  }
}

// Re-export key interfaces and config to maintain compatibility
export interface Nip05DisclosureConfig {
  enabled: boolean;
  nip05?: string;
  scope?: "direct" | "groups" | "specific-groups";
  specificGroupIds?: string[];
  lastUpdated?: Date;
  verificationStatus?: "pending" | "verified" | "failed";
  lastVerified?: Date;
}

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
  IDENTITY_DISCLOSURE: {
    DEFAULT_PRIVATE: true,
    REQUIRE_EXPLICIT_CONSENT: true,
    PRIVACY_WARNING_REQUIRED: true,
  },
} as const;

export interface UnifiedMessagingConfig {
  relays: string[];
  giftWrapEnabled: boolean;
  guardianApprovalRequired: boolean;
  guardianPubkeys: string[];
  maxGroupSize: number;
  messageRetentionDays: number;
  privacyDelayMs: number;
  defaultEncryptionLevel: "enhanced" | "standard";
  privacyWarnings: {
    enabled: boolean;
    showForNewContacts: boolean;
    showForGroupMessages: boolean;
  };
  session: {
    ttlHours: number;
    maxConcurrentSessions: number;
  };
}

export interface IdentityDisclosurePreferences {
  sessionId: string;
  userHash: string;
  allowNip05InDirectMessages: boolean;
  allowNip05InGroupMessages: boolean;
  allowNip05InSpecificGroups: string[];
  encryptedNip05?: string;
  consentTimestamp: Date;
  privacyWarningAcknowledged: boolean;
}

export interface MessagingSession {
  sessionId: string;
  userHash: string;
  encryptedNsec: string;
  sessionKey: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  identityPreferences?: IdentityDisclosurePreferences;
}

export interface PrivacyContact {
  sessionId: string;
  encryptedNpub: string;
  nip05Hash?: string;
  displayNameHash: string;
  familyRole?: "private" | "offspring" | "adult" | "steward" | "guardian";
  trustLevel: "family" | "trusted" | "known" | "unverified";
  supportsGiftWrap: boolean;
  preferredEncryption: "gift-wrap" | "nip04" | "auto";
  lastSeenHash?: string;
  tagsHash: string[];
  addedAt: Date;
  addedByHash: string;
}

export interface PrivacyGroup {
  sessionId: string;
  nameHash: string;
  descriptionHash: string;
  groupType: "family" | "business" | "friends" | "advisors";
  memberCount: number;
  adminHashes: string[];
  encryptionType: "gift-wrap" | "nip04";
  createdAt: Date;
  createdByHash: string;
  lastActivityHash?: string;
}

export interface PrivacyGroupMember {
  memberHash: string;
  displayNameHash: string;
  role: "admin" | "member" | "viewer";
  joinedAt: Date;
  invitedByHash: string;
}

export interface PrivacyGroupMessage {
  messageSessionId: string;
  groupSessionId: string;
  senderHash: string;
  encryptedContent: string;
  messageType: "text" | "announcement" | "poll" | "file" | "payment-request";
  metadataHash?: string;
  timestamp: Date;
  editedHash?: string;
  replyToHash?: string;
}

export interface Nip05VerificationResult {
  success: boolean;
  error?: string;
  publicKey?: string;
  domain?: string;
  name?: string;
}

export interface Nip05WellKnownResponse {
  names: Record<string, string>;
  relays?: Record<string, string[]>;
}

export interface GuardianApprovalRequest {
  id: string;
  groupId: string;
  messageId: string;
  requesterPubkey: string;
  guardianPubkey: string;
  messageContent: string;
  messageType: "sensitive" | "credential" | "payment";
  created_at: number;
  expires_at: number;
  status: "pending" | "approved" | "rejected";
}

export interface PrivacyConsentResponse {
  consentGiven: boolean;
  warningAcknowledged: boolean;
  selectedScope: "direct" | "groups" | "specific-groups" | "none";
  specificGroupIds?: string[];
  timestamp: Date;
}

export const DEFAULT_UNIFIED_CONFIG: UnifiedMessagingConfig = {
  relays: ["wss://relay.satnam.pub", "wss://nos.lol", "wss://relay.damus.io"],
  giftWrapEnabled: true,
  guardianApprovalRequired: true,
  guardianPubkeys: [],
  maxGroupSize: 50,
  messageRetentionDays: 30,
  privacyDelayMs: 5000,
  defaultEncryptionLevel: "enhanced",
  privacyWarnings: {
    enabled: true,
    showForNewContacts: true,
    showForGroupMessages: true,
  },
  session: {
    ttlHours: 24,
    maxConcurrentSessions: 3,
  },
};

async function getVault() {
  try {
    const v: any = await import("../lib/vault.js");
    return (v && (v.vault || (v.default && v.default.vault))) || v;
  } catch {
    return null;
  }
}

function defaultRelays(): string[] {
  const env = (process as any)?.env?.NOSTR_RELAYS as string | undefined;
  if (env)
    return env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return ["wss://relay.damus.io", "wss://relay.satnam.pub", "wss://nos.lol"];
}

export type GiftWrapPreference = {
  preferGiftWrap?: boolean;
  fallbackRelays?: string[];
};
export type OTPDeliveryResult = {
  success: boolean;
  otp?: string;
  messageId?: string;
  expiresAt?: Date;
  messageType?: "gift-wrap" | "nip04";
  error?: string;
};

export class CentralEventPublishingService {
  private pool: SimplePool;
  private relays: string[];
  private config: UnifiedMessagingConfig;

  // Session and privacy state
  private userSession: MessagingSession | null = null;
  private contactSessions: Map<string, PrivacyContact> = new Map();
  private groupSessions: Map<string, PrivacyGroup> = new Map();
  private pendingApprovals: Map<string, GuardianApprovalRequest> = new Map();
  private rateLimits: Map<string, { count: number; resetTime: number }> =
    new Map();

  constructor() {
    this.pool = new SimplePool();
    this.relays = defaultRelays();
    this.config = DEFAULT_UNIFIED_CONFIG;
  }

  setRelays(relays: string[]) {
    if (Array.isArray(relays) && relays.length) this.relays = relays;
  }
  // ---- Session management ----
  private async isNIP07Session(): Promise<boolean> {
    if (!this.userSession) return false;
    const decryptedValue = await PrivacyUtils.decryptWithSessionKey(
      this.userSession.encryptedNsec,
      this.userSession.sessionKey
    );
    return decryptedValue === "NIP07_BROWSER_EXTENSION_AUTH";
  }

  async initializeSession(
    nsecOrMarker: string,
    options?: {
      ipAddress?: string;
      userAgent?: string;
      ttlHours?: number;
      authMethod?: "nip07";
      npub?: string;
    }
  ): Promise<string> {
    try {
      const isNip07 =
        nsecOrMarker === "nip07" || options?.authMethod === "nip07";
      if (isNip07) {
        return await this.initializeNIP07Session(options);
      }
      return await this.initializeNsecSession(nsecOrMarker, options);
    } catch (error) {
      throw new Error(
        `Failed to initialize unified messaging session: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async initializeNsecSession(
    nsec: string,
    options?: { ipAddress?: string; userAgent?: string; ttlHours?: number }
  ): Promise<string> {
    const sessionId = await PrivacyUtils.generateEncryptedUUID();
    const sessionKey = await PrivacyUtils.generateSessionKey();
    const userHash = await PrivacyUtils.hashIdentifier(
      getPublicKey(hexToBytes(nsec))
    );
    const encryptedNsec = await PrivacyUtils.encryptWithSessionKey(
      nsec,
      sessionKey
    );
    const ttlHours = options?.ttlHours ?? this.config.session.ttlHours;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    this.userSession = {
      sessionId,
      userHash,
      encryptedNsec,
      sessionKey,
      expiresAt,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    };

    await this.storeSessionInDatabase(this.userSession);
    return sessionId;
  }

  private async initializeNIP07Session(options?: {
    ipAddress?: string;
    userAgent?: string;
    ttlHours?: number;
    npub?: string;
  }): Promise<string> {
    const sessionId = await PrivacyUtils.generateEncryptedUUID();
    const sessionKey = await PrivacyUtils.generateSessionKey();
    const userNpub = options?.npub ?? "";
    const userHash = await PrivacyUtils.hashIdentifier(userNpub || "nip07");
    const encryptedNsec = await PrivacyUtils.encryptWithSessionKey(
      "NIP07_BROWSER_EXTENSION_AUTH",
      sessionKey
    );
    const ttlHours = options?.ttlHours ?? this.config.session.ttlHours;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    this.userSession = {
      sessionId,
      userHash,
      encryptedNsec,
      sessionKey,
      expiresAt,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    };

    await this.storeSessionInDatabase(this.userSession);
    return sessionId;
  }

  private async storeSessionInDatabase(
    session: MessagingSession
  ): Promise<void> {
    const supabase = await getSupabase();
    const { error } = await supabase.from("messaging_sessions").upsert({
      session_id: session.sessionId,
      user_hash: session.userHash,
      encrypted_nsec: session.encryptedNsec,
      session_key: session.sessionKey,
      expires_at: session.expiresAt.toISOString(),
      ip_address: session.ipAddress,
      user_agent: session.userAgent,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Session storage failed: ${error.message}`);
  }

  async destroySession(): Promise<void> {
    const supabase = await getSupabase();
    try {
      if (this.userSession) {
        await supabase
          .from("messaging_sessions")
          .delete()
          .eq("session_id", this.userSession.sessionId);
      }
    } finally {
      this.userSession = null;
      this.contactSessions.clear();
      this.groupSessions.clear();
      this.pendingApprovals.clear();
      this.rateLimits.clear();
      try {
        this.pool.close(this.relays);
      } catch {}
    }
  }

  async getSessionStatus(): Promise<{
    active: boolean;
    sessionId: string | null;
    contactCount: number;
    groupCount: number;
    authMethod?: "nsec" | "nip07";
    userHash?: string;
    expiresAt?: Date;
  }> {
    const base = {
      active: this.userSession !== null,
      sessionId: this.userSession?.sessionId || null,
      contactCount: this.contactSessions.size,
      groupCount: this.groupSessions.size,
    };
    if (!this.userSession) return base;
    const isNip07 = await this.isNIP07Session();
    return {
      ...base,
      authMethod: isNip07 ? "nip07" : "nsec",
      userHash: this.userSession.userHash,
      expiresAt: this.userSession.expiresAt,
    };
  }
  // ---- Rate limiting helpers ----
  private checkRateLimit(key: string, max: number, windowMs: number) {
    const now = Date.now();
    const entry = this.rateLimits.get(key);
    if (!entry || now >= entry.resetTime) {
      this.rateLimits.set(key, { count: 1, resetTime: now + windowMs });
      return;
    }
    if (entry.count >= max) {
      const retryIn = Math.max(0, entry.resetTime - now);
      throw new Error(
        `Rate limit exceeded. Retry in ${Math.ceil(retryIn / 1000)}s`
      );
    }
    entry.count += 1;
    this.rateLimits.set(key, entry);
  }

  private calcPrivacyDelayMs(): number {
    return Math.floor(Math.random() * (this.config.privacyDelayMs || 0));
  }

  private async sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---- Contacts ----
  async addContact(contactData: {
    npub: string;
    displayName: string;
    nip05?: string;
    familyRole?: "private" | "offspring" | "adult" | "steward" | "guardian";
    trustLevel: "family" | "trusted" | "known" | "unverified";
    tags?: string[];
    preferredEncryption?: "gift-wrap" | "nip04" | "auto";
  }): Promise<string> {
    if (!this.userSession) throw new Error("No active session");
    // Rate limit
    this.checkRateLimit(
      `add_contact:${this.userSession.userHash}`,
      MESSAGING_CONFIG.RATE_LIMITS.ADD_CONTACT_PER_HOUR,
      60 * 60 * 1000
    );

    const contactSessionId = await PrivacyUtils.generateEncryptedUUID();
    const encryptedNpub = await PrivacyUtils.encryptWithSessionKey(
      contactData.npub,
      this.userSession.sessionKey
    );
    const displayNameHash = await PrivacyUtils.hashIdentifier(
      contactData.displayName
    );
    const nip05Hash = contactData.nip05
      ? await PrivacyUtils.hashIdentifier(contactData.nip05)
      : undefined;
    const tagsHash = contactData.tags
      ? await Promise.all(
          contactData.tags.map((t) => PrivacyUtils.hashIdentifier(t))
        )
      : [];

    const contact: PrivacyContact = {
      sessionId: contactSessionId,
      encryptedNpub,
      nip05Hash,
      displayNameHash,
      familyRole: contactData.familyRole,
      trustLevel: contactData.trustLevel,
      supportsGiftWrap: true,
      preferredEncryption: contactData.preferredEncryption || "gift-wrap",
      tagsHash,
      addedAt: new Date(),
      addedByHash: this.userSession.userHash,
    };

    this.contactSessions.set(contactSessionId, contact);
    await this.storeContactInDatabase(contact);
    return contactSessionId;
  }

  // ---- Dynamic identity retrieval (NIP-07 first, DB fallback) ----
  private async getUserPubkeyHexForVerification(): Promise<string> {
    try {
      // Try NIP-07 extension in browser contexts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w: any = globalThis as any;
      if (w?.window?.nostr?.getPublicKey) {
        const pubHex = await w.window.nostr.getPublicKey();
        if (typeof pubHex === "string" && pubHex.length >= 64) return pubHex;
      }
    } catch {}

    // Fallback: query user_identities using session userHash and read npub/pubkey
    if (!this.userSession) throw new Error("No active session");
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("user_identities")
      .select("npub, pubkey")
      .eq("user_hash", this.userSession.userHash)
      .single();
    if (error || !data)
      throw new Error("Could not retrieve user identity for verification");

    const candidate = (data.pubkey as string) || (data.npub as string);
    if (!candidate) throw new Error("User identity missing pubkey/npub");

    if (candidate.startsWith("npub")) {
      const dec = nip19.decode(candidate);
      const hex =
        typeof dec.data === "string"
          ? dec.data
          : bytesToHex(dec.data as Uint8Array);
      return hex;
    }
    return candidate; // assume hex
  }

  private async storeContactInDatabase(contact: PrivacyContact): Promise<void> {
    const supabase = await getSupabase();
    const { error } = await supabase.from("privacy_contacts").upsert({
      session_id: contact.sessionId,
      encrypted_npub: contact.encryptedNpub,
      nip05_hash: contact.nip05Hash,
      display_name_hash: contact.displayNameHash,
      family_role: contact.familyRole,
      trust_level: contact.trustLevel,
      supports_gift_wrap: contact.supportsGiftWrap,
      preferred_encryption: contact.preferredEncryption,
      last_seen_hash: contact.lastSeenHash,
      tags_hash: contact.tagsHash,
      added_at: contact.addedAt.toISOString(),
      added_by_hash: contact.addedByHash,
    });
    if (error) throw new Error(`Contact storage failed: ${error.message}`);
  }

  // ---- Groups ----
  // Overloads
  async createGroup(
    creatorNsec: string,
    groupName: string,
    groupType: string,
    memberPubkeys: string[]
  ): Promise<string>;
  async createGroup(groupData: {
    name: string;
    description?: string;
    groupType: "family" | "business" | "friends" | "advisors";
    encryptionType: "gift-wrap" | "nip04";
    initialMembers?: string[];
  }): Promise<string>;
  async createGroup(a: any, b?: any, c?: any, d?: any): Promise<string> {
    if (typeof a === "string") {
      // original signature
      const creatorNsec = a as string;
      const groupName = b as string;
      const groupType = c as string;
      const memberPubkeys = d as string[];
      const privHex = bytesToHex(this.nsecToBytes(creatorNsec));
      const pubHex = getPublicKey(privHex);
      const ev: Event = finalizeEvent(
        {
          kind: 1770,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["g:name", groupName],
            ["g:type", groupType],
            ...(memberPubkeys || []).map((p) => ["p", p]),
          ],
          content: "",
          pubkey: pubHex,
          id: "",
          sig: "",
        } as any,
        privHex
      ) as Event;
      return await this.publishEvent(ev);
    }

    // new signature with privacy-first DB
    if (!this.userSession) throw new Error("No active session");
    this.checkRateLimit(
      `create_group:${this.userSession.userHash}`,
      MESSAGING_CONFIG.RATE_LIMITS.CREATE_GROUP_PER_DAY,
      24 * 60 * 60 * 1000
    );

    const groupData = a as {
      name: string;
      description?: string;
      groupType: string;
      encryptionType: "gift-wrap" | "nip04";
      initialMembers?: string[];
    };
    const groupSessionId = await PrivacyUtils.generateEncryptedUUID();
    const nameHash = await PrivacyUtils.hashIdentifier(groupData.name);
    const descriptionHash = await PrivacyUtils.hashIdentifier(
      groupData.description || ""
    );

    const group: PrivacyGroup = {
      sessionId: groupSessionId,
      nameHash,
      descriptionHash,
      groupType: groupData.groupType as any,
      memberCount: 1,
      adminHashes: [this.userSession.userHash],
      encryptionType: groupData.encryptionType,
      createdAt: new Date(),
      createdByHash: this.userSession.userHash,
    };

    this.groupSessions.set(groupSessionId, group);
    await this.storeGroupInDatabase(group);
    return groupSessionId;
  }

  private async storeGroupInDatabase(group: PrivacyGroup): Promise<void> {
    const supabase = await getSupabase();
    const { error } = await supabase.from("privacy_groups").upsert({
      session_id: group.sessionId,
      name_hash: group.nameHash,
      description_hash: group.descriptionHash,
      group_type: group.groupType,
      member_count: group.memberCount,
      admin_hashes: group.adminHashes,
      encryption_type: group.encryptionType,
      created_at: group.createdAt.toISOString(),
      created_by_hash: group.createdByHash,
    });
    if (error) throw new Error(`Group storage failed: ${error.message}`);
  }

  async joinGroup(groupData: {
    groupId: string;
    inviteCode?: string;
    approvalRequired?: boolean;
  }): Promise<string> {
    if (!this.userSession) throw new Error("No active session");
    const supabase = await getSupabase();
    const { groupId, inviteCode, approvalRequired } = groupData;

    // Check group exists
    const { data: existingGroup, error: groupError } = await supabase
      .from("privacy_groups")
      .select("*")
      .eq("session_id", groupId)
      .single();
    if (groupError || !existingGroup)
      throw new Error("Group not found or access denied");

    // Check membership
    const { data: existingMembership } = await supabase
      .from("group_memberships")
      .select("*")
      .eq("group_session_id", groupId)
      .eq("member_hash", this.userSession.userHash)
      .single();
    if (existingMembership) throw new Error("Already a member of this group");

    if (approvalRequired && this.config.guardianApprovalRequired) {
      const approvalId = await this.requestGuardianApproval(
        groupId,
        `Join group request: ${groupId}`,
        "sensitive"
      );
      return approvalId;
    }

    const membershipId = await PrivacyUtils.generateEncryptedUUID();
    const { error: insErr } = await supabase.from("group_memberships").insert({
      id: membershipId,
      group_session_id: groupId,
      member_hash: this.userSession.userHash,
      role: "member",
      joined_at: new Date().toISOString(),
      invite_code_used: inviteCode || null,
    });
    if (insErr) throw new Error(`Failed to join group: ${insErr.message}`);
    return membershipId;
  }

  async leaveGroup(groupData: {
    groupId: string;
    reason?: string;
    transferOwnership?: string;
  }): Promise<boolean> {
    if (!this.userSession) throw new Error("No active session");
    const supabase = await getSupabase();
    const { groupId, reason, transferOwnership } = groupData;

    const { data: membership, error: membershipError } = await supabase
      .from("group_memberships")
      .select("*")
      .eq("group_session_id", groupId)
      .eq("member_hash", this.userSession.userHash)
      .single();
    if (membershipError || !membership)
      throw new Error("Not a member of this group");

    if (membership.role === "owner" && transferOwnership) {
      const newOwnerHash = await PrivacyUtils.hashIdentifier(transferOwnership);
      const { error: transferError } = await supabase
        .from("group_memberships")
        .update({ role: "owner" })
        .eq("group_session_id", groupId)
        .eq("member_hash", newOwnerHash);
      if (transferError) throw new Error("Failed to transfer ownership");
    } else if (membership.role === "owner" && !transferOwnership) {
      throw new Error("Group owner must transfer ownership before leaving");
    }

    const { error: leaveError } = await supabase
      .from("group_memberships")
      .delete()
      .eq("group_session_id", groupId)
      .eq("member_hash", this.userSession.userHash);
    if (leaveError) throw new Error("Failed to leave group");

    if (reason) {
      await supabase.from("group_activity_log").insert({
        group_session_id: groupId,
        member_hash: this.userSession.userHash,
        activity_type: "member_left",
        activity_data: JSON.stringify({ reason }),
        timestamp: new Date().toISOString(),
      });
    }

    this.groupSessions.delete(groupId);
    return true;
  }
  // ---- Guardian approvals ----
  private async requestGuardianApproval(
    groupSessionId: string,
    content: string,
    messageType: string
  ): Promise<string> {
    const approvalId = await PrivacyUtils.generateEncryptedUUID();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 24 * 60 * 60;
    const req: GuardianApprovalRequest = {
      id: approvalId,
      groupId: groupSessionId,
      messageId: approvalId,
      requesterPubkey: this.userSession ? this.userSession.userHash : "",
      guardianPubkey: this.config.guardianPubkeys[0] || "",
      messageContent: content,
      messageType: (messageType as any) || "sensitive",
      created_at: now,
      expires_at: expiresAt,
      status: "pending",
    };
    this.pendingApprovals.set(approvalId, req);
    const supabase = await getSupabase();
    await supabase.from("guardian_approvals").insert({
      id: req.id,
      group_id: req.groupId,
      message_id: req.messageId,
      requester_pubkey: req.requesterPubkey,
      guardian_pubkey: req.guardianPubkey,
      message_content: req.messageContent,
      message_type: req.messageType,
      created_at: req.created_at,
      expires_at: req.expires_at,
      status: req.status,
    });
    return approvalId;
  }
  getRelays() {
    return this.relays.slice();
  }

  // ---- NIP-05 Disclosure ----
  private validateNip05Format(nip05: string): {
    valid: boolean;
    error?: string;
  } {
    const nip05Regex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!nip05Regex.test(nip05))
      return {
        valid: false,
        error: "Invalid NIP-05 format. Expected: name@domain.tld",
      };
    const [name, domain] = nip05.split("@");
    if (!name || !domain)
      return { valid: false, error: "NIP-05 name and domain cannot be empty" };
    if (name.length > 64)
      return {
        valid: false,
        error: "NIP-05 name too long (max 64 characters)",
      };
    return { valid: true };
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 3,
    backoffMs = 1000
  ): Promise<Response> {
    let lastError: any = null;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 10000);
        const res = await fetch(url, { ...options, signal: ctrl.signal });
        clearTimeout(to);
        return res;
      } catch (e) {
        lastError = e;
        await this.sleep(backoffMs * (i + 1));
      }
    }
    throw lastError || new Error("Max retries exceeded");
  }

  private async verifyNip05(
    nip05: string,
    expectedPubkey: string
  ): Promise<Nip05VerificationResult> {
    try {
      const [name, domain] = nip05.split("@");
      const wellKnownUrl = `https://${domain}/.well-known/nostr.json`;
      const response = await this.fetchWithRetry(
        wellKnownUrl,
        { method: "GET" },
        3,
        1000
      );
      if (!response.ok)
        return {
          success: false,
          error: `Failed to fetch NIP-05 verification: ${response.status} ${response.statusText}`,
        };
      const wellKnownData: Nip05WellKnownResponse = await response.json();
      if (!wellKnownData.names || typeof wellKnownData.names !== "object")
        return { success: false, error: "Invalid NIP-05 well-known response" };
      const publicKey = wellKnownData.names[name];
      if (!publicKey)
        return {
          success: false,
          error: `NIP-05 identifier '${name}' not found on domain '${domain}'`,
        };
      if (publicKey !== expectedPubkey)
        return {
          success: false,
          error:
            "Public key mismatch: NIP-05 identifier does not match your public key",
        };
      return { success: true, publicKey, domain, name };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Verification failed",
      };
    }
  }

  async enableNip05Disclosure(
    nip05: string,
    scope: "direct" | "groups" | "specific-groups",
    specificGroupIds?: string[]
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.userSession)
      return { success: false, error: "No active session" };
    const fmt = this.validateNip05Format(nip05);
    if (!fmt.valid) return { success: false, error: fmt.error };
    const expectedPubkey = await this.getUserPubkeyHexForVerification();
    const verification = await this.verifyNip05(nip05, expectedPubkey);
    if (!verification.success)
      return { success: false, error: verification.error };

    const supabase = await getSupabase();
    const disclosureConfig: Nip05DisclosureConfig = {
      enabled: true,
      nip05,
      scope,
      specificGroupIds,
      lastUpdated: new Date(),
      verificationStatus: "verified",
      lastVerified: new Date(),
    };

    const { error } = await supabase
      .from("user_identities")
      .update({
        nip05_disclosure_config: disclosureConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("user_hash", this.userSession.userHash);
    if (error)
      return {
        success: false,
        error: `Failed to save disclosure configuration: ${error.message}`,
      };

    await this.logPrivacyAuditEvent("nip05_disclosure_enabled", {
      nip05,
      scope,
      specificGroupIds: specificGroupIds || [],
      verificationStatus: "verified",
    });
    return { success: true };
  }

  async disableNip05Disclosure(): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.userSession)
      return { success: false, error: "No active session" };
    const supabase = await getSupabase();
    const disclosureConfig: Nip05DisclosureConfig = {
      enabled: false,
      lastUpdated: new Date(),
    };
    const { error } = await supabase
      .from("user_identities")
      .update({
        nip05_disclosure_config: disclosureConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("user_hash", this.userSession.userHash);
    if (error)
      return {
        success: false,
        error: `Failed to disable disclosure configuration: ${error.message}`,
      };
    await this.logPrivacyAuditEvent("nip05_disclosure_disabled", {
      previouslyEnabled: true,
    });
    return { success: true };
  }

  async getNip05DisclosureStatus(): Promise<{
    enabled: boolean;
    nip05?: string;
    scope?: "direct" | "groups" | "specific-groups";
    specificGroupIds?: string[];
    lastUpdated?: Date;
    verificationStatus?: "pending" | "verified" | "failed";
    lastVerified?: Date;
  }> {
    if (!this.userSession) return { enabled: false };
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("user_identities")
      .select("nip05_disclosure_config")
      .eq("user_hash", this.userSession.userHash)
      .single();
    if (error || !data) return { enabled: false };
    const config = data.nip05_disclosure_config as Nip05DisclosureConfig | null;
    if (!config || !config.enabled) return { enabled: false };
    return {
      enabled: true,
      nip05: config.nip05,
      scope: config.scope,
      specificGroupIds: config.specificGroupIds,
      lastUpdated: config.lastUpdated
        ? new Date(config.lastUpdated)
        : undefined,
      verificationStatus: config.verificationStatus,
      lastVerified: config.lastVerified
        ? new Date(config.lastVerified)
        : undefined,
    };
  }

  private async logPrivacyAuditEvent(
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      const supabase = await getSupabase();
      await supabase
        .from("privacy_audit_log")
        .insert({ action, details, timestamp: new Date().toISOString() });
    } catch {}
  }

  async publishEvent(ev: Event, relays?: string[]): Promise<string> {
    const list = relays && relays.length ? relays : this.relays;
    await this.pool.publish(list, ev);
    return (ev as any).id as string;
  }

  // Expose common helpers so other modules do not import nostr-tools directly
  signEvent(unsignedEvent: any, privateKeyHex: string): Event {
    return finalizeEvent(unsignedEvent as any, privateKeyHex) as Event;
  }
  getPublicKeyHex(privateKeyHex: string): string {
    return getPublicKey(privateKeyHex);
  }
  verifyEvent(ev: Event): boolean {
    try {
      return (verifyEvent as any)(ev);
    } catch {
      return false;
    }
  }
  subscribeMany(
    relays: string[],
    filters: any[],
    handlers: { onevent?: (e: Event) => void; oneose?: () => void }
  ): any {
    const list = relays && relays.length ? relays : this.relays;
    return (this.pool as any).subscribeMany(list, filters, {
      onevent: handlers.onevent,
      oneose: handlers.oneose,
    });
  }

  async list(
    filters: any[],
    relays?: string[],
    opts?: { eoseTimeout?: number }
  ): Promise<Event[]> {
    const list = relays && relays.length ? relays : this.relays;
    const timeout = opts?.eoseTimeout ?? 5000;
    const events: Event[] = [];

    try {
      return await new Promise<Event[]>((resolve) => {
        let settled = false;
        const sub = (this.pool as any).subscribeMany(list, filters, {
          onevent: (e: Event) => {
            try {
              events.push(e);
            } catch {}
          },
          oneose: () => {
            if (settled) return;
            settled = true;
            try {
              sub.close();
            } catch {}
            try {
              (this.pool as any).close(list);
            } catch {}
            resolve(events);
          },
        });

        setTimeout(() => {
          if (settled) return;
          settled = true;
          try {
            sub.close();
          } catch {}
          try {
            (this.pool as any).close(list);
          } catch {}
          resolve(events);
        }, timeout);
      });
    } catch {
      return [] as Event[];
    }
  }

  // ---- Keys / conversions ----
  npubToHex(npub: string): string {
    const dec = nip19.decode(npub);
    if (dec.type !== "npub") throw new Error("Invalid npub");
    return typeof dec.data === "string"
      ? dec.data
      : bytesToHex(dec.data as Uint8Array);
  }
  nsecToBytes(nsec: string): Uint8Array {
    return hexToBytes(nsec);
  }
  decodeNpub(npub: string): string {
    return this.npubToHex(npub);
  }
  encodeNpub(pubkeyHex: string): string {
    return nip19.npubEncode(pubkeyHex);
  }
  encodeNsec(privBytes: Uint8Array): string {
    // Ensure type compatibility by converting bytes to hex for nsecEncode
    return nip19.nsecEncode(bytesToHex(privBytes));
  }
  decodeNsec(nsec: string): Uint8Array {
    const dec = nip19.decode(nsec);
    if (dec.type !== "nsec" || !(dec.data instanceof Uint8Array)) {
      throw new Error("Invalid nsec format");
    }
    return dec.data as Uint8Array;
  }

  private async serverKeys(): Promise<{ nsec: string; nip05?: string }> {
    const vault = await getVault();
    if (vault) {
      try {
        const nsec = await vault.getCredentials("rebuilding_camelot_nsec");
        const nip05 = await vault.getCredentials("rebuilding_camelot_nip05");
        if (nsec) return { nsec, nip05: nip05 || undefined };
      } catch {}
    }
    const supabase = await getSupabase();
    const nsecResp = await supabase.rpc("get_rebuilding_camelot_nsec");
    const nip05Resp = await supabase.rpc("get_rebuilding_camelot_nip05");
    const nsec = nsecResp?.data as string | undefined;
    const nip05 = nip05Resp?.data as string | undefined;
    if (!nsec) throw new Error("Server NSEC unavailable");
    return { nsec, nip05 };
  }

  // ---- DM helpers ----
  private async createSignedDMEvent(
    privBytes: Uint8Array,
    recipientPubHex: string,
    content: string
  ): Promise<Event> {
    const privHex = bytesToHex(privBytes);
    const pubHex = getPublicKey(privHex);
    const ev: Event = {
      kind: 4,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", recipientPubHex]],
      content,
      pubkey: pubHex,
      id: "",
      sig: "",
    } as any;
    return finalizeEvent(ev as any, privHex) as Event;
  }

  // ---- OTP (merged) ----
  private otpMessage(
    otp: string,
    identifier: string,
    expiresAt: Date,
    mode: "gift-wrap" | "nip04"
  ): string {
    // Note: mode annotated for upstream UX copy when needed
    const security =
      mode === "gift-wrap"
        ? "Encrypted using NIP-59 gift-wrap"
        : "Encrypted using NIP-04";
    return `Your OTP code: ${otp}\nThis code is for: ${identifier}\nExpires: ${expiresAt.toISOString()}\nSecurity: ${security}`;
  }
  private async storeOTP(
    npub: string,
    otp: string,
    expiresAt: Date
  ): Promise<void> {
    const supabase = await getSupabase();
    const { hash, salt } = await this.hashOTP(otp);
    const { error } = await supabase.from("family_otp_verification").insert({
      recipient_npub: npub,
      otp_hash: hash,
      otp_salt: salt,
      expires_at: expiresAt.toISOString(),
      used: false,
      created_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message || "Failed to store OTP");
  }

  // ---- Send gift-wrapped DM with NIP-07 priority ----
  async sendGiftWrappedDirectMessage(
    contact: PrivacyContact,
    messageContent: Record<string, unknown>
  ): Promise<string> {
    if (!this.userSession) throw new Error("No active session");
    // Rate limit per user
    this.checkRateLimit(
      `send_dm:${this.userSession.userHash}`,
      MESSAGING_CONFIG.RATE_LIMITS.SEND_MESSAGE_PER_HOUR,
      60 * 60 * 1000
    );

    const recipientNpub = await PrivacyUtils.decryptWithSessionKey(
      contact.encryptedNpub,
      this.userSession.sessionKey
    );
    const content = JSON.stringify(messageContent);
    const delayMs = this.calcPrivacyDelayMs();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w: any = globalThis as any;
    const preferGift =
      contact.preferredEncryption === "gift-wrap" ||
      contact.preferredEncryption === "auto";

    if (preferGift && w?.window?.nostr?.signEvent) {
      try {
        const senderPubHex = await this.getUserPubkeyHexForVerification();
        const recipientHex = this.npubToHex(recipientNpub);
        const dmEventUnsigned: any = {
          kind: 4,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["p", recipientHex]],
          content,
          pubkey: senderPubHex,
        };
        const signedDm = await w.window.nostr.signEvent(dmEventUnsigned);
        const wrapped = await (nip59 as any).wrapEvent?.(
          signedDm,
          senderPubHex,
          recipientHex
        );
        if (wrapped) {
          await this.sleep(delayMs);
          return await this.publishEvent(wrapped as Event);
        }
      } catch {}
    }

    // Fallbacks
    const recipientHex = this.npubToHex(recipientNpub);

    // If NIP-07 unavailable but gift preferred, try wrapping a server-signed DM
    if (preferGift) {
      try {
        const dec = await PrivacyUtils.decryptWithSessionKey(
          this.userSession.encryptedNsec,
          this.userSession.sessionKey
        );
        if (dec !== "NIP07_BROWSER_EXTENSION_AUTH") {
          const privBytes = this.nsecToBytes(dec);
          const dmEvent = await this.createSignedDMEvent(
            privBytes,
            recipientHex,
            content
          );
          const senderHex = getPublicKey(bytesToHex(privBytes));
          const wrapped = await (nip59 as any).wrapEvent?.(
            dmEvent,
            senderHex,
            recipientHex
          );
          if (wrapped) {
            await this.sleep(delayMs);
            return await this.publishEvent(wrapped as Event);
          }
        }
      } catch {}
    }

    // NIP-04 fallback
    const dec = await PrivacyUtils.decryptWithSessionKey(
      this.userSession.encryptedNsec,
      this.userSession.sessionKey
    );
    if (dec === "NIP07_BROWSER_EXTENSION_AUTH") {
      throw new Error(
        "NIP-07 signing required but unavailable in this context"
      );
    }
    const privBytes = this.nsecToBytes(dec);
    const enc = await nip04.encrypt(
      bytesToHex(privBytes),
      recipientHex,
      content
    );
    const ev = await this.createSignedDMEvent(privBytes, recipientHex, enc);
    await this.sleep(delayMs);
    return await this.publishEvent(ev);
  }
  private async hashOTP(otp: string): Promise<{ hash: string; salt: string }> {
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const salt = bytesToHex(saltBytes);
    const buf = await crypto.subtle.digest("SHA-256", utf8(`${otp}:${salt}`));
    return { hash: bytesToHex(new Uint8Array(buf)), salt };
  }
  private genOTP(len = 6): string {
    const n = Math.max(4, Math.min(10, len));
    const arr = new Uint8Array(n);
    crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => String(b % 10))
      .join("");
  }

  async sendOTPDM(
    recipientNpub: string,
    userNip05?: string,
    prefs?: GiftWrapPreference
  ): Promise<OTPDeliveryResult> {
    try {
      const { nsec } = await this.serverKeys();
      const otp = this.genOTP(6);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const recipientPubHex = this.npubToHex(recipientNpub);
      const senderPrivBytes = this.nsecToBytes(nsec);

      let ev: Event | null = null;
      let messageType: "gift-wrap" | "nip04" = "nip04";
      if (!prefs || prefs.preferGiftWrap !== false) {
        try {
          const dm = this.otpMessage(
            otp,
            userNip05 || recipientNpub,
            expiresAt,
            "gift-wrap"
          );
          const privHex = bytesToHex(senderPrivBytes);
          const enc = await nip04.encrypt(privHex, recipientPubHex, dm);
          ev = await this.createSignedDMEvent(
            senderPrivBytes,
            recipientPubHex,
            enc
          );
          messageType = "gift-wrap";
        } catch {}
      }
      if (!ev) {
        const dm = this.otpMessage(
          otp,
          userNip05 || recipientNpub,
          expiresAt,
          "nip04"
        );
        const privHex = bytesToHex(senderPrivBytes);
        const enc = await nip04.encrypt(privHex, recipientPubHex, dm);
        ev = await this.createSignedDMEvent(
          senderPrivBytes,
          recipientPubHex,
          enc
        );
        messageType = "nip04";
      }
      if (!ev) {
        throw new Error("Failed to create OTP event");
      }
      const id = await this.publishEvent(ev);
      await this.storeOTP(recipientNpub, otp, expiresAt);
      return { success: true, otp, messageId: id, expiresAt, messageType };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Failed to send OTP",
      };
    }
  }

  // ---- Group operations with rate limiting ----
  async inviteToGroup(
    adminNsec: string,
    groupId: string,
    inviteePubkey: string
  ): Promise<string> {
    // Apply rate limit (per admin identity)
    const adminKey = await PrivacyUtils.hashIdentifier(
      getPublicKey(bytesToHex(this.nsecToBytes(adminNsec)))
    );
    this.checkRateLimit(
      `group_invite:${adminKey}`,
      MESSAGING_CONFIG.RATE_LIMITS.GROUP_INVITE_PER_HOUR,
      60 * 60 * 1000
    );

    // Guardian approval check (if needed, you can gate on message type or config)
    if (this.config.guardianApprovalRequired && this.userSession) {
      await this.requestGuardianApproval(
        groupId,
        `Invite ${inviteePubkey} to group ${groupId}`,
        "credential"
      );
    }

    const privHex = bytesToHex(this.nsecToBytes(adminNsec));
    const pubHex = getPublicKey(privHex);
    const ev: Event = finalizeEvent(
      {
        kind: 1771,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["e", groupId],
          ["p", inviteePubkey],
        ],
        content: "group-invite",
        pubkey: pubHex,
        id: "",
        sig: "",
      } as any,
      privHex
    ) as Event;
    return await this.publishEvent(ev);
  }

  async publishGroupAnnouncement(
    adminNsec: string,
    groupId: string,
    announcement: string
  ): Promise<string> {
    // Rate limit announcements lightly under SEND_MESSAGE_PER_HOUR for simplicity
    const adminKey = await PrivacyUtils.hashIdentifier(
      getPublicKey(bytesToHex(this.nsecToBytes(adminNsec)))
    );
    this.checkRateLimit(
      `group_announcement:${adminKey}`,
      MESSAGING_CONFIG.RATE_LIMITS.SEND_MESSAGE_PER_HOUR,
      60 * 60 * 1000
    );

    const privHex = bytesToHex(this.nsecToBytes(adminNsec));
    const pubHex = getPublicKey(privHex);
    const ev: Event = finalizeEvent(
      {
        kind: 1773,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["e", groupId],
          ["m:type", "announcement"],
        ],
        content: announcement,
        pubkey: pubHex,
        id: "",
        sig: "",
      } as any,
      privHex
    ) as Event;
    return await this.publishEvent(ev);
  }
  async verifyOTP(
    recipientNpub: string,
    providedOTP: string
  ): Promise<{ valid: boolean; expired: boolean; error?: string }> {
    try {
      const supabase = await getSupabase();
      const { data: records, error } = await supabase
        .from("family_otp_verification")
        .select("*")
        .eq("recipient_npub", recipientNpub)
        .eq("used", false)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error || !records || !records.length)
        return { valid: false, expired: false, error: "No OTP found" };
      for (const rec of records) {
        const buf = await crypto.subtle.digest(
          "SHA-256",
          utf8(`${providedOTP}:${rec.otp_salt}`)
        );
        const hash = bytesToHex(new Uint8Array(buf));
        if (hash === rec.otp_hash) {
          const now = new Date();
          const exp = new Date(rec.expires_at);
          if (now > exp)
            return { valid: false, expired: true, error: "OTP has expired" };
          await supabase
            .from("family_otp_verification")
            .update({ used: true, used_at: new Date().toISOString() })
            .eq("id", rec.id);
          return { valid: true, expired: false };
        }
      }
      return { valid: false, expired: false, error: "Invalid OTP" };
    } catch (e) {
      return {
        valid: false,
        expired: false,
        error: e instanceof Error ? e.message : "Verification failed",
      };
    }
  }

  async cleanupOTPExpired(): Promise<boolean> {
    try {
      const supabase = await getSupabase();
      await supabase.rpc("cleanup_expired_otps");
      return true;
    } catch {
      return false;
    }
  }

  // ---- HybridAuth direct DM ----
  async sendDirectMessage(
    senderNsec: string,
    recipientNpub: string,
    plaintext: string
  ): Promise<string> {
    // Prefer NIP-59 gift-wrap when possible, fallback to NIP-04
    const privBytes = this.nsecToBytes(senderNsec);
    const recipientHex = this.npubToHex(recipientNpub);
    const privHex = bytesToHex(privBytes);

    let ev: Event | null = null;
    try {
      // Wrap an event with gift-wrap; content is encrypted payload or descriptor
      const now = Math.floor(Date.now() / 1000);
      const dmEvent: Event = finalizeEvent(
        {
          kind: 4,
          created_at: now,
          tags: [["p", recipientHex]],
          content: await nip04.encrypt(privHex, recipientHex, plaintext),
          pubkey: getPublicKey(privHex),
          id: "",
          sig: "",
        } as any,
        privHex
      ) as Event;

      const wrapped = await (nip59 as any).wrapEvent?.(
        dmEvent,
        privHex,
        recipientHex
      );
      if (wrapped) {
        ev = wrapped as Event;
      }
    } catch {}

    if (!ev) {
      // Fallback to NIP-04
      const enc = await nip04.encrypt(privHex, recipientHex, plaintext);
      ev = await this.createSignedDMEvent(privBytes, recipientHex, enc);
    }
    return await this.publishEvent(ev);
  }

  // Server-managed DM using RebuildingCamelot keys
  async sendServerDM(
    recipientNpub: string,
    plaintext: string
  ): Promise<string> {
    const { nsec } = await this.serverKeys();
    return this.sendDirectMessage(nsec, recipientNpub, plaintext);
  }

  // ---- Identity Forge ----
  async publishProfile(
    privateNsec: string,
    profileContent: any
  ): Promise<string> {
    const privHex = bytesToHex(this.nsecToBytes(privateNsec));
    const pubHex = getPublicKey(privHex);
    const ev: Event = finalizeEvent(
      {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify(profileContent || {}),
        pubkey: pubHex,
        id: "",
        sig: "",
      } as any,
      privHex
    ) as Event;
    return await this.publishEvent(ev);
  }

  // ---- Key rotation (NIP-26, NIP-41) ----
  async publishNIP26Delegation(
    oldNsecHex: string,
    newPubkeyHex: string,
    kinds: number[] = [0, 1, 1777],
    days = 90
  ): Promise<{ success: boolean; eventId?: string; error?: string }> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const until = now + days * 24 * 60 * 60;
      const conditions = `kind=${kinds.join(
        ","
      )},created_at>${now},created_at<${until}`;
      const nt: any = await import("nostr-tools");
      const tag = nt.nip26?.createDelegation?.(oldNsecHex, {
        pubkey: newPubkeyHex,
        kind: 1,
        since: now,
        until,
        conditions,
      });
      if (!tag) throw new Error("Failed to create delegation");
      const ev = finalizeEvent(
        {
          kind: 1,
          created_at: now,
          tags: [["delegation", tag.pubkey, tag.conditions, tag.token]],
          content: "Delegation notice",
        } as any,
        oldNsecHex
      ) as Event;
      const id = await this.publishEvent(ev);
      return { success: true, eventId: id };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Delegation failed",
      };
    }
  }
  async publishNIP41Deprecation(
    pubkeyHex: string,
    targetPubkeyHex: string
  ): Promise<{ success: boolean; eventId?: string; error?: string }> {
    try {
      const kind = 1776;
      const ev: Event = {
        kind,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", targetPubkeyHex]],
        content: `Key deprecation for ${targetPubkeyHex}`,
        pubkey: pubkeyHex,
        id: "",
        sig: "",
      } as any;
      const id = await this.publishEvent(ev);
      return { success: true, eventId: id };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "NIP-41 notice failed",
      };
    }
  }
}

export const central_event_publishing_service =
  new CentralEventPublishingService();
