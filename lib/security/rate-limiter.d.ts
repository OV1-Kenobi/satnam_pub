/**
 * Type declarations for lib/security/rate-limiter.js
 * CRITICAL: Rate limiter type definitions
 */

export interface RateLimiterConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: any) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export class RateLimiter {
  constructor(config: RateLimiterConfig);

  isAllowed(key: string): Promise<boolean>;
  reset(key: string): Promise<void>;
  getStats(key: string): Promise<{
    totalHits: number;
    remainingPoints: number;
    msBeforeNext: number;
  }>;
}

export function createRateLimiter(config: RateLimiterConfig): RateLimiter;
export function createMemoryStore(): any;
export function createRedisStore(redisClient: any): any;
export function monitorFailOpenScenarios(): Promise<any>;
