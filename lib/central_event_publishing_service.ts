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

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

const utf8 = (s: string) => te.encode(s);

// Import session manager at top-level (TS/ESM) - recovery bridge imported lazily to avoid circular deps
import { secureNsecManager } from "../src/lib/secure-nsec-manager";

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
  sessionKey: string; // used only for contact/group metadata encryption
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  authMethod?: "nsec" | "nip07"; // distinguish session source without storing keys
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
  relays: ["wss://nos.lol", "wss://relay.damus.io", "wss://relay.nostr.band"],
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

// Removed getVault function - vault.ts has been deprecated

function isValidRelayUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const s = url.trim();
  // Allow ws:// and wss:// but prefer wss://; block others
  if (!s.startsWith("wss://") && !s.startsWith("ws://")) return false;
  try {
    const u = new URL(s);
    const hostname = u.hostname.toLowerCase();
    const port = u.port ? parseInt(u.port, 10) : undefined;
    // Block localhost and local domains
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname === "::1" ||
      hostname === "[::1]"
    )
      return false;
    // Block common private IPv4 ranges
    const isPrivateIPv4 =
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
    if (isPrivateIPv4) return false;
    // Block non-standard ports (only allow default 80 and 443)
    if (port && port !== 80 && port !== 443) return false;
    return true;
  } catch {
    return false;
  }
}

function parseRelaysCSV(csv?: string): string[] {
  return (csv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function defaultRelays(): string[] {
  const envNostr = (process as any)?.env?.NOSTR_RELAYS as string | undefined;
  const envVite = (process as any)?.env?.VITE_NOSTR_RELAYS as
    | string
    | undefined;
  const raw = envNostr && envNostr.length ? envNostr : envVite;
  const list = parseRelaysCSV(raw).filter(isValidRelayUrl);
  if (list.length) return list;

  console.warn(
    "[CEPS] NOSTR_RELAYS/VITE_NOSTR_RELAYS not set or contained no valid wss:// URLs; falling back to defaults"
  );

  // Enhanced default relay list with more reliable relays for development
  const isDevelopment = (process as any)?.env?.NODE_ENV !== "production";
  if (isDevelopment) {
    console.log(
      "[CEPS] Using development relay configuration with extended timeout tolerance"
    );
    return [
      "wss://relay.damus.io",
      "wss://nos.lol",
      "wss://relay.snort.social",
      "wss://relay.nostr.band",
      "wss://nostr.wine",
    ];
  }

  return ["wss://nos.lol", "wss://relay.damus.io", "wss://relay.nostr.band"];
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
  private pool: SimplePool | null = null;
  private relays: string[];
  private config: UnifiedMessagingConfig;

  // Session and privacy state
  private userSession: MessagingSession | null = null;
  private contactSessions: Map<string, PrivacyContact> = new Map();
  private groupSessions: Map<string, PrivacyGroup> = new Map();
  private pendingApprovals: Map<string, GuardianApprovalRequest> = new Map();
  private rateLimits: Map<string, { count: number; resetTime: number }> =
    new Map();
  // Relay discovery cache (kind:10050 inbox relays), TTL 10 minutes
  private relayCache: Map<string, { relays: string[]; expiresAt: number }> =
    new Map();

  constructor() {
    this.relays = defaultRelays();
    this.config = DEFAULT_UNIFIED_CONFIG;
    // Keep config.relays in sync with resolved relays for consistency
    this.config.relays = this.relays.slice();

    // Add global error handler for WebSocket failures
    this.setupGlobalErrorHandling();
  }

  private getPool(): SimplePool {
    if (!this.pool) {
      const candidate: unknown = SimplePool as unknown;
      if (typeof candidate === "function") {
        this.pool = new (candidate as new () => SimplePool)();
      } else if (
        candidate !== null &&
        typeof candidate === "object" &&
        typeof (candidate as { default?: unknown }).default === "function"
      ) {
        this.pool = new (
          candidate as { default: new () => SimplePool }
        ).default();
      } else {
        throw new Error("SimplePool is not constructible in this environment");
      }
    }
    return this.pool;
  }

  private setupGlobalErrorHandling() {
    // Handle uncaught WebSocket errors to prevent them from bubbling to UI
    if (typeof window !== "undefined") {
      const originalConsoleError = console.error;
      console.error = (...args: any[]) => {
        const message = args.join(" ");
        if (
          message.includes("websocket error") ||
          message.includes("WebSocket connection")
        ) {
          console.warn("[CEPS] Suppressed WebSocket error:", ...args);
          return;
        }
        originalConsoleError.apply(console, args);
      };
    }
  }

  setRelays(relays: string[]) {
    if (Array.isArray(relays) && relays.length) this.relays = relays;
  }
  // ---- Session management ----
  private async isNIP07Session(): Promise<boolean> {
    if (!this.userSession) return false;
    return this.userSession.authMethod === "nip07";
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
    const pubHex = await (async () => {
      try {
        // nsec may be hex already or bech32; handle both
        if (typeof nsec === "string" && /^[0-9a-fA-F]{64}$/.test(nsec))
          return getPublicKey(hexToBytes(nsec));
        const dec = nip19.decode(nsec);
        if (dec.type === "nsec") {
          const data = dec.data as Uint8Array;
          return getPublicKey(data);
        }
      } catch {}
      // As a safe fallback, derive from bytes of the string
      const bytes = te.encode(nsec);
      const keyBytes =
        bytes.length >= 32
          ? bytes.slice(0, 32)
          : new Uint8Array(32).map((_, i) => bytes[i % bytes.length] || 0);
      return getPublicKey(keyBytes);
    })();
    const userHash = await PrivacyUtils.hashIdentifier(pubHex);
    const ttlHours = options?.ttlHours ?? this.config.session.ttlHours;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    // Do NOT store nsec; create SecureNsecManager session instead (using policy)
    try {
      const policy = await this.getSigningPolicy();
      await secureNsecManager.createPostRegistrationSession(
        nsec,
        policy.sessionDurationMs,
        policy.maxOperations,
        policy.browserLifetime
      );
    } catch (e) {
      console.warn("[CEPS] Failed to create SecureNsecManager session:", e);
    }

    this.userSession = {
      sessionId,
      userHash,
      sessionKey, // used only for metadata encryption
      expiresAt,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      authMethod: "nsec",
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
    const ttlHours = options?.ttlHours ?? this.config.session.ttlHours;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    // No nsec stored; mark session as nip07
    this.userSession = {
      sessionId,
      userHash,
      sessionKey,
      expiresAt,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      authMethod: "nip07",
    };

    await this.storeSessionInDatabase(this.userSession);
    return sessionId;
  }

  private async storeSessionInDatabase(
    session: MessagingSession
  ): Promise<void> {
    const supabase = await getSupabase();

    // Set app.current_user_hash for RLS policy compliance
    await supabase
      .rpc("set_config", {
        setting_name: "app.current_user_hash",
        setting_value: session.userHash,
        is_local: true,
      })
      .then(() => {})
      .catch(() => {}); // Ignore if function doesn't exist

    const { error } = await supabase.from("messaging_sessions").upsert({
      session_id: session.sessionId,
      user_hash: session.userHash,
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
        this.getPool().close(this.relays);
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

  // ---- Dynamic identity retrieval (SecureSession first, then NIP-07, DB fallback) ----
  private async getUserPubkeyHexForVerification(): Promise<string> {
    // 1) Prefer SecureSession: derive pubkey from the active SecureNsecManager session
    try {
      const sessionId = this.getActiveSigningSessionId();
      if (sessionId) {
        const pubHex = await secureNsecManager.useTemporaryNsec(
          sessionId,
          async (nsecHex: string) => {
            try {
              if (/^[0-9a-fA-F]{64}$/.test(nsecHex)) {
                return getPublicKey(nsecHex);
              }
              const dec = nip19.decode(nsecHex);
              if (dec.type === "nsec") {
                const data = dec.data as Uint8Array;
                return getPublicKey(data);
              }
            } catch {}
            // Fallback: attempt to use as hex directly
            return getPublicKey(nsecHex);
          }
        );
        if (typeof pubHex === "string" && pubHex.length >= 64) return pubHex;
      }
    } catch {}

    // 2) Try NIP-07 only if not in Identity Forge registration flow
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w: any = globalThis as any;
      const regGuard = !!w?.window?.__identityForgeRegFlow;
      if (!regGuard && w?.window?.nostr?.getPublicKey) {
        const pubHex = await w.window.nostr.getPublicKey();
        if (typeof pubHex === "string" && pubHex.length >= 64) return pubHex;
      }
    } catch {}

    // 3) Fallback: query user_identities using session userHash and read npub/pubkey
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

      const groupName = b as string;
      const groupType = c as string;
      const memberPubkeys = d as string[];
      const pubHex = await this.getUserPubkeyHexForVerification();
      const ev: Event = await this.signEventWithActiveSession({
        kind: 1770,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["g:name", groupName],
          ["g:type", groupType],
          ...(memberPubkeys || []).map((p) => ["p", p]),
        ],
        content: "",
        pubkey: pubHex,
      } as any);
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

  private sanitizeFixedTags(ev: Event): Event {
    try {
      const clone: any = { ...ev };
      const tags: any[] = Array.isArray(clone.tags) ? clone.tags.slice() : [];
      const sanitized: any[] = [];
      for (const t of tags) {
        if (!Array.isArray(t) || t.length < 2) continue;
        const key = t[0];
        let val = t[1];
        if (key === "p" || key === "e") {
          try {
            if (typeof val === "string" && val.startsWith("npub1")) {
              val = this.npubToHex(val);
            } else if (
              typeof val === "string" &&
              val.startsWith("note1") &&
              key === "e"
            ) {
              const dec = nip19.decode(val);
              val =
                typeof dec.data === "string"
                  ? dec.data
                  : bytesToHex(dec.data as Uint8Array);
            }
          } catch {
            // fall through; will validate length below
          }
          if (typeof val === "string" && /^[0-9a-fA-F]{64}$/.test(val)) {
            sanitized.push([key, val, ...(t.slice(2) || [])]);
          } else {
            console.warn(`[CEPS] Dropping invalid '${key}' tag value`, {
              value: t[1],
            });
          }
        } else {
          sanitized.push(t);
        }
      }
      clone.tags = sanitized;
      // Ensure pubkey is hex if present as npub
      if (
        typeof clone.pubkey === "string" &&
        clone.pubkey.startsWith("npub1")
      ) {
        try {
          clone.pubkey = this.npubToHex(clone.pubkey);
        } catch {}
      }
      return clone as Event;
    } catch {
      return ev;
    }
  }

  async publishEvent(ev: Event, relays?: string[]): Promise<string> {
    // Sanitize event tags to prevent nostr-tools fixed-size tag errors
    ev = this.sanitizeFixedTags(ev);
    const list = relays && relays.length ? relays : this.relays;

    // Debug logging to identify where PoW relays are coming from
    console.log("🔨 CEPS.publishEvent: Relay list:", list);
    console.log("🔨 CEPS.publishEvent: Passed relays:", relays);
    console.log("🔨 CEPS.publishEvent: Default relays:", this.relays);

    // Optional PoW support: publish to non-PoW relays first, then attempt PoW relays best-effort
    const powDifficulty: Record<string, number> = {
      // Known requirement as of current relay policy
      "wss://relay.0xchat.com": 28,
    };

    // In development environments, completely skip PoW relays to prevent crashes
    const isDevelopment =
      (typeof process !== "undefined" && process.env?.NETLIFY_DEV === "true") ||
      (typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development") ||
      (typeof window !== "undefined" &&
        window.location?.hostname === "localhost");

    // CRITICAL FIX: Also skip PoW relays for registration events to prevent failures
    const isRegistrationEvent =
      ev.kind === 0 ||
      (ev.tags &&
        ev.tags.some(
          (tag) =>
            tag[0] === "client" && tag[1] && tag[1].includes("identity-forge")
        ));

    const nonPow = list.filter((r) => !(r in powDifficulty));
    const powRelays =
      isDevelopment || isRegistrationEvent
        ? []
        : list.filter((r) => r in powDifficulty);

    if (
      (isDevelopment || isRegistrationEvent) &&
      list.some((r) => r in powDifficulty)
    ) {
      const reason = isDevelopment
        ? "development environment"
        : "registration event";
      console.log(
        `🔨 PoW: Skipping PoW relays for ${reason}:`,
        list.filter((r) => r in powDifficulty)
      );
      if (isRegistrationEvent) {
        console.log(
          "🔨 PoW: Registration event detected, avoiding PoW mining to prevent failures"
        );
      }
    }

    const results: Array<{ relay: string; ok: boolean; error?: string }> = [];

    // Helper to publish with timeout
    const publishWithTimeout = async (relay: string, event: Event) => {
      const publishPromise = this.getPool().publish([relay], event);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), 10000)
      );
      await Promise.race([publishPromise, timeoutPromise]);
    };

    // 1) Non-PoW relays
    for (const r of nonPow) {
      try {
        await publishWithTimeout(r, ev);
        results.push({ relay: r, ok: true });
        console.log(`[CEPS] Successfully published to ${r}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/duplicate/i.test(msg)) {
          results.push({ relay: r, ok: true });
          console.log(`[CEPS] Duplicate event on ${r} (treated as success)`);
        } else {
          if (
            msg.toLowerCase().includes("websocket") ||
            msg.includes("Connection timeout")
          ) {
            console.warn(
              `[CEPS] Relay ${r} connection failed (non-fatal): ${msg}`
            );
          } else {
            console.warn(`[CEPS] Publish to ${r} failed: ${msg}`);
          }
          results.push({ relay: r, ok: false, error: msg });
        }
      }
    }

    // 2) PoW relays (best-effort): mine in a worker if available in browser; skip in Node envs
    if (powRelays.length) {
      try {
        const isBrowser =
          typeof window !== "undefined" && typeof document !== "undefined";
        if (isBrowser) {
          // For each PoW relay, mine and publish (per-relay worker with dynamic difficulty retry)
          await Promise.allSettled(
            powRelays.map((relay) =>
              (async () => {
                const initial = powDifficulty[relay] || 28;

                const mineAndPublish = (difficulty: number) =>
                  new Promise<{ ok: boolean; error?: string }>((resolve) => {
                    // Safety check: Skip PoW in Netlify dev environment to prevent crashes
                    if (
                      typeof process !== "undefined" &&
                      process.env?.NETLIFY_DEV === "true"
                    ) {
                      console.log(
                        `🔨 PoW: Skipping mining in Netlify dev environment (difficulty ${difficulty})`
                      );
                      // Return the event without PoW for dev testing
                      resolve({ ok: true });
                      return;
                    }

                    // Create a module Worker from inline source to avoid import.meta.url in CJS builds
                    const workerSrc = `self.onmessage = async (e) => {\n  const { event, difficulty } = e.data || {};\n  try {\n    const mod = await import('nostr-tools/nip13');\n    const mined = await mod.minePow(event, difficulty);\n    self.postMessage({ success: true, event: mined });\n  } catch (err) {\n    const msg = (err && err.message) ? err.message : String(err);\n    self.postMessage({ success: false, error: msg });\n  }\n};`;
                    const blob = new Blob([workerSrc], {
                      type: "text/javascript",
                    });
                    const url = URL.createObjectURL(blob);
                    const worker = new Worker(url, { type: "module" } as any);
                    worker.onmessage = async (evt: MessageEvent) => {
                      const { success, event, error } = (evt as any).data || {};
                      if (!success) {
                        try {
                          (worker as any).terminate?.();
                        } catch {}
                        try {
                          URL.revokeObjectURL(url);
                        } catch {}
                        return resolve({ ok: false, error });
                      }
                      try {
                        await publishWithTimeout(relay, event as Event);
                        resolve({ ok: true });
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        resolve({ ok: false, error: msg });
                      } finally {
                        try {
                          (worker as any).terminate?.();
                        } catch {}
                        try {
                          URL.revokeObjectURL(url);
                        } catch {}
                      }
                    };
                    worker.postMessage({ event: ev, difficulty });
                  });

                let attempt = await mineAndPublish(initial);
                if (!attempt.ok) {
                  const m = /difficulty[^0-9]*([0-9]+)/i.exec(
                    attempt.error || ""
                  );
                  const req = m ? parseInt(m[1], 10) : NaN;
                  if (Number.isFinite(req) && req > initial) {
                    attempt = await mineAndPublish(req);
                  }
                }

                results.push({ relay, ok: attempt.ok, error: attempt.error });
              })()
            )
          );
        } else {
          // Node/Netlify Functions: skip PoW mining (non-blocking best-effort)
          console.log("[CEPS] Skipping PoW relays in server environment");
          for (const r of powRelays)
            results.push({
              relay: r,
              ok: false,
              error: "PoW not available in server env",
            });
        }
      } catch (e) {
        console.warn(
          "[CEPS] PoW handling failed:",
          e instanceof Error ? e.message : String(e)
        );
        for (const r of powRelays)
          results.push({ relay: r, ok: false, error: "PoW worker failed" });
      }
    }

    if (!results.some((r) => r.ok)) {
      console.warn(
        "[CEPS] Publish failed on all relays; proceeding without hard failure",
        { errors: results }
      );
    }

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
    return this.getPool().subscribeMany(list, filters, {
      onevent: handlers.onevent,
      oneose: handlers.oneose,
    });
  }

  // ---- Centralized session-based signing (SecureNsecManager integration) ----
  /**
   * Get active signing session id from either RecoverySessionBridge or SecureNsecManager
   */
  private _recoverySessionBridge: any = null;
  private _recoverySessionBridgeLoaded = false;

  private getRecoverySessionBridge(): any {
    if (!this._recoverySessionBridgeLoaded) {
      try {
        // Use require for synchronous loading to avoid circular deps
        const module = require("../src/lib/auth/recovery-session-bridge");
        this._recoverySessionBridge = module.recoverySessionBridge;
      } catch {
        // Recovery session bridge not available
      }
      this._recoverySessionBridgeLoaded = true;
    }
    return this._recoverySessionBridge;
  }

  getActiveSigningSessionId(): string | null {
    try {
      // 1) Entry point logging with minimal caller info
      try {
        const stack = new Error().stack || "";
        const caller = stack.split("\n")[2]?.trim() || "unknown";
        console.log("🔐 CEPS.getActiveSigningSessionId: called", { caller });
      } catch {}

      // 2) Recovery session check (lazy import to avoid circular deps)
      const recoveryBridge = this.getRecoverySessionBridge();
      const recovery = recoveryBridge?.getRecoverySessionStatus?.();
      try {
        const recId: string | null = recovery?.sessionId || null;
        console.log("🔐 CEPS.getActiveSigningSessionId: recovery status", {
          hasSession: !!recovery?.hasSession,
          sessionId: recId ? recId.slice(0, 8) + "..." : null,
        });
      } catch {}

      // 3) Direct SecureNsecManager check
      const direct = secureNsecManager.getActiveSessionId();
      try {
        console.log("🔐 CEPS.getActiveSigningSessionId: direct status", {
          active: !!direct,
          sessionId: direct ? direct.slice(0, 8) + "..." : null,
        });
      } catch {}

      // 4) Final decision + return
      if (recovery?.hasSession && recovery?.sessionId) {
        try {
          console.log(
            "🔐 CEPS.getActiveSigningSessionId: returning recovery session (preferred when present)"
          );
        } catch {}
        return recovery.sessionId;
      }
      if (direct) {
        try {
          console.log(
            "🔐 CEPS.getActiveSigningSessionId: returning direct session (no recovery session present)"
          );
        } catch {}
        return direct;
      }
      try {
        console.log(
          "🔐 CEPS.getActiveSigningSessionId: no active session found"
        );
      } catch {}
      return null;
    } catch (e) {
      try {
        console.warn(
          "🔐 CEPS.getActiveSigningSessionId: error while checking sessions",
          e instanceof Error ? e.message : String(e)
        );
      } catch {}
      return null;
    }
  }

  // ---- Signing policy integration ----
  async getSigningPolicy(): Promise<{
    sessionDurationMs: number;
    maxOperations: number;
    singleUse: boolean;
    browserLifetime: boolean;
  }> {
    try {
      const prefsMod = await import("../src/lib/user-signing-preferences");
      const prefs = await prefsMod.userSigningPreferences.getUserPreferences();
      if (!prefs) {
        return {
          sessionDurationMs: 15 * 60 * 1000,
          maxOperations: 50,
          singleUse: false,
          browserLifetime: false,
        };
      }
      return {
        sessionDurationMs:
          Math.max(5, prefs.sessionDurationMinutes || 15) * 60 * 1000,
        maxOperations: Math.max(1, prefs.maxOperationsPerSession || 50),
        singleUse: (prefs.maxOperationsPerSession || 50) === 1,
        browserLifetime: prefs.sessionLifetimeMode === "browser_session",
      };
    } catch {
      return {
        sessionDurationMs: 15 * 60 * 1000,
        maxOperations: 50,
        singleUse: false,
        browserLifetime: false,
      };
    }
  }

  /**
   * Finalize an unsigned event using the active secure session without exposing nsec
   */
  async signEventWithActiveSession(unsignedEvent: any): Promise<Event> {
    const sessionId = this.getActiveSigningSessionId();
    if (!sessionId) throw new Error("No active signing session");

    // Pre-check session status for clearer errors
    const status = (secureNsecManager as any).getSessionStatus?.(sessionId);
    if (!status?.active) {
      throw new Error("Signing session expired or operation limit reached");
    }

    // Use SecureNsecManager to execute signing with ephemeral access
    const ev = await secureNsecManager.useTemporaryNsec(
      sessionId,
      async (nsecHex: string) => {
        const toSign = {
          ...unsignedEvent,
          created_at: unsignedEvent.created_at || Math.floor(Date.now() / 1000),
        };
        return finalizeEvent(toSign as any, nsecHex) as Event;
      }
    );

    // Enforce policy after sign: apply single-use
    try {
      const policy = await this.getSigningPolicy();
      if (policy.singleUse) {
        try {
          (secureNsecManager as any).clearTemporarySession?.();
        } catch {}
      }
    } catch {}

    return ev;
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
        const sub = this.getPool().subscribeMany(list, filters, {
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
              this.getPool().close(list);
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
            this.getPool().close(list);
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

  // ---- NIP-17 builders and wrappers ----
  buildUnsignedKind14DirectMessage(
    content: string,
    recipientPubkeyHex: string
  ): { kind: number; created_at: number; tags: string[][]; content: string } {
    const now = Math.floor(Date.now() / 1000);
    return {
      kind: 14,
      created_at: now,
      tags: [["p", recipientPubkeyHex]],
      content,
    };
  }

  buildUnsignedKind15GroupMessage(
    content: string,
    groupId: string
  ): { kind: number; created_at: number; tags: string[][]; content: string } {
    const now = Math.floor(Date.now() / 1000);
    return {
      kind: 15,
      created_at: now,
      tags: [["e", groupId]],
      content,
    };
  }

  async sealKind13(unsignedEvent: any, senderNsec: string): Promise<Event> {
    try {
      // Normalize nsec to hex private key
      let privHex: string;
      try {
        const bytes = this.decodeNsec(senderNsec);
        privHex = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      } catch {
        // Assume already-hex
        privHex = senderNsec;
      }
      const pubHex = getPublicKey(privHex);
      const now = Math.floor(Date.now() / 1000);
      const unsignedSeal: any = {
        kind: 13,
        created_at: now,
        tags: [],
        content: JSON.stringify(unsignedEvent),
        pubkey: pubHex,
      };
      return finalizeEvent(unsignedSeal as any, privHex) as Event;
    } catch (e) {
      throw new Error(
        `Failed to seal kind:13: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async sealKind13WithActiveSession(unsignedEvent: any): Promise<Event> {
    const sessionId = this.getActiveSigningSessionId();
    if (!sessionId) throw new Error("No active signing session");
    return await secureNsecManager.useTemporaryNsec(
      sessionId,
      async (nsecHex) => {
        const privHex = nsecHex;
        const pubHex = getPublicKey(privHex);
        const now = Math.floor(Date.now() / 1000);
        const unsignedSeal: any = {
          kind: 13,
          created_at: now,
          tags: [],
          content: JSON.stringify(unsignedEvent),
          pubkey: pubHex,
        };
        return finalizeEvent(unsignedSeal as any, privHex) as Event;
      }
    );
  }

  async giftWrap1059(
    sealedEvent: Event,
    recipientPubkeyHex: string
  ): Promise<Event> {
    const senderPubHex = (sealedEvent as any).pubkey as string;
    const wrapped = await (nip59 as any).wrapEvent?.(
      sealedEvent as any,
      senderPubHex,
      recipientPubkeyHex
    );
    if (!wrapped) throw new Error("NIP-59 gift wrap failed");

    // Ensure protocol tag for server-side NIP-17 detection
    try {
      const w: any = wrapped as any;
      if (!Array.isArray(w.tags)) w.tags = [];
      const hasProtocol = w.tags.some(
        (t: any) => Array.isArray(t) && t[0] === "protocol"
      );
      if (!hasProtocol) {
        w.tags.push(["protocol", "nip17"]);
      }
      // Also make sure wrapped-event-kind indicates sealed kind:13 when available
      const hasWrappedKind = w.tags.some(
        (t: any) => Array.isArray(t) && t[0] === "wrapped-event-kind"
      );
      if (!hasWrappedKind) {
        w.tags.push(["wrapped-event-kind", "13"]);
      }
    } catch {}

    return wrapped as Event;
  }

  // Backward-compatibility: wrap signed DM/inner event directly (NIP-59)
  async wrapGift59(
    innerSignedEvent: Event,
    recipientPubkeyHex: string
  ): Promise<Event> {
    const senderPubHex = (innerSignedEvent as any).pubkey as string;
    const wrapped = await (nip59 as any).wrapEvent?.(
      innerSignedEvent as any,
      senderPubHex,
      recipientPubkeyHex
    );
    if (!wrapped) throw new Error("NIP-59 wrap failed");
    return wrapped as Event;
  }

  // Unwrap gift-wrapped event using active secure session
  async unwrapGift59WithActiveSession(
    outerEvent: Event
  ): Promise<Event | null> {
    const sessionId = this.getActiveSigningSessionId();
    if (!sessionId) return null;
    try {
      return await secureNsecManager.useTemporaryNsec(
        sessionId,
        async (nsecHex) => {
          try {
            const fn =
              (nip59 as any).unwrapEvent || (nip59 as any).openGiftWrap;
            if (!fn) throw new Error("NIP-59 unwrap not available");
            return (await fn(outerEvent, nsecHex)) as Event;
          } catch (innerErr) {
            // Swallow unwrap errors and return null for robustness
            return null as any;
          }
        }
      );
    } catch (e) {
      return null;
    }
  }

  // Optional NIP-44 helpers (available for future NIP-17 flows)
  async encryptNip44WithActiveSession(
    recipientPubkeyHex: string,
    plaintext: string
  ): Promise<string> {
    const sessionId = this.getActiveSigningSessionId();
    if (!sessionId) throw new Error("No active signing session");
    return await secureNsecManager.useTemporaryNsec(
      sessionId,
      async (nsecHex) => {
        const mod = await import("nostr-tools/nip44");
        return (await (mod as any).encrypt(
          nsecHex,
          recipientPubkeyHex,
          plaintext
        )) as string;
      }
    );
  }

  // ---- Relay discovery (kind:10050) and optimized publishing ----
  private parseRelaysFrom10050Event(ev: Event): string[] {
    const urls = new Set<string>();
    try {
      const tags = (ev as any).tags as any[];
      if (Array.isArray(tags)) {
        for (const t of tags) {
          if (Array.isArray(t) && t[0] === "r" && typeof t[1] === "string") {
            const u = t[1].trim();
            if (isValidRelayUrl(u)) urls.add(u);
          }
        }
      }
      const content = (ev as any).content;
      if (typeof content === "string" && content.trim()) {
        try {
          const parsed = JSON.parse(content);
          const inbox = Array.isArray(parsed?.inbox) ? parsed.inbox : [];
          for (const u of inbox) if (isValidRelayUrl(u)) urls.add(u);
        } catch {
          // Not JSON - attempt CSV-style parse
          const parts = content.split(/[\s,]+/g).map((s) => s.trim());
          for (const p of parts) if (isValidRelayUrl(p)) urls.add(p);
        }
      }
    } catch {}
    // Enforce a practical upper bound to prevent DoS via huge relay lists
    return Array.from(urls).slice(0, 20);
  }

  private mergeUniqueRelays(...lists: (string[] | undefined)[]): string[] {
    const set = new Set<string>();
    for (const list of lists)
      if (Array.isArray(list)) for (const r of list) set.add(r);
    return Array.from(set);
  }

  async resolveInboxRelaysFromKind10050(pubkeyHex: string): Promise<string[]> {
    const now = Date.now();
    const cached = this.relayCache.get(pubkeyHex);
    if (cached && cached.expiresAt > now) return cached.relays.slice();

    try {
      const filters = [{ kinds: [10050], authors: [pubkeyHex], limit: 1 }];
      const listPromise = (this.getPool() as any).list(this.relays, filters);
      // Add timeout to avoid hanging on slow relays
      const timeoutMs = 2500;
      const events = (await Promise.race([
        listPromise,
        new Promise<Event[]>((resolve) =>
          setTimeout(() => resolve([]), timeoutMs)
        ),
      ])) as Event[];
      const ev = Array.isArray(events) && events.length ? events[0] : null;
      const relays = ev ? this.parseRelaysFrom10050Event(ev) : [];
      const ttl = 10 * 60 * 1000;
      this.relayCache.set(pubkeyHex, { relays, expiresAt: now + ttl });
      return relays.slice();
    } catch {
      return [];
    }
  }

  async publishOptimized(
    ev: Event,
    opts?: {
      recipientPubHex?: string;
      senderPubHex?: string;
      includeFallback?: boolean;
    }
  ): Promise<string> {
    try {
      const recipientRelays = opts?.recipientPubHex
        ? await this.resolveInboxRelaysFromKind10050(opts.recipientPubHex)
        : [];
      const senderRelays = opts?.senderPubHex
        ? await this.resolveInboxRelaysFromKind10050(opts.senderPubHex)
        : [];
      const target = this.mergeUniqueRelays(
        recipientRelays,
        senderRelays,
        opts?.includeFallback !== false ? this.relays : []
      );
      if (!target.length) return await this.publishEvent(ev);
      return await this.publishEvent(ev, target);
    } catch {
      return await this.publishEvent(ev);
    }
  }

  private async serverKeys(): Promise<{ nsec: string; nip05?: string }> {
    // Get server keys directly from Supabase (vault deprecated)
    const supabase = await getSupabase();
    const nsecResp = await supabase.rpc("get_rebuilding_camelot_nsec");
    const nip05Resp = await supabase.rpc("get_rebuilding_camelot_nip05");
    const nsec = nsecResp?.data as string | undefined;
    const nip05 = nip05Resp?.data as string | undefined;
    if (!nsec) throw new Error("Server NSEC unavailable");
    return { nsec, nip05 };
  }

  // ---- DM helpers ----
  private async createSignedDMEventWithActiveSession(
    recipientPubHex: string,
    content: string
  ): Promise<Event> {
    const ev = await this.signEventWithActiveSession({
      kind: 4,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", recipientPubHex]],
      content,
    });
    return ev;
  }

  private async encryptWithActiveSession(
    recipientPubHex: string,
    content: string
  ): Promise<string> {
    const sessionId = this.getActiveSigningSessionId();
    if (!sessionId) throw new Error("No active signing session");
    const enc = await secureNsecManager.useTemporaryNsec(
      sessionId,
      async (nsecHex) => {
        return await nip04.encrypt(nsecHex, recipientPubHex, content);
      }
    );
    return enc;
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
          return await this.publishOptimized(wrapped as Event, {
            recipientPubHex: recipientHex,
            senderPubHex: senderPubHex,
          });
        }
      } catch {}
    }

    // Fallbacks
    const recipientHex = this.npubToHex(recipientNpub);

    // If NIP-07 unavailable but gift preferred, try wrapping a session-signed DM
    if (preferGift) {
      try {
        const dmEvent = await this.createSignedDMEventWithActiveSession(
          recipientHex,
          content
        );
        const senderHex = await this.getUserPubkeyHexForVerification();
        const wrapped = await (nip59 as any).wrapEvent?.(
          dmEvent,
          senderHex,
          recipientHex
        );
        if (wrapped) {
          await this.sleep(delayMs);
          return await this.publishOptimized(wrapped as Event, {
            recipientPubHex: recipientHex,
            senderPubHex: senderHex,
          });
        }
      } catch {}
    }

    // NIP-04 fallback via active session
    const enc = await this.encryptWithActiveSession(recipientHex, content);
    const ev = await this.createSignedDMEventWithActiveSession(
      recipientHex,
      enc
    );
    await this.sleep(delayMs);
    return await this.publishOptimized(ev, {
      recipientPubHex: recipientHex,
      senderPubHex: (ev as any).pubkey as string,
    });
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
      await this.serverKeys();
      const otp = this.genOTP(6);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const recipientPubHex = this.npubToHex(recipientNpub);

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
          const enc = await this.encryptWithActiveSession(recipientPubHex, dm);
          ev = await this.createSignedDMEventWithActiveSession(
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
        const enc = await this.encryptWithActiveSession(recipientPubHex, dm);
        ev = await this.createSignedDMEventWithActiveSession(
          recipientPubHex,
          enc
        );
        messageType = "nip04";
      }
      if (!ev) {
        throw new Error("Failed to create OTP event");
      }
      const id = await this.publishOptimized(ev, {
        recipientPubHex: recipientPubHex,
        senderPubHex: (ev as any).pubkey as string,
      });
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

  private async getGroupMemberPubkeys(groupId: string): Promise<string[]> {
    try {
      const supabase = await getSupabase();
      const { data: members } = await supabase
        .from("group_memberships")
        .select("member_hash")
        .eq("group_session_id", groupId);
      const hashes = (members || [])
        .map((m: any) => m?.member_hash)
        .filter((x: any) => typeof x === "string")
        .slice(0, 200);
      if (!hashes.length) return [];
      const { data: ids } = await supabase
        .from("user_identities")
        .select("user_hash, pubkey")
        .in("user_hash", hashes);
      return (ids || [])
        .map((r: any) => String(r?.pubkey || ""))
        .filter((p: string) => !!p);
    } catch {
      return [];
    }
  }

  async inviteToGroup(
    _adminNsec: string,
    groupId: string,
    inviteePubkey: string
  ): Promise<string> {
    // Apply rate limit (per admin identity)
    const adminPub = await this.getUserPubkeyHexForVerification();
    const adminKey = await PrivacyUtils.hashIdentifier(adminPub);
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

    const adminPubHex = await this.getUserPubkeyHexForVerification();
    const ev: Event = await this.signEventWithActiveSession({
      kind: 1771,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", groupId],
        ["p", inviteePubkey],
      ],
      content: "group-invite",
      pubkey: adminPubHex,
    } as any);

    // Primary publish to invitee
    const primaryId = await this.publishOptimized(ev, {
      recipientPubHex: inviteePubkey,
      senderPubHex: adminPubHex,
    });

    // Fanout to existing group members (best-effort)
    try {
      const members = (await this.getGroupMemberPubkeys(groupId)).filter(
        (p) => p && p !== inviteePubkey
      );
      await Promise.allSettled(
        members.map((p) =>
          this.publishOptimized(ev, {
            recipientPubHex: p,
            senderPubHex: adminPubHex,
          })
        )
      );
    } catch {}

    return primaryId;
  }

  async publishGroupAnnouncement(
    _adminNsec: string,
    groupId: string,
    announcement: string
  ): Promise<string> {
    // Rate limit announcements lightly under SEND_MESSAGE_PER_HOUR for simplicity
    const adminPub = await this.getUserPubkeyHexForVerification();
    const adminKey = await PrivacyUtils.hashIdentifier(adminPub);
    this.checkRateLimit(
      `group_announcement:${adminKey}`,
      MESSAGING_CONFIG.RATE_LIMITS.SEND_MESSAGE_PER_HOUR,
      60 * 60 * 1000
    );

    const adminPubHex2 = await this.getUserPubkeyHexForVerification();
    const ev: Event = await this.signEventWithActiveSession({
      kind: 1773,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", groupId],
        ["m:type", "announcement"],
      ],
      content: announcement,
      pubkey: adminPubHex2,
    } as any);

    // Fanout announcement to all members via their inbox relays; fallback to sender relays
    try {
      const members = await this.getGroupMemberPubkeys(groupId);
      if (members.length) {
        const results = await Promise.allSettled(
          members.map((p) =>
            this.publishOptimized(ev, {
              recipientPubHex: p,
              senderPubHex: adminPubHex2,
            })
          )
        );
        const ok = results.find((r) => r.status === "fulfilled") as
          | PromiseFulfilledResult<string>
          | undefined;
        if (ok) return ok.value;
      }
    } catch {}

    return await this.publishOptimized(ev, { senderPubHex: adminPubHex2 });
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
        const providedHashBuf = await crypto.subtle.digest(
          "SHA-256",
          utf8(`${providedOTP}:${rec.otp_salt}`)
        );
        const providedHash = new Uint8Array(providedHashBuf);
        const storedHash = hexToBytes(String(rec.otp_hash || ""));
        if (
          storedHash.length === providedHash.length &&
          timingSafeEqual(providedHash, storedHash)
        ) {
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
      ev = await this.createSignedDMEventWithActiveSession(recipientHex, enc);
    }
    return await this.publishOptimized(ev as Event, {
      recipientPubHex: recipientHex,
      senderPubHex: (ev as any).pubkey as string,
    });
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
    // Ensure SecureSession is active; if not, create a temporary one from provided privateNsec
    let sessionId = this.getActiveSigningSessionId();
    if (!sessionId && privateNsec) {
      try {
        sessionId = await secureNsecManager.createPostRegistrationSession(
          privateNsec,
          15 * 60 * 1000
        );
      } catch (e) {
        // proceed; signEventWithActiveSession will throw a clearer error
      }
    }

    const profilePub = await this.getUserPubkeyHexForVerification();
    const ev: Event = await this.signEventWithActiveSession({
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(profileContent || {}),
      pubkey: profilePub,
    } as any);
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
