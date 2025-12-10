/**
 * PNS Service - High-Level Private Notes to Self Management
 *
 * Integrates NoisePnsManager, pns-keys, and pns-events to provide a
 * unified API for creating, reading, updating, and deleting private notes.
 *
 * Features:
 * - Two security modes: "none" (NIP-44 only) and "noise-fs" (double encryption)
 * - Vault persistence for PNS keypair and chain state
 * - Relay querying and publishing via CEPS
 * - Proper key lifecycle management with secure cleanup
 *
 * @module src/lib/nostr/pns/pns-service
 */

import type { Event as NostrEvent } from "nostr-tools";
import type {
  PnsSecurityMode,
  PnsNoteMetadata,
  PnsAttachment,
  NoisePnsEnvelope,
  NoiseSecurityTier,
} from "../../noise/types";
import { NoiseProtocolError } from "../../noise/types";
import { secureZero, bytesToHex, hexToBytes } from "../../noise/primitives";
import { NoisePnsManager } from "../../noise/noise-pns-manager";
import type { VaultAccessor } from "../../noise/noise-session-manager";
import { derivePnsKeypair } from "./pns-keys";
import {
  createPnsEvent,
  parsePnsEvent,
  publishPnsEvent,
  queryPnsEvents,
  publishPnsDeletion,
  getPnsSecurityMode,
  type PnsPublishResult,
} from "./pns-events";
import {
  BlossomClient,
  createAttachmentDescriptor,
  getMediaTypeFromMime,
} from "../../api/blossom-client";
import { central_event_publishing_service as CEPS } from "../../../../lib/central_event_publishing_service";

// =============================================================================
// Constants
// =============================================================================

/** Vault storage key for PNS keypair */
const VAULT_PNS_KEYPAIR_KEY = "pns:keypair";

/** Vault storage key for local deletion log */
const VAULT_DELETION_LOG_KEY = "pns:deletions";

/** Maximum content length (256KB) */
const MAX_CONTENT_LENGTH = 256 * 1024;

/** Note ID length (16 bytes hex = 32 chars) */
const NOTE_ID_LENGTH = 32;

// =============================================================================
// Types
// =============================================================================

/**
 * A parsed and decrypted PNS note with full metadata.
 */
export interface ParsedPnsNote {
  /** Unique note identifier (d-tag value) */
  noteId: string;
  /** Decrypted note content */
  content: string;
  /** Note metadata */
  metadata: PnsNoteMetadata;
  /** Security mode used for this note */
  securityMode: PnsSecurityMode;
  /** Nostr event ID */
  eventId: string;
  /** Creation timestamp (unix seconds) */
  createdAt: number;
  /** Last update timestamp (unix seconds) */
  updatedAt?: number;
  /** Whether marked as deleted locally */
  isDeleted?: boolean;
}

/**
 * Configuration for PNS service.
 */
export interface PnsServiceConfig {
  /** Default relays to use for queries/publishing */
  defaultRelays?: string[];
  /** Default security mode for new notes */
  defaultSecurityMode?: PnsSecurityMode;
  /** Default security tier for Noise-FS notes */
  defaultSecurityTier?: NoiseSecurityTier;
  /** Query timeout in milliseconds */
  queryTimeoutMs?: number;
}

/**
 * Filters for listing notes.
 */
export interface PnsNoteFilters {
  /** Filter by user-defined tags */
  tags?: string[];
  /** Filter notes created after this timestamp (ms since epoch) */
  startDate?: number;
  /** Filter notes created before this timestamp (ms since epoch) */
  endDate?: number;
  /** Include locally deleted notes */
  includeDeleted?: boolean;
  /** Maximum number of notes to return */
  limit?: number;
}

/** Internal keypair storage format */
interface StoredPnsKeypair {
  publicKey: string; // hex
  privateKey: string; // hex
}

/** Local deletion log entry */
interface DeletionLogEntry {
  noteId: string;
  deletedAt: number;
  eventId?: string;
}

// =============================================================================
// PNS Service Class
// =============================================================================

/**
 * High-level service for managing Private Notes to Self.
 *
 * Singleton pattern - use PnsService.getInstance().
 *
 * @example
 * ```typescript
 * const pns = PnsService.getInstance();
 * await pns.initialize(vaultAccessor, nsec);
 *
 * // Save a note
 * const { noteId, eventId } = await pns.saveNote(
 *   "My private note",
 *   { tags: ["personal"] },
 *   "noise-fs"
 * );
 *
 * // List all notes
 * const notes = await pns.listNotes();
 * ```
 */
export class PnsService {
  private static instance: PnsService | null = null;

  /** Vault accessor for persistent storage */
  private vaultAccessor: VaultAccessor | null = null;

  /** PNS keypair (derived from nsec) */
  private pnsKeypair: { publicKey: Uint8Array; privateKey: Uint8Array } | null =
    null;

  /** Reference to NoisePnsManager for Noise-FS operations */
  private noiseManager: NoisePnsManager | null = null;

  /** Service configuration */
  private config: Required<PnsServiceConfig>;

  /** Local deletion log (for soft delete tracking) */
  private deletionLog: Map<string, DeletionLogEntry> = new Map();

  /** Whether service is initialized */
  private initialized = false;

  private constructor() {
    this.config = {
      defaultRelays: [],
      defaultSecurityMode: "noise-fs",
      defaultSecurityTier: "everlasting-standard",
      queryTimeoutMs: 5000,
    };
  }

  // ===========================================================================
  // Singleton Methods
  // ===========================================================================

  /**
   * Get the singleton instance.
   */
  static getInstance(): PnsService {
    if (!PnsService.instance) {
      PnsService.instance = new PnsService();
    }
    return PnsService.instance;
  }

  /**
   * Reset the singleton (for testing only).
   */
  static resetInstance(): void {
    if (PnsService.instance) {
      PnsService.instance.cleanup();
      PnsService.instance = null;
    }
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize the PNS service with user's nsec.
   *
   * Derives PNS keypair and initializes NoisePnsManager for Noise-FS support.
   *
   * @param vaultAccessor - Vault for secure storage
   * @param nsec - User's Nostr private key (32 bytes)
   * @param deviceSalt - Optional device salt for multi-device scenarios
   * @param config - Optional service configuration
   * @throws NoiseProtocolError if initialization fails
   */
  async initialize(
    vaultAccessor: VaultAccessor,
    nsec: Uint8Array,
    deviceSalt?: Uint8Array,
    config?: Partial<PnsServiceConfig>
  ): Promise<void> {
    if (this.initialized) {
      // Already initialized, optionally update config
      if (config) {
        this.config = { ...this.config, ...config };
      }
      return;
    }

    this.vaultAccessor = vaultAccessor;

    if (config) {
      this.config = { ...this.config, ...config };
    }

    try {
      // Try to restore keypair from vault first
      const storedKeypair = await this.restoreKeypairFromVault();

      if (storedKeypair) {
        this.pnsKeypair = storedKeypair;
      } else {
        // Derive keypair from nsec
        this.pnsKeypair = await derivePnsKeypair(nsec);
        await this.persistKeypairToVault();
      }

      // Initialize NoisePnsManager for Noise-FS support
      this.noiseManager = NoisePnsManager.getInstance();
      await this.noiseManager.initializeFromNsec(nsec, deviceSalt);

      // Restore deletion log
      await this.restoreDeletionLog();

      this.initialized = true;
    } catch (error) {
      // Cleanup on failure
      this.cleanup();

      if (error instanceof NoiseProtocolError) {
        throw error;
      }
      throw new NoiseProtocolError(
        "Failed to initialize PNS service",
        "SESSION_NOT_FOUND",
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if service is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ===========================================================================
  // Note Operations
  // ===========================================================================

  /**
   * Save a new note or update an existing one.
   *
   * @param content - Note content
   * @param metadata - Note metadata (tags, title, etc.)
   * @param securityMode - Security mode ("none" or "noise-fs")
   * @param relays - Optional specific relays to publish to
   * @returns Note ID and event ID
   * @throws NoiseProtocolError if save fails
   */
  async saveNote(
    content: string,
    metadata: Partial<PnsNoteMetadata>,
    securityMode?: PnsSecurityMode,
    relays?: string[]
  ): Promise<{ noteId: string; eventId: string }> {
    this.ensureInitialized();

    // Validate content
    if (!content || typeof content !== "string") {
      throw new NoiseProtocolError(
        "Content must be a non-empty string",
        "ENCRYPTION_FAILED"
      );
    }
    // Use TextEncoder for accurate UTF-8 byte count (handles multi-byte chars like emoji)
    if (new TextEncoder().encode(content).length > MAX_CONTENT_LENGTH) {
      throw new NoiseProtocolError(
        `Content exceeds maximum length of ${MAX_CONTENT_LENGTH} bytes`,
        "ENCRYPTION_FAILED"
      );
    }

    const mode = securityMode ?? this.config.defaultSecurityMode;
    const now = Date.now();

    // Generate note ID if not provided
    const noteId = metadata.noteId ?? this.generateNoteId();

    // Build full metadata
    const fullMetadata: PnsNoteMetadata = {
      ...metadata,
      noteId,
      createdAt: metadata.createdAt ?? now,
      updatedAt: now,
    };

    let unsignedEvent;

    if (mode === "noise-fs") {
      // Use NoisePnsManager for forward-secure encryption
      const noiseManager = this.noiseManager!;
      const noteIndex = noiseManager.getCurrentNoteIndex();
      const noteKey = noiseManager.getNoteKeyForIndex(noteIndex);

      try {
        unsignedEvent = await createPnsEvent(
          content,
          fullMetadata,
          this.pnsKeypair!,
          "noise-fs",
          noteKey,
          noteIndex,
          this.config.defaultSecurityTier
        );

        // Advance chain after successful encryption
        await noiseManager.advanceToNextNote();
      } finally {
        secureZero(noteKey);
      }
    } else {
      // Simple NIP-44 only mode
      unsignedEvent = await createPnsEvent(
        content,
        fullMetadata,
        this.pnsKeypair!,
        "none"
      );
    }

    // Publish event
    const privateKeyHex = bytesToHex(this.pnsKeypair!.privateKey);
    const result = await publishPnsEvent(
      unsignedEvent,
      privateKeyHex,
      relays ?? this.config.defaultRelays
    );

    if (!result.success || !result.eventId) {
      throw new NoiseProtocolError(
        result.error ?? "Failed to publish note",
        "ENCRYPTION_FAILED"
      );
    }

    return { noteId, eventId: result.eventId };
  }

  /**
   * Update an existing note.
   *
   * Creates a new replaceable event with the same d-tag (noteId).
   *
   * @param noteId - Existing note ID to update
   * @param content - New note content
   * @param metadata - Updated metadata
   * @param relays - Optional specific relays
   * @returns New event ID
   */
  async updateNote(
    noteId: string,
    content: string,
    metadata?: Partial<PnsNoteMetadata>,
    relays?: string[]
  ): Promise<{ eventId: string }> {
    this.ensureInitialized();
    this.validateNoteId(noteId);

    // Fetch the original note to get its security mode
    const existingNote = await this.getNote(noteId, relays);
    const securityMode =
      existingNote?.securityMode ?? this.config.defaultSecurityMode;

    const { eventId } = await this.saveNote(
      content,
      {
        ...metadata,
        noteId,
        createdAt: existingNote?.metadata.createdAt ?? Date.now(),
      },
      securityMode,
      relays
    );

    return { eventId };
  }

  /**
   * List user's PNS notes from relays.
   *
   * @param filters - Optional filters
   * @param relays - Optional specific relays to query
   * @returns Array of parsed notes
   */
  async listNotes(
    filters?: PnsNoteFilters,
    relays?: string[]
  ): Promise<ParsedPnsNote[]> {
    this.ensureInitialized();

    const publicKeyHex = bytesToHex(this.pnsKeypair!.publicKey);

    // Build query filters for CEPS
    const queryFilters: {
      limit?: number;
      since?: number;
      until?: number;
    } = {};

    if (filters?.limit) {
      queryFilters.limit = filters.limit;
    }
    if (filters?.startDate) {
      queryFilters.since = Math.floor(filters.startDate / 1000);
    }
    if (filters?.endDate) {
      queryFilters.until = Math.floor(filters.endDate / 1000);
    }

    // Query events from relays
    const events = await queryPnsEvents(
      publicKeyHex,
      queryFilters,
      relays ?? this.config.defaultRelays
    );

    // Parse and decrypt each event
    const notes: ParsedPnsNote[] = [];

    for (const event of events) {
      try {
        const parsed = await this.parseEventToNote(event);

        // Apply tag filter
        if (filters?.tags && filters.tags.length > 0) {
          const noteTags = parsed.metadata.tags ?? [];
          const hasMatchingTag = filters.tags.some((t) => noteTags.includes(t));
          if (!hasMatchingTag) continue;
        }

        // Check deletion status
        if (this.deletionLog.has(parsed.noteId)) {
          parsed.isDeleted = true;
          if (!filters?.includeDeleted) continue;
        }

        notes.push(parsed);
      } catch {
        // Skip unparseable events (corrupted, wrong key, etc.)
        continue;
      }
    }

    // Sort by creation date (newest first)
    notes.sort((a, b) => b.createdAt - a.createdAt);

    return notes;
  }

  /**
   * Get a specific note by ID.
   *
   * @param noteId - Note identifier
   * @param relays - Optional specific relays
   * @returns Parsed note or null if not found
   */
  async getNote(
    noteId: string,
    relays?: string[]
  ): Promise<ParsedPnsNote | null> {
    this.ensureInitialized();
    this.validateNoteId(noteId);

    const publicKeyHex = bytesToHex(this.pnsKeypair!.publicKey);

    // Query specific note by d-tag
    const events = await queryPnsEvents(
      publicKeyHex,
      { noteId, limit: 1 },
      relays ?? this.config.defaultRelays
    );

    if (events.length === 0) {
      return null;
    }

    // Get the most recent event (in case of updates)
    const latestEvent = events.reduce((latest, current) =>
      current.created_at > latest.created_at ? current : latest
    );

    try {
      const note = await this.parseEventToNote(latestEvent);

      // Check deletion status
      if (this.deletionLog.has(noteId)) {
        note.isDeleted = true;
      }

      return note;
    } catch {
      return null;
    }
  }

  /**
   * Delete a note.
   *
   * Marks the note as deleted locally and publishes a kind 5 deletion event.
   *
   * @param noteId - Note ID to delete
   * @param eventId - Optional event ID (if known, for deletion event)
   * @param relays - Optional specific relays
   */
  async deleteNote(
    noteId: string,
    eventId?: string,
    relays?: string[]
  ): Promise<void> {
    this.ensureInitialized();
    this.validateNoteId(noteId);

    // Record in local deletion log
    const entry: DeletionLogEntry = {
      noteId,
      deletedAt: Date.now(),
    };

    // If we have an event ID, publish deletion event
    if (eventId) {
      const privateKeyHex = bytesToHex(this.pnsKeypair!.privateKey);
      const publicKeyHex = bytesToHex(this.pnsKeypair!.publicKey);

      const result = await publishPnsDeletion(
        eventId,
        privateKeyHex,
        publicKeyHex,
        relays ?? this.config.defaultRelays
      );

      if (result.success) {
        entry.eventId = result.eventId;
      }
    }

    this.deletionLog.set(noteId, entry);
    await this.persistDeletionLog();
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clean up service state and secure zero all keys.
   */
  cleanup(): void {
    // Secure zero PNS keypair
    if (this.pnsKeypair) {
      secureZero(this.pnsKeypair.privateKey);
      secureZero(this.pnsKeypair.publicKey);
      this.pnsKeypair = null;
    }

    // Clear references
    this.vaultAccessor = null;
    this.noiseManager = null;
    this.deletionLog.clear();
    this.initialized = false;
  }

  /**
   * Get the PNS public key (hex encoded).
   */
  getPnsPublicKey(): string {
    this.ensureInitialized();
    return bytesToHex(this.pnsKeypair!.publicKey);
  }

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<Required<PnsServiceConfig>> {
    return { ...this.config };
  }

  /**
   * Update service configuration.
   */
  updateConfig(config: Partial<PnsServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Ensure service is initialized.
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.pnsKeypair || !this.noiseManager) {
      throw new NoiseProtocolError(
        "PNS service not initialized. Call initialize() first.",
        "SESSION_NOT_FOUND"
      );
    }
  }

  /**
   * Generate a deterministic note ID.
   */
  private generateNoteId(): string {
    // Use crypto.randomUUID and take first 32 chars (16 bytes hex equivalent)
    const uuid = crypto.randomUUID().replace(/-/g, "");
    return uuid.substring(0, NOTE_ID_LENGTH);
  }

  /**
   * Validate note ID format.
   */
  private validateNoteId(noteId: string): void {
    if (!noteId || typeof noteId !== "string") {
      throw new NoiseProtocolError(
        "Note ID must be a non-empty string",
        "DECRYPTION_FAILED"
      );
    }
    if (!/^[a-f0-9]+$/i.test(noteId)) {
      throw new NoiseProtocolError(
        "Note ID must be hexadecimal",
        "DECRYPTION_FAILED"
      );
    }
  }

  /**
   * Parse a Nostr event to ParsedPnsNote.
   */
  private async parseEventToNote(event: NostrEvent): Promise<ParsedPnsNote> {
    const securityMode = getPnsSecurityMode(event);

    // Get noise key if needed for decryption
    let noiseKey: Uint8Array | undefined;

    if (securityMode === "noise-fs") {
      // Extract note epoch from event tags (required for Noise-FS decryption)
      const noteEpoch = this.extractNoteEpoch(event);
      if (noteEpoch === null) {
        throw new NoiseProtocolError(
          "Noise-FS event missing required 'noise-epoch' tag - cannot decrypt",
          "DECRYPTION_FAILED"
        );
      }
      noiseKey = this.noiseManager!.getNoteKeyForIndex(noteEpoch);
    }

    try {
      const { content, metadata } = await parsePnsEvent(
        event,
        this.pnsKeypair!,
        noiseKey
      );

      // Extract note ID from d-tag
      const dTag = event.tags.find((t) => t[0] === "d");
      const noteId = dTag?.[1] ?? metadata.noteId ?? "";

      return {
        noteId,
        content,
        metadata,
        securityMode,
        eventId: event.id,
        createdAt: event.created_at,
        updatedAt: metadata.updatedAt
          ? Math.floor(metadata.updatedAt / 1000)
          : undefined,
      };
    } finally {
      if (noiseKey) {
        secureZero(noiseKey);
      }
    }
  }

  /**
   * Extract note epoch from event (for Noise-FS decryption).
   * The epoch is stored in the 'noise-epoch' tag and is required for decryption.
   *
   * @param event - The Nostr event to extract epoch from
   * @returns The note epoch number, or null if tag is missing/invalid
   */
  private extractNoteEpoch(event: NostrEvent): number | null {
    try {
      const epochTag = event.tags.find((t) => t[0] === "noise-epoch");
      if (epochTag && epochTag[1]) {
        const epoch = parseInt(epochTag[1], 10);
        if (!isNaN(epoch) && epoch >= 0) {
          return epoch;
        }
      }
    } catch {
      // Ignore parsing errors
    }
    return null;
  }

  // ===========================================================================
  // Vault Persistence
  // ===========================================================================

  /**
   * Restore PNS keypair from vault.
   */
  private async restoreKeypairFromVault(): Promise<{
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  } | null> {
    if (!this.vaultAccessor) return null;

    try {
      const stored = await this.vaultAccessor.get(VAULT_PNS_KEYPAIR_KEY);
      if (!stored) return null;

      const parsed = JSON.parse(stored) as StoredPnsKeypair;
      return {
        publicKey: hexToBytes(parsed.publicKey),
        privateKey: hexToBytes(parsed.privateKey),
      };
    } catch {
      return null;
    }
  }

  /**
   * Persist PNS keypair to vault.
   */
  private async persistKeypairToVault(): Promise<void> {
    if (!this.vaultAccessor || !this.pnsKeypair) return;

    const stored: StoredPnsKeypair = {
      publicKey: bytesToHex(this.pnsKeypair.publicKey),
      privateKey: bytesToHex(this.pnsKeypair.privateKey),
    };

    await this.vaultAccessor.set(VAULT_PNS_KEYPAIR_KEY, JSON.stringify(stored));
  }

  /**
   * Restore deletion log from vault.
   */
  private async restoreDeletionLog(): Promise<void> {
    if (!this.vaultAccessor) return;

    try {
      const stored = await this.vaultAccessor.get(VAULT_DELETION_LOG_KEY);
      if (!stored) return;

      const entries = JSON.parse(stored) as DeletionLogEntry[];
      this.deletionLog.clear();
      for (const entry of entries) {
        this.deletionLog.set(entry.noteId, entry);
      }
    } catch {
      // Ignore restore errors - start with empty log
    }
  }

  /**
   * Persist deletion log to vault.
   */
  private async persistDeletionLog(): Promise<void> {
    if (!this.vaultAccessor) return;

    const entries = Array.from(this.deletionLog.values());
    await this.vaultAccessor.set(
      VAULT_DELETION_LOG_KEY,
      JSON.stringify(entries)
    );
  }

  // ===========================================================================
  // Attachment Methods (Phase 2b - Blossom Integration)
  // ===========================================================================

  /**
   * Upload and encrypt a file for use as a PNS note attachment.
   *
   * The file is encrypted with AES-256-GCM before upload to Blossom.
   * The returned PnsAttachment contains the URL and encryption keys,
   * which should be stored in the note's metadata.attachments array.
   *
   * @param file - File to encrypt and upload
   * @param alt - Optional alt text for accessibility
   * @returns PnsAttachment ready to include in note metadata, or null on failure
   *
   * @example
   * ```typescript
   * const attachment = await pnsService.uploadNoteAttachment(file);
   * if (attachment) {
   *   const metadata: PnsNoteMetadata = {
   *     createdAt: Date.now(),
   *     attachments: [attachment],
   *   };
   *   await pnsService.saveNote("My note with attachment", metadata);
   * }
   * ```
   */
  async uploadNoteAttachment(
    file: File,
    alt?: string
  ): Promise<PnsAttachment | null> {
    this.ensureInitialized();

    const blossomClient = BlossomClient.getInstance();

    /**
     * Unified signer for Blossom BUD-02 authenticated uploads.
     * Supports both NIP-07 browser extensions and NIP-05/password session authentication.
     */
    const pnsSigner = async (event: unknown): Promise<unknown> => {
      // Try NIP-07 browser extension first (preferred for hardware key security)
      if (typeof window !== "undefined" && window.nostr) {
        try {
          return await window.nostr.signEvent(event as Record<string, unknown>);
        } catch (nip07Error) {
          console.log(
            "[PNS] NIP-07 signing failed, falling back to session signing:",
            nip07Error
          );
        }
      }

      // Fallback: Use CEPS session signing for NIP-05/password authenticated users
      try {
        const signedEvent = await CEPS.signEventWithActiveSession(event);
        return signedEvent;
      } catch (sessionError) {
        throw new Error(
          "Failed to sign Blossom authorization for PNS attachment: " +
            "No NIP-07 extension or active session available. " +
            "Please ensure you are signed in."
        );
      }
    };

    const result = await blossomClient.uploadEncryptedMedia(file, pnsSigner);

    if (
      !result.success ||
      !result.url ||
      !result.encryptionKey ||
      !result.encryptionIv ||
      !result.sha256
    ) {
      console.error("Failed to upload PNS attachment:", result.error);
      return null;
    }

    return {
      url: result.url,
      fileName: file.name,
      mimeType: result.mimeType || file.type || "application/octet-stream",
      mediaType: getMediaTypeFromMime(file.type),
      size: result.size || 0,
      sha256: result.sha256,
      enc: {
        algo: "AES-GCM",
        key: result.encryptionKey,
        iv: result.encryptionIv,
      },
      alt,
    };
  }

  /**
   * Download and decrypt a PNS note attachment.
   *
   * @param attachment - Attachment metadata from note
   * @returns Decrypted file as Blob with correct MIME type
   * @throws Error if download or decryption fails
   *
   * @example
   * ```typescript
   * const note = await pnsService.getNote(noteId);
   * if (note?.metadata.attachments?.[0]) {
   *   const blob = await pnsService.downloadNoteAttachment(note.metadata.attachments[0]);
   *   const url = URL.createObjectURL(blob);
   *   // Use url for display or download
   * }
   * ```
   */
  async downloadNoteAttachment(attachment: PnsAttachment): Promise<Blob> {
    this.ensureInitialized();

    const blossomClient = BlossomClient.getInstance();

    const decryptedBlob = await blossomClient.downloadAndDecrypt(
      attachment.url,
      attachment.enc.key,
      attachment.enc.iv,
      attachment.sha256
    );

    // Return blob with correct MIME type
    return new Blob([decryptedBlob], { type: attachment.mimeType });
  }

  /**
   * Upload multiple files as attachments for a PNS note.
   *
   * @param files - Array of files to upload
   * @returns Array of successfully uploaded attachments
   */
  async uploadNoteAttachments(files: File[]): Promise<PnsAttachment[]> {
    this.ensureInitialized();

    const attachments: PnsAttachment[] = [];

    for (const file of files) {
      const attachment = await this.uploadNoteAttachment(file);
      if (attachment) {
        attachments.push(attachment);
      }
    }

    return attachments;
  }
}
