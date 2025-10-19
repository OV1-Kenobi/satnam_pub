# Code Examples and Migration Scripts

## Part 1: Decentralized Identity - Code Examples

### Example 1: Activate Pubky Client

```typescript
// File: lib/pubky-enhanced-client.ts (refactored)
import { SimplePool } from "nostr-tools";

export class PubkyDHTClient {
  private dhtNode: any;
  private cache: Map<string, { value: any; expiry: number }> = new Map();
  private readonly CACHE_TTL = 3600000; // 1 hour

  constructor() {
    // Initialize DHT node (using @cmdcode/frost or similar)
    this.dhtNode = this.initializeDHTNode();
  }

  async publishRecord(
    domain: string,
    nip05: string,
    npub: string
  ): Promise<{ success: boolean; pkarrKey: string }> {
    try {
      // 1. Generate PKARR keypair
      const keypair = await this.generatePkarrKeypair();

      // 2. Create DNS record
      const record = {
        name: domain,
        type: "TXT",
        value: JSON.stringify({ nip05, npub }),
        ttl: 3600,
      };

      // 3. Publish to DHT
      const published = await this.dhtNode.put(keypair, record);

      // 4. Store in database
      await this.storePkarrRecord(domain, keypair, record);

      return { success: published, pkarrKey: keypair.publicKey };
    } catch (error) {
      console.error("PKARR publish failed:", error);
      throw error;
    }
  }

  async resolveRecord(domain: string): Promise<any> {
    // 1. Check cache
    const cached = this.cache.get(domain);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }

    // 2. Query DHT
    try {
      const record = await this.dhtNode.get(domain);
      this.cache.set(domain, {
        value: record,
        expiry: Date.now() + this.CACHE_TTL,
      });
      return record;
    } catch (error) {
      console.warn(`DHT lookup failed for ${domain}, falling back to DNS`);
      return null;
    }
  }

  private async generatePkarrKeypair(): Promise<any> {
    // Generate using @noble/curves
    const { randomBytes } = await import("@noble/hashes/utils");
    const privateKey = randomBytes(32);
    return { privateKey, publicKey: this.derivePublicKey(privateKey) };
  }

  private derivePublicKey(privateKey: Uint8Array): string {
    // Derive using secp256k1
    const { secp256k1 } = require("@noble/curves/secp256k1");
    const point = secp256k1.ProjectivePoint.fromPrivateKey(privateKey);
    return point.toRawBytes(true).toString("hex");
  }

  private async storePkarrRecord(
    domain: string,
    keypair: any,
    record: any
  ): Promise<void> {
    const { supabase } = await import("../supabase");
    await supabase.from("pkarr_records").insert({
      pkarr_key: keypair.publicKey,
      pkarr_secret: this.encryptSecret(keypair.privateKey),
      domain,
      nip05: record.value.nip05,
      npub: record.value.npub,
      dht_published_at: new Date().toISOString(),
    });
  }

  private async encryptSecret(secret: Uint8Array): Promise<string> {
    // Encrypt using Noble V2 (standard encryption library)
    // WARNING: This is a placeholder. In production, implement actual encryption
    // using your organization's encryption infrastructure (Noble V2, libsodium, etc.).
    // Never store unencrypted private keys in the database.

    // Example using Noble V2 (requires: npm install @noble/ciphers)
    // import { xchacha20poly1305 } from '@noble/ciphers/chacha';
    // import { randomBytes } from '@noble/ciphers/webcrypto';
    //
    // const key = await deriveKey(); // Your key derivation
    // const nonce = randomBytes(24);
    // const cipher = xchacha20poly1305(key);
    // const encrypted = cipher.encrypt(nonce, secret);
    // return Buffer.from(encrypted).toString('base64');

    throw new Error(
      "encryptSecret() must be implemented with real encryption (Noble V2 or equivalent)"
    );
  }
}
```

### Example 2: Hybrid NIP-05 Verifier

```typescript
// File: src/lib/nip05-verification.ts (refactored)
export class HybridNIP05Verifier {
  private pubkyClient: PubkyDHTClient;
  private cepsService: any;
  private verificationMethods = [
    { name: "kind0", priority: 1, timeout: 5000 },
    { name: "pkarr", priority: 2, timeout: 3000 },
    { name: "dns", priority: 3, timeout: 5000 },
  ];

  constructor() {
    this.pubkyClient = new PubkyDHTClient();
    this.cepsService = require("../central_event_publishing_service").CEPS;
  }

  async verify(nip05: string): Promise<VerificationResult> {
    const [username, domain] = nip05.split("@");
    const chain: VerificationAttempt[] = [];

    for (const method of this.verificationMethods) {
      try {
        const result = await this.verifyWithMethod(
          method.name,
          username,
          domain
        );
        chain.push({ method: method.name, success: result.success });

        if (result.success) {
          await this.storeVerificationResult(nip05, method.name, result);
          return { ...result, method: method.name, chain };
        }
      } catch (error) {
        chain.push({
          method: method.name,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new Error(`All verification methods failed for ${nip05}`);
  }

  private async verifyWithMethod(
    method: string,
    username: string,
    domain: string
  ): Promise<any> {
    switch (method) {
      case "kind0":
        return await this.verifyViaKind0(username, domain);
      case "pkarr":
        return await this.verifyViaPkarr(username, domain);
      case "dns":
        return await this.verifyViaDNS(username, domain);
      default:
        throw new Error(`Unknown verification method: ${method}`);
    }
  }

  private async verifyViaKind0(username: string, domain: string): Promise<any> {
    // Query Nostr relays for kind:0 events
    const events = await this.cepsService.list(
      [{ kinds: [0], search: `${username}@${domain}` }],
      undefined,
      { eoseTimeout: 5000 }
    );

    if (events.length === 0) throw new Error("No kind:0 events found");

    const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
    const metadata = JSON.parse(latestEvent.content);

    if (metadata.nip05 !== `${username}@${domain}`) {
      throw new Error("NIP-05 mismatch in kind:0 event");
    }

    return {
      success: true,
      npub: latestEvent.pubkey,
      nip05: metadata.nip05,
      source: "kind0",
    };
  }

  private async verifyViaPkarr(username: string, domain: string): Promise<any> {
    const record = await this.pubkyClient.resolveRecord(domain);
    if (!record) throw new Error("PKARR record not found");

    const data = JSON.parse(record.value);
    if (data.nip05 !== `${username}@${domain}`) {
      throw new Error("NIP-05 mismatch in PKARR record");
    }

    return {
      success: true,
      npub: data.npub,
      nip05: data.nip05,
      source: "pkarr",
    };
  }

  private async verifyViaDNS(username: string, domain: string): Promise<any> {
    const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(
      username
    )}`;

    // Use AbortController for timeout (Fetch API doesn't support direct timeout parameter)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok)
        throw new Error(`DNS lookup failed: ${response.status}`);

      const data = await response.json();
      const npub = data.names?.[username];

      if (!npub) throw new Error("Username not found in DNS records");

      return {
        success: true,
        npub,
        nip05: `${username}@${domain}`,
        source: "dns",
      };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("DNS lookup timed out after 5000ms");
      }
      throw error;
    }
  }

  private async storeVerificationResult(
    nip05: string,
    method: string,
    result: any
  ): Promise<void> {
    const { supabase } = await import("../supabase");
    await supabase.from("nip05_records").upsert({
      nip05,
      npub: result.npub,
      verification_method: method,
      verification_chain: JSON.stringify([method]),
      last_verified_at: new Date().toISOString(),
      next_reverify_at: new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString(),
    });
  }
}
```

---

## Part 2: PoP/UP System - Code Examples

### Example 3: NFC Verification Service

```typescript
// File: src/lib/pop/nfc-verification.ts
export class NFCVerificationService {
  async recordNFCVerification(
    userId: string,
    nfcTagId: string,
    verificationType: "self_scan" | "peer_scan" | "guardian_scan",
    verifiedByUserId?: string
  ): Promise<void> {
    const { supabase } = await import("../../supabase");

    await supabase.from("nfc_verifications").insert({
      user_id: userId,
      nfc_tag_id: nfcTagId,
      verification_type: verificationType,
      verified_by_user_id: verifiedByUserId,
      verification_timestamp: new Date().toISOString(),
      location_hash: await this.hashLocation(),
      device_fingerprint_hash: await this.hashDeviceFingerprint(),
      nfc_score_contribution: this.getScoreContribution(verificationType),
    });
  }

  async calculateNFCScore(userId: string): Promise<number> {
    const { supabase } = await import("../../supabase");

    const { data: verifications } = await supabase
      .from("nfc_verifications")
      .select("verification_type")
      .eq("user_id", userId);

    if (!verifications || verifications.length === 0) return 0;

    // Self-scan: 10 points (max 30)
    const selfScans = verifications.filter(
      (v) => v.verification_type === "self_scan"
    ).length;
    const selfScore = Math.min(selfScans * 10, 30);

    // Peer scans: 15 points each (max 40)
    const peerScans = verifications.filter(
      (v) => v.verification_type === "peer_scan"
    ).length;
    const peerScore = Math.min(peerScans * 15, 40);

    // Guardian scans: 20 points each (max 30)
    const guardianScans = verifications.filter(
      (v) => v.verification_type === "guardian_scan"
    ).length;
    const guardianScore = Math.min(guardianScans * 20, 30);

    return Math.min(selfScore + peerScore + guardianScore, 100);
  }

  private getScoreContribution(type: string): number {
    const contributions: Record<string, number> = {
      self_scan: 10,
      peer_scan: 15,
      guardian_scan: 20,
    };
    return contributions[type] || 0;
  }

  private async hashLocation(): Promise<string> {
    // Privacy-preserving location hash
    if (typeof navigator === "undefined") return "unknown";
    // Implementation depends on your location strategy
    return "location_hash_placeholder";
  }

  private async hashDeviceFingerprint(): Promise<string> {
    // Privacy-preserving device fingerprint
    // NOTE: This method runs CLIENT-SIDE ONLY (browser environment)
    if (typeof navigator === "undefined") {
      // Server-side: use a different strategy (e.g., session-based)
      return "server_fingerprint_placeholder";
    }

    // Browser-side only - safe to use navigator and screen APIs
    const fingerprint = `${navigator.userAgent}${screen.width}x${screen.height}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprint);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}
```

### Example 4: Social Attestation Service

```typescript
// File: src/lib/pop/social-attestation.ts
export class SocialAttestationService {
  async createAttestation(
    attesterUserId: string,
    attesteeUserId: string,
    attestationType: "peer_verification" | "guardian_approval" | "social_proof",
    weight: number = 10
  ): Promise<void> {
    const { supabase } = await import("../../supabase");
    const CEPS = require("../../central_event_publishing_service").CEPS;

    // 1. Create Nostr event (kind:30078)
    const nostrEvent = {
      kind: 30078,
      tags: [
        ["d", "pop_attestation"],
        ["p", attesteeUserId],
        ["attestation_type", attestationType],
        ["weight", weight.toString()],
        ["verified_method", "nfc_scan"],
      ],
      content: `I have verified this person via ${attestationType}`,
    };

    // 2. Publish to Nostr
    const publishedEvent = await CEPS.publishEvent(nostrEvent);

    // 3. Store in database
    await supabase.from("pop_attestations").insert({
      attester_id: attesterUserId,
      attestee_id: attesteeUserId,
      attestation_type: attestationType,
      nostr_event_id: publishedEvent.id,
      weight,
      verified_at: new Date().toISOString(),
      expires_at: new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000
      ).toISOString(),
    });
  }

  async calculateSocialScore(userId: string): Promise<number> {
    const { supabase } = await import("../../supabase");

    const { data: attestations } = await supabase
      .from("pop_attestations")
      .select("attestation_type, weight, attester_id")
      .eq("attestee_id", userId)
      .gte("expires_at", new Date().toISOString());

    if (!attestations || attestations.length === 0) return 0;

    let score = 0;
    for (const att of attestations) {
      if (att.attestation_type === "guardian_approval") {
        score += Math.min(att.weight * 2, 30);
      } else if (att.attestation_type === "peer_verification") {
        score += Math.min(att.weight, 20);
      } else {
        score += Math.min(att.weight * 0.5, 10);
      }
    }

    // Diversity bonus: different attesters
    const uniqueAttesters = new Set(attestations.map((a) => a.attester_id))
      .size;
    const diversityBonus = Math.min(uniqueAttesters * 5, 20);

    return Math.min(score + diversityBonus, 100);
  }
}
```

---

## Part 3: Progressive Trust - Code Examples

### Example 5: Time-Based Escalation

```typescript
// File: src/lib/trust/progressive-escalation.ts
export const TRUST_CHECKPOINTS = [
  { days: 7, name: "week_one", trustBonus: 5 },
  { days: 30, name: "month_one", trustBonus: 15 },
  { days: 90, name: "quarter_one", trustBonus: 25 },
  { days: 180, name: "half_year", trustBonus: 35 },
  { days: 365, name: "year_one", trustBonus: 50 },
];

export class TimeBasedEscalationService {
  async calculateTrustDelta(userId: string): Promise<number> {
    const { supabase } = await import("../../supabase");

    const { data: user } = await supabase
      .from("user_identities")
      .select("created_at, last_activity_at")
      .eq("id", userId)
      .single();

    if (!user) throw new Error("User not found");

    // Account age factor (0-100)
    const accountAgeDays = Math.floor(
      (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    const ageFactorMax = Math.min(accountAgeDays / 365, 1);
    const ageFactor = ageFactorMax * 100;

    // Activity frequency factor (0-100)
    const { data: actions } = await supabase
      .from("reputation_actions")
      .select("count")
      .eq("user_id", userId)
      .gte(
        "recorded_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      );

    const activityCount = actions?.[0]?.count || 0;
    const activityFactor = Math.min((activityCount / 30) * 100, 100);

    // Success rate factor (0-100)
    const { data: transactions } = await supabase
      .from("reputation_actions")
      .select("action_type")
      .eq("user_id", userId)
      .in("action_type", ["lightning_payment_sent", "cashu_payment_sent"]);

    const successCount =
      transactions?.filter((t) => t.action_type.includes("sent")).length || 0;
    const totalCount = transactions?.length || 1;
    const successRate = successCount / totalCount;
    const successFactor = successRate * 100;

    // Calculate delta
    const delta =
      ageFactor * 0.4 + activityFactor * 0.35 + successFactor * 0.25;

    return Math.min(delta, 100);
  }

  async checkCheckpoints(userId: string): Promise<CheckpointReached[]> {
    const { supabase } = await import("../../supabase");

    const { data: user } = await supabase
      .from("user_identities")
      .select("created_at")
      .eq("id", userId)
      .single();

    if (!user) throw new Error("User not found");

    const accountAgeDays = Math.floor(
      (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    const reached: CheckpointReached[] = [];
    for (const checkpoint of TRUST_CHECKPOINTS) {
      if (accountAgeDays >= checkpoint.days) {
        const { data: existing } = await supabase
          .from("trust_history")
          .select("id")
          .eq("user_id", userId)
          .eq("checkpoint_name", checkpoint.name)
          .limit(1);

        if (!existing || existing.length === 0) {
          reached.push({
            checkpoint: checkpoint.name,
            trustBonus: checkpoint.trustBonus,
            reachedAt: new Date(),
          });

          // Record checkpoint reward
          await supabase.from("trust_history").insert({
            user_id: userId,
            trust_delta: checkpoint.trustBonus,
            reason: "checkpoint",
            checkpoint_name: checkpoint.name,
            recorded_at: new Date().toISOString(),
          });
        }
      }
    }

    return reached;
  }
}
```

---

## Database Migration Scripts

### Migration 1: PKARR Records

```sql
-- File: database/migrations/002_add_pkarr_records.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.pkarr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
  pkarr_key TEXT NOT NULL UNIQUE,
  pkarr_secret TEXT NOT NULL,
  domain TEXT NOT NULL,
  nip05_username TEXT NOT NULL,
  npub TEXT NOT NULL,
  dht_published_at TIMESTAMPTZ,
  dht_verified_at TIMESTAMPTZ,
  dns_fallback_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pkarr_domain ON public.pkarr_records(domain);
CREATE INDEX idx_pkarr_nip05 ON public.pkarr_records(nip05_username);

ALTER TABLE public.pkarr_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_pkarr" ON public.pkarr_records
  FOR ALL USING (user_id = auth.uid());

COMMIT;
```

### Migration 2: NFC Verifications

```sql
-- File: database/migrations/003_add_nfc_verifications.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.nfc_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
  nfc_tag_id TEXT NOT NULL,
  verification_type VARCHAR(20) CHECK (verification_type IN ('self_scan', 'peer_scan', 'guardian_scan')),
  verified_by_user_id UUID REFERENCES public.user_identities(id),
  verification_timestamp TIMESTAMPTZ NOT NULL,
  location_hash TEXT,
  device_fingerprint_hash TEXT,
  nfc_score_contribution SMALLINT DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_nfc_user ON public.nfc_verifications(user_id);
CREATE INDEX idx_nfc_timestamp ON public.nfc_verifications(verification_timestamp);

ALTER TABLE public.nfc_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_nfc" ON public.nfc_verifications
  FOR ALL USING (user_id = auth.uid());

COMMIT;
```

### Migration 3: Trust History

```sql
-- File: database/migrations/006_add_trust_history.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.trust_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_identities(id) ON DELETE CASCADE,
  trust_score_before SMALLINT,
  trust_score_after SMALLINT,
  trust_delta SMALLINT,
  reason VARCHAR(50),
  checkpoint_name VARCHAR(50),
  action_type VARCHAR(50),
  metadata JSONB,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_trust_history_user ON public.trust_history(user_id);
CREATE INDEX idx_trust_history_recorded ON public.trust_history(recorded_at);

ALTER TABLE public.trust_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_trust_history" ON public.trust_history
  FOR SELECT USING (user_id = auth.uid());

COMMIT;
```

---

## Deployment Scripts

### Docker Compose

```yaml
# File: docker-compose.yml
version: "3.8"
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: satnam
      POSTGRES_USER: satnam_user
      POSTGRES_PASSWORD: ${DB_PASSWORD:-satnam_dev}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/privacy-first-schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U satnam_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    environment:
      VITE_API_BASE_URL: http://localhost:3000
      VITE_SUPABASE_URL: http://localhost:54321
    ports:
      - "80:80"
    depends_on:
      - functions
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/"]
      interval: 30s
      timeout: 10s
      retries: 3

  functions:
    build:
      context: .
      dockerfile: Dockerfile.functions
    environment:
      DATABASE_URL: postgresql://satnam_user:${DB_PASSWORD:-satnam_dev}@postgres:5432/satnam
      PHOENIXD_API_URL: ${PHOENIXD_API_URL:-http://phoenixd:9740}
      PHOENIXD_API_PASSWORD: ${PHOENIXD_API_PASSWORD}
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
```
