/**
 * Unit tests for secret-cleanup.ts
 *
 * Tests the SecretCleanupManager class and utility functions for secure
 * memory cleanup of ephemeral secrets during onboarding.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SecretCleanupManager,
  clearSecret,
  triggerMemoryCleanup,
  createSecretLifecycleAudit,
  type SecretType,
  type SecretLifecycleAction,
} from "../secret-cleanup";
import * as encryption from "../../privacy/encryption";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock PrivacyUtils.secureClearMemory
vi.mock("../../privacy/encryption", async () => {
  const actual = await vi.importActual("../../privacy/encryption");
  return {
    ...actual,
    secureClearMemory: vi.fn(),
  };
});

// ============================================================================
// Test Data
// ============================================================================

const mockNsec = "a".repeat(64); // 64 hex chars
const mockKeetSeed =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";
const mockPassword = "test-password-123";
const mockParticipantId = "participant-123";

// ============================================================================
// SecretCleanupManager Tests
// ============================================================================

describe("SecretCleanupManager", () => {
  let manager: SecretCleanupManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SecretCleanupManager(mockParticipantId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe("Constructor", () => {
    it("should create manager with participant ID", () => {
      const mgr = new SecretCleanupManager(mockParticipantId);
      expect(mgr).toBeInstanceOf(SecretCleanupManager);
    });

    it("should create manager without participant ID", () => {
      const mgr = new SecretCleanupManager();
      expect(mgr).toBeInstanceOf(SecretCleanupManager);
    });
  });

  // ==========================================================================
  // clearSecret Tests
  // ==========================================================================

  describe("clearSecret", () => {
    it("should clear a string secret", () => {
      manager.clearSecret(mockNsec, "nsec", "test context");

      expect(encryption.secureClearMemory).toHaveBeenCalledWith([
        { data: mockNsec, type: "string" },
      ]);
    });

    it("should clear a Uint8Array secret", () => {
      const secretArray = new Uint8Array([1, 2, 3, 4]);
      manager.clearSecret(secretArray, "keet_seed", "test context");

      expect(encryption.secureClearMemory).toHaveBeenCalledWith([
        { data: secretArray, type: "uint8array" },
      ]);
    });

    it("should clear an ArrayBuffer secret", () => {
      const secretBuffer = new ArrayBuffer(32);
      manager.clearSecret(secretBuffer, "password", "test context");

      expect(encryption.secureClearMemory).toHaveBeenCalledWith([
        { data: secretBuffer, type: "arraybuffer" },
      ]);
    });

    it("should handle null secret gracefully", () => {
      manager.clearSecret(null, "nsec");

      expect(encryption.secureClearMemory).not.toHaveBeenCalled();
    });

    it("should log secret action to audit trail", () => {
      manager.clearSecret(mockNsec, "nsec", "test context");

      const auditLog = manager.getAuditLog();
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0]).toMatchObject({
        secretType: "nsec",
        action: "cleared",
        context: "test context",
        participantId: mockParticipantId,
      });
    });
  });

  // ==========================================================================
  // clearMultipleSecrets Tests
  // ==========================================================================

  describe("clearMultipleSecrets", () => {
    it("should clear multiple secrets at once", () => {
      const secrets = [
        { secret: mockNsec, type: "nsec" as SecretType },
        { secret: mockKeetSeed, type: "keet_seed" as SecretType },
        { secret: mockPassword, type: "password" as SecretType },
      ];

      manager.clearMultipleSecrets(secrets, "batch cleanup");

      expect(encryption.secureClearMemory).toHaveBeenCalledWith([
        { data: mockNsec, type: "string" },
        { data: mockKeetSeed, type: "string" },
        { data: mockPassword, type: "string" },
      ]);
    });

    it("should log audit entries for each secret", () => {
      const secrets = [
        { secret: mockNsec, type: "nsec" as SecretType },
        { secret: mockKeetSeed, type: "keet_seed" as SecretType },
      ];

      manager.clearMultipleSecrets(secrets, "batch cleanup");

      const auditLog = manager.getAuditLog();
      expect(auditLog).toHaveLength(2);
      expect(auditLog[0].secretType).toBe("nsec");
      expect(auditLog[1].secretType).toBe("keet_seed");
    });

    it("should skip null secrets", () => {
      const secrets = [
        { secret: mockNsec, type: "nsec" as SecretType },
        { secret: null, type: "password" as SecretType },
      ];

      manager.clearMultipleSecrets(secrets);

      expect(encryption.secureClearMemory).toHaveBeenCalledWith([
        { data: mockNsec, type: "string" },
      ]);
    });

    it("should handle mixed secret types", () => {
      const secrets = [
        { secret: mockNsec, type: "nsec" as SecretType },
        { secret: new Uint8Array([1, 2, 3]), type: "keet_seed" as SecretType },
        { secret: new ArrayBuffer(16), type: "otp" as SecretType },
      ];

      manager.clearMultipleSecrets(secrets);

      expect(encryption.secureClearMemory).toHaveBeenCalledWith([
        { data: mockNsec, type: "string" },
        { data: expect.any(Uint8Array), type: "uint8array" },
        { data: expect.any(ArrayBuffer), type: "arraybuffer" },
      ]);
    });
  });

  // ==========================================================================
  // clearReactState Tests
  // ==========================================================================

  describe("clearReactState", () => {
    it("should clear specified state keys", () => {
      const mockSetState = vi.fn();
      const sensitiveKeys = ["nsec", "keetSeed", "password"];

      manager.clearReactState(mockSetState, sensitiveKeys);

      expect(mockSetState).toHaveBeenCalledWith(expect.any(Function));

      // Test the state updater function
      const stateUpdater = mockSetState.mock.calls[0][0];
      const prevState = {
        nsec: mockNsec,
        keetSeed: mockKeetSeed,
        password: mockPassword,
        otherData: "should-remain",
      };

      const newState = stateUpdater(prevState);

      expect(newState).toEqual({
        nsec: null,
        keetSeed: null,
        password: null,
        otherData: "should-remain",
      });
    });

    it("should preserve non-sensitive state", () => {
      const mockSetState = vi.fn();
      const sensitiveKeys = ["nsec"];

      manager.clearReactState(mockSetState, sensitiveKeys);

      const stateUpdater = mockSetState.mock.calls[0][0];
      const prevState = {
        nsec: mockNsec,
        displayName: "Test User",
        currentStep: "backup",
      };

      const newState = stateUpdater(prevState);

      expect(newState.nsec).toBeNull();
      expect(newState.displayName).toBe("Test User");
      expect(newState.currentStep).toBe("backup");
    });
  });

  // ==========================================================================
  // triggerBrowserMemoryCleanup Tests
  // ==========================================================================

  describe("triggerBrowserMemoryCleanup", () => {
    it("should attempt to trigger GC if available", () => {
      const mockGc = vi.fn();
      (global as any).window = { gc: mockGc };

      manager.triggerBrowserMemoryCleanup();

      expect(mockGc).toHaveBeenCalled();

      delete (global as any).window;
    });

    it("should handle missing GC gracefully", () => {
      (global as any).window = {};

      expect(() => {
        manager.triggerBrowserMemoryCleanup();
      }).not.toThrow();

      delete (global as any).window;
    });

    it("should handle GC errors gracefully", () => {
      const mockGc = vi.fn(() => {
        throw new Error("GC not available");
      });
      (global as any).window = { gc: mockGc };

      expect(() => {
        manager.triggerBrowserMemoryCleanup();
      }).not.toThrow();

      delete (global as any).window;
    });
  });

  // ==========================================================================
  // Audit Trail Tests
  // ==========================================================================

  describe("Audit Trail", () => {
    it("should log secret actions with timestamp", () => {
      manager.logSecretAction("nsec", "displayed", "user clicked show secrets");

      const auditLog = manager.getAuditLog();
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0]).toMatchObject({
        secretType: "nsec",
        action: "displayed",
        context: "user clicked show secrets",
        participantId: mockParticipantId,
      });
      expect(auditLog[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601 format
    });

    it("should accumulate multiple audit entries", () => {
      manager.logSecretAction("nsec", "generated");
      manager.logSecretAction("nsec", "encrypted");
      manager.logSecretAction("nsec", "displayed");
      manager.logSecretAction("nsec", "cleared");

      const auditLog = manager.getAuditLog();
      expect(auditLog).toHaveLength(4);
      expect(auditLog.map((e) => e.action)).toEqual([
        "generated",
        "encrypted",
        "displayed",
        "cleared",
      ]);
    });

    it("should return copy of audit log", () => {
      manager.logSecretAction("nsec", "displayed");

      const log1 = manager.getAuditLog();
      const log2 = manager.getAuditLog();

      expect(log1).toEqual(log2);
      expect(log1).not.toBe(log2); // Different array instances
    });

    it("should clear audit log", () => {
      manager.logSecretAction("nsec", "displayed");
      manager.logSecretAction("keet_seed", "cleared");

      expect(manager.getAuditLog()).toHaveLength(2);

      manager.clearAuditLog();

      expect(manager.getAuditLog()).toHaveLength(0);
    });

    it("should include participant ID in audit entries", () => {
      manager.logSecretAction("nsec", "displayed");

      const auditLog = manager.getAuditLog();
      expect(auditLog[0].participantId).toBe(mockParticipantId);
    });

    it("should handle missing participant ID", () => {
      const mgr = new SecretCleanupManager(); // No participant ID
      mgr.logSecretAction("nsec", "displayed");

      const auditLog = mgr.getAuditLog();
      expect(auditLog[0].participantId).toBeUndefined();
    });
  });

  // ==========================================================================
  // completeBackupCleanup Tests
  // ==========================================================================

  describe("completeBackupCleanup", () => {
    it("should perform complete cleanup workflow", () => {
      const secrets = [
        { secret: mockNsec, type: "nsec" as SecretType },
        { secret: mockKeetSeed, type: "keet_seed" as SecretType },
        { secret: mockPassword, type: "password" as SecretType },
      ];

      manager.completeBackupCleanup(secrets, "5-minute timer expired");

      // Should clear all secrets
      expect(encryption.secureClearMemory).toHaveBeenCalledWith([
        { data: mockNsec, type: "string" },
        { data: mockKeetSeed, type: "string" },
        { data: mockPassword, type: "string" },
      ]);

      // Should log cleanup actions
      const auditLog = manager.getAuditLog();
      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog.some((e) => e.action === "destroyed")).toBe(true);
    });

    it("should include context in audit log", () => {
      const secrets = [{ secret: mockNsec, type: "nsec" as SecretType }];

      manager.completeBackupCleanup(secrets, "user clicked Complete Backup");

      const auditLog = manager.getAuditLog();
      const destroyedEntry = auditLog.find((e) => e.action === "destroyed");
      expect(destroyedEntry?.context).toContain("user clicked Complete Backup");
    });

    it("should handle missing context", () => {
      const secrets = [{ secret: mockNsec, type: "nsec" as SecretType }];

      manager.completeBackupCleanup(secrets);

      const auditLog = manager.getAuditLog();
      const destroyedEntry = auditLog.find((e) => e.action === "destroyed");
      expect(destroyedEntry?.context).toContain("manual");
    });
  });
});

// ============================================================================
// Standalone Function Tests
// ============================================================================

describe("Standalone Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // clearSecret Tests
  // ==========================================================================

  describe("clearSecret", () => {
    it("should clear a string secret", () => {
      clearSecret(mockNsec);

      expect(encryption.secureClearMemory).toHaveBeenCalledWith([
        { data: mockNsec, type: "string" },
      ]);
    });

    it("should clear a Uint8Array secret", () => {
      const secretArray = new Uint8Array([1, 2, 3, 4]);
      clearSecret(secretArray);

      expect(encryption.secureClearMemory).toHaveBeenCalledWith([
        { data: secretArray, type: "uint8array" },
      ]);
    });

    it("should clear an ArrayBuffer secret", () => {
      const secretBuffer = new ArrayBuffer(32);
      clearSecret(secretBuffer);

      expect(encryption.secureClearMemory).toHaveBeenCalledWith([
        { data: secretBuffer, type: "arraybuffer" },
      ]);
    });

    it("should handle null secret gracefully", () => {
      clearSecret(null);

      expect(encryption.secureClearMemory).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // triggerMemoryCleanup Tests
  // ==========================================================================

  describe("triggerMemoryCleanup", () => {
    it("should trigger memory cleanup", () => {
      expect(() => {
        triggerMemoryCleanup();
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // createSecretLifecycleAudit Tests
  // ==========================================================================

  describe("createSecretLifecycleAudit", () => {
    it("should create audit entry with all fields", () => {
      const entry = createSecretLifecycleAudit(
        "nsec",
        "displayed",
        "user clicked show secrets",
        mockParticipantId,
      );

      expect(entry).toMatchObject({
        secretType: "nsec",
        action: "displayed",
        context: "user clicked show secrets",
        participantId: mockParticipantId,
      });
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601 format
    });

    it("should create audit entry without optional fields", () => {
      const entry = createSecretLifecycleAudit("keet_seed", "cleared");

      expect(entry).toMatchObject({
        secretType: "keet_seed",
        action: "cleared",
      });
      expect(entry.context).toBeUndefined();
      expect(entry.participantId).toBeUndefined();
    });

    it("should generate unique timestamps", async () => {
      const entry1 = createSecretLifecycleAudit("nsec", "displayed");

      // Wait 1ms to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 1));

      const entry2 = createSecretLifecycleAudit("nsec", "cleared");

      expect(entry1.timestamp).not.toBe(entry2.timestamp);
    });

    it("should support all secret types", () => {
      const secretTypes: SecretType[] = [
        "nsec",
        "keet_seed",
        "password",
        "otp",
      ];

      secretTypes.forEach((type) => {
        const entry = createSecretLifecycleAudit(type, "displayed");
        expect(entry.secretType).toBe(type);
      });
    });

    it("should support all lifecycle actions", () => {
      const actions: SecretLifecycleAction[] = [
        "generated",
        "encrypted",
        "decrypted",
        "displayed",
        "copied",
        "cleared",
        "destroyed",
      ];

      actions.forEach((action) => {
        const entry = createSecretLifecycleAudit("nsec", action);
        expect(entry.action).toBe(action);
      });
    });
  });
});
