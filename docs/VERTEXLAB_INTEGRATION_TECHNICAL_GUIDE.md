# VertexLab Integration Technical Implementation Guide

**Status:** Ready for Development  
**Complexity:** Medium  
**Timeline:** 8-12 weeks (phased approach)

---

## Part 1: Phase 1 Implementation (Weeks 1-2)

### 1.1 VertexLab Rank Profiles Service

**File:** `src/lib/trust/vertexlab-integration.ts`

```typescript
import { Relay, finalizeEvent, verifySignature } from 'nostr-tools';
import { getEnvVar } from '../../config/env.client';

export interface VertexLabRankResult {
  pubkey: string;
  rank: number;
}

export class VertexLabRankingService {
  private relay: Relay | null = null;
  private relayUrl = 'wss://relay.vertexlab.io';
  private enabled = getEnvVar('VITE_VERTEXLAB_RANKING_ENABLED') === 'true';

  async connect(): Promise<void> {
    if (!this.enabled) return;
    try {
      this.relay = new Relay(this.relayUrl);
      await this.relay.connect();
    } catch (error) {
      console.error('Failed to connect to VertexLab relay:', error);
    }
  }

  async rankProfiles(
    pubkeys: string[],
    algorithm: 'globalPagerank' | 'personalizedPagerank' = 'globalPagerank',
    source?: string
  ): Promise<Map<string, number>> {
    if (!this.enabled || !this.relay) {
      return new Map();
    }

    if (pubkeys.length === 0) return new Map();
    if (pubkeys.length > 1000) {
      throw new Error('VertexLab supports max 1000 pubkeys per request');
    }

    try {
      // Build kind:5314 request
      const request = {
        kind: 5314,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['param', 'sort', algorithm],
          ...(source ? [['param', 'source', source]] : []),
          ...pubkeys.map(pk => ['param', 'target', pk]),
        ],
        content: '',
      };

      // Sign with user's key (requires NIP-07 or ClientSessionVault)
      const signedRequest = await this.signEvent(request);
      
      // Publish to VertexLab relay
      await this.relay.publish(signedRequest);

      // Subscribe to response (kind:6314 or error kind:7000)
      const results = await this.waitForResponse(signedRequest.id);
      
      return this.parseRankResponse(results);
    } catch (error) {
      console.error('VertexLab ranking failed:', error);
      return new Map();
    }
  }

  private async signEvent(event: any): Promise<any> {
    // Use CEPS or NIP-07 to sign
    // Implementation depends on active session
    throw new Error('Implement with CEPS integration');
  }

  private async waitForResponse(
    requestId: string,
    timeoutMs: number = 5000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('VertexLab response timeout'));
      }, timeoutMs);

      const sub = this.relay!.subscribe(
        [
          {
            kinds: [6314, 7000],
            '#e': [requestId],
          },
        ],
        {
          onevent: (event) => {
            clearTimeout(timer);
            sub.close();
            resolve(event);
          },
        }
      );
    });
  }

  private parseRankResponse(event: any): Map<string, number> {
    const results = new Map<string, number>();
    
    if (event.kind === 7000) {
      // Error response
      console.error('VertexLab error:', event.tags);
      return results;
    }

    try {
      const content = JSON.parse(event.content);
      for (const item of content) {
        results.set(item.pubkey, item.rank);
      }
    } catch (error) {
      console.error('Failed to parse VertexLab response:', error);
    }

    return results;
  }

  async disconnect(): Promise<void> {
    if (this.relay) {
      await this.relay.close();
    }
  }
}

export const vertexLabRankingService = new VertexLabRankingService();
```

### 1.2 Feature Flag Configuration

**File:** `src/config/env.client.ts` (add)

```typescript
export const VERTEXLAB_RANKING_ENABLED = 
  getEnvVar('VITE_VERTEXLAB_RANKING_ENABLED') === 'true';

export const VERTEXLAB_RELAY_URL = 
  getEnvVar('VITE_VERTEXLAB_RELAY_URL') || 'wss://relay.vertexlab.io';

export const REPUTATION_RATE_LIMITING_ENABLED = 
  getEnvVar('VITE_REPUTATION_RATE_LIMITING_ENABLED') === 'true';
```

**File:** `.env.example` (add)

```
# VertexLab Integration
VITE_VERTEXLAB_RANKING_ENABLED=false
VITE_VERTEXLAB_RELAY_URL=wss://relay.vertexlab.io
VITE_REPUTATION_RATE_LIMITING_ENABLED=false
```

### 1.3 Integration with Comment Sorting

**File:** `src/components/CommentThread.tsx` (example usage)

```typescript
import { vertexLabRankingService } from '../lib/trust/vertexlab-integration';

export function CommentThread({ comments }: Props) {
  const [sortedComments, setSortedComments] = useState(comments);

  useEffect(() => {
    const sortByReputation = async () => {
      const pubkeys = comments.map(c => c.author_pubkey);
      const ranks = await vertexLabRankingService.rankProfiles(pubkeys);
      
      const sorted = [...comments].sort((a, b) => {
        const rankA = ranks.get(a.author_pubkey) || 0;
        const rankB = ranks.get(b.author_pubkey) || 0;
        return rankB - rankA;
      });
      
      setSortedComments(sorted);
    };

    if (VERTEXLAB_RANKING_ENABLED) {
      sortByReputation();
    }
  }, [comments]);

  return (
    <div>
      {sortedComments.map(comment => (
        <CommentCard key={comment.id} comment={comment} />
      ))}
    </div>
  );
}
```

---

## Part 2: Phase 2 Implementation (Weeks 3-4)

### 2.1 Hybrid Trust Scoring Service

**File:** `src/lib/trust/hybrid-trust-scoring.ts`

```typescript
import { EnhancedTrustScoringService } from './enhanced-trust-scoring';
import { vertexLabRankingService } from './vertexlab-integration';

export interface HybridTrustMetrics {
  satnamScore: number;
  vertexlabScore: number;
  hybridScore: number;
  components: {
    satnam: {
      rank: number;
      followers: number;
      hops: number;
      influence: number;
      reliability: number;
      recency: number;
    };
    vertexlab: {
      globalPagerank: number;
      personalizedPagerank?: number;
    };
  };
}

export class HybridTrustScoringService {
  private satnamService = new EnhancedTrustScoringService();
  private enabled = getEnvVar('VITE_HYBRID_TRUST_SCORING_ENABLED') === 'true';

  async calculateHybridScore(
    userId: string,
    pubkey: string,
    source?: string
  ): Promise<HybridTrustMetrics> {
    // Get Satnam metrics
    const satnamMetrics = await this.satnamService.calculateAllMetrics({
      trustScore: 50,
      verificationCount: 1,
      attestationCount: 5,
      hops: 2,
      followerCount: 100,
      engagementRate: 0.5,
      lastActivityDate: new Date(),
    });

    // Get VertexLab metrics if enabled
    let vertexlabScore = 0;
    let personalizedScore = 0;

    if (this.enabled) {
      const ranks = await vertexLabRankingService.rankProfiles(
        [pubkey],
        'globalPagerank'
      );
      vertexlabScore = ranks.get(pubkey) || 0;

      if (source) {
        const personalizedRanks = await vertexLabRankingService.rankProfiles(
          [pubkey],
          'personalizedPagerank',
          source
        );
        personalizedScore = personalizedRanks.get(pubkey) || 0;
      }
    }

    // Blend scores: Satnam 60% + VertexLab 40%
    const hybridScore = this.enabled
      ? (satnamMetrics.compositeScore.value * 0.6) + (vertexlabScore * 0.4)
      : satnamMetrics.compositeScore.value;

    return {
      satnamScore: satnamMetrics.compositeScore.value,
      vertexlabScore,
      hybridScore,
      components: {
        satnam: {
          rank: satnamMetrics.rank.value,
          followers: satnamMetrics.followers.value,
          hops: satnamMetrics.hops.value,
          influence: satnamMetrics.influence.value,
          reliability: satnamMetrics.reliability.value,
          recency: satnamMetrics.recency.value,
        },
        vertexlab: {
          globalPagerank: vertexlabScore,
          personalizedPagerank: personalizedScore,
        },
      },
    };
  }
}

export const hybridTrustScoringService = new HybridTrustScoringService();
```

### 2.2 Database Schema Update

**File:** `supabase/migrations/040_hybrid_trust_metrics.sql`

```sql
-- Add VertexLab metrics to trust_metrics table
ALTER TABLE public.trust_metrics
ADD COLUMN IF NOT EXISTS vertexlab_global_pagerank FLOAT,
ADD COLUMN IF NOT EXISTS vertexlab_personalized_pagerank FLOAT,
ADD COLUMN IF NOT EXISTS hybrid_score FLOAT,
ADD COLUMN IF NOT EXISTS vertexlab_updated_at TIMESTAMPTZ;

-- Index for hybrid score queries
CREATE INDEX IF NOT EXISTS idx_trust_metrics_hybrid_score 
  ON public.trust_metrics(hybrid_score DESC);

-- Index for VertexLab update tracking
CREATE INDEX IF NOT EXISTS idx_trust_metrics_vertexlab_updated 
  ON public.trust_metrics(vertexlab_updated_at DESC);
```

---

## Part 3: Testing Strategy

### 3.1 Unit Tests

**File:** `tests/trust/vertexlab-integration.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VertexLabRankingService } from '../../src/lib/trust/vertexlab-integration';

describe('VertexLabRankingService', () => {
  let service: VertexLabRankingService;

  beforeEach(() => {
    service = new VertexLabRankingService();
  });

  it('should handle empty pubkey list', async () => {
    const results = await service.rankProfiles([]);
    expect(results.size).toBe(0);
  });

  it('should reject >1000 pubkeys', async () => {
    const pubkeys = Array(1001).fill('npub1...');
    await expect(service.rankProfiles(pubkeys)).rejects.toThrow();
  });

  it('should parse valid rank response', async () => {
    // Mock relay response
    const results = await service.rankProfiles(['npub1...']);
    expect(results instanceof Map).toBe(true);
  });
});
```

### 3.2 Integration Tests

**File:** `tests/trust/hybrid-trust-scoring.test.ts`

```typescript
describe('HybridTrustScoringService', () => {
  it('should blend Satnam and VertexLab scores', async () => {
    const service = new HybridTrustScoringService();
    const metrics = await service.calculateHybridScore(
      'user-123',
      'npub1...'
    );

    expect(metrics.hybridScore).toBeGreaterThanOrEqual(0);
    expect(metrics.hybridScore).toBeLessThanOrEqual(100);
    expect(metrics.satnamScore).toBeDefined();
    expect(metrics.vertexlabScore).toBeDefined();
  });
});
```

---

## Part 4: Deployment Checklist

- [ ] Feature flags configured in `.env`
- [ ] VertexLab relay connectivity tested
- [ ] Unit tests passing (>80% coverage)
- [ ] Integration tests passing
- [ ] E2E tests with real VertexLab relay
- [ ] Performance benchmarks (latency <500ms)
- [ ] Privacy audit (no PII in requests)
- [ ] Documentation updated
- [ ] Rollback plan documented
- [ ] Monitoring/alerting configured

---

## Part 5: Monitoring & Observability

**Metrics to Track:**
- VertexLab relay connection uptime
- Average response time (target: <500ms)
- Cache hit rate for rank queries
- Hybrid score distribution
- Error rates by endpoint

**Alerts:**
- Relay connection failures
- Response timeouts (>5s)
- Parse errors on responses
- Unusual score distributions

---

## References

- VertexLab API: https://vertexlab.io/docs/services/rank-profiles/
- Nostr DVMs: https://github.com/nostr-protocol/nips/blob/master/90.md
- Satnam Trust System: `src/lib/trust/`

