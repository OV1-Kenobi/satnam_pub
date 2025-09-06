// Netlify-safe Noble V2 encryption helpers (pure ESM)
// - Uses only process.env (no import.meta.env)
// - Dynamic ESM imports for noble libs are avoided to allow bundling; keep static where possible
// - No browser-only APIs; compatible with Netlify Functions runtime

import * as nodeCrypto from 'node:crypto';

// Lazy-load noble libs to keep cold starts reasonable when tree-shaken
let _gcm;
let _sha256;

async function ensureLibs() {
  if (!_gcm) {
    const mod = await import('@noble/ciphers/aes');
    _gcm = mod.gcm;
  }
  if (!_sha256) {
    const mod = await import('@noble/hashes/sha256');
    _sha256 = mod.sha256;
  }
}

function toHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}
function fromHex(hex) {
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

function utf8Bytes(str) {
  return new TextEncoder().encode(str);
}

function getRandomIv() {
  // 96-bit IV for AES-GCM
  const iv = new Uint8Array(12);
  const webcrypto = nodeCrypto.webcrypto;
  if (webcrypto && webcrypto.getRandomValues) {
    webcrypto.getRandomValues(iv);
  } else {
    // Fallback: node randomFillSync
    nodeCrypto.randomFillSync(iv);
  }
  return iv;
}

async function deriveKeyFromSalt(salt) {
  await ensureLibs();
  // Simple KDF: key = sha256(utf8(salt))
  // Caller must provide high-entropy per-user salt (24-byte+ base64 recommended)
  const digest = _sha256(utf8Bytes(String(salt)));
  // Use first 32 bytes as AES-256 key
  return new Uint8Array(digest.slice(0, 32));
}

// Base64url helpers for Noble V2 compact format
function b64urlEncode(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
function b64urlDecode(s) {
  const pad = s.length % 4;
  const normalized = (pad ? s + '='.repeat(4 - pad) : s)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return new Uint8Array(Buffer.from(normalized, 'base64'));
}

// Serialize as Noble V2: noble-v2.<salt_b64url>.<iv_b64url>.<cipher_b64url>
function serializeNobleV2(iv, cipher, userSalt) {
  const saltBytes = utf8Bytes(String(userSalt || ''));
  const saltSeg = b64urlEncode(saltBytes);
  const ivSeg = b64urlEncode(iv);
  const ctSeg = b64urlEncode(cipher);
  return `noble-v2.${saltSeg}.${ivSeg}.${ctSeg}`;
}

// Backward compatibility parser: supports both n2enc and noble-v2 formats
function parseSerialized(s) {
  if (typeof s !== 'string') return null;
  // Legacy format: n2enc:<iv_hex>:<cipher_hex>
  if (s.startsWith('n2enc:')) {
    const parts = s.split(':');
    if (parts.length !== 3) return null;
    const iv = fromHex(parts[1]);
    const cipher = fromHex(parts[2]);
    return { iv, cipher };
  }
  // Noble V2 format: noble-v2.<salt>.<iv>.<cipher> (all base64url)
  if (s.startsWith('noble-v2.')) {
    const parts = s.split('.');
    if (parts.length !== 4) return null;
    const iv = b64urlDecode(parts[2]);
    const cipher = b64urlDecode(parts[3]);
    return { iv, cipher };
  }
  return null;
}

export async function encryptNsecSimple(nsecBech32, userSalt) {
  try {
    if (!nsecBech32 || typeof nsecBech32 !== 'string') {
      throw new Error('encryptNsecSimple: invalid nsec');
    }
    if (!userSalt || typeof userSalt !== 'string') {
      throw new Error('encryptNsecSimple: invalid salt');
    }
    await ensureLibs();
    const key = await deriveKeyFromSalt(userSalt);
    const iv = getRandomIv();
    const aead = _gcm(key, iv);
    const pt = utf8Bytes(nsecBech32);
    const ct = aead.encrypt(pt);
    // Return Noble V2 compliant compact format to satisfy DB constraint
    return serializeNobleV2(iv, ct, userSalt);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`encryptNsecSimple failed: ${msg}`);
  }
}

export async function decryptNsecSimple(serialized, userSalt) {
  try {
    if (!serialized || typeof serialized !== 'string') {
      throw new Error('decryptNsecSimple: invalid input');
    }
    if (!userSalt || typeof userSalt !== 'string') {
      throw new Error('decryptNsecSimple: invalid salt');
    }
    await ensureLibs();
    const parsed = parseSerialized(serialized);
    if (!parsed) throw new Error('decryptNsecSimple: parse failed');
    const key = await deriveKeyFromSalt(userSalt);
    const aead = _gcm(key, parsed.iv);
    const pt = aead.decrypt(parsed.cipher);
    return new TextDecoder().decode(pt);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`decryptNsecSimple failed: ${msg}`);
  }
}

