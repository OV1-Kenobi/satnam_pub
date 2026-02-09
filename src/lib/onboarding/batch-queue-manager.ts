/**
 * Batch Queue Manager
 * @description Manages high-volume physical peer onboarding queue with parallel NFC programming
 *
 * Features:
 * - Priority queue management (FIFO with optional priority override)
 * - Parallel NFC reader support (multiple readers simultaneously)
 * - Progress tracking with real-time callbacks
 * - Pause/resume capability with state persistence
 * - Error recovery with retry logic
 * - IndexedDB persistence for queue state
 *
 * @compliance Privacy-first, zero-knowledge, Master Context compliant
 */

import type {
  OnboardingParticipant,
  OnboardingStep,
  ParticipantStatus,
} from "../../types/onboarding";
import {
  createBatchAttestations,
  type BatchAttestationOptions,
  type BatchAttestationResult,
  type AttestationRequest,
} from "../attestation-manager";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Queued participant with priority and retry tracking
 */
export interface QueuedParticipant extends OnboardingParticipant {
  /** Queue position (0-indexed) */
  queuePosition: number;
  /** Priority level (higher = processed first) */
  priority: number;
  /** Number of retry attempts for failed operations */
  retryCount: number;
  /** Maximum retry attempts allowed */
  maxRetries: number;
  /** Estimated wait time in seconds */
  estimatedWaitTime?: number;
  /** Assigned NFC reader ID (if applicable) */
  assignedReaderId?: string;
  /** Error details from last failed operation */
  lastError?: string;
}

/**
 * NFC reader state tracking
 */
export interface NFCReaderState {
  /** Unique reader identifier */
  readerId: string;
  /** Whether reader is currently available */
  isAvailable: boolean;
  /** Participant currently assigned to this reader */
  currentParticipantId?: string;
  /** Last successful operation timestamp */
  lastActiveAt?: number;
  /** Reader connection status */
  isConnected: boolean;
  /** Reader error state */
  error?: string;
}

/**
 * Batch queue state (persisted to IndexedDB)
 */
export interface BatchQueueState {
  /** Session ID this queue belongs to */
  sessionId: string;
  /** Queue of participants (ordered by priority then FIFO) */
  queue: QueuedParticipant[];
  /** Completed participants */
  completed: QueuedParticipant[];
  /** Failed participants (exceeded retry limit) */
  failed: QueuedParticipant[];
  /** Available NFC readers */
  nfcReaders: NFCReaderState[];
  /** Whether queue is currently paused */
  isPaused: boolean;
  /** Current processing status */
  status: "idle" | "processing" | "paused" | "completed";
  /** Last updated timestamp */
  lastUpdated: number;
  /** Total participants processed */
  totalProcessed: number;
  /** Total participants in queue */
  totalQueued: number;
}

/**
 * Queue progress tracking
 */
export interface QueueProgress {
  /** Total participants in queue */
  total: number;
  /** Participants completed */
  completed: number;
  /** Participants currently processing */
  inProgress: number;
  /** Participants failed */
  failed: number;
  /** Participants pending */
  pending: number;
  /** Overall completion percentage (0-100) */
  percentComplete: number;
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining?: number;
  /** Average time per participant in seconds */
  averageTimePerParticipant?: number;
}

/**
 * Batch processing options
 */
export interface BatchProcessingOptions {
  /** Maximum concurrent participants to process */
  concurrency?: number;
  /** Maximum retry attempts per participant */
  maxRetries?: number;
  /** Progress callback */
  onProgress?: (progress: QueueProgress) => void;
  /** Participant completion callback */
  onParticipantComplete?: (participant: QueuedParticipant) => void;
  /** Participant failure callback */
  onParticipantFailed?: (participant: QueuedParticipant, error: string) => void;
  /** Whether to stop processing on first error */
  stopOnError?: boolean;
  /** Enable parallel NFC programming */
  enableParallelNFC?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_PRIORITY = 0;
const INDEXEDDB_NAME = "satnam_onboarding_queue";
const INDEXEDDB_VERSION = 1;
const QUEUE_STORE_NAME = "queue_state";

// ============================================================================
// IndexedDB Helper Functions
// ============================================================================

/**
 * Open IndexedDB connection
 */
async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create queue state store if it doesn't exist
      if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
        const store = db.createObjectStore(QUEUE_STORE_NAME, {
          keyPath: "sessionId",
        });
        store.createIndex("lastUpdated", "lastUpdated", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
    };
  });
}

/**
 * Save queue state to IndexedDB
 */
async function saveQueueState(state: BatchQueueState): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([QUEUE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(QUEUE_STORE_NAME);
    const request = store.put(state);

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

/**
 * Load queue state from IndexedDB
 */
async function loadQueueState(
  sessionId: string,
): Promise<BatchQueueState | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([QUEUE_STORE_NAME], "readonly");
    const store = transaction.objectStore(QUEUE_STORE_NAME);
    const request = store.get(sessionId);

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };
  });
}

/**
 * Clear queue state from IndexedDB
 */
async function clearQueueState(sessionId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([QUEUE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(QUEUE_STORE_NAME);
    const request = store.delete(sessionId);

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

// ============================================================================
// Batch Queue Manager Class
// ============================================================================

/**
 * Batch Queue Manager
 * Manages high-volume onboarding queue with parallel NFC programming
 */
export class BatchQueueManager {
  private state: BatchQueueState;
  private processingPromise: Promise<void> | null = null;
  private startTimes: Map<string, number> = new Map();
  private completedDurations: number[] = [];
  private options: BatchProcessingOptions = {};

  constructor(sessionId: string) {
    this.state = {
      sessionId,
      queue: [],
      completed: [],
      failed: [],
      nfcReaders: [],
      isPaused: false,
      status: "idle",
      lastUpdated: Date.now(),
      totalProcessed: 0,
      totalQueued: 0,
    };
  }

  /**
   * Initialize queue manager (load persisted state if exists)
   */
  async initialize(): Promise<void> {
    try {
      const savedState = await loadQueueState(this.state.sessionId);
      if (savedState) {
        this.state = savedState;
        console.log(
          `[BatchQueueManager] Loaded persisted state for session ${this.state.sessionId}`,
        );
      }
    } catch (error) {
      console.warn(
        `[BatchQueueManager] Failed to load persisted state, starting fresh:`,
        error,
      );
    }
  }

  /**
   * Add participant to queue
   */
  async addParticipant(
    participant: OnboardingParticipant,
    priority: number = DEFAULT_PRIORITY,
  ): Promise<void> {
    const queuedParticipant: QueuedParticipant = {
      ...participant,
      queuePosition: this.state.queue.length,
      priority,
      retryCount: 0,
      maxRetries: this.options.maxRetries || DEFAULT_MAX_RETRIES,
    };

    this.state.queue.push(queuedParticipant);
    this.state.totalQueued++;
    this.reorderQueue();
    await this.persistState();

    console.log(
      `[BatchQueueManager] Added participant ${participant.participantId} to queue (priority: ${priority})`,
    );
  }

  /**
   * Remove participant from queue
   */
  async removeParticipant(participantId: string): Promise<void> {
    const index = this.state.queue.findIndex(
      (p) => p.participantId === participantId,
    );
    if (index !== -1) {
      this.state.queue.splice(index, 1);
      this.reorderQueue();
      await this.persistState();
      console.log(
        `[BatchQueueManager] Removed participant ${participantId} from queue`,
      );
    }
  }

  /**
   * Update participant status
   */
  async updateParticipantStatus(
    participantId: string,
    status: ParticipantStatus,
  ): Promise<void> {
    const participant = this.state.queue.find(
      (p) => p.participantId === participantId,
    );
    if (participant) {
      participant.status = status;
      await this.persistState();
    }
  }

  /**
   * Get queue position for participant
   */
  getQueuePosition(participantId: string): number {
    const index = this.state.queue.findIndex(
      (p) => p.participantId === participantId,
    );
    return index !== -1 ? index : -1;
  }

  /**
   * Estimate wait time for participant
   */
  estimateWaitTime(participantId: string): number {
    const position = this.getQueuePosition(participantId);
    if (position === -1) return 0;

    const avgTime = this.getAverageTimePerParticipant();
    const concurrency = this.options.concurrency || DEFAULT_CONCURRENCY;

    // Calculate wait time based on position and concurrency
    const batchesAhead = Math.floor(position / concurrency);
    return batchesAhead * avgTime;
  }

  /**
   * Reorder queue by priority (higher first) then FIFO
   */
  private reorderQueue(): void {
    this.state.queue.sort((a, b) => {
      // Higher priority first
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Then FIFO (earlier queuePosition first)
      return a.queuePosition - b.queuePosition;
    });

    // Update queue positions after reordering
    this.state.queue.forEach((p, index) => {
      p.queuePosition = index;
    });
  }

  // ============================================================================
  // NFC Reader Management
  // ============================================================================

  /**
   * Detect available NFC readers
   */
  async detectNFCReaders(): Promise<NFCReaderState[]> {
    // Check if Web NFC API is supported
    if (typeof window === "undefined" || !("NDEFReader" in window)) {
      console.warn("[BatchQueueManager] Web NFC API not supported");
      return [];
    }

    // For now, assume single reader (Web NFC API limitation)
    // In future, this could be extended to support multiple USB readers
    const reader: NFCReaderState = {
      readerId: "default",
      isAvailable: true,
      isConnected: true,
      lastActiveAt: Date.now(),
    };

    this.state.nfcReaders = [reader];
    await this.persistState();

    console.log(
      `[BatchQueueManager] Detected ${this.state.nfcReaders.length} NFC reader(s)`,
    );
    return this.state.nfcReaders;
  }

  /**
   * Register NFC reader
   */
  registerNFCReader(readerId: string): void {
    const existing = this.state.nfcReaders.find((r) => r.readerId === readerId);
    if (!existing) {
      this.state.nfcReaders.push({
        readerId,
        isAvailable: true,
        isConnected: true,
        lastActiveAt: Date.now(),
      });
      console.log(`[BatchQueueManager] Registered NFC reader: ${readerId}`);
    }
  }

  /**
   * Unregister NFC reader
   */
  unregisterNFCReader(readerId: string): void {
    const index = this.state.nfcReaders.findIndex(
      (r) => r.readerId === readerId,
    );
    if (index !== -1) {
      this.state.nfcReaders.splice(index, 1);
      console.log(`[BatchQueueManager] Unregistered NFC reader: ${readerId}`);
    }
  }

  /**
   * Assign reader to participant
   */
  assignReaderToParticipant(participantId: string, readerId: string): void {
    const reader = this.state.nfcReaders.find((r) => r.readerId === readerId);
    const participant = this.state.queue.find(
      (p) => p.participantId === participantId,
    );

    if (reader && participant) {
      reader.currentParticipantId = participantId;
      reader.isAvailable = false;
      participant.assignedReaderId = readerId;
      console.log(
        `[BatchQueueManager] Assigned reader ${readerId} to participant ${participantId}`,
      );
    }
  }

  /**
   * Handle reader disconnection
   */
  async handleReaderDisconnection(readerId: string): Promise<void> {
    const reader = this.state.nfcReaders.find((r) => r.readerId === readerId);
    if (reader) {
      reader.isConnected = false;
      reader.isAvailable = false;
      reader.error = "Reader disconnected";

      // If reader had a participant assigned, mark as failed
      if (reader.currentParticipantId) {
        const participant = this.state.queue.find(
          (p) => p.participantId === reader.currentParticipantId,
        );
        if (participant) {
          participant.lastError = "NFC reader disconnected";
          participant.assignedReaderId = undefined;
        }
        reader.currentParticipantId = undefined;
      }

      await this.persistState();
      console.warn(`[BatchQueueManager] Reader ${readerId} disconnected`);
    }
  }

  /**
   * Release reader (mark as available)
   */
  private releaseReader(readerId: string): void {
    const reader = this.state.nfcReaders.find((r) => r.readerId === readerId);
    if (reader) {
      reader.isAvailable = true;
      reader.currentParticipantId = undefined;
      reader.lastActiveAt = Date.now();
    }
  }

  /**
   * Get available reader
   */
  private getAvailableReader(): NFCReaderState | null {
    return (
      this.state.nfcReaders.find((r) => r.isAvailable && r.isConnected) || null
    );
  }

  // ============================================================================
  // Batch Processing
  // ============================================================================

  /**
   * Start batch processing
   */
  async startProcessing(options: BatchProcessingOptions = {}): Promise<void> {
    if (this.state.status === "processing") {
      console.warn("[BatchQueueManager] Processing already in progress");
      return;
    }

    this.options = {
      concurrency: options.concurrency || DEFAULT_CONCURRENCY,
      maxRetries: options.maxRetries || DEFAULT_MAX_RETRIES,
      onProgress: options.onProgress,
      onParticipantComplete: options.onParticipantComplete,
      onParticipantFailed: options.onParticipantFailed,
      stopOnError: options.stopOnError || false,
      enableParallelNFC: options.enableParallelNFC || false,
    };

    this.state.status = "processing";
    this.state.isPaused = false;
    await this.persistState();

    console.log(
      `[BatchQueueManager] Starting batch processing (${this.state.queue.length} participants, concurrency: ${this.options.concurrency})`,
    );

    // Start processing loop
    this.processingPromise = this.processQueue();
    await this.processingPromise;
  }

  /**
   * Pause batch processing
   */
  async pauseProcessing(): Promise<void> {
    if (this.state.status !== "processing") {
      console.warn("[BatchQueueManager] No processing to pause");
      return;
    }

    this.state.isPaused = true;
    this.state.status = "paused";
    await this.persistState();

    console.log("[BatchQueueManager] Batch processing paused");
  }

  /**
   * Resume batch processing
   */
  async resumeProcessing(): Promise<void> {
    if (this.state.status !== "paused") {
      console.warn("[BatchQueueManager] No paused processing to resume");
      return;
    }

    this.state.isPaused = false;
    this.state.status = "processing";
    await this.persistState();

    console.log("[BatchQueueManager] Batch processing resumed");

    // Resume processing loop
    this.processingPromise = this.processQueue();
    await this.processingPromise;
  }

  /**
   * Process queue with concurrency control and batch database inserts
   */
  private async processQueue(): Promise<void> {
    const concurrency = this.options.concurrency || DEFAULT_CONCURRENCY;
    const batchSize = Math.min(concurrency, 10); // Batch up to 10 participants at a time

    while (this.state.queue.length > 0 && !this.state.isPaused) {
      // Get next batch of participants
      const batch = this.state.queue.slice(0, batchSize);

      // Try batch insert first for efficiency (only if multiple participants)
      if (batch.length > 1) {
        try {
          await this.batchInsertParticipants(batch);

          // First, atomically move all participants to completed
          for (const participant of batch) {
            this.moveToCompleted(participant);
          }
          // Then notify (errors in callbacks shouldn't affect state)
          for (const participant of batch) {
            try {
              this.options.onParticipantComplete?.(participant);
            } catch (callbackError) {
              console.warn(
                `[BatchQueueManager] onParticipantComplete callback error:`,
                callbackError,
              );
            }
          }
        } catch (err) {
          console.warn(
            `[BatchQueueManager] Batch insert failed, falling back to individual processing:`,
            err,
          );

          // Fall back to individual processing with retry logic
          const promises = batch.map((participant) =>
            this.processParticipantWithRetry(participant),
          );
          await Promise.all(promises);
        }
      } else {
        // Single participant - process individually
        const promises = batch.map((participant) =>
          this.processParticipantWithRetry(participant),
        );
        await Promise.all(promises);
      }

      // Update progress
      this.notifyProgress();

      // Check if should stop on error
      if (this.options.stopOnError && this.state.failed.length > 0) {
        console.warn(
          "[BatchQueueManager] Stopping processing due to error (stopOnError=true)",
        );
        break;
      }
    }

    // Mark as completed if queue is empty
    if (this.state.queue.length === 0) {
      this.state.status = "completed";
      await this.persistState();
      console.log("[BatchQueueManager] Batch processing completed");
    }
  }

  /**
   * Process participant with retry logic
   */
  private async processParticipantWithRetry(
    participant: QueuedParticipant,
  ): Promise<void> {
    const maxRetries = participant.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.processParticipant(participant);

        // Success - move to completed
        this.moveToCompleted(participant);
        this.options.onParticipantComplete?.(participant);
        return;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        participant.lastError = errorMessage;
        participant.retryCount = attempt + 1;

        console.warn(
          `[BatchQueueManager] Participant ${participant.participantId} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}`,
        );

        // If max retries exceeded, move to failed
        if (attempt >= maxRetries) {
          this.moveToFailed(participant);
          this.options.onParticipantFailed?.(participant, errorMessage);
          return;
        }

        // Wait before retry (exponential backoff)
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  /**
   * Process single participant
   * This is a placeholder - actual implementation would integrate with onboarding steps
   */
  private async processParticipant(
    participant: QueuedParticipant,
  ): Promise<void> {
    // Record start time
    this.startTimes.set(participant.participantId, Date.now());

    // Assign NFC reader if parallel NFC is enabled
    if (this.options.enableParallelNFC) {
      const reader = this.getAvailableReader();
      if (reader) {
        this.assignReaderToParticipant(
          participant.participantId,
          reader.readerId,
        );
      }
    }

    // TODO: Integrate with actual onboarding workflow
    // For now, simulate processing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Release reader if assigned
    if (participant.assignedReaderId) {
      this.releaseReader(participant.assignedReaderId);
    }

    // Record completion time
    const startTime = this.startTimes.get(participant.participantId);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.completedDurations.push(duration / 1000); // Convert to seconds
      console.log(
        `[BatchQueueManager] Participant ${participant.participantId} processed in ${duration}ms`,
      );
      this.startTimes.delete(participant.participantId);
    }
  }

  /**
   * Move participant to completed list
   */
  private moveToCompleted(participant: QueuedParticipant): void {
    const index = this.state.queue.findIndex(
      (p) => p.participantId === participant.participantId,
    );
    if (index !== -1) {
      this.state.queue.splice(index, 1);
      this.state.completed.push(participant);
      this.state.totalProcessed++;
      this.reorderQueue();
    }
  }

  /**
   * Move participant to failed list
   */
  private moveToFailed(participant: QueuedParticipant): void {
    const index = this.state.queue.findIndex(
      (p) => p.participantId === participant.participantId,
    );
    if (index !== -1) {
      this.state.queue.splice(index, 1);
      this.state.failed.push(participant);
      this.state.totalProcessed++;
      this.reorderQueue();
    }
  }

  // ============================================================================
  // Progress Tracking
  // ============================================================================

  /**
   * Calculate current progress
   */
  calculateProgress(): QueueProgress {
    const total = this.state.totalQueued;
    const completed = this.state.completed.length;
    const failed = this.state.failed.length;
    const inProgress = this.startTimes.size;
    const pending = this.state.queue.length - inProgress;

    const percentComplete = total > 0 ? (completed / total) * 100 : 0;
    const avgTime = this.getAverageTimePerParticipant();
    const estimatedTimeRemaining = this.estimateTimeRemaining();

    return {
      total,
      completed,
      inProgress,
      failed,
      pending,
      percentComplete,
      estimatedTimeRemaining,
      averageTimePerParticipant: avgTime,
    };
  }

  /**
   * Estimate time remaining for entire batch
   */
  estimateTimeRemaining(): number {
    const remaining = this.state.queue.length;
    if (remaining === 0) return 0;

    const avgTime = this.getAverageTimePerParticipant();
    const concurrency = this.options.concurrency || DEFAULT_CONCURRENCY;

    // Calculate batches remaining
    const batchesRemaining = Math.ceil(remaining / concurrency);
    return batchesRemaining * avgTime;
  }

  /**
   * Get average time per participant
   */
  getAverageTimePerParticipant(): number {
    if (this.completedDurations.length === 0) {
      // Default estimate: 10 minutes per participant
      return 600;
    }
    const sum = this.completedDurations.reduce((a, b) => a + b, 0);
    return sum / this.completedDurations.length;
  }

  /**
   * Notify progress callback
   */
  private notifyProgress(): void {
    if (this.options.onProgress) {
      const progress = this.calculateProgress();
      this.options.onProgress(progress);
    }
  }

  // ============================================================================
  // State Management
  // ============================================================================

  /**
   * Persist state to IndexedDB
   */
  private async persistState(): Promise<void> {
    this.state.lastUpdated = Date.now();
    await saveQueueState(this.state);
  }

  /**
   * Get current state
   */
  getState(): BatchQueueState {
    return { ...this.state };
  }

  /**
   * Get queue snapshot
   */
  getQueue(): QueuedParticipant[] {
    return [...this.state.queue];
  }

  /**
   * Get completed participants
   */
  getCompleted(): QueuedParticipant[] {
    return [...this.state.completed];
  }

  /**
   * Get failed participants
   */
  getFailed(): QueuedParticipant[] {
    return [...this.state.failed];
  }

  /**
   * Batch insert participants to database
   * Uses the onboarding-batch-insert Netlify Function for efficient bulk inserts
   */
  private async batchInsertParticipants(
    participants: QueuedParticipant[],
  ): Promise<void> {
    if (participants.length === 0) {
      return;
    }

    console.log(
      `[BatchQueueManager] Batch inserting ${participants.length} participants`,
    );

    // Get JWT token from session storage or context
    if (typeof window === "undefined" || !window.sessionStorage) {
      throw new Error("Batch insert requires browser environment");
    }
    const token = sessionStorage.getItem("supabase.auth.token");
    if (!token) {
      throw new Error("No authentication token available for batch insert");
    }

    // Prepare batch request
    const batchData = {
      sessionId: this.state.sessionId,
      participants: participants.map((p) => ({
        participantId: p.participantId,
        sessionId: p.sessionId,
        trueName: p.trueName,
        displayName: p.displayName,
        language: p.language,
        npub: p.npub,
        nip05: p.nip05,
        migrationFlag: p.migrationFlag,
        oldNpub: p.oldNpub,
        technicalComfort: p.technicalComfort,
        currentStep: p.currentStep,
        completedSteps: p.completedSteps,
        status: p.status,
        encrypted_nsec: p.encrypted_nsec,
        encrypted_keet_seed: p.encrypted_keet_seed,
        keet_seed_salt: p.keet_seed_salt,
        keet_peer_id: p.keet_peer_id,
        nip03_event_id: p.nip03_event_id,
        ots_proof: p.ots_proof,
        federation_linked: p.federation_linked,
        attestation_published: p.attestation_published,
      })),
    };

    // Call batch insert endpoint
    const response = await fetch(
      "/.netlify/functions/onboarding-batch-insert",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(batchData),
      },
    );

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
      } catch {
        // Response body wasn't JSON
      }
      throw new Error(`Batch insert failed: ${errorMessage}`);
    }

    const result = await response.json();

    console.log(
      `[BatchQueueManager] Batch insert completed: ${result.totalSucceeded}/${result.totalRequested} succeeded in ${result.processingTimeMs}ms`,
    );

    // Check for partial failures
    if (result.totalFailed > 0) {
      const failedResults = result.results.filter((r: any) => !r.success);
      console.warn(
        `[BatchQueueManager] ${result.totalFailed} participants failed:`,
        failedResults,
      );
      throw new Error(
        `Batch insert had ${result.totalFailed} failures - falling back to individual processing`,
      );
    }
  }

  /**
   * Clear all state and reset
   */
  async clear(): Promise<void> {
    await clearQueueState(this.state.sessionId);
    this.state = {
      sessionId: this.state.sessionId,
      queue: [],
      completed: [],
      failed: [],
      nfcReaders: [],
      isPaused: false,
      status: "idle",
      lastUpdated: Date.now(),
      totalProcessed: 0,
      totalQueued: 0,
    };
    this.startTimes.clear();
    console.log("[BatchQueueManager] State cleared");
  }

  /**
   * Retry failed participant
   */
  async retryFailedParticipant(participantId: string): Promise<void> {
    const index = this.state.failed.findIndex(
      (p) => p.participantId === participantId,
    );
    if (index !== -1) {
      const participant = this.state.failed.splice(index, 1)[0];
      participant.retryCount = 0;
      participant.lastError = undefined;
      this.state.queue.push(participant);
      this.reorderQueue();
      await this.persistState();
      console.log(
        `[BatchQueueManager] Retrying failed participant ${participantId}`,
      );
    }
  }

  /**
   * Skip failed participant (remove from failed list)
   */
  async skipFailedParticipant(participantId: string): Promise<void> {
    const index = this.state.failed.findIndex(
      (p) => p.participantId === participantId,
    );
    if (index !== -1) {
      this.state.failed.splice(index, 1);
      await this.persistState();
      console.log(
        `[BatchQueueManager] Skipped failed participant ${participantId}`,
      );
    }
  }
}

// ============================================================================
// Singleton Instance Management
// ============================================================================

const managerInstances = new Map<string, BatchQueueManager>();

/**
 * Get or create batch queue manager for session
 */
export async function getBatchQueueManager(
  sessionId: string,
): Promise<BatchQueueManager> {
  let manager = managerInstances.get(sessionId);

  if (!manager) {
    manager = new BatchQueueManager(sessionId);
    await manager.initialize();
    managerInstances.set(sessionId, manager);
  }

  return manager;
}

/**
 * Clear batch queue manager instance
 */
export function clearBatchQueueManager(sessionId: string): void {
  managerInstances.delete(sessionId);
}
