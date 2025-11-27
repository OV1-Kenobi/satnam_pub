/**
 * Noise Session Manager
 *
 * Phase 0 Foundation: Manages Noise protocol session lifecycle for all 3 security tiers.
 * Handles session creation, encryption/decryption, rekeying, and persistence.
 *
 * Security Tiers:
 * - ephemeral-standard: Session keys cleared on tab close (in-memory only)
 * - everlasting-standard: Session keys persisted to ClientSessionVault
 * - hardened: Requires NFC hardware MFA for session operations
 *
 * @module src/lib/noise/noise-session-manager
 */

import type {
  NoiseSecurityTier,
  NoiseSessionState,
  NoiseKeyPair,
  NoiseEnvelope,
  SerializedNoiseSession,
  NoiseHandshakePattern,
  NoiseHandshakeState,
  NoiseSessionConfig,
  NoiseTransportMessage,
  NoiseMessageResult,
  NoiseCipherState,
} from "./types";
import { NoiseProtocolError, DEFAULT_NOISE_SESSION_CONFIG } from "./types";
import {
  generateX25519KeyPair,
  x25519ECDH,
  hkdfExpand,
  deriveCipherState,
  encryptWithCipherState,
  decryptWithCipherState,
  secureZero,
  bytesToBase64,
  base64ToBytes,
  bytesToHex,
} from "./primitives";

// =============================================================================
// Constants
// =============================================================================

/** Maximum messages before mandatory rekey */
const REKEY_THRESHOLD = 1000;

/** Session timeout for ephemeral tier (30 minutes) */
const EPHEMERAL_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/** Session timeout for everlasting tier (7 days) */
const EVERLASTING_SESSION_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

/** Vault storage key prefix for sessions */
const VAULT_SESSION_PREFIX = "noise-session:";

// =============================================================================
// Session Manager Class
// =============================================================================

/**
 * Manages Noise protocol sessions with peers.
 * Singleton pattern - use NoiseSessionManager.getInstance().
 */
export class NoiseSessionManager {
  private static instance: NoiseSessionManager | null = null;

  /** In-memory session storage (all tiers use this at runtime) */
  private sessions: Map<string, NoiseSessionState> = new Map();

  /** Local static key pair (generated once per app lifecycle) */
  private localStaticKeyPair: NoiseKeyPair | null = null;

  /** Vault accessor for persistent storage (injected) */
  private vaultAccessor: VaultAccessor | null = null;

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  static getInstance(): NoiseSessionManager {
    if (!NoiseSessionManager.instance) {
      NoiseSessionManager.instance = new NoiseSessionManager();
    }
    return NoiseSessionManager.instance;
  }

  /**
   * Reset the singleton instance (for testing only).
   * Delegates to destroy() to ensure proper key material cleanup.
   */
  static resetInstance(): void {
    NoiseSessionManager.destroy();
  }

  /**
   * Initialize the session manager with optional vault accessor.
   * Must be called before using everlasting or hardened tiers.
   *
   * @param vaultAccessor - Accessor for ClientSessionVault operations
   */
  async initialize(vaultAccessor?: VaultAccessor): Promise<void> {
    this.vaultAccessor = vaultAccessor ?? null;

    // Generate local static key pair if not already present
    if (!this.localStaticKeyPair) {
      this.localStaticKeyPair = await generateX25519KeyPair();
    }

    // Restore persisted sessions from vault if available
    if (this.vaultAccessor) {
      await this.restorePersistedSessions();
    }
  }

  /**
   * Get the local static public key (for sharing with peers).
   */
  getLocalStaticPublicKey(): Uint8Array {
    if (!this.localStaticKeyPair) {
      throw new NoiseProtocolError(
        "Session manager not initialized",
        "SESSION_NOT_FOUND"
      );
    }
    return this.localStaticKeyPair.publicKey;
  }

  /**
   * Create a new session with a peer.
   *
   * @param peerNpub - Peer's Nostr public key
   * @param securityTier - Security tier for this session
   * @param remoteStaticKey - Peer's static public key (optional, for pre-shared key scenarios)
   * @returns Session ID
   */
  async createSession(
    peerNpub: string,
    securityTier: NoiseSecurityTier,
    remoteStaticKey?: Uint8Array
  ): Promise<string> {
    if (!this.localStaticKeyPair) {
      throw new NoiseProtocolError(
        "Session manager not initialized",
        "SESSION_NOT_FOUND"
      );
    }

    // Validate tier requirements
    if (securityTier === "hardened" && !this.vaultAccessor) {
      throw new NoiseProtocolError(
        "Hardened tier requires vault accessor",
        "VAULT_ACCESS_FAILED"
      );
    }

    // Generate ephemeral key pair for this session
    const localEphemeral = await generateX25519KeyPair();

    // Generate session ID
    const sessionId = crypto.randomUUID();

    // Create initial cipher states (will be updated during handshake)
    const initialKey = new Uint8Array(32);
    crypto.getRandomValues(initialKey);

    const session: NoiseSessionState = {
      sessionId,
      peerNpub,
      securityTier,
      localEphemeral,
      remoteStaticKey: remoteStaticKey ?? null,
      sendCipherState: deriveCipherState(initialKey, new Uint8Array(0), "send"),
      receiveCipherState: deriveCipherState(
        initialKey,
        new Uint8Array(0),
        "receive"
      ),
      handshakeComplete: false,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      rekeyCounter: 0,
    };

    // Clear the initial key material
    secureZero(initialKey);

    this.sessions.set(sessionId, session);

    // Persist if not ephemeral
    if (securityTier !== "ephemeral-standard" && this.vaultAccessor) {
      await this.persistSession(session);
    }

    return sessionId;
  }

  /**
   * Complete the Noise handshake with a peer.
   * Called after receiving the peer's ephemeral public key.
   *
   * @param sessionId - Session to complete handshake for
   * @param remoteEphemeralKey - Peer's ephemeral public key
   */
  async completeHandshake(
    sessionId: string,
    remoteEphemeralKey: Uint8Array
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NoiseProtocolError("Session not found", "SESSION_NOT_FOUND");
    }

    if (!this.localStaticKeyPair) {
      throw new NoiseProtocolError(
        "Session manager not initialized",
        "SESSION_NOT_FOUND"
      );
    }

    // Perform ECDH: local ephemeral × remote ephemeral
    const sharedSecret = x25519ECDH(
      session.localEphemeral.privateKey,
      remoteEphemeralKey
    );

    // Derive salt from handshake transcript (both ephemeral public keys) for binding
    // This ensures the derived keys are bound to this specific handshake context
    const transcriptInput = new Uint8Array([
      ...session.localEphemeral.publicKey,
      ...remoteEphemeralKey,
    ]);
    const transcriptHashBuffer = await crypto.subtle.digest(
      "SHA-256",
      transcriptInput
    );
    const salt = new Uint8Array(transcriptHashBuffer);

    session.sendCipherState = deriveCipherState(sharedSecret, salt, "send");
    session.receiveCipherState = deriveCipherState(
      sharedSecret,
      salt,
      "receive"
    );
    session.handshakeComplete = true;
    session.lastActivity = Date.now();

    // Clear the shared secret
    secureZero(sharedSecret);

    // Persist updated session if not ephemeral
    if (session.securityTier !== "ephemeral-standard" && this.vaultAccessor) {
      await this.persistSession(session);
    }
  }

  /**
   * Encrypt a message for a peer.
   *
   * @param sessionId - Session to use for encryption
   * @param plaintext - Message to encrypt
   * @returns Noise envelope ready for transport
   */
  async encrypt(
    sessionId: string,
    plaintext: Uint8Array
  ): Promise<NoiseEnvelope> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NoiseProtocolError("Session not found", "SESSION_NOT_FOUND");
    }

    if (!session.handshakeComplete) {
      throw new NoiseProtocolError(
        "Handshake not complete",
        "HANDSHAKE_INCOMPLETE"
      );
    }

    // Check rekey threshold
    if (session.rekeyCounter >= REKEY_THRESHOLD) {
      throw new NoiseProtocolError(
        "Rekey required - message limit reached",
        "REKEY_REQUIRED"
      );
    }

    // Encrypt the message
    const { ciphertext, nonce, nextNonce } = await encryptWithCipherState(
      session.sendCipherState,
      plaintext
    );

    // Update nonce from returned value and increment rekey counter
    session.sendCipherState.nonce = nextNonce;
    session.rekeyCounter++;
    session.lastActivity = Date.now();

    // Create envelope
    const envelope: NoiseEnvelope = {
      version: 1,
      securityTier: session.securityTier,
      ephemeralPubkey: bytesToHex(session.localEphemeral.publicKey),
      ciphertext: bytesToBase64(ciphertext),
      nonce: bytesToBase64(nonce),
    };

    return envelope;
  }

  /**
   * Decrypt a message from a peer.
   *
   * @param sessionId - Session to use for decryption
   * @param envelope - Noise envelope to decrypt
   * @returns Decrypted plaintext
   */
  async decrypt(
    sessionId: string,
    envelope: NoiseEnvelope
  ): Promise<Uint8Array> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NoiseProtocolError("Session not found", "SESSION_NOT_FOUND");
    }

    if (!session.handshakeComplete) {
      throw new NoiseProtocolError(
        "Handshake not complete",
        "HANDSHAKE_INCOMPLETE"
      );
    }

    const ciphertext = base64ToBytes(envelope.ciphertext);
    const nonce = base64ToBytes(envelope.nonce);

    // Validate nonce matches expected value for replay protection
    const expectedNonce = session.receiveCipherState.nonce;
    const incomingNonce = new DataView(nonce.buffer).getBigUint64(0, true);
    if (incomingNonce < expectedNonce) {
      throw new NoiseProtocolError(
        "Replay attack detected: nonce already used",
        "INVALID_NONCE"
      );
    }

    const plaintext = await decryptWithCipherState(
      session.receiveCipherState,
      ciphertext,
      nonce
    );

    // Increment receive nonce to track processed messages
    session.receiveCipherState.nonce += 1n;
    session.lastActivity = Date.now();

    return plaintext;
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): NoiseSessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Find a session by peer npub.
   */
  findSessionByPeer(peerNpub: string): NoiseSessionState | undefined {
    for (const session of this.sessions.values()) {
      if (session.peerNpub === peerNpub) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Close and clean up a session.
   *
   * @param sessionId - Session to close
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Securely zero key material
    secureZero(session.localEphemeral.privateKey);
    secureZero(session.sendCipherState.key);
    secureZero(session.receiveCipherState.key);

    // Remove from memory
    this.sessions.delete(sessionId);

    // Remove from vault if persisted
    if (session.securityTier !== "ephemeral-standard" && this.vaultAccessor) {
      await this.vaultAccessor.remove(`${VAULT_SESSION_PREFIX}${sessionId}`);
    }
  }

  /**
   * Clean up expired sessions.
   */
  async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();

    for (const [sessionId, session] of this.sessions) {
      const timeout =
        session.securityTier === "ephemeral-standard"
          ? EPHEMERAL_SESSION_TIMEOUT_MS
          : EVERLASTING_SESSION_TIMEOUT_MS;

      if (now - session.lastActivity > timeout) {
        await this.closeSession(sessionId);
      }
    }
  }

  // ===========================================================================
  // Phase 5: Advanced Handshake Patterns (XX, IK, NK)
  // ===========================================================================

  /**
   * Initiate an XX handshake with a peer (full mutual authentication).
   * XX: 3-message handshake where both parties are initially unknown.
   * Pattern: → e, ← e·ee·s·es, → s·se
   *
   * @param peerNpub - Peer's Nostr public key
   * @param config - Session configuration (optional)
   * @returns Session ID and first handshake message
   */
  async initiateXXHandshake(
    peerNpub: string,
    config?: Partial<NoiseSessionConfig>
  ): Promise<{ sessionId: string; message: NoiseTransportMessage }> {
    const sessionConfig = this.mergeConfig(config, "XX");
    return this.initiateHandshake(peerNpub, "XX", sessionConfig);
  }

  /**
   * Initiate an IK handshake with a peer (initiator knows responder's key).
   * IK: 2-message handshake when we know the peer's static key.
   * Pattern: → e·es·s·ss, ← e·ee·se
   *
   * @param peerNpub - Peer's Nostr public key
   * @param remoteStaticKey - Peer's pre-shared static public key
   * @param config - Session configuration (optional)
   * @returns Session ID and first handshake message
   */
  async initiateIKHandshake(
    peerNpub: string,
    remoteStaticKey: Uint8Array,
    config?: Partial<NoiseSessionConfig>
  ): Promise<{ sessionId: string; message: NoiseTransportMessage }> {
    const sessionConfig = this.mergeConfig(config, "IK", remoteStaticKey);
    return this.initiateHandshake(peerNpub, "IK", sessionConfig);
  }

  /**
   * Initiate an NK handshake with a peer (no authentication of initiator).
   * NK: 2-message handshake when only responder's key is known.
   * Pattern: → e·es, ← e·ee
   *
   * @param peerNpub - Peer's Nostr public key
   * @param remoteStaticKey - Peer's pre-shared static public key
   * @param config - Session configuration (optional)
   * @returns Session ID and first handshake message
   */
  async initiateNKHandshake(
    peerNpub: string,
    remoteStaticKey: Uint8Array,
    config?: Partial<NoiseSessionConfig>
  ): Promise<{ sessionId: string; message: NoiseTransportMessage }> {
    const sessionConfig = this.mergeConfig(config, "NK", remoteStaticKey);
    return this.initiateHandshake(peerNpub, "NK", sessionConfig);
  }

  /**
   * Process an incoming handshake message.
   * Handles both initiator and responder roles for all patterns.
   *
   * @param sessionId - Existing session ID (for continuation) or undefined for new
   * @param message - Incoming handshake message
   * @param peerNpub - Peer's Nostr public key (required for new sessions)
   * @returns Processing result with optional response message
   */
  async processHandshakeMessage(
    sessionId: string | undefined,
    message: NoiseTransportMessage,
    peerNpub?: string
  ): Promise<NoiseMessageResult> {
    try {
      // If this is a new session (responder receiving first message)
      if (!sessionId && message.handshakeIndex === 0 && peerNpub) {
        return this.handleFirstHandshakeMessage(message, peerNpub);
      }

      // Continuation of existing session
      if (!sessionId) {
        return {
          success: false,
          error: "Session ID required for continuation",
        };
      }

      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: "Session not found" };
      }

      if (!session.handshakeState) {
        return { success: false, error: "No active handshake state" };
      }

      return this.continueHandshake(session, message);
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Handshake processing failed",
      };
    }
  }

  /**
   * Get the current handshake state for a session.
   *
   * @param sessionId - Session ID
   * @returns Handshake state or undefined
   */
  getHandshakeState(sessionId: string): NoiseHandshakeState | null | undefined {
    const session = this.sessions.get(sessionId);
    return session?.handshakeState;
  }

  /**
   * Rekey a session (generate new cipher keys from existing state).
   *
   * @param sessionId - Session to rekey
   */
  async rekeySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NoiseProtocolError("Session not found", "SESSION_NOT_FOUND");
    }

    if (!session.handshakeComplete) {
      throw new NoiseProtocolError(
        "Cannot rekey - handshake not complete",
        "HANDSHAKE_INCOMPLETE"
      );
    }

    // Derive salt from combined cipher keys to bind rekey to current session state
    const saltInput = new Uint8Array([
      ...session.sendCipherState.key,
      ...session.receiveCipherState.key,
    ]);
    const saltHashBuffer = await crypto.subtle.digest("SHA-256", saltInput);
    const salt = new Uint8Array(saltHashBuffer);

    const newSendKey = hkdfExpand(
      session.sendCipherState.key,
      salt,
      "rekey",
      32
    );
    const newReceiveKey = hkdfExpand(
      session.receiveCipherState.key,
      salt,
      "rekey",
      32
    );

    // Securely zero old keys
    secureZero(session.sendCipherState.key);
    secureZero(session.receiveCipherState.key);

    // Update with new keys, reset nonces
    session.sendCipherState.key = newSendKey;
    session.sendCipherState.nonce = 0n;
    session.receiveCipherState.key = newReceiveKey;
    session.receiveCipherState.nonce = 0n;
    session.rekeyCounter = 0;
    session.lastRekeyAt = Date.now();
    session.lastActivity = Date.now();

    // Persist if not ephemeral
    if (session.securityTier !== "ephemeral-standard" && this.vaultAccessor) {
      await this.persistSession(session);
    }
  }

  /**
   * Check if a session needs rekeying based on config thresholds.
   *
   * @param sessionId - Session to check
   * @returns Whether rekey is needed
   */
  needsRekey(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.handshakeComplete) {
      return false;
    }

    const config = session.config || DEFAULT_NOISE_SESSION_CONFIG;
    const messageThreshold = config.rekeyAfterMessages ?? 100;
    const timeThreshold = config.rekeyAfterSeconds ?? 3600;

    // Check message count
    if (session.rekeyCounter >= messageThreshold) {
      return true;
    }

    // Check time since last rekey
    const lastRekey = session.lastRekeyAt || session.createdAt;
    const secondsSinceRekey = (Date.now() - lastRekey) / 1000;
    if (secondsSinceRekey >= timeThreshold) {
      return true;
    }

    return false;
  }

  // ===========================================================================
  // Private Methods - Phase 5 Handshake Implementation
  // ===========================================================================

  /**
   * Merge user config with defaults.
   */
  private mergeConfig(
    config: Partial<NoiseSessionConfig> | undefined,
    pattern: NoiseHandshakePattern,
    remoteStaticKey?: Uint8Array
  ): NoiseSessionConfig {
    return {
      handshakePattern: pattern,
      securityTier:
        config?.securityTier ?? DEFAULT_NOISE_SESSION_CONFIG.securityTier,
      rekeyAfterMessages:
        config?.rekeyAfterMessages ??
        DEFAULT_NOISE_SESSION_CONFIG.rekeyAfterMessages,
      rekeyAfterSeconds:
        config?.rekeyAfterSeconds ??
        DEFAULT_NOISE_SESSION_CONFIG.rekeyAfterSeconds,
      allowFallback:
        config?.allowFallback ?? DEFAULT_NOISE_SESSION_CONFIG.allowFallback,
      remoteStaticKey,
    };
  }

  /**
   * Common handshake initiation logic.
   */
  private async initiateHandshake(
    peerNpub: string,
    pattern: NoiseHandshakePattern,
    config: NoiseSessionConfig
  ): Promise<{ sessionId: string; message: NoiseTransportMessage }> {
    if (!this.localStaticKeyPair) {
      throw new NoiseProtocolError(
        "Session manager not initialized",
        "SESSION_NOT_FOUND"
      );
    }

    // Validate IK/NK require remote static key
    if ((pattern === "IK" || pattern === "NK") && !config.remoteStaticKey) {
      throw new NoiseProtocolError(
        `${pattern} pattern requires remote static key`,
        "HANDSHAKE_INCOMPLETE" // Using closest existing error code
      );
    }

    // Generate ephemeral key pair
    const localEphemeral = await generateX25519KeyPair();
    const sessionId = crypto.randomUUID();

    // Initialize handshake state
    const handshakeState: NoiseHandshakeState = {
      pattern,
      role: "initiator",
      messageIndex: 0,
      totalMessages: this.getPatternMessageCount(pattern),
      complete: false,
      localEphemeral,
      localStatic: this.localStaticKeyPair,
      remoteStatic: config.remoteStaticKey,
      chainingKey: new Uint8Array(32),
      handshakeHash: new Uint8Array(32),
    };

    // Initialize chaining key with protocol name
    const protocolName = new TextEncoder().encode(
      `Noise_${pattern}_25519_ChaChaPoly_SHA256`
    );
    const hashBuffer = await crypto.subtle.digest("SHA-256", protocolName);
    handshakeState.chainingKey = new Uint8Array(hashBuffer);
    handshakeState.handshakeHash = new Uint8Array(hashBuffer);

    // Create initial cipher states (placeholder until handshake completes)
    const initialKey = new Uint8Array(32);

    const session: NoiseSessionState = {
      sessionId,
      peerNpub,
      securityTier: config.securityTier,
      localEphemeral,
      remoteStaticKey: config.remoteStaticKey ?? null,
      sendCipherState: deriveCipherState(initialKey, new Uint8Array(0), "send"),
      receiveCipherState: deriveCipherState(
        initialKey,
        new Uint8Array(0),
        "receive"
      ),
      handshakeComplete: false,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      rekeyCounter: 0,
      handshakePattern: pattern,
      handshakeState,
      config,
    };

    // Clear the initial key material (placeholder keys replaced during handshake)
    secureZero(initialKey);

    this.sessions.set(sessionId, session);

    // Generate first handshake message based on pattern
    const payload = await this.generateHandshakePayload(
      session,
      handshakeState,
      0
    );

    const message: NoiseTransportMessage = {
      type: "handshake",
      sessionId,
      pattern,
      handshakeIndex: 0,
      payload: bytesToBase64(payload),
      timestamp: Date.now(),
    };

    // Update handshake state
    handshakeState.messageIndex = 1;

    return { sessionId, message };
  }

  /**
   * Handle the first handshake message (responder role).
   */
  private async handleFirstHandshakeMessage(
    message: NoiseTransportMessage,
    peerNpub: string
  ): Promise<NoiseMessageResult> {
    if (!message.pattern) {
      return { success: false, error: "Missing pattern in handshake message" };
    }

    if (!this.localStaticKeyPair) {
      return { success: false, error: "Session manager not initialized" };
    }

    const pattern = message.pattern;
    const localEphemeral = await generateX25519KeyPair();
    const sessionId = crypto.randomUUID();

    // Initialize handshake state as responder
    const handshakeState: NoiseHandshakeState = {
      pattern,
      role: "responder",
      messageIndex: 0,
      totalMessages: this.getPatternMessageCount(pattern),
      complete: false,
      localEphemeral,
      localStatic: this.localStaticKeyPair,
      chainingKey: new Uint8Array(32),
      handshakeHash: new Uint8Array(32),
    };

    // Initialize chaining key
    const protocolName = new TextEncoder().encode(
      `Noise_${pattern}_25519_ChaChaPoly_SHA256`
    );
    const hashBuffer = await crypto.subtle.digest("SHA-256", protocolName);
    handshakeState.chainingKey = new Uint8Array(hashBuffer);
    handshakeState.handshakeHash = new Uint8Array(hashBuffer);

    // Create session
    const session: NoiseSessionState = {
      sessionId,
      peerNpub,
      securityTier: "ephemeral-standard",
      localEphemeral,
      remoteStaticKey: null,
      sendCipherState: deriveCipherState(
        new Uint8Array(32),
        new Uint8Array(0),
        "send"
      ),
      receiveCipherState: deriveCipherState(
        new Uint8Array(32),
        new Uint8Array(0),
        "receive"
      ),
      handshakeComplete: false,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      rekeyCounter: 0,
      handshakePattern: pattern,
      handshakeState,
      config: {
        handshakePattern: pattern,
        securityTier: "ephemeral-standard",
        rekeyAfterMessages: DEFAULT_NOISE_SESSION_CONFIG.rekeyAfterMessages,
        rekeyAfterSeconds: DEFAULT_NOISE_SESSION_CONFIG.rekeyAfterSeconds,
        allowFallback: DEFAULT_NOISE_SESSION_CONFIG.allowFallback,
      },
    };

    this.sessions.set(sessionId, session);

    // Process the incoming message
    const incomingPayload = base64ToBytes(message.payload);
    await this.processHandshakePayload(
      session,
      handshakeState,
      incomingPayload,
      0
    );
    handshakeState.messageIndex = 1;

    // Generate response if needed
    if (handshakeState.messageIndex < handshakeState.totalMessages) {
      const responsePayload = await this.generateHandshakePayload(
        session,
        handshakeState,
        handshakeState.messageIndex
      );

      const response: NoiseTransportMessage = {
        type: "handshake",
        sessionId,
        pattern,
        handshakeIndex: handshakeState.messageIndex,
        payload: bytesToBase64(responsePayload),
        timestamp: Date.now(),
      };

      handshakeState.messageIndex++;

      return {
        success: true,
        sessionId,
        response,
        handshakeComplete: handshakeState.complete,
      };
    }

    return {
      success: true,
      sessionId,
      handshakeComplete: handshakeState.complete,
    };
  }

  /**
   * Continue an existing handshake.
   */
  private async continueHandshake(
    session: NoiseSessionState,
    message: NoiseTransportMessage
  ): Promise<NoiseMessageResult> {
    const handshakeState = session.handshakeState;
    if (!handshakeState) {
      return { success: false, error: "No handshake state" };
    }

    // Validate message index
    if (message.handshakeIndex !== handshakeState.messageIndex) {
      return {
        success: false,
        error: `Unexpected message index: expected ${handshakeState.messageIndex}, got ${message.handshakeIndex}`,
      };
    }

    // Process incoming payload
    const incomingPayload = base64ToBytes(message.payload);
    await this.processHandshakePayload(
      session,
      handshakeState,
      incomingPayload,
      message.handshakeIndex ?? 0
    );
    handshakeState.messageIndex++;

    // Check if handshake is complete
    if (handshakeState.messageIndex >= handshakeState.totalMessages) {
      await this.finalizeHandshake(session, handshakeState);
      return {
        success: true,
        sessionId: session.sessionId,
        handshakeComplete: true,
      };
    }

    // Generate response if it's our turn
    const shouldRespond =
      (handshakeState.role === "initiator" &&
        handshakeState.messageIndex % 2 === 0) ||
      (handshakeState.role === "responder" &&
        handshakeState.messageIndex % 2 === 1);

    if (shouldRespond) {
      const responsePayload = await this.generateHandshakePayload(
        session,
        handshakeState,
        handshakeState.messageIndex
      );

      const response: NoiseTransportMessage = {
        type: "handshake",
        sessionId: session.sessionId,
        pattern: handshakeState.pattern,
        handshakeIndex: handshakeState.messageIndex,
        payload: bytesToBase64(responsePayload),
        timestamp: Date.now(),
      };

      handshakeState.messageIndex++;

      // Check again after our response
      if (handshakeState.messageIndex >= handshakeState.totalMessages) {
        await this.finalizeHandshake(session, handshakeState);
        return {
          success: true,
          sessionId: session.sessionId,
          response,
          handshakeComplete: true,
        };
      }

      return {
        success: true,
        sessionId: session.sessionId,
        response,
        handshakeComplete: false,
      };
    }

    return {
      success: true,
      sessionId: session.sessionId,
      handshakeComplete: false,
    };
  }

  /**
   * Get the number of messages required for a pattern.
   */
  private getPatternMessageCount(pattern: NoiseHandshakePattern): number {
    switch (pattern) {
      case "XX":
        return 3;
      case "IK":
      case "NK":
        return 2;
      default:
        return 2;
    }
  }

  /**
   * Generate handshake payload for a given message index.
   */
  private async generateHandshakePayload(
    _session: NoiseSessionState,
    state: NoiseHandshakeState,
    messageIndex: number
  ): Promise<Uint8Array> {
    // For simplicity, we encode ephemeral public key + optional encrypted static key
    const parts: Uint8Array[] = [];

    // All patterns: first message from initiator contains ephemeral public key
    if (messageIndex === 0 && state.role === "initiator") {
      parts.push(state.localEphemeral!.publicKey);

      // IK pattern: encrypt and send static key using cipher derived from e·es DH
      // Per Noise Protocol spec section 7.3: initiator's static key is encrypted
      if (state.pattern === "IK" && state.localStatic && state.remoteStatic) {
        const sharedSecret = x25519ECDH(
          state.localEphemeral!.privateKey,
          state.remoteStatic
        );
        await this.mixKey(state, sharedSecret);

        // Derive temporary cipher state from chaining key for static key encryption
        // This binds the encrypted static key to the handshake transcript
        const tempCipherKey = hkdfExpand(
          state.chainingKey!,
          state.handshakeHash!,
          "ik-static-enc",
          32
        );
        const tempCipherState: NoiseCipherState = {
          key: tempCipherKey,
          nonce: 0n,
        };

        // Encrypt the static public key with AEAD (provides identity hiding)
        const { ciphertext: encryptedStatic, nonce: staticNonce } =
          await encryptWithCipherState(
            tempCipherState,
            state.localStatic.publicKey,
            state.handshakeHash // Use handshake hash as associated data
          );

        // Clear temporary key material
        secureZero(tempCipherKey);

        // Push encrypted static key followed by nonce
        // Format: [32-byte ciphertext + 16-byte tag][12-byte nonce] = 60 bytes
        parts.push(encryptedStatic);
        parts.push(staticNonce);
      }

      // NK pattern: perform DH with known remote static
      if (state.pattern === "NK" && state.remoteStatic) {
        const sharedSecret = x25519ECDH(
          state.localEphemeral!.privateKey,
          state.remoteStatic
        );
        await this.mixKey(state, sharedSecret);
      }
    }

    // Response messages include responder's ephemeral
    if (messageIndex === 1 && state.role === "responder") {
      parts.push(state.localEphemeral!.publicKey);

      // Perform ee DH if we have remote ephemeral
      if (state.remoteEphemeral) {
        const eeSecret = x25519ECDH(
          state.localEphemeral!.privateKey,
          state.remoteEphemeral
        );
        await this.mixKey(state, eeSecret);
      }

      // XX pattern: also send static key
      if (state.pattern === "XX" && state.localStatic) {
        parts.push(state.localStatic.publicKey);
        // Perform es DH
        if (state.remoteEphemeral) {
          const esSecret = x25519ECDH(
            state.localStatic.privateKey,
            state.remoteEphemeral
          );
          await this.mixKey(state, esSecret);
        }
      }
    }

    // Final message in XX: initiator sends static key
    if (
      messageIndex === 2 &&
      state.role === "initiator" &&
      state.pattern === "XX"
    ) {
      if (state.localStatic) {
        parts.push(state.localStatic.publicKey);
        // Perform se DH
        if (state.remoteStatic) {
          const seSecret = x25519ECDH(
            state.localStatic.privateKey,
            state.remoteStatic
          );
          await this.mixKey(state, seSecret);
        }
      }
    }

    // Concatenate all parts
    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }

    return result;
  }

  /**
   * Process incoming handshake payload.
   */
  private async processHandshakePayload(
    session: NoiseSessionState,
    state: NoiseHandshakeState,
    payload: Uint8Array,
    messageIndex: number
  ): Promise<void> {
    let offset = 0;

    // First message from initiator: extract ephemeral key
    if (messageIndex === 0 && state.role === "responder") {
      state.remoteEphemeral = payload.slice(offset, offset + 32);
      offset += 32;

      // NK pattern: perform es DH with our static key
      if (state.pattern === "NK" && state.localStatic) {
        const esSecret = x25519ECDH(
          state.localStatic.privateKey,
          state.remoteEphemeral
        );
        await this.mixKey(state, esSecret);
      }

      // IK pattern: decrypt the encrypted static key
      // Per Noise Protocol spec: e, es, s (encrypted), ss
      // Encrypted static format: [48-byte ciphertext+tag][12-byte nonce] = 60 bytes total
      if (state.pattern === "IK" && payload.length >= 92 && state.localStatic) {
        // First perform es DH (responder's static × initiator's ephemeral)
        const esSecret = x25519ECDH(
          state.localStatic.privateKey,
          state.remoteEphemeral
        );
        await this.mixKey(state, esSecret);

        // Derive the same temporary cipher state used for encryption
        const tempCipherKey = hkdfExpand(
          state.chainingKey!,
          state.handshakeHash!,
          "ik-static-enc",
          32
        );
        const tempCipherState: NoiseCipherState = {
          key: tempCipherKey,
          nonce: 0n,
        };

        // Extract encrypted static key (48 bytes) and nonce (12 bytes)
        const encryptedStatic = payload.slice(offset, offset + 48);
        offset += 48;
        const staticNonce = payload.slice(offset, offset + 12);
        offset += 12;

        // Decrypt the static public key using the handshake hash as AAD
        try {
          state.remoteStatic = await decryptWithCipherState(
            tempCipherState,
            encryptedStatic,
            staticNonce,
            state.handshakeHash // Same AAD used during encryption
          );
          session.remoteStaticKey = state.remoteStatic;
        } finally {
          // Clear temporary key material
          secureZero(tempCipherKey);
        }

        // Now perform ss DH
        const ssSecret = x25519ECDH(
          state.localStatic.privateKey,
          state.remoteStatic
        );
        await this.mixKey(state, ssSecret);
      }
    }

    // Response from responder: extract their ephemeral (and static for XX)
    if (messageIndex === 1 && state.role === "initiator") {
      state.remoteEphemeral = payload.slice(offset, offset + 32);
      offset += 32;

      // Perform ee DH
      const eeSecret = x25519ECDH(
        state.localEphemeral!.privateKey,
        state.remoteEphemeral
      );
      await this.mixKey(state, eeSecret);

      // XX pattern: extract static key
      if (state.pattern === "XX" && payload.length >= 64) {
        state.remoteStatic = payload.slice(offset, offset + 32);
        session.remoteStaticKey = state.remoteStatic;
        offset += 32;

        // Perform es DH (initiator's ephemeral × responder's static)
        const esSecret = x25519ECDH(
          state.localEphemeral!.privateKey,
          state.remoteStatic
        );
        await this.mixKey(state, esSecret);
      }

      // IK pattern: perform se DH
      if (
        state.pattern === "IK" &&
        state.remoteEphemeral &&
        state.localStatic
      ) {
        const seSecret = x25519ECDH(
          state.localStatic.privateKey,
          state.remoteEphemeral
        );
        await this.mixKey(state, seSecret);
      }
    }

    // Final XX message: responder receives initiator's static
    if (
      messageIndex === 2 &&
      state.role === "responder" &&
      state.pattern === "XX"
    ) {
      state.remoteStatic = payload.slice(offset, offset + 32);
      session.remoteStaticKey = state.remoteStatic;
      offset += 32;

      // Perform se DH (responder's ephemeral × initiator's static)
      if (state.localEphemeral) {
        const seSecret = x25519ECDH(
          state.localEphemeral.privateKey,
          state.remoteStatic
        );
        await this.mixKey(state, seSecret);
      }
    }
  }

  /**
   * Mix a new key into the handshake state using HKDF.
   * Follows Noise Protocol specification: MixKey(ck, input_key_material)
   * where chainingKey is used as the salt (per HKDF) and inputKey is the IKM.
   */
  private async mixKey(
    state: NoiseHandshakeState,
    inputKey: Uint8Array
  ): Promise<void> {
    // Noise spec: HKDF(chainingKey, inputKey) → newChainingKey
    // chainingKey is the salt (binding to handshake context), inputKey is the IKM
    const newChainingKey = hkdfExpand(inputKey, state.chainingKey!, "ck", 32);

    // Securely zero old chaining key
    if (state.chainingKey) {
      secureZero(state.chainingKey);
    }
    state.chainingKey = newChainingKey;

    // Also update handshake hash (MixHash in Noise spec)
    const hashInput = new Uint8Array([...state.handshakeHash!, ...inputKey]);
    const hashBuffer = await crypto.subtle.digest("SHA-256", hashInput);
    if (state.handshakeHash) {
      secureZero(state.handshakeHash);
    }
    state.handshakeHash = new Uint8Array(hashBuffer);

    // Securely zero input
    secureZero(inputKey);
  }

  /**
   * Finalize handshake and derive session cipher states.
   * Uses handshakeHash as salt to bind derived keys to the full handshake transcript.
   */
  private async finalizeHandshake(
    session: NoiseSessionState,
    state: NoiseHandshakeState
  ): Promise<void> {
    // Derive final cipher keys from chaining key using handshakeHash as salt
    // This binds the session keys to the complete handshake transcript
    const salt = state.handshakeHash!;

    const sendKey = hkdfExpand(state.chainingKey!, salt, "send", 32);
    const receiveKey = hkdfExpand(state.chainingKey!, salt, "receive", 32);

    // Clean up old cipher states
    secureZero(session.sendCipherState.key);
    secureZero(session.receiveCipherState.key);

    // Set final cipher states (swap for responder)
    if (state.role === "initiator") {
      session.sendCipherState = { key: sendKey, nonce: 0n };
      session.receiveCipherState = { key: receiveKey, nonce: 0n };
    } else {
      session.sendCipherState = { key: receiveKey, nonce: 0n };
      session.receiveCipherState = { key: sendKey, nonce: 0n };
    }

    session.handshakeComplete = true;
    state.complete = true;
    session.handshakeState = null; // Clear handshake state
    session.lastActivity = Date.now();

    // Securely zero handshake keys
    if (state.chainingKey) secureZero(state.chainingKey);
    if (state.handshakeHash) secureZero(state.handshakeHash);
    if (state.localEphemeral) secureZero(state.localEphemeral.privateKey);

    // Persist if not ephemeral
    if (session.securityTier !== "ephemeral-standard" && this.vaultAccessor) {
      await this.persistSession(session);
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Persist a session to the vault.
   */
  private async persistSession(session: NoiseSessionState): Promise<void> {
    if (!this.vaultAccessor) {
      return;
    }

    const serialized: SerializedNoiseSession = {
      sessionId: session.sessionId,
      peerNpub: session.peerNpub,
      securityTier: session.securityTier,
      localEphemeralPubkey: bytesToBase64(session.localEphemeral.publicKey),
      localEphemeralPrivkey: bytesToBase64(session.localEphemeral.privateKey),
      remoteStaticKey: session.remoteStaticKey
        ? bytesToBase64(session.remoteStaticKey)
        : null,
      sendCipherKey: bytesToBase64(session.sendCipherState.key),
      sendCipherNonce: session.sendCipherState.nonce.toString(),
      receiveCipherKey: bytesToBase64(session.receiveCipherState.key),
      receiveCipherNonce: session.receiveCipherState.nonce.toString(),
      handshakeComplete: session.handshakeComplete,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      rekeyCounter: session.rekeyCounter,
    };

    await this.vaultAccessor.set(
      `${VAULT_SESSION_PREFIX}${session.sessionId}`,
      JSON.stringify(serialized)
    );
  }

  /**
   * Restore persisted sessions from the vault.
   */
  private async restorePersistedSessions(): Promise<void> {
    if (!this.vaultAccessor) {
      return;
    }

    const keys = await this.vaultAccessor.keys();
    const sessionKeys = keys.filter((k) => k.startsWith(VAULT_SESSION_PREFIX));

    for (const key of sessionKeys) {
      try {
        const data = await this.vaultAccessor.get(key);
        if (!data) continue;

        const serialized: SerializedNoiseSession = JSON.parse(data);
        const session: NoiseSessionState = {
          sessionId: serialized.sessionId,
          peerNpub: serialized.peerNpub,
          securityTier: serialized.securityTier,
          localEphemeral: {
            publicKey: base64ToBytes(serialized.localEphemeralPubkey),
            privateKey: base64ToBytes(serialized.localEphemeralPrivkey),
          },
          remoteStaticKey: serialized.remoteStaticKey
            ? base64ToBytes(serialized.remoteStaticKey)
            : null,
          sendCipherState: {
            key: base64ToBytes(serialized.sendCipherKey),
            nonce: BigInt(serialized.sendCipherNonce),
          },
          receiveCipherState: {
            key: base64ToBytes(serialized.receiveCipherKey),
            nonce: BigInt(serialized.receiveCipherNonce),
          },
          handshakeComplete: serialized.handshakeComplete,
          createdAt: serialized.createdAt,
          lastActivity: serialized.lastActivity,
          rekeyCounter: serialized.rekeyCounter,
        };

        this.sessions.set(session.sessionId, session);
      } catch {
        // Skip corrupted sessions
        console.warn(`Failed to restore session from ${key}`);
      }
    }
  }

  /**
   * Destroy the singleton instance (for testing).
   */
  static destroy(): void {
    if (NoiseSessionManager.instance) {
      // Clear all sessions
      for (const session of NoiseSessionManager.instance.sessions.values()) {
        secureZero(session.localEphemeral.privateKey);
        secureZero(session.sendCipherState.key);
        secureZero(session.receiveCipherState.key);
      }
      NoiseSessionManager.instance.sessions.clear();

      // Clear static key pair
      if (NoiseSessionManager.instance.localStaticKeyPair) {
        secureZero(NoiseSessionManager.instance.localStaticKeyPair.privateKey);
      }

      NoiseSessionManager.instance = null;
    }
  }
}

// =============================================================================
// Vault Accessor Interface
// =============================================================================

/**
 * Interface for vault storage operations.
 * Implemented by ClientSessionVault or similar secure storage.
 */
export interface VaultAccessor {
  /** Get a value by key */
  get(key: string): Promise<string | null>;
  /** Set a value by key */
  set(key: string, value: string): Promise<void>;
  /** Remove a value by key */
  remove(key: string): Promise<void>;
  /** List all keys */
  keys(): Promise<string[]>;
}
