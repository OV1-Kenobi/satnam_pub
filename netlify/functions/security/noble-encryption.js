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

// Serialize as: n2enc:<iv_hex>:<cipher_hex>
function serialize(iv, cipher) {
  return `n2enc:${toHex(iv)}:${toHex(cipher)}`;
}
function parseSerialized(s) {
  if (typeof s !== 'string' || !s.startsWith('n2enc:')) return null;
  const parts = s.split(':');
  if (parts.length !== 3) return null;
  const iv = fromHex(parts[1]);
  const cipher = fromHex(parts[2]);
  return { iv, cipher };
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
    return serialize(iv, ct);
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

