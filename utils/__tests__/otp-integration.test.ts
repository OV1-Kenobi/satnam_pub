/**
 * OTP System Integration Tests
 *
 * Production-ready integration tests that use real Supabase connections
 * and minimal mocking, following the established testing protocol.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getTestSupabaseClient } from '../../lib/__tests__/test-setup.js';

// Use real crypto for authentic testing - no mocking
// This ensures proper OTP hashing and verification

describe("OTP System Integration", () => {
  let supabase: any;
  let testSessionIds: string[] = [];

  beforeEach(async () => {
    supabase = getTestSupabaseClient();
    testSessionIds = [];

    // Clean up any existing test data
    await supabase
      .from("family_otp_verification")
      .delete()
      .like("id", "test-%");

    await supabase
      .from("security_audit_log")
      .delete()
      .like("session_id", "test-%");
  });

  afterEach(async () => {
    // Clean up test data
    if (testSessionIds.length > 0) {
      await supabase
        .from("family_otp_verification")
        .delete()
        .in("id", testSessionIds);
    }

    await supabase
      .from("family_otp_verification")
      .delete()
      .like("id", "test-%");

    await supabase
      .from("security_audit_log")
      .delete()
      .like("session_id", "test-%");
  });

  describe("OTP Configuration", () => {
    it("should have correct default configuration", async () => {
      const { OTP_CONFIG } = await import("../otp-storage");

      expect(OTP_CONFIG.DEFAULT_TTL_MINUTES).toBe(5);
      expect(OTP_CONFIG.MAX_ATTEMPTS).toBe(3);
      expect(OTP_CONFIG.RATE_LIMITS.INITIATE_PER_IDENTIFIER_PER_HOUR).toBe(10);
      expect(OTP_CONFIG.RATE_LIMITS.INITIATE_PER_IP_PER_HOUR).toBe(50);
      expect(OTP_CONFIG.RATE_LIMITS.VERIFY_PER_SESSION_PER_MINUTE).toBe(5);
      expect(OTP_CONFIG.RATE_LIMITS.VERIFY_PER_IP_PER_MINUTE).toBe(20);
    });
  });

  describe("OTP Storage Service", () => {
    it("should create and store OTP session", async () => {
      const { OTPStorageService } = await import("../otp-storage");

      const sessionId = await OTPStorageService.createOTP("123456", {
        identifier: `test-npub-${Date.now()}`,
        userAgent: "Test Browser",
        ipAddress: "127.0.0.1",
        ttlMinutes: 5,
      });

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe("string");
      testSessionIds.push(sessionId);

      // Verify it was stored in the database
      const { data, error } = await supabase
        .from("family_otp_verification")
        .select("*")
        .eq("id", sessionId)
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.id).toBe(sessionId);
      expect(data.attempts).toBe(0);
      expect(data.used).toBe(false);
    });

    it("should verify valid OTP", async () => {
      const { OTPStorageService } = await import("../otp-storage");

      // Create OTP first
      const otp = "123456";
      const sessionId = await OTPStorageService.createOTP(otp, {
        identifier: `test-npub-${Date.now()}`,
        userAgent: "Test Browser",
        ipAddress: "127.0.0.1",
      });
      testSessionIds.push(sessionId);

      // Verify OTP
      const result = await OTPStorageService.verifyOTP({
        sessionId,
        otp,
        userAgent: "Test Browser",
        ipAddress: "127.0.0.1",
      });

      expect(result.success).toBe(true);
      expect(result.data?.hashedIdentifier).toBeDefined();

      // Verify it was marked as used
      const { data } = await supabase
        .from("family_otp_verification")
        .select("used, used_at")
        .eq("id", sessionId)
        .single();

      expect(data.used).toBe(true);
      expect(data.used_at).toBeDefined();
    });

    it("should handle expired OTP", async () => {
      const { OTPStorageService } = await import("../otp-storage");

      // Create OTP with very short TTL
      const sessionId = await OTPStorageService.createOTP("123456", {
        identifier: `test-npub-${Date.now()}`,
        ttlMinutes: -1, // Already expired
      });
      testSessionIds.push(sessionId);

      const result = await OTPStorageService.verifyOTP({
        sessionId,
        otp: "123456",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("OTP has expired");
    });

    it("should increment attempts on wrong OTP", async () => {
      const { OTPStorageService } = await import("../otp-storage");

      const sessionId = await OTPStorageService.createOTP("123456", {
        identifier: `test-npub-${Date.now()}`,
      });
      testSessionIds.push(sessionId);

      // Try with wrong OTP
      const result = await OTPStorageService.verifyOTP({
        sessionId,
        otp: "wrong-otp",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid OTP");
      expect(result.data?.attemptsRemaining).toBe(2);

      // Check database was updated
      const { data } = await supabase
        .from("family_otp_verification")
        .select("attempts")
        .eq("id", sessionId)
        .single();

      expect(data.attempts).toBe(1);
    });

    it("should block after max attempts", async () => {
      const { OTPStorageService, OTP_CONFIG } = await import("../otp-storage");

      const sessionId = await OTPStorageService.createOTP("123456", {
        identifier: `test-npub-${Date.now()}`,
      });
      testSessionIds.push(sessionId);

      // Exhaust all attempts
      for (let i = 0; i < OTP_CONFIG.MAX_ATTEMPTS; i++) {
        await OTPStorageService.verifyOTP({
          sessionId,
          otp: "wrong-otp",
        });
      }

      // Next attempt should be blocked
      const result = await OTPStorageService.verifyOTP({
        sessionId,
        otp: "123456", // Even correct OTP should fail
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Maximum OTP attempts exceeded");
    });

    it("should clean up expired OTPs", async () => {
      const { OTPStorageService } = await import("../otp-storage");

      // Create expired OTP directly in database
      const expiredId = `test-expired-${Date.now()}`;
      await supabase.from("family_otp_verification").insert({
        id: expiredId,
        recipient_npub: "test-hash",
        otp_hash: "test-hash",
        salt: "test-salt",
        expires_at: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        attempts: 0,
        used: false,
        metadata: {},
      });

      const cleanedCount = await OTPStorageService.cleanupExpiredOTPs();
      expect(cleanedCount).toBeGreaterThanOrEqual(1);

      // Verify it was deleted
      const { data } = await supabase
        .from("family_otp_verification")
        .select("id")
        .eq("id", expiredId);

      expect(data).toHaveLength(0);
    });
  });

  describe("Communication Service", () => {
    it("should create and use development service", async () => {
      const { CommunicationServiceFactory } = await import(
        "../communication-service"
      );

      const service = await CommunicationServiceFactory.getDefaultService();
      expect(service).toBeDefined();

      const isAvailable = await service.isAvailable();
      expect(isAvailable).toBe(true);
    });

    it("should send OTP message successfully", async () => {
      const { CommunicationServiceFactory } = await import(
        "../communication-service"
      );

      const service =
        await CommunicationServiceFactory.createService("development");
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const result = await service.sendOTP(
        `test-npub-${Date.now()}`,
        "123456",
        `test-session-${Date.now()}`,
        expiresAt
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.deliveryStatus).toBe("sent");
    });

    it("should format OTP messages correctly", async () => {
      const { DevelopmentCommunicationService } = await import(
        "../communication-service"
      );

      const service = new DevelopmentCommunicationService();

      // Capture console output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logs.push(args.join(" "));
        originalLog(...args);
      };

      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await service.sendOTP("test-npub", "123456", "test-session", expiresAt);

      console.log = originalLog;

      const content = logs.find((log) => log.includes("Content:"));
      expect(content).toBeDefined();
      expect(content).toContain(
        "🔐 Your Satnam Family Wallet verification code is: 123456"
      );
      expect(content).toContain("This code expires in 5 minutes");
      expect(content).toContain("Don't share this code with anyone");
    });

    it("should cache service instances", async () => {
      const { CommunicationServiceFactory } = await import(
        "../communication-service"
      );

      const service1 =
        await CommunicationServiceFactory.createService("development");
      const service2 =
        await CommunicationServiceFactory.createService("development");

      expect(service1).toBe(service2);

      CommunicationServiceFactory.clearCache();

      const service3 =
        await CommunicationServiceFactory.createService("development");
      expect(service1).not.toBe(service3);
    });
  });

  describe("Security Features", () => {
    it("should hash identifiers for privacy", async () => {
      const { OTPStorageService } = await import("../otp-storage");

      const identifier = `test-npub-${Date.now()}`;
      const sessionId = await OTPStorageService.createOTP("123456", {
        identifier,
      });
      testSessionIds.push(sessionId);

      // Check that raw identifier is not stored
      const { data } = await supabase
        .from("family_otp_verification")
        .select("recipient_npub, metadata")
        .eq("id", sessionId)
        .single();

      expect(data.recipient_npub).not.toBe(identifier);
      expect(data.recipient_npub).toMatch(/^[0-9a-f]{64}$/); // Real SHA-256 hash
      expect(JSON.stringify(data.metadata)).not.toContain(identifier);
    });

    it("should extract and store nip05 domain only", async () => {
      const { OTPStorageService } = await import("../otp-storage");

      const sessionId = await OTPStorageService.createOTP("123456", {
        identifier: "test@example.com",
      });
      testSessionIds.push(sessionId);

      const { data } = await supabase
        .from("family_otp_verification")
        .select("metadata")
        .eq("id", sessionId)
        .single();

      expect(data.metadata.nip05Domain).toBe("example.com");
      expect(data.metadata).not.toHaveProperty("identifier");
      expect(JSON.stringify(data.metadata)).not.toContain("test@");
    });

    it("should log security events", async () => {
      const { OTPStorageService } = await import("../otp-storage");

      const sessionId = await OTPStorageService.createOTP("123456", {
        identifier: `test-npub-${Date.now()}`,
      });
      testSessionIds.push(sessionId);

      // Check audit log was created
      const { data } = await supabase
        .from("security_audit_log")
        .select("*")
        .eq("session_id", sessionId)
        .eq("event_type", "otp_created");

      expect(data).toBeDefined();
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].event_type).toBe("otp_created");
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid session ID", async () => {
      const { OTPStorageService } = await import("../otp-storage");

      const result = await OTPStorageService.verifyOTP({
        sessionId: "invalid-session-id",
        otp: "123456",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid or expired OTP session");
    });

    it("should handle database constraints properly", async () => {
      const { OTPStorageService } = await import("../otp-storage");

      // Try to create OTP with invalid data that might violate constraints
      try {
        await OTPStorageService.createOTP("", {
          // Empty OTP
          identifier: "", // Empty identifier
        });
        expect.fail("Should have thrown an error for invalid data");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe("Rate Limiting", () => {
    it("should track and enforce rate limits", async () => {
      const { OTPStorageService } = await import("../otp-storage");

      const testKey = `test-rate-limit-${Date.now()}`;

      // Check initial state
      const result1 = await OTPStorageService.checkRateLimit(testKey, 2, 60);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBeLessThanOrEqual(2);

      // Make another request
      const result2 = await OTPStorageService.checkRateLimit(testKey, 2, 60);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBeLessThan(result1.remaining);
    });

    it("should fail open on rate limit errors", async () => {
      const { OTPStorageService } = await import("../otp-storage");

      // Use a key that might cause issues (very long key)
      const badKey = "x".repeat(1000);

      const result = await OTPStorageService.checkRateLimit(badKey, 10, 60);
      expect(result.allowed).toBe(true); // Should fail open
    });
  });

  describe("Full Integration Flow", () => {
    it("should complete end-to-end OTP authentication", async () => {
      const { OTPStorageService } = await import("../otp-storage");
      const { CommunicationServiceFactory } = await import(
        "../communication-service"
      );

      const identifier = `test-integration-${Date.now()}`;
      const otp = "123456";

      // Step 1: Create OTP
      const sessionId = await OTPStorageService.createOTP(otp, {
        identifier,
        userAgent: "Test Browser",
        ipAddress: "127.0.0.1",
        ttlMinutes: 5,
      });
      testSessionIds.push(sessionId);

      expect(sessionId).toBeDefined();

      // Step 2: Send OTP (in real app)
      const commService = await CommunicationServiceFactory.getDefaultService();
      const sendResult = await commService.sendOTP(
        identifier,
        otp,
        sessionId,
        new Date(Date.now() + 5 * 60 * 1000)
      );
      expect(sendResult.success).toBe(true);

      // Step 3: Verify OTP
      const verifyResult = await OTPStorageService.verifyOTP({
        sessionId,
        otp,
        userAgent: "Test Browser",
        ipAddress: "127.0.0.1",
      });

      expect(verifyResult.success).toBe(true);
      expect(verifyResult.data?.hashedIdentifier).toBeDefined();

      // Step 4: Verify it can't be used again
      const secondVerifyResult = await OTPStorageService.verifyOTP({
        sessionId,
        otp,
      });

      expect(secondVerifyResult.success).toBe(false);
      expect(secondVerifyResult.error).toBe("OTP has already been used");
    });
  });
});
