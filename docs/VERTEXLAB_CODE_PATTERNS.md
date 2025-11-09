# VertexLab Integration: Code Patterns & Examples

**Purpose:** Practical code examples for implementing VertexLab integration  
**Audience:** Developers implementing Tier 1-2  
**Status:** Ready for implementation

---

## Pattern 1: Basic Rank Profiles Query

### Simple Usage (Client-Side)

```typescript
import { vertexLabRankingService } from '@/lib/trust/vertexlab-integration';

// Rank a list of pubkeys
const pubkeys = [
  'npub1user1...',
  'npub1user2...',
  'npub1user3...',
];

const ranks = await vertexLabRankingService.rankProfiles(pubkeys);

// Use results
for (const [pubkey, rank] of ranks) {
  console.log(`${pubkey}: ${rank}`);
}
```

### With Error Handling

```typescript
try {
  const ranks = await vertexLabRankingService.rankProfiles(pubkeys);
  
  if (ranks.size === 0) {
    console.warn('No ranks returned, using fallback');
    // Fallback to Satnam metrics
    return await satnamTrustService.getRanks(pubkeys);
  }
  
  return ranks;
} catch (error) {
  console.error('VertexLab ranking failed:', error);
  // Graceful degradation
  return await satnamTrustService.getRanks(pubkeys);
}
```

---

## Pattern 2: Batch Ranking for Comments

### React Component Example

```typescript
import { useEffect, useState } from 'react';
import { vertexLabRankingService } from '@/lib/trust/vertexlab-integration';

interface Comment {
  id: string;
  author_pubkey: string;
  content: string;
  created_at: number;
}

export function CommentThread({ comments }: { comments: Comment[] }) {
  const [sortedComments, setSortedComments] = useState<Comment[]>(comments);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sortByReputation = async () => {
      setLoading(true);
      try {
        // Extract unique pubkeys
        const pubkeys = [...new Set(comments.map(c => c.author_pubkey))];
        
        // Batch rank (up to 1000)
        const ranks = await vertexLabRankingService.rankProfiles(pubkeys);
        
        // Sort comments by author rank
        const sorted = [...comments].sort((a, b) => {
          const rankA = ranks.get(a.author_pubkey) ?? 0;
          const rankB = ranks.get(b.author_pubkey) ?? 0;
          return rankB - rankA;
        });
        
        setSortedComments(sorted);
      } catch (error) {
        console.error('Failed to sort comments:', error);
        // Keep original order on error
      } finally {
        setLoading(false);
      }
    };

    sortByReputation();
  }, [comments]);

  return (
    <div className="comment-thread">
      {loading && <div>Sorting by reputation...</div>}
      {sortedComments.map(comment => (
        <CommentCard key={comment.id} comment={comment} />
      ))}
    </div>
  );
}
```

---

## Pattern 3: Reputation-Based Rate Limiting

### Netlify Function Example

```typescript
// netlify/functions/utils/reputation-rate-limiter.ts
import { vertexLabRankingService } from '../../../src/lib/trust/vertexlab-integration';

interface RateLimitBudget {
  allowed: boolean;
  budget: number;
  reason: string;
}

export class ReputationRateLimiter {
  private tokenBuckets = new Map<string, { tokens: number; lastRefill: number }>();
  private unknownPubkeyQueue = new Map<string, number>(); // IP -> count

  async checkBudget(
    pubkey: string,
    ipAddress: string
  ): Promise<RateLimitBudget> {
    // Step 1: Check IP-based unknown pubkey limit
    const unknownCount = this.unknownPubkeyQueue.get(ipAddress) ?? 0;
    if (unknownCount > 100) {
      return {
        allowed: false,
        budget: 0,
        reason: 'IP unknown pubkey limit exceeded',
      };
    }

    // Step 2: Get pubkey rank from VertexLab
    const ranks = await vertexLabRankingService.rankProfiles([pubkey]);
    const rank = ranks.get(pubkey) ?? 0;

    // Step 3: Calculate token bucket refill rate
    // Budget = B * rank (where B is total budget)
    const totalBudget = 1000; // events per hour
    const pubkeyBudget = totalBudget * rank;

    // Step 4: Check token bucket
    const bucket = this.tokenBuckets.get(pubkey) ?? {
      tokens: pubkeyBudget,
      lastRefill: Date.now(),
    };

    // Refill tokens based on time elapsed
    const now = Date.now();
    const elapsedMs = now - bucket.lastRefill;
    const refillRate = pubkeyBudget / (60 * 60 * 1000); // per millisecond
    bucket.tokens = Math.min(
      pubkeyBudget,
      bucket.tokens + elapsedMs * refillRate
    );
    bucket.lastRefill = now;

    // Step 5: Check if budget available
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.tokenBuckets.set(pubkey, bucket);
      return {
        allowed: true,
        budget: Math.floor(bucket.tokens),
        reason: 'OK',
      };
    }

    return {
      allowed: false,
      budget: 0,
      reason: 'Rate limit exceeded',
    };
  }
}

export const rateLimiter = new ReputationRateLimiter();
```

### Usage in API Handler

```typescript
// netlify/functions/api/publish-event.ts
import { rateLimiter } from './utils/reputation-rate-limiter';

export const handler = async (event: any) => {
  const pubkey = event.body.pubkey;
  const ipAddress = event.headers['x-forwarded-for'] || 'unknown';

  // Check reputation-based rate limit
  const budget = await rateLimiter.checkBudget(pubkey, ipAddress);

  if (!budget.allowed) {
    return {
      statusCode: 429,
      body: JSON.stringify({
        error: budget.reason,
        retryAfter: 60,
      }),
    };
  }

  // Process event
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
};
```

---

## Pattern 4: Hybrid Trust Scoring

### Service Implementation

```typescript
// src/lib/trust/hybrid-trust-scoring.ts
import { EnhancedTrustScoringService } from './enhanced-trust-scoring';
import { vertexLabRankingService } from './vertexlab-integration';

export class HybridTrustScoringService {
  private satnamService = new EnhancedTrustScoringService();

  async calculateHybridScore(
    pubkey: string,
    satnamMetrics: any,
    source?: string
  ): Promise<number> {
    // Get Satnam composite score (0-100)
    const satnamScore = satnamMetrics.compositeScore.value;

    // Get VertexLab Pagerank (0-1, normalize to 0-100)
    const ranks = await vertexLabRankingService.rankProfiles(
      [pubkey],
      source ? 'personalizedPagerank' : 'globalPagerank',
      source
    );
    const vertexlabRank = ranks.get(pubkey) ?? 0;
    const vertexlabScore = vertexlabRank * 100;

    // Blend: Satnam 60% + VertexLab 40%
    const hybridScore = (satnamScore * 0.6) + (vertexlabScore * 0.4);

    return Math.min(100, Math.max(0, hybridScore));
  }

  async storeHybridMetrics(
    userId: string,
    pubkey: string,
    hybridScore: number,
    supabase: any
  ): Promise<void> {
    await supabase
      .from('trust_metrics')
      .upsert({
        user_id: userId,
        provider_pubkey: pubkey,
        hybrid_score: hybridScore,
        vertexlab_updated_at: new Date().toISOString(),
      });
  }
}
```

### React Hook Usage

```typescript
import { useEffect, useState } from 'react';
import { hybridTrustScoringService } from '@/lib/trust/hybrid-trust-scoring';

export function useHybridTrustScore(pubkey: string, source?: string) {
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const calculateScore = async () => {
      setLoading(true);
      try {
        // Get Satnam metrics
        const satnamMetrics = await getSatnamMetrics(pubkey);
        
        // Calculate hybrid score
        const hybridScore = await hybridTrustScoringService.calculateHybridScore(
          pubkey,
          satnamMetrics,
          source
        );
        
        setScore(hybridScore);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    calculateScore();
  }, [pubkey, source]);

  return { score, loading, error };
}
```

---

## Pattern 5: Caching Strategy

### Cache Layer

```typescript
// src/lib/trust/vertexlab-cache.ts
interface CacheEntry {
  ranks: Map<string, number>;
  timestamp: number;
  ttl: number;
}

export class VertexLabCache {
  private cache = new Map<string, CacheEntry>();
  private defaultTTL = 24 * 60 * 60 * 1000; // 24 hours

  set(key: string, ranks: Map<string, number>, ttl?: number): void {
    this.cache.set(key, {
      ranks,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL,
    });
  }

  get(key: string): Map<string, number> | null {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.ranks;
  }

  clear(): void {
    this.cache.clear();
  }
}

export const vertexLabCache = new VertexLabCache();
```

### Usage with Caching

```typescript
async function rankProfilesWithCache(
  pubkeys: string[],
  algorithm: string = 'globalPagerank'
): Promise<Map<string, number>> {
  const cacheKey = `${algorithm}:${pubkeys.sort().join(',')}`;
  
  // Check cache first
  const cached = vertexLabCache.get(cacheKey);
  if (cached) {
    console.log('Cache hit for', cacheKey);
    return cached;
  }
  
  // Query VertexLab
  const ranks = await vertexLabRankingService.rankProfiles(pubkeys, algorithm);
  
  // Store in cache
  vertexLabCache.set(cacheKey, ranks);
  
  return ranks;
}
```

---

## Pattern 6: Error Handling & Fallback

### Comprehensive Error Handling

```typescript
export async function rankProfilesSafely(
  pubkeys: string[],
  fallbackService: any
): Promise<Map<string, number>> {
  try {
    // Validate input
    if (!Array.isArray(pubkeys) || pubkeys.length === 0) {
      throw new Error('Invalid pubkeys');
    }

    if (pubkeys.length > 1000) {
      throw new Error('Too many pubkeys (max 1000)');
    }

    // Try VertexLab
    const ranks = await vertexLabRankingService.rankProfiles(pubkeys);
    
    if (ranks.size === 0) {
      throw new Error('No ranks returned');
    }
    
    return ranks;
  } catch (error) {
    console.error('VertexLab ranking failed:', error);
    
    // Fallback to Satnam
    try {
      console.log('Falling back to Satnam metrics');
      return await fallbackService.getRanks(pubkeys);
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      
      // Last resort: return empty map
      return new Map();
    }
  }
}
```

---

## Pattern 7: Feature Flag Integration

### Configuration

```typescript
// src/config/env.client.ts
export const VERTEXLAB_CONFIG = {
  enabled: getEnvVar('VITE_VERTEXLAB_RANKING_ENABLED') === 'true',
  relayUrl: getEnvVar('VITE_VERTEXLAB_RELAY_URL') || 'wss://relay.vertexlab.io',
  cacheTTL: parseInt(getEnvVar('VITE_VERTEXLAB_CACHE_TTL') || '86400000'),
  timeoutMs: parseInt(getEnvVar('VITE_VERTEXLAB_TIMEOUT_MS') || '5000'),
  hybridEnabled: getEnvVar('VITE_HYBRID_TRUST_SCORING_ENABLED') === 'true',
  hybridWeights: {
    satnam: 0.6,
    vertexlab: 0.4,
  },
};
```

### Conditional Component Rendering

```typescript
import { VERTEXLAB_CONFIG } from '@/config/env.client';

export function CommentThread({ comments }: Props) {
  if (!VERTEXLAB_CONFIG.enabled) {
    // Use original sorting
    return <OriginalCommentThread comments={comments} />;
  }

  // Use VertexLab-enhanced sorting
  return <VertexLabCommentThread comments={comments} />;
}
```

---

## Pattern 8: Monitoring & Observability

### Metrics Collection

```typescript
// src/lib/trust/vertexlab-metrics.ts
export class VertexLabMetrics {
  private metrics = {
    queriesTotal: 0,
    queriesSuccess: 0,
    queriesFailed: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgResponseTime: 0,
    lastError: null as Error | null,
  };

  recordQuery(success: boolean, responseTimeMs: number): void {
    this.metrics.queriesTotal++;
    if (success) {
      this.metrics.queriesSuccess++;
    } else {
      this.metrics.queriesFailed++;
    }
    
    // Update average response time
    this.metrics.avgResponseTime = 
      (this.metrics.avgResponseTime * (this.metrics.queriesTotal - 1) + responseTimeMs) /
      this.metrics.queriesTotal;
  }

  recordCacheHit(): void {
    this.metrics.cacheHits++;
  }

  recordCacheMiss(): void {
    this.metrics.cacheMisses++;
  }

  recordError(error: Error): void {
    this.metrics.lastError = error;
  }

  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.queriesTotal > 0
        ? this.metrics.queriesSuccess / this.metrics.queriesTotal
        : 0,
      cacheHitRate: (this.metrics.cacheHits + this.metrics.cacheMisses) > 0
        ? this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)
        : 0,
    };
  }
}

export const vertexLabMetrics = new VertexLabMetrics();
```

---

## Summary

These patterns provide a foundation for implementing VertexLab integration while maintaining:
- ✅ Error handling & graceful degradation
- ✅ Privacy & security
- ✅ Performance (caching, batching)
- ✅ Observability (metrics, logging)
- ✅ Feature flags (gradual rollout)

**Next Step:** Use these patterns as templates for Tier 1 implementation.

