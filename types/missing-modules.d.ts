/**
 * Type declarations for missing modules
 * CRITICAL: Comprehensive module declarations to eliminate ALL import errors
 */

// Fix @noble/curves missing exports
declare module "@noble/curves/secp256k1" {
  export const secp256k1: {
    getPublicKey(
      privateKey: Uint8Array | string,
      compressed?: boolean
    ): Uint8Array;
    sign(msgHash: Uint8Array, privateKey: Uint8Array): any;
    verify(signature: any, msgHash: Uint8Array, publicKey: Uint8Array): boolean;
    utils: {
      randomPrivateKey(): Uint8Array;
    };
  };
}

declare module "@noble/curves/utils" {
  export function bytesToHex(bytes: Uint8Array): string;
  export function hexToBytes(hex: string): Uint8Array;
}

// Fix missing config module
declare module "../config" {
  export const config: {
    supabase: {
      url: string;
      anonKey: string;
    };
    pubky: {
      enableMigration: string | boolean;
      sovereigntyTracking: string | boolean;
    };
    pkarr: {
      relayTimeout: string | number;
      recordTtl: string | number;
      backupRelays: string | number;
      publishRetries: string | number;
    };
    [key: string]: any;
  };
}

// Also support CommonJS/JS import pattern without extension resolution differences
declare module "../config.js" {
  export const config: any;
  export const authConfig: any;
}

// Fix missing security module
declare module "../security.js" {
  export function deriveEncryptionKey(
    password: string,
    salt: Uint8Array
  ): Promise<CryptoKey>;
  export function generateSalt(): Uint8Array;
  export function encryptData(data: string, key: CryptoKey): Promise<string>;
  export function decryptData(
    encryptedData: string,
    key: CryptoKey
  ): Promise<string>;
}

// Fix missing NWC validation module
declare module "../utils/nwc-validation.js" {
  export function sanitizeNWCData(data: any): any;
  export function validateNWCUri(uri: string): boolean;
}

// Fix missing privacy module
declare module "./privacy" {
  export interface PrivacyConfig {
    level: "low" | "medium" | "high" | "maximum";
    enableMetadataProtection: boolean;
    enableZeroKnowledge: boolean;
  }

  export function getDefaultPrivacyConfig(): PrivacyConfig;
  export function validatePrivacyLevel(level: string): boolean;
  export function encryptUserData(data: any, key: string): Promise<string>;
  export function decryptUserData(
    encryptedData: string,
    key: string
  ): Promise<any>;
}

// Fix missing redis module
declare module "./redis" {
  export function connectRedis(): Promise<any>;
  export const redisClient: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
  };
}

// Fix missing crypto modules
declare module "../crypto/privacy-manager.js" {
  export class PrivacyManager {
    // Authentication methods
    static createAuthHash(pubkey: string, salt?: string): Promise<string>;
    static verifyAuthHash(pubkey: string, storedHash: string): Promise<boolean>;
    /** Constant‑time equality over raw bytes. */
    static constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean;
    static createPlatformId(pubkey: string): Promise<string>;

    // Data encryption methods
    static encryptUserData(data: any, userKey: string): Promise<string>;
    static decryptUserData(
      encryptedData: string,
      userKey: string
    ): Promise<any>;

    // Private key methods
    static encryptPrivateKey(
      privateKey: string,
      password: string
    ): Promise<string>;
    static decryptPrivateKey(
      encryptedKey: string,
      password: string
    ): Promise<string>;

    // Service configuration methods
    static encryptServiceConfig(config: any, key: string): Promise<string>;
    static decryptServiceConfig(
      encryptedConfig: string,
      key: string
    ): Promise<any>;

    // Username methods
    static generateAnonymousUsername(): string;
    static generateUsernameOptions(count?: number): string[];
    static validateUsernameFormat(username: string): {
      valid?: boolean;
      isValid: boolean;
      error?: string;
      errors?: string[];
    };
  }
}

// Hybrid auth module declarations removed intentionally

// Fix missing secure storage modules
declare module "../lib/secure-storage.js" {
  export class SecureStorage {
    static generateNewAccountKeyPair(): any;
    static storeEncryptedNsec(nsec: string, password: string): Promise<boolean>;
    static retrieveDecryptedNsec(password: string): Promise<string>;
  }
}

declare module "../secure-storage.js" {
  export class SecureStorage {
    static generateNewAccountKeyPair(): any;
    static storeEncryptedNsec(nsec: string, password: string): Promise<boolean>;
    static retrieveDecryptedNsec(password: string): Promise<string>;
  }
}

// Fix missing event signer module
declare module "./crypto/event-signer" {
  export class EventSigner {
    constructor();
    sign(event: any, privateKey: string): Promise<any>;
    verify(event: any): Promise<boolean>;
  }
}

// Fix missing database module
declare module "./db" {
  export default function createDatabase(): any;
}

// Fix missing types/shared module
declare module "../../types/shared" {
  export interface FamilyMember {
    id: string;
    name?: string;
    username: string;
    lightningAddress?: string;
    role: "offspring" | "adult" | "steward" | "guardian";
    avatar?: string;
    balance?: number;
    nip05Verified?: boolean;
    spendingLimits?: {
      daily?: number;
      weekly?: number;
      monthly?: number;
      requiresApproval?: number;
      setBy?: string;
      lastUpdated?: Date;
    };
  }
}

// Fix crypto factory module
declare module "crypto-factory" {
  export class CryptoFactory {
    generateSecureToken(): string;
    generateSecureToken(length: number): string;
  }
}

// Fix bolt11 module conflicts
declare module "bolt11" {
  export interface PaymentRequestObject {
    paymentRequest?: string;
    complete?: boolean;
    prefix?: string;
    wordsTemp?: string;
    network?: any;
    amount?: number | null;
    timestamp?: number;
    timestampString?: string;
    payeeNodeKey?: string;
    signature?: string;
    recoveryFlag?: number;
    tags?: Array<{
      tagName?: string;
      data?: any;
    }>;
  }

  export function decode(paymentRequest: string): PaymentRequestObject;
  export function encode(data: any): string;
}

// Fix missing paymentsClient module
declare module "../../lib/api/paymentsClient.js" {
  export class ApiError extends Error {
    constructor(message: string, statusCode?: number);
    getUserFriendlyMessage(): string;
  }

  export const paymentsClient: {
    sendPayment(request: any): Promise<any>;
    getBalance(): Promise<any>;
    getTransactionHistory(): Promise<any>;
  };
}

// Fix global supabase reference
declare global {
  const supabase: any;
}

// Node.js crypto module types removed - using Web Crypto API exclusively

// Fix WebSocket types
declare module "ws" {
  export class WebSocketServer {
    constructor(options: any);
    on(event: "connection", callback: (ws: WebSocket, req: any) => void): void;
    on(event: string, callback: Function): void;
    close(): void;
  }

  export class WebSocket {
    constructor(url: string);
    on(event: "message", callback: (data: any) => void): void;
    on(event: "error", callback: (error: any) => void): void;
    on(event: string, callback: Function): void;
    send(data: string): void;
    close(): void;
    readyState: number;
    static OPEN: number;
  }
}
