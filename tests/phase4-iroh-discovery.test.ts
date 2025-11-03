/**
 * Phase 4: Iroh Node Discovery Integration Tests
 * Phase 2 Week 3: Real Integration Testing
 *
 * Tests real Iroh node discovery via DHT.
 * Discovers and verifies real Iroh nodes using iroh-proxy endpoint.
 *
 * Test Coverage:
 * - Discover Iroh nodes via DHT
 * - Verify node reachability
 * - Get node information
 * - Validate node ID format
 * - Handle discovery errors
 * - Batch operations
 */

import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  discoverIrohNode,
  verifyIrohNode,
  getIrohNodeInfo,
  isValidNodeId,
  generateTestNodeId,
  isValidDiscoveryResponse,
  isValidVerifyResponse,
  discoverMultipleNodes,
  verifyMultipleNodes,
  IrohDiscoveryResponse,
  IrohVerifyResponse,
} from "./setup/iroh-discovery";
import { mockSimpleProofAPI, restoreOriginalFetch } from "./setup/simpleproof-mock";

// ============================================================================
// TEST SETUP
// ============================================================================

beforeEach(() => {
  mockSimpleProofAPI();
});

afterEach(() => {
  restoreOriginalFetch();
});

// ============================================================================
// IROH NODE DISCOVERY TESTS
// ============================================================================

describe("Phase 4: Iroh Node Discovery", () => {
  describe("Node ID Validation", () => {
    it("should validate node ID format", () => {
      const validNodeId = generateTestNodeId();
      const invalidNodeId = "invalid-node-id";

      expect(isValidNodeId(validNodeId)).toBe(true);
      expect(isValidNodeId(invalidNodeId)).toBe(false);
    });

    it("should generate valid test node IDs", () => {
      for (let i = 0; i < 5; i++) {
        const nodeId = generateTestNodeId();
        expect(isValidNodeId(nodeId)).toBe(true);
        expect(nodeId.length).toBe(52);
        expect(/^[a-z2-7]{52}$/.test(nodeId)).toBe(true);
      }
    });
  });

  describe("Node Discovery", () => {
    it("should discover Iroh node via DHT", async () => {
      const nodeId = generateTestNodeId();
      const result = await discoverIrohNode(nodeId);

      expect(result).toBeDefined();
      expect(result.node_id).toBe(nodeId);
      expect(isValidDiscoveryResponse(result)).toBe(true);
    });

    it("should include discovery metadata", async () => {
      const nodeId = generateTestNodeId();
      const result = await discoverIrohNode(nodeId);

      expect(result.discovered_at).toBeDefined();
      expect(typeof result.discovered_at).toBe("number");
      expect(result.discovered_at).toBeGreaterThan(0);
    });

    it("should handle discovery with custom verification ID", async () => {
      const nodeId = generateTestNodeId();
      const verificationId = `test-verification-${Date.now()}`;

      const result = await discoverIrohNode(nodeId, verificationId);

      expect(result).toBeDefined();
      expect(result.node_id).toBe(nodeId);
    });

    it("should discover multiple nodes", async () => {
      const nodeIds = [generateTestNodeId(), generateTestNodeId(), generateTestNodeId()];

      const results = await discoverMultipleNodes(nodeIds);

      expect(results.length).toBe(3);
      results.forEach((result, index) => {
        expect(result.node_id).toBe(nodeIds[index]);
        expect(isValidDiscoveryResponse(result)).toBe(true);
      });
    });
  });

  describe("Node Verification", () => {
    it("should verify node reachability", async () => {
      const nodeId = generateTestNodeId();
      const result = await verifyIrohNode(nodeId);

      expect(result).toBeDefined();
      expect(typeof result.is_reachable).toBe("boolean");
      expect(isValidVerifyResponse(result)).toBe(true);
    });

    it("should include verification metadata", async () => {
      const nodeId = generateTestNodeId();
      const result = await verifyIrohNode(nodeId);

      expect(result.last_seen).toBeDefined();
      expect(typeof result.last_seen).toBe("number");
      expect(result.cached).toBeDefined();
      expect(typeof result.cached).toBe("boolean");
    });

    it("should verify multiple nodes", async () => {
      const nodeIds = [generateTestNodeId(), generateTestNodeId(), generateTestNodeId()];

      const results = await verifyMultipleNodes(nodeIds);

      expect(results.length).toBe(3);
      results.forEach((result) => {
        expect(isValidVerifyResponse(result)).toBe(true);
      });
    });

    it("should handle verification errors gracefully", async () => {
      const nodeId = generateTestNodeId();
      const result = await verifyIrohNode(nodeId);

      // Should return result object even if verification fails
      expect(result).toBeDefined();
      expect(result.success !== undefined).toBe(true);
    });
  });

  describe("Node Information", () => {
    it("should get node information", async () => {
      const nodeId = generateTestNodeId();
      const info = await getIrohNodeInfo(nodeId);

      // May return null if node not found, but should not throw
      expect(info === null || typeof info === "object").toBe(true);
    });

    it("should include node metadata in info", async () => {
      const nodeId = generateTestNodeId();
      const info = await getIrohNodeInfo(nodeId);

      if (info) {
        expect(info.node_id).toBeDefined();
        expect(typeof info.node_id).toBe("string");
      }
    });
  });

  describe("Discovery Response Validation", () => {
    it("should validate discovery response structure", async () => {
      const nodeId = generateTestNodeId();
      const result = await discoverIrohNode(nodeId);

      expect(isValidDiscoveryResponse(result)).toBe(true);
      expect(result.success !== undefined).toBe(true);
      expect(result.node_id).toBe(nodeId);
      expect(typeof result.is_reachable).toBe("boolean");
      expect(typeof result.discovered_at).toBe("number");
    });

    it("should validate verify response structure", async () => {
      const nodeId = generateTestNodeId();
      const result = await verifyIrohNode(nodeId);

      expect(isValidVerifyResponse(result)).toBe(true);
      expect(result.success !== undefined).toBe(true);
      expect(typeof result.is_reachable).toBe("boolean");
      expect(typeof result.last_seen).toBe("number");
      expect(typeof result.cached).toBe("boolean");
    });
  });

  describe("Relay URL Handling", () => {
    it("should handle relay URLs in discovery response", async () => {
      const nodeId = generateTestNodeId();
      const result = await discoverIrohNode(nodeId);

      // Relay URL can be null or a string
      expect(
        result.relay_url === null || typeof result.relay_url === "string"
      ).toBe(true);
    });

    it("should handle direct addresses in discovery response", async () => {
      const nodeId = generateTestNodeId();
      const result = await discoverIrohNode(nodeId);

      // Direct addresses can be null or an array
      expect(
        result.direct_addresses === null ||
          Array.isArray(result.direct_addresses)
      ).toBe(true);
    });

    it("should handle relay URLs in verify response", async () => {
      const nodeId = generateTestNodeId();
      const result = await verifyIrohNode(nodeId);

      // Relay URL can be null or a string
      expect(
        result.relay_url === null || typeof result.relay_url === "string"
      ).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle discovery errors gracefully", async () => {
      const nodeId = generateTestNodeId();

      // Should not throw, should return error in response
      const result = await discoverIrohNode(nodeId);
      expect(result).toBeDefined();
    });

    it("should handle verification errors gracefully", async () => {
      const nodeId = generateTestNodeId();

      // Should not throw, should return error in response
      const result = await verifyIrohNode(nodeId);
      expect(result).toBeDefined();
    });

    it("should include error messages when available", async () => {
      const nodeId = generateTestNodeId();
      const result = await discoverIrohNode(nodeId);

      // If not successful, should have error message
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe("Batch Operations", () => {
    it("should discover multiple nodes in parallel", async () => {
      const nodeIds = Array.from({ length: 5 }, () => generateTestNodeId());

      const startTime = Date.now();
      const results = await discoverMultipleNodes(nodeIds);
      const duration = Date.now() - startTime;

      expect(results.length).toBe(5);
      expect(duration).toBeLessThan(30000); // Should complete in reasonable time
    });

    it("should verify multiple nodes in parallel", async () => {
      const nodeIds = Array.from({ length: 5 }, () => generateTestNodeId());

      const startTime = Date.now();
      const results = await verifyMultipleNodes(nodeIds);
      const duration = Date.now() - startTime;

      expect(results.length).toBe(5);
      expect(duration).toBeLessThan(30000); // Should complete in reasonable time
    });
  });
});

