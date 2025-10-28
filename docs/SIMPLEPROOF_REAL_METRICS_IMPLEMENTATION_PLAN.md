# SimpleProof Real Metrics Implementation Plan
**Phase 2B-2 Day 17: Analytics Enhancement**

## Executive Summary

This document outlines the implementation plan for replacing simulated metrics in the SimpleProof Analytics Dashboard with real, production-grade data collection and tracking.

## Current State: Simulated Metrics

The following metrics are currently using simulated/placeholder data:

1. **Response Time Metrics** - Using `Math.random()` to generate fake latency data
2. **Cache Hit Rate Metrics** - Assuming 65% hit rate with random variations
3. **Rate Limit Metrics** - Simulating rate limiter state without actual tracking
4. **Event Type Breakdown** - All events assigned to 'unknown' type
5. **BTC/USD Conversion Rate** - Hardcoded at 0.0005 (may be inaccurate)

## Implementation Plan

### Phase 1: Event Type Metadata Storage (Week 1)

#### 1.1 Database Schema Enhancement

**File**: `supabase/migrations/035_simpleproof_event_types.sql`

```sql
-- Add event_type column to simpleproof_timestamps table
ALTER TABLE simpleproof_timestamps
ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'unknown'
  CHECK (event_type IN (
    'account_creation',
    'key_rotation',
    'nfc_registration',
    'family_federation',
    'guardian_role_change',
    'unknown'
  ));

-- Add index for event type queries
CREATE INDEX IF NOT EXISTS idx_simpleproof_timestamps_event_type
  ON simpleproof_timestamps(event_type);

-- Add metadata JSONB column for additional context
ALTER TABLE simpleproof_timestamps
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add GIN index for metadata queries
CREATE INDEX IF NOT EXISTS idx_simpleproof_timestamps_metadata
  ON simpleproof_timestamps USING GIN (metadata);
```

#### 1.2 Update Timestamp Interface

**File**: `src/services/simpleProofService.ts`

```typescript
export interface Timestamp {
  id: string;
  verification_id: string;
  ots_proof: string;
  bitcoin_block: number | null;
  bitcoin_tx: string | null;
  created_at: number;
  verified_at: number | null;
  is_valid: boolean | null;
  event_type?: SimpleProofEventType; // NEW
  metadata?: Record<string, any>; // NEW
}
```

#### 1.3 Update Netlify Functions

**File**: `netlify/functions_active/simpleproof-timestamp.ts`

- Extract `event_type` from request metadata
- Store in database during timestamp creation
- Return in API responses

### Phase 2: Performance Tracking Integration (Week 2)

#### 2.1 Sentry Performance Monitoring

**File**: `src/services/simpleProofService.ts`

```typescript
import { startSimpleProofTransaction } from '../lib/sentry';

async createTimestamp(request: TimestampCreateRequest): Promise<TimestampResult> {
  return await startSimpleProofTransaction(
    'simpleproof.create_timestamp',
    'simpleproof.operation',
    async () => {
      const startTime = performance.now();
      
      try {
        const result = await fetchWithTimeout(/* ... */);
        const duration = performance.now() - startTime;
        
        // Store performance metric
        await this.storePerformanceMetric({
          operation: 'create_timestamp',
          duration_ms: duration,
          success: result.success,
          timestamp: Date.now(),
        });
        
        return result;
      } catch (error) {
        const duration = performance.now() - startTime;
        await this.storePerformanceMetric({
          operation: 'create_timestamp',
          duration_ms: duration,
          success: false,
          timestamp: Date.now(),
        });
        throw error;
      }
    }
  );
}
```

#### 2.2 Performance Metrics Database Table

**File**: `supabase/migrations/036_simpleproof_performance_metrics.sql`

```sql
CREATE TABLE IF NOT EXISTS simpleproof_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL CHECK (operation IN ('create_timestamp', 'verify_timestamp', 'get_history')),
  duration_ms NUMERIC NOT NULL,
  success BOOLEAN NOT NULL,
  timestamp BIGINT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for time-series queries
CREATE INDEX idx_simpleproof_performance_timestamp
  ON simpleproof_performance_metrics(timestamp DESC);

-- Index for operation-specific queries
CREATE INDEX idx_simpleproof_performance_operation
  ON simpleproof_performance_metrics(operation, timestamp DESC);

-- RLS policies
ALTER TABLE simpleproof_performance_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own performance metrics"
  ON simpleproof_performance_metrics
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert performance metrics"
  ON simpleproof_performance_metrics
  FOR INSERT
  WITH CHECK (true);
```

### Phase 3: Cache Metrics Tracking (Week 3)

#### 3.1 Enhanced Cache Class

**File**: `src/services/simpleProofService.ts`

```typescript
class SimpleProofCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly ttl = 3600000; // 1 hour
  private metrics = {
    hits: 0,
    misses: 0,
    sets: 0,
  };

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.metrics.misses++;
      this.recordMetric('miss');
      return null;
    }

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.metrics.misses++;
      this.recordMetric('miss');
      return null;
    }

    this.metrics.hits++;
    this.recordMetric('hit');
    return entry.data;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
    this.metrics.sets++;
    this.recordMetric('set');
  }

  getMetrics() {
    const total = this.metrics.hits + this.metrics.misses;
    return {
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      sets: this.metrics.sets,
      hitRate: total > 0 ? (this.metrics.hits / total) * 100 : 0,
    };
  }

  private async recordMetric(type: 'hit' | 'miss' | 'set'): Promise<void> {
    // Store in database for historical tracking
    // Implementation details...
  }
}
```

### Phase 4: Rate Limiter Integration (Week 4)

#### 4.1 Rate Limiter Metrics Endpoint

**File**: `netlify/functions_active/simpleproof-metrics.ts`

```typescript
export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  // Get current rate limit state from rate-limiter.js
  const rateLimiterState = await getRateLimiterMetrics();
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      timestamp: {
        current: rateLimiterState.timestamp.current,
        limit: rateLimiterState.timestamp.limit,
        resetTime: rateLimiterState.timestamp.resetTime,
      },
      verification: {
        current: rateLimiterState.verification.current,
        limit: rateLimiterState.verification.limit,
        resetTime: rateLimiterState.verification.resetTime,
      },
    }),
  };
};
```

### Phase 5: Real-Time BTC/USD Exchange Rate (Week 5)

#### 5.1 Exchange Rate Service

**File**: `src/services/exchangeRateService.ts`

```typescript
class ExchangeRateService {
  private cache: { rate: number; timestamp: number } | null = null;
  private readonly cacheTTL = 300000; // 5 minutes

  async getBTCtoUSD(): Promise<number> {
    if (this.cache && Date.now() - this.cache.timestamp < this.cacheTTL) {
      return this.cache.rate;
    }

    try {
      // Use free API like CoinGecko or Blockchain.info
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
      );
      const data = await response.json();
      const btcPrice = data.bitcoin.usd;
      const satsToUSD = btcPrice / 100000000; // 1 BTC = 100M sats

      this.cache = { rate: satsToUSD, timestamp: Date.now() };
      return satsToUSD;
    } catch (error) {
      console.error('Failed to fetch BTC/USD rate:', error);
      // Fallback to hardcoded rate
      return 0.0005;
    }
  }
}

export const exchangeRateService = new ExchangeRateService();
```

## Migration Strategy

### Step 1: Deploy Database Migrations
```bash
# Run migrations in Supabase SQL editor
psql -f supabase/migrations/035_simpleproof_event_types.sql
psql -f supabase/migrations/036_simpleproof_performance_metrics.sql
```

### Step 2: Update Netlify Functions
- Deploy updated `simpleproof-timestamp.ts` with event_type support
- Deploy new `simpleproof-metrics.ts` endpoint

### Step 3: Update Client Code
- Update `simpleProofService.ts` with performance tracking
- Update `SimpleProofAnalyticsDashboard.tsx` to fetch real metrics

### Step 4: Gradual Rollout
- Phase 1: Event types (immediate)
- Phase 2: Performance metrics (1 week data collection)
- Phase 3: Cache metrics (1 week data collection)
- Phase 4: Rate limiter (immediate)
- Phase 5: Exchange rates (immediate)

## Testing Plan

1. **Unit Tests**: Test each metric collection function
2. **Integration Tests**: Verify end-to-end metric flow
3. **Load Tests**: Ensure metric collection doesn't impact performance
4. **Data Validation**: Verify metric accuracy against known baselines

## Success Criteria

- [ ] All event types correctly categorized (0% 'unknown')
- [ ] Response time metrics within ±10% of Sentry data
- [ ] Cache hit rate matches actual cache behavior
- [ ] Rate limiter metrics reflect actual state
- [ ] BTC/USD rate updated every 5 minutes
- [ ] Dashboard displays "Real Data" badge instead of "Simulated" warnings

## Timeline

- **Week 1**: Event type metadata (5 days)
- **Week 2**: Performance tracking (5 days)
- **Week 3**: Cache metrics (5 days)
- **Week 4**: Rate limiter integration (3 days)
- **Week 5**: Exchange rate service (2 days)
- **Total**: ~4 weeks for complete implementation

## Estimated Effort

- Database migrations: 4 hours
- Netlify Functions updates: 8 hours
- Client-side service updates: 12 hours
- Dashboard UI updates: 6 hours
- Testing & validation: 10 hours
- **Total**: ~40 hours (1 week full-time)

