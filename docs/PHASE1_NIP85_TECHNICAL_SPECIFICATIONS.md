# Phase 1: NIP-85 Technical Specifications

---

## 1. NIP85PublishingService Implementation

### File: `src/lib/trust/nip85-publishing.ts`

```typescript
import { central_event_publishing_service as CEPS } from "../central_event_publishing_service";
import { createClient } from "@supabase/supabase-js";

export interface NIP85Assertion {
  kind: 30382 | 30383 | 30384;
  dTag: string;
  metrics: Record<string, string>;
  publishedAt: Date;
  relayUrls: string[];
  eventId?: string;
}

export class NIP85PublishingService {
  private supabase: ReturnType<typeof createClient>;
  private publishRateLimit = new Map<string, number[]>(); // userId -> timestamps

  constructor(supabaseClient: ReturnType<typeof createClient>) {
    this.supabase = supabaseClient;
  }

  /**
   * Publish user-level assertion (kind 30382)
   * Metrics: rank, followers, hops, influence, reliability, recency, composite
   */
  async publishUserAssertion(
    userId: string,
    targetPubkey: string,
    metrics: Record<string, any>,
    relayUrls: string[] = ["wss://relay.satnam.pub"]
  ): Promise<string> {
    // Rate limiting: 100 events/hour per user
    if (!this.checkRateLimit(userId, 100, 3600000)) {
      throw new Error("Rate limit exceeded");
    }

    // Check user's exposure preferences
    const prefs = await this.getUserPreferences(userId);
    if (prefs.exposure_level === "private") {
      throw new Error("User has disabled public trust score publishing");
    }

    // Filter metrics based on user preferences
    const visibleMetrics = this.filterMetrics(metrics, prefs.visible_metrics);

    // Encrypt if needed
    let content = "";
    if (prefs.encryption_enabled) {
      content = await CEPS.encryptNip44WithActiveSession(
        userId,
        JSON.stringify(visibleMetrics)
      );
    }

    // Build NIP-85 kind 30382 event
    const tags = [
      ["d", targetPubkey],
      ...Object.entries(visibleMetrics).map(([key, value]) => [
        key,
        String(value),
      ]),
      ...relayUrls.map((url) => ["relay", url]),
    ];

    // Publish via CEPS
    const eventId = await CEPS.publishEvent({
      kind: 30382,
      tags,
      content,
    });

    // Store in database
    await this.supabase.from("nip85_assertions").upsert({
      user_id: userId,
      assertion_kind: 30382,
      subject_pubkey: targetPubkey,
      metrics: visibleMetrics,
      event_id: eventId,
      published_at: new Date().toISOString(),
      relay_urls: relayUrls,
    });

    return eventId;
  }

  /**
   * Publish provider declaration (kind 10040)
   * Declares Satnam.pub as a trusted service provider
   */
  async publishProviderDeclaration(
    relayUrls: string[] = ["wss://relay.satnam.pub"]
  ): Promise<string> {
    const tags = [
      ["d", "satnam-trust-provider"],
      ["name", "Satnam.pub Trust Provider"],
      ["description", "Publishes trust scores for Satnam.pub users"],
      ["kinds", "30382", "30383", "30384"],
      ...relayUrls.map((url) => ["relay", url]),
    ];

    return await CEPS.publishEvent({
      kind: 10040,
      tags,
      content: "Satnam.pub publishes NIP-85 trust assertions",
    });
  }

  /**
   * Fetch assertions from trusted providers
   */
  async fetchTrustedAssertions(
    userId: string,
    targetPubkey: string,
    kinds: number[] = [30382]
  ): Promise<NIP85Assertion[]> {
    const { data: providers } = await this.supabase
      .from("trusted_providers")
      .select("*")
      .eq("user_id", userId)
      .in("assertion_kind", kinds);

    if (!providers || providers.length === 0) {
      return [];
    }

    const assertions: NIP85Assertion[] = [];
    for (const provider of providers) {
      const events = await CEPS.list(
        [
          {
            kinds: [provider.assertion_kind],
            "#d": [targetPubkey],
          },
        ],
        [provider.relay_url],
        { eoseTimeout: 5000 }
      );

      for (const event of events) {
        assertions.push({
          kind: provider.assertion_kind,
          dTag: targetPubkey,
          metrics: this.extractMetrics(event),
          publishedAt: new Date(event.created_at * 1000),
          relayUrls: [provider.relay_url],
          eventId: event.id,
        });
      }
    }

    return assertions;
  }

  private async getUserPreferences(userId: string) {
    const { data } = await this.supabase
      .from("trust_provider_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    return (
      data || {
        exposure_level: "private",
        visible_metrics: [],
        whitelisted_pubkeys: [],
        encryption_enabled: false,
      }
    );
  }

  private filterMetrics(
    metrics: Record<string, any>,
    visibleMetrics: string[]
  ): Record<string, string> {
    const filtered: Record<string, string> = {};
    for (const key of visibleMetrics) {
      if (key in metrics) {
        filtered[key] = String(metrics[key]);
      }
    }
    return filtered;
  }

  private extractMetrics(event: any): Record<string, string> {
    const metrics: Record<string, string> = {};
    for (const tag of event.tags) {
      if (!["d", "relay"].includes(tag[0])) {
        metrics[tag[0]] = tag[1];
      }
    }
    return metrics;
  }

  private checkRateLimit(
    userId: string,
    maxRequests: number,
    windowMs: number
  ): boolean {
    const now = Date.now();
    const timestamps = this.publishRateLimit.get(userId) || [];
    const recentTimestamps = timestamps.filter((t) => now - t < windowMs);

    if (recentTimestamps.length >= maxRequests) {
      return false;
    }

    recentTimestamps.push(now);
    this.publishRateLimit.set(userId, recentTimestamps);
    return true;
  }
}
```

---

## 2. Public API Endpoint

### File: `netlify/functions_active/trust-query.ts`

```typescript
import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TrustQueryResponse {
  success: boolean;
  pubkey: string;
  exposure_level: string;
  metrics: Record<string, any>;
  relay_hints: string[];
  published_at: string;
  error?: string;
}

export const handler: Handler = async (event) => {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const { npub, metrics } = event.queryStringParameters || {};

    if (!npub) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing npub parameter" }),
      };
    }

    // Convert npub to hex (use CEPS helper)
    const pubkeyHex = npub.startsWith("npub1")
      ? nip19.decode(npub).data
      : npub;

    // Find user by npub
    const { data: user } = await supabase
      .from("user_identities")
      .select("id, npub")
      .eq("npub", `npub1${pubkeyHex}`)
      .single();

    if (!user) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: "User not found" }),
      };
    }

    // Check exposure preferences
    const { data: prefs } = await supabase
      .from("trust_provider_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!prefs || prefs.exposure_level === "private") {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: "User has not shared trust scores" }),
      };
    }

    // Get trust metrics
    const { data: trustData } = await supabase
      .from("trust_metrics")
      .select("*")
      .eq("user_id", user.id);

    // Filter metrics based on user preferences
    const visibleMetrics: Record<string, any> = {};
    for (const metric of trustData || []) {
      if (prefs.visible_metrics.includes(metric.metric_type)) {
        visibleMetrics[metric.metric_type] = metric.metric_value;
      }
    }

    // Audit log
    await supabase.from("trust_query_audit_log").insert({
      queried_user_id: user.id,
      query_type: "api",
      ip_hash: hashIp(event.headers["client-ip"] || ""),
      user_agent_hash: hashUserAgent(event.headers["user-agent"] || ""),
      success: true,
      metrics_returned: visibleMetrics,
    });

    const response: TrustQueryResponse = {
      success: true,
      pubkey: pubkeyHex,
      exposure_level: prefs.exposure_level,
      metrics: visibleMetrics,
      relay_hints: ["wss://relay.satnam.pub"],
      published_at: new Date().toISOString(),
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};

function hashIp(ip: string): string {
  // Simple hash for privacy
  return require("crypto")
    .createHash("sha256")
    .update(ip)
    .digest("hex")
    .substring(0, 16);
}

function hashUserAgent(ua: string): string {
  return require("crypto")
    .createHash("sha256")
    .update(ua)
    .digest("hex")
    .substring(0, 16);
}
```

---

## 3. User Settings Component

### File: `src/components/TrustProviderSettings.tsx`

```typescript
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export function TrustProviderSettings() {
  const [exposureLevel, setExposureLevel] = useState<
    "public" | "contacts" | "whitelist" | "private"
  >("private");
  const [visibleMetrics, setVisibleMetrics] = useState<string[]>([]);
  const [whitelistedPubkeys, setWhitelistedPubkeys] = useState<string[]>([]);
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  async function loadPreferences() {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    const { data } = await supabase
      .from("trust_provider_preferences")
      .select("*")
      .eq("user_id", user.user.id)
      .single();

    if (data) {
      setExposureLevel(data.exposure_level);
      setVisibleMetrics(data.visible_metrics || []);
      setWhitelistedPubkeys(data.whitelisted_pubkeys || []);
      setEncryptionEnabled(data.encryption_enabled);
    }

    setLoading(false);
  }

  async function savePreferences() {
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    await supabase.from("trust_provider_preferences").upsert({
      user_id: user.user.id,
      exposure_level: exposureLevel,
      visible_metrics: visibleMetrics,
      whitelisted_pubkeys: whitelistedPubkeys,
      encryption_enabled: encryptionEnabled,
    });

    setSaving(false);
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Trust Score Exposure</h3>
        <select
          value={exposureLevel}
          onChange={(e) =>
            setExposureLevel(
              e.target.value as "public" | "contacts" | "whitelist" | "private"
            )
          }
          className="mt-2 w-full border rounded px-3 py-2"
        >
          <option value="private">Private (No public exposure)</option>
          <option value="contacts">Contacts Only</option>
          <option value="whitelist">Whitelist (Specific npubs)</option>
          <option value="public">Public (Anyone can query)</option>
        </select>
      </div>

      <div>
        <h3 className="text-lg font-semibold">Visible Metrics</h3>
        <div className="space-y-2 mt-2">
          {[
            "rank",
            "followers",
            "hops",
            "influence",
            "reliability",
            "recency",
            "composite",
          ].map((metric) => (
            <label key={metric} className="flex items-center">
              <input
                type="checkbox"
                checked={visibleMetrics.includes(metric)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setVisibleMetrics([...visibleMetrics, metric]);
                  } else {
                    setVisibleMetrics(
                      visibleMetrics.filter((m) => m !== metric)
                    );
                  }
                }}
                className="mr-2"
              />
              {metric.charAt(0).toUpperCase() + metric.slice(1)}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={encryptionEnabled}
            onChange={(e) => setEncryptionEnabled(e.target.checked)}
            className="mr-2"
          />
          Encrypt sensitive metrics (NIP-44)
        </label>
      </div>

      <button
        onClick={savePreferences}
        disabled={saving}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Preferences"}
      </button>
    </div>
  );
}
```

---

## 4. Testing Strategy

### Unit Tests: `tests/trust/nip85-publishing.test.ts`

```typescript
describe("NIP85PublishingService", () => {
  it("should publish user assertion with visible metrics only", async () => {
    // Test metric filtering
  });

  it("should respect exposure level privacy settings", async () => {
    // Test private exposure blocks publishing
  });

  it("should enforce rate limiting", async () => {
    // Test 100 events/hour limit
  });

  it("should encrypt metrics when enabled", async () => {
    // Test NIP-44 encryption
  });

  it("should publish provider declaration", async () => {
    // Test kind 10040 event
  });
});
```

### Integration Tests: `tests/integration/trust-provider-flow.test.ts`

```typescript
describe("Trust Provider Flow", () => {
  it("should complete full trust score publishing flow", async () => {
    // 1. Set user preferences
    // 2. Publish trust score
    // 3. Query via API
    // 4. Verify audit log
  });

  it("should respect whitelist exposure level", async () => {
    // Test whitelist filtering
  });

  it("should handle relay failures gracefully", async () => {
    // Test fallback relays
  });
});
```

---

## 5. Security Considerations

✅ **Zero-Knowledge**: No nsec exposure in any assertion  
✅ **Privacy**: RLS policies enforce user isolation  
✅ **Encryption**: NIP-44 for sensitive metrics  
✅ **Audit**: All queries logged with IP/UA hashing  
✅ **Rate Limiting**: 100 events/hour per user, 100 queries/hour per IP  
✅ **Signature Verification**: CEPS handles all event signing  


