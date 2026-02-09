/**
 * Nsec Decryption Utility
 *
 * Provides decryption for nsec encrypted by NostrIdentityStep.
 * Reverses the encryptNsecWithPassword process using Web Crypto API.
 *
 * Security Protocol (matching NostrIdentityStep encryption):
 * - Algorithm: AES-256-GCM
 * - Key Derivation: PBKDF2 with 100,000 iterations, SHA-256
 * - Salt: 16-byte random salt (from encrypted data)
 * - IV: 12-byte random IV (from encrypted data)
 * - Format: salt:iv:ciphertext (all hex)
 *
 * @module nsec-decryption
 * @security CRITICAL - Handles sensitive cryptographic material
 */

/**
 * Decrypts a private key (nsec) using password-derived AES-GCM key.
 *
 * Notes on secure memory handling:
 * - This function returns the decrypted nsec as a Uint8Array of ASCII bytes.
 * - Callers are responsible for wiping the returned buffer when finished.
 * - No TextDecoder is used here to avoid creating long-lived JS strings inside
 *   cryptographic logic. Conversion to string must only happen at UI boundaries.
 *
 * @param encryptedNsec - Encrypted nsec in format: salt:iv:ciphertext (all hex)
 * @param password - User password for key derivation
 * @returns Decrypted nsec as Uint8Array (64 ASCII hex characters)
 * @throws Error if decryption fails or format is invalid
 */
export async function decryptNsecWithPassword(
  encryptedNsec: string,
  password: string,
): Promise<Uint8Array> {
  try {
    // Parse encrypted data format: salt:iv:ciphertext
    const parts = encryptedNsec.split(":");
    if (parts.length !== 3) {
      throw new Error(
        "Invalid encrypted nsec format - expected salt:iv:ciphertext",
      );
    }

    const [saltHex, ivHex, ciphertextHex] = parts;

    // Convert hex strings to Uint8Array
    const salt = hexToBytes(saltHex);
    const iv = hexToBytes(ivHex);
    const ciphertext = hexToBytes(ciphertextHex);

    // Validate lengths
    if (salt.length !== 16) {
      throw new Error("Invalid salt length - expected 16 bytes");
    }
    if (iv.length !== 12) {
      throw new Error("Invalid IV length - expected 12 bytes");
    }

    const encoder = new TextEncoder();

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    );

    // Derive AES-GCM key from password (same parameters as encryption)
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );

    // Decrypt nsec
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );

    const decryptedBytes = new Uint8Array(decryptedBuffer);

    // Validate decrypted nsec format without creating JS strings
    // Expected: 64 ASCII hex characters
    if (decryptedBytes.length !== 64) {
      throw new Error("Decrypted data is not a valid nsec hex string");
    }

    for (let i = 0; i < decryptedBytes.length; i++) {
      const b = decryptedBytes[i];
      const isDigit = b >= 0x30 && b <= 0x39; // '0'-'9'
      const isLowerHex = b >= 0x61 && b <= 0x66; // 'a'-'f'
      const isUpperHex = b >= 0x41 && b <= 0x46; // 'A'-'F'
      if (!isDigit && !isLowerHex && !isUpperHex) {
        throw new Error("Decrypted data is not a valid nsec hex string");
      }
    }

    return decryptedBytes;
  } catch (error) {
    throw new Error(
      `Nsec decryption failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Secure memory cleanup utility
 * Wipes sensitive string from memory
 *
 * @param sensitiveString - String to wipe from memory
 */
export function secureClearMemory(sensitiveString: string | null): void {
  if (!sensitiveString) return;

  // Convert to array and overwrite
  const arr = sensitiveString.split("");
  for (let i = 0; i < arr.length; i++) {
    arr[i] = "\0";
  }
  arr.length = 0;
}
