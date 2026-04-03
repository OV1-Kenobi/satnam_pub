// NIP-SKL Skill Registry — Hybrid Cache (Supabase + IndexedDB)
// Implements: Supabase as primary source, IndexedDB for offline, relay subscription, event emission
// Aligned with docs/planning/NIP-Triumvirate-Satnam-Integration-Plan.md §5.1 and §6

import type {
  SkillManifest,
  SkillRegistryCacheEntry,
} from "../../../types/nip-skl";
import type { Database } from "../../../types/database";
import { parseManifestContent, validateManifest } from "./manifest";
import { supabase } from "../supabase";

const DB_NAME = "satnam-skill-registry";
const DB_VERSION = 1;
const STORE_NAME = "manifests";
const DEFAULT_TTL_SECONDS = 3600; // 1 hour

/**
 * Skill Registry Cache
 * Subscribes to relay filter {kinds: [33400, 33401], since: lastSync}
 * Persists to IndexedDB using pattern from src/lib/auth/client-session-vault.ts
 * Emits events when new manifests arrive
 */
export class SkillRegistryCache {
  private db: IDBDatabase | null = null;
  private lastSyncTimestamp: number = 0;
  private eventListeners: Map<string, Set<(manifest: SkillManifest) => void>> =
    new Map();

  /**
   * Initialize the registry cache
   * Opens IndexedDB connection
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: "skillScopeId",
          });
          store.createIndex("cachedAt", "cachedAt", { unique: false });
        }
      };
    });
  }

  /**
   * Get a manifest from cache (hybrid: Supabase first, then IndexedDB)
   * @param skillScopeId - Canonical skill address
   * @returns SkillManifest or null if not found or expired
   */
  async get(skillScopeId: string): Promise<SkillManifest | null> {
    // 1. Try Supabase first (authoritative source)
    try {
      const supabaseManifest = await this.getFromSupabase(skillScopeId);
      if (supabaseManifest) {
        // Update IndexedDB cache
        await this.set(supabaseManifest);
        return supabaseManifest;
      }
    } catch (error) {
      console.warn("Supabase query failed, falling back to IndexedDB:", error);
    }

    // 2. Fall back to IndexedDB for offline access
    if (!this.db) {
      throw new Error("Registry cache not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(skillScopeId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entry = request.result as SkillRegistryCacheEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }

        // Check TTL
        const now = Date.now();
        const expiresAt = entry.cachedAt + entry.ttlSeconds * 1000;
        if (now > expiresAt) {
          // Expired, remove from cache
          this.delete(skillScopeId).catch(console.error);
          resolve(null);
          return;
        }

        resolve(entry.manifest);
      };
    });
  }

  /**
   * Get a manifest from Supabase (authoritative source)
   * @param skillScopeId - Canonical skill address
   * @returns SkillManifest or null if not found
   */
  private async getFromSupabase(
    skillScopeId: string,
  ): Promise<SkillManifest | null> {
    const { data, error } = await supabase
      .from("skill_manifests")
      .select("*")
      .eq("skill_scope_id", skillScopeId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Not found
        return null;
      }
      throw error;
    }

    if (!data) {
      return null;
    }

    // Convert database row to SkillManifest type
    return this.dbRowToManifest(data);
  }

  /**
   * Convert database row to SkillManifest
   * @param row - Database row from skill_manifests table
   * @returns SkillManifest
   */
  private dbRowToManifest(
    row: Database["public"]["Tables"]["skill_manifests"]["Row"],
  ): SkillManifest {
    return {
      skillScopeId: row.skill_scope_id,
      version: row.version,
      name: row.name,
      description: row.description || "",
      inputSchema: row.input_schema as Record<string, unknown>,
      outputSchema: row.output_schema as Record<string, unknown>,
      runtimeConstraints: row.runtime_constraints,
      attestations: [], // TODO: Populate from attestation_event_ids
      publisherPubkey: row.publisher_pubkey,
      manifestEventId: row.manifest_event_id,
      manifestHash: undefined, // Not stored in DB yet
      capabilities: undefined, // Not stored in DB yet
      validUntilUnix: undefined, // Not stored in DB yet
      relayHint: row.relay_hint || undefined,
      rawEvent: row.raw_event as any,
    };
  }

  /**
   * Store a manifest in cache
   * @param manifest - SkillManifest to cache
   * @param ttlSeconds - Time-to-live in seconds (default: 1 hour)
   */
  async set(
    manifest: SkillManifest,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    if (!this.db) {
      throw new Error("Registry cache not initialized");
    }

    const entry: SkillRegistryCacheEntry = {
      skillScopeId: manifest.skillScopeId,
      manifest,
      cachedAt: Date.now(),
      ttlSeconds,
      lastSyncTimestamp: this.lastSyncTimestamp,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Delete a manifest from cache
   * @param skillScopeId - Canonical skill address
   */
  async delete(skillScopeId: string): Promise<void> {
    if (!this.db) {
      throw new Error("Registry cache not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(skillScopeId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Subscribe to manifest updates
   * @param event - Event name (e.g. 'manifest-added', 'manifest-updated')
   * @param callback - Callback function
   */
  on(event: string, callback: (manifest: SkillManifest) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unsubscribe from manifest updates
   * @param event - Event name
   * @param callback - Callback function
   */
  off(event: string, callback: (manifest: SkillManifest) => void): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Emit an event to all listeners
   * @param event - Event name
   * @param manifest - SkillManifest
   */
  private emit(event: string, manifest: SkillManifest): void {
    this.eventListeners.get(event)?.forEach((callback) => callback(manifest));
  }

  /**
   * Subscribe to relay for new manifests
   * TODO: Implement relay subscription using nostr-tools
   * Filter: {kinds: [33400, 33401], since: lastSync}
   * @param relayUrls - Relay URLs to subscribe to
   */
  async subscribeToRelays(relayUrls: string[]): Promise<void> {
    console.warn("subscribeToRelays stub: would subscribe to", relayUrls);
    // Real implementation would:
    // 1. Connect to relays
    // 2. Subscribe with filter: {kinds: [33400, 33401], since: this.lastSyncTimestamp}
    // 3. On event: validate, parse, cache, emit
    // 4. Update this.lastSyncTimestamp
  }
}

// Singleton instance
let registryInstance: SkillRegistryCache | null = null;

/**
 * Get the singleton registry instance
 * @returns SkillRegistryCache
 */
export async function getSkillRegistry(): Promise<SkillRegistryCache> {
  if (!registryInstance) {
    registryInstance = new SkillRegistryCache();
    await registryInstance.init();
  }
  return registryInstance;
}
