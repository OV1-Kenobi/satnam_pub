/**
 * Integration Tests for OTP Authentication System
 *
 * These tests verify the complete OTP flow from initiation to verification,
 * including rate limiting, security measures, and Supabase integration.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestSupabaseClient } from "../../lib/__tests__/test-setup";

// Mock the API request/response types
const mockRequest = (method: string, body: any = {}, headers: any = {}) => ({
  method,
  body,
  headers: {
    "content-type": "application/json",
    "user-agent": "Mozilla/5.0 Test Browser",
    "x-forwarded-for": "192.168.1.1",
    ...headers,
  },
  socket: { remoteAddress: "192.168.1.1" },
});

const mockResponse = () => {
  const res: any = {
    statusCode: 200,
    headers: {},
    body: null,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };

  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });

  res.json.mockImplementation((data: any) => {
    res.body = data;
    return res;
  });

  return res;
};

// Mock the utility functions
vi.mock("../../utils/otp-storage", () => ({
  OTPStorageService: {
    createOTP: vi.fn(),
    verifyOTP: vi.fn(),
    checkRateLimit: vi.fn(),
    cleanupExpiredOTPs: vi.fn(),
  },
  OTP_CONFIG: {
    DEFAULT_TTL_MINUTES: 5,
    MAX_ATTEMPTS: 3,
    RATE_LIMITS: {
      INITIATE_PER_IDENTIFIER_PER_HOUR: 10,
      INITIATE_PER_IP_PER_HOUR: 50,
      VERIFY_PER_SESSION_PER_MINUTE: 5,
      VERIFY_PER_IP_PER_MINUTE: 20,
    },
  },
}));

vi.mock("../../utils/communication-service", () => ({
  CommunicationServiceFactory: {
    getDefaultService: vi.fn().mockResolvedValue({
      sendOTP: vi
        .fn()
        .mockResolvedValue({ success: true, messageId: "test-123" }),
    }),
  },
}));

describe("OTP Authentication Integration", () => {
  let supabase: any;
  let otpInitiateHandler: any;
  let otpVerifyHandler: any;
  let mockOTPStorage: any;
  let mockCommunicationService: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    supabase = getTestSupabaseClient();

    // Import handlers after mocks are set up
    const { default: otpInitiate } = await import("../auth/otp-initiate");
    const { default: otpVerify } = await import("../auth/otp-verify");

    otpInitiateHandler = otpInitiate;
    otpVerifyHandler = otpVerify;

    // Get mock references
    const { OTPStorageService } = await import("../../utils/otp-storage");
    const { CommunicationServiceFactory } = await import(
      "../../utils/communication-service"
    );

    mockOTPStorage = OTPStorageService;
    mockCommunicationService =
      await CommunicationServiceFactory.getDefaultService();

    // Setup default successful responses
    mockOTPStorage.checkRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 10,
      resetTime: new Date(Date.now() + 60 * 60 * 1000),
    });

    mockOTPStorage.createOTP.mockResolvedValue("test-session-id-123");
    mockOTPStorage.cleanupExpiredOTPs.mockResolvedValue(0);

    mockOTPStorage.verifyOTP.mockResolvedValue({
      success: true,
      data: { hashedIdentifier: "hashed-test-identifier" },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("OTP Initiation Endpoint", () => {
    it("should handle valid OTP initiation request", async () => {
      const req = mockRequest("POST", {
        npub: "npub1test123456789",
      });
      const res = mockResponse();

      await otpInitiateHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sessionId).toBe("test-session-id-123");
      expect(res.body.data.message).toBe("OTP sent successfully");
      expect(res.body.data.expiresIn).toBe(300); // 5 minutes
      expect(res.body.data.recipient).toBe("npub1test123456789");

      // Should have rate limit info
      expect(res.body.meta.rateLimits).toBeDefined();
      expect(res.body.meta.rateLimits.ipRemaining).toBe(10);
      expect(res.body.meta.rateLimits.identifierRemaining).toBe(10);
    });

    it("should handle nip05 identifier", async () => {
      const req = mockRequest("POST", {
        nip05: "alice@satnam.pub",
      });
      const res = mockResponse();

      await otpInitiateHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.recipient).toBe("alice@satnam.pub");

      expect(mockOTPStorage.createOTP).toHaveBeenCalledWith(
        expect.any(String), // OTP
        expect.objectContaining({
          identifier: "alice@satnam.pub",
          userAgent: "Mozilla/5.0 Test Browser",
          ipAddress: "192.168.1.1",
          ttlMinutes: 5,
        })
      );
    });

    it("should handle pubkey with fallback identifier", async () => {
      const req = mockRequest("POST", {
        pubkey: "abcdef123456789",
      });
      const res = mockResponse();

      await otpInitiateHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.recipient).toBe("npub_derived_abcdef12");
    });

    it("should prioritize npub over other identifiers", async () => {
      const req = mockRequest("POST", {
        npub: "npub1priority",
        nip05: "test@example.com",
        pubkey: "fallback123",
      });
      const res = mockResponse();

      await otpInitiateHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.recipient).toBe("npub1priority");
    });

    it("should reject request without identifiers", async () => {
      const req = mockRequest("POST", {});
      const res = mockResponse();

      await otpInitiateHandler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe(
        "At least one identifier (npub, pubkey, or nip05) is required"
      );
    });

    it("should handle invalid request data", async () => {
      const req = mockRequest("POST", {
        nip05: "invalid-email",
      });
      const res = mockResponse();

      await otpInitiateHandler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Invalid request data");
      expect(res.body.details).toBeDefined();
    });

    it("should handle IP rate limiting", async () => {
      mockOTPStorage.checkRateLimit.mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        resetTime: new Date(Date.now() + 30 * 60 * 1000),
      });

      const req = mockRequest("POST", { npub: "npub1test123" });
      const res = mockResponse();

      await otpInitiateHandler(req, res);

      expect(res.statusCode).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Too many OTP requests from this IP address");
      expect(res.body.retryAfter).toBeGreaterThan(0);
    });

    it("should handle identifier rate limiting", async () => {
      mockOTPStorage.checkRateLimit
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 10,
          resetTime: new Date(),
        })
        .mockResolvedValueOnce({
          allowed: false,
          remaining: 0,
          resetTime: new Date(Date.now() + 15 * 60 * 1000),
        });

      const req = mockRequest("POST", { npub: "npub1test123" });
      const res = mockResponse();

      await otpInitiateHandler(req, res);

      expect(res.statusCode).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Too many OTP requests for this identifier");
    });

    it("should handle communication service failure gracefully", async () => {
      mockCommunicationService.sendOTP.mockResolvedValue({
        success: false,
        error: "Network error",
      });

      const req = mockRequest("POST", { npub: "npub1test123" });
      const res = mockResponse();

      await otpInitiateHandler(req, res);

      // Should still succeed even if communication fails
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should handle storage service failure", async () => {
      mockOTPStorage.createOTP.mockRejectedValue(new Error("Database error"));

      const req = mockRequest("POST", { npub: "npub1test123" });
      const res = mockResponse();

      await otpInitiateHandler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Failed to initiate OTP authentication");
    });

    it("should include OTP in development mode", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const req = mockRequest("POST", { npub: "npub1test123" });
      const res = mockResponse();

      await otpInitiateHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.otp).toBeDefined();
      expect(res.body.data.otp).toMatch(/^\d{6}$/);

      process.env.NODE_ENV = originalEnv;
    });

    it("should not include OTP in production mode", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const req = mockRequest("POST", { npub: "npub1test123" });
      const res = mockResponse();

      await otpInitiateHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.otp).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it("should handle OPTIONS request", async () => {
      const req = mockRequest("OPTIONS");
      const res = mockResponse();

      await otpInitiateHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.end).toHaveBeenCalled();
    });

    it("should reject non-POST requests", async () => {
      const req = mockRequest("GET");
      const res = mockResponse();

      await otpInitiateHandler(req, res);

      expect(res.statusCode).toBe(405);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Method not allowed");
      expect(res.setHeader).toHaveBeenCalledWith("Allow", ["POST"]);
    });
  });

  describe("OTP Verification Endpoint", () => {
    it("should handle valid OTP verification", async () => {
      // Mock successful auth session creation
      const mockSupabaseRpc = vi
        .fn()
        .mockResolvedValue({ data: null, error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockSupabaseRpc);

      const req = mockRequest("POST", {
        sessionId: "test-session-id-123",
        otp: "123456",
      });
      const res = mockResponse();

      await otpVerifyHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.sessionToken).toBeDefined();
      expect(res.body.data.expiresAt).toBeDefined();
      expect(res.body.data.message).toBe("Authentication successful");

      // Should set secure cookie
      expect(res.setHeader).toHaveBeenCalledWith(
        "Set-Cookie",
        expect.stringContaining("session=")
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Set-Cookie",
        expect.stringContaining("HttpOnly")
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Set-Cookie",
        expect.stringContaining("SameSite=Strict")
      );
    });

    it("should handle invalid session ID", async () => {
      mockOTPStorage.verifyOTP.mockResolvedValue({
        success: false,
        error: "Invalid or expired OTP session",
      });

      const req = mockRequest("POST", {
        sessionId: "invalid-session",
        otp: "123456",
      });
      const res = mockResponse();

      await otpVerifyHandler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Invalid or expired OTP session");
    });

    it("should handle expired OTP", async () => {
      mockOTPStorage.verifyOTP.mockResolvedValue({
        success: false,
        error: "OTP has expired",
      });

      const req = mockRequest("POST", {
        sessionId: "test-session-id",
        otp: "123456",
      });
      const res = mockResponse();

      await otpVerifyHandler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("OTP has expired");
    });

    it("should handle invalid OTP with attempts remaining", async () => {
      mockOTPStorage.verifyOTP.mockResolvedValue({
        success: false,
        error: "Invalid OTP",
        data: {
          hashedIdentifier: "test-hash",
          attemptsRemaining: 2,
        },
      });

      const req = mockRequest("POST", {
        sessionId: "test-session-id",
        otp: "wrong-otp",
      });
      const res = mockResponse();

      await otpVerifyHandler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Invalid OTP");
      expect(res.body.attemptsRemaining).toBe(2);
    });

    it("should handle maximum attempts exceeded", async () => {
      mockOTPStorage.verifyOTP.mockResolvedValue({
        success: false,
        error: "Maximum OTP attempts exceeded",
      });

      const req = mockRequest("POST", {
        sessionId: "test-session-id",
        otp: "123456",
      });
      const res = mockResponse();

      await otpVerifyHandler(req, res);

      expect(res.statusCode).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Maximum OTP attempts exceeded");
    });

    it("should handle session rate limiting", async () => {
      mockOTPStorage.checkRateLimit.mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        resetTime: new Date(Date.now() + 60 * 1000),
      });

      const req = mockRequest("POST", {
        sessionId: "test-session-id",
        otp: "123456",
      });
      const res = mockResponse();

      await otpVerifyHandler(req, res);

      expect(res.statusCode).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe(
        "Too many verification attempts for this session"
      );
      expect(res.body.retryAfter).toBeGreaterThan(0);
    });

    it("should handle IP rate limiting", async () => {
      mockOTPStorage.checkRateLimit
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 5,
          resetTime: new Date(),
        })
        .mockResolvedValueOnce({
          allowed: false,
          remaining: 0,
          resetTime: new Date(Date.now() + 60 * 1000),
        });

      const req = mockRequest("POST", {
        sessionId: "test-session-id",
        otp: "123456",
      });
      const res = mockResponse();

      await otpVerifyHandler(req, res);

      expect(res.statusCode).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe(
        "Too many verification attempts from this IP"
      );
    });

    it("should handle auth session creation failure", async () => {
      // Mock failed auth session creation
      const mockSupabaseRpc = vi.fn().mockResolvedValue({
        data: null,
        error: new Error("Session creation failed"),
      });
      vi.mocked(supabase.rpc).mockImplementation(mockSupabaseRpc);

      const req = mockRequest("POST", {
        sessionId: "test-session-id",
        otp: "123456",
      });
      const res = mockResponse();

      await otpVerifyHandler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Failed to create authentication session");
    });

    it("should validate request data", async () => {
      const req = mockRequest("POST", {
        sessionId: "", // Invalid: empty string
        otp: "12345", // Invalid: only 5 digits
      });
      const res = mockResponse();

      await otpVerifyHandler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Invalid request data");
      expect(res.body.details).toBeDefined();
    });

    it("should include Secure flag in cookies for production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      // Mock successful auth session creation
      const mockSupabaseRpc = vi
        .fn()
        .mockResolvedValue({ data: null, error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockSupabaseRpc);

      const req = mockRequest("POST", {
        sessionId: "test-session-id",
        otp: "123456",
      });
      const res = mockResponse();

      await otpVerifyHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Set-Cookie",
        expect.stringContaining("Secure")
      );

      process.env.NODE_ENV = originalEnv;
    });

    it("should handle OPTIONS request", async () => {
      const req = mockRequest("OPTIONS");
      const res = mockResponse();

      await otpVerifyHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.end).toHaveBeenCalled();
    });

    it("should reject non-POST requests", async () => {
      const req = mockRequest("GET");
      const res = mockResponse();

      await otpVerifyHandler(req, res);

      expect(res.statusCode).toBe(405);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Method not allowed");
    });

    it("should apply progressive delay for security", async () => {
      const startTime = Date.now();

      const req = mockRequest("POST", {
        sessionId: "test-session-id",
        otp: "123456",
      });
      const res = mockResponse();

      await otpVerifyHandler(req, res);

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      // Should take at least 500ms due to security delay
      expect(elapsed).toBeGreaterThanOrEqual(500);
    });
  });

  describe("End-to-End OTP Flow", () => {
    it("should complete full OTP authentication flow", async () => {
      // Step 1: Initiate OTP
      const initiateReq = mockRequest("POST", {
        npub: "npub1test123456789",
      });
      const initiateRes = mockResponse();

      await otpInitiateHandler(initiateReq, initiateRes);

      expect(initiateRes.statusCode).toBe(200);
      expect(initiateRes.body.success).toBe(true);

      const sessionId = initiateRes.body.data.sessionId;
      expect(sessionId).toBe("test-session-id-123");

      // Step 2: Verify OTP
      // Mock successful auth session creation
      const mockSupabaseRpc = vi
        .fn()
        .mockResolvedValue({ data: null, error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockSupabaseRpc);

      const verifyReq = mockRequest("POST", {
        sessionId,
        otp: "123456",
      });
      const verifyRes = mockResponse();

      await otpVerifyHandler(verifyReq, verifyRes);

      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.user).toBeDefined();
      expect(verifyRes.body.data.sessionToken).toBeDefined();

      // Verify that both storage service calls happened correctly
      expect(mockOTPStorage.createOTP).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          identifier: "npub1test123456789",
        })
      );

      expect(mockOTPStorage.verifyOTP).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "test-session-id-123",
          otp: "123456",
        })
      );
    });

    it("should maintain security through the entire flow", async () => {
      // Initiate with rate limiting checks
      const initiateReq = mockRequest("POST", { npub: "npub1test123" });
      const initiateRes = mockResponse();

      await otpInitiateHandler(initiateReq, initiateRes);

      // Should have checked both IP and identifier rate limits
      expect(mockOTPStorage.checkRateLimit).toHaveBeenCalledTimes(2);
      expect(mockOTPStorage.checkRateLimit).toHaveBeenCalledWith(
        expect.stringContaining("otp_initiate_192.168.1.1"),
        50,
        60
      );
      expect(mockOTPStorage.checkRateLimit).toHaveBeenCalledWith(
        expect.stringMatching(/otp_initiate_id_[a-f0-9]+/),
        10,
        60
      );

      // Clear mocks for verification step
      vi.clearAllMocks();
      mockOTPStorage.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 5,
        resetTime: new Date(),
      });
      mockOTPStorage.verifyOTP.mockResolvedValue({
        success: true,
        data: { hashedIdentifier: "hashed-identifier" },
      });

      // Verify with rate limiting checks
      const verifyReq = mockRequest("POST", {
        sessionId: "test-session-id-123",
        otp: "123456",
      });
      const verifyRes = mockResponse();

      const mockSupabaseRpc = vi
        .fn()
        .mockResolvedValue({ data: null, error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockSupabaseRpc);

      await otpVerifyHandler(verifyReq, verifyRes);

      // Should have checked both session and IP rate limits for verification
      expect(mockOTPStorage.checkRateLimit).toHaveBeenCalledTimes(2);
      expect(mockOTPStorage.checkRateLimit).toHaveBeenCalledWith(
        "otp_verify_session_test-session-id-123",
        5,
        1
      );
      expect(mockOTPStorage.checkRateLimit).toHaveBeenCalledWith(
        "otp_verify_ip_192.168.1.1",
        20,
        1
      );
    });
  });
});
