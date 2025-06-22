// Vitest test for Authentication Success Handler Utility
// File: src/utils/__tests__/authSuccessHandler.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NWCAuthResponse, VerificationResponse } from "../../types/auth";
import {
  handleAuthenticationSuccess,
  isSuccessfulAuthResponse,
} from "../authSuccessHandler";

describe("authSuccessHandler", () => {
  const mockLogin = vi.fn();
  const mockSetAuthStep = vi.fn();
  const mockSetMessage = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockOTPResponse: VerificationResponse = {
    success: true,
    data: {
      authenticated: true,
      userAuth: {
        npub: "npub1test",
        nip05: "test@example.com",
        federationRole: "parent",
        isWhitelisted: true,
        votingPower: 100,
        guardianApproved: true,
      },
      sessionToken: "test-token-123",
      verificationMethod: "nostr-dm",
    },
  };

  const mockNWCResponse: NWCAuthResponse = {
    success: true,
    data: {
      userAuth: {
        npub: "npub1test",
        nip05: "test@example.com",
        federationRole: "parent",
        isWhitelisted: true,
        votingPower: 100,
        guardianApproved: true,
      },
      sessionToken: "test-token-123",
    },
  };

  describe("isSuccessfulAuthResponse", () => {
    it("should return true for successful OTP response", () => {
      expect(isSuccessfulAuthResponse(mockOTPResponse)).toBe(true);
    });

    it("should return true for successful NWC response", () => {
      expect(isSuccessfulAuthResponse(mockNWCResponse)).toBe(true);
    });

    it("should return false for failed response", () => {
      const failedResponse = { success: false, error: "Authentication failed" };
      expect(isSuccessfulAuthResponse(failedResponse as any)).toBe(false);
    });

    it("should return false for response without data", () => {
      const responseWithoutData = { success: true, data: null };
      expect(isSuccessfulAuthResponse(responseWithoutData as any)).toBe(false);
    });
  });

  describe("handleAuthenticationSuccess", () => {
    it("should handle OTP authentication success correctly", () => {
      const result = handleAuthenticationSuccess(mockOTPResponse, "otp", {
        setAuthStep: mockSetAuthStep,
        setMessage: mockSetMessage,
        login: mockLogin,
        onSuccess: mockOnSuccess,
      });

      // Check that user data is created correctly
      expect(result.userData).toEqual({
        npub: "npub1test",
        nip05: "test@example.com",
        federationRole: "parent",
        authMethod: "otp",
        isWhitelisted: true,
        votingPower: 100,
        guardianApproved: true,
        sessionToken: "test-token-123",
      });

      // Check that message includes verification method for OTP
      expect(result.message).toContain("Verification method: nostr-dm");
      expect(result.message).toContain("Role: parent");
      expect(result.message).toContain("Voting power: 100");

      // Check that functions were called
      expect(mockSetAuthStep).toHaveBeenCalledWith("authenticated");
      expect(mockSetMessage).toHaveBeenCalledWith(result.message);
      expect(mockLogin).toHaveBeenCalledWith(result.userData);
      expect(mockOnSuccess).toHaveBeenCalledWith(result.userData);
    });

    it("should handle NWC authentication success correctly", () => {
      const result = handleAuthenticationSuccess(mockNWCResponse, "nwc", {
        setAuthStep: mockSetAuthStep,
        setMessage: mockSetMessage,
        login: mockLogin,
        onSuccess: mockOnSuccess,
      });

      // Check that user data is created correctly
      expect(result.userData.authMethod).toBe("nwc");

      // Check that message doesn't include verification method for NWC
      expect(result.message).not.toContain("Verification method:");
      expect(result.message).toContain("NWC Authentication successful!");
      expect(result.message).toContain("Role: parent");
      expect(result.message).toContain("Voting power: 100");

      // Check that functions were called
      expect(mockLogin).toHaveBeenCalledWith(result.userData);
      expect(mockOnSuccess).toHaveBeenCalledWith(result.userData);
    });

    it("should use custom message prefix when provided", () => {
      const customPrefix = "Custom success message!";
      const result = handleAuthenticationSuccess(mockOTPResponse, "otp", {
        login: mockLogin,
        messagePrefix: customPrefix,
      });

      expect(result.message).toContain(customPrefix);
    });

    it("should handle modal mode with onClose callback", () => {
      vi.useFakeTimers();

      handleAuthenticationSuccess(mockNWCResponse, "nwc", {
        login: mockLogin,
        onClose: mockOnClose,
        mode: "modal",
      });

      // Fast-forward time
      vi.advanceTimersByTime(2000);

      expect(mockOnClose).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should handle page mode with redirect", () => {
      vi.useFakeTimers();

      // Mock window.location
      const mockLocation = { href: "" };
      Object.defineProperty(window, "location", {
        value: mockLocation,
        writable: true,
      });

      handleAuthenticationSuccess(mockNWCResponse, "nwc", {
        login: mockLogin,
        mode: "page",
        redirectUrl: "/custom-redirect",
      });

      // Fast-forward time
      vi.advanceTimersByTime(2000);

      expect(mockLocation.href).toBe("/custom-redirect");

      vi.useRealTimers();
    });

    it("should work without optional state setters", () => {
      expect(() => {
        handleAuthenticationSuccess(mockOTPResponse, "otp", {
          login: mockLogin,
        });
      }).not.toThrow();
    });
  });
});
