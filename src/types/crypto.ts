/**
 * Cryptographic Types for Satnam.pub
 *
 * Type definitions for cryptographic operations to replace
 * explicit 'any' types and provide better type safety.
 */

// Buffer-like types for crypto operations
export interface CryptoBuffer {
  readonly length: number;
  readonly buffer: ArrayBuffer;
  slice(start?: number, end?: number): CryptoBuffer;
  toString(encoding?: BufferEncoding): string;
}

export type BufferEncoding = "hex" | "base64" | "utf8" | "ascii" | "binary";

// Hash algorithm types
export type HashAlgorithm = "sha256" | "sha512" | "sha1" | "md5";

// Encryption algorithm types
export type EncryptionAlgorithm =
  | "aes-256-gcm"
  | "aes-256-cbc"
  | "chacha20-poly1305";

// Key derivation types
export interface KeyDerivationOptions {
  salt: CryptoBuffer | string;
  iterations: number;
  keyLength: number;
  digest?: HashAlgorithm;
}

// HMAC types
export interface HmacOptions {
  algorithm: HashAlgorithm;
  key: CryptoBuffer | string;
  data: CryptoBuffer | string;
}

// Signature types
export interface SignatureOptions {
  privateKey: CryptoBuffer | string;
  message: CryptoBuffer | string;
  algorithm?: string;
}

export interface VerificationOptions {
  publicKey: CryptoBuffer | string;
  message: CryptoBuffer | string;
  signature: CryptoBuffer | string;
  algorithm?: string;
}

// Nostr-specific crypto types
export interface NostrKeyPair {
  publicKey: string; // hex encoded
  privateKey: string; // hex encoded
  npub?: string; // bech32 encoded public key
  nsec?: string; // bech32 encoded private key
}

export interface NostrSignature {
  signature: string; // hex encoded
  recovery?: number;
}

// Lightning Network crypto types
export interface LightningKeyPair {
  publicKey: CryptoBuffer;
  privateKey: CryptoBuffer;
}

export interface LightningInvoice {
  paymentHash: string;
  paymentRequest: string;
  preimage?: string;
}

// Encryption result types
export interface EncryptionResult {
  encrypted: CryptoBuffer | string;
  iv?: CryptoBuffer | string;
  tag?: CryptoBuffer | string;
  salt?: CryptoBuffer | string;
}

export interface DecryptionOptions {
  encrypted: CryptoBuffer | string;
  key: CryptoBuffer | string;
  iv?: CryptoBuffer | string;
  tag?: CryptoBuffer | string;
  algorithm: EncryptionAlgorithm;
}

// Secure random generation
export interface RandomOptions {
  length: number;
  encoding?: BufferEncoding;
}

// OTP (One-Time Password) types
export interface OtpOptions {
  secret: string;
  counter?: number;
  digits?: number;
  algorithm?: HashAlgorithm;
  window?: number;
}

export interface OtpResult {
  token: string;
  counter?: number;
  timeRemaining?: number;
}

// Session token types
export interface SessionTokenOptions {
  length?: number;
  encoding?: BufferEncoding;
  includeTimestamp?: boolean;
  entropy?: CryptoBuffer | string;
}

export interface SessionToken {
  token: string;
  created: number;
  expires?: number;
}

// Crypto provider interface
export interface CryptoProvider {
  hash(
    data: CryptoBuffer | string,
    algorithm: HashAlgorithm
  ): Promise<CryptoBuffer>;
  hmac(options: HmacOptions): Promise<CryptoBuffer>;
  encrypt(
    data: CryptoBuffer | string,
    key: CryptoBuffer | string,
    algorithm: EncryptionAlgorithm
  ): Promise<EncryptionResult>;
  decrypt(options: DecryptionOptions): Promise<CryptoBuffer | string>;
  generateRandom(options: RandomOptions): Promise<CryptoBuffer | string>;
  deriveKey(
    password: string,
    options: KeyDerivationOptions
  ): Promise<CryptoBuffer>;
}

// Error types
export interface CryptoError extends Error {
  code: string;
  algorithm?: string;
  details?: Record<string, unknown>;
}

// Validation types
export interface CryptoValidationResult {
  valid: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

// Challenge-response types
export interface AuthChallenge {
  challenge: string;
  timestamp: number;
  expires: number;
  algorithm: HashAlgorithm;
}

export interface ChallengeResponse {
  challenge: string;
  response: string;
  signature?: string;
}

// Fedimint-specific crypto types
export interface FedimintNote {
  amount: number;
  noteCommitment: string;
  blindingFactor: string;
}

export interface FedimintSignature {
  guardianSignatures: Record<string, string>;
  threshold: number;
}

// Network message encryption
export interface NetworkMessage {
  type: string;
  payload: unknown;
  timestamp: number;
  nonce?: string;
}

export interface EncryptedNetworkMessage {
  encrypted: string;
  iv: string;
  tag?: string;
  sender?: string;
  recipient?: string;
}
