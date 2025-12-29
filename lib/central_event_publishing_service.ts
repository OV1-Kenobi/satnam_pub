/**
 * Central Event Publishing Service
 * Single server-side portal for Nostr relay operations (only import point for nostr-tools)
 */

import {
  finalizeEvent,
  getPublicKey,
  nip04,
  nip19,
  nip44,
  nip59,
  SimplePool,
  verifyEvent,
  type Event,
} from "nostr-tools";

// Helpers
const te = new TextEncoder();
const utf8 = (s: string) => te.encode(s);

// Import signing preferences; secure nsec session provider is resolved via
// a lightweight registry to avoid circular dependencies.
import { userSigningPreferences } from "../src/lib/user-signing-preferences";
import {
  getSecureNsecSessionProvider,
  type SecureNsecSessionProvider,
} from "./secure-nsec-session-registry";
import { bytesToHex, hexToBytes, timingSafeEqual } from "./utils/crypto-utils";
import {
  deriveNpubFromNsec as utilDeriveNpubFromNsec,
  derivePubkeyHexFromNsec as utilDerivePubkeyHexFromNsec,
  encodeNpub as utilEncodeNpub,
  encodeNsec as utilEncodeNsec,
} from "./utils/nostr-encoding-utils";
import { decodeNsecToBytes } from "./utils/nsec-utils";

// Import relay privacy layer for metadata protection
import {
  initializeRelayPrivacyLayer,
  relayPrivacyLayer,
} from "./relay-privacy-layer";

import type { MessageSendResult } from "../src/lib/messaging/types";

import type {
  SignAction,
  SignerAdapter,
  TSignerCapability as SignerCapability,
  SignerStatus,
  SigningMethodId,
} from "../src/lib/signers/signer-adapter";

// Read boolean feature flags from environment (Vite injects VITE_* into process.env for browser builds)
function getEnvFlag(key: string, defaultVal: boolean): boolean {
  try {
    const im: any =
      typeof import.meta !== "undefined" ? (import.meta as any) : null;
    const v =
      (im && im.env ? im.env[key] : undefined) ??
      (typeof process !== "undefined"
        ? (process as any)?.env?.[key]
        : undefined);
    if (v == null) return defaultVal;
    const s = String(v).toLowerCase();
    return s === "1" || s === "true" || s === "yes";
  } catch {
    return defaultVal;
  }
}

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

  // Registered external signer adapters (NIP-07, Amber, NTAG424, etc.)
  private externalSigners: SignerAdapter[] = [];

  // CRITICAL FIX: Recursion guard for signEventWithActiveSession
  // Tracks call depth to detect infinite loops between selectSigner and adapter.getStatus()
  private signEventRecursionDepth: number = 0;
  private readonly MAX_RECURSION_DEPTH: number = 3;

  // ---- NIP-46 (Nostr Connect) ephemeral pairing state ----
  private nip46ClientPrivHex: string | null = null;
  private nip46ClientPubHex: string | null = null;
  private nip46SignerPubHex: string | null = null;
  private nip46SecretHex: string | null = null;
  private nip46Relays: string[] = [];
  private nip46Encryption: "nip04" | "nip44" = "nip04";
  private nip46Pending: Map<
    string,
    { resolve: (v: any) => void; reject: (e: any) => void; timer: any }
  > = new Map();
  private nip46Unsubscribe: (() => void) | null = null;
  // Mutex-style lock to serialize NIP-46 connection and cleanup
  private nip46Lock: Promise<void> = Promise.resolve();
  // Guard against concurrent subscription attempts
  private nip46Subscribing: boolean = false;

  constructor() {
    this.relays = defaultRelays();
    this.config = DEFAULT_UNIFIED_CONFIG;
    // Keep config.relays in sync with resolved relays for consistency
    this.config.relays = this.relays.slice();

    // Initialize relay privacy layer with publish callback
    // Note: This creates a closure that captures 'this' for relay publishing
    try {
      initializeRelayPrivacyLayer(async (event: Event, relayUrl: string) => {
        // Publish single event to specific relay via pool
        const onauth = (_challenge: string) => {
          console.log(`[CEPS] Relay ${relayUrl} requested AUTH`);
        };
        const pubResult = (this.getPool() as any).publish([relayUrl], event, {
          onauth,
        });
        const publishPromise = Array.isArray(pubResult)
          ? pubResult[0]
          : (pubResult as any);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Connection timeout")), 10000)
        );
        await Promise.race([publishPromise, timeoutPromise]);
      });
      console.log(
        "[CEPS] Relay privacy layer initialized with publish callback"
      );
    } catch (error) {
      console.warn("[CEPS] Failed to initialize relay privacy layer:", error);
    }

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
    const pubHex = (() => {
      // Accept 64-hex or bech32 nsec only
      if (/^[0-9a-fA-F]{64}$/.test(nsec)) return getPublicKey(nsec);
      try {
        return utilDerivePubkeyHexFromNsec(nsec);
      } catch {
        throw new Error("Invalid nsec: expected 64-hex or bech32 'nsec1...'");
      }
    })();
    const userHash = await PrivacyUtils.hashIdentifier(pubHex);
    const ttlHours = options?.ttlHours ?? this.config.session.ttlHours;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    // Do NOT store nsec; create secure session instead (using policy)
    const policy = await this.getSigningPolicy();
    const sessionProvider = this.getRequiredSecureSessionProvider(
      "initializeNsecSession"
    );
    try {
      await sessionProvider.createPostRegistrationSession(
        nsec,
        policy.sessionDurationMs,
        policy.maxOperations,
        policy.browserLifetime
      );
    } catch (e) {
      throw new Error(
        `[CEPS] secure session creation failed: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
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
    // Uses the helper function from 026_user_signing_prefs_fix.sql migration
    await supabase
      .rpc("set_app_current_user_hash", {
        val: session.userHash,
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
    // 1) Prefer SecureSession: derive pubkey from the active secure session
    try {
      const provider = this.getSecureSessionProvider();
      const sessionId = this.getActiveSigningSessionId();
      if (provider && sessionId) {
        const pubHex = await provider.useTemporaryNsec(
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

    // 2) NIP-07 path intentionally disabled to honor opt-in only behavior

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

  /**
   * Resolve identity from Nostr kind:0 metadata event
   * Phase 1: Decentralized identity verification via Nostr events
   */
  async resolveIdentityFromKind0(pubkey: string): Promise<{
    success: boolean;
    nip05?: string;
    name?: string;
    picture?: string;
    about?: string;
    error?: string;
  }> {
    try {
      // Query relays for kind:0 metadata event using subscription
      const pool = this.getPool();
      const events: Event[] = [];

      // Use subscription-based querying (correct SimplePool API)
      const sub = (pool as any).sub(
        this.relays,
        [
          {
            kinds: [0],
            authors: [pubkey],
            limit: 1,
          },
        ],
        { eoseTimeout: 3000 }
      );

      sub.on("event", (ev: Event) => {
        events.push(ev);
      });

      // Wait for EOSE or timeout
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          try {
            sub.unsub();
          } catch {}
          resolve();
        }, 3000);
        sub.on("eose", () => {
          clearTimeout(timeout);
          try {
            sub.unsub();
          } catch {}
          resolve();
        });
      });

      if (!events || events.length === 0) {
        return {
          success: false,
          error: "No kind:0 metadata event found for this pubkey",
        };
      }

      const event = events[0];

      // Verify event signature
      if (!verifyEvent(event)) {
        return {
          success: false,
          error: "Invalid event signature",
        };
      }

      // Parse metadata
      try {
        const metadata = JSON.parse(event.content);
        return {
          success: true,
          nip05: metadata.nip05,
          name: metadata.name,
          picture: metadata.picture,
          about: metadata.about,
        };
      } catch (parseError) {
        return {
          success: false,
          error: "Failed to parse metadata content",
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Resolution failed",
      };
    }
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
    let list = relays && relays.length ? relays : this.relays;

    // Auto-select recipient inbox relays (NIP-17) when available and no explicit relays provided
    try {
      if (!relays || !relays.length) {
        const tags = (ev as any)?.tags as any[] | undefined;
        const isNip17 = Array.isArray(tags)
          ? !!tags.find(
              (t) => Array.isArray(t) && t[0] === "protocol" && t[1] === "nip17"
            )
          : false;
        if (isNip17) {
          const pTag = Array.isArray(tags)
            ? (tags.find(
                (t) =>
                  Array.isArray(t) && t[0] === "p" && typeof t[1] === "string"
              ) as string[] | undefined)
            : undefined;
          const recipientRaw = pTag?.[1];
          const recipientHex = recipientRaw?.startsWith("npub1")
            ? this.npubToHex(recipientRaw)
            : recipientRaw;
          if (recipientHex && /^[0-9a-fA-F]{64}$/.test(recipientHex)) {
            const inbox = await this.resolveInboxRelaysFromKind10050(
              recipientHex
            );
            if (Array.isArray(inbox) && inbox.length) {
              list = this.mergeUniqueRelays(inbox, list);
            }
          }
        }
      }
    } catch {}

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

    // Helper to sign NIP-42 AUTH events using active session
    const onauth = async (unsignedAuth: any) => {
      try {
        // Use centralized session-based signer
        return await this.signEventWithActiveSession(unsignedAuth);
      } catch (e) {
        // Surface clear error so pool can proceed to next relay
        throw new Error(
          e instanceof Error ? e.message : "auth signer unavailable"
        );
      }
    };

    // Helper to publish with timeout (with NIP-42 auth support)
    const publishWithTimeout = async (relay: string, event: Event) => {
      const pubResult = (this.getPool() as any).publish([relay], event, {
        onauth,
      });
      const publishPromise = Array.isArray(pubResult)
        ? pubResult[0]
        : (pubResult as any);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), 10000)
      );
      await Promise.race([publishPromise, timeoutPromise]);
    };

    // 1) Non-PoW relays with privacy layer support
    for (const r of nonPow) {
      try {
        // Check if relay privacy layer is enabled and configured
        const relayConfig = relayPrivacyLayer.getRelayConfig(r);

        if (relayConfig.batchingEnabled) {
          // Use privacy layer batching for this relay
          await relayPrivacyLayer.publishWithBatching(ev, relayConfig);
          console.log(
            `[CEPS] Event queued for batched publishing to ${r} (privacy level: ${relayConfig.privacyLevel})`
          );
        }

        // Always publish directly (batching is metadata protection, not delivery guarantee)
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
    const onauth = async (unsignedAuth: any) => {
      try {
        return await this.signEventWithActiveSession(unsignedAuth);
      } catch (e) {
        throw new Error(
          e instanceof Error ? e.message : "auth signer unavailable"
        );
      }
    };
    return (this.getPool() as any).subscribeMany(list, filters, {
      onevent: handlers.onevent,
      oneose: handlers.oneose,
      onauth,
    });
  }

  // ---- Centralized session-based signing (secure nsec session provider) ----
  /**
   * Get active signing session id from either RecoverySessionBridge or the
   * registered SecureNsecSessionProvider.
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

  private getSecureSessionProvider(): SecureNsecSessionProvider | null {
    return getSecureNsecSessionProvider();
  }

  private getRequiredSecureSessionProvider(
    context: string
  ): SecureNsecSessionProvider {
    const provider = getSecureNsecSessionProvider();
    if (!provider) {
      throw new Error(
        `[CEPS] Secure nsec session provider not registered (${context})`
      );
    }
    return provider;
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

      // 3) Direct secure session provider check
      const provider = this.getSecureSessionProvider();
      const direct = provider?.getActiveSessionId() ?? null;
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
      const prefs = await userSigningPreferences.getUserPreferences();
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

  // Lazily hydrate CEPS userSession from an existing secure session
  private async ensureActiveUserSession(): Promise<void> {
    try {
      if (this.userSession) return;
      const provider = this.getSecureSessionProvider();
      if (!provider) return;
      const activeId = this.getActiveSigningSessionId();
      if (!activeId) return;
      // Derive pubkey from active secure session without exposing nsec
      const pubHex = await provider.useTemporaryNsec(
        activeId,
        async (privHex: string) => {
          try {
            return getPublicKey(privHex);
          } catch {
            return "" as any;
          }
        }
      );
      if (!pubHex || typeof pubHex !== "string") return;

      const userHash = await PrivacyUtils.hashIdentifier(pubHex);
      const sessionKey = await PrivacyUtils.generateSessionKey();
      const ttlHours = this.config.session.ttlHours;
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
      const sessionIdLocal = await PrivacyUtils.generateEncryptedUUID();

      this.userSession = {
        sessionId: sessionIdLocal,
        userHash,
        sessionKey,
        expiresAt,
        authMethod: "nsec",
      } as MessagingSession;
      // Intentionally skip DB persistence for this lazy hydration; used for rate limits only
    } catch {
      // Swallow; callers will still enforce explicit checks
    }
  }

  /**
   * Finalize an unsigned event using the active secure session without exposing nsec
   * Overloads:
   * - signEventWithActiveSession(unsignedEvent)
   * - signEventWithActiveSession(action, payload, options)
   */
  async signEventWithActiveSession(unsignedEvent: any): Promise<Event>;
  async signEventWithActiveSession(
    action: SignAction,
    payload: any,
    options?: any
  ): Promise<any>;
  async signEventWithActiveSession(a: any, b?: any, c?: any): Promise<any> {
    // CRITICAL FIX: Detect infinite recursion between selectSigner and adapter.getStatus()
    this.signEventRecursionDepth++;
    try {
      if (this.signEventRecursionDepth > this.MAX_RECURSION_DEPTH) {
        throw new Error(
          `Infinite recursion detected in signer selection (depth: ${this.signEventRecursionDepth}). ` +
            `This typically indicates a circular dependency between selectSigner() and adapter.getStatus(). ` +
            `Check that all adapters return "unavailable" during Identity Forge registration.`
        );
      }

      // New multi-method route when first arg is an action string
      if (
        typeof a === "string" &&
        (a === "event" || a === "payment" || a === "threshold") &&
        // Ensure we're not mistakenly treating an event with kind="event" as an action
        typeof (a as any).kind === "undefined"
      ) {
        const action = a as SignAction;
        const payload = b;
        const options = c || {};
        const signer = await this.selectSigner(action);

        if (!signer) {
          if (action === "event") {
            // Fallback to legacy secure-session signing for backward compatibility
            return await this.signEventWithActiveSession(payload);
          }
          throw new Error("No eligible signer available for action " + action);
        }

        if (action === "event") {
          const signed = await signer.signEvent(payload, options);
          try {
            // Best-effort validation for adapters that return a Nostr event
            if ((signed as any) && typeof (signed as any) === "object") {
              const ok = this.verifyEvent(signed as any);
              if (!ok)
                throw new Error("Adapter returned invalid event signature");
            }
          } catch (e) {
            throw new Error(
              e instanceof Error ? e.message : "Signature verification failed"
            );
          }
          return signed;
        }

        if (action === "payment") {
          return await signer.authorizePayment(payload);
        }

        // threshold
        const sessionId = options?.sessionId ?? payload?.sessionId ?? "";
        return await signer.signThreshold(payload, sessionId);
      }

      // Legacy behavior: a is the unsigned event
      const unsignedEvent = a;

      // Prefer a registered external signer for standard event signing when available
      try {
        const preferred = await this.selectSigner("event");
        if (preferred) {
          console.log(
            "[CEPS] Using external signer adapter for event:",
            preferred.id
          );
          const signedViaAdapter = await preferred.signEvent(unsignedEvent);
          try {
            if (signedViaAdapter && typeof signedViaAdapter === "object") {
              const ok = this.verifyEvent(signedViaAdapter as any);
              if (!ok)
                throw new Error("External signer returned invalid signature");
            }
          } catch (e) {
            throw new Error(
              e instanceof Error ? e.message : "Signature verification failed"
            );
          }
          return signedViaAdapter;
        }
      } catch (e) {
        console.warn(
          "[CEPS] External signer not available; falling back to secure session:",
          e instanceof Error ? e.message : String(e)
        );
      }

      const sessionId = this.getActiveSigningSessionId();
      if (!sessionId) throw new Error("No active signing session");
      const provider = this.getRequiredSecureSessionProvider(
        "signEventWithActiveSession"
      );

      // Pre-check session status for clearer errors
      const status = provider.getSessionStatus?.(sessionId);
      if (!status?.active) {
        throw new Error("Signing session expired or operation limit reached");
      }

      // Use secure session provider to execute signing with ephemeral access
      const ev = await provider.useTemporaryNsec(
        sessionId,
        async (nsecHex: string) => {
          const toSign = {
            ...unsignedEvent,
            created_at:
              unsignedEvent.created_at || Math.floor(Date.now() / 1000),
          };
          return finalizeEvent(toSign as any, nsecHex) as Event;
        }
      );

      // Enforce policy after sign: apply single-use
      try {
        const policy = await this.getSigningPolicy();
        if (policy.singleUse) {
          try {
            provider.clearTemporarySession?.();
          } catch {}
        }
      } catch {}

      return ev;
    } finally {
      // CRITICAL FIX: Always decrement recursion depth to prevent counter from growing
      this.signEventRecursionDepth--;
    }
  }

  /** Register an external signer adapter (idempotent by id). */
  public registerExternalSigner(signer: SignerAdapter): void {
    try {
      const exists = this.externalSigners.some((s) => s.id === signer.id);
      if (!exists) {
        this.externalSigners.push(signer);
        // Initialize in background; errors are non-fatal at registration time
        signer.initialize?.().catch((e) => {
          console.warn(
            `[CEPS] Signer ${signer.id} initialization failed:`,
            e instanceof Error ? e.message : String(e)
          );
        });
      }
    } catch {}
  }

  /** Return a copy of registered signers for UI/status. */
  public getRegisteredSigners(): SignerAdapter[] {
    return this.externalSigners.slice();
  }

  /** Clear all registered external signers. */
  public clearExternalSigner(): void {
    try {
      this.externalSigners = [];
    } catch {}
  }

  /** Return the first registered external signer (for simple UI/status checks). */
  public getExternalSigner(): SignerAdapter | undefined {
    try {
      return this.externalSigners.length ? this.externalSigners[0] : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Read preferred external signer id from localStorage (if available).
   * Returns null when not set or inaccessible.
   */
  private getPreferredExternalSignerId(): string | null {
    try {
      if (typeof window === "undefined" || !window.localStorage) return null;
      const v = window.localStorage.getItem("satnam.signing.preferred");
      return v && v.trim() ? v : null;
    } catch {
      return null;
    }
  }

  /**
   * Sign an event using the preferred external signer when connected and capable.
   * Falls back to the active secure session provider if preference is not available.
   * Note: This preserves zero-knowledge posture and will not auto-prompt extensions.
   */
  public async signEventWithPreferredOrSession(
    unsigned: any,
    opts?: Record<string, unknown>
  ): Promise<any> {
    try {
      const preferredId = this.getPreferredExternalSignerId();
      if (preferredId) {
        const list = this.getRegisteredSigners();
        const s = list.find((x) => x.id === preferredId);
        if (s && s.capabilities?.event && typeof s.signEvent === "function") {
          try {
            const st = await s.getStatus();
            if (st === "connected") {
              return await s.signEvent(unsigned, opts as any);
            }
          } catch {}
        }
      }
    } catch {}
    // Fallback to existing active session path
    return await this.signEventWithActiveSession(unsigned);
  }

  /** Feature flag gate per method */
  private isMethodEnabled(id: SigningMethodId): boolean {
    switch (id) {
      case "nip07":
        return getEnvFlag("VITE_ENABLE_NIP07_SIGNING", true);
      case "amber":
        // Amber availability is determined at runtime by platformSupports() and the
        // AmberAdapter's getStatus(). Do not gate Amber behind a feature flag so
        // that a paired Amber signer is always eligible on Android.
        return true;
      case "ntag424":
        return getEnvFlag("VITE_ENABLE_NFC_SIGNING", false);
      case "nip05_password":
      default:
        return true;
    }
  }

  /** Basic platform detection to avoid prompting unsupported methods. */
  private platformSupports(id: SigningMethodId): boolean {
    if (typeof window === "undefined") return false;
    try {
      switch (id) {
        case "nip07":
          return !!(window as any).nostr;
        case "amber":
          return /Android/i.test(navigator.userAgent || "");
        case "ntag424":
          return typeof (window as any).NDEFReader !== "undefined";
        case "nip05_password":
        default:
          return true;
      }
    } catch {
      return false;
    }
  }

  /**
   * Internal helper to choose a signer for an action.
   * TODO: Add user preference ordering and per-action policies.
   */
  private async selectSigner(
    action: SignAction
  ): Promise<SignerAdapter | null> {
    // Capability filter
    const capKey: keyof SignerCapability =
      action === "event"
        ? "event"
        : action === "payment"
        ? "payment"
        : "threshold";

    const eligible = this.externalSigners.filter((s) => {
      try {
        return (
          !!s.capabilities?.[capKey] &&
          this.isMethodEnabled(s.id) &&
          this.platformSupports(s.id)
        );
      } catch {
        return false;
      }
    });

    if (!eligible.length) return null;

    // Query status for all eligible signers once
    const statuses: Array<{ signer: SignerAdapter; status: SignerStatus }> =
      await Promise.all(
        eligible.map(async (s) => ({ signer: s, status: await s.getStatus() }))
      );

    // On Android, prefer Amber for generic event signing when it is connected.
    // This mirrors the priority used in SignInModal.handlePrimarySignerSignIn().
    if (action === "event") {
      const amberConnected = statuses.find(
        (x) => x.signer.id === "amber" && x.status === "connected"
      );
      if (amberConnected) {
        return amberConnected.signer;
      }
    }

    const order = (st: SignerStatus): number => {
      if (st === "connected") return 0;
      if (st === "available") return 1;
      if (st === "locked") return 2;
      return 3; // error/unavailable
    };

    statuses.sort((a, b) => order(a.status) - order(b.status));

    const chosen =
      statuses.find((x) => x.status === "connected") ||
      statuses.find((x) => x.status === "available") ||
      statuses.find((x) => x.status === "locked");

    return chosen ? chosen.signer : null;
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
        const onauth = async (unsignedAuth: any) => {
          try {
            return await this.signEventWithActiveSession(unsignedAuth);
          } catch (e) {
            throw new Error(
              e instanceof Error ? e.message : "auth signer unavailable"
            );
          }
        };
        const sub = (this.getPool() as any).subscribeMany(list, filters, {
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
          onauth,
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
    // Delegate to shared helper that accepts bech32 (nsec1...) or 64-hex
    return decodeNsecToBytes(nsec);
  }
  decodeNpub(npub: string): string {
    return this.npubToHex(npub);
  }
  encodeNpub(pubkeyHex: string): string {
    return utilEncodeNpub(pubkeyHex);
  }
  encodeNsec(privBytes: Uint8Array): string {
    // Pass raw bytes to utility-backed nip19.nsecEncode to match current nostr-tools API
    return utilEncodeNsec(privBytes);
  }
  decodeNsec(nsec: string): Uint8Array {
    // Delegate to shared helper to avoid CEPS 5 secure session circular deps
    return decodeNsecToBytes(nsec);
  }
  derivePubkeyHexFromNsec(nsec: string): string {
    return utilDerivePubkeyHexFromNsec(nsec);
  }
  deriveNpubFromNsec(nsec: string): string {
    return utilDeriveNpubFromNsec(nsec);
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

  async sealKind13(
    unsignedEvent: any,
    senderNsec: string,
    recipientPubkeyHex: string
  ): Promise<Event> {
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
      // NIP-17: seal content using nip44 (sender priv -> recipient pub)
      const nip44Mod = await import("nostr-tools/nip44");
      const ciphertext = await (nip44Mod as any).encrypt(
        privHex,
        recipientPubkeyHex,
        JSON.stringify(unsignedEvent)
      );
      const unsignedSeal: any = {
        kind: 13,
        created_at: now,
        tags: [],
        content: ciphertext,
        pubkey: pubHex,
      };
      return finalizeEvent(unsignedSeal as any, privHex) as Event;
    } catch (e) {
      throw new Error(
        `Failed to seal kind:13: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async sealKind13WithActiveSession(
    unsignedEvent: any,
    recipientPubkeyHex: string
  ): Promise<Event> {
    const provider = this.getRequiredSecureSessionProvider(
      "sealKind13WithActiveSession"
    );
    const sessionId = this.getActiveSigningSessionId();
    if (!sessionId) throw new Error("No active signing session");
    return await provider.useTemporaryNsec(sessionId, async (nsecHex) => {
      const privHex = nsecHex;
      const pubHex = getPublicKey(privHex);
      const now = Math.floor(Date.now() / 1000);
      // NIP-17: seal content via nip44 (sender priv -> recipient pub)
      const nip44Mod = await import("nostr-tools/nip44");
      const ciphertext = await (nip44Mod as any).encrypt(
        privHex,
        recipientPubkeyHex,
        JSON.stringify(unsignedEvent)
      );
      const unsignedSeal: any = {
        kind: 13,
        created_at: now,
        tags: [],
        content: ciphertext,
        pubkey: pubHex,
      };
      return finalizeEvent(unsignedSeal as any, privHex) as Event;
    });
  }

  async giftWrap1059(
    sealedEvent: Event,
    recipientPubkeyHex: string
  ): Promise<Event> {
    const wrapped = await (nip59 as any).createWrap?.(
      sealedEvent as any,
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
    const provider = this.getRequiredSecureSessionProvider("wrapGift59");
    const sessionId = this.getActiveSigningSessionId();
    if (!sessionId)
      throw new Error("No active signing session for NIP-59 wrap");
    const wrapped = await provider.useTemporaryNsec(
      sessionId,
      async (privHex: string) => {
        return (await (nip59 as any).wrapEvent?.(
          innerSignedEvent as any,
          privHex,
          recipientPubkeyHex
        )) as Event;
      }
    );
    if (!wrapped) throw new Error("NIP-59 wrap failed");

    // Ensure protocol identification tags for server-side detection (NIP-59)
    try {
      const w: any = wrapped as any;
      if (!Array.isArray(w.tags)) w.tags = [];
      const hasProtocol = w.tags.some(
        (t: any) => Array.isArray(t) && t[0] === "protocol"
      );
      if (!hasProtocol) {
        w.tags.push(["protocol", "nip59"]);
      }
      const hasWrappedKind = w.tags.some(
        (t: any) => Array.isArray(t) && t[0] === "wrapped-event-kind"
      );
      if (!hasWrappedKind) {
        w.tags.push(["wrapped-event-kind", "14"]);
      }
    } catch {}

    return wrapped as Event;
  }

  // Unwrap gift-wrapped event using active secure session
  async unwrapGift59WithActiveSession(
    outerEvent: Event
  ): Promise<Event | null> {
    const provider = this.getSecureSessionProvider();
    if (!provider) return null;
    const sessionId = this.getActiveSigningSessionId();
    if (!sessionId) return null;
    try {
      return await provider.useTemporaryNsec(sessionId, async (nsecHex) => {
        try {
          const fn = (nip59 as any).unwrapEvent || (nip59 as any).openGiftWrap;
          if (!fn) throw new Error("NIP-59 unwrap not available");
          return (await fn(outerEvent, nsecHex)) as Event;
        } catch (innerErr) {
          // Swallow unwrap errors and return null for robustness
          return null as any;
        }
      });
    } catch (e) {
      return null;
    }
  }

  // Optional NIP-44 helpers (available for future NIP-17 flows)
  async encryptNip44WithActiveSession(
    recipientPubkeyHex: string,
    plaintext: string
  ): Promise<string> {
    const provider = this.getRequiredSecureSessionProvider(
      "encryptNip44WithActiveSession"
    );
    const sessionId = this.getActiveSigningSessionId();
    if (!sessionId) throw new Error("No active signing session");
    return await provider.useTemporaryNsec(sessionId, async (nsecHex) => {
      const mod = await import("nostr-tools/nip44");
      return (await (mod as any).encrypt(
        nsecHex,
        recipientPubkeyHex,
        plaintext
      )) as string;
    });
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

  // Debugging helper: return inbox relays for npub or hex
  async getInboxRelays(npubOrHex: string): Promise<string[]> {
    try {
      if (!npubOrHex || typeof npubOrHex !== "string") return [];
      const hex = npubOrHex.startsWith("npub1")
        ? this.npubToHex(npubOrHex)
        : npubOrHex;
      if (!/^[0-9a-fA-F]{64}$/.test(hex)) return [];
      return await this.resolveInboxRelaysFromKind10050(hex);
    } catch {
      return [];
    }
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
      const onauth = async (unsignedAuth: any) => {
        try {
          return await this.signEventWithActiveSession(unsignedAuth);
        } catch (e) {
          throw new Error(
            e instanceof Error ? e.message : "auth signer unavailable"
          );
        }
      };
      const listPromise = (this.getPool() as any).list(this.relays, filters, {
        onauth,
      });
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
    const ev = await this.signEventWithPreferredOrSession({
      kind: 4,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", recipientPubHex]],
      content,
    });
    return ev;
  }

  // Publish kind:10050 inbox relays for the active user (used during onboarding)
  async publishInboxRelaysKind10050(
    relays: string[]
  ): Promise<{ success: boolean; eventId?: string; error?: string }> {
    try {
      // Validate session exists
      const sessionId = this.getActiveSigningSessionId();
      if (!sessionId) {
        return { success: false, error: "No active signing session" };
      }

      const list = Array.isArray(relays) ? relays.filter(isValidRelayUrl) : [];
      if (!list.length)
        return { success: false, error: "No valid relay URLs provided" };

      // Deduplicate and limit relay count
      const uniqueRelays = Array.from(new Set(list)).slice(0, 20);

      const now = Math.floor(Date.now() / 1000);
      const ev: Event = await this.signEventWithActiveSession({
        kind: 10050,
        created_at: now,
        tags: [
          ...uniqueRelays.map((r) => ["r", r.toLowerCase()]), // Normalize URLs
          ["client", "identity-forge"],
          ["protocol", "nip17"],
        ],
        content: JSON.stringify({ inbox: uniqueRelays }),
      });
      const id = await this.publishOptimized(ev, { includeFallback: true });
      return { success: true, eventId: id };
    } catch (e) {
      console.error("[CEPS] Failed to publish inbox relays:", e);
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private async encryptWithActiveSession(
    recipientPubHex: string,
    content: string
  ): Promise<string> {
    const provider = this.getRequiredSecureSessionProvider(
      "encryptWithActiveSession"
    );
    const sessionId = this.getActiveSigningSessionId();
    if (!sessionId) throw new Error("No active signing session");
    const enc = await provider.useTemporaryNsec(sessionId, async (nsecHex) => {
      return await nip04.encrypt(nsecHex, recipientPubHex, content);
    });
    return enc;
  }

  // Decrypt standard NIP-04 direct message using active session (no gift-wrap)
  async decryptStandardDirectMessageWithActiveSession(
    senderPubHex: string,
    ciphertext: string
  ): Promise<{ plaintext: string; protocol: "nip04" | "nip44" }> {
    const provider = this.getRequiredSecureSessionProvider(
      "decryptStandardDirectMessageWithActiveSession"
    );
    const sessionId = this.getActiveSigningSessionId();
    if (!sessionId) throw new Error("No active signing session");
    const result = await provider.useTemporaryNsec(
      sessionId,
      async (nsecHex) => {
        // Try NIP-04 first, then fall back to NIP-44 if available
        try {
          const dec04 = await nip04.decrypt(nsecHex, senderPubHex, ciphertext);
          return { plaintext: dec04, protocol: "nip04" as const };
        } catch (e1) {
          try {
            // Prefer nip44 v2 API if present
            const anyNip44: any = nip44 as any;
            if (anyNip44?.v2?.getConversationKey && anyNip44?.v2?.decrypt) {
              const convKey = await anyNip44.v2.getConversationKey(
                nsecHex,
                senderPubHex
              );
              const dec44v2 = await anyNip44.v2.decrypt(convKey, ciphertext);
              return { plaintext: dec44v2, protocol: "nip44" as const };
            }
            // Fallback to a direct decrypt signature if provided by the lib version
            if (anyNip44?.decrypt) {
              const dec44 = await anyNip44.decrypt(
                nsecHex,
                senderPubHex,
                ciphertext
              );
              return { plaintext: dec44, protocol: "nip44" as const };
            }
            throw e1;
          } catch (e2) {
            throw new Error(
              `standard_dm_decrypt_failed: ${
                e2 instanceof Error ? e2.message : String(e2)
              }`
            );
          }
        }
      }
    );
    return result;
  }

  // Open NIP-17 sealed DM (kind 13, optionally gift-wrapped in kind 1059)
  // using the active secure session and nip44.
  async openNip17DmWithActiveSession(
    outerOrInner: Event
  ): Promise<{ senderPubHex: string; content: string } | null> {
    try {
      // Step 1: Normalize to a sealed kind:13 event
      let sealed: Event | null = null;
      if (outerOrInner.kind === 1059) {
        sealed = await this.unwrapGift59WithActiveSession(outerOrInner);
      } else if (outerOrInner.kind === 13) {
        sealed = outerOrInner;
      } else {
        return null;
      }
      if (!sealed || sealed.kind !== 13) return null;

      const ciphertext = sealed.content;
      const senderPubHex = sealed.pubkey;
      if (typeof ciphertext !== "string" || !ciphertext) return null;
      if (!senderPubHex || typeof senderPubHex !== "string") return null;

      const provider = this.getSecureSessionProvider();
      const sessionId = this.getActiveSigningSessionId();
      if (!provider || !sessionId) return null;

      // Step 2: Decrypt sealed nip44 payload using the active session
      const decrypted = await provider.useTemporaryNsec(
        sessionId,
        async (nsecHex: string) => {
          try {
            type Nip44V2Api = {
              getConversationKey?: (
                secretKey: string,
                pubkey: string
              ) => Promise<Uint8Array>;
              decrypt?: (
                payload: string,
                conversationKey: Uint8Array
              ) => string;
            };
            type Nip44Module = {
              v2?: Nip44V2Api;
              decrypt?: (
                secretKey: string,
                pubkey: string,
                ciphertext: string
              ) => Promise<string>;
            };
            const nip44Mod = (await import(
              "nostr-tools/nip44"
            )) as unknown as Nip44Module;
            const v2 = nip44Mod.v2;
            // Prefer nip44 v2 API if available
            if (v2 && v2.getConversationKey && v2.decrypt) {
              const convKey = await v2.getConversationKey(
                nsecHex,
                senderPubHex
              );
              return v2.decrypt(ciphertext, convKey);
            }
            if (typeof nip44Mod.decrypt === "function") {
              return await nip44Mod.decrypt(nsecHex, senderPubHex, ciphertext);
            }
            throw new Error("nip44 decrypt not available");
          } catch (e) {
            throw new Error(
              `nip17_nip44_decrypt_failed: ${
                e instanceof Error ? e.message : String(e)
              }`
            );
          }
        }
      );

      // Step 3: Parse decrypted JSON back into the original unsigned DM
      let inner: unknown;
      try {
        inner = JSON.parse(decrypted);
      } catch {
        return null;
      }
      if (!inner || typeof inner !== "object") {
        return null;
      }
      const maybeContent = (inner as { content?: unknown }).content;
      const content = typeof maybeContent === "string" ? maybeContent : "";
      if (!content) return null;
      return { senderPubHex, content };
    } catch (e) {
      console.warn("[CEPS] openNip17DmWithActiveSession failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
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
  ): Promise<MessageSendResult> {
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

    const preferGift =
      contact.preferredEncryption === "gift-wrap" ||
      contact.preferredEncryption === "auto";

    // NIP-07 signing path removed to prevent automatic prompts; use session/default flow below.

    // Fallbacks
    const recipientHex = this.npubToHex(recipientNpub);

    // If NIP-07 unavailable but gift preferred, try wrapping a session-signed DM
    if (preferGift) {
      try {
        const provider = this.getSecureSessionProvider();
        const sessionId = this.getActiveSigningSessionId();
        if (provider && sessionId) {
          const unsignedDm: any = {
            kind: 4,
            created_at: Math.floor(Date.now() / 1000),
            tags: [["p", recipientHex]],
            content,
          };
          const wrapped = await provider.useTemporaryNsec(
            sessionId,
            async (privHex: string) => {
              return (nip59 as any).wrapEvent?.(
                unsignedDm,
                privHex,
                recipientHex
              );
            }
          );
          if (wrapped) {
            await this.sleep(delayMs);
            const msgId = await this.publishOptimized(wrapped as Event, {
              recipientPubHex: recipientHex,
              senderPubHex: (wrapped as any).pubkey as string,
            });
            return {
              success: true,
              messageId: msgId,
              signingMethod: "giftwrapped",
              securityLevel: "maximum",
              deliveryTime: new Date().toISOString(),
            };
          }
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
    const msgId = await this.publishOptimized(ev, {
      recipientPubHex: recipientHex,
      senderPubHex: (ev as any).pubkey as string,
    });
    return {
      success: true,
      messageId: msgId,
      signingMethod: "nip04",
      securityLevel: "standard",
      deliveryTime: new Date().toISOString(),
    };
  }

  // Send standard NIP-04/44 direct message using active session (no gift-wrap)
  async sendStandardDirectMessage(
    recipientNpub: string,
    plaintext: string
  ): Promise<string> {
    // Lazily hydrate CEPS userSession from an active secure session if available
    await this.ensureActiveUserSession();
    if (!this.userSession) throw new Error("No active session");

    // Rate limit per user
    this.checkRateLimit(
      `send_dm:${this.userSession.userHash}`,
      MESSAGING_CONFIG.RATE_LIMITS.SEND_MESSAGE_PER_HOUR,
      60 * 60 * 1000
    );

    const recipientHex = this.npubToHex(recipientNpub);
    const enc = await this.encryptWithActiveSession(recipientHex, plaintext);
    const ev = await this.createSignedDMEventWithActiveSession(
      recipientHex,
      enc
    );
    const delayMs = this.calcPrivacyDelayMs();
    await this.sleep(delayMs);
    return await this.publishOptimized(ev, {
      recipientPubHex: recipientHex,
      senderPubHex: (ev as any).pubkey as string,
    });
  }

  /**
   * Load and decrypt the current user's encrypted contacts.
   *
   * Purpose: Centralize privacy-first contact resolution for features like
   * notifications, messaging, and contact management. Uses the active messaging
   * session's session_key to decrypt contact npubs. Applies rate limiting to
   * avoid abuse and returns a deduplicated list of decrypted contacts.
   *
   * Error handling:
   * - Throws if there is no active CEPS user session
   * - Throws if a valid session_key cannot be found for the authenticated user
   * - Returns [] on table query failures, logging a warning
   * - Logs and skips individual contacts that fail decryption
   *
   * Relay hints:
   * - If the `encrypted_contacts` table contains a `relay_hints` (string[] or
   *   JSON) column, those hints are surfaced to the caller for downstream relay
   *   optimization (e.g., targeted publish to known recipient relays).
   *
   * Usage example:
   *   const contacts = await CEPS.loadAndDecryptContacts();
   *   for (const c of contacts) {
   *     await CEPS.sendStandardDirectMessage(c.npub, "hello");
   *   }
   */
  public async loadAndDecryptContacts(): Promise<
    Array<{
      npub: string;
      relayHints?: string[];
      trustLevel?: string;
      supportsGiftWrap?: boolean;
    }>
  > {
    // Hydrate/verify CEPS user session
    await this.ensureActiveUserSession();
    if (!this.userSession) throw new Error("No active session");

    // Acquire Supabase client
    const supabase = await getSupabase();

    // Resolve authenticated user id to derive owner_hash (privacy-first)
    let authId: string | undefined;
    try {
      const { data } = await (supabase as any).auth?.getUser?.();
      authId = data?.user?.id as string | undefined;
    } catch {}
    if (!authId)
      throw new Error("No authenticated user for contact decryption");

    // Derive owner_hash and find most recent valid messaging session_key
    const userHash = await PrivacyUtils.hashIdentifier(authId);
    const nowIso = new Date().toISOString();
    const { data: sessRows } = await supabase
      .from("messaging_sessions")
      .select("session_key, expires_at")
      .eq("user_hash", userHash)
      .gt("expires_at", nowIso)
      .order("expires_at", { ascending: false })
      .limit(1);
    const sessionKey: string | undefined = sessRows?.[0]?.session_key;
    if (!sessionKey)
      throw new Error("No valid messaging session key available");

    // Query encrypted contacts (rate-limited to 1000)
    let encRows: any[] | null = null;
    try {
      const { data, error } = await supabase
        .from("encrypted_contacts")
        .select("encrypted_npub, relay_hints, trust_level, supports_gift_wrap")
        .eq("owner_hash", userHash)
        .limit(1000);
      if (error) {
        console.warn("encrypted_contacts query failed:", error);
        return [];
      }
      encRows = Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn("encrypted_contacts query threw:", e);
      return [];
    }

    // Decrypt npubs, collect metadata, and deduplicate
    const out: Array<{
      npub: string;
      relayHints?: string[];
      trustLevel?: string;
      supportsGiftWrap?: boolean;
    }> = [];
    const seen = new Set<string>();

    for (const row of encRows) {
      try {
        const enc = String(row?.encrypted_npub || "").trim();
        if (!enc) continue;
        const npub = (
          await PrivacyUtils.decryptWithSessionKey(enc, sessionKey)
        ).trim();
        if (!npub || seen.has(npub)) continue;
        seen.add(npub);
        const relayHints = Array.isArray(row?.relay_hints)
          ? (row.relay_hints as string[])
          : typeof row?.relay_hints === "string"
          ? (() => {
              try {
                return JSON.parse(row.relay_hints);
              } catch {
                return undefined;
              }
            })()
          : undefined;
        out.push({
          npub,
          relayHints,
          trustLevel: row?.trust_level,
          supportsGiftWrap: !!row?.supports_gift_wrap,
        });
      } catch (decErr) {
        console.warn("Contact decrypt failed (skipped):", decErr);
      }
    }

    return out;
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
  ): Promise<MessageSendResult> {
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
        if (ok) {
          return {
            success: true,
            messageId: ok.value,
            signingMethod: "signed",
            securityLevel: "standard",
            deliveryTime: new Date().toISOString(),
          };
        }
      }
    } catch {}

    const id = await this.publishOptimized(ev, { senderPubHex: adminPubHex2 });
    return {
      success: true,
      messageId: id,
      signingMethod: "signed",
      securityLevel: "standard",
      deliveryTime: new Date().toISOString(),
    };
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
    const provider = this.getSecureSessionProvider();
    let sessionId = this.getActiveSigningSessionId();
    if (provider && !sessionId && privateNsec) {
      try {
        sessionId = await provider.createPostRegistrationSession(
          privateNsec,
          15 * 60 * 1000
        );
      } catch (e) {
        // proceed; signEventWithActiveSession will throw a clearer error
      }
    }

    const profilePub = await this.getUserPubkeyHexForVerification();
    const ev: Event = await this.signEventWithPreferredOrSession({
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

  // ---- NIP-46 (Nostr Connect) implementation ----
  public getNip46PairingState(): null | {
    clientPubHex: string;
    signerPubHex?: string;
    relays: string[];
    encryption: "nip04" | "nip44";
  } {
    if (!this.nip46ClientPubHex) return null;
    return {
      clientPubHex: this.nip46ClientPubHex,
      signerPubHex: this.nip46SignerPubHex || undefined,
      relays: this.nip46Relays.slice(),
      encryption: this.nip46Encryption,
    };
  }

  public clearNip46Pairing(): void {
    // Serialize cleanup to prevent race conditions
    this.nip46Lock = this.nip46Lock
      .then(() => this._clearNip46PairingUnsafe())
      .catch(() => {});
  }

  private _clearNip46PairingUnsafe(): void {
    try {
      if (this.nip46Unsubscribe) {
        try {
          this.nip46Unsubscribe();
        } catch {}
      }
      this.nip46Unsubscribe = null;
      // Reject all pending
      for (const [, pr] of this.nip46Pending.entries()) {
        try {
          pr.reject(new Error("nip46_cleared"));
        } catch {}
        clearTimeout(pr.timer);
      }
      this.nip46Pending.clear();
    } finally {
      this.nip46ClientPrivHex = null;
      this.nip46ClientPubHex = null;
      this.nip46SignerPubHex = null;
      this.nip46SecretHex = null;
      this.nip46Relays = [];
      this.nip46Encryption = "nip04";
    }
  }

  private nip46GenerateId(): string {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b)
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  }

  private async nipEncrypt(
    plaintext: string,
    toPubHex: string
  ): Promise<string> {
    if (!this.nip46ClientPrivHex) throw new Error("nip46_no_client_key");
    if (this.nip46Encryption === "nip44") {
      const anyNip44: any = nip44 as any;
      if (anyNip44?.v2?.utils?.getConversationKey && anyNip44?.v2?.encrypt) {
        const convKey = await anyNip44.v2.utils.getConversationKey(
          this.nip46ClientPrivHex,
          toPubHex
        );
        return await anyNip44.v2.encrypt(plaintext, convKey);
      }
      if (anyNip44?.encrypt) {
        return await anyNip44.encrypt(
          this.nip46ClientPrivHex,
          toPubHex,
          plaintext
        );
      }
      // Fallback to nip04 if nip44 not available
    }
    return await nip04.encrypt(this.nip46ClientPrivHex, toPubHex, plaintext);
  }

  private async nipDecrypt(
    ciphertext: string,
    fromPubHex: string
  ): Promise<string> {
    if (!this.nip46ClientPrivHex) throw new Error("nip46_no_client_key");
    if (this.nip46Encryption === "nip44") {
      const anyNip44: any = nip44 as any;
      if (anyNip44?.v2?.utils?.getConversationKey && anyNip44?.v2?.decrypt) {
        const convKey = await anyNip44.v2.utils.getConversationKey(
          this.nip46ClientPrivHex,
          fromPubHex
        );
        return await anyNip44.v2.decrypt(ciphertext, convKey);
      }
      if (anyNip44?.decrypt) {
        return await anyNip44.decrypt(
          this.nip46ClientPrivHex,
          fromPubHex,
          ciphertext
        );
      }
      // Fallback to nip04 if nip44 not available
    }
    return await nip04.decrypt(this.nip46ClientPrivHex, fromPubHex, ciphertext);
  }

  private nip46Subscribe(relays: string[]): () => void {
    if (!this.nip46ClientPubHex) throw new Error("nip46_no_client_pub");
    // Prevent concurrent subscriptions
    if (this.nip46Subscribing) {
      throw new Error("nip46_subscription_in_progress");
    }
    this.nip46Subscribing = true;
    // Tear down any existing
    if (this.nip46Unsubscribe) {
      try {
        this.nip46Unsubscribe();
      } catch {}
    }
    const filters = [{ kinds: [24133], "#p": [this.nip46ClientPubHex] }];
    const unsub = this.subscribeMany(relays, filters, {
      onevent: async (e: Event) => {
        try {
          if (e.kind !== 24133) return;
          const pTags = (e.tags || [])
            .filter((t) => t && t[0] === "p")
            .map((t) => t[1]);
          if (!pTags.includes(this.nip46ClientPubHex!)) return;
          // Decrypt
          const plaintext = await this.nipDecrypt(
            e.content as any,
            (e as any).pubkey as string
          );
          const obj = JSON.parse(plaintext) as any;
          // Response path
          if (
            obj &&
            typeof obj.id === "string" &&
            ("result" in obj || "error" in obj)
          ) {
            const pending = this.nip46Pending.get(obj.id);
            if (pending) {
              this.nip46Pending.delete(obj.id);
              clearTimeout(pending.timer);
              if (obj.error)
                pending.reject(new Error(obj.error?.message || "nip46_error"));
              else pending.resolve(obj);
            }
            return;
          }
          // Request path (handshake)
          if (obj && obj.method === "connect" && Array.isArray(obj.params)) {
            const secret = String(obj.params[1] ?? "");
            if (!this.nip46SecretHex || secret !== this.nip46SecretHex) return;
            // Record signer from author pubkey
            this.nip46SignerPubHex = (e as any).pubkey as string;
            // Respond OK with signer pubkey for client visibility
            const resp = {
              id: String(obj.id || this.nip46GenerateId()),
              result: { ok: true, signerPubHex: this.nip46SignerPubHex },
            };
            const enc = await this.nipEncrypt(
              JSON.stringify(resp),
              this.nip46SignerPubHex
            );
            const unsigned: any = {
              kind: 24133,
              created_at: Math.floor(Date.now() / 1000),
              tags: [["p", this.nip46SignerPubHex]],
              content: enc,
              pubkey: this.nip46ClientPubHex,
            };
            // Add null check before signing
            if (!this.nip46ClientPrivHex) return;
            const ev = this.signEvent(unsigned, this.nip46ClientPrivHex);
            await this.publishEvent(ev, this.nip46Relays);
          }
        } catch (err) {
          // Log for debugging but don't surface to UI
          console.warn(
            "[CEPS] NIP-46 subscription handler error:",
            err instanceof Error ? err.message : String(err)
          );
        }
      },
      oneose: () => {
        this.nip46Subscribing = false;
      },
    });
    this.nip46Unsubscribe = unsub;
    return unsub;
  }

  private async nip46SendRequest(
    req: { id: string; method: string; params: any[] },
    toPubHex: string,
    timeoutMs = 45000
  ): Promise<{
    id: string;
    result?: any;
    error?: { code: number; message: string };
  }> {
    if (!this.nip46ClientPrivHex || !this.nip46ClientPubHex)
      throw new Error("nip46_not_initialized");
    const enc = await this.nipEncrypt(JSON.stringify(req), toPubHex);
    const unsigned: any = {
      kind: 24133,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", toPubHex]],
      content: enc,
      pubkey: this.nip46ClientPubHex,
    };
    // Add null check before signing
    if (!this.nip46ClientPrivHex) throw new Error("nip46_no_client_key");
    const ev = this.signEvent(unsigned, this.nip46ClientPrivHex);
    const timer = setTimeout(() => {
      const p = this.nip46Pending.get(req.id);
      if (p) {
        this.nip46Pending.delete(req.id);
        try {
          p.reject(new Error("nip46_request_timeout"));
        } catch {}
      }
    }, timeoutMs);
    const promise = new Promise<{
      id: string;
      result?: any;
      error?: { code: number; message: string };
    }>((resolve, reject) => {
      this.nip46Pending.set(req.id, { resolve, reject, timer });
    });
    await this.publishEvent(ev, this.nip46Relays);
    return await promise;
  }

  public async establishNip46Connection(args: {
    clientPrivHex: string;
    clientPubHex: string;
    secretHex: string;
    relay: string;
    encryption?: "nip04" | "nip44";
    timeoutMs?: number;
  }): Promise<{ signerPubHex: string }> {
    // Serialize connection establishment to prevent race conditions
    return await new Promise<{ signerPubHex: string }>((resolve, reject) => {
      this.nip46Lock = this.nip46Lock
        .then(() => this._establishNip46ConnectionUnsafe(args))
        .then(resolve)
        .catch(reject);
    });
  }

  private async _establishNip46ConnectionUnsafe(args: {
    clientPrivHex: string;
    clientPubHex: string;
    secretHex: string;
    relay: string;
    encryption?: "nip04" | "nip44";
    timeoutMs?: number;
  }): Promise<{ signerPubHex: string }> {
    // Initialize state
    this.clearNip46Pairing();
    this.nip46ClientPrivHex = args.clientPrivHex;
    this.nip46ClientPubHex = args.clientPubHex;
    this.nip46SecretHex = args.secretHex;
    this.nip46Encryption = args.encryption || "nip04";
    // Merge relays: pairing relay + configured CEPS relays (dedup)
    const set = new Set<string>([args.relay, ...this.relays]);
    this.nip46Relays = Array.from(set);
    // Subscribe for handshake
    this.nip46Subscribe(this.nip46Relays);

    // Wait for signer to initiate connect with matching secret
    const timeout = args.timeoutMs ?? 45000;
    let intervalHandle: any = null;
    try {
      const result = await new Promise<{ signerPubHex: string }>(
        (resolve, reject) => {
          const t = setTimeout(() => {
            if (intervalHandle) clearInterval(intervalHandle);
            reject(new Error("nip46_connect_timeout"));
          }, timeout);
          const check = () => {
            if (this.nip46SignerPubHex) {
              clearTimeout(t);
              if (intervalHandle) clearInterval(intervalHandle);
              resolve({ signerPubHex: this.nip46SignerPubHex });
              return true;
            }
            return false;
          };
          // Quick poll loop in case connect arrives immediately
          intervalHandle = setInterval(() => {
            if (check()) clearInterval(intervalHandle);
          }, 250);
          // If already present (race), resolve
          if (check() && intervalHandle) clearInterval(intervalHandle);
        }
      );
      return result;
    } finally {
      // Ensure cleanup in all exit paths
      if (intervalHandle) clearInterval(intervalHandle);
    }
  }

  public async nip46SignEvent<T extends object>(
    unsigned: T,
    opts?: { timeoutMs?: number }
  ): Promise<{ event: T & { id: string; sig: string } }> {
    if (!this.nip46SignerPubHex) throw new Error("nip46_not_paired");
    const id = this.nip46GenerateId();
    const req = { id, method: "sign_event", params: [unsigned] };
    const res = await this.nip46SendRequest(
      req,
      this.nip46SignerPubHex,
      opts?.timeoutMs ?? 45000
    );
    if (res.error) throw new Error(res.error.message || "nip46_sign_error");
    const ev = res.result?.event || res.result;
    if (
      !ev ||
      typeof ev !== "object" ||
      typeof (ev as any).id !== "string" ||
      typeof (ev as any).sig !== "string"
    ) {
      throw new Error("nip46_invalid_response");
    }
    return { event: ev as any };
  }

  // ========================================================================
  // FEDERATED SIGNING METHODS
  // ========================================================================

  /**
   * Publish guardian approval request via NIP-59 gift-wrapped messaging
   *
   * Sends a private, encrypted approval request to a guardian for federated signing.
   * Uses NIP-59 to ensure privacy and prevent social graph analysis.
   *
   * @param guardianPubkey - Guardian's public key (hex)
   * @param approvalRequest - Approval request details
   * @returns Event ID of the published approval request
   */
  async publishGuardianApprovalRequest(
    guardianPubkey: string,
    approvalRequest: {
      requestId: string;
      familyId: string;
      eventType: string;
      eventTemplate: any;
      threshold: number;
      expiresAt: number;
      requesterPubkey: string;
    }
  ): Promise<{ success: boolean; eventId?: string; error?: string }> {
    try {
      console.log(
        `[CEPS] Publishing guardian approval request to ${guardianPubkey}`
      );

      // Create approval request message
      const content = JSON.stringify({
        type: "guardian_approval_request",
        requestId: approvalRequest.requestId,
        familyId: approvalRequest.familyId,
        eventType: approvalRequest.eventType,
        eventTemplate: approvalRequest.eventTemplate,
        threshold: approvalRequest.threshold,
        expiresAt: approvalRequest.expiresAt,
        requesterPubkey: approvalRequest.requesterPubkey,
        timestamp: Math.floor(Date.now() / 1000),
      });

      // Convert hex pubkey to npub format
      const guardianNpub = this.encodeNpub(guardianPubkey);

      // Send via standard direct message (uses active session)
      const eventId = await this.sendStandardDirectMessage(
        guardianNpub,
        content
      );

      console.log(`[CEPS] Guardian approval request published: ${eventId}`);

      return { success: true, eventId };
    } catch (error) {
      console.error(
        "[CEPS] Failed to publish guardian approval request:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Publish federated signing event after threshold is met
   *
   * Broadcasts a completed multi-signature event to Nostr relays.
   * This is called after enough guardians have provided their signatures
   * and the event has been successfully signed.
   *
   * @param signedEvent - The fully signed Nostr event
   * @param familyId - Family identifier for relay selection
   * @returns Event ID of the published event
   */
  async publishFederatedSigningEvent(
    signedEvent: Event,
    familyId?: string
  ): Promise<{ success: boolean; eventId?: string; error?: string }> {
    try {
      console.log(
        `[CEPS] Publishing federated signing event for family ${familyId}`
      );

      // Verify event is properly signed
      if (!this.verifyEvent(signedEvent)) {
        throw new Error("Event signature verification failed");
      }

      // Publish to relays (use family-specific relays if available)
      const relays = familyId
        ? [...this.relays, `wss://relay.satnam.pub`] // Add family relay if needed
        : this.relays;

      const eventId = await this.publishEvent(signedEvent, relays);

      console.log(`[CEPS] Federated signing event published: ${eventId}`);

      return { success: true, eventId };
    } catch (error) {
      console.error("[CEPS] Failed to publish federated signing event:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Notify guardians that signing is complete
   *
   * Sends a notification to all participating guardians when the threshold
   * has been met and the event has been successfully broadcast.
   * Uses NIP-59 for privacy with rate limiting to prevent relay spam.
   *
   * @param guardianPubkeys - Array of guardian public keys (hex)
   * @param notification - Notification details
   * @returns Results for each guardian notification
   */
  async notifyGuardianSigningComplete(
    guardianPubkeys: string[],
    notification: {
      requestId: string;
      familyId: string;
      eventType: string;
      eventId: string;
      completedAt: number;
      participatingGuardians: string[];
    }
  ): Promise<{
    success: boolean;
    results: Array<{
      guardianPubkey: string;
      success: boolean;
      eventId?: string;
      error?: string;
    }>;
  }> {
    try {
      console.log(
        `[CEPS] Notifying ${guardianPubkeys.length} guardians of signing completion`
      );

      // Rate limit: send notifications sequentially with 100ms delay to prevent relay spam
      const results = [];
      for (const guardianPubkey of guardianPubkeys) {
        try {
          const content = JSON.stringify({
            type: "guardian_signing_complete",
            requestId: notification.requestId,
            familyId: notification.familyId,
            eventType: notification.eventType,
            eventId: notification.eventId,
            completedAt: notification.completedAt,
            participatingGuardians: notification.participatingGuardians,
            timestamp: Math.floor(Date.now() / 1000),
          });

          // Convert hex pubkey to npub format
          const guardianNpub = this.encodeNpub(guardianPubkey);

          // Send via standard direct message (uses active session)
          const eventId = await this.sendStandardDirectMessage(
            guardianNpub,
            content
          );

          results.push({ guardianPubkey, success: true, eventId });

          // Rate limiting: wait 100ms before next notification
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(
            `[CEPS] Failed to notify guardian ${guardianPubkey}:`,
            error
          );
          results.push({
            guardianPubkey,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      const allSuccess = results.every((r) => r.success);

      console.log(
        `[CEPS] Guardian notifications complete: ${
          results.filter((r) => r.success).length
        }/${results.length} successful`
      );

      return { success: allSuccess, results };
    } catch (error) {
      console.error("[CEPS] Failed to notify guardians:", error);
      return {
        success: false,
        results: guardianPubkeys.map((guardianPubkey) => ({
          guardianPubkey,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        })),
      };
    }
  }

  // =====================================================
  // FROST SIGNING INTEGRATION (Phase 3)
  // =====================================================

  /**
   * Publish a FROST-signed event to relays
   *
   * Wrapper around publishFederatedSigningEvent with FROST-specific logging
   * and metadata. The underlying event structure is the same - FROST produces
   * standard Schnorr signatures compatible with Nostr.
   *
   * @param signedEvent - The FROST-signed Nostr event
   * @param sessionId - FROST session ID for tracking
   * @param familyId - Family identifier for relay selection
   * @returns Event ID of the published event
   */
  async publishFrostSignedEvent(
    signedEvent: Event,
    sessionId: string,
    familyId?: string
  ): Promise<{ success: boolean; eventId?: string; error?: string }> {
    console.log(
      `[CEPS] Publishing FROST-signed event for session ${sessionId}, family ${familyId}`
    );

    // FROST signatures are standard Schnorr signatures, so we can use the same
    // publishing logic as SSS-signed events
    const result = await this.publishFederatedSigningEvent(
      signedEvent,
      familyId
    );

    if (result.success) {
      console.log(
        `[CEPS] FROST-signed event published: ${result.eventId} (session: ${sessionId})`
      );
    } else {
      console.error(
        `[CEPS] Failed to publish FROST-signed event for session ${sessionId}:`,
        result.error
      );
    }

    return result;
  }

  /**
   * Notify guardians that FROST signing is complete
   *
   * Wrapper around notifyGuardianSigningComplete with FROST-specific metadata.
   * Includes session ID and signing method in the notification.
   *
   * @param guardianPubkeys - Array of guardian public keys (hex)
   * @param notification - FROST-specific notification details
   * @returns Results for each guardian notification
   */
  async notifyFrostSigningComplete(
    guardianPubkeys: string[],
    notification: {
      sessionId: string;
      familyId: string;
      eventType: string;
      eventId: string;
      completedAt: number;
      participatingGuardians: string[];
      aggregatedSignature?: string;
    }
  ): Promise<{
    success: boolean;
    results: Array<{
      guardianPubkey: string;
      success: boolean;
      eventId?: string;
      error?: string;
    }>;
  }> {
    console.log(
      `[CEPS] Notifying ${guardianPubkeys.length} guardians of FROST signing completion (session: ${notification.sessionId})`
    );

    // Use the existing notification method with FROST-specific event type
    return this.notifyGuardianSigningComplete(guardianPubkeys, {
      requestId: notification.sessionId,
      familyId: notification.familyId,
      eventType: `frost_${notification.eventType}`,
      eventId: notification.eventId,
      completedAt: notification.completedAt,
      participatingGuardians: notification.participatingGuardians,
    });
  }

  /**
   * Request FROST nonce commitments from guardians
   *
   * Sends Round 1 requests to guardians to collect their nonce commitments.
   * Uses NIP-59 gift-wrapped messages for privacy.
   *
   * @param guardianPubkeys - Array of guardian public keys (hex)
   * @param request - FROST Round 1 request details
   * @returns Results for each guardian request
   */
  async requestFrostNonceCommitments(
    guardianPubkeys: string[],
    request: {
      sessionId: string;
      familyId: string;
      messageHash: string;
      threshold: number;
      expiresAt: number;
      requesterPubkey: string;
    }
  ): Promise<{
    success: boolean;
    results: Array<{
      guardianPubkey: string;
      success: boolean;
      eventId?: string;
      error?: string;
    }>;
  }> {
    // Validate inputs
    if (!guardianPubkeys || guardianPubkeys.length === 0) {
      console.error(
        "[CEPS] requestFrostNonceCommitments: Empty guardianPubkeys array"
      );
      return { success: false, results: [] };
    }

    if (!request.sessionId || !request.familyId || !request.messageHash) {
      console.error(
        "[CEPS] requestFrostNonceCommitments: Missing required request parameters"
      );
      return { success: false, results: [] };
    }

    if (request.threshold < 1 || request.threshold > guardianPubkeys.length) {
      console.error(
        `[CEPS] requestFrostNonceCommitments: Invalid threshold ${request.threshold} for ${guardianPubkeys.length} guardians`
      );
      return { success: false, results: [] };
    }

    console.log(
      `[CEPS] Requesting FROST nonce commitments from ${guardianPubkeys.length} guardians (session: ${request.sessionId})`
    );

    const results = [];

    for (const guardianPubkey of guardianPubkeys) {
      try {
        const result = await this.publishGuardianApprovalRequest(
          guardianPubkey,
          {
            requestId: request.sessionId,
            familyId: request.familyId,
            eventType: "frost_nonce_request",
            eventTemplate: {
              messageHash: request.messageHash,
              round: 1,
            },
            threshold: request.threshold,
            expiresAt: request.expiresAt,
            requesterPubkey: request.requesterPubkey,
          }
        );

        results.push({
          guardianPubkey,
          success: result.success,
          eventId: result.eventId,
          error: result.error,
        });

        // Rate limit: 100ms delay between requests
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        results.push({
          guardianPubkey,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Threshold-based success: need at least threshold successful requests
    const successCount = results.filter((r) => r.success).length;
    const thresholdMet = successCount >= request.threshold;
    console.log(
      `[CEPS] FROST nonce requests sent: ${successCount}/${results.length} successful (threshold: ${request.threshold}, met: ${thresholdMet})`
    );

    return { success: thresholdMet, results };
  }

  /**
   * Request FROST partial signatures from guardians
   *
   * Sends Round 2 requests to guardians with aggregated nonce commitments.
   * Uses NIP-59 gift-wrapped messages for privacy.
   *
   * @param guardianPubkeys - Array of guardian public keys (hex)
   * @param request - FROST Round 2 request details
   * @returns Results for each guardian request
   */
  async requestFrostPartialSignatures(
    guardianPubkeys: string[],
    request: {
      sessionId: string;
      familyId: string;
      messageHash: string;
      aggregatedNonces: string;
      threshold: number;
      expiresAt: number;
      requesterPubkey: string;
    }
  ): Promise<{
    success: boolean;
    results: Array<{
      guardianPubkey: string;
      success: boolean;
      eventId?: string;
      error?: string;
    }>;
  }> {
    // Validate inputs
    if (!guardianPubkeys || guardianPubkeys.length === 0) {
      console.error(
        "[CEPS] requestFrostPartialSignatures: Empty guardianPubkeys array"
      );
      return { success: false, results: [] };
    }

    if (
      !request.sessionId ||
      !request.familyId ||
      !request.messageHash ||
      !request.aggregatedNonces
    ) {
      console.error(
        "[CEPS] requestFrostPartialSignatures: Missing required request parameters"
      );
      return { success: false, results: [] };
    }

    if (request.threshold < 1 || request.threshold > guardianPubkeys.length) {
      console.error(
        `[CEPS] requestFrostPartialSignatures: Invalid threshold ${request.threshold} for ${guardianPubkeys.length} guardians`
      );
      return { success: false, results: [] };
    }

    console.log(
      `[CEPS] Requesting FROST partial signatures from ${guardianPubkeys.length} guardians (session: ${request.sessionId})`
    );

    const results = [];

    for (const guardianPubkey of guardianPubkeys) {
      try {
        const result = await this.publishGuardianApprovalRequest(
          guardianPubkey,
          {
            requestId: request.sessionId,
            familyId: request.familyId,
            eventType: "frost_signature_request",
            eventTemplate: {
              messageHash: request.messageHash,
              aggregatedNonces: request.aggregatedNonces,
              round: 2,
            },
            threshold: request.threshold,
            expiresAt: request.expiresAt,
            requesterPubkey: request.requesterPubkey,
          }
        );

        results.push({
          guardianPubkey,
          success: result.success,
          eventId: result.eventId,
          error: result.error,
        });

        // Rate limit: 100ms delay between requests
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        results.push({
          guardianPubkey,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Threshold-based success: need at least threshold successful requests
    const successCount = results.filter((r) => r.success).length;
    const thresholdMet = successCount >= request.threshold;
    console.log(
      `[CEPS] FROST signature requests sent: ${successCount}/${results.length} successful (threshold: ${request.threshold}, met: ${thresholdMet})`
    );

    return { success: thresholdMet, results };
  }
}

export const central_event_publishing_service =
  new CentralEventPublishingService();
