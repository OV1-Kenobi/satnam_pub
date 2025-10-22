/**
 * Tests for Timing Attack Prevention Audit
 * Verifies audit results and constant-time operation documentation
 */

import { describe, it, expect } from "vitest";
import {
  TIMING_AUDIT_RESULTS,
  getAuditResult,
  getNonConstantTimeOperations,
  generateAuditReport,
} from "../../lib/security/timing-audit";

describe("Timing Attack Prevention Audit", () => {
  describe("Audit Results", () => {
    it("should have audit results for all critical operations", () => {
      expect(TIMING_AUDIT_RESULTS.length).toBeGreaterThan(0);
    });

    it("should have required fields in each audit result", () => {
      for (const result of TIMING_AUDIT_RESULTS) {
        expect(result).toHaveProperty("operation");
        expect(result).toHaveProperty("location");
        expect(result).toHaveProperty("isConstantTime");
        expect(result).toHaveProperty("reason");
        expect(result).toHaveProperty("recommendation");

        expect(typeof result.operation).toBe("string");
        expect(typeof result.location).toBe("string");
        expect(typeof result.isConstantTime).toBe("boolean");
        expect(typeof result.reason).toBe("string");
        expect(typeof result.recommendation).toBe("string");
      }
    });

    it("should have audit results for signature verification", () => {
      const sigVerification = TIMING_AUDIT_RESULTS.find((r) =>
        r.operation.includes("Signature Verification")
      );

      expect(sigVerification).toBeDefined();
      expect(sigVerification?.isConstantTime).toBe(true);
    });

    it("should have audit results for PBKDF2 operations", () => {
      const pbkdf2Results = TIMING_AUDIT_RESULTS.filter((r) =>
        r.operation.includes("PBKDF2")
      );

      expect(pbkdf2Results.length).toBeGreaterThan(0);
      for (const result of pbkdf2Results) {
        expect(result.isConstantTime).toBe(true);
      }
    });

    it("should have audit results for string comparison", () => {
      const comparison = TIMING_AUDIT_RESULTS.find((r) =>
        r.operation.includes("Constant-Time String Comparison")
      );

      expect(comparison).toBeDefined();
      expect(comparison?.isConstantTime).toBe(true);
    });

    it("should document non-constant-time operations", () => {
      const nonConstantTime = getNonConstantTimeOperations();

      expect(nonConstantTime.length).toBeGreaterThan(0);

      for (const result of nonConstantTime) {
        expect(result.isConstantTime).toBe(false);
        expect(result.reason).toBeTruthy();
        expect(result.recommendation).toBeTruthy();
      }
    });
  });

  describe("Audit Query Functions", () => {
    it("should find audit result by operation name", () => {
      const result = getAuditResult("Signature Verification");

      expect(result).toBeDefined();
      expect(result?.operation).toContain("Signature Verification");
    });

    it("should return undefined for unknown operation", () => {
      const result = getAuditResult("Unknown Operation");

      expect(result).toBeUndefined();
    });

    it("should get all non-constant-time operations", () => {
      const nonConstantTime = getNonConstantTimeOperations();

      expect(Array.isArray(nonConstantTime)).toBe(true);

      for (const result of nonConstantTime) {
        expect(result.isConstantTime).toBe(false);
      }
    });

    it("should not include constant-time operations in non-constant-time list", () => {
      const nonConstantTime = getNonConstantTimeOperations();
      const constantTimeOps = TIMING_AUDIT_RESULTS.filter(
        (r) => r.isConstantTime
      );

      for (const constantOp of constantTimeOps) {
        const found = nonConstantTime.find(
          (r) => r.operation === constantOp.operation
        );
        expect(found).toBeUndefined();
      }
    });
  });

  describe("Audit Report Generation", () => {
    it("should generate audit report", () => {
      const report = generateAuditReport();

      expect(typeof report).toBe("string");
      expect(report.length).toBeGreaterThan(0);
    });

    it("should include summary in report", () => {
      const report = generateAuditReport();

      expect(report).toContain("Summary");
      expect(report).toContain("Total Operations Audited");
      expect(report).toContain("Constant-Time Operations");
      expect(report).toContain("Non-Constant-Time Operations");
    });

    it("should include operation details in report", () => {
      const report = generateAuditReport();

      // Should include at least one operation
      expect(report).toContain("Signature Verification");
    });

    it("should include recommendations for non-constant-time operations", () => {
      const report = generateAuditReport();
      const nonConstantTime = getNonConstantTimeOperations();

      if (nonConstantTime.length > 0) {
        expect(report).toContain("Non-Constant-Time Operations");
        expect(report).toContain("Recommendation");
      }
    });

    it("should format report with proper markdown", () => {
      const report = generateAuditReport();

      expect(report).toContain("#");
      expect(report).toContain("-");
    });
  });

  describe("Audit Coverage", () => {
    it("should audit token binding operations", () => {
      const tokenBinding = TIMING_AUDIT_RESULTS.find((r) =>
        r.operation.includes("Token Binding")
      );

      expect(tokenBinding).toBeDefined();
      expect(tokenBinding?.isConstantTime).toBe(true);
    });

    it("should audit device fingerprint operations", () => {
      const deviceFingerprint = TIMING_AUDIT_RESULTS.find((r) =>
        r.operation.includes("Device Fingerprint")
      );

      expect(deviceFingerprint).toBeDefined();
      expect(deviceFingerprint?.isConstantTime).toBe(true);
    });

    it("should audit password verification", () => {
      const passwordVerification = TIMING_AUDIT_RESULTS.find((r) =>
        r.operation.includes("Password Verification")
      );

      expect(passwordVerification).toBeDefined();
      expect(passwordVerification?.isConstantTime).toBe(true);
    });

    it("should document database query timing considerations", () => {
      const dbQuery = TIMING_AUDIT_RESULTS.find((r) =>
        r.operation.includes("Database Query")
      );

      expect(dbQuery).toBeDefined();
      expect(dbQuery?.reason).toContain("varies");
    });
  });

  describe("Audit Statistics", () => {
    it("should have more constant-time than non-constant-time operations", () => {
      const constantTime = TIMING_AUDIT_RESULTS.filter((r) => r.isConstantTime);
      const nonConstantTime = getNonConstantTimeOperations();

      expect(constantTime.length).toBeGreaterThan(nonConstantTime.length);
    });

    it("should have at least 10 operations audited", () => {
      expect(TIMING_AUDIT_RESULTS.length).toBeGreaterThanOrEqual(10);
    });

    it("should have all critical crypto operations audited", () => {
      const operations = TIMING_AUDIT_RESULTS.map((r) => r.operation);

      expect(operations.some((op) => op.includes("Signature"))).toBe(true);
      expect(operations.some((op) => op.includes("PBKDF2"))).toBe(true);
      expect(operations.some((op) => op.includes("Comparison"))).toBe(true);
    });
  });
});

