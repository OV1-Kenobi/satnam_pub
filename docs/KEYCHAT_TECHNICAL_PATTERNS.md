# Keychat Technical Patterns: Detailed Implementation Guide

---

## 1. Relay Payment Model (Cashu Integration)

### Keychat Pattern
```
User → Generate Cashu Token (Bitcoin-backed)
     → Send Message with Token as "Stamp"
     → Relay Receives Token + Message
     → Relay Validates Token (Bitcoin settlement)
     → Relay Delivers Message
```

### Satnam Adaptation
**Current:** Free relay access (relay-dependent)  
**Proposed:** Optional Cashu-based premium relay access

```typescript
// netlify/functions/utils/relay-payment.ts
interface RelayPaymentConfig {
  relayUrl: string;
  requiresPayment: boolean;
  cashuMintUrl?: string;
  tokenAmount?: number; // in satoshis
}

async function validateRelayPayment(
  relayUrl: string,
  cashuToken: string
): Promise<boolean> {
  // Verify Cashu token with mint
  // Check token hasn't been spent
  // Validate token amount meets relay requirement
  return true;
}
```

**Implementation Effort:** 30-40 hours  
**Compatibility:** ✅ High (integrates with existing lnbits-proxy)  
**Feature Flag:** `VITE_CASHU_RELAY_PAYMENT_ENABLED`

---

## 2. Enhanced Relay Discovery (NIP-10050 Optimization)

### Keychat Pattern
- Relay selection based on payment capacity
- Fallback chain: primary → secondary → default
- No explicit caching mentioned

### Satnam Enhancement
```typescript
// lib/relay-discovery-service.ts
interface RelayMetadata {
  url: string;
  inboxRelays: string[];
  outboxRelays: string[];
  lastUpdated: number;
  ttl: number; // 24 hours
  healthScore: number; // 0-100
  responseTime: number; // ms
  successRate: number; // 0-1
}

class RelayDiscoveryService {
  private cache = new Map<string, RelayMetadata>();
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours

  async resolveInboxRelays(pubkeyHex: string): Promise<string[]> {
    // Check cache first
    const cached = this.cache.get(pubkeyHex);
    if (cached && Date.now() - cached.lastUpdated < cached.ttl) {
      return cached.inboxRelays;
    }

    // Fetch kind:10050 from CEPS
    const relays = await CEPS.resolveInboxRelaysFromKind10050(pubkeyHex);
    
    // Score relays by health
    const scored = await this.scoreRelays(relays);
    
    // Cache with TTL
    this.cache.set(pubkeyHex, {
      url: pubkeyHex,
      inboxRelays: scored,
      outboxRelays: [],
      lastUpdated: Date.now(),
      ttl: this.TTL,
      healthScore: 0,
      responseTime: 0,
      successRate: 1
    });

    return scored;
  }

  private async scoreRelays(relays: string[]): Promise<string[]> {
    // Sort by health metrics
    return relays.sort((a, b) => {
      const scoreA = this.getRelayScore(a);
      const scoreB = this.getRelayScore(b);
      return scoreB - scoreA;
    });
  }
}
```

**Implementation Effort:** 12-16 hours  
**Compatibility:** ✅ High  
**Feature Flag:** `VITE_ENHANCED_RELAY_DISCOVERY`

---

## 3. Message Reactions (NIP-25)

### Keychat Pattern
- Emoji reactions on messages
- Reaction aggregation in UI
- No explicit NIP-25 mention (likely custom implementation)

### Satnam Implementation
```typescript
// src/lib/messaging/reactions.ts
interface MessageReaction {
  eventId: string; // message being reacted to
  content: string; // emoji or reaction text
  pubkey: string; // reactor's pubkey
  createdAt: number;
}

async function publishReaction(
  messageEventId: string,
  emoji: string
): Promise<string> {
  const reaction: Event = {
    kind: 7, // NIP-25 reaction kind
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["e", messageEventId],
      ["p", recipientPubkey]
    ],
    content: emoji
  };

  const signed = await CEPS.signEventWithActiveSession(reaction);
  return CEPS.publishEvent(signed);
}

async function getMessageReactions(
  messageEventId: string
): Promise<MessageReaction[]> {
  const reactions = await CEPS.list(
    [{ kinds: [7], "#e": [messageEventId] }],
    undefined
  );
  return reactions.map(r => ({
    eventId: messageEventId,
    content: r.content,
    pubkey: r.pubkey,
    createdAt: r.created_at
  }));
}
```

**Implementation Effort:** 8-12 hours  
**Compatibility:** ✅ High  
**Feature Flag:** `VITE_MESSAGE_REACTIONS_ENABLED`

---

## 4. Multimedia Messaging Support

### Keychat Pattern
- File attachments via AWS S3
- Voice notes (audio files)
- Short video messages
- Blossom Media protocol (NIP-B7)

### Satnam Adaptation
```typescript
// src/lib/messaging/multimedia.ts
interface MultimediaMessage {
  type: 'text' | 'image' | 'audio' | 'video' | 'file';
  content: string; // text or URL
  mimeType?: string;
  size?: number;
  duration?: number; // for audio/video
  thumbnail?: string; // base64 or URL
}

async function sendMultimediaMessage(
  recipient: string,
  media: MultimediaMessage
): Promise<string> {
  // Upload to Blossom server (or alternative)
  const mediaUrl = await uploadToBlossomServer(media);

  // Create NIP-17 message with media reference
  const messageContent = JSON.stringify({
    type: media.type,
    url: mediaUrl,
    mimeType: media.mimeType,
    size: media.size,
    duration: media.duration
  });

  return CEPS.sendGiftWrappedDirectMessage(
    { encryptedNpub: recipient },
    { type: 'multimedia', content: messageContent }
  );
}

async function uploadToBlossomServer(
  media: MultimediaMessage
): Promise<string> {
  // Implement Blossom protocol (NIP-B7)
  // Or use alternative: Nostr.build, IPFS, etc.
  const formData = new FormData();
  formData.append('file', media.content);

  const response = await fetch(BLOSSOM_SERVER_URL, {
    method: 'POST',
    body: formData
  });

  const { url } = await response.json();
  return url;
}
```

**Implementation Effort:** 20-30 hours  
**Compatibility:** ✅ High  
**Feature Flag:** `VITE_MULTIMEDIA_MESSAGING_ENABLED`  
**Storage Backend:** Blossom, Nostr.build, or custom

---

## 5. Message Search Implementation

### Keychat Pattern
- Search across all conversations
- Full-text search on message content
- Local database indexing (Isar)

### Satnam Adaptation
```typescript
// src/lib/messaging/search.ts
interface SearchResult {
  eventId: string;
  sender: string;
  content: string;
  createdAt: number;
  conversationId: string;
}

class MessageSearchService {
  private searchIndex = new Map<string, SearchResult[]>();

  async searchMessages(
    query: string,
    limit: number = 20
  ): Promise<SearchResult[]> {
    // Query CEPS for matching messages
    const results = await CEPS.list(
      [{
        kinds: [4, 14], // NIP-04 and NIP-17 DMs
        search: query // if relay supports search
      }],
      undefined
    );

    // Fallback: client-side filtering if relay doesn't support search
    if (!results.length) {
      return this.clientSideSearch(query, limit);
    }

    return results.map(r => ({
      eventId: r.id,
      sender: r.pubkey,
      content: r.content,
      createdAt: r.created_at,
      conversationId: this.extractConversationId(r)
    })).slice(0, limit);
  }

  private clientSideSearch(
    query: string,
    limit: number
  ): SearchResult[] {
    // Search in local message cache
    const lowerQuery = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const [, messages] of this.searchIndex) {
      for (const msg of messages) {
        if (msg.content.toLowerCase().includes(lowerQuery)) {
          results.push(msg);
          if (results.length >= limit) break;
        }
      }
      if (results.length >= limit) break;
    }

    return results;
  }
}
```

**Implementation Effort:** 15-20 hours  
**Compatibility:** ✅ High  
**Feature Flag:** `VITE_MESSAGE_SEARCH_ENABLED`  
**Limitation:** Relay-dependent (not all relays support search)

---

## 6. Relay Health Monitoring

### Keychat Pattern
- Implicit relay selection based on availability
- No explicit health monitoring mentioned

### Satnam Implementation
```typescript
// lib/relay-health-monitor.ts
interface RelayHealth {
  url: string;
  isHealthy: boolean;
  responseTime: number;
  successRate: number;
  lastChecked: number;
  consecutiveFailures: number;
}

class RelayHealthMonitor {
  private health = new Map<string, RelayHealth>();
  private readonly CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly FAILURE_THRESHOLD = 3;

  async checkRelayHealth(relayUrl: string): Promise<RelayHealth> {
    const start = Date.now();
    try {
      // Send test event
      const testEvent = {
        kind: 1,
        content: 'health-check',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      const signed = await CEPS.signEventWithActiveSession(testEvent);
      await CEPS.publishEvent(signed, [relayUrl]);

      const responseTime = Date.now() - start;
      const health: RelayHealth = {
        url: relayUrl,
        isHealthy: true,
        responseTime,
        successRate: 1,
        lastChecked: Date.now(),
        consecutiveFailures: 0
      };

      this.health.set(relayUrl, health);
      return health;
    } catch (error) {
      const existing = this.health.get(relayUrl);
      const failures = (existing?.consecutiveFailures || 0) + 1;
      
      const health: RelayHealth = {
        url: relayUrl,
        isHealthy: failures < this.FAILURE_THRESHOLD,
        responseTime: Date.now() - start,
        successRate: 0,
        lastChecked: Date.now(),
        consecutiveFailures: failures
      };

      this.health.set(relayUrl, health);
      return health;
    }
  }

  getHealthyRelays(): string[] {
    return Array.from(this.health.values())
      .filter(h => h.isHealthy)
      .sort((a, b) => a.responseTime - b.responseTime)
      .map(h => h.url);
  }
}
```

**Implementation Effort:** 16-24 hours  
**Compatibility:** ✅ High  
**Feature Flag:** `VITE_RELAY_HEALTH_MONITORING`

---

## 7. Privacy Considerations

### Keychat Approach
- Per-message address rotation (Signal/MLS)
- Cashu tokens hide payment metadata
- Relay doesn't know sender identity

### Satnam Alignment
- ✅ NIP-17 already provides sender privacy
- ✅ NIP-59 gift-wrap hides metadata
- ✅ Zero-knowledge architecture maintained
- ✅ No nsec exposure in any feature

### Recommendations
1. **Avoid:** Storing message content in database (use relays only)
2. **Avoid:** Logging message metadata (privacy violation)
3. **Implement:** Encrypted message cache in IndexedDB
4. **Implement:** Automatic cache expiration (24h)

---

## 8. Feature Flag Strategy

```typescript
// src/config/env.client.ts
export const MESSAGING_FEATURES = {
  NIP_25_REACTIONS: getEnvVar('VITE_MESSAGE_REACTIONS_ENABLED') === 'true',
  MULTIMEDIA_MESSAGING: getEnvVar('VITE_MULTIMEDIA_MESSAGING_ENABLED') === 'true',
  MESSAGE_SEARCH: getEnvVar('VITE_MESSAGE_SEARCH_ENABLED') === 'true',
  RELAY_HEALTH_MONITORING: getEnvVar('VITE_RELAY_HEALTH_MONITORING') === 'true',
  CASHU_RELAY_PAYMENT: getEnvVar('VITE_CASHU_RELAY_PAYMENT_ENABLED') === 'true',
  ENHANCED_RELAY_DISCOVERY: getEnvVar('VITE_ENHANCED_RELAY_DISCOVERY') === 'true'
};
```

---

## 9. Testing Strategy

### Unit Tests
- Relay discovery caching logic
- Message reaction aggregation
- Search filtering algorithms
- Health monitoring state transitions

### Integration Tests
- End-to-end message with reactions
- Multimedia message delivery
- Relay failover scenarios
- Search across multiple relays

### E2E Tests
- Send message → receive reaction → search
- Upload multimedia → verify delivery
- Relay health check → automatic failover

---

## 10. Rollout Plan

**Week 1:** NIP-25 reactions + message search  
**Week 2:** Enhanced relay discovery + health monitoring  
**Week 3:** Multimedia messaging foundation  
**Week 4:** Cashu relay payment integration  
**Week 5+:** Voice notes, advanced features

---

## References

- NIP-25: https://github.com/nostr-protocol/nips/blob/master/25.md
- NIP-B7 (Blossom): https://github.com/nostr-protocol/nips/blob/master/B7.md
- Cashu Protocol: https://cashu.space/
- Keychat Source: https://github.com/keychat-io/keychat-app

