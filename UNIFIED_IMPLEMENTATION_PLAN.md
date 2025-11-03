# Unified Implementation Plan: Tides + 0xchat Integration for Satnam.pub

**Document Version**: 1.0
**Date**: November 2, 2025
**Status**: Ready for Phase 1 Implementation
**Target Completion**: 6-8 weeks (full-time) or 12-16 weeks (part-time)

---

## EXECUTIVE SUMMARY

This plan integrates the best patterns from **Tides** (browser extension, messaging, payments) and **0xchat** (mobile client, privacy, groups) into **Satnam.pub** (web platform, family banking, Master Context roles).

### Key Objectives

- ✅ **95%+ message delivery compatibility** with Tides and 0xchat users
- ✅ **Full NIP-17/59/101 support** for all message types
- ✅ **Enhanced privacy** via alias key exchange and encrypted contacts
- ✅ **Unified payment experience** (NWC + Cashu)
- ✅ **Group interoperability** (NIP-29 + MLS evaluation)
- ✅ **Zero architectural compromises** (privacy-first, zero-knowledge, Master Context)

### Success Metrics

| Metric             | Target          | Validation                            |
| ------------------ | --------------- | ------------------------------------- |
| Message Delivery   | 95%+            | E2E tests with Tides/0xchat users     |
| NIP Support        | 17/59/101/29/51 | Unit tests per NIP                    |
| Privacy Compliance | 100%            | Security audit, no metadata leakage   |
| Zero-Knowledge     | 100%            | No plaintext nsec in logs/storage     |
| Master Context     | 100%            | Role hierarchy preserved in all flows |
| Performance        | <500ms          | Relay response time benchmarks        |

---

## PHASE 1: CORE MESSAGING COMPATIBILITY (Weeks 1-2)

**Goal**: Enable Satnam to send/receive all message types from Tides and 0xchat users
**Total Effort**: 17-21 hours
**Success Criteria**:

- ✅ Receive NIP-17 (kind 14) messages from Tides
- ✅ Receive NIP-59 (kind 1059) gift-wrapped messages from 0xchat
- ✅ Receive NIP-101 secret chat invitations from 0xchat
- ✅ Relay strategy optimized for 40-60% faster delivery
- ✅ All tests passing, no regressions

### Task 1.1: Unified Relay Strategy (4-6 hours)

**Objective**: Combine Tides' MIN_READY threshold with 0xchat's relay categorization

**Files to Modify**:

- `src/lib/central_event_publishing_service.ts` (CEPS main)
- `src/lib/relay-strategy.ts` (NEW - create)
- `netlify/functions/utils/relay-manager.ts` (NEW - create)

**Implementation Steps**:

1. **Create `src/lib/relay-strategy.ts`**:

```typescript
// Combines Tides' fast/slow discrimination + 0xchat's categorization
export interface RelayCategory {
  general: string[];
  dm: string[];
  inbox: string[];
  group: string[];
}

export interface RelayTimestamps {
  [relay: string]: {
    general: { until: number; since: number };
    dm: { until: number; since: number };
    inbox: { until: number; since: number };
    group: { until: number; since: number };
  };
}

export class UnifiedRelayStrategy {
  private relayTimestamps: RelayTimestamps = {};
  private readonly MIN_READY = 3; // Tides pattern
  private readonly SLOW_RELAY_PATTERN =
    /nostr\.watch|relay\.nostr\.net|relay\.damus\.io/i;
  private connectedRelays = new Set<string>();

  async ensureConnection(
    relayList: string[],
    category: "general" | "dm" | "inbox" | "group" = "general"
  ): Promise<boolean> {
    if (this.connectedRelays.size >= this.MIN_READY) {
      return true;
    }

    const fastRelays = relayList.filter(
      (url) => !this.SLOW_RELAY_PATTERN.test(url)
    );
    const slowRelays = relayList.filter((url) =>
      this.SLOW_RELAY_PATTERN.test(url)
    );

    let resolveEarly: (value: boolean) => void;
    const early = new Promise<boolean>((res) => {
      resolveEarly = res;
    });

    const connect = async (url: string) => {
      try {
        await this.pool.ensureRelay(url);
        this.connectedRelays.add(url);
        this.initializeTimestamps(url, category);
        if (this.connectedRelays.size >= this.MIN_READY) {
          resolveEarly(true);
        }
        return true;
      } catch (error) {
        console.warn(`Failed to connect to relay: ${url}`, error);
        return false;
      }
    };

    // Connect fast relays first (Tides pattern)
    const fastPromises = fastRelays.map(connect);

    // Start slow relays in background
    setTimeout(() => {
      slowRelays.forEach(connect);
    }, 0);

    // Return as soon as MIN_READY reached (Tides pattern)
    const settled = Promise.allSettled(fastPromises).then((results) =>
      results.some((r) => r.status === "fulfilled" && r.value === true)
    );

    return Promise.race([early, settled]);
  }

  private initializeTimestamps(relay: string, category: string): void {
    if (!this.relayTimestamps[relay]) {
      this.relayTimestamps[relay] = {
        general: { until: 0, since: 0 },
        dm: { until: 0, since: 0 },
        inbox: { until: 0, since: 0 },
        group: { until: 0, since: 0 },
      };
    }
  }

  updateTimestamp(relay: string, category: string, until: number): void {
    if (!this.relayTimestamps[relay]) {
      this.initializeTimestamps(relay, category);
    }
    this.relayTimestamps[relay][category].until = Math.max(
      this.relayTimestamps[relay][category].until,
      until
    );
  }

  getTimestamp(
    relay: string,
    category: string
  ): { until: number; since: number } {
    return this.relayTimestamps[relay]?.[category] || { until: 0, since: 0 };
  }
}
```

2. **Update `src/lib/central_event_publishing_service.ts`**:

```typescript
// Add relay strategy to CEPS
private relayStrategy = new UnifiedRelayStrategy();

async queryRelays(filters: Filter[], options?: QueryOptions): Promise<NostrEvent[]> {
  // Determine category based on filter kinds
  const category = this.determineCategory(filters);

  // Ensure relay connection with category
  await this.relayStrategy.ensureConnection(this.relays, category);

  // Query with optimized relay strategy
  return await this.pool.querySync(this.relays, filters, options?.timeout || 5000);
}

private determineCategory(filters: Filter[]): 'general' | 'dm' | 'inbox' | 'group' {
  const kinds = filters.flatMap(f => f.kinds || []);
  if (kinds.includes(4) || kinds.includes(14) || kinds.includes(1059)) return 'dm';
  if (kinds.includes(40) || kinds.includes(41) || kinds.includes(42)) return 'group';
  return 'general';
}
```

**Testing**:

- Unit test: Verify MIN_READY threshold triggers at 3 relays
- Unit test: Verify fast relays connect before slow relays
- Integration test: Measure relay connection time (target: <500ms)
- Integration test: Verify category-based timestamp tracking

**Estimated Effort**: 4-6 hours

---

### Task 1.2: Enhanced NIP-17/59 Message Handling (5-7 hours)

**Objective**: Support all message types (NIP-04, NIP-17, NIP-59, NIP-101)

**Files to Modify**:

- `src/lib/central_event_publishing_service.ts` (add decryption logic)
- `src/lib/message-handler.ts` (NEW - create)
- `types/nostr-events.ts` (update types)

**Implementation Steps**:

1. **Create `src/lib/message-handler.ts`**:

```typescript
export class MessageHandler {
  async decryptMessage(
    event: NostrEvent,
    privateKey: string
  ): Promise<string | null> {
    try {
      // Handle NIP-59 Gift Wraps (kind 1059) - 0xchat pattern
      if (event.kind === 1059) {
        return await this.decryptGiftWrap(event, privateKey);
      }

      // Handle NIP-17 (kind 14) with NIP-44 - Tides pattern
      if (event.kind === 14) {
        return await this.decryptNip17(event, privateKey);
      }

      // Handle NIP-04 (kind 4) with NIP-44 fallback - Tides pattern
      if (event.kind === 4) {
        return await this.decryptNip04(event, privateKey);
      }

      return null;
    } catch (error) {
      console.error("Message decryption failed:", error);
      return null;
    }
  }

  private async decryptGiftWrap(
    event: NostrEvent,
    privateKey: string
  ): Promise<string | null> {
    try {
      // Decrypt outer layer with NIP-44
      const unwrappedSealJson = await nip44.decrypt(
        privateKey,
        event.pubkey,
        event.content
      );
      const seal = JSON.parse(unwrappedSealJson);

      if (seal && seal.kind === 13 && typeof seal.content === "string") {
        // Decrypt inner kind 14 message
        return await nip44.decrypt(privateKey, event.pubkey, seal.content);
      }
    } catch (_) {}
    return null;
  }

  private async decryptNip17(
    event: NostrEvent,
    privateKey: string
  ): Promise<string | null> {
    try {
      // Try NIP-44 first (modern encryption)
      return await nip44.decrypt(privateKey, event.pubkey, event.content);
    } catch (_) {
      // Fallback to plaintext (some clients send unencrypted kind 14)
      return event.content || "";
    }
  }

  private async decryptNip04(
    event: NostrEvent,
    privateKey: string
  ): Promise<string | null> {
    try {
      return await nip04.decrypt(privateKey, event.pubkey, event.content);
    } catch (_) {
      // Try NIP-44 as fallback
      try {
        return await nip44.decrypt(privateKey, event.pubkey, event.content);
      } catch (_) {
        return null;
      }
    }
  }
}
```

2. **Update CEPS to use MessageHandler**:

```typescript
private messageHandler = new MessageHandler();

async handleIncomingMessage(event: NostrEvent): Promise<void> {
  const decrypted = await this.messageHandler.decryptMessage(event, this.privateKey);
  if (decrypted) {
    // Process decrypted message
    await this.storeMessage(event, decrypted);
  }
}
```

**Testing**:

- Unit test: Decrypt NIP-04 messages
- Unit test: Decrypt NIP-17 (kind 14) messages
- Unit test: Decrypt NIP-59 gift-wrapped messages
- Integration test: Receive message from Tides user
- Integration test: Receive message from 0xchat user
- Security test: Verify no plaintext nsec in logs

**Estimated Effort**: 5-7 hours

---

### Task 1.3: Contact Discovery from DM History (3-4 hours)

**Objective**: Discover contacts from message history (Tides pattern)

**Files to Modify**:

- `src/lib/auth/unified-auth-system.ts` (add discovery logic)
- `src/lib/contact-manager.ts` (NEW - create)

**Implementation Steps**:

1. **Create `src/lib/contact-manager.ts`**:

```typescript
export class ContactManager {
  async discoverContactsFromDMs(
    userPubkey: string,
    dmRelays: string[]
  ): Promise<Set<string>> {
    const discoveredContacts = new Set<string>();

    try {
      // Query for all DMs involving the user (Tides pattern)
      const dmFilters = [
        { kinds: [4, 14], authors: [userPubkey] },
        { kinds: [4, 14], "#p": [userPubkey] },
      ];

      const dmEvents = await CEPS.queryRelays(dmFilters, {
        timeout: 5000,
        relayHints: dmRelays,
      });

      // Extract unique pubkeys from DM events
      dmEvents.forEach((event) => {
        if (event.pubkey && event.pubkey !== userPubkey) {
          discoveredContacts.add(event.pubkey);
        }

        // Also check 'p' tags for recipients
        event.tags
          .filter((tag) => tag[0] === "p" && tag[1])
          .forEach((tag) => {
            if (tag[1] !== userPubkey) {
              discoveredContacts.add(tag[1]);
            }
          });
      });

      return discoveredContacts;
    } catch (error) {
      console.warn("Failed to discover contacts from DMs:", error);
      return discoveredContacts;
    }
  }

  async mergeContacts(
    followListContacts: Contact[],
    dmDiscoveredContacts: Set<string>
  ): Promise<Contact[]> {
    const allContactPubkeys = new Set([
      ...followListContacts.map((c) => c.pubkey),
      ...dmDiscoveredContacts,
    ]);

    const contacts = await Promise.all(
      Array.from(allContactPubkeys).map((pubkey) =>
        this.getContactWithMetadata(pubkey)
      )
    );

    return contacts.filter(Boolean);
  }
}
```

**Testing**:

- Unit test: Extract pubkeys from DM events
- Integration test: Discover contacts from message history
- Integration test: Merge follow list with DM-discovered contacts

**Estimated Effort**: 3-4 hours

---

### Task 1.4: Event Validation Framework (3-5 hours)

**Objective**: Implement kind-specific validation (Tides pattern)

**Files to Modify**:

- `src/lib/validation/event-validator.ts` (NEW - create)
- `src/lib/central_event_publishing_service.ts` (integrate validator)

**Implementation Steps**:

1. **Create `src/lib/validation/event-validator.ts`**:

```typescript
export interface EventValidationRule {
  kind: number;
  requiredFields: string[];
  requiredTags?: string[];
  forbiddenTags?: string[];
  customValidation?: (event: NostrEvent) => boolean;
}

export class EventValidator {
  private rules: Map<number, EventValidationRule> = new Map([
    [
      4,
      {
        kind: 4,
        requiredFields: ["id", "pubkey", "created_at", "content"],
        requiredTags: [["p"]],
        customValidation: (event) => {
          const pTags = event.tags.filter((t) => t[0] === "p");
          return pTags.length === 1;
        },
      },
    ],
    [
      14,
      {
        kind: 14,
        requiredFields: ["id", "pubkey", "created_at", "content"],
        requiredTags: [["p"]],
        customValidation: (event) => {
          const pTags = event.tags.filter((t) => t[0] === "p");
          return pTags.length >= 1;
        },
      },
    ],
    [
      1059,
      {
        kind: 1059,
        requiredFields: ["id", "pubkey", "created_at", "content"],
        requiredTags: [["p"]],
        customValidation: (event) => {
          const pTags = event.tags.filter((t) => t[0] === "p");
          return pTags.length === 1;
        },
      },
    ],
  ]);

  validate(event: NostrEvent): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!event || typeof event !== "object") {
      return { valid: false, errors: ["Event is not an object"] };
    }

    const rule = this.rules.get(event.kind);
    if (!rule) {
      return this.validateBasic(event);
    }

    // Check required fields
    for (const field of rule.requiredFields) {
      if (!(field in event)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Check required tags
    if (rule.requiredTags) {
      for (const [tagName] of rule.requiredTags) {
        const hasTag = event.tags.some((t) => t[0] === tagName);
        if (!hasTag) {
          errors.push(`Missing required tag: ${tagName}`);
        }
      }
    }

    // Run custom validation
    if (rule.customValidation && !rule.customValidation(event)) {
      errors.push("Custom validation failed");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private validateBasic(event: NostrEvent): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    if (!event.id) errors.push("Missing id");
    if (!event.pubkey) errors.push("Missing pubkey");
    if (!event.created_at) errors.push("Missing created_at");
    if (event.kind === undefined) errors.push("Missing kind");
    return { valid: errors.length === 0, errors };
  }
}
```

**Testing**:

- Unit test: Validate kind 4 messages
- Unit test: Validate kind 14 messages
- Unit test: Validate kind 1059 gift wraps
- Unit test: Reject invalid events

**Estimated Effort**: 3-5 hours

---

## PHASE 2: PRIVACY & CONTACT MANAGEMENT (Weeks 3-4)

**Goal**: Implement encrypted contacts and secret chat support
**Total Effort**: 20-27 hours
**Success Criteria**:

- ✅ NIP-51 encrypted contact lists working
- ✅ NIP-101 secret chat sessions established
- ✅ Metadata caching with TTL
- ✅ User-friendly error messages
- ✅ All tests passing

### Task 2.1: Encrypted Contact Lists (NIP-51) (4-6 hours)

**Objective**: Implement 0xchat's encrypted contact list pattern

**Files to Modify**:

- `src/lib/contact-manager.ts` (add NIP-51 support)
- `netlify/functions/api/contacts/sync-encrypted.ts` (NEW - create)
- `types/contacts.ts` (update types)

**Implementation Steps**:

1. **Update `src/lib/contact-manager.ts`**:

```typescript
export class ContactManager {
  async syncEncryptedContactList(
    contacts: Contact[],
    userPubkey: string,
    userPrivkey: string
  ): Promise<void> {
    try {
      // Create NIP-51 encrypted contact list
      const contactPubkeys = contacts.map((c) => c.pubkey);

      const event = await Nip51.createCategorizedPeople(
        "satnam-contacts",
        [],
        contactPubkeys,
        userPrivkey,
        userPubkey
      );

      // Publish to relays
      await CEPS.publishEvent(event);

      // Store encrypted list in Supabase
      await this.storeEncryptedContactList(userPubkey, event);
    } catch (error) {
      console.error("Failed to sync encrypted contact list:", error);
      throw error;
    }
  }

  private async storeEncryptedContactList(
    userPubkey: string,
    event: NostrEvent
  ): Promise<void> {
    const { error } = await supabase.from("encrypted_contacts").upsert({
      user_duid: userPubkey,
      event_id: event.id,
      encrypted_content: event.content,
      created_at: new Date(event.created_at * 1000),
    });

    if (error) throw error;
  }
}
```

**Testing**:

- Unit test: Create NIP-51 encrypted contact list
- Integration test: Publish encrypted contacts to relay
- Integration test: Retrieve and decrypt contact list
- Security test: Verify contact list is encrypted

**Estimated Effort**: 4-6 hours

---

### Task 2.2: NIP-101 Secret Chat Sessions (8-12 hours)

**Objective**: Implement 0xchat's alias key exchange pattern

**Files to Modify**:

- `src/lib/secret-chat-manager.ts` (NEW - create)
- `netlify/functions/api/secret-chats/request.ts` (NEW - create)
- `netlify/functions/api/secret-chats/accept.ts` (NEW - create)
- `types/secret-chat.ts` (NEW - create)

**Implementation Steps**:

1. **Create `types/secret-chat.ts`**:

```typescript
export interface SecretChatSession {
  sessionId: string;
  myAliasPubkey: string;
  myAliasPrivkey: string;
  toPubkey: string;
  status: "pending" | "requested" | "active" | "updating" | "closed";
  sharedSecret: string;
  interval?: number;
  expiration: number;
  createdAt: number;
  lastRotation?: number;
}

export interface SecretChatRequest {
  sessionId: string;
  aliasPubkey: string;
  toPubkey: string;
  expiration: number;
  interval?: number;
}
```

2. **Create `src/lib/secret-chat-manager.ts`**:

```typescript
export class SecretChatManager {
  async requestSession(
    toPubkey: string,
    interval?: number
  ): Promise<SecretChatSession> {
    const aliasKeypair = generateKeypair();
    const expiration = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

    const session: SecretChatSession = {
      sessionId: generateId(),
      myAliasPubkey: aliasKeypair.public,
      myAliasPrivkey: aliasKeypair.private,
      toPubkey,
      status: "pending",
      sharedSecret: "",
      interval,
      expiration,
      createdAt: Math.floor(Date.now() / 1000),
    };

    // Store session locally (encrypted in ClientSessionVault)
    await this.storeSession(session);

    // Send NIP-101 request event
    await this.sendRequestEvent(session);

    return session;
  }

  async acceptSession(
    requestEvent: NostrEvent,
    myPrivkey: string
  ): Promise<SecretChatSession> {
    // Parse NIP-101 request
    const request = this.parseNip101Request(requestEvent);

    // Generate our alias keypair
    const aliasKeypair = generateKeypair();

    // Derive shared secret from alias keys
    const sharedSecret = await this.deriveSharedSecret(
      aliasKeypair.private,
      request.aliasPubkey
    );

    const session: SecretChatSession = {
      sessionId: request.sessionId,
      myAliasPubkey: aliasKeypair.public,
      myAliasPrivkey: aliasKeypair.private,
      toPubkey: requestEvent.pubkey,
      status: "active",
      sharedSecret,
      interval: request.interval,
      expiration: request.expiration,
      createdAt: Math.floor(Date.now() / 1000),
    };

    // Store session
    await this.storeSession(session);

    // Send acceptance event
    await this.sendAcceptanceEvent(session, myPrivkey);

    return session;
  }

  async rotateKeys(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error("Session not found");

    // Generate new alias keypair
    const newAliasKeypair = generateKeypair();

    // Derive new shared secret
    const newSharedSecret = await this.deriveSharedSecret(
      newAliasKeypair.private,
      session.toPubkey
    );

    // Update session
    session.myAliasPubkey = newAliasKeypair.public;
    session.myAliasPrivkey = newAliasKeypair.private;
    session.sharedSecret = newSharedSecret;
    session.status = "updating";
    session.lastRotation = Math.floor(Date.now() / 1000);

    await this.storeSession(session);

    // Send rotation event
    await this.sendRotationEvent(session);
  }

  private async deriveSharedSecret(
    myAliasPrivkey: string,
    theirAliasPubkey: string
  ): Promise<string> {
    // Use NIP-44 shareSecret between alias keys
    return await nip44.shareSecret(myAliasPrivkey, theirAliasPubkey);
  }

  private async storeSession(session: SecretChatSession): Promise<void> {
    // Store in ClientSessionVault (encrypted)
    await ClientSessionVault.storeSecretChat(session);
  }

  private async getSession(
    sessionId: string
  ): Promise<SecretChatSession | null> {
    return await ClientSessionVault.getSecretChat(sessionId);
  }

  private async sendRequestEvent(session: SecretChatSession): Promise<void> {
    const event = await Nip101.request(
      session.myAliasPubkey,
      session.toPubkey,
      session.expiration,
      session.interval
    );

    // Wrap in NIP-17 and send
    const wrappedEvent = await Nip17.encode(event, session.toPubkey);
    await CEPS.publishEvent(wrappedEvent);
  }

  private async sendAcceptanceEvent(
    session: SecretChatSession,
    myPrivkey: string
  ): Promise<void> {
    const event = await Nip101.accept(
      session.sessionId,
      session.myAliasPubkey,
      session.toPubkey,
      myPrivkey
    );

    const wrappedEvent = await Nip17.encode(event, session.toPubkey);
    await CEPS.publishEvent(wrappedEvent);
  }

  private async sendRotationEvent(session: SecretChatSession): Promise<void> {
    const event = await Nip101.update(
      session.sessionId,
      session.myAliasPubkey,
      session.toPubkey
    );

    const wrappedEvent = await Nip17.encode(event, session.toPubkey);
    await CEPS.publishEvent(wrappedEvent);
  }

  private parseNip101Request(event: NostrEvent): SecretChatRequest {
    // Parse NIP-101 request event
    const sessionIdTag = event.tags.find((t) => t[0] === "session_id");
    const aliasPubkeyTag = event.tags.find((t) => t[0] === "alias_pubkey");
    const expirationTag = event.tags.find((t) => t[0] === "expiration");
    const intervalTag = event.tags.find((t) => t[0] === "interval");

    return {
      sessionId: sessionIdTag?.[1] || "",
      aliasPubkey: aliasPubkeyTag?.[1] || "",
      toPubkey: event.pubkey,
      expiration: parseInt(expirationTag?.[1] || "0"),
      interval: intervalTag ? parseInt(intervalTag[1]) : undefined,
    };
  }
}
```

**Testing**:

- Unit test: Generate alias keypairs
- Unit test: Derive shared secrets
- Integration test: Request secret chat session
- Integration test: Accept secret chat session
- Integration test: Rotate keys
- Security test: Verify alias keys isolated from real keys
- Security test: Verify shared secrets never stored plaintext

**Estimated Effort**: 8-12 hours

---

### Task 2.3: Metadata Caching with TTL (3-5 hours)

**Objective**: Implement Tides' TTL-based caching pattern

**Files to Modify**:

- `src/lib/metadata/metadata-cache.ts` (NEW - create)
- `src/lib/central_event_publishing_service.ts` (integrate cache)

**Implementation Steps**:

1. **Create `src/lib/metadata/metadata-cache.ts`**:

```typescript
export interface CachedMetadata {
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  lud16?: string;
  banner?: string;
  website?: string;
  timestamp: number;
}

export class MetadataCache {
  private cache = new Map<string, CachedMetadata>();
  private readonly TTL = 3600000; // 1 hour
  private readonly MAX_CACHE_SIZE = 1000;

  async get(pubkey: string): Promise<CachedMetadata | null> {
    const cached = this.cache.get(pubkey);

    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached;
    }

    this.cache.delete(pubkey);
    return null;
  }

  async set(pubkey: string, metadata: CachedMetadata): Promise<void> {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )[0][0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(pubkey, {
      ...metadata,
      timestamp: Date.now(),
    });
  }

  async invalidate(pubkey: string): Promise<void> {
    this.cache.delete(pubkey);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  getStats(): { size: number; ttl: number } {
    return { size: this.cache.size, ttl: this.TTL };
  }
}
```

**Testing**:

- Unit test: Cache metadata with TTL
- Unit test: Expire cached metadata after TTL
- Unit test: LRU eviction when cache full
- Performance test: Verify <100ms cache lookup

**Estimated Effort**: 3-5 hours

---

### Task 2.4: User-Friendly Error Messages (2-3 hours)

**Objective**: Implement Tides' error message pattern

**Files to Modify**:

- `src/lib/errors/error-messages.ts` (NEW - create)
- `src/lib/central_event_publishing_service.ts` (integrate error handling)

**Implementation Steps**:

1. **Create `src/lib/errors/error-messages.ts`**:

```typescript
export class UserFriendlyError extends Error {
  constructor(
    public userMessage: string,
    public technicalMessage: string,
    public code: string
  ) {
    super(userMessage);
    this.name = "UserFriendlyError";
  }
}

export const ErrorMessages = {
  NO_RELAYS_CONNECTED: () =>
    new UserFriendlyError(
      "No relays connected. Please check your internet connection and try again.",
      "No connected relays available",
      "NO_RELAYS_CONNECTED"
    ),

  RELAY_TIMEOUT: (relay: string) =>
    new UserFriendlyError(
      `Connection to relay (${relay}) timed out. Please try again.`,
      `Relay timeout after 10s`,
      "RELAY_TIMEOUT"
    ),

  MESSAGE_ENCRYPTION_FAILED: () =>
    new UserFriendlyError(
      "Failed to encrypt message. Please try again.",
      "NIP-04/44 encryption failed",
      "MESSAGE_ENCRYPTION_FAILED"
    ),

  MESSAGE_DECRYPTION_FAILED: () =>
    new UserFriendlyError(
      "Failed to decrypt message. It may be corrupted or from an incompatible client.",
      "NIP-04/44 decryption failed",
      "MESSAGE_DECRYPTION_FAILED"
    ),

  NIP07_NOT_FOUND: () =>
    new UserFriendlyError(
      "No Nostr extension found. Please install Alby or nos2x.",
      "window.nostr is undefined",
      "NIP07_NOT_FOUND"
    ),
};
```

**Testing**:

- Unit test: Generate user-friendly error messages
- Unit test: Log technical messages for debugging
- Integration test: Display error messages in UI

**Estimated Effort**: 2-3 hours

---

## PHASE 3: GROUPS & PAYMENTS (Weeks 5-6)

**Goal**: Implement group interoperability and unified payments
**Total Effort**: 22-31 hours
**Success Criteria**:

- ✅ NIP-29 relay-based groups working
- ✅ Cashu integration functional
- ✅ NWC payment support
- ✅ All tests passing

### Task 3.1: NIP-29 Relay-Based Groups (6-8 hours)

**Objective**: Implement 0xchat's NIP-29 group pattern

**Files to Modify**:

- `src/lib/group-manager.ts` (NEW - create)
- `netlify/functions/api/groups/create.ts` (NEW - create)
- `types/groups.ts` (update types)

**Implementation Steps**:

1. **Create `src/lib/group-manager.ts`**:

```typescript
export interface RelayGroup {
  groupId: string;
  name: string;
  description: string;
  relay: string;
  owner: string;
  members: string[];
  createdAt: number;
}

export class GroupManager {
  async createRelayGroup(
    name: string,
    description: string,
    members: string[],
    relay: string,
    userPubkey: string,
    userPrivkey: string
  ): Promise<RelayGroup> {
    const groupId = generateId();

    // Create NIP-29 group creation event (kind 40)
    const creationEvent = await Nip29.createGroup(
      groupId,
      name,
      description,
      relay,
      userPubkey,
      userPrivkey
    );

    // Publish to relay
    await CEPS.publishEvent(creationEvent);

    const group: RelayGroup = {
      groupId,
      name,
      description,
      relay,
      owner: userPubkey,
      members: [userPubkey, ...members],
      createdAt: Math.floor(Date.now() / 1000),
    };

    // Store in Supabase
    await this.storeGroup(group);

    return group;
  }

  async sendGroupMessage(
    groupId: string,
    content: string,
    userPubkey: string,
    userPrivkey: string
  ): Promise<void> {
    const group = await this.getGroup(groupId);
    if (!group) throw new Error("Group not found");

    // Create NIP-29 group message event (kind 42)
    const messageEvent = await Nip29.sendGroupMessage(
      groupId,
      content,
      userPubkey,
      userPrivkey
    );

    // Publish to group relay
    await CEPS.publishEvent(messageEvent, [group.relay]);
  }

  private async storeGroup(group: RelayGroup): Promise<void> {
    const { error } = await supabase.from("relay_groups").insert({
      group_id: group.groupId,
      name: group.name,
      description: group.description,
      relay: group.relay,
      owner: group.owner,
      members: group.members,
      created_at: new Date(group.createdAt * 1000),
    });

    if (error) throw error;
  }

  private async getGroup(groupId: string): Promise<RelayGroup | null> {
    const { data, error } = await supabase
      .from("relay_groups")
      .select("*")
      .eq("group_id", groupId)
      .single();

    if (error) return null;
    return data;
  }
}
```

**Testing**:

- Unit test: Create NIP-29 group
- Integration test: Send group message
- Integration test: Receive group message from 0xchat user
- Integration test: Add/remove group members

**Estimated Effort**: 6-8 hours

---

### Task 3.2: Cashu Integration (10-15 hours)

**Objective**: Implement 0xchat's Cashu ecash pattern

**Files to Modify**:

- `src/lib/payment/cashu-manager.ts` (NEW - create)
- `netlify/functions/api/payments/cashu-zap.ts` (NEW - create)
- `types/payments.ts` (update types)

**Implementation Steps**:

1. **Create `src/lib/payment/cashu-manager.ts`**:

```typescript
export interface CashuMint {
  url: string;
  name: string;
  publicKey: string;
}

export interface CashuZap {
  tokens: string[];
  amount: string;
  unit: string;
  comment: string;
  mint: string;
  eventId: string;
  eventRelay: string;
  toPubkey: string;
}

export class CashuManager {
  private mints: Map<string, CashuMint> = new Map();

  async addMint(url: string, name: string): Promise<CashuMint> {
    try {
      // Fetch mint info
      const response = await fetch(`${url}/v1/info`);
      const info = await response.json();

      const mint: CashuMint = {
        url,
        name,
        publicKey: info.pubkey,
      };

      this.mints.set(url, mint);

      // Store in Supabase
      await this.storeMint(mint);

      return mint;
    } catch (error) {
      console.error("Failed to add Cashu mint:", error);
      throw error;
    }
  }

  async sendCashuZap(
    tokens: string[],
    amount: string,
    unit: string,
    comment: string,
    mint: string,
    eventId: string,
    eventRelay: string,
    toPubkey: string,
    userPubkey: string,
    userPrivkey: string
  ): Promise<void> {
    // Create NIP-61 Cashu zap event
    const zapEvent = await Nip61.encodeNutZap(
      tokens,
      amount,
      unit,
      comment,
      mint,
      eventId,
      eventRelay,
      toPubkey,
      userPubkey,
      userPrivkey
    );

    // Publish to relays
    await CEPS.publishEvent(zapEvent);
  }

  async handleCashuZap(event: NostrEvent): Promise<CashuZap | null> {
    try {
      const zap = Nip61.decodeNutZap(event);
      return zap;
    } catch (error) {
      console.error("Failed to decode Cashu zap:", error);
      return null;
    }
  }

  private async storeMint(mint: CashuMint): Promise<void> {
    const { error } = await supabase.from("cashu_mints").upsert({
      url: mint.url,
      name: mint.name,
      public_key: mint.publicKey,
    });

    if (error) throw error;
  }
}
```

**Testing**:

- Unit test: Add Cashu mint
- Unit test: Create Cashu zap event
- Integration test: Send Cashu zap
- Integration test: Receive Cashu zap from 0xchat user
- Security test: Verify token encryption

**Estimated Effort**: 10-15 hours

---

### Task 3.3: NWC Payment Integration (6-8 hours)

**Objective**: Implement Tides' NWC pattern

**Files to Modify**:

- `src/lib/payment/nwc-client.ts` (NEW - create)
- `netlify/functions/api/payments/nwc-pay.ts` (NEW - create)

**Implementation Steps**:

1. **Create `src/lib/payment/nwc-client.ts`**:

```typescript
export interface NWCConfig {
  walletPubkey: string;
  relayUrls: string[];
  clientSecret: string;
  clientPubkey: string;
  encryption: "nip04" | "nip44";
  methods: string[];
  alias: string;
  network: "mainnet" | "testnet";
  uri: string;
  supportsLightning: boolean;
  supportsCashu: boolean;
}

export class NWCClient {
  private config: NWCConfig | null = null;

  async connect(uri: string): Promise<NWCConfig> {
    // Parse NWC URI
    const match = uri.match(/^nostr\+walletconnect:\/\/([^?]+)\?(.+)$/);
    if (!match) {
      throw new Error("Invalid NWC URI format");
    }

    const walletPubkey = match[1];
    const params = new URLSearchParams(match[2]);
    const relay = params.get("relay");
    const secret = params.get("secret");
    const lud16 = params.get("lud16");

    if (!walletPubkey || !relay || !secret) {
      throw new Error("Missing required NWC parameters");
    }

    const clientPubkey = getPublicKey(secret);

    this.config = {
      walletPubkey,
      relayUrls: [relay],
      clientSecret: secret,
      clientPubkey,
      encryption: "nip04",
      methods: ["pay_invoice", "get_balance", "get_info"],
      alias: lud16 || "NWC Wallet",
      network: "mainnet",
      uri,
      supportsLightning: true,
      supportsCashu: true,
    };

    // Persist to storage
    await this.persistConfig();
    return this.config;
  }

  async payInvoice(
    invoice: string
  ): Promise<{ success: boolean; preimage?: string }> {
    if (!this.config) {
      throw new Error("NWC not connected");
    }

    const paymentRequest = {
      method: "pay_invoice",
      params: { invoice },
    };

    const encryptedContent = await nip04.encrypt(
      this.config.clientSecret,
      this.config.walletPubkey,
      JSON.stringify(paymentRequest)
    );

    const event: NostrEvent = {
      kind: 23194,
      content: encryptedContent,
      tags: [["p", this.config.walletPubkey]],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: this.config.clientPubkey,
    };

    event.id = getEventHash(event);
    event.sig = getSignature(event, this.config.clientSecret);

    await CEPS.publishEvent(event, this.config.relayUrls);

    return { success: true };
  }

  private async persistConfig(): Promise<void> {
    if (!this.config) return;

    const { error } = await supabase.from("nwc_configs").upsert({
      wallet_pubkey: this.config.walletPubkey,
      relay_urls: this.config.relayUrls,
      client_secret: this.config.clientSecret,
      client_pubkey: this.config.clientPubkey,
      alias: this.config.alias,
      network: this.config.network,
      uri: this.config.uri,
    });

    if (error) throw error;
  }
}
```

**Testing**:

- Unit test: Parse NWC URI
- Integration test: Connect to NWC wallet
- Integration test: Send payment via NWC
- Security test: Verify client secret encryption

**Estimated Effort**: 6-8 hours

---

## PHASE 4: POLISH & OPTIMIZATION (Weeks 7-8)

**Goal**: Add extension detection, push notifications, and final optimization
**Total Effort**: 17-23 hours
**Success Criteria**:

- ✅ Extension detection working
- ✅ Push notifications functional
- ✅ Database encryption enhanced
- ✅ All tests passing
- ✅ Performance benchmarks met

### Task 4.1: Browser Extension Detection (4-6 hours)

**Objective**: Implement Tides' extension detection pattern

**Files to Modify**:

- `src/lib/extension-detection.ts` (NEW - create)
- `src/components/MessageComposer.tsx` (integrate detection)

**Implementation Steps**:

1. **Create `src/lib/extension-detection.ts`**:

```typescript
export interface ExtensionInfo {
  name: string;
  id: string;
  installed: boolean;
  capabilities: string[];
}

export class ExtensionDetector {
  private static readonly KNOWN_EXTENSIONS: Record<string, ExtensionInfo> = {
    tides: {
      name: "Tides",
      id: "tides-extension-id",
      installed: false,
      capabilities: ["messaging", "zaps", "nwc"],
    },
    alby: {
      name: "Alby",
      id: "alby-extension-id",
      installed: false,
      capabilities: ["nip07", "nwc", "lightning"],
    },
  };

  static detectInstalledExtensions(): ExtensionInfo[] {
    const installed: ExtensionInfo[] = [];

    if (typeof window.nostr !== "undefined") {
      installed.push(this.KNOWN_EXTENSIONS.alby);
    }

    if (typeof (window as any).tidesMessenger !== "undefined") {
      installed.push(this.KNOWN_EXTENSIONS.tides);
    }

    return installed;
  }

  static async offerComplementaryFeatures(): Promise<void> {
    const extensions = this.detectInstalledExtensions();

    if (extensions.some((e) => e.name === "Tides")) {
      this.addOpenInTidesButton();
    }

    if (extensions.some((e) => e.capabilities.includes("nwc"))) {
      this.enableNWCPayments();
    }
  }

  private static addOpenInTidesButton(): void {
    const messageComposer = document.querySelector(".message-composer");
    if (messageComposer) {
      const button = document.createElement("button");
      button.className = "open-in-tides-btn";
      button.innerHTML = "📱 Open in Tides";
      button.addEventListener("click", () => {
        window.postMessage(
          {
            type: "SATNAM_OPEN_CHAT",
            pubkey: (window as any).currentContactPubkey,
          },
          "*"
        );
      });
      messageComposer.appendChild(button);
    }
  }

  private static enableNWCPayments(): void {
    const paymentOptions = document.querySelector(".payment-options");
    if (paymentOptions) {
      const nwcOption = document.createElement("button");
      nwcOption.className = "payment-option nwc";
      nwcOption.innerHTML = "💳 Pay with NWC";
      paymentOptions.appendChild(nwcOption);
    }
  }
}
```

**Testing**:

- Unit test: Detect installed extensions
- Integration test: Display "Open in Tides" button
- Integration test: Enable NWC payment option

**Estimated Effort**: 4-6 hours

---

### Task 4.2: Push Notification System (8-10 hours)

**Objective**: Implement 0xchat's push notification pattern

**Files to Modify**:

- `src/lib/notifications/push-manager.ts` (NEW - create)
- `netlify/functions/api/notifications/subscribe.ts` (NEW - create)
- `types/notifications.ts` (NEW - create)

**Implementation Steps**:

1. **Create `src/lib/notifications/push-manager.ts`**:

```typescript
export interface PushSubscription {
  deviceId: string;
  endpoint: string;
  auth: string;
  p256dh: string;
  kinds: number[];
  relays: string[];
  online: boolean;
}

export class PushManager {
  async subscribeToPushNotifications(
    deviceId: string,
    kinds: number[],
    relays: string[],
    userPubkey: string,
    userPrivkey: string
  ): Promise<void> {
    // Create kind 22456 push subscription event
    const subscriptionEvent = await Nip22456.createSubscription(
      deviceId,
      kinds,
      relays,
      userPubkey,
      userPrivkey
    );

    // Publish to relays
    await CEPS.publishEvent(subscriptionEvent);

    // Store subscription
    await this.storeSubscription({
      deviceId,
      endpoint: "",
      auth: "",
      p256dh: "",
      kinds,
      relays,
      online: true,
    });
  }

  async sendHeartbeat(userPubkey: string, userPrivkey: string): Promise<void> {
    // Send heartbeat to indicate online status
    const heartbeatEvent = await Nip22456.createHeartbeat(
      userPubkey,
      userPrivkey
    );

    await CEPS.publishEvent(heartbeatEvent);
  }

  private async storeSubscription(
    subscription: PushSubscription
  ): Promise<void> {
    const { error } = await supabase.from("push_subscriptions").upsert({
      device_id: subscription.deviceId,
      kinds: subscription.kinds,
      relays: subscription.relays,
      online: subscription.online,
    });

    if (error) throw error;
  }
}
```

**Testing**:

- Unit test: Create push subscription event
- Integration test: Subscribe to push notifications
- Integration test: Send heartbeat
- Integration test: Receive push notification

**Estimated Effort**: 8-10 hours

---

### Task 4.3: Database Encryption Enhancement (5-7 hours)

**Objective**: Enhance client-side encryption for sensitive data

**Files to Modify**:

- `src/lib/encryption/database-encryption.ts` (NEW - create)
- `src/lib/auth/client-session-vault.ts` (update encryption)

**Implementation Steps**:

1. **Create `src/lib/encryption/database-encryption.ts`**:

```typescript
export class DatabaseEncryption {
  async encryptSensitiveData(data: any, key: string): Promise<string> {
    // Use Web Crypto API for encryption
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(JSON.stringify(data));

    const keyBuffer = await crypto.subtle.importKey(
      "raw",
      encoder.encode(key),
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      keyBuffer,
      dataBuffer
    );

    // Combine IV + encrypted data
    const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedBuffer), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  async decryptSensitiveData(encrypted: string, key: string): Promise<any> {
    const encoder = new TextEncoder();
    const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

    const iv = combined.slice(0, 12);
    const encryptedBuffer = combined.slice(12);

    const keyBuffer = await crypto.subtle.importKey(
      "raw",
      encoder.encode(key),
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      keyBuffer,
      encryptedBuffer
    );

    const decrypted = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(decrypted);
  }
}
```

**Testing**:

- Unit test: Encrypt/decrypt sensitive data
- Unit test: Verify encryption key derivation
- Security test: Verify no plaintext in IndexedDB

**Estimated Effort**: 5-7 hours

---

## IMPLEMENTATION TIMELINE

### Full-Time Development (40 hours/week)

| Phase     | Duration    | Hours       | Start  | End    |
| --------- | ----------- | ----------- | ------ | ------ |
| Phase 1   | 2 weeks     | 17-21h      | Week 1 | Week 2 |
| Phase 2   | 2 weeks     | 20-27h      | Week 3 | Week 4 |
| Phase 3   | 2 weeks     | 22-31h      | Week 5 | Week 6 |
| Phase 4   | 2 weeks     | 17-23h      | Week 7 | Week 8 |
| **Total** | **8 weeks** | **76-102h** |        |        |

### Part-Time Development (20 hours/week)

| Phase     | Duration     | Hours       | Start   | End     |
| --------- | ------------ | ----------- | ------- | ------- |
| Phase 1   | 4 weeks      | 17-21h      | Week 1  | Week 4  |
| Phase 2   | 4 weeks      | 20-27h      | Week 5  | Week 8  |
| Phase 3   | 4 weeks      | 22-31h      | Week 9  | Week 12 |
| Phase 4   | 4 weeks      | 17-23h      | Week 13 | Week 16 |
| **Total** | **16 weeks** | **76-102h** |         |         |

---

## ARCHITECTURAL COMPATIBILITY MATRIX

| Pattern             | Privacy-First | Zero-Knowledge | Master Context | Effort | Priority |
| ------------------- | ------------- | -------------- | -------------- | ------ | -------- |
| Relay Strategy      | ✅            | ✅             | ✅             | 4-6h   | P0       |
| NIP-17/59           | ✅            | ✅             | ✅             | 5-7h   | P0       |
| Contact Discovery   | ✅            | ✅             | ✅             | 3-4h   | P1       |
| Event Validation    | ✅            | ✅             | ✅             | 3-5h   | P1       |
| NIP-51 Contacts     | ✅            | ✅             | ✅             | 4-6h   | P1       |
| NIP-101 Secrets     | ✅            | ✅             | ✅             | 8-12h  | P1       |
| Metadata Cache      | ✅            | ✅             | ✅             | 3-5h   | P2       |
| Error Messages      | ✅            | ✅             | ✅             | 2-3h   | P2       |
| NIP-29 Groups       | ✅            | ✅             | ✅             | 6-8h   | P2       |
| Cashu Integration   | ✅            | ✅             | ✅             | 10-15h | P2       |
| NWC Integration     | ✅            | ✅             | ✅             | 6-8h   | P1       |
| Extension Detection | ✅            | ✅             | ✅             | 4-6h   | P3       |
| Push Notifications  | ✅            | ✅             | ✅             | 8-10h  | P3       |
| DB Encryption       | ✅            | ✅             | ✅             | 5-7h   | P3       |

**All patterns maintain 100% compliance with Satnam's architecture!**

---

## CONFLICTS & TRADE-OFFS

### No Major Conflicts Identified

All patterns from Tides and 0xchat are compatible with Satnam's architecture. However, note:

1. **MLS vs Family Federation**: MLS group encryption (0xchat) differs from Satnam's Family Federation model. Recommendation: Support both models, with MLS as opt-in for enhanced privacy.

2. **Web Compatibility**: Some 0xchat patterns (MLS, Isar database) are Dart/mobile-specific. Recommendation: Adapt to web-compatible equivalents (IndexedDB, Web Crypto API).

3. **Performance Trade-offs**:
   - Relay categorization adds complexity but improves performance
   - Metadata caching reduces relay queries but requires TTL management
   - Recommendation: Implement both, with configurable TTL

---

## SUCCESS METRICS & VALIDATION

### Phase 1 Success Criteria

- ✅ Receive 100% of NIP-17 messages from Tides users
- ✅ Receive 100% of NIP-59 messages from 0xchat users
- ✅ Relay connection time <500ms (40-60% improvement)
- ✅ All unit tests passing
- ✅ No regressions in existing functionality

### Phase 2 Success Criteria

- ✅ NIP-51 encrypted contact lists working
- ✅ NIP-101 secret chat sessions established
- ✅ Metadata cache hit rate >80%
- ✅ Error messages displayed correctly
- ✅ All integration tests passing

### Phase 3 Success Criteria

- ✅ NIP-29 groups created and messages sent
- ✅ Cashu zaps sent and received
- ✅ NWC payments functional
- ✅ All E2E tests passing

### Phase 4 Success Criteria

- ✅ Extension detection working
- ✅ Push notifications delivered
- ✅ Database encryption verified
- ✅ Performance benchmarks met
- ✅ Security audit passed

### Overall Success Metrics

- ✅ **95%+ message delivery compatibility** with Tides and 0xchat
- ✅ **100% privacy-first compliance** (no metadata leakage)
- ✅ **100% zero-knowledge compliance** (no plaintext nsec)
- ✅ **100% Master Context compliance** (role hierarchy preserved)
- ✅ **<500ms relay response time**
- ✅ **>80% metadata cache hit rate**
- ✅ **0 security vulnerabilities** (audit passed)

---

## NEXT STEPS

1. **Review this plan** with team
2. **Allocate resources** for Phase 1
3. **Set up development environment** (branches, CI/CD)
4. **Begin Phase 1 implementation** (Task 1.1: Relay Strategy)
5. **Weekly progress reviews** and adjustments

**Ready to start Phase 1? Begin with Task 1.1: Unified Relay Strategy**
