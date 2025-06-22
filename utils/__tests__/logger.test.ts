/**
 * Logger Utility Tests
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, Logger } from "../logger";

// Mock console methods for testing
const originalConsole = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

const mockConsole = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("Logger", () => {
  beforeEach(() => {
    // Replace console methods with mocks
    console.debug = mockConsole.debug;
    console.info = mockConsole.info;
    console.warn = mockConsole.warn;
    console.error = mockConsole.error;

    // Clear all mocks
    Object.values(mockConsole).forEach((mock) => mock.mockClear());
  });

  afterAll(() => {
    // Restore original console methods
    console.debug = originalConsole.debug;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  describe("createLogger", () => {
    it("should create a logger with the specified module name", () => {
      const logger = createLogger("test-module");
      expect(logger).toBeInstanceOf(Logger);
    });

    it("should log info messages with structured format", () => {
      const logger = createLogger("test-module");
      logger.info("Test message", { key: "value" });

      expect(mockConsole.info).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.info.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.level).toBe("info");
      expect(logEntry.message).toBe("Test message");
      expect(logEntry.module).toBe("test-module");
      expect(logEntry.context).toEqual({ key: "value" });
      expect(logEntry.timestamp).toBeDefined();
    });

    it("should log error messages with error objects", () => {
      const logger = createLogger("test-module");
      const testError = new Error("Test error");

      logger.error("Error occurred", { operation: "test" }, testError);

      expect(mockConsole.error).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.error.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.level).toBe("error");
      expect(logEntry.message).toBe("Error occurred");
      expect(logEntry.context).toEqual({ operation: "test" });
      expect(logEntry.error).toEqual({
        name: "Error",
        message: "Test error",
        stack: testError.stack,
      });
    });
  });

  describe("Privacy Protection", () => {
    it("should sanitize sensitive keys in context", () => {
      const logger = createLogger("test-module");

      logger.info("Test message", {
        secret: "should-be-redacted",
        privateKey: "should-be-redacted",
        normalKey: "should-remain",
      });

      const logCall = mockConsole.info.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.context.secret).toBe("[REDACTED]");
      expect(logEntry.context.privateKey).toBe("[REDACTED]");
      expect(logEntry.context.normalKey).toBe("should-remain");
    });

    it("should truncate npub values", () => {
      const logger = createLogger("test-module");

      logger.info("Test message", {
        npub: "npub1234567890abcdef",
      });

      const logCall = mockConsole.info.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.context.npub).toBe("npub1234...");
    });

    it("should truncate pubkey values", () => {
      const logger = createLogger("test-module");

      logger.info("Test message", {
        pubkey: "1234567890abcdef1234567890abcdef",
      });

      const logCall = mockConsole.info.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.context.pubkey).toBe("12345678...");
    });

    it("should extract hostname from relay URLs", () => {
      const logger = createLogger("test-module");

      logger.info("Test message", {
        relay: "wss://relay.example.com/path?param=value",
      });

      const logCall = mockConsole.info.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.context.relay).toBe("relay.example.com");
    });

    it("should mask IP addresses", () => {
      const logger = createLogger("test-module");

      logger.info("Test message", {
        ip: "192.168.1.100",
      });

      const logCall = mockConsole.info.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.context.ip).toBe("192.168.xxx.xxx");
    });
  });

  describe("Log Levels", () => {
    it("should respect log level filtering", () => {
      const logger = createLogger("test-module", { level: "warn" });

      logger.debug("Debug message");
      logger.info("Info message");
      logger.warn("Warn message");
      logger.error("Error message");

      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
      expect(mockConsole.error).toHaveBeenCalledTimes(1);
    });
  });

  describe("Child Logger", () => {
    it("should create child logger with additional context", () => {
      const parentLogger = createLogger("parent-module");
      const childLogger = parentLogger.child({ requestId: "123" });

      childLogger.info("Child message", { operation: "test" });

      const logCall = mockConsole.info.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.context).toEqual({
        requestId: "123",
        operation: "test",
      });
    });
  });
});
