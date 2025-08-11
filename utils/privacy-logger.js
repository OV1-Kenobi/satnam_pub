/**
 * Privacy-aware logging utility
 * - Whitelist-based: only logs explicitly safe fields by default
 * - Redacts sensitive fields: npub, duid, nip05, signature, nsec, privateKey, password, authHash, salt
 * - Preserves useful metadata like timestamp, status, message (sanitized)
 * - Works in both browser and Node.js environments
 * - Development mode can reveal masked strings (never in production)
 */

/** @typedef {"log"|"warn"|"error"} LogLevel */

const SENSITIVE_KEYS = new Set([
  "npub",
  "duid",
  "nip05",
  "signature",
  "nsec",
  "privateKey",
  "password",
  "authHash",
  "salt",
]);

// Safe metadata keys permitted in logs by default (whitelist)
const SAFE_KEYS = new Set([
  "timestamp",
  "status",
  "message",
  "level",
  "code",
  "operation",
  "context",
]);

let devMode = false;

function detectDevMode() {
  try {
    // Use Node.js environment variable exclusively for server-side functions
    if (typeof process !== "undefined" && process.env) {
      return process.env.NODE_ENV !== "production";
    }
  } catch {}
  // Default to false when NODE_ENV is not available
  return false;
}

devMode = detectDevMode();

/**
 * Redact sensitive patterns in strings for development diagnostics
 * Never reveal originals in production
 * @param {string} s
 */
function maskSensitiveInString(s) {
  if (!s || typeof s !== "string") return s;
  // Mask common patterns (best-effort)
  return s
    // Nostr bech32 keys
    .replace(/npub1[a-z0-9]+/gi, "npub1[REDACTED]")
    .replace(/nsec1[a-z0-9]+/gi, "nsec1[REDACTED]")
    // Long hex sequences (signatures, keys)
    .replace(/[a-f0-9]{64,}/gi, (m) => m.slice(0, 8) + "[REDACTED]")
    // Email-like (nip05)
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[REDACTED_EMAIL]");
}

/**
 * Sanitize a single argument based on whitelist rules
 * - Objects: keep only SAFE_KEYS and drop SENSITIVE_KEYS
 * - Errors: include name and message
 * - Strings: show masked in dev, redacted in prod
 * - Primitives: pass through
 * @param {any} arg
 * @returns {any}
 */
function sanitizeArg(arg) {
  if (arg instanceof Error) {
    return { name: arg.name, message: arg.message };
  }

  if (arg && typeof arg === "object" && !Array.isArray(arg)) {
    const out = {};
    for (const [k, v] of Object.entries(arg)) {
      if (SENSITIVE_KEYS.has(k)) continue; // drop
      if (SAFE_KEYS.has(k)) {
        if (v instanceof Error) {
          out[k] = { name: v.name, message: v.message };
        } else if (typeof v === "string") {
          out[k] = devMode ? maskSensitiveInString(v) : "[redacted]";
        } else if (v && typeof v === "object") {
          // Avoid deep nesting; include basic type info
          out[k] = "[object]";
        } else {
          out[k] = v;
        }
      }
    }
    return out;
  }

  if (Array.isArray(arg)) {
    return arg.map((x) => sanitizeArg(x));
  }

  if (typeof arg === "string") {
    return devMode ? maskSensitiveInString(arg) : "[redacted]";
  }

  return arg; // numbers, booleans, null, undefined
}

/**
 * Build sanitized arguments array for console methods
 * @param {any[]} args
 */
function buildArgs(args) {
  return args.map((a) => sanitizeArg(a));
}

/**
 * Internal logging dispatch
 * @param {LogLevel} level
 * @param {any[]} args
 */
function dispatch(level, args) {
  const safeArgs = buildArgs(args);
  try {
    // eslint-disable-next-line no-console
    console[level](...safeArgs);
  } catch {
    // eslint-disable-next-line no-console
    console[level]("[privacy-logger]: failed to log safely");
  }
}

export const redactLogger = {
  /**
   * Set development mode (optional override)
   * @param {boolean} value
   */
  setDevMode(value) {
    devMode = !!value;
  },
  /**
   * Safe log
   * @param  {...any} args
   */
  log(...args) {
    dispatch("log", args);
  },
  /**
   * Safe warn
   * @param  {...any} args
   */
  warn(...args) {
    dispatch("warn", args);
  },
  /**
   * Safe error
   * @param  {...any} args
   */
  error(...args) {
    dispatch("error", args);
  },
};

// Named exports for convenience
export const setDevMode = (v) => redactLogger.setDevMode(v);
export const log = (...args) => redactLogger.log(...args);
export const warn = (...args) => redactLogger.warn(...args);
export const error = (...args) => redactLogger.error(...args);

/**
 * Usage examples:
 *
 * // Good: explicit safe fields
 * log('Operation complete', { timestamp: new Date().toISOString(), status: 'ok' });
 *
 * // Avoid: raw identifiers or secrets
 * // log('npub is', user.npub) // ❌
 *
 * // Errors are reduced to name/message automatically
 * try { throw new Error('Example'); } catch (e) { error('Failed', { error: e, timestamp: new Date().toISOString() }); }
 */

