/*
 * ClientSessionVault
 *
 * Stores the user\'s Nostr credentials (nsec and npub) re-wrapped under a device-held key.
 * - Preferred: WebAuthn-backed device key (stubbed for now)
 * - Fallback: PBKDF2/SHA-512 derived key from a user-provided passphrase
 *
 * Persistence: IndexedDB (encrypted only). No plaintext is persisted.
 * Zero-knowledge: Server never sees plaintext nsec or the device key.
 */

// IMPORTANT: Browser-only APIs (no Node crypto). Use Web Crypto API.

import { showToast } from "../../services/toastService";
import { decryptNsecSimple } from "../privacy/encryption";

import type {
  NFCAuthCallback,
  NFCSecondFactorPolicy,
  NFCVaultConfig,
} from "./nfc-vault-policy";

// Feature flags (opt-in): defaults are disabled to prevent automatic prompts
interface VaultFeatureConfig {
  webauthnEnabled: boolean; // Allow WebAuthn enrollment/unlock
  passphraseEnabled: boolean; // Allow PBKDF2 passphrase unlock
  autoPrompt: boolean; // Allow prompting automatically on load/sign-in
}
let vaultConfig: VaultFeatureConfig = {
  webauthnEnabled: false,
  passphraseEnabled: false,
  autoPrompt: false,
};
export function setVaultFeatureFlags(cfg: Partial<VaultFeatureConfig>): void {
  vaultConfig = { ...vaultConfig, ...cfg };
  try {
    if (typeof window !== "undefined") {
      const persisted = { ...vaultConfig };
      localStorage.setItem("satnam.vault.config", JSON.stringify(persisted));
    }
  } catch {}
}
export function getVaultFeatureFlags(): VaultFeatureConfig {
  try {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("satnam.vault.config");
      if (raw) {
        const parsed = JSON.parse(raw);
        vaultConfig = { ...vaultConfig, ...parsed };
      }
    }
  } catch {}
  return { ...vaultConfig };
}

// Minimal base64 helpers (browser-friendly)
const b64encode = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));
const b64decode = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// Text encoding helpers
const te = new TextEncoder();
const td = new TextDecoder();

// BufferSource helpers to satisfy TS and Web Crypto API
function toAB(viewOrBuf: ArrayBuffer | Uint8Array): ArrayBuffer {
  return viewOrBuf instanceof Uint8Array ? viewOrBuf.slice().buffer : viewOrBuf;
}

// IndexedDB helpers
const DB_NAME = "satnam_client_session_vault";
const DB_VERSION = 2; // upgrade to add key store
const STORE = "vault";
const KEY_STORE = "keys";
const RECORD_ID = "credentials";
const KEY_ID = "deviceKey";

function openVaultDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(KEY_STORE)) {
        db.createObjectStore(KEY_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveRecord(record: any): Promise<void> {
  const db = await openVaultDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE);
      store.put(record);
    });
  } finally {
    db.close();
  }
}

async function loadRecord(): Promise<any | null> {
  const db = await openVaultDB();
  try {
    return await new Promise<any | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE);
      const getReq = store.get(RECORD_ID);
      getReq.onsuccess = () => resolve(getReq.result ?? null);
      getReq.onerror = () => reject(getReq.error);
    });
  } finally {
    db.close();
  }
}

async function deleteRecord(): Promise<void> {
  const db = await openVaultDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE);
      store.delete(RECORD_ID);
    });
  } finally {
    db.close();
  }
}

// Device key (no-prompt) management using JWK in IndexedDB
async function saveDeviceKeyJwk(jwk: JsonWebKey): Promise<void> {
  const db = await openVaultDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KEY_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(KEY_STORE).put({ id: KEY_ID, jwk });
    });
  } finally {
    db.close();
  }
}

async function loadDeviceKey(): Promise<CryptoKey | null> {
  const db = await openVaultDB();
  try {
    const obj: { id: string; jwk: JsonWebKey } | null = await new Promise(
      (resolve, reject) => {
        const tx = db.transaction(KEY_STORE, "readonly");
        tx.onerror = () => reject(tx.error);
        const getReq = tx.objectStore(KEY_STORE).get(KEY_ID);
        getReq.onsuccess = () => resolve(getReq.result ?? null);
        getReq.onerror = () => reject(getReq.error);
      }
    );
    if (!obj?.jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      obj.jwk,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
    return key;
  } finally {
    db.close();
  }
}

async function ensureDeviceKey(): Promise<CryptoKey> {
  const existing = await loadDeviceKey();
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const jwk = (await crypto.subtle.exportKey("jwk", key)) as JsonWebKey;
  await saveDeviceKeyJwk(jwk);
  return key;
}

export async function hasVaultRecord(): Promise<boolean> {
  try {
    const rec = await loadRecord();
    return !!rec;
  } catch {
    return false;
  }
}

// PBKDF2 key derivation (SHA-512)
async function deriveKeyPBKDF2(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    te.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toAB(salt),
      iterations: 100_000,
      hash: "SHA-512",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// HKDF-SHA-256 derive AES-GCM key from input material
async function deriveAesKeyHKDF(
  ikm: ArrayBuffer,
  salt: Uint8Array,
  info: Uint8Array
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveKey",
  ]);
  return await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: toAB(salt), info: toAB(info) },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function sha256(data: ArrayBuffer): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

// AES-GCM helpers
async function encryptStringAESGCM(
  plain: string,
  key: CryptoKey
): Promise<{ ivB64: string; cipherB64: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toAB(iv) },
    key,
    toAB(te.encode(plain))
  );
  return { ivB64: b64encode(iv), cipherB64: b64encode(new Uint8Array(enc)) };
}

async function decryptStringAESGCM(
  cipherB64: string,
  ivB64: string,
  key: CryptoKey
): Promise<string> {
  const iv = b64decode(ivB64);
  const cipher = b64decode(cipherB64);

  const dec = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toAB(iv) },
    key,
    toAB(cipher)
  );
  return td.decode(new Uint8Array(dec));
}

// Import passphrase provider from standalone module to break circular dependency
import {
  getPassphraseProvider,
  requestPassphrase,
} from "./passphrase-provider";

// NFC policy state for vault gating (client-only)
let nfcPolicy: NFCSecondFactorPolicy = "none";
let nfcAwaiter: NFCAuthCallback | null = null;
let nfcCfg: NFCVaultConfig = {
  pinTimeoutMs: 120000,
  confirmationMode: "per_unlock",
  lastAuthAt: undefined,
};

export function setNFCPolicy(p: {
  policy: NFCSecondFactorPolicy;
  awaitNfcAuth?: NFCAuthCallback;
  config?: NFCVaultConfig;
}): void {
  nfcPolicy = p.policy;
  nfcAwaiter = p.awaitNfcAuth || null;
  if (p.config) {
    nfcCfg = { ...nfcCfg, ...p.config };
  }
}

export function isNFCAuthFresh(): boolean {
  return !!(
    nfcCfg.lastAuthAt !== undefined &&
    Date.now() - (nfcCfg.lastAuthAt as number) < nfcCfg.pinTimeoutMs
  );
}

// Module state (in-memory only)
let deviceKey: CryptoKey | null = null;
let pendingNsecHex: string | null = null;
let pendingNpub: string | null = null;

// Storage record shape
interface VaultRecordPBKDF2 {
  id: typeof RECORD_ID;
  method: "pbkdf2";
  algo: "AES-GCM";
  kdfSaltB64: string;
  wrappedNsecB64: string;
  wrappedNsecIvB64: string;
  wrappedNpubB64?: string;
  wrappedNpubIvB64?: string;
  createdAt: number;
}

interface VaultRecordWebAuthn {
  id: typeof RECORD_ID;
  method: "webauthn";
  algo: "AES-GCM";
  webauthnIdHashB64: string;
  vaultSaltB64: string;
  wrappedNsecB64: string;
  wrappedNsecIvB64: string;
  wrappedNpubB64?: string;
  wrappedNpubIvB64?: string;
  createdAt: number;
}

export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(navigator as any).credentials &&
    !!window.PublicKeyCredential
  );
}

interface VaultRecordDevice {
  id: typeof RECORD_ID;
  method: "device";
  algo: "AES-GCM";
  wrappedNsecB64: string;
  wrappedNsecIvB64: string;
  wrappedNpubB64?: string;
  wrappedNpubIvB64?: string;
  createdAt: number;
}

async function tryWebAuthnUnlock(): Promise<boolean> {
  if (!vaultConfig.webauthnEnabled) return false;

  if (!isWebAuthnAvailable()) return false;
  const record = await loadRecord();

  // If we already have a WebAuthn-based record, perform an assertion and derive the AES key
  if (record && (record as VaultRecordWebAuthn).method === "webauthn") {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        userVerification: "required",
      },
    })) as PublicKeyCredential | null;
    if (!assertion) return false;
    const rawId = assertion.rawId;
    const rawIdHash = await sha256(rawId);
    const storedHash = b64decode(
      (record as VaultRecordWebAuthn).webauthnIdHashB64
    );
    if (
      rawIdHash.length !== storedHash.length ||
      !rawIdHash.every((b, i) => b === storedHash[i])
    ) {
      return false;
    }
    const salt = b64decode((record as VaultRecordWebAuthn).vaultSaltB64);
    const info = te.encode("satnam-vault-aes-256-gcm");
    const key = await deriveAesKeyHKDF(rawId, salt, info);
    // Validate by decrypting nsec
    try {
      await decryptStringAESGCM(
        (record as VaultRecordWebAuthn).wrappedNsecB64,
        (record as VaultRecordWebAuthn).wrappedNsecIvB64,
        key
      );
      deviceKey = key;

      return true;
    } catch {
      return false;
    }
  }

  // First-time setup with WebAuthn: create a discoverable credential and wrap credentials under derived key
  if (!record && pendingNsecHex) {
    const rk: ResidentKeyRequirement = "preferred";
    const uv: UserVerificationRequirement = "required";
    const userId = crypto.getRandomValues(new Uint8Array(32));
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: "Satnam", id: window.location.hostname },
        user: { id: userId, name: "satnam-user", displayName: "Satnam User" },
        // Include both ES256 (-7) and RS256 (-257) for maximum authenticator compatibility
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256 (ECDSA w/ SHA-256)
          { type: "public-key", alg: -257 }, // RS256 (RSASSA-PKCS1-v1_5 w/ SHA-256)
        ],
        challenge,
        authenticatorSelection: { residentKey: rk, userVerification: uv },
        attestation: "none",
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    const rawId = cred.rawId;
    const rawIdHash = await sha256(rawId);
    const vaultSalt = crypto.getRandomValues(new Uint8Array(16));
    const info = te.encode("satnam-vault-aes-256-gcm");
    const key = await deriveAesKeyHKDF(rawId, vaultSalt, info);

    // Wrap and save
    const { ivB64: nsecIvB64, cipherB64: nsecCipherB64 } =
      await encryptStringAESGCM(pendingNsecHex!, key);
    let npubFields: { wrappedNpubB64?: string; wrappedNpubIvB64?: string } = {};
    if (pendingNpub) {
      const { ivB64: npubIvB64, cipherB64: npubCipherB64 } =
        await encryptStringAESGCM(pendingNpub, key);
      npubFields = {
        wrappedNpubB64: npubCipherB64,
        wrappedNpubIvB64: npubIvB64,
      };
    }

    const rec: VaultRecordWebAuthn = {
      id: RECORD_ID,
      method: "webauthn",
      algo: "AES-GCM",
      webauthnIdHashB64: b64encode(rawIdHash),
      vaultSaltB64: b64encode(vaultSalt),
      wrappedNsecB64: nsecCipherB64,
      wrappedNsecIvB64: nsecIvB64,
      ...npubFields,
      createdAt: Date.now(),
    };
    await saveRecord(rec);

    deviceKey = key;

    pendingNsecHex = null;
    pendingNpub = null;
    return true;
  }

  return false;
}

export const ClientSessionVault = {
  // Decrypts encrypted_nsec and caches plaintext in memory (pending) for wrapping during unlock().
  async bootstrapFromSignin(
    encryptedNsec: string,
    userSalt: string,
    npub?: string
  ): Promise<void> {
    if (!encryptedNsec || !userSalt) return;
    const nsecHex = await decryptNsecSimple(encryptedNsec, userSalt);
    pendingNsecHex = nsecHex;
    pendingNpub = npub ?? null;
  },

  // Unlocks the vault (prefer WebAuthn, then PBKDF2). On first-time setup with PBKDF2,
  // derives a key and persists wrapped credentials to IndexedDB. On subsequent unlocks,
  // derives key and validates by decrypting stored data.
  async unlock(options?: { interactive?: boolean }): Promise<boolean> {
    const interactive = options?.interactive ?? true;

    // Already unlocked
    if (deviceKey) return true;

    // Always attempt silent device-key path first (no prompts)
    {
      const record = await loadRecord();
      if (record && (record as any).method === "device") {
        const key = await ensureDeviceKey();
        try {
          await decryptStringAESGCM(
            (record as any).wrappedNsecB64,
            (record as any).wrappedNsecIvB64,
            key
          );
          deviceKey = key;
          return true;
        } catch {
          // fall through
        }
      } else if (!record && pendingNsecHex) {
        const key = await ensureDeviceKey();
        const { ivB64: nsecIvB64, cipherB64: nsecCipherB64 } =
          await encryptStringAESGCM(pendingNsecHex, key);
        let npubFields: { wrappedNpubB64?: string; wrappedNpubIvB64?: string } =
          {};
        if (pendingNpub) {
          const { ivB64: npubIvB64, cipherB64: npubCipherB64 } =
            await encryptStringAESGCM(pendingNpub, key);
          npubFields = {
            wrappedNpubB64: npubCipherB64,
            wrappedNpubIvB64: npubIvB64,
          };
        }
        const rec: VaultRecordDevice = {
          id: RECORD_ID,
          method: "device",
          algo: "AES-GCM",
          wrappedNsecB64: nsecCipherB64,
          wrappedNsecIvB64: nsecIvB64,
          ...npubFields,
          createdAt: Date.now(),
        };
        await saveRecord(rec);
        deviceKey = key;
        pendingNsecHex = null;
        pendingNpub = null;
        return true;
      }
    }

    // If non-interactive, stop here (no prompts)
    if (!interactive) {
      return false;
    }

    // NFC policy gate (per_unlock handled here; per_operation handled by caller flows)
    const needNfc = nfcPolicy === "nfc" || nfcPolicy === "both";
    if (needNfc && nfcAwaiter && nfcCfg.confirmationMode === "per_unlock") {
      const fresh = isNFCAuthFresh();
      if (!fresh) {
        const okNfc = await nfcAwaiter().catch(() => false);
        if (!okNfc) return false;
        nfcCfg.lastAuthAt = Date.now();
        try {
          showToast.success("NFC authentication successful", {
            title: "Physical MFA",
          });
        } catch {
          /* no-op if toast unavailable */
        }
      }
    } else if (
      needNfc &&
      !nfcAwaiter &&
      nfcCfg.confirmationMode === "per_unlock"
    ) {
      // NFC required but no awaiter provided
      return false;
    }

    // 1) Try WebAuthn (preferred) if enabled
    try {
      if (vaultConfig.webauthnEnabled) {
        const ok = await tryWebAuthnUnlock();
        if (ok) return true;
      }
    } catch {
      /* ignore and continue to PBKDF2 */
    }

    // 2) PBKDF2 fallback (only if enabled)
    const record = await loadRecord();
    if (!record && !pendingNsecHex) {
      // Nothing to unlock yet
      return false;
    }

    const passphraseProvider = getPassphraseProvider();
    if (!vaultConfig.passphraseEnabled || !passphraseProvider) {
      // Passphrase path disabled or unavailable → cannot unlock
      return false;
    }
    const pass = await requestPassphrase();
    if (!pass) return false;

    if (record) {
      // Existing vault: derive key using stored salt, then validate
      const salt = b64decode((record as VaultRecordPBKDF2).kdfSaltB64);
      const key = await deriveKeyPBKDF2(pass, salt);
      try {
        // Validate by decrypting nsec
        await decryptStringAESGCM(
          (record as VaultRecordPBKDF2).wrappedNsecB64,
          (record as VaultRecordPBKDF2).wrappedNsecIvB64,
          key
        );
        deviceKey = key;

        return true;
      } catch {
        return false;
      }
    } else {
      // First-time setup: wrap pending credentials and persist
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKeyPBKDF2(pass, salt);

      const nsecHex = pendingNsecHex!; // by construction exists
      const { ivB64: nsecIvB64, cipherB64: nsecCipherB64 } =
        await encryptStringAESGCM(nsecHex, key);

      let npubFields: { wrappedNpubB64?: string; wrappedNpubIvB64?: string } =
        {};
      if (pendingNpub) {
        const { ivB64: npubIvB64, cipherB64: npubCipherB64 } =
          await encryptStringAESGCM(pendingNpub, key);
        npubFields = {
          wrappedNpubB64: npubCipherB64,
          wrappedNpubIvB64: npubIvB64,
        };
      }

      const rec: VaultRecordPBKDF2 = {
        id: RECORD_ID,
        method: "pbkdf2",
        algo: "AES-GCM",
        kdfSaltB64: b64encode(salt),
        wrappedNsecB64: nsecCipherB64,
        wrappedNsecIvB64: nsecIvB64,
        ...npubFields,
        createdAt: Date.now(),
      };
      await saveRecord(rec);

      // Cache in-memory
      deviceKey = key;

      // Clear pending plaintext
      pendingNsecHex = null;
      pendingNpub = null;
      return true;
    }
  },

  // Returns decrypted nsec (hex) if unlocked, else null.
  async getNsecHex(): Promise<string | null> {
    if (pendingNsecHex) return pendingNsecHex;

    if (!deviceKey) return null;
    const record = await loadRecord();
    if (!record) return null;
    try {
      const hex = await decryptStringAESGCM(
        (record as VaultRecordPBKDF2).wrappedNsecB64,
        (record as VaultRecordPBKDF2).wrappedNsecIvB64,
        deviceKey
      );
      return hex;
    } catch {
      return null;
    }
  },

  // Clears stored credentials and in-memory state
  async clear(): Promise<void> {
    await deleteRecord();
    deviceKey = null;
    pendingNsecHex = null;
    pendingNpub = null;
  },
};

export default ClientSessionVault;

export async function getVaultStatus(): Promise<
  "none" | "device" | "pbkdf2" | "webauthn"
> {
  const rec = await loadRecord();
  if (!rec) return "none";
  const method = (rec as any).method as string;
  if (method === "webauthn") return "webauthn";
  if (method === "pbkdf2") return "pbkdf2";
  if (method === "device") return "device";
  return "none";
}

export async function tryWebAuthnOnlyUnlock(): Promise<boolean> {
  try {
    return await tryWebAuthnUnlock();
  } catch {
    return false;
  }
}
