/**
 * NIP-PNS Key Derivation Module
 *
 * Deterministic key derivation for Private Notes to Self (NIP-PNS).
 * Implements the key derivation chain: nsec → device_key → pns_key → pns_keypair
 *
 * Security:
 * - Uses HKDF-SHA256 for all derivations
 * - Domain separation with distinct info strings
 * - All intermediate key material securely zeroed after use
 * - Browser-compatible (Web Crypto API + @noble ecosystem)
 *
 * @module src/lib/nostr/pns/pns-keys
 */

import { x25519 } from "@noble/curves/ed25519";
import { hkdfExpand, secureZero } from "../../noise/primitives";
import { NoiseProtocolError } from "../../noise/types";

// =============================================================================
// Constants
// =============================================================================

/** HKDF info for device key derivation */
const DEVICE_KEY_INFO = "satnam-pns-device-key-v1";

/** HKDF info for PNS key derivation */
const PNS_KEY_INFO = "satnam-pns-key-v1";

/** HKDF info for PNS keypair derivation */
const PNS_KEYPAIR_INFO = "satnam-pns-keypair-v1";

/** HKDF info for NIP-44 v2 encryption key derivation */
const PNS_NIP44_KEY_INFO = "satnam-pns-nip44-v1";

/** HKDF info for Noise-FS root secret derivation */
const PNS_FS_ROOT_INFO = "satnam-pns-fs-root-v1";

/** Expected nsec length in bytes */
const NSEC_LENGTH = 32;

/** Minimum device salt length in bytes */
const MIN_DEVICE_SALT_LENGTH = 16;

/** Key length for all derived keys */
const KEY_LENGTH = 32;

// =============================================================================
// Input Validation
// =============================================================================

/**
 * Validate nsec input.
 *
 * @param nsec - User's Nostr private key (32 bytes)
 * @throws NoiseProtocolError if nsec is invalid
 */
function validateNsec(nsec: Uint8Array): void {
  if (!(nsec instanceof Uint8Array)) {
    throw new NoiseProtocolError(
      "Invalid nsec: expected Uint8Array",
      "INVALID_KEY"
    );
  }
  if (nsec.length !== NSEC_LENGTH) {
    throw new NoiseProtocolError(
      `Invalid nsec length: expected ${NSEC_LENGTH} bytes, got ${nsec.length}`,
      "INVALID_KEY"
    );
  }
  // Check for all-zeros (invalid key)
  if (nsec.every((b) => b === 0)) {
    throw new NoiseProtocolError(
      "Invalid nsec: key is all zeros",
      "INVALID_KEY"
    );
  }
}

/**
 * Validate device salt input.
 *
 * @param salt - Device-specific salt
 * @throws NoiseProtocolError if salt is invalid
 */
function validateDeviceSalt(salt: Uint8Array): void {
  if (!(salt instanceof Uint8Array)) {
    throw new NoiseProtocolError(
      "Invalid device salt: expected Uint8Array",
      "INVALID_KEY"
    );
  }
  if (salt.length < MIN_DEVICE_SALT_LENGTH) {
    throw new NoiseProtocolError(
      `Device salt too short: minimum ${MIN_DEVICE_SALT_LENGTH} bytes, got ${salt.length}`,
      "INVALID_KEY"
    );
  }
}

// =============================================================================
// Key Derivation Functions
// =============================================================================

/**
 * Derive the intermediate device key from nsec.
 * This is an internal function used in the derivation chain.
 *
 * @param nsec - User's Nostr private key (32 bytes)
 * @returns 32-byte device key
 * @internal
 */
function deriveDeviceKey(nsec: Uint8Array): Uint8Array {
  // Use empty salt for deterministic derivation
  const emptySalt = new Uint8Array(KEY_LENGTH);
  return hkdfExpand(nsec, emptySalt, DEVICE_KEY_INFO, KEY_LENGTH);
}

/**
 * Derive the intermediate PNS key from device key.
 * This is an internal function used in the derivation chain.
 *
 * @param deviceKey - Device key (32 bytes)
 * @returns 32-byte PNS key
 * @internal
 */
function derivePnsKey(deviceKey: Uint8Array): Uint8Array {
  const emptySalt = new Uint8Array(KEY_LENGTH);
  return hkdfExpand(deviceKey, emptySalt, PNS_KEY_INFO, KEY_LENGTH);
}

/**
 * Derive the deterministic PNS keypair from user's nsec.
 *
 * Follows the derivation chain: nsec → device_key → pns_key → pns_keypair
 *
 * The derived keypair is used for:
 * - Signing PNS events (kind 1080)
 * - Encrypting PNS content with NIP-44
 *
 * @param nsec - User's Nostr private key (32 bytes, Uint8Array)
 * @returns Promise resolving to { publicKey, privateKey } each 32 bytes
 * @throws NoiseProtocolError if nsec is invalid or derivation fails
 *
 * @example
 * ```typescript
 * const nsec = hexToBytes(userNsecHex);
 * const { publicKey, privateKey } = await derivePnsKeypair(nsec);
 * ```
 */
export async function derivePnsKeypair(
  nsec: Uint8Array
): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
  validateNsec(nsec);

  let deviceKey: Uint8Array | null = null;
  let pnsKey: Uint8Array | null = null;

  try {
    // Step 1: nsec → device_key
    deviceKey = deriveDeviceKey(nsec);

    // Step 2: device_key → pns_key
    pnsKey = derivePnsKey(deviceKey);

    // Step 3: pns_key → pns_keypair private key
    const emptySalt = new Uint8Array(KEY_LENGTH);
    const privateKey = hkdfExpand(
      pnsKey,
      emptySalt,
      PNS_KEYPAIR_INFO,
      KEY_LENGTH
    );

    // Step 4: Derive X25519 public key from private key
    const publicKey = x25519.getPublicKey(privateKey);

    return {
      publicKey: new Uint8Array(publicKey),
      privateKey: new Uint8Array(privateKey),
    };
  } catch (error) {
    if (error instanceof NoiseProtocolError) {
      throw error;
    }
    throw new NoiseProtocolError(
      "Failed to derive PNS keypair",
      "KEY_DERIVATION_FAILED",
      error instanceof Error ? error : undefined
    );
  } finally {
    // Securely zero intermediate key material
    if (deviceKey) secureZero(deviceKey);
    if (pnsKey) secureZero(pnsKey);
  }
}

/**
 * Derive the NIP-44 v2 encryption key for outer envelope encryption.
 *
 * This key is used for the outer NIP-44 layer that wraps PNS events.
 * It's derived deterministically from the nsec.
 *
 * @param nsec - User's Nostr private key (32 bytes, Uint8Array)
 * @returns Promise resolving to 32-byte NIP-44 key
 * @throws NoiseProtocolError if nsec is invalid or derivation fails
 *
 * @example
 * ```typescript
 * const nip44Key = await derivePnsNip44Key(nsec);
 * // Use for NIP-44 v2 encryption of PNS events
 * ```
 */
export async function derivePnsNip44Key(nsec: Uint8Array): Promise<Uint8Array> {
  validateNsec(nsec);

  let deviceKey: Uint8Array | null = null;
  let pnsKey: Uint8Array | null = null;

  try {
    // Follow the same chain: nsec → device_key → pns_key
    deviceKey = deriveDeviceKey(nsec);
    pnsKey = derivePnsKey(deviceKey);

    // Derive NIP-44 key from pns_key with distinct info
    const emptySalt = new Uint8Array(KEY_LENGTH);
    return hkdfExpand(pnsKey, emptySalt, PNS_NIP44_KEY_INFO, KEY_LENGTH);
  } catch (error) {
    if (error instanceof NoiseProtocolError) {
      throw error;
    }
    throw new NoiseProtocolError(
      "Failed to derive PNS NIP-44 key",
      "KEY_DERIVATION_FAILED",
      error instanceof Error ? error : undefined
    );
  } finally {
    if (deviceKey) secureZero(deviceKey);
    if (pnsKey) secureZero(pnsKey);
  }
}

/**
 * Derive the pns_fs_root secret for Noise-FS forward secrecy.
 *
 * The pns_fs_root is the master secret for the Noise-FS ratcheting chain.
 * It's stored in ClientSessionVault and used to derive per-note encryption keys.
 *
 * For multi-device scenarios, an optional device-specific salt can be provided
 * to derive unique secrets per device while maintaining a common root.
 *
 * @param nsec - User's Nostr private key (32 bytes, Uint8Array)
 * @param deviceSalt - Optional device-specific salt (minimum 16 bytes)
 * @returns Promise resolving to 32-byte pns_fs_root secret
 * @throws NoiseProtocolError if inputs are invalid or derivation fails
 *
 * @example
 * ```typescript
 * // Local-only mode (single device)
 * const fsRoot = await derivePnsFsRoot(nsec);
 *
 * // Multi-device mode with device salt
 * const deviceSalt = crypto.getRandomValues(new Uint8Array(32));
 * const fsRoot = await derivePnsFsRoot(nsec, deviceSalt);
 * ```
 */
export async function derivePnsFsRoot(
  nsec: Uint8Array,
  deviceSalt?: Uint8Array
): Promise<Uint8Array> {
  validateNsec(nsec);
  if (deviceSalt) {
    validateDeviceSalt(deviceSalt);
  }

  let deviceKey: Uint8Array | null = null;
  let pnsKey: Uint8Array | null = null;

  try {
    // Follow the chain: nsec → device_key → pns_key
    deviceKey = deriveDeviceKey(nsec);
    pnsKey = derivePnsKey(deviceKey);

    // Use device salt if provided, otherwise empty salt
    const salt = deviceSalt ?? new Uint8Array(KEY_LENGTH);
    return hkdfExpand(pnsKey, salt, PNS_FS_ROOT_INFO, KEY_LENGTH);
  } catch (error) {
    if (error instanceof NoiseProtocolError) {
      throw error;
    }
    throw new NoiseProtocolError(
      "Failed to derive PNS FS root",
      "KEY_DERIVATION_FAILED",
      error instanceof Error ? error : undefined
    );
  } finally {
    if (deviceKey) secureZero(deviceKey);
    if (pnsKey) secureZero(pnsKey);
  }
}

/**
 * Validate that derived keys are cryptographically valid.
 *
 * Performs the following checks:
 * - Both keys are 32 bytes
 * - Neither key is all zeros
 * - Public key can be derived from private key (X25519 consistency)
 *
 * @param keypair - The keypair to validate { publicKey, privateKey }
 * @returns true if keypair is valid, false otherwise
 *
 * @example
 * ```typescript
 * const keypair = await derivePnsKeypair(nsec);
 * if (!validatePnsKeys(keypair)) {
 *   throw new Error("Key derivation produced invalid keypair");
 * }
 * ```
 */
export function validatePnsKeys(keypair: {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}): boolean {
  const { publicKey, privateKey } = keypair;

  // Check types
  if (
    !(publicKey instanceof Uint8Array) ||
    !(privateKey instanceof Uint8Array)
  ) {
    return false;
  }

  // Check lengths
  if (publicKey.length !== KEY_LENGTH || privateKey.length !== KEY_LENGTH) {
    return false;
  }

  // Check for all-zeros
  if (publicKey.every((b) => b === 0) || privateKey.every((b) => b === 0)) {
    return false;
  }

  // Verify X25519 consistency: derive public from private and compare
  try {
    const derivedPublic = x25519.getPublicKey(privateKey);
    if (derivedPublic.length !== publicKey.length) {
      return false;
    }
    for (let i = 0; i < publicKey.length; i++) {
      if (derivedPublic[i] !== publicKey[i]) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
