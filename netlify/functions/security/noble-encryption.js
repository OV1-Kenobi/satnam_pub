// Netlify-safe Noble V2 encryption helpers (pure ESM)
// - Uses only process.env (no import.meta.env)
// - Dynamic ESM imports for noble libs are avoided to allow bundling; keep static where possible
// - No browser-only APIs; compatible with Netlify Functions runtime

import * as nodeCrypto from 'node:crypto';

// Lazy-load noble libs to keep cold starts reasonable when tree-shaken
let _gcm;
let _sha256;
let _pbkdf2;

async function ensureLibs() {
  if (!_gcm) {
    const mod = await import('@noble/ciphers/aes');
    _gcm = mod.gcm;
  }
  if (!_sha256) {
    const mod = await import('@noble/hashes/sha256');
    _sha256 = mod.sha256;
  }
  if (!_pbkdf2) {
    const mod = await import('@noble/hashes/pbkdf2');
    _pbkdf2 = mod.pbkdf2;
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

async function deriveKeyPBKDF2(userSalt, randomSaltBytes) {
  await ensureLibs();
  // PBKDF2 (SHA-256), 100k iterations, 32-byte key – matches client Noble V2 spec
  const key = _pbkdf2(_sha256, String(userSalt), randomSaltBytes, {
    c: 100000,
    dkLen: 32,
  });
  return key; // Uint8Array length 32
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
function serializeNobleV2(iv, cipher, randomSaltBytes) {
  const saltSeg = b64urlEncode(randomSaltBytes);
  const ivSeg = b64urlEncode(iv);
  const ctSeg = b64urlEncode(cipher);
  return `noble-v2.${saltSeg}.${ivSeg}.${ctSeg}`;
}

// Parser: supports noble-v2 format (and legacy n2enc only for completeness)
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
    const salt = b64urlDecode(parts[1]);
    const iv = b64urlDecode(parts[2]);
    const cipher = b64urlDecode(parts[3]);
    return { salt, iv, cipher };
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
    // Generate 32-byte random salt (PBKDF2 salt)
    const randomSalt = new Uint8Array(32);
    const wc = nodeCrypto.webcrypto;
    if (wc && wc.getRandomValues) wc.getRandomValues(randomSalt); else nodeCrypto.randomFillSync(randomSalt);

    // Derive key via PBKDF2-SHA256 (100k, 32 bytes)
    const key = await deriveKeyPBKDF2(userSalt, randomSalt);

    // Encrypt
    const iv = getRandomIv();
    const aead = _gcm(key, iv);
    const pt = utf8Bytes(nsecBech32);
    const ct = aead.encrypt(pt);

    // Serialize noble-v2 with RANDOM salt (not userSalt)
    return serializeNobleV2(iv, ct, randomSalt);
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

/**
 * Encrypt a profile field (username, bio, display_name, etc.) using Noble V2
 * Returns separate cipher, iv, and tag for database storage
 * @param {string} plaintext - The field value to encrypt
 * @param {string} userSalt - User's unique salt for key derivation
 * @returns {Promise<{cipher: string, iv: string, tag: string}>} Encrypted components
 */
export async function encryptField(plaintext, userSalt) {
  try {
    if (!plaintext || typeof plaintext !== 'string') {
      throw new Error('encryptField: invalid plaintext');
    }
    if (!userSalt || typeof userSalt !== 'string') {
      throw new Error('encryptField: invalid salt');
    }
    await ensureLibs();

    // Generate 32-byte random salt (PBKDF2 salt)
    const randomSalt = new Uint8Array(32);
    const wc = nodeCrypto.webcrypto;
    if (wc && wc.getRandomValues) wc.getRandomValues(randomSalt); else nodeCrypto.randomFillSync(randomSalt);

    // Derive key via PBKDF2-SHA256 (100k, 32 bytes)
    const key = await deriveKeyPBKDF2(userSalt, randomSalt);

    // Encrypt
    const iv = getRandomIv();
    const aead = _gcm(key, iv);
    const pt = utf8Bytes(plaintext);
    const ct = aead.encrypt(pt);

    // Return separate components for database storage
    return {
      cipher: b64urlEncode(ct),
      iv: b64urlEncode(iv),
      tag: b64urlEncode(randomSalt), // Store the random salt as "tag" for decryption
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`encryptField failed: ${msg}`);
  }
}

/**
 * Decrypt a profile field using Noble V2
 * @param {string} cipherB64 - Base64url encoded cipher text
 * @param {string} ivB64 - Base64url encoded IV
 * @param {string} tagB64 - Base64url encoded random salt
 * @param {string} userSalt - User's unique salt for key derivation
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function decryptField(cipherB64, ivB64, tagB64, userSalt) {
  try {
    if (!cipherB64 || !ivB64 || !tagB64 || !userSalt) {
      throw new Error('decryptField: missing required parameters');
    }
    await ensureLibs();

    // Decode components
    const cipher = b64urlDecode(cipherB64);
    const iv = b64urlDecode(ivB64);
    const randomSalt = b64urlDecode(tagB64);

    // Derive key using the same random salt
    const key = await deriveKeyPBKDF2(userSalt, randomSalt);

    // Decrypt
    const aead = _gcm(key, iv);
    const pt = aead.decrypt(cipher);
    return new TextDecoder().decode(pt);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`decryptField failed: ${msg}`);
  }
}

