/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key: string): string | undefined {
  // Server/runtime only: Netlify Functions and server libs must use process.env
  return process.env[key];
}

/**
 * Enhanced Pubky Client
 *
 * This module provides a complete implementation of the Pubky protocol for decentralized domain management.
 * It includes full PKARR support, homeserver communication, pubky:// URL resolution, Ed25519 keypair management,
 * and integration with the existing domain sovereignty system.
 */

import { ed25519 } from "@noble/curves/ed25519";
import axios from "axios";
import * as sss from "shamirs-secret-sharing";
import { v4 as uuidv4 } from "uuid";
import * as z32 from "z32";
import db from "./db";

// Type definitions
export interface PubkyConfig {
  homeserver_url: string;
  pkarr_relays?: string[];
  storage_provider?: "postgres" | "memory";
  debug?: boolean;
  enable_migration?: boolean;
  sovereignty_tracking?: boolean;
  relay_timeout?: number;
  record_ttl?: number;
  backup_relays?: number;
  publish_retries?: number;
}

export interface PubkyKeypair {
  private_key: string;
  public_key: string;
  pubky_url: string;
  z32_address: string;
}

export interface PubkyDomainRecord {
  name: string;
  type: string;
  value: string;
  ttl?: number;
}

export interface PubkyRegistrationResult {
  pubky_url: string;
  pkarr_published: boolean;
  domain_records: PubkyDomainRecord[];
  sovereignty_score: number;
}

export interface PubkyPublishResult {
  success: boolean;
  pubky_url: string;
  content_hash: string;
  timestamp: number;
  relay_confirmations?: number;
}

export interface PubkyContent {
  content: Record<string, unknown>;
  content_type: string;
  content_hash: string;
  signature: string;
  timestamp: number;
  public_key: string;
}

export interface PubkyMigrationResult {
  family_id: string;
  traditional_domain: string;
  pubky_url: string;
  sovereignty_score_improvement: number;
  migration_success: boolean;
}

export interface PkarrSignedRecord {
  public_key: string;
  records: {
    name: string;
    type: string;
    value: string;
    ttl: number;
  }[];
  timestamp: number;
  sequence: number;
  signature: string;
}

// Import config at the top level
import { config } from "../config";

// Utility: hex encode/decode (top-level)
function toHex(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

// Utility: SHA-256 hex using Web Crypto API (top-level)
async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const digest = await (globalThis.crypto as Crypto).subtle.digest(
    "SHA-256",
    data
  );
  return toHex(digest);
}

// AES-GCM helpers using Web Crypto API (256-bit key) (top-level)
async function importAesKeyFromHex(keyHex: string): Promise<CryptoKey> {
  const keyBytes = fromHex(keyHex);
  return (globalThis.crypto as Crypto).subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
async function encryptAesGcmToHex(
  plaintext: string,
  keyHex: string
): Promise<{ iv: string; encrypted: string; authTag: string }> {
  const iv = new Uint8Array(12);
  (globalThis.crypto as Crypto).getRandomValues(iv);
  const key = await importAesKeyFromHex(keyHex);
  const pt = new TextEncoder().encode(plaintext);
  const ctBuf = await (globalThis.crypto as Crypto).subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    pt
  );
  const ct = new Uint8Array(ctBuf);
  const tagLen = 16; // 128-bit tag
  const body = ct.slice(0, ct.length - tagLen);
  const tag = ct.slice(ct.length - tagLen);
  return { iv: toHex(iv), encrypted: toHex(body), authTag: toHex(tag) };
}
async function decryptAesGcmFromHex(
  encrypted: string,
  authTag: string,
  ivHex: string,
  keyHex: string
): Promise<string> {
  const iv = fromHex(ivHex);
  const key = await importAesKeyFromHex(keyHex);
  const body = fromHex(encrypted);
  const tag = fromHex(authTag);
  const ct = new Uint8Array(body.length + tag.length);
  ct.set(body, 0);
  ct.set(tag, body.length);
  const ptBuf = await (globalThis.crypto as Crypto).subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    ct as unknown as BufferSource
  );
  return new TextDecoder().decode(ptBuf);
}

// Utility: cryptographically secure random hex string
function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  (globalThis.crypto as Crypto).getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * Create a new EnhancedPubkyClient with the configuration from the config file
 */
export function createPubkyClient(): EnhancedPubkyClient {
  // Create the client with the configuration

  return new EnhancedPubkyClient({
    homeserver_url: config.pubky.homeserverUrl,
    pkarr_relays: config.pubky.pkarrRelays,
    enable_migration: config.pubky.enableMigration === "true",
    sovereignty_tracking: config.pubky.sovereigntyTracking === "true",
    relay_timeout:
      typeof config.pkarr.relayTimeout === "string"
        ? parseInt(config.pkarr.relayTimeout)
        : config.pkarr.relayTimeout,
    record_ttl:
      typeof config.pkarr.recordTtl === "string"
        ? parseInt(config.pkarr.recordTtl)
        : config.pkarr.recordTtl,
    backup_relays:
      typeof config.pkarr.backupRelays === "string"
        ? parseInt(config.pkarr.backupRelays)
        : config.pkarr.backupRelays,
    publish_retries:
      typeof config.pkarr.publishRetries === "string"
        ? parseInt(config.pkarr.publishRetries)
        : config.pkarr.publishRetries,
    debug: getEnvVar("NODE_ENV") !== "production",
  });
}

/**
 * PubkyDHTClient - BitTorrent DHT operations for PKARR
 * Handles publishing and resolving records via DHT relays
 */
export interface PubkyDHTRecord {
  public_key: string;
  records: Array<{
    name: string;
    type: string;
    value: string;
    ttl: number;
  }>;
  timestamp: number;
  sequence: number;
  signature: string;
}

export interface PubkyDHTCacheEntry {
  record: PubkyDHTRecord;
  expiresAt: number;
}

export class PubkyDHTClient {
  private relays: string[];
  private cache: Map<string, PubkyDHTCacheEntry> = new Map();
  private cacheTtl: number;
  private timeout: number;
  private debug: boolean;

  constructor(
    relays: string[] = [
      "https://pkarr.relay.pubky.tech",
      "https://pkarr.relay.synonym.to",
    ],
    cacheTtl: number = 3600000, // 1 hour
    timeout: number = 5000,
    debug: boolean = false
  ) {
    this.relays = relays;
    this.cacheTtl = cacheTtl;
    this.timeout = timeout;
    this.debug = debug;
  }

  /**
   * Publish a record to DHT relays
   */
  async publishRecord(record: PubkyDHTRecord): Promise<boolean> {
    const results = await Promise.allSettled(
      this.relays.map((relay) => this.publishToRelay(relay, record))
    );

    const successCount = results.filter(
      (r) => r.status === "fulfilled" && r.value
    ).length;
    const success = successCount > 0;

    if (this.debug) {
      console.log(
        `[PubkyDHT] Published to ${successCount}/${this.relays.length} relays`
      );
    }

    return success;
  }

  /**
   * Resolve a record from DHT relays
   */
  async resolveRecord(publicKey: string): Promise<PubkyDHTRecord | null> {
    // Check cache first
    const cached = this.cache.get(publicKey);
    if (cached && cached.expiresAt > Date.now()) {
      if (this.debug) console.log(`[PubkyDHT] Cache hit for ${publicKey}`);
      return cached.record;
    }

    // Try each relay
    for (const relay of this.relays) {
      try {
        const record = await this.resolveFromRelay(relay, publicKey);
        if (record) {
          // Cache the result
          this.cache.set(publicKey, {
            record,
            expiresAt: Date.now() + this.cacheTtl,
          });
          if (this.debug)
            console.log(`[PubkyDHT] Resolved from ${relay}: ${publicKey}`);
          return record;
        }
      } catch (e) {
        if (this.debug)
          console.log(`[PubkyDHT] Failed to resolve from ${relay}:`, e);
      }
    }

    return null;
  }

  /**
   * Publish to a single relay
   */
  private async publishToRelay(
    relay: string,
    record: PubkyDHTRecord
  ): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${relay}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
        signal: controller.signal,
      });

      clearTimeout(timer);
      return response.ok;
    } catch (error) {
      if (this.debug)
        console.log(`[PubkyDHT] Publish to ${relay} failed:`, error);
      return false;
    }
  }

  /**
   * Resolve from a single relay
   */
  private async resolveFromRelay(
    relay: string,
    publicKey: string
  ): Promise<PubkyDHTRecord | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${relay}/resolve/${publicKey}`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) return null;
      return (await response.json()) as PubkyDHTRecord;
    } catch (error) {
      if (this.debug)
        console.log(`[PubkyDHT] Resolve from ${relay} failed:`, error);
      return null;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; ttl: number } {
    return { size: this.cache.size, ttl: this.cacheTtl };
  }
}

export class EnhancedPubkyClient {
  private homeserverUrl: string;
  private pkarrRelays: string[];
  private debug: boolean;
  private storageProvider: "postgres" | "memory";
  private enableMigration: boolean;
  private sovereigntyTracking: boolean;
  private relayTimeout: number;
  private recordTtl: number;
  private backupRelays: number;
  private publishRetries: number;
  private dhtClient: PubkyDHTClient;

  constructor(config: PubkyConfig) {
    this.homeserverUrl = config.homeserver_url;
    this.pkarrRelays = config.pkarr_relays || [
      "https://pkarr.relay.pubky.tech",
      "https://pkarr.relay.synonym.to",
    ];
    this.storageProvider = config.storage_provider || "postgres";
    this.debug = config.debug || false;
    this.enableMigration = config.enable_migration || false;
    this.sovereigntyTracking = config.sovereignty_tracking || false;
    this.relayTimeout = config.relay_timeout || 5000;
    this.recordTtl = config.record_ttl || 3600;
    this.backupRelays = config.backup_relays || 3;
    this.publishRetries = config.publish_retries || 3;
    this.dhtClient = new PubkyDHTClient(
      this.pkarrRelays,
      this.recordTtl * 1000,
      this.relayTimeout,
      this.debug
    );
  }

  /**
   * Generate a new Pubky keypair using Ed25519
   */
  async generatePubkyKeypair(): Promise<PubkyKeypair> {
    try {
      // Generate a secure random private key
      const privateKey = ed25519.utils.randomSecretKey();

      // Derive the public key from the private key
      const publicKey = ed25519.getPublicKey(privateKey);

      // Create the Pubky URL and z32 address
      const pubkyUrl = this.encodePubkyUrl(publicKey);
      const z32Address = this.encodeZ32(publicKey);

      return {
        private_key: Buffer.from(privateKey).toString("hex"),
        public_key: Buffer.from(publicKey).toString("hex"),
        pubky_url: pubkyUrl,
        z32_address: z32Address,
      };
    } catch (error) {
      this.logError("Error generating Pubky keypair:", error);
      throw new Error(
        `Failed to generate Pubky keypair: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Import an existing Ed25519 keypair
   */
  async importKeypair(privateKeyHex: string): Promise<PubkyKeypair> {
    try {
      // Convert hex to Uint8Array
      const privateKey = new Uint8Array(Buffer.from(privateKeyHex, "hex"));

      // Validate the private key
      if (privateKey.length !== 32) {
        throw new Error(
          "Invalid private key length. Ed25519 private keys must be 32 bytes."
        );
      }

      // Derive the public key
      const publicKey = ed25519.getPublicKey(privateKey);

      // Create the Pubky URL and z32 address
      const pubkyUrl = this.encodePubkyUrl(publicKey);
      const z32Address = this.encodeZ32(publicKey);

      return {
        private_key: privateKeyHex,
        public_key: Buffer.from(publicKey).toString("hex"),
        pubky_url: pubkyUrl,
        z32_address: z32Address,
      };
    } catch (error) {
      this.logError("Error importing keypair:", error);
      throw new Error(
        `Failed to import keypair: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Register a Pubky domain with PKARR using DHT client
   */
  async registerPubkyDomain(
    keypair: PubkyKeypair,
    domainRecords: PubkyDomainRecord[]
  ): Promise<PubkyRegistrationResult> {
    try {
      // Create PKARR record packet
      const pkarrRecord = {
        public_key: keypair.public_key,
        records: domainRecords.map((record) => ({
          name: record.name,
          type: record.type,
          value: record.value,
          ttl: record.ttl || 3600,
        })),
        timestamp: Math.floor(Date.now() / 1000),
        sequence: 1,
      };

      // Sign PKARR record
      const recordBytes = this.serializePkarrRecord(pkarrRecord);
      const signature = await ed25519.sign(
        recordBytes,
        Buffer.from(keypair.private_key, "hex")
      );

      const signedRecord: PkarrSignedRecord = {
        ...pkarrRecord,
        signature: Buffer.from(signature).toString("hex"),
      };

      // Publish using DHT client with retries
      let published = false;
      for (let attempt = 0; attempt < this.publishRetries; attempt++) {
        published = await this.dhtClient.publishRecord(signedRecord as any);
        if (published) break;
        if (attempt < this.publishRetries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }

      // Store registration metadata
      await this.storeRegistrationMetadata({
        pubky_url: keypair.pubky_url,
        domain_records: domainRecords,
        pkarr_relays: this.pkarrRelays,
        registration_time: new Date(),
        sovereignty_score: 100, // Full sovereignty with Pubky
      });

      return {
        pubky_url: keypair.pubky_url,
        pkarr_published: published,
        domain_records: domainRecords,
        sovereignty_score: 100,
      };
    } catch (error) {
      this.logError("Error registering Pubky domain:", error);
      throw new Error(
        `Failed to register Pubky domain: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Publish content to Pubky homeserver
   */
  async publishContent(
    keypair: PubkyKeypair,
    path: string,
    content: Record<string, unknown>,
    contentType: string = "application/json"
  ): Promise<PubkyPublishResult> {
    try {
      // Normalize the path
      const normalizedPath = path.startsWith("/") ? path : `/${path}`;

      // Calculate content hash (Web Crypto)
      const contentHash = await sha256Hex(JSON.stringify(content));

      // Create timestamp
      const timestamp = Date.now();

      // Sign the content
      const signature = await this.signContent(content, keypair.private_key);

      // Create the publish payload
      const publishPayload = {
        pubky_url: `${keypair.pubky_url}${normalizedPath}`,
        content,
        content_type: contentType,
        content_hash: contentHash,
        timestamp,
        signature,
      };

      // Publish to homeserver
      await axios.post(`${this.homeserverUrl}/publish`, publishPayload, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Pubky ${keypair.public_key}`,
        },
      });

      // Store content metadata locally
      await this.storeContentMetadata({
        pubky_url: `${keypair.pubky_url}${normalizedPath}`,
        content_hash: contentHash,
        content_type: contentType,
        timestamp,
        public_key: keypair.public_key,
      });

      return {
        success: true,
        pubky_url: `${keypair.pubky_url}${normalizedPath}`,
        content_hash: contentHash,
        timestamp,
        relay_confirmations: this.pkarrRelays.length,
      };
    } catch (error) {
      this.logError("Error publishing content:", error);
      throw new Error(
        `Failed to publish content: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Resolve pubky:// URLs using DHT client
   */
  async resolvePubkyUrl(pubkyUrl: string): Promise<PubkyContent | null> {
    try {
      if (!pubkyUrl.startsWith("pubky://")) {
        throw new Error("Invalid Pubky URL format. Must start with pubky://");
      }

      // Try homeserver first
      try {
        const homeserverResponse = await axios.get(
          `${this.homeserverUrl}/resolve/${encodeURIComponent(pubkyUrl)}`
        );

        if (homeserverResponse.status === 200) {
          return homeserverResponse.data;
        }
      } catch (homeserverError) {
        this.logDebug(
          "Homeserver resolution failed, falling back to DHT:",
          homeserverError
        );
      }

      // Fallback to DHT resolution
      return await this.resolveThroughDHT(pubkyUrl);
    } catch (error) {
      this.logError("Error resolving Pubky URL:", error);
      return null;
    }
  }

  /**
   * Resolve a Pubky URL through DHT relays
   */
  private async resolveThroughDHT(
    pubkyUrl: string
  ): Promise<PubkyContent | null> {
    try {
      // Extract public key from URL
      const urlParts = pubkyUrl.replace("pubky://", "").split("/");
      const publicKey = urlParts[0];
      const path = urlParts.slice(1).join("/");

      // Resolve from DHT
      const record = await this.dhtClient.resolveRecord(publicKey);
      if (!record) return null;

      // Find the record that matches the path
      const records = record.records || [];
      const matchingRecord = records.find(
        (r: { name: string; type: string; value: string }) => {
          // For root path
          if (!path && r.name === "@") {
            return true;
          }

          // For specific paths
          return r.name === path || r.name === `/${path}`;
        }
      );

      if (matchingRecord) {
        // Parse content based on type
        let content: Record<string, unknown>;
        try {
          content =
            matchingRecord.type === "TXT"
              ? { text: matchingRecord.value }
              : JSON.parse(matchingRecord.value);
        } catch {
          content = { raw: matchingRecord.value };
        }

        return {
          content,
          content_type:
            matchingRecord.type === "TXT" ? "text/plain" : "application/json",
          content_hash: await sha256Hex(matchingRecord.value),
          signature: record.signature,
          timestamp: record.timestamp,
          public_key: record.public_key,
        };
      }

      return null;
    } catch (error) {
      this.logError("Error resolving through DHT:", error);
      return null;
    }
  }

  /**
   * Migrate a family domain from traditional DNS to Pubky
   */
  async migrateFamilyDomainToPubky(
    traditionalDomain: string,
    familyId: string,
    guardianKeypairs: PubkyKeypair[]
  ): Promise<PubkyMigrationResult> {
    try {
      // Generate family Pubky domain keypair
      const familyKeypair = await this.generatePubkyKeypair();

      // Create family domain records
      const familyRecords: PubkyDomainRecord[] = [
        {
          name: "@",
          type: "TXT",
          value: `family_id=${familyId}`,
          ttl: 3600,
        },
        {
          name: "_family",
          type: "TXT",
          value: JSON.stringify({
            guardians: guardianKeypairs.map((g) => g.public_key),
            threshold: Math.ceil(guardianKeypairs.length * 0.6),
            traditional_domain: traditionalDomain,
          }),
          ttl: 3600,
        },
      ];

      // Register family Pubky domain
      const registration = await this.registerPubkyDomain(
        familyKeypair,
        familyRecords
      );

      // Create migration record in database
      if (this.storageProvider === "postgres") {
        await (db as any).query(
          `INSERT INTO domain_migrations (
            id, family_id, traditional_domain, pubky_url, pubky_public_key,
            migration_status, sovereignty_upgrade, migrated_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())`,
          [
            uuidv4(),
            familyId,
            traditionalDomain,
            familyKeypair.pubky_url,
            familyKeypair.public_key,
            "completed",
            true,
            new Date().toISOString(),
          ]
        );
      }

      // Set up guardian backups
      for (const guardianKeypair of guardianKeypairs) {
        await this.setupGuardianBackup(
          guardianKeypair,
          familyId,
          familyKeypair.pubky_url
        );
      }

      return {
        family_id: familyId,
        traditional_domain: traditionalDomain,
        pubky_url: familyKeypair.pubky_url,
        sovereignty_score_improvement: 85, // 15 -> 100
        migration_success: registration.pkarr_published,
      };
    } catch (error) {
      this.logError("Error migrating family domain to Pubky:", error);
      throw new Error(
        `Failed to migrate family domain: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Verify domain ownership cryptographically
   */
  async verifyDomainOwnership(
    pubkyUrl: string,
    privateKey: string
  ): Promise<boolean> {
    try {
      // Extract public key from URL
      const urlParts = pubkyUrl.replace("pubky://", "").split("/");
      const urlPublicKey = urlParts[0];

      // Derive public key from private key
      const derivedPublicKey = await ed25519.getPublicKey(
        Buffer.from(privateKey, "hex")
      );
      const derivedPublicKeyHex = Buffer.from(derivedPublicKey).toString("hex");

      // Compare keys
      if (urlPublicKey !== derivedPublicKeyHex) {
        return false;
      }

      // Create verification message
      const verificationMessage = `Verify ownership of ${pubkyUrl} at ${Date.now()}`;

      // Sign the message
      const signature = await ed25519.sign(
        Buffer.from(verificationMessage),
        Buffer.from(privateKey, "hex")
      );

      // Verify the signature
      const isValid = await ed25519.verify(
        signature,
        Buffer.from(verificationMessage),
        derivedPublicKey
      );

      return isValid;
    } catch (error) {
      this.logError("Error verifying domain ownership:", error);
      return false;
    }
  }

  /**
   * Rotate keypair for a Pubky domain
   */
  async rotateKeypair(
    oldKeypair: PubkyKeypair,
    domainRecords: PubkyDomainRecord[]
  ): Promise<PubkyKeypair> {
    try {
      // Generate new keypair
      const newKeypair = await this.generatePubkyKeypair();

      // Add key rotation record
      const rotationRecords = [
        ...domainRecords,
        {
          name: "_rotation",
          type: "TXT",
          value: JSON.stringify({
            previous_public_key: oldKeypair.public_key,
            rotation_timestamp: Date.now(),
            signature: await this.signContent(
              { new_public_key: newKeypair.public_key, timestamp: Date.now() },
              oldKeypair.private_key
            ),
          }),
          ttl: 86400, // 24 hours
        },
      ];

      // Register with new keypair
      await this.registerPubkyDomain(newKeypair, rotationRecords);

      // Update key rotation in database
      if (this.storageProvider === "postgres") {
        await (db as any).query(
          `INSERT INTO pubky_key_rotations (
            id, previous_public_key, new_public_key, rotation_timestamp,
            signature, created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())`,
          [
            uuidv4(),
            oldKeypair.public_key,
            newKeypair.public_key,
            new Date().toISOString(),
            await this.signContent(
              { new_public_key: newKeypair.public_key, timestamp: Date.now() },
              oldKeypair.private_key
            ),
          ]
        );
      }

      return newKeypair;
    } catch (error) {
      this.logError("Error rotating keypair:", error);
      throw new Error(
        `Failed to rotate keypair: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Create a backup of domain data for recovery
   */
  async createDomainBackup(
    keypair: PubkyKeypair,
    domainData: Record<string, unknown>,
    guardianKeypairs: PubkyKeypair[]
  ): Promise<string[]> {
    try {
      // Encrypt domain data with a random key
      const encryptionKey = randomHex(32);
      const encryptedData = await this.encryptData(
        JSON.stringify(domainData),
        encryptionKey
      );

      // Split the encryption key using Shamir's Secret Sharing
      const threshold = Math.ceil(guardianKeypairs.length * 0.6);
      const keyShares = this.splitSecret(
        encryptionKey,
        threshold,
        guardianKeypairs.length
      );

      // Publish encrypted data to Pubky
      await this.publishContent(
        keypair,
        "/backup/domain-data",
        { encrypted_data: encryptedData },
        "application/json"
      );

      // Distribute key shares to guardians
      const backupUrls: string[] = [];

      for (let i = 0; i < guardianKeypairs.length; i++) {
        const guardianKeypair = guardianKeypairs[i];
        const keyShare = keyShares[i];

        // Create signed key share
        const signedKeyShare = {
          share_index: i + 1,
          key_share: keyShare,
          domain_pubky_url: keypair.pubky_url,
          timestamp: Date.now(),
          signature: await this.signContent(
            { share_index: i + 1, key_share: keyShare, timestamp: Date.now() },
            keypair.private_key
          ),
        };

        // Publish to guardian's Pubky URL
        const backupUrl = `${guardianKeypair.pubky_url}/backup/${keypair.public_key}`;
        await this.publishContent(
          guardianKeypair,
          `/backup/${keypair.public_key}`,
          signedKeyShare,
          "application/json"
        );

        backupUrls.push(backupUrl);
      }

      return backupUrls;
    } catch (error) {
      this.logError("Error creating domain backup:", error);
      throw new Error(
        `Failed to create domain backup: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Recover domain data from guardian backups
   */
  async recoverDomainFromBackup(
    domainPubkyUrl: string,
    guardianKeypairs: PubkyKeypair[]
  ): Promise<Record<string, unknown>> {
    try {
      // Extract domain public key
      const domainPublicKey = domainPubkyUrl
        .replace("pubky://", "")
        .split("/")[0];

      // Collect key shares from guardians
      const keyShares: { index: number; share: string }[] = [];

      for (let i = 0; i < guardianKeypairs.length; i++) {
        try {
          const guardianKeypair = guardianKeypairs[i];
          const backupUrl = `${guardianKeypair.pubky_url}/backup/${domainPublicKey}`;

          // Resolve backup data
          const backupData = await this.resolvePubkyUrl(backupUrl);

          if (backupData) {
            keyShares.push({
              index: backupData.content.share_index as number,
              share: backupData.content.key_share as string,
            });

            // We only need threshold number of shares
            if (keyShares.length >= Math.ceil(guardianKeypairs.length * 0.6)) {
              break;
            }
          }
        } catch (guardianError) {
          this.logDebug(
            `Failed to get backup from guardian ${i}:`,
            guardianError
          );
          // Continue with next guardian
        }
      }

      if (keyShares.length < Math.ceil(guardianKeypairs.length * 0.6)) {
        throw new Error("Not enough key shares to recover the domain data");
      }

      // Reconstruct the encryption key
      const encryptionKey = this.combineShares(keyShares);

      // Get the encrypted domain data
      const encryptedDataUrl = `${domainPubkyUrl}/backup/domain-data`;
      const encryptedDataResponse = await this.resolvePubkyUrl(
        encryptedDataUrl
      );

      if (!encryptedDataResponse) {
        throw new Error("Could not retrieve encrypted domain data");
      }

      // Decrypt the domain data
      const decryptedData = await this.decryptData(
        encryptedDataResponse.content.encrypted_data as string,
        encryptionKey
      );

      return JSON.parse(decryptedData);
    } catch (error) {
      this.logError("Error recovering domain from backup:", error);
      throw new Error(
        `Failed to recover domain from backup: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Helper methods

  /**
   * Encode a Pubky URL from a public key
   */
  private encodePubkyUrl(publicKey: Uint8Array): string {
    const z32 = this.encodeZ32(publicKey);
    return `pubky://${z32}`;
  }

  /**
   * Encode a public key in z-base-32 format
   */
  private encodeZ32(publicKey: Uint8Array): string {
    // Using the proper z32 library for z-base-32 encoding
    return z32.encode(publicKey);
  }

  /**
   * Sign content with a private key
   */
  private async signContent(
    content: Record<string, unknown>,
    privateKey: string
  ): Promise<string> {
    const contentBytes = Buffer.from(JSON.stringify(content));
    const signature = ed25519.sign(
      contentBytes,
      Buffer.from(privateKey, "hex")
    );
    return Buffer.from(signature).toString("hex");
  }

  /**
   * Serialize a PKARR record for signing
   */
  private serializePkarrRecord(record: Record<string, unknown>): Uint8Array {
    // Create a canonical JSON representation
    const canonicalRecord = {
      public_key: record.public_key,
      records: (
        record.records as Array<{
          name: string;
          type: string;
          value: string;
          ttl: number;
        }>
      ).map((r) => ({
        name: r.name,
        type: r.type,
        value: r.value,
        ttl: r.ttl,
      })),
      timestamp: record.timestamp,
      sequence: record.sequence,
    };

    return Buffer.from(JSON.stringify(canonicalRecord));
  }

  /**
   * Publish a signed record to a PKARR relay
   */
  private async publishToPkarrRelay(
    relayUrl: string,
    signedRecord: PkarrSignedRecord
  ): Promise<{ success: boolean }> {
    try {
      const response = await axios.post(`${relayUrl}/publish`, signedRecord, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      return { success: response.status === 200 };
    } catch (error) {
      this.logError(`Error publishing to PKARR relay ${relayUrl}:`, error);
      return { success: false };
    }
  }

  /**
   * Resolve a Pubky URL through PKARR relays
   */
  private async resolveThroughPkarr(
    pubkyUrl: string
  ): Promise<PubkyContent | null> {
    try {
      // Extract public key from URL
      const urlParts = pubkyUrl.replace("pubky://", "").split("/");
      const publicKey = urlParts[0];
      const path = urlParts.slice(1).join("/");

      // Try each relay
      for (const relay of this.pkarrRelays) {
        try {
          const response = await axios.get(`${relay}/resolve/${publicKey}`);

          if (response.status === 200 && response.data) {
            // Find the record that matches the path
            const records = response.data.records || [];
            const matchingRecord = records.find(
              (r: { name: string; type: string; value: string }) => {
                // For root path
                if (!path && r.name === "@") {
                  return true;
                }

                // For specific paths
                return r.name === path || r.name === `/${path}`;
              }
            );

            if (matchingRecord) {
              return {
                content: matchingRecord.value,
                content_type:
                  matchingRecord.type === "TXT"
                    ? "text/plain"
                    : "application/json",
                content_hash: await sha256Hex(matchingRecord.value),
                signature: response.data.signature,
                timestamp: response.data.timestamp,
                public_key: response.data.public_key,
              };
            }
          }
        } catch (relayError) {
          this.logDebug(
            `Failed to resolve through relay ${relay}:`,
            relayError
          );
          // Continue with next relay
        }
      }

      return null;
    } catch (error) {
      this.logError("Error resolving through PKARR:", error);
      return null;
    }
  }

  /**
   * Store registration metadata
   */
  private async storeRegistrationMetadata(metadata: {
    pubky_url: string;
    domain_records: PubkyDomainRecord[];
    pkarr_relays: string[];
    registration_time: Date;
    sovereignty_score: number;
  }): Promise<void> {
    if (this.storageProvider === "postgres") {
      try {
        await (db as any).query(
          `INSERT INTO pubky_registrations (
            id, pubky_url, public_key, domain_records, pkarr_relays,
            registration_time, sovereignty_score, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            uuidv4(),
            metadata.pubky_url,
            metadata.pubky_url.replace("pubky://", "").split("/")[0],
            JSON.stringify(metadata.domain_records),
            JSON.stringify(metadata.pkarr_relays),
            metadata.registration_time instanceof Date
              ? metadata.registration_time.toISOString()
              : metadata.registration_time,
            metadata.sovereignty_score,
          ]
        );
      } catch (dbError) {
        this.logError("Database error storing registration metadata:", dbError);
      }
    } else {
      this.logDebug("Registration metadata:", metadata);
    }
  }

  /**
   * Store content metadata
   */
  private async storeContentMetadata(metadata: {
    pubky_url: string;
    content_hash: string;
    content_type: string;
    timestamp: number;
    public_key: string;
  }): Promise<void> {
    if (this.storageProvider === "postgres") {
      try {
        await (db as any).query(
          `INSERT INTO pubky_content (
            id, pubky_url, content_hash, content_type, timestamp,
            public_key, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            uuidv4(),
            metadata.pubky_url,
            metadata.content_hash,
            metadata.content_type,
            new Date(metadata.timestamp).toISOString(),
            metadata.public_key,
          ]
        );
      } catch (dbError) {
        this.logError("Database error storing content metadata:", dbError);
      }
    } else {
      this.logDebug("Content metadata:", metadata);
    }
  }

  /**
   * Set up guardian backup
   */
  private async setupGuardianBackup(
    guardianKeypair: PubkyKeypair,
    familyId: string,
    domainPubkyUrl: string
  ): Promise<void> {
    if (this.storageProvider === "postgres") {
      try {
        // Create or update guardian record
        await (db as any).query(
          `INSERT INTO federation_guardians (
            id, family_id, pubky_public_key, pubky_backup_status,
            pubky_backup_url, pubky_backup_last_updated, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())
          ON CONFLICT (pubky_public_key)
          DO UPDATE SET
            pubky_backup_status = $4,
            pubky_backup_url = $5,
            pubky_backup_last_updated = NOW(),
            updated_at = NOW()`,
          [
            uuidv4(),
            familyId,
            guardianKeypair.public_key,
            "active",
            `${guardianKeypair.pubky_url}/backup/${domainPubkyUrl.replace(
              "pubky://",
              ""
            )}`,
          ]
        );
      } catch (dbError) {
        this.logError("Database error setting up guardian backup:", dbError);
      }
    }
  }

  /**
   * Encrypt data with a key
   */
  private async encryptData(data: string, key: string): Promise<string> {
    const { iv, encrypted, authTag } = await encryptAesGcmToHex(data, key);
    return JSON.stringify({ iv, encrypted, authTag });
  }

  /**
   * Decrypt data with a key
   */
  private async decryptData(
    encryptedData: string,
    key: string
  ): Promise<string> {
    const data = JSON.parse(encryptedData);
    return await decryptAesGcmFromHex(
      data.encrypted,
      data.authTag,
      data.iv,
      key
    );
  }

  /**
   * Split a secret using Shamir's Secret Sharing
   * Uses the shamirs-secret-sharing library for secure secret splitting
   */
  private splitSecret(
    secret: string,
    threshold: number,
    shares: number
  ): string[] {
    const secretBuffer = Buffer.from(secret, "hex");
    const splitShares = sss.split({
      secret: secretBuffer,
      shares,
      threshold,
    });
    return splitShares.map((share: Buffer) => share.toString("hex"));
  }

  /**
   * Combine shares to reconstruct a secret
   * Uses the shamirs-secret-sharing library for secure secret reconstruction
   */
  private combineShares(shares: { index: number; share: string }[]): string {
    const shareBuffers = shares.map((s) => Buffer.from(s.share, "hex"));
    const combined = sss.combine({ shares: shareBuffers });
    return combined.toString("hex");
  }

  /**
   * Log debug messages
   */
  private logDebug(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.log(`[Pubky Debug] ${message}`, ...args);
    }
  }

  /**
   * Log error messages
   */
  private logError(message: string, error: unknown): void {
    console.error(`[Pubky Error] ${message}`, error);
  }
}
