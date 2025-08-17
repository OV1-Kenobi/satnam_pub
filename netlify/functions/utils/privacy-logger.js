// Privacy-safe logging utilities for Netlify Functions (ESM)
// Redacts PII by hashing or truncating sensitive identifiers

import * as crypto from 'crypto';

function getSecret() {
  // Use the canonical server secret for consistent hashing
  return process.env.DUID_SERVER_SECRET || '';
}

function privacyHash(value) {
  const str = typeof value === 'string' ? value : JSON.stringify(value || '');
  const secret = getSecret();
  if (secret) {
    return crypto.createHmac('sha256', secret).update(str).digest('hex');
  }
  // Fallback (dev): non-keyed hash
  return crypto.createHash('sha256').update(str).digest('hex');
}

function prefix(value, n = 10) {
  const str = typeof value === 'string' ? value : String(value || '');
  if (!str) return '';
  return str.substring(0, n) + '...';
}

function sanitizeKeyValue(key, value) {
  try {
    if (value == null) return value;
    const k = String(key).toLowerCase();
    const v = typeof value === 'string' ? value : JSON.stringify(value);

    // Known sensitive keys
    if (k.includes('npub')) return prefix(v, 10);
    if (k.includes('username')) return privacyHash(v).substring(0, 12);
    if (k.includes('nip05') || k.includes('email')) return privacyHash(v).substring(0, 12);
    if (k.includes('token')) return privacyHash(v).substring(0, 12);
    if (k.includes('session')) return privacyHash(v).substring(0, 12);
    if (k.includes('nsec') || k.includes('secret') || k.includes('password')) return '[REDACTED]';

    // Heuristics
    if (v.startsWith('npub1')) return prefix(v, 10);
    if (v.includes('@')) return privacyHash(v).substring(0, 12);

    return value;
  } catch {
    return '[UNLOGGABLE]';
  }
}

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => sanitize(v));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitize(v);
    } else {
      out[k] = sanitizeKeyValue(k, v);
    }
  }
  return out;
}

function baseLog(method, operation, context = {}) {
  const payload = {
    op: operation,
    ts: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    ...sanitize(context),
  };
  try {
    // eslint-disable-next-line no-console
    console[method](payload);
  } catch {
    // eslint-disable-next-line no-console
    console.log(payload);
  }
}

function safeLog(operation, context) {
  baseLog('log', operation, context);
}
function safeWarn(operation, context) {
  baseLog('warn', operation, context);
}
function safeError(operation, context) {
  baseLog('error', operation, context);
}

export { prefix, privacyHash, safeError, safeLog, safeWarn, sanitize };

