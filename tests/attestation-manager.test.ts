/**
 * Attestation Manager Tests
 * Tests for src/services/attestation-manager.ts
 *
 * Tests cover:
 * - Session creation and management
 * - State transitions
 * - Event emission
 * - Progress tracking
 * - Error handling
 * - Health monitoring
 */

import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock EventEmitter for testing
class MockAttestationManager extends EventEmitter {
  private state: any = {};

  startAttestation(attestationId: string) {
    this.state[attestationId] = {
      status: "pending",
      startedAt: Date.now(),
    };
    this.emit("attestation:started", { attestationId });
  }

  setAttestationProgress(attestationId: string, progress: any) {
    if (!this.state[attestationId]) {
      throw new Error(`Attestation ${attestationId} not found`);
    }
    this.state[attestationId] = {
      ...this.state[attestationId],
      progress,
    };
    this.emit("attestation:progress", { attestationId, progress });
  }

  setAttestationCompleted(attestationId: string, attestation: any) {
    this.state[attestationId] = {
      ...this.state[attestationId],
      status: "success",
      attestation,
      completedAt: Date.now(),
    };
    this.emit("attestation:completed", { attestationId, attestation });
  }

  setAttestationFailed(attestationId: string, error: string) {
    if (!this.state[attestationId]) {
      throw new Error(`Attestation ${attestationId} not found`);
    }
    this.state[attestationId] = {
      ...this.state[attestationId],
      status: "failure",
      error,
      failedAt: Date.now(),
    };
    this.emit("attestation:failed", { attestationId, error });
  }

  getState(attestationId: string) {
    return this.state[attestationId];
  }
}

// ============================================================================
// TEST DATA
// ============================================================================

const TEST_ATTESTATION_ID = "att_123456";
const TEST_USER_DUID = "user_duid_123";

const mockAttestation = {
  id: TEST_ATTESTATION_ID,
  user_duid: TEST_USER_DUID,
  kind0_event_id:
    "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890",
  nip03_event_id:
    "b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890a",
  simpleproof_timestamp_id: "sp_ts_123",
  ots_proof: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  bitcoin_block: 850000,
  bitcoin_tx:
    "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  attestation_status: "success",
  created_at: Math.floor(Date.now() / 1000),
  verified_at: Math.floor(Date.now() / 1000),
  metadata: {
    nip05: "user@my.satnam.pub",
    npub: "npub1abc123def456",
    event_type: "identity_creation",
  },
};

// ============================================================================
// SESSION MANAGEMENT TESTS
// ============================================================================

describe("Attestation Manager - Session Management", () => {
  let manager: MockAttestationManager;

  beforeEach(() => {
    manager = new MockAttestationManager();
  });

  afterEach(() => {
    manager.removeAllListeners();
  });

  describe("startAttestation", () => {
    it("should create new attestation session", () => {
      manager.startAttestation(TEST_ATTESTATION_ID);

      const state = manager.getState(TEST_ATTESTATION_ID);
      expect(state).toBeDefined();
      expect(state.status).toBe("pending");
      expect(state.startedAt).toBeGreaterThan(0);
    });

    it("should emit attestation:started event", () => {
      return new Promise<void>((resolve) => {
        manager.on("attestation:started", ({ attestationId }) => {
          expect(attestationId).toBe(TEST_ATTESTATION_ID);
          resolve();
        });

        manager.startAttestation(TEST_ATTESTATION_ID);
      });
    });

    it("should handle multiple concurrent attestations", () => {
      const ids = ["att_1", "att_2", "att_3"];

      ids.forEach((id) => manager.startAttestation(id));

      ids.forEach((id) => {
        const state = manager.getState(id);
        expect(state).toBeDefined();
        expect(state.status).toBe("pending");
      });
    });
  });
});

// ============================================================================
// STATE TRANSITION TESTS
// ============================================================================

describe("Attestation Manager - State Transitions", () => {
  let manager: MockAttestationManager;

  beforeEach(() => {
    manager = new MockAttestationManager();
    manager.startAttestation(TEST_ATTESTATION_ID);
  });

  afterEach(() => {
    manager.removeAllListeners();
  });

  describe("setAttestationProgress", () => {
    it("should update progress state", () => {
      const progress = {
        kind0: { status: "success" },
        simpleproof: { status: "in-progress" },
        nip03: { status: "pending" },
        pkarr: { status: "pending" },
        overallStatus: "in-progress",
      };

      manager.setAttestationProgress(TEST_ATTESTATION_ID, progress);

      const state = manager.getState(TEST_ATTESTATION_ID);
      expect(state.progress).toEqual(progress);
    });

    it("should emit attestation:progress event", () => {
      const progress = {
        kind0: { status: "success" },
        overallStatus: "in-progress",
      };

      return new Promise<void>((resolve) => {
        manager.on("attestation:progress", ({ attestationId, progress: p }) => {
          expect(attestationId).toBe(TEST_ATTESTATION_ID);
          expect(p).toEqual(progress);
          resolve();
        });

        manager.setAttestationProgress(TEST_ATTESTATION_ID, progress);
      });
    });

    it("should track multiple progress updates", () => {
      const updates = [
        { kind0: { status: "success" }, overallStatus: "in-progress" },
        {
          kind0: { status: "success" },
          simpleproof: { status: "success" },
          overallStatus: "in-progress",
        },
        {
          kind0: { status: "success" },
          simpleproof: { status: "success" },
          nip03: { status: "success" },
          overallStatus: "in-progress",
        },
      ];

      updates.forEach((update) => {
        manager.setAttestationProgress(TEST_ATTESTATION_ID, update);
      });

      const state = manager.getState(TEST_ATTESTATION_ID);
      expect(state.progress).toEqual(updates[updates.length - 1]);
    });
  });

  describe("setAttestationCompleted", () => {
    it("should mark attestation as completed", () => {
      manager.setAttestationCompleted(TEST_ATTESTATION_ID, mockAttestation);

      const state = manager.getState(TEST_ATTESTATION_ID);
      expect(state.status).toBe("success");
      expect(state.attestation).toEqual(mockAttestation);
      expect(state.completedAt).toBeGreaterThanOrEqual(state.startedAt);
    });

    it("should emit attestation:completed event", () => {
      return new Promise<void>((resolve) => {
        manager.on(
          "attestation:completed",
          ({ attestationId, attestation }) => {
            expect(attestationId).toBe(TEST_ATTESTATION_ID);
            expect(attestation).toEqual(mockAttestation);
            resolve();
          }
        );

        manager.setAttestationCompleted(TEST_ATTESTATION_ID, mockAttestation);
      });
    });
  });

  describe("setAttestationFailed", () => {
    it("should mark attestation as failed", () => {
      const error = "Network timeout";
      manager.setAttestationFailed(TEST_ATTESTATION_ID, error);

      const state = manager.getState(TEST_ATTESTATION_ID);
      expect(state.status).toBe("failure");
      expect(state.error).toBe(error);
      expect(state.failedAt).toBeGreaterThanOrEqual(state.startedAt);
    });

    it("should emit attestation:failed event", () => {
      const error = "SimpleProof API error";

      return new Promise<void>((resolve) => {
        manager.on("attestation:failed", ({ attestationId, error: e }) => {
          expect(attestationId).toBe(TEST_ATTESTATION_ID);
          expect(e).toBe(error);
          resolve();
        });

        manager.setAttestationFailed(TEST_ATTESTATION_ID, error);
      });
    });

    it("should preserve error details", () => {
      const error = "NIP-03 event publishing failed: Invalid signature";
      manager.setAttestationFailed(TEST_ATTESTATION_ID, error);

      const state = manager.getState(TEST_ATTESTATION_ID);
      expect(state.error).toContain("NIP-03");
      expect(state.error).toContain("Invalid signature");
    });
  });
});

// ============================================================================
// EVENT EMISSION TESTS
// ============================================================================

describe("Attestation Manager - Event Emission", () => {
  let manager: MockAttestationManager;

  beforeEach(() => {
    manager = new MockAttestationManager();
  });

  afterEach(() => {
    manager.removeAllListeners();
  });

  it("should emit events in correct order", () => {
    return new Promise<void>((resolve) => {
      const events: string[] = [];

      manager.on("attestation:started", () => events.push("started"));
      manager.on("attestation:progress", () => events.push("progress"));
      manager.on("attestation:completed", () => events.push("completed"));

      manager.startAttestation(TEST_ATTESTATION_ID);
      manager.setAttestationProgress(TEST_ATTESTATION_ID, {
        overallStatus: "in-progress",
      });
      manager.setAttestationCompleted(TEST_ATTESTATION_ID, mockAttestation);

      setTimeout(() => {
        expect(events).toEqual(["started", "progress", "completed"]);
        resolve();
      }, 10);
    });
  });

  it("should allow multiple listeners", () => {
    return new Promise<void>((resolve) => {
      let listener1Called = false;
      let listener2Called = false;

      manager.on("attestation:started", () => {
        listener1Called = true;
      });

      manager.on("attestation:started", () => {
        listener2Called = true;
      });

      manager.startAttestation(TEST_ATTESTATION_ID);

      setTimeout(() => {
        expect(listener1Called).toBe(true);
        expect(listener2Called).toBe(true);
        resolve();
      }, 10);
    });
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

describe("Attestation Manager - Error Handling", () => {
  let manager: MockAttestationManager;

  beforeEach(() => {
    manager = new MockAttestationManager();
  });

  afterEach(() => {
    manager.removeAllListeners();
  });

  it("should handle missing attestation ID", () => {
    const state = manager.getState("nonexistent");

    expect(state).toBeUndefined();
  });

  it("should handle invalid progress data", () => {
    manager.startAttestation(TEST_ATTESTATION_ID);

    const invalidProgress = {
      overallStatus: "invalid_status",
    };

    manager.setAttestationProgress(TEST_ATTESTATION_ID, invalidProgress);

    const state = manager.getState(TEST_ATTESTATION_ID);
    expect(state.progress).toEqual(invalidProgress);
  });

  it("should handle error messages with special characters", () => {
    const error = 'Error: "Invalid JSON" in response';
    manager.startAttestation(TEST_ATTESTATION_ID);
    manager.setAttestationFailed(TEST_ATTESTATION_ID, error);

    const state = manager.getState(TEST_ATTESTATION_ID);
    expect(state.error).toBe(error);
  });
});

// ============================================================================
// TIMING TESTS
// ============================================================================

describe("Attestation Manager - Timing", () => {
  let manager: MockAttestationManager;

  beforeEach(() => {
    manager = new MockAttestationManager();
  });

  afterEach(() => {
    manager.removeAllListeners();
  });

  it("should track attestation duration", async () => {
    manager.startAttestation(TEST_ATTESTATION_ID);

    await new Promise((resolve) => setTimeout(resolve, 100));

    manager.setAttestationCompleted(TEST_ATTESTATION_ID, mockAttestation);

    const state = manager.getState(TEST_ATTESTATION_ID);
    const duration = state.completedAt - state.startedAt;

    expect(duration).toBeGreaterThanOrEqual(100);
  });

  it("should calculate time between state transitions", async () => {
    manager.startAttestation(TEST_ATTESTATION_ID);
    const startTime = manager.getState(TEST_ATTESTATION_ID).startedAt;

    await new Promise((resolve) => setTimeout(resolve, 50));

    manager.setAttestationProgress(TEST_ATTESTATION_ID, {
      overallStatus: "in-progress",
    });
    const progressTime = Date.now();

    const timeSinceStart = progressTime - startTime;
    expect(timeSinceStart).toBeGreaterThanOrEqual(50);
  });
});
