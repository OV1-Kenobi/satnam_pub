/**
 * Shared in-memory rate limiter (best-effort for serverless)
 *
 * Limits requests per IP within a sliding time window.
 * Intended for lightweight abuse protection on Netlify Functions.
 *
 * Notes:
 * - This is per-instance memory. In multi-instance environments, limits are not global.
 * - For stronger guarantees, use a centralized store (e.g., Redis/Upstash).
 *
 * @typedef {Object} RateRecord
 * @property {number} count
 * @property {number} windowStart
 */

// Module-scoped store. Survives warm invocations but resets on cold start.
const rateMap = new Map();

/**
 * Allow a request based on IP, limit, and window size.
 * @param {string} ip - Client IP address (e.g., from x-forwarded-for)
 * @param {number} [limit=10] - Max requests allowed within the window
 * @param {number} [windowMs=60000] - Window size in milliseconds
 * @returns {boolean} true if allowed, false if rate limit exceeded
 */
export function allowRequest(ip, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const rec = rateMap.get(ip);
  if (!rec) {
    rateMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (now - rec.windowStart > windowMs) {
    rateMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (rec.count >= limit) return false;
  rec.count += 1;
  return true;
}

/**
 * Optional: clear state (useful for tests)
 */
export function __resetRateLimiter() {
  rateMap.clear();
}

