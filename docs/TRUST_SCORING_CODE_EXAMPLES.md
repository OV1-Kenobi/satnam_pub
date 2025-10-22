# Trust Scoring Enhancement - Code Examples

---

## 1. NIP85PublishingService Implementation

```typescript
// src/lib/trust/nip85-publishing.ts
import { central_event_publishing_service as CEPS } from "../central_event_publishing_service";
import { createClient } from "@supabase/supabase-js";

export interface NIP85Assertion {
  kind: 30382 | 30383 | 30384;
  dTag: string;
  metrics: Record<string, string>;
  publishedAt: Date;
  relayUrls: string[];
}

export class NIP85PublishingService {
  private supabase: ReturnType<typeof createClient>;

  constructor(supabaseClient: ReturnType<typeof createClient>) {
    this.supabase = supabaseClient;
  }

  async publishUserAssertion(
    userId: string,
    targetPubkey: string,
    metrics: Record<string, any>,
    relayUrls: string[]
  ): Promise<void> {
    try {
      // Convert metrics to string format for NIP-85
      const metricsTags = Object.entries(metrics).map(([key, value]) => [
        key,
        String(value),
      ]);

      // Publish via CEPS
      const eventId = await CEPS.publishNIP85Assertion({
        kind: 30382,
        dTag: targetPubkey,
        metrics: metricsTags,
        relayUrls,
      });

      // Store in database
      await this.supabase.from("nip85_assertions").insert({
        user_id: userId,
        assertion_kind: 30382,
        subject_pubkey: targetPubkey,
        metrics,
        relay_urls: relayUrls,
        published_at: new Date().toISOString(),
      });
    } catch (error) {
      throw new Error(
        `Failed to publish user assertion: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async updateTrustedProviders(
    userId: string,
    providers: Array<{
      kind: number;
      pubkey: string;
      relay: string;
      encrypted?: boolean;
    }>
  ): Promise<void> {
    try {
      // Separate public and encrypted providers
      const publicProviders = providers.filter((p) => !p.encrypted);
      const encryptedProviders = providers.filter((p) => p.encrypted);

      // Build kind 10040 event
      const publicTags = publicProviders.map((p) => [
        `${p.kind}:rank`,
        p.pubkey,
        p.relay,
      ]);

      // Encrypt sensitive providers
      let encryptedContent = "";
      if (encryptedProviders.length > 0) {
        const encryptedTags = encryptedProviders.map((p) => [
          `${p.kind}:rank`,
          p.pubkey,
          p.relay,
        ]);
        encryptedContent = await CEPS.encryptNip44WithActiveSession(
          userId,
          JSON.stringify(encryptedTags)
        );
      }

      // Publish kind 10040
      await CEPS.publishEvent({
        kind: 10040,
        tags: publicTags,
        content: encryptedContent,
      });

      // Store provider preferences
      for (const provider of providers) {
        await this.supabase.from("trusted_providers").upsert({
          user_id: userId,
          provider_pubkey: provider.pubkey,
          assertion_kind: provider.kind,
          relay_url: provider.relay,
          is_encrypted: provider.encrypted || false,
        });
      }
    } catch (error) {
      throw new Error(
        `Failed to update trusted providers: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async fetchTrustedAssertions(
    userId: string,
    targetPubkey: string,
    kinds: number[] = [30382]
  ): Promise<NIP85Assertion[]> {
    try {
      // Get user's trusted providers
      const { data: providers } = await this.supabase
        .from("trusted_providers")
        .select("*")
        .eq("user_id", userId)
        .in("assertion_kind", kinds);

      if (!providers || providers.length === 0) {
        return [];
      }

      // Fetch assertions from each provider's relay
      const assertions: NIP85Assertion[] = [];
      for (const provider of providers) {
        const events = await CEPS.fetchNIP85Assertions({
          kind: provider.assertion_kind,
          dTag: targetPubkey,
          relayUrls: [provider.relay_url],
        });

        for (const event of events) {
          assertions.push({
            kind: provider.assertion_kind as 30382 | 30383 | 30384,
            dTag: targetPubkey,
            metrics: this.extractMetrics(event),
            publishedAt: new Date(event.created_at * 1000),
            relayUrls: [provider.relay_url],
          });
        }
      }

      return assertions;
    } catch (error) {
      throw new Error(
        `Failed to fetch trusted assertions: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private extractMetrics(event: any): Record<string, string> {
    const metrics: Record<string, string> = {};
    for (const tag of event.tags) {
      if (tag[0] !== "d" && tag[0] !== "p" && tag[0] !== "e") {
        metrics[tag[0]] = tag[1];
      }
    }
    return metrics;
  }
}
```

---

## 2. Enhanced Trust Scoring Service

```typescript
// src/lib/trust/trust-scoring-enhanced.ts
export interface MultiMetricTrust {
  rank: number;
  followers: number;
  hops: number;
  influence: number;
  reliability: number;
  recency: number;
  composite: number;  // Weighted average
}

export class EnhancedTrustScoringService {
  async calculateMultiMetricTrust(
    userId: string,
    targetPubkey: string
  ): Promise<MultiMetricTrust> {
    // Get action-based reputation
    const reliability = await this.getReliabilityScore(targetPubkey);

    // Get network distance
    const hops = await this.calculateNetworkDistance(userId, targetPubkey);

    // Get follower count (from kind:0 or cached)
    const followers = await this.getFollowerCount(targetPubkey);

    // Calculate rank (0-100)
    const rank = this.calculateRank(reliability, followers, hops);

    // Calculate influence (PageRank-style)
    const influence = await this.calculateInfluence(targetPubkey);

    // Calculate recency
    const recency = await this.calculateRecency(targetPubkey);

    // Calculate composite score
    const composite = this.calculateComposite({
      rank,
      followers,
      hops,
      influence,
      reliability,
      recency,
    });

    return {
      rank,
      followers,
      hops,
      influence,
      reliability,
      recency,
      composite,
    };
  }

  private calculateRank(
    reliability: number,
    followers: number,
    hops: number
  ): number {
    // Normalize followers (cap at 10k)
    const followerScore = Math.min(followers / 10000, 1) * 30;

    // Hops penalty (closer is better)
    const hopsPenalty = Math.max(0, 30 - hops * 5);

    // Reliability component
    const reliabilityScore = (reliability / 100) * 40;

    return Math.min(
      100,
      Math.round(followerScore + hopsPenalty + reliabilityScore)
    );
  }

  private calculateComposite(metrics: Omit<MultiMetricTrust, "composite">): number {
    // Weighted average
    const weights = {
      rank: 0.25,
      followers: 0.15,
      hops: 0.15,
      influence: 0.2,
      reliability: 0.15,
      recency: 0.1,
    };

    let composite = 0;
    for (const [key, weight] of Object.entries(weights)) {
      composite += (metrics[key as keyof typeof metrics] / 100) * weight * 100;
    }

    return Math.round(composite);
  }

  private async getReliabilityScore(pubkey: string): Promise<number> {
    // Query reputation_actions for this user
    // Calculate based on action history
    return 75;  // Placeholder
  }

  private async calculateNetworkDistance(
    userId: string,
    targetPubkey: string
  ): Promise<number> {
    // Query follows graph
    // Return degrees of separation
    return 2;  // Placeholder
  }

  private async getFollowerCount(pubkey: string): Promise<number> {
    // Query kind:0 events or cache
    return 1500;  // Placeholder
  }

  private async calculateInfluence(pubkey: string): Promise<number> {
    // PageRank-style calculation
    return 65;  // Placeholder
  }

  private async calculateRecency(pubkey: string): Promise<number> {
    // Days since last activity
    const daysSinceActivity = 5;
    return Math.max(0, 100 - daysSinceActivity * 5);
  }
}
```

---

## 3. React Component Example

```typescript
// src/components/TrustMetricsDisplay.tsx
import { MultiMetricTrust } from "../lib/trust/trust-scoring-enhanced";

export function TrustMetricsDisplay({ metrics }: { metrics: MultiMetricTrust }) {
  return (
    <div className="trust-metrics">
      <div className="metric">
        <label>Rank</label>
        <div className="bar" style={{ width: `${metrics.rank}%` }} />
        <span>{metrics.rank}/100</span>
      </div>

      <div className="metric">
        <label>Followers</label>
        <span>{metrics.followers.toLocaleString()}</span>
      </div>

      <div className="metric">
        <label>Network Distance</label>
        <span>{metrics.hops} hops</span>
      </div>

      <div className="metric">
        <label>Influence</label>
        <div className="bar" style={{ width: `${metrics.influence}%` }} />
        <span>{metrics.influence}/100</span>
      </div>

      <div className="metric">
        <label>Reliability</label>
        <div className="bar" style={{ width: `${metrics.reliability}%` }} />
        <span>{metrics.reliability}/100</span>
      </div>

      <div className="metric composite">
        <label>Composite Score</label>
        <div className="bar" style={{ width: `${metrics.composite}%` }} />
        <span>{metrics.composite}/100</span>
      </div>
    </div>
  );
}
```


