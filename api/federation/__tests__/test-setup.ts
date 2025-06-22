/**
 * Test Setup for Federation Governance Tests
 *
 * Shared test utilities and setup for federation governance testing
 */

import { vi } from "vitest";

// Mock environment variables for testing
export const mockEnvVars = {
  NODE_ENV: "test",
  FEDERATION_CONFIG: "/tmp/test-federation.config",
  FEDERATION_NETWORK: "testnet",
  GUARDIAN_PRIVATE_KEY: "test_private_key",
  FEDERATION_PASSWORD: "test_password",
  FEDERATION_API_URL: "https://test-federation.example.com",

  // Connection pool settings
  FEDERATION_POOL_MIN_CONNECTIONS: "2",
  FEDERATION_POOL_MAX_CONNECTIONS: "5",
  FEDERATION_POOL_ACQUIRE_TIMEOUT_MS: "10000",
  FEDERATION_POOL_IDLE_TIMEOUT_MS: "60000",
  FEDERATION_POOL_MAX_LIFETIME_MS: "300000",
};

// Setup test environment
export function setupTestEnvironment() {
  // Set mock environment variables
  Object.entries(mockEnvVars).forEach(([key, value]) => {
    process.env[key] = value;
  });

  // Mock console methods to reduce test noise
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
}

// Cleanup test environment
export function cleanupTestEnvironment() {
  // Restore environment variables
  Object.keys(mockEnvVars).forEach((key) => {
    delete process.env[key];
  });

  // Restore console methods
  vi.restoreAllMocks();
}

// Mock federation data generators
export const mockDataGenerators = {
  generateGuardian: (id: string, overrides: any = {}) => ({
    id,
    name: `Test Guardian ${id}`,
    publicKey: `02${id.padEnd(32, "0")}`,
    status: "active" as const,
    votingPower: 1,
    lastActivity: new Date(),
    reputation: 95,
    familyRole: "guardian" as const,
    emergencyContacts: [`${id}@test.com`],
    ...overrides,
  }),

  generateProposal: (id: string, overrides: any = {}) => ({
    id,
    type: "spending_limit" as const,
    title: `Test Proposal ${id}`,
    description: `Test proposal description for ${id}`,
    proposer: "test_guardian",
    status: "pending" as const,
    votesFor: 0,
    votesAgainst: 0,
    requiredVotes: 2,
    createdAt: new Date(),
    votingDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    metadata: {},
    ...overrides,
  }),

  generateEmergencyProtocol: (id: string, overrides: any = {}) => ({
    id,
    name: `Test Emergency Protocol ${id}`,
    description: `Test emergency protocol description for ${id}`,
    triggerConditions: ["test_condition"],
    actions: ["test_action"],
    requiredApprovals: 2,
    isActive: true,
    successRate: 1.0,
    ...overrides,
  }),

  generateVote: (
    proposalId: string,
    guardianId: string,
    overrides: any = {}
  ) => ({
    proposalId,
    guardianId,
    vote: "for" as const,
    reason: "Test vote reason",
    timestamp: new Date(),
    ...overrides,
  }),
};

// Test data validation helpers
export const validators = {
  validateGuardian: (guardian: any) => {
    expect(guardian).toHaveProperty("id");
    expect(guardian).toHaveProperty("name");
    expect(guardian).toHaveProperty("publicKey");
    expect(guardian).toHaveProperty("status");
    expect(guardian).toHaveProperty("votingPower");
    expect(guardian).toHaveProperty("reputation");
    expect(guardian).toHaveProperty("familyRole");
    expect(guardian).toHaveProperty("emergencyContacts");

    expect(["active", "inactive", "suspended"]).toContain(guardian.status);
    expect(["parent", "child", "guardian"]).toContain(guardian.familyRole);
    expect(guardian.votingPower).toBeGreaterThan(0);
    expect(guardian.reputation).toBeGreaterThanOrEqual(0);
    expect(guardian.reputation).toBeLessThanOrEqual(100);
    expect(guardian.emergencyContacts).toBeInstanceOf(Array);
  },

  validateProposal: (proposal: any) => {
    expect(proposal).toHaveProperty("id");
    expect(proposal).toHaveProperty("type");
    expect(proposal).toHaveProperty("title");
    expect(proposal).toHaveProperty("description");
    expect(proposal).toHaveProperty("proposer");
    expect(proposal).toHaveProperty("status");
    expect(proposal).toHaveProperty("votesFor");
    expect(proposal).toHaveProperty("votesAgainst");
    expect(proposal).toHaveProperty("requiredVotes");
    expect(proposal).toHaveProperty("createdAt");
    expect(proposal).toHaveProperty("votingDeadline");

    const validTypes = [
      "spending_limit",
      "guardian_addition",
      "guardian_removal",
      "emergency_protocol",
      "configuration_change",
    ];
    expect(validTypes).toContain(proposal.type);

    const validStatuses = [
      "pending",
      "voting",
      "approved",
      "rejected",
      "executed",
    ];
    expect(validStatuses).toContain(proposal.status);

    expect(proposal.votesFor).toBeGreaterThanOrEqual(0);
    expect(proposal.votesAgainst).toBeGreaterThanOrEqual(0);
    expect(proposal.requiredVotes).toBeGreaterThan(0);
    expect(proposal.createdAt).toBeInstanceOf(Date);
    expect(proposal.votingDeadline).toBeInstanceOf(Date);
  },

  validateEmergencyProtocol: (protocol: any) => {
    expect(protocol).toHaveProperty("id");
    expect(protocol).toHaveProperty("name");
    expect(protocol).toHaveProperty("description");
    expect(protocol).toHaveProperty("triggerConditions");
    expect(protocol).toHaveProperty("actions");
    expect(protocol).toHaveProperty("requiredApprovals");
    expect(protocol).toHaveProperty("isActive");
    expect(protocol).toHaveProperty("successRate");

    expect(protocol.triggerConditions).toBeInstanceOf(Array);
    expect(protocol.actions).toBeInstanceOf(Array);
    expect(protocol.requiredApprovals).toBeGreaterThan(0);
    expect(typeof protocol.isActive).toBe("boolean");
    expect(protocol.successRate).toBeGreaterThanOrEqual(0);
    expect(protocol.successRate).toBeLessThanOrEqual(1);
  },

  validateVote: (vote: any) => {
    expect(vote).toHaveProperty("proposalId");
    expect(vote).toHaveProperty("guardianId");
    expect(vote).toHaveProperty("vote");
    expect(vote).toHaveProperty("timestamp");

    expect(["for", "against", "abstain"]).toContain(vote.vote);
    expect(vote.timestamp).toBeInstanceOf(Date);
  },

  validateGovernanceResponse: (response: any) => {
    expect(response).toHaveProperty("success");
    expect(response).toHaveProperty("data");
    expect(response).toHaveProperty("meta");

    expect(response.success).toBe(true);
    expect(response.data).toHaveProperty("federationId");
    expect(response.data).toHaveProperty("totalGuardians");
    expect(response.data).toHaveProperty("activeGuardians");
    expect(response.data).toHaveProperty("consensusThreshold");
    expect(response.data).toHaveProperty("guardians");
    expect(response.data).toHaveProperty("proposals");
    expect(response.data).toHaveProperty("emergencyProtocols");

    expect(response.meta).toHaveProperty("timestamp");
    expect(response.meta.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    );
  },
};

// Performance testing helpers
export const performanceHelpers = {
  measureExecutionTime: async (fn: () => Promise<any>) => {
    const start = Date.now();
    const result = await fn();
    const end = Date.now();
    return {
      result,
      executionTime: end - start,
    };
  },

  generateLargeDataSet: (size: number, generator: (index: number) => any) => {
    return Array.from({ length: size }, (_, index) => generator(index));
  },

  testConcurrency: async (
    operations: (() => Promise<any>)[],
    maxConcurrency: number = 10
  ) => {
    const results = [];

    for (let i = 0; i < operations.length; i += maxConcurrency) {
      const batch = operations.slice(i, i + maxConcurrency);
      const batchResults = await Promise.all(batch.map((op) => op()));
      results.push(...batchResults);
    }

    return results;
  },
};

// Security testing helpers
export const securityHelpers = {
  generateMockSignature: (length: number = 140) => {
    return Array.from({ length }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
  },

  validateSignatureFormat: (signature: string) => {
    const signaturePattern = /^[0-9a-fA-F]{140,144}$/;
    return signaturePattern.test(signature);
  },

  generateMockPublicKey: (prefix: string = "02") => {
    const keyBody = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
    return prefix + keyBody;
  },

  validatePublicKeyFormat: (publicKey: string) => {
    return /^(02|03)[0-9a-fA-F]{64}$/.test(publicKey);
  },

  generateNonce: () => {
    return `nonce_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },
};

// Error simulation helpers
export const errorHelpers = {
  simulateNetworkError: () => {
    throw new Error("Network timeout");
  },

  simulateConnectionError: () => {
    throw new Error("Connection refused");
  },

  simulateAuthenticationError: () => {
    throw new Error("Authentication failed");
  },

  simulateConsensusError: () => {
    throw new Error("Consensus not reached");
  },

  createTimeoutPromise: (ms: number) => {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Operation timeout")), ms);
    });
  },
};

export default {
  setupTestEnvironment,
  cleanupTestEnvironment,
  mockDataGenerators,
  validators,
  performanceHelpers,
  securityHelpers,
  errorHelpers,
};
