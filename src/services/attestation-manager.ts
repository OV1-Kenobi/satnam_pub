/**
 * Attestation Manager Service
 * Phase 2 Week 3 Day 11: API Services for NIP-03 Attestation Management
 *
 * Unified attestation manager for tracking and managing multiple attestation methods
 * (PKARR, SimpleProof, NIP-03). Provides event-based status updates and health monitoring.
 *
 * @compliance Privacy-first, zero-knowledge, no PII exposure
 */

import { EventEmitter } from "events";
import {
  AttestationManagerState,
  AttestationProgress,
  AttestationStatus,
  NIP03Attestation,
} from "../types/attestation";
import { createLogger } from "./loggingService";

// ============================================================================
// CONSTANTS
// ============================================================================

const ATTESTATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const HEALTH_CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds

// ============================================================================
// LOGGER
// ============================================================================

const logger = createLogger({ component: "AttestationManager" });

// ============================================================================
// ATTESTATION MANAGER CLASS
// ============================================================================

class AttestationManager extends EventEmitter {
  private state: AttestationManagerState = {
    currentAttestation: null,
    attestationHistory: [],
    progress: null,
    isLoading: false,
    error: null,
    lastUpdated: 0,
  };

  private healthCheckInterval: NodeJS.Timeout | null = null;
  private attestationTimeout: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setMaxListeners(10);
  }

  // ========================================================================
  // STATE MANAGEMENT
  // ========================================================================

  /**
   * Get current state
   */
  getState(): AttestationManagerState {
    return { ...this.state };
  }

  /**
   * Get current attestation
   */
  getCurrentAttestation(): NIP03Attestation | null {
    return this.state.currentAttestation;
  }

  /**
   * Get attestation history
   */
  getHistory(): NIP03Attestation[] {
    return [...this.state.attestationHistory];
  }

  /**
   * Get current progress
   */
  getProgress(): AttestationProgress | null {
    return this.state.progress;
  }

  /**
   * Check if loading
   */
  isLoading(): boolean {
    return this.state.isLoading;
  }

  /**
   * Get last error
   */
  getError(): string | null {
    return this.state.error?.message || null;
  }

  // ========================================================================
  // PROGRESS TRACKING
  // ========================================================================

  /**
   * Initialize attestation progress
   */
  initializeProgress(): void {
    this.state.progress = {
      kind0: { method: "kind0", status: "pending" },
      simpleproof: { method: "simpleproof", status: "pending" },
      nip03: { method: "nip03", status: "pending" },
      pkarr: { method: "pkarr", status: "pending" },
      overallStatus: "pending",
    };

    this.state.isLoading = true;
    this.state.lastUpdated = Date.now();

    this.emit("attestation:started", {
      attestationId: "new",
    });

    logger.debug("Attestation progress initialized");
  }

  /**
   * Update step progress
   */
  updateStepProgress(
    method: "kind0" | "simpleproof" | "nip03" | "pkarr",
    status: AttestationStatus,
    metadata?: Record<string, any>
  ): void {
    if (!this.state.progress) {
      this.initializeProgress();
    }

    const step = this.state.progress![method];
    step.status = status;
    step.metadata = metadata;

    if (status === "in-progress" && !step.startedAt) {
      step.startedAt = Date.now();
    } else if (status === "success" || status === "failure") {
      step.completedAt = Date.now();
    }

    this.updateOverallStatus();
    this.state.lastUpdated = Date.now();

    this.emit("attestation:progress", {
      progress: this.state.progress,
    });

    logger.debug(`Step progress updated: ${method} → ${status}`);
  }

  /**
   * Update overall status based on step statuses
   */
  private updateOverallStatus(): void {
    if (!this.state.progress) return;

    const steps = Object.values(this.state.progress).filter(
      (s) => s.method !== "overallStatus"
    );

    const allSuccess = steps.every(
      (s) => s.status === "success" || s.status === "skipped"
    );
    const anyFailure = steps.some((s) => s.status === "failure");
    const anyInProgress = steps.some((s) => s.status === "in-progress");

    if (anyFailure) {
      this.state.progress.overallStatus = "failure";
    } else if (anyInProgress) {
      this.state.progress.overallStatus = "in-progress";
    } else if (allSuccess) {
      this.state.progress.overallStatus = "success";
    } else {
      this.state.progress.overallStatus = "pending";
    }
  }

  /**
   * Set attestation complete
   */
  setAttestationComplete(attestation: NIP03Attestation): void {
    this.state.currentAttestation = attestation;
    this.state.attestationHistory.unshift(attestation);
    this.state.isLoading = false;
    this.state.error = null;
    this.state.lastUpdated = Date.now();

    this.clearTimeouts();

    this.emit("attestation:completed", {
      attestation,
    });

    logger.debug("Attestation completed", {
      metadata: { attestationId: attestation.id },
    });
  }

  /**
   * Set attestation failed
   */
  setAttestationFailed(error: string): void {
    this.state.isLoading = false;
    this.state.error = {
      code: "ATTESTATION_FAILED",
      message: error,
    };
    this.state.lastUpdated = Date.now();

    this.clearTimeouts();

    this.emit("attestation:failed", {
      error: this.state.error,
    });

    logger.error("Attestation failed", {
      metadata: { error: this.state.error },
    });
  }

  /**
   * Set attestation verified
   */
  setAttestationVerified(attestation: NIP03Attestation): void {
    this.state.currentAttestation = attestation;
    this.state.lastUpdated = Date.now();

    this.emit("attestation:verified", {
      attestation,
    });

    logger.debug("Attestation verified", {
      metadata: { attestationId: attestation.id },
    });
  }

  // ========================================================================
  // HEALTH MONITORING
  // ========================================================================

  /**
   * Start health check
   */
  startHealthCheck(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(() => {
      if (this.state.isLoading) {
        const elapsed = Date.now() - this.state.lastUpdated;
        if (elapsed > ATTESTATION_TIMEOUT_MS) {
          this.setAttestationFailed("Attestation timeout");
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    logger.debug("Health check started");
  }

  /**
   * Stop health check
   */
  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.debug("Health check stopped");
    }
  }

  /**
   * Clear timeouts
   */
  private clearTimeouts(): void {
    if (this.attestationTimeout) {
      clearTimeout(this.attestationTimeout);
      this.attestationTimeout = null;
    }
  }

  // ========================================================================
  // RESET & CLEANUP
  // ========================================================================

  /**
   * Reset manager state
   */
  reset(): void {
    this.state = {
      currentAttestation: null,
      attestationHistory: [],
      progress: null,
      isLoading: false,
      error: null,
      lastUpdated: 0,
    };

    this.clearTimeouts();
    this.stopHealthCheck();

    logger.debug("Attestation manager reset");
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.reset();
    this.removeAllListeners();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let managerInstance: AttestationManager | null = null;

/**
 * Get or create attestation manager instance
 */
export function getAttestationManager(): AttestationManager {
  if (!managerInstance) {
    managerInstance = new AttestationManager();
  }
  return managerInstance;
}

/**
 * Reset attestation manager (for testing)
 */
export function resetAttestationManager(): void {
  if (managerInstance) {
    managerInstance.cleanup();
    managerInstance = null;
  }
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export function initializeAttestationProgress(): void {
  getAttestationManager().initializeProgress();
}

export function updateAttestationStep(
  method: "kind0" | "simpleproof" | "nip03" | "pkarr",
  status: AttestationStatus,
  metadata?: Record<string, any>
): void {
  getAttestationManager().updateStepProgress(method, status, metadata);
}

export function completeAttestation(attestation: NIP03Attestation): void {
  getAttestationManager().setAttestationComplete(attestation);
}

export function failAttestation(error: string): void {
  getAttestationManager().setAttestationFailed(error);
}

export function verifyAttestation(attestation: NIP03Attestation): void {
  getAttestationManager().setAttestationVerified(attestation);
}

export function getAttestationState(): AttestationManagerState {
  return getAttestationManager().getState();
}

export function startAttestationHealthCheck(): void {
  getAttestationManager().startHealthCheck();
}

export function stopAttestationHealthCheck(): void {
  getAttestationManager().stopHealthCheck();
}
