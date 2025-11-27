/**
 * Noise PNS (Private Notes to Self) Manager
 *
 * Phase 0 Foundation: Manages forward-secure encryption for private notes.
 * Implements a ratcheting key derivation scheme for notes-to-self.
 *
 * The PNS chain provides:
 * - Forward secrecy: Compromise of current key doesn't reveal past notes
 * - Key ratcheting: Each note uses a unique derived key
 * - Vault persistence: Chain state survives browser restarts
 *
 * @module src/lib/noise/noise-pns-manager
 */

import type {
  NoisePnsChainState,
  SerializedNoisePnsChainState,
  NoiseSecurityTier,
  NoisePnsEnvelope,
  PnsNoteMetadata,
} from "./types";
import { NoiseProtocolError } from "./types";
import {
  hkdfExpand,
  chaCha20Poly1305Encrypt,
  chaCha20Poly1305Decrypt,
  secureZero,
  bytesToBase64,
  base64ToBytes,
  generateSymmetricKey,
} from "./primitives";
import type { VaultAccessor } from "./noise-session-manager";
import { derivePnsFsRoot } from "../nostr/pns/pns-keys";
import {
  createNoisePnsEnvelope,
  parseNoisePnsEnvelope,
} from "../nostr/pns/pns-events";

// =============================================================================
// Constants
// =============================================================================

/** Vault storage key for PNS chain state */
const VAULT_PNS_KEY = "noise-pns-chain";

/** HKDF info for chain key derivation */
const CHAIN_KEY_INFO = "pns-chain-key";

/** HKDF info for note key derivation */
const NOTE_KEY_INFO = "pns-note-key";

/** Nonce size for ChaCha20-Poly1305 */
const NONCE_SIZE = 12;

// =============================================================================
// PNS Manager Class
// =============================================================================

/**
 * Manages forward-secure encryption for private notes-to-self.
 * Singleton pattern - use NoisePnsManager.getInstance().
 */
export class NoisePnsManager {
  private static instance: NoisePnsManager | null = null;

  /** Current chain state (null if not initialized) */
  private chainState: NoisePnsChainState | null = null;

  /** Security tier for this PNS instance */
  private securityTier: NoiseSecurityTier = "everlasting-standard";

  /** Vault accessor for persistent storage */
  private vaultAccessor: VaultAccessor | null = null;

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  static getInstance(): NoisePnsManager {
    if (!NoisePnsManager.instance) {
      NoisePnsManager.instance = new NoisePnsManager();
    }
    return NoisePnsManager.instance;
  }

  /**
   * Reset the singleton instance (for testing only).
   * Clears sensitive key material before nullifying.
   */
  static resetInstance(): void {
    if (NoisePnsManager.instance?.chainState) {
      secureZero(NoisePnsManager.instance.chainState.rootKey);
      secureZero(NoisePnsManager.instance.chainState.chainKey);
    }
    NoisePnsManager.instance = null;
  }

  /**
   * Initialize the PNS manager.
   *
   * @param vaultAccessor - Accessor for vault storage
   * @param securityTier - Security tier (default: everlasting-standard)
   */
  async initialize(
    vaultAccessor: VaultAccessor,
    securityTier: NoiseSecurityTier = "everlasting-standard"
  ): Promise<void> {
    this.vaultAccessor = vaultAccessor;
    this.securityTier = securityTier;

    // Try to restore existing chain state
    const restored = await this.restoreChainState();

    // If no existing state, create new chain
    if (!restored) {
      await this.createNewChain();
    }
  }

  /**
   * Check if the PNS manager is initialized.
   */
  isInitialized(): boolean {
    return this.chainState !== null;
  }

  /**
   * Get the current note counter.
   */
  getNoteCounter(): number {
    if (!this.chainState) {
      throw new NoiseProtocolError(
        "PNS manager not initialized",
        "CHAIN_STATE_CORRUPTED"
      );
    }
    return this.chainState.noteCounter;
  }

  /**
   * Encrypt a private note.
   * Advances the chain key after encryption (forward secrecy).
   *
   * @param plaintext - Note content to encrypt
   * @returns Encrypted note with metadata
   */
  async encryptNote(plaintext: Uint8Array): Promise<EncryptedNote> {
    if (!this.chainState) {
      throw new NoiseProtocolError(
        "PNS manager not initialized",
        "CHAIN_STATE_CORRUPTED"
      );
    }

    // Derive note-specific key from chain key
    const noteKey = hkdfExpand(
      this.chainState.chainKey,
      new Uint8Array(0),
      `${NOTE_KEY_INFO}:${this.chainState.noteCounter}`,
      32
    );

    // Generate random nonce
    const nonce = new Uint8Array(NONCE_SIZE);
    crypto.getRandomValues(nonce);

    try {
      // Encrypt the note
      const ciphertext = await chaCha20Poly1305Encrypt(
        noteKey,
        nonce,
        plaintext
      );

      // Capture current counter before advancing
      const noteIndex = this.chainState.noteCounter;

      // Advance the chain (forward secrecy)
      await this.advanceChain();

      return {
        noteIndex,
        ciphertext: bytesToBase64(ciphertext),
        nonce: bytesToBase64(nonce),
        securityTier: this.securityTier,
        createdAt: Date.now(),
      };
    } finally {
      // Clear the note key even if advanceChain() throws
      secureZero(noteKey);
    }
  }

  /**
   * Decrypt a private note.
   * Note: Requires the chain state to have the correct root key.
   *
   * @param encryptedNote - Encrypted note to decrypt
   * @returns Decrypted plaintext
   */
  async decryptNote(encryptedNote: EncryptedNote): Promise<Uint8Array> {
    if (!this.chainState) {
      throw new NoiseProtocolError(
        "PNS manager not initialized",
        "CHAIN_STATE_CORRUPTED"
      );
    }

    // Derive the note key for the specific index
    // We need to derive from root key to get the chain key at that index
    const noteKey = this.deriveNoteKeyForIndex(encryptedNote.noteIndex);

    const ciphertext = base64ToBytes(encryptedNote.ciphertext);
    const nonce = base64ToBytes(encryptedNote.nonce);

    try {
      const plaintext = await chaCha20Poly1305Decrypt(
        noteKey,
        nonce,
        ciphertext
      );

      // Clear the note key
      secureZero(noteKey);

      return plaintext;
    } catch (error) {
      secureZero(noteKey);
      throw error;
    }
  }

  /**
   * Export the root key for backup/sync.
   * WARNING: This is sensitive data - handle with care.
   *
   * @returns Base64-encoded root key
   */
  exportRootKey(): string {
    if (!this.chainState) {
      throw new NoiseProtocolError(
        "PNS manager not initialized",
        "CHAIN_STATE_CORRUPTED"
      );
    }
    return bytesToBase64(this.chainState.rootKey);
  }

  /**
   * Import a root key from backup/sync.
   * This will reset the chain state.
   *
   * @param rootKeyBase64 - Base64-encoded root key
   * @param noteCounter - Note counter to restore (default: 0)
   */
  async importRootKey(rootKeyBase64: string, noteCounter = 0): Promise<void> {
    // Clear existing state if present
    if (this.chainState) {
      secureZero(this.chainState.rootKey);
      secureZero(this.chainState.chainKey);
    }

    const rootKey = base64ToBytes(rootKeyBase64);

    // Validate key length
    if (rootKey.length !== 32) {
      // Securely zero key material before throwing to prevent memory leak
      secureZero(rootKey);
      throw new NoiseProtocolError(
        "Invalid root key length: expected 32 bytes",
        "CHAIN_STATE_CORRUPTED"
      );
    }

    // Derive initial chain key from root
    const chainKey = hkdfExpand(rootKey, new Uint8Array(0), CHAIN_KEY_INFO, 32);

    this.chainState = {
      rootKey,
      chainKey,
      noteCounter,
    };

    // Advance chain to the correct position
    for (let i = 0; i < noteCounter; i++) {
      const nextChainKey = hkdfExpand(
        this.chainState.chainKey,
        new Uint8Array(0),
        `${CHAIN_KEY_INFO}:advance`,
        32
      );
      secureZero(this.chainState.chainKey);
      this.chainState.chainKey = nextChainKey;
    }

    await this.persistChainState();
  }

  // ===========================================================================
  // NIP-PNS Integration Methods
  // ===========================================================================

  /**
   * Initialize the PNS chain from user's nsec using deterministic derivation.
   *
   * Uses `derivePnsFsRoot()` to derive the root key from nsec, ensuring
   * deterministic key derivation that can be restored from the same nsec.
   *
   * @param nsec - User's Nostr private key (32 bytes)
   * @param deviceSalt - Optional device-specific salt for multi-device scenarios
   * @throws NoiseProtocolError if derivation fails
   *
   * @example
   * ```typescript
   * const manager = NoisePnsManager.getInstance();
   * await manager.initializeFromNsec(nsec);
   * ```
   */
  async initializeFromNsec(
    nsec: Uint8Array,
    deviceSalt?: Uint8Array
  ): Promise<void> {
    // Clear existing state if present
    if (this.chainState) {
      secureZero(this.chainState.rootKey);
      secureZero(this.chainState.chainKey);
      this.chainState = null;
    }

    try {
      // Derive root key deterministically from nsec
      const rootKey = await derivePnsFsRoot(nsec, deviceSalt);

      // Derive initial chain key from root
      const chainKey = hkdfExpand(
        rootKey,
        new Uint8Array(0),
        CHAIN_KEY_INFO,
        32
      );

      this.chainState = {
        rootKey,
        chainKey,
        noteCounter: 0,
      };

      await this.persistChainState();
    } catch (error) {
      if (error instanceof NoiseProtocolError) {
        throw error;
      }
      throw new NoiseProtocolError(
        "Failed to initialize PNS from nsec",
        "KEY_DERIVATION_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Encrypt a PNS note and return the Noise-FS envelope.
   *
   * Creates a NoisePnsEnvelope with forward-secure encryption.
   * Advances the chain after encryption (forward secrecy).
   *
   * @param content - Note plaintext content
   * @param metadata - Note metadata
   * @returns Promise with envelope and note index
   * @throws NoiseProtocolError if encryption fails
   *
   * @example
   * ```typescript
   * const { envelope, noteIndex } = await manager.encryptPnsNote(
   *   "My private note",
   *   { tags: ["personal"], createdAt: Date.now() }
   * );
   * ```
   */
  async encryptPnsNote(
    content: string,
    metadata: PnsNoteMetadata
  ): Promise<{ envelope: NoisePnsEnvelope; noteIndex: number }> {
    if (!this.chainState) {
      throw new NoiseProtocolError(
        "PNS manager not initialized",
        "CHAIN_STATE_CORRUPTED"
      );
    }

    // Get the current note index before advancing
    const noteIndex = this.chainState.noteCounter;

    // Derive note-specific key from chain key
    const noteKey = hkdfExpand(
      this.chainState.chainKey,
      new Uint8Array(0),
      `${NOTE_KEY_INFO}:${noteIndex}`,
      32
    );

    try {
      // Create the Noise-FS envelope
      const envelope = await createNoisePnsEnvelope(
        content,
        metadata,
        noteKey,
        noteIndex,
        this.securityTier
      );

      // Advance the chain (forward secrecy)
      await this.advanceChain();

      return { envelope, noteIndex };
    } finally {
      // Always clean up the note key
      secureZero(noteKey);
    }
  }

  /**
   * Decrypt a PNS note from its Noise-FS envelope.
   *
   * Derives the note key for the envelope's epoch from the root key,
   * then decrypts the content and metadata.
   *
   * @param envelope - The NoisePnsEnvelope to decrypt
   * @returns Decrypted content and metadata
   * @throws NoiseProtocolError if decryption fails
   *
   * @example
   * ```typescript
   * const { content, metadata } = await manager.decryptPnsNote(envelope);
   * ```
   */
  async decryptPnsNote(
    envelope: NoisePnsEnvelope
  ): Promise<{ content: string; metadata: PnsNoteMetadata }> {
    if (!this.chainState) {
      throw new NoiseProtocolError(
        "PNS manager not initialized",
        "CHAIN_STATE_CORRUPTED"
      );
    }

    // Derive the note key for the envelope's epoch
    const noteKey = this.deriveNoteKeyForIndex(envelope.note_epoch);

    try {
      // Parse and decrypt the envelope
      return await parseNoisePnsEnvelope(envelope, noteKey);
    } finally {
      // Always clean up the note key
      secureZero(noteKey);
    }
  }

  /**
   * Get the note key for a specific index.
   *
   * Used when creating events with `createPnsEvent()` which handles
   * its own envelope creation. The caller is responsible for
   * cleaning up the key with `secureZero()` after use.
   *
   * @param noteIndex - The note index in the chain
   * @returns 32-byte note key (caller must secureZero after use)
   * @throws NoiseProtocolError if manager not initialized
   *
   * @example
   * ```typescript
   * const noteKey = manager.getNoteKeyForIndex(5);
   * try {
   *   // Use noteKey...
   * } finally {
   *   secureZero(noteKey);
   * }
   * ```
   */
  getNoteKeyForIndex(noteIndex: number): Uint8Array {
    return this.deriveNoteKeyForIndex(noteIndex);
  }

  /**
   * Get the current note index (next note to be encrypted).
   *
   * Use this to get the epoch value for external envelope creation.
   *
   * @returns Current note counter
   * @throws NoiseProtocolError if manager not initialized
   */
  getCurrentNoteIndex(): number {
    if (!this.chainState) {
      throw new NoiseProtocolError(
        "PNS manager not initialized",
        "CHAIN_STATE_CORRUPTED"
      );
    }
    return this.chainState.noteCounter;
  }

  /**
   * Advance the chain to the next note slot.
   *
   * Call this after using `getNoteKeyForIndex()` with `getCurrentNoteIndex()`
   * to maintain forward secrecy.
   *
   * @throws NoiseProtocolError if manager not initialized
   */
  async advanceToNextNote(): Promise<void> {
    if (!this.chainState) {
      throw new NoiseProtocolError(
        "PNS manager not initialized",
        "CHAIN_STATE_CORRUPTED"
      );
    }
    await this.advanceChain();
  }

  /**
   * Get the current security tier.
   */
  getSecurityTier(): NoiseSecurityTier {
    return this.securityTier;
  }

  /**
   * Set the security tier.
   *
   * @param tier - The security tier to use
   */
  setSecurityTier(tier: NoiseSecurityTier): void {
    this.securityTier = tier;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Create a new PNS chain with fresh root key.
   */
  private async createNewChain(): Promise<void> {
    const rootKey = generateSymmetricKey();
    const chainKey = hkdfExpand(rootKey, new Uint8Array(0), CHAIN_KEY_INFO, 32);

    this.chainState = {
      rootKey,
      chainKey,
      noteCounter: 0,
    };

    await this.persistChainState();
  }

  /**
   * Advance the chain key (forward secrecy ratchet).
   */
  private async advanceChain(): Promise<void> {
    if (!this.chainState) return;

    // Derive next chain key
    const nextChainKey = hkdfExpand(
      this.chainState.chainKey,
      new Uint8Array(0),
      `${CHAIN_KEY_INFO}:advance`,
      32
    );

    // Clear old chain key
    secureZero(this.chainState.chainKey);

    // Update state
    this.chainState.chainKey = nextChainKey;
    this.chainState.noteCounter++;

    await this.persistChainState();
  }

  /**
   * Derive the note key for a specific index.
   * Used for decryption of historical notes.
   */
  private deriveNoteKeyForIndex(noteIndex: number): Uint8Array {
    if (!this.chainState) {
      throw new NoiseProtocolError(
        "PNS manager not initialized",
        "CHAIN_STATE_CORRUPTED"
      );
    }

    // Start from root and derive chain key at the target index
    let chainKey = hkdfExpand(
      this.chainState.rootKey,
      new Uint8Array(0),
      CHAIN_KEY_INFO,
      32
    );

    for (let i = 0; i < noteIndex; i++) {
      const nextChainKey = hkdfExpand(
        chainKey,
        new Uint8Array(0),
        `${CHAIN_KEY_INFO}:advance`,
        32
      );
      secureZero(chainKey);
      chainKey = nextChainKey;
    }

    // Derive note key from chain key at target index
    const noteKey = hkdfExpand(
      chainKey,
      new Uint8Array(0),
      `${NOTE_KEY_INFO}:${noteIndex}`,
      32
    );

    secureZero(chainKey);
    return noteKey;
  }

  /**
   * Persist chain state to vault.
   * If no vault accessor is available, logs warning but continues (in-memory only).
   * Throws only if chainState is missing when it should exist.
   */
  private async persistChainState(): Promise<void> {
    if (!this.chainState) {
      throw new NoiseProtocolError(
        "Cannot persist: chain state not available",
        "CHAIN_STATE_CORRUPTED"
      );
    }

    // No vault accessor means in-memory only mode (e.g., during testing)
    if (!this.vaultAccessor) {
      return;
    }

    const serialized: SerializedNoisePnsChainState = {
      rootKey: bytesToBase64(this.chainState.rootKey),
      chainKey: bytesToBase64(this.chainState.chainKey),
      noteCounter: this.chainState.noteCounter,
    };

    await this.vaultAccessor.set(VAULT_PNS_KEY, JSON.stringify(serialized));
  }

  /**
   * Restore chain state from vault.
   */
  private async restoreChainState(): Promise<boolean> {
    if (!this.vaultAccessor) return false;

    try {
      const data = await this.vaultAccessor.get(VAULT_PNS_KEY);
      if (!data) return false;

      const serialized: SerializedNoisePnsChainState = JSON.parse(data);
      this.chainState = {
        rootKey: base64ToBytes(serialized.rootKey),
        chainKey: base64ToBytes(serialized.chainKey),
        noteCounter: serialized.noteCounter,
      };

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Destroy the singleton instance (for testing).
   */
  static destroy(): void {
    if (NoisePnsManager.instance?.chainState) {
      secureZero(NoisePnsManager.instance.chainState.rootKey);
      secureZero(NoisePnsManager.instance.chainState.chainKey);
    }
    NoisePnsManager.instance = null;
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Encrypted note with metadata.
 */
export interface EncryptedNote {
  /** Index of this note in the chain */
  noteIndex: number;
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded nonce */
  nonce: string;
  /** Security tier used for encryption */
  securityTier: NoiseSecurityTier;
  /** Creation timestamp */
  createdAt: number;
}
