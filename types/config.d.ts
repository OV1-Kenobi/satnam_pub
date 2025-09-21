// Type declarations for the JavaScript config module (config.js)
// This fixes TS7016 for imports like `import { config } from "../config";`

declare module "../config" {
  export interface SupabaseConfig {
    url: string;
    anonKey: string;
  }

  export interface PubkyConfig {
    homeserverUrl: string;
    pkarrRelays: string[];
    enableMigration: string | boolean;
    sovereigntyTracking: string | boolean;
  }

  export interface PkarrConfig {
    relayTimeout: string | number;
    recordTtl: string | number;
    backupRelays: string | number;
    publishRetries: string | number;
  }

  export interface NostrConfig {
    relays: string[];
    defaultKind: number;
    privateKey: string;
    nostrAuthChallenge: string;
    nostrAuthKind: number;
  }

  export interface LightningConfig {
    defaultNode: string;
    networkTimeout: number;
  }

  export interface PrivacyConfig {
    encryptionAlgorithm: string;
    keyDerivationIterations: number;
  }

  export interface FederationConfig {
    defaultRole: string;
    approvalThreshold: number;
  }

  export interface DevelopmentConfig {
    enableDebugLogs: boolean;
    mockServices: boolean;
  }

  export interface ApiConfig {
    baseUrl: string;
    timeout: number;
  }

  export interface Nip05Config {
    verificationEndpoint: string;
    allowedDomains: string[];
  }

  export interface NFCConfig {
    enabled?: boolean;
    pinTimeoutMs?: number | string;
    confirmationMode?: "per_unlock" | "per_operation" | string;
    defaultProgramUrl: string;
  }

  export interface AppConfig {
    supabase: SupabaseConfig;
    pubky: PubkyConfig;
    pkarr: PkarrConfig;
    nostr: NostrConfig;
    lightning: LightningConfig;
    privacy: PrivacyConfig;
    federation: FederationConfig;
    development: DevelopmentConfig;
    api: ApiConfig;
    nip05: Nip05Config;
    nfc: NFCConfig;
  }

  export const config: AppConfig;
}
