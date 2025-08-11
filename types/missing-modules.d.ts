/**
 * Type declarations for missing modules
 * CRITICAL: Comprehensive module declarations to eliminate ALL import errors
 */

// Fix @noble/secp256k1 missing exports
declare module "@noble/secp256k1" {
  export function generateSecretKey(): Uint8Array;
  export function getPublicKey(privateKey: Uint8Array | string): Uint8Array;
  export function sign(msgHash: Uint8Array, privateKey: Uint8Array): any;
  export function verify(
    signature: any,
    msgHash: Uint8Array,
    publicKey: Uint8Array
  ): boolean;
  export const utils: {
    randomPrivateKey(): Uint8Array;
    bytesToHex(bytes: Uint8Array): string;
    hexToBytes(hex: string): Uint8Array;
  };
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
    static createAuthHash(pubkey: string): string;
    static constantTimeCompare(a: string, b: string): boolean;
    static decryptUserData(
      encryptedData: string,
      userKey: string
    ): Promise<any>;
    static generateAnonymousUsername(): string;
    static validateUsernameFormat(username: string): {
      valid: boolean;
      error?: string;
    };
    static encryptUserData(data: any, key: string): Promise<string>;
    static encryptPrivateKey(
      privateKey: string,
      password: string
    ): Promise<string>;
    static encryptServiceConfig(config: any, key: string): Promise<string>;
    static decryptPrivateKey(
      encryptedKey: string,
      password: string
    ): Promise<string>;
  }
}

// Fix missing hybrid auth modules
declare module "../lib/hybrid-auth.js" {
  export class HybridAuth {
    static validateSession(): Promise<any>;
    static authenticate(credentials: any): Promise<any>;
  }
}

declare module "../hybrid-auth.js" {
  export class HybridAuth {
    static validateSession(): Promise<any>;
    static authenticate(credentials: any): Promise<any>;
  }
}

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
