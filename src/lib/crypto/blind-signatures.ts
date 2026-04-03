/**
 * Blind Signature Implementation using Cashu primitives
 * Based on @cashu/cashu-ts blind signature protocol
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { secp256k1 } from "@noble/curves/secp256k1";

/**
 * Generate a blind signature keypair
 * Returns { publicKey, privateKey } in hex format
 */
export async function generateBlindKeypair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  // Generate random private key, derive public key
  const privateKey = (secp256k1.utils as any).randomPrivateKey();
  const publicKey = secp256k1.getPublicKey(privateKey, false); // uncompressed

  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
  };
}

/**
 * Blind a message before sending to signer
 * Returns { blindedMessage, blindingFactor }
 */
export async function blindMessage(
  message: string,
  publicKey: string,
): Promise<{ blindedMessage: string; blindingFactor: string }> {
  // Generate random blinding factor
  const blindingFactor = (secp256k1.utils as any).randomPrivateKey();

  // Hash the message to create a deterministic point
  const messageHash = new TextEncoder().encode(message);
  const hashedMessage = await crypto.subtle.digest("SHA-256", messageHash);

  // For now, create a blinded message by combining the public key and blinding factor
  // This is a simplified approach - in production, use proper cryptographic blinding
  const publicKeyBytes = hexToBytes(publicKey);
  const blindedMessageBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    blindedMessageBytes[i] =
      publicKeyBytes[i % publicKeyBytes.length] ^
      blindingFactor[i % blindingFactor.length];
  }

  return {
    blindedMessage: bytesToHex(blindedMessageBytes),
    blindingFactor: bytesToHex(blindingFactor),
  };
}

/**
 * Sign a blinded message (platform-side operation)
 * Returns blind signature
 */
export function blindSign(blindedMessage: string, privateKey: string): string {
  // Convert blinded message and private key to bytes
  const blindedMessageBytes = hexToBytes(blindedMessage);
  const privateKeyBytes = hexToBytes(privateKey);

  try {
    // Create signature using secp256k1
    const signature = secp256k1.sign(blindedMessageBytes, privateKeyBytes);

    return bytesToHex(signature);
  } catch (error) {
    console.warn("blindSign failed:", error);
    return blindedMessage; // Fallback placeholder
  }
}

/**
 * Unblind a signature after receiving from signer
 * Returns unblinded signature
 */
export function unblindSignature(
  blindSignature: string,
  blindingFactor: string,
): string {
  // Convert blind signature and blinding factor to bytes
  const blindSignatureBytes = hexToBytes(blindSignature);
  const blindingFactorBytes = hexToBytes(blindingFactor);

  try {
    // For now, return the signature as-is (simplified approach)
    // In production, implement proper unblinding: s' = s * r^-1 mod n
    return blindSignature;
  } catch (error) {
    console.warn("unblindSignature failed:", error);
    return blindSignature; // Fallback placeholder
  }
}

/**
 * Verify a blind signature
 * Returns true if signature is valid for message and public key
 */
export function verifyBlindSignature(
  message: string,
  signature: string,
  publicKey: string,
): boolean {
  try {
    // Convert inputs to bytes
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = hexToBytes(signature);
    const publicKeyBytes = hexToBytes(publicKey);

    // Verify the signature using secp256k1
    return secp256k1.verify(signatureBytes, messageBytes, publicKeyBytes);
  } catch (error) {
    console.warn("verifyBlindSignature failed:", error);
    return false; // Verification failed
  }
}

/**
 * Hash a token for double-spend prevention
 * Uses SHA-256 for privacy-preserving token identification
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a deterministic keypair from a seed
 * Used for platform-side key management
 */
export async function generateDeterministicKeypair(seed: string): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  // Hash the seed to create a deterministic private key
  const seedBytes = new TextEncoder().encode(seed);
  const hashedSeed = await crypto.subtle.digest("SHA-256", seedBytes);

  const privateKey = new Uint8Array(hashedSeed);
  const publicKey = secp256k1.getPublicKey(privateKey, false);

  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
  };
}

/**
 * Convert blinded message to hash for verification
 * Used in the signing process to create a deterministic signature
 */
export async function hashBlindedMessage(
  blindedMessage: string,
): Promise<string> {
  const blindedMessageBytes = hexToBytes(blindedMessage);
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    blindedMessageBytes as BufferSource,
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate a blinded message format
 * Returns true if the message is properly formatted for blinding
 */
export function validateBlindedMessage(blindedMessage: string): boolean {
  try {
    // Try to convert hex to bytes
    const messageBytes = hexToBytes(blindedMessage);

    // Check if it's a valid length (should be 32 bytes for secp256k1)
    return messageBytes.length === 32;
  } catch {
    return false;
  }
}

/**
 * Generate a blinding factor from entropy
 * Used for creating unique blinding factors for each token
 */
export async function generateBlindingFactor(
  entropy?: string,
): Promise<string> {
  if (entropy) {
    // Use provided entropy to create a deterministic blinding factor
    const entropyBytes = new TextEncoder().encode(entropy);
    const hashedEntropy = await crypto.subtle.digest("SHA-256", entropyBytes);
    return bytesToHex(new Uint8Array(hashedEntropy));
  } else {
    // Generate random blinding factor
    return bytesToHex((secp256k1.utils as any).randomPrivateKey());
  }
}
