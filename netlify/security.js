/**
 * Security utilities for Netlify Functions
 * MASTER CONTEXT COMPLIANCE: Security functions for serverless environment
 */

export async function deriveEncryptionKey(password, salt) {
  // Simplified implementation for Netlify Functions
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export function generateSalt() {
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  return salt;
}

export async function encryptData(data, key) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    encoder.encode(data)
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decryptData(encryptedData, key) {
  const combined = new Uint8Array(
    atob(encryptedData).split('').map(char => char.charCodeAt(0))
  );

  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    encrypted
  );

  return new TextDecoder().decode(decrypted);
}

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export async function verifyPassword(password, hash) {
  const computedHash = await hashPassword(password);

  // Use constant-time comparison to prevent timing attacks
  if (computedHash.length !== hash.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < computedHash.length; i++) {
    result |= computedHash.charCodeAt(i) ^ hash.charCodeAt(i);
  }

  return result === 0;
}

export function generateSecureToken(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/[+/]/g, '')
    .substring(0, length);
}

export async function encryptCredentials(data, password) {
  const salt = generateSalt();
  const key = await deriveEncryptionKey(password, salt);
  const encrypted = await encryptData(data, key);

  // Combine salt and encrypted data
  const saltB64 = btoa(String.fromCharCode(...salt));
  return `${saltB64}:${encrypted}`;
}

export async function decryptCredentials(encryptedData, password) {
  const [saltB64, encrypted] = encryptedData.split(':');
  const salt = new Uint8Array(
    atob(saltB64).split('').map(char => char.charCodeAt(0))
  );
  const key = await deriveEncryptionKey(password, salt);
  return await decryptData(encrypted, key);
}
