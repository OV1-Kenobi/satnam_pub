/**
 * Type declarations for converted JavaScript API modules
 * MASTER CONTEXT COMPLIANCE: Proper TypeScript declarations for JavaScript APIs
 */

declare module "../api/health.js" {
  export function handler(event: any, context: any): Promise<any>;
}

declare module "../api/test.js" {
  export function handler(event: any, context: any): Promise<any>;
}

declare module "../api/auth/register-identity.js" {
  export function handler(event: any, context: any): Promise<any>;
}

declare module "../api/individual/wallet.js" {
  export function handler(event: any, context: any): Promise<any>;
}

declare module "../api/individual/lightning/wallet.js" {
  export function handler(event: any, context: any): Promise<any>;
}

declare module "../api/family/foundry.js" {
  export function handler(event: any, context: any): Promise<any>;
}

declare module "../api/communications/giftwrapped.js" {
  export function handler(event: any, context: any): Promise<any>;
}

declare module "../api/payments/p2p-lightning.js" {
  export function handler(event: any, context: any): Promise<any>;
}

declare module "../api/payments/ecash-bridge.js" {
  export function handler(event: any, context: any): Promise<any>;
}

declare module "../api/bridge/atomic-swap.js" {
  export function handler(event: any, context: any): Promise<any>;
}

declare module "../api/rewards.js" {
  export function handler(event: any, context: any): Promise<any>;
}

declare module "../lib/secure-storage.js" {
  export class SecureStorage {
    constructor();
    store(key: string, value: any): Promise<void>;
    retrieve(key: string): Promise<any>;
    delete(key: string): Promise<void>;
  }
}

declare module "../secure-storage.js" {
  export class SecureStorage {
    constructor();
    store(key: string, value: any): Promise<void>;
    retrieve(key: string): Promise<any>;
    delete(key: string): Promise<void>;
  }
}

declare module "../lib/crypto/privacy-manager.js" {
  export class PrivacyManager {
    constructor();
    encrypt(data: any): Promise<string>;
    decrypt(encryptedData: string): Promise<any>;
    hash(data: string): Promise<string>;
  }
}

declare module "../crypto/privacy-manager.js" {
  export class PrivacyManager {
    constructor();
    encrypt(data: any): Promise<string>;
    decrypt(encryptedData: string): Promise<any>;
    hash(data: string): Promise<string>;
  }
}

declare module "../lib/crypto/event-signer.js" {
  export class EventSigner {
    constructor();
    sign(event: any, privateKey: string): Promise<any>;
    verify(event: any): Promise<boolean>;
  }
}

declare module "../lib/privacy.js" {
  export interface PrivacyConfig {
    level: "low" | "medium" | "high" | "maximum";
    enableMetadataProtection: boolean;
    enableZeroKnowledge: boolean;
  }

  export function getDefaultPrivacyConfig(): PrivacyConfig;
  export function validatePrivacyLevel(level: string): boolean;
}

declare module "../lib/redis.js" {
  export class RedisClient {
    constructor();
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
  }
}

declare module "../netlify/functions/privacy/encryption.js" {
  export function handler(event: any, context: any): Promise<any>;
}

declare module "../src/lib/api/paymentsClient.js" {
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

declare module "../lib/cross-mint-cashu-manager.js" {
  export interface CrossMintSettings {
    enabled: boolean;
    maxAmount: number;
    feeRate: number;
  }

  export interface MultiNutPayment {
    id: string;
    amount: number;
    status: "pending" | "completed" | "failed";
  }

  export interface NutSwapTransaction {
    id: string;
    fromMint: string;
    toMint: string;
    amount: number;
  }

  export class SatnamCrossMintCashuManager {
    constructor();
    processPayment(payment: MultiNutPayment): Promise<any>;
    swapNuts(transaction: NutSwapTransaction): Promise<any>;
  }
}
