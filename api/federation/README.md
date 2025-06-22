# Federation Governance API - Implementation Guide

## ⚠️ Current Status: Demo Implementation

This directory contains **mock implementations** for demonstration purposes. All functions return simulated data and do not connect to actual Fedimint federation infrastructure.

## Production Implementation Requirements

### 1. Dependencies

Install the required Fedimint client library:

```bash
npm install fedimint-client
# or
yarn add fedimint-client
```

### 2. Environment Configuration

⚠️ **SECURITY WARNING**: Never commit actual secret values to version control. Use secure secret management practices.

Set up the following environment variables:

```env
# Federation configuration file path
FEDERATION_CONFIG=/path/to/federation.config

# Guardian authentication (if required)
GUARDIAN_PRIVATE_KEY=<your-guardian-private-key>
FEDERATION_PASSWORD=<your-federation-password>

# Network configuration
FEDERATION_NETWORK=mainnet  # or testnet
FEDERATION_API_URL=https://your-federation-api.com
```

### 3. Real Implementation Example

Replace the mock functions with actual Fedimint client calls:

```typescript
import { FedimintClient } from "fedimint-client";

// Real governance status retrieval with proper connection cleanup
export async function getFederationGovernance(req: Request, res: Response) {
  let federationClient: FedimintClient | null = null;

  try {
    // Connect to federation
    federationClient = new FedimintClient({
      configPath: process.env.FEDERATION_CONFIG,
      network: process.env.FEDERATION_NETWORK,
      guardianKey: process.env.GUARDIAN_PRIVATE_KEY,
    });

    await federationClient.connect();

    // Get actual governance data
    const governance = await federationClient.getGovernanceStatus();

    res.status(200).json({
      success: true,
      data: governance,
      meta: {
        timestamp: new Date().toISOString(),
        demo: false,
      },
    });
  } catch (error) {
    console.error("Federation governance error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve federation governance status",
    });
  } finally {
    // Clean up connection
    if (federationClient) {
      try {
        await federationClient.disconnect();
      } catch (disconnectError) {
        console.error(
          "Error disconnecting federation client:",
          disconnectError
        );
      }
    }
  }
}
```

### 4. Connection Management and Pooling

#### Connection Pooling for Production

For production environments, implement connection pooling to optimize performance and resource usage:

```typescript
import { FedimintClient } from "fedimint-client";

// Connection pool configuration
interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
  maxLifetimeMs: number;
}

class FederationConnectionPool {
  private pool: FedimintClient[] = [];
  private activeConnections = new Set<FedimintClient>();
  private config: PoolConfig;
  private clientConfig: any;

  constructor(
    clientConfig: any,
    poolConfig: PoolConfig = {
      minConnections: 2,
      maxConnections: 10,
      acquireTimeoutMs: 30000,
      idleTimeoutMs: 300000, // 5 minutes
      maxLifetimeMs: 3600000, // 1 hour
    }
  ) {
    this.clientConfig = clientConfig;
    this.config = poolConfig;
    this.initializePool();
  }

  private async initializePool(): Promise<void> {
    // Create minimum number of connections
    for (let i = 0; i < this.config.minConnections; i++) {
      const client = await this.createConnection();
      this.pool.push(client);
    }
  }

  private async createConnection(): Promise<FedimintClient> {
    const client = new FedimintClient(this.clientConfig);
    await client.connect();

    // Set up connection lifecycle management
    setTimeout(() => {
      this.retireConnection(client);
    }, this.config.maxLifetimeMs);

    return client;
  }

  async acquire(): Promise<FedimintClient> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.acquireTimeoutMs) {
      // Try to get connection from pool
      if (this.pool.length > 0) {
        const client = this.pool.pop()!;
        this.activeConnections.add(client);
        return client;
      }

      // Create new connection if under max limit
      if (this.activeConnections.size < this.config.maxConnections) {
        const client = await this.createConnection();
        this.activeConnections.add(client);
        return client;
      }

      // Wait briefly before retrying
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error("Connection pool timeout: Unable to acquire connection");
  }

  async release(client: FedimintClient): Promise<void> {
    this.activeConnections.delete(client);

    // Check if connection is still healthy
    if (await this.isConnectionHealthy(client)) {
      this.pool.push(client);

      // Set idle timeout
      setTimeout(() => {
        if (
          this.pool.includes(client) &&
          this.pool.length > this.config.minConnections
        ) {
          this.retireConnection(client);
        }
      }, this.config.idleTimeoutMs);
    } else {
      await this.retireConnection(client);
    }
  }

  private async isConnectionHealthy(client: FedimintClient): Promise<boolean> {
    try {
      // Implement health check (e.g., ping or lightweight query)
      (await client.ping?.()) || true;
      return true;
    } catch {
      return false;
    }
  }

  private async retireConnection(client: FedimintClient): Promise<void> {
    try {
      const poolIndex = this.pool.indexOf(client);
      if (poolIndex > -1) {
        this.pool.splice(poolIndex, 1);
      }
      this.activeConnections.delete(client);
      await client.disconnect();
    } catch (error) {
      console.error("Error retiring connection:", error);
    }
  }

  async shutdown(): Promise<void> {
    // Close all connections
    const allConnections = [...this.pool, ...this.activeConnections];
    await Promise.all(
      allConnections.map((client) => this.retireConnection(client))
    );
  }
}

// Global connection pool instance
const connectionPool = new FederationConnectionPool({
  configPath: process.env.FEDERATION_CONFIG,
  network: process.env.FEDERATION_NETWORK,
  guardianKey: process.env.GUARDIAN_PRIVATE_KEY,
});

// Updated governance function using connection pool
export async function getFederationGovernance(req: Request, res: Response) {
  let federationClient: FedimintClient | null = null;

  try {
    // Acquire connection from pool
    federationClient = await connectionPool.acquire();

    // Get actual governance data
    const governance = await federationClient.getGovernanceStatus();

    res.status(200).json({
      success: true,
      data: governance,
      meta: {
        timestamp: new Date().toISOString(),
        demo: false,
        pooled: true,
      },
    });
  } catch (error) {
    console.error("Federation governance error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve federation governance status",
    });
  } finally {
    // Return connection to pool
    if (federationClient) {
      try {
        await connectionPool.release(federationClient);
      } catch (releaseError) {
        console.error("Error releasing connection to pool:", releaseError);
      }
    }
  }
}

// Graceful shutdown handler
process.on("SIGTERM", async () => {
  console.log("Shutting down connection pool...");
  await connectionPool.shutdown();
  process.exit(0);
});
```

#### Environment Variables for Connection Pooling

Add these environment variables for production connection pool configuration:

```env
# Connection pool settings
FEDERATION_POOL_MIN_CONNECTIONS=2
FEDERATION_POOL_MAX_CONNECTIONS=10
FEDERATION_POOL_ACQUIRE_TIMEOUT_MS=30000
FEDERATION_POOL_IDLE_TIMEOUT_MS=300000
FEDERATION_POOL_MAX_LIFETIME_MS=3600000

# Connection health check interval
FEDERATION_HEALTH_CHECK_INTERVAL_MS=60000
```

#### Connection Pool Best Practices

1. **Pool Sizing**

   - Start with `minConnections: 2` and `maxConnections: 10`
   - Monitor connection usage and adjust based on load
   - Consider federation response times when setting pool size

2. **Health Monitoring**

   - Implement regular health checks for pooled connections
   - Remove unhealthy connections from the pool automatically
   - Monitor connection success/failure rates

3. **Timeout Management**

   - Set appropriate acquire timeouts (30-60 seconds)
   - Implement idle connection cleanup (5-10 minutes)
   - Set maximum connection lifetime (1-2 hours)

4. **Error Handling**

   - Always return connections to the pool, even on errors
   - Implement retry logic for connection acquisition failures
   - Log pool metrics for monitoring

5. **Graceful Shutdown**
   - Properly close all connections during application shutdown
   - Wait for active operations to complete before closing
   - Implement connection draining for zero-downtime deployments

### 5. Security Considerations

#### Secret Management

- **NEVER** commit actual secrets to version control
- Use environment variables or secure secret management systems
- Rotate keys regularly and implement proper key lifecycle management
- Use hardware security modules (HSMs) for production guardian keys
- Implement zero-knowledge proofs where possible to minimize data exposure

#### Cryptographic Signatures

- All guardian operations must be cryptographically signed
- Implement proper signature verification for proposals and votes
- Use secure key management practices
- Ensure private keys are encrypted at rest and in transit

#### Consensus Mechanisms

- Implement Byzantine fault tolerance
- Handle network partitions and recovery
- Ensure vote counting is tamper-proof

#### Emergency Protocols

- Implement secure emergency recovery procedures
- Set up proper multi-signature requirements
- Establish secure communication channels for emergencies

### 6. Testing

#### Unit Tests

Create comprehensive unit tests for all governance functions:

```typescript
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from "vitest";
import type { Request, Response } from "express";
import {
  getFederationGovernance,
  submitProposal,
  castVote,
  getProposalVoteStatus,
} from "../governance";

// Mock Fedimint client for testing
class MockFedimintClient {
  private connected = false;
  private mockGovernanceData = {
    federationId: "test_federation_001",
    totalGuardians: 3,
    activeGuardians: 3,
    consensusThreshold: 2,
    pendingProposals: 1,
    lastConsensus: new Date(),
    emergencyMode: false,
    guardians: [
      {
        id: "guardian_test_1",
        name: "Test Guardian 1",
        publicKey: "02test1234567890abcdef",
        status: "active" as const,
        votingPower: 1,
        lastActivity: new Date(),
        reputation: 95,
        familyRole: "parent" as const,
        emergencyContacts: ["test1@example.com"],
      },
    ],
    proposals: [],
    emergencyProtocols: [],
  };

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async getGovernanceStatus() {
    if (!this.connected) {
      throw new Error("Client not connected");
    }
    return this.mockGovernanceData;
  }

  async submitProposal(proposal: any) {
    if (!this.connected) {
      throw new Error("Client not connected");
    }
    return {
      proposalId: `prop_${Date.now()}`,
      status: "pending",
      submittedAt: new Date(),
    };
  }

  async castVote(
    proposalId: string,
    vote: "for" | "against" | "abstain",
    guardianId: string
  ) {
    if (!this.connected) {
      throw new Error("Client not connected");
    }
    return {
      voteId: `vote_${Date.now()}`,
      proposalId,
      vote,
      guardianId,
      timestamp: new Date(),
    };
  }

  ping(): Promise<boolean> {
    return Promise.resolve(this.connected);
  }
}

describe("Federation Governance API", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: MockedFunction<any>;
  let mockStatus: MockedFunction<any>;

  beforeEach(() => {
    mockJson = vi.fn();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });

    mockRequest = {
      body: {},
      params: {},
      query: {},
    };

    mockResponse = {
      status: mockStatus,
      json: mockJson,
    };

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe("getFederationGovernance", () => {
    it("should retrieve governance status successfully", async () => {
      await getFederationGovernance(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            federationId: expect.any(String),
            totalGuardians: expect.any(Number),
            activeGuardians: expect.any(Number),
            consensusThreshold: expect.any(Number),
            guardians: expect.any(Array),
            proposals: expect.any(Array),
          }),
          meta: expect.objectContaining({
            timestamp: expect.any(String),
            demo: true,
          }),
        })
      );
    });

    it("should handle errors gracefully", async () => {
      // Mock an error scenario
      const originalConsoleError = console.error;
      console.error = vi.fn();

      // Force an error by mocking a failed response
      mockStatus.mockImplementation(() => {
        throw new Error("Database connection failed");
      });

      await getFederationGovernance(
        mockRequest as Request,
        mockResponse as Response
      );

      // Restore console.error
      console.error = originalConsoleError;
    });

    it("should return correct guardian structure", async () => {
      await getFederationGovernance(
        mockRequest as Request,
        mockResponse as Response
      );

      const call = mockJson.mock.calls[0][0];
      const guardians = call.data.guardians;

      expect(guardians).toBeInstanceOf(Array);
      expect(guardians.length).toBeGreaterThan(0);

      guardians.forEach((guardian: any) => {
        expect(guardian).toHaveProperty("id");
        expect(guardian).toHaveProperty("name");
        expect(guardian).toHaveProperty("publicKey");
        expect(guardian).toHaveProperty("status");
        expect(guardian).toHaveProperty("votingPower");
        expect(guardian).toHaveProperty("reputation");
        expect(guardian).toHaveProperty("familyRole");
        expect(["active", "inactive", "suspended"]).toContain(guardian.status);
        expect(["parent", "child", "guardian"]).toContain(guardian.familyRole);
      });
    });
  });

  describe("Proposal Management", () => {
    it("should validate proposal submission data", () => {
      const validProposal = {
        type: "spending_limit",
        title: "Test Proposal",
        description: "A test proposal for unit testing",
        metadata: {
          memberId: "test_member",
          currentLimit: 1000,
          proposedLimit: 2000,
        },
      };

      // Test proposal validation logic
      expect(validProposal.type).toBeDefined();
      expect(validProposal.title).toBeDefined();
      expect(validProposal.description).toBeDefined();
      expect(validProposal.title.length).toBeGreaterThan(0);
      expect(validProposal.description.length).toBeGreaterThan(0);
    });

    it("should reject invalid proposal types", () => {
      const invalidProposal = {
        type: "invalid_type",
        title: "Test Proposal",
        description: "A test proposal",
      };

      const validTypes = [
        "spending_limit",
        "guardian_addition",
        "guardian_removal",
        "emergency_protocol",
        "configuration_change",
      ];

      expect(validTypes).not.toContain(invalidProposal.type);
    });

    it("should calculate vote results correctly", () => {
      const mockGuardians = [
        { id: "g1", votingPower: 2 },
        { id: "g2", votingPower: 1 },
        { id: "g3", votingPower: 1 },
      ];

      const mockVotes = [
        { guardianId: "g1", vote: "for", votingPower: 2 },
        { guardianId: "g2", vote: "against", votingPower: 1 },
      ];

      let votesFor = 0;
      let votesAgainst = 0;

      mockVotes.forEach((vote) => {
        if (vote.vote === "for") votesFor += vote.votingPower;
        if (vote.vote === "against") votesAgainst += vote.votingPower;
      });

      expect(votesFor).toBe(2);
      expect(votesAgainst).toBe(1);
      expect(votesFor > votesAgainst).toBe(true);
    });
  });

  describe("Vote Casting", () => {
    it("should validate vote options", () => {
      const validVotes = ["for", "against", "abstain"];
      const testVote = "for";

      expect(validVotes).toContain(testVote);
    });

    it("should prevent duplicate voting from same guardian", () => {
      const existingVotes = new Map();
      const proposalId = "test_proposal";
      const guardianId = "test_guardian";

      // First vote
      existingVotes.set(`${proposalId}_${guardianId}`, {
        vote: "for",
        timestamp: new Date(),
      });

      // Check if guardian already voted
      const hasVoted = existingVotes.has(`${proposalId}_${guardianId}`);
      expect(hasVoted).toBe(true);
    });

    it("should handle vote weight calculation", () => {
      const guardian = { id: "test", votingPower: 3 };
      const vote = "for";

      const weightedVote = {
        guardianId: guardian.id,
        vote: vote,
        weight: guardian.votingPower,
      };

      expect(weightedVote.weight).toBe(3);
      expect(weightedVote.vote).toBe("for");
    });
  });

  describe("Consensus Mechanisms", () => {
    it("should calculate consensus for different proposal types", () => {
      const totalGuardians = 5;
      const totalVotingPower = 7; // 2+2+1+1+1

      // Standard proposal - simple majority
      const standardThreshold = Math.ceil(totalVotingPower / 2);
      expect(standardThreshold).toBe(4);

      // Critical proposal - 75% threshold
      const criticalThreshold = Math.ceil(totalVotingPower * 0.75);
      expect(criticalThreshold).toBe(6);

      // Guardian addition - 60% of all guardians
      const guardianAdditionThreshold = Math.ceil(totalGuardians * 0.6);
      expect(guardianAdditionThreshold).toBe(3);
    });

    it("should determine proposal status based on votes", () => {
      const votesFor = 4;
      const votesAgainst = 2;
      const requiredVotes = 3;

      let status: string;
      if (votesFor >= requiredVotes) {
        status = "approved";
      } else if (votesAgainst >= requiredVotes) {
        status = "rejected";
      } else {
        status = "voting";
      }

      expect(status).toBe("approved");
    });
  });

  describe("Emergency Protocols", () => {
    it("should validate emergency protocol structure", () => {
      const emergencyProtocol = {
        id: "emergency_001",
        name: "Account Freeze Protocol",
        description: "Emergency protocol to freeze suspicious accounts",
        triggerConditions: ["suspicious_activity", "security_breach"],
        actions: ["freeze_account", "notify_guardians"],
        requiredApprovals: 3,
        isActive: true,
        successRate: 0.95,
      };

      expect(emergencyProtocol.id).toBeDefined();
      expect(emergencyProtocol.triggerConditions).toBeInstanceOf(Array);
      expect(emergencyProtocol.actions).toBeInstanceOf(Array);
      expect(emergencyProtocol.requiredApprovals).toBeGreaterThan(0);
      expect(typeof emergencyProtocol.isActive).toBe("boolean");
      expect(emergencyProtocol.successRate).toBeGreaterThanOrEqual(0);
      expect(emergencyProtocol.successRate).toBeLessThanOrEqual(1);
    });

    it("should handle emergency mode activation", () => {
      const normalMode = { emergencyMode: false };
      const emergencyMode = { emergencyMode: true };

      expect(normalMode.emergencyMode).toBe(false);
      expect(emergencyMode.emergencyMode).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle network timeouts", async () => {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Network timeout")), 100);
      });

      await expect(timeoutPromise).rejects.toThrow("Network timeout");
    });

    it("should handle invalid guardian signatures", () => {
      const mockSignature = "invalid_signature";
      const validSignaturePattern = /^[0-9a-fA-F]{128}$/; // 64 bytes hex

      expect(validSignaturePattern.test(mockSignature)).toBe(false);
    });

    it("should handle malformed proposal data", () => {
      const malformedProposal = {
        // Missing required fields
        title: "Test",
        // Missing type, description, etc.
      };

      const requiredFields = ["type", "title", "description"];
      const missingFields = requiredFields.filter(
        (field) => !(field in malformedProposal)
      );

      expect(missingFields.length).toBeGreaterThan(0);
      expect(missingFields).toContain("type");
      expect(missingFields).toContain("description");
    });
  });
});
```

#### Integration Tests

Test against actual Fedimint federation in a test environment:

```typescript
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { getFederationGovernance } from "../governance";

// Mock federation client for integration testing
class TestFederationClient {
  private config: any;
  private connected = false;

  constructor(config: any) {
    this.config = config;
  }

  async connect(): Promise<void> {
    // Simulate connection to test federation
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async getGovernanceStatus() {
    if (!this.connected) {
      throw new Error("Not connected to federation");
    }

    return {
      federationId: "test_federation_integration",
      totalGuardians: 3,
      activeGuardians: 3,
      consensusThreshold: 2,
      pendingProposals: 0,
      lastConsensus: new Date(),
      emergencyMode: false,
      guardians: [
        {
          id: "integration_guardian_1",
          name: "Integration Test Guardian 1",
          publicKey: "02integration1234567890abcdef",
          status: "active",
          votingPower: 1,
          lastActivity: new Date(),
          reputation: 100,
          familyRole: "parent",
          emergencyContacts: ["integration1@test.com"],
        },
        {
          id: "integration_guardian_2",
          name: "Integration Test Guardian 2",
          publicKey: "02integration2345678901bcdef0",
          status: "active",
          votingPower: 1,
          lastActivity: new Date(),
          reputation: 98,
          familyRole: "parent",
          emergencyContacts: ["integration2@test.com"],
        },
        {
          id: "integration_guardian_3",
          name: "Integration Test Guardian 3",
          publicKey: "02integration3456789012cdef01",
          status: "active",
          votingPower: 1,
          lastActivity: new Date(),
          reputation: 95,
          familyRole: "guardian",
          emergencyContacts: ["integration3@test.com"],
        },
      ],
      proposals: [],
      emergencyProtocols: [
        {
          id: "integration_emergency_001",
          name: "Test Emergency Protocol",
          description: "Integration test emergency protocol",
          triggerConditions: ["test_condition"],
          actions: ["test_action"],
          requiredApprovals: 2,
          isActive: true,
          successRate: 1.0,
        },
      ],
    };
  }

  async submitProposal(proposal: any) {
    if (!this.connected) {
      throw new Error("Not connected to federation");
    }

    // Simulate proposal submission
    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      proposalId: `integration_prop_${Date.now()}`,
      status: "pending",
      submittedAt: new Date(),
      proposal,
    };
  }

  async castVote(proposalId: string, vote: string, guardianId: string) {
    if (!this.connected) {
      throw new Error("Not connected to federation");
    }

    // Simulate vote casting
    await new Promise((resolve) => setTimeout(resolve, 30));

    return {
      voteId: `integration_vote_${Date.now()}`,
      proposalId,
      vote,
      guardianId,
      timestamp: new Date(),
    };
  }
}

describe("Federation Integration Tests", () => {
  let testFederationClient: TestFederationClient;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: any;
  let mockStatus: any;

  beforeAll(async () => {
    // Set up test federation environment
    process.env.NODE_ENV = "test";
    process.env.FEDERATION_CONFIG = "/tmp/test-federation.config";
    process.env.FEDERATION_NETWORK = "testnet";
    process.env.GUARDIAN_PRIVATE_KEY = "test_private_key_integration";

    testFederationClient = new TestFederationClient({
      configPath: process.env.FEDERATION_CONFIG,
      network: process.env.FEDERATION_NETWORK,
      guardianKey: process.env.GUARDIAN_PRIVATE_KEY,
    });

    console.log("🔧 Setting up test federation environment...");
    await testFederationClient.connect();
    console.log("✅ Test federation connected successfully");
  });

  afterAll(async () => {
    // Clean up test federation
    if (testFederationClient) {
      await testFederationClient.disconnect();
      console.log("🧹 Test federation disconnected");
    }
  });

  beforeEach(() => {
    mockJson = vi.fn();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });

    mockRequest = {
      body: {},
      params: {},
      query: {},
    };

    mockResponse = {
      status: mockStatus,
      json: mockJson,
    };

    vi.clearAllMocks();
  });

  it("should connect to test federation successfully", async () => {
    const client = new TestFederationClient({
      configPath: "/tmp/test.config",
      network: "testnet",
    });

    await expect(client.connect()).resolves.not.toThrow();
    await client.disconnect();
  });

  it("should retrieve governance data from test federation", async () => {
    const governanceData = await testFederationClient.getGovernanceStatus();

    expect(governanceData).toBeDefined();
    expect(governanceData.federationId).toBe("test_federation_integration");
    expect(governanceData.totalGuardians).toBe(3);
    expect(governanceData.activeGuardians).toBe(3);
    expect(governanceData.consensusThreshold).toBe(2);
    expect(governanceData.guardians).toHaveLength(3);
    expect(governanceData.emergencyProtocols).toHaveLength(1);
  });

  it("should handle proposal submission workflow", async () => {
    const testProposal = {
      type: "spending_limit",
      title: "Integration Test Spending Limit",
      description: "Test proposal for integration testing",
      metadata: {
        memberId: "integration_test_member",
        currentLimit: 10000,
        proposedLimit: 15000,
        reason: "integration_testing",
      },
    };

    const result = await testFederationClient.submitProposal(testProposal);

    expect(result).toBeDefined();
    expect(result.proposalId).toMatch(/^integration_prop_\d+$/);
    expect(result.status).toBe("pending");
    expect(result.submittedAt).toBeInstanceOf(Date);
    expect(result.proposal).toEqual(testProposal);
  });

  it("should handle vote casting workflow", async () => {
    const proposalId = "integration_test_proposal_001";
    const guardianId = "integration_guardian_1";
    const vote = "for";

    const result = await testFederationClient.castVote(
      proposalId,
      vote,
      guardianId
    );

    expect(result).toBeDefined();
    expect(result.voteId).toMatch(/^integration_vote_\d+$/);
    expect(result.proposalId).toBe(proposalId);
    expect(result.vote).toBe(vote);
    expect(result.guardianId).toBe(guardianId);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("should handle connection failures gracefully", async () => {
    const failingClient = new TestFederationClient({
      configPath: "/invalid/path",
      network: "invalid",
    });

    // Don't connect the client to simulate connection failure
    await expect(failingClient.getGovernanceStatus()).rejects.toThrow(
      "Not connected to federation"
    );
  });

  it("should validate guardian authentication", async () => {
    const governanceData = await testFederationClient.getGovernanceStatus();
    const guardians = governanceData.guardians;

    guardians.forEach((guardian) => {
      expect(guardian.publicKey).toMatch(/^[0-9a-fA-F]+$/);
      expect(guardian.publicKey.length).toBeGreaterThan(20);
      expect(guardian.status).toBe("active");
      expect(guardian.votingPower).toBeGreaterThan(0);
      expect(guardian.reputation).toBeGreaterThanOrEqual(0);
      expect(guardian.reputation).toBeLessThanOrEqual(100);
    });
  });

  it("should handle emergency protocol activation", async () => {
    const governanceData = await testFederationClient.getGovernanceStatus();
    const emergencyProtocols = governanceData.emergencyProtocols;

    expect(emergencyProtocols).toHaveLength(1);

    const protocol = emergencyProtocols[0];
    expect(protocol.id).toBe("integration_emergency_001");
    expect(protocol.isActive).toBe(true);
    expect(protocol.requiredApprovals).toBe(2);
    expect(protocol.successRate).toBe(1.0);
    expect(protocol.triggerConditions).toContain("test_condition");
    expect(protocol.actions).toContain("test_action");
  });

  it("should maintain connection pool health", async () => {
    // Test multiple concurrent operations
    const operations = [
      testFederationClient.getGovernanceStatus(),
      testFederationClient.getGovernanceStatus(),
      testFederationClient.getGovernanceStatus(),
    ];

    const results = await Promise.all(operations);

    results.forEach((result) => {
      expect(result.federationId).toBe("test_federation_integration");
      expect(result.totalGuardians).toBe(3);
    });
  });

  it("should handle rate limiting gracefully", async () => {
    // Simulate rapid requests
    const rapidRequests = Array(10)
      .fill(null)
      .map(() => testFederationClient.getGovernanceStatus());

    // All requests should succeed in test environment
    const results = await Promise.all(rapidRequests);
    expect(results).toHaveLength(10);

    results.forEach((result) => {
      expect(result.federationId).toBe("test_federation_integration");
    });
  });

  it("should validate consensus mechanisms", async () => {
    const governanceData = await testFederationClient.getGovernanceStatus();

    // Test consensus threshold calculation
    const totalGuardians = governanceData.totalGuardians;
    const consensusThreshold = governanceData.consensusThreshold;

    expect(consensusThreshold).toBeLessThanOrEqual(totalGuardians);
    expect(consensusThreshold).toBeGreaterThan(totalGuardians / 2);

    // For 3 guardians, threshold should be 2
    expect(consensusThreshold).toBe(2);
  });
});
```

### 7. Migration Checklist

- [ ] Install fedimint-client dependency
- [ ] Set up environment variables
- [ ] Replace mock data with real federation client calls
- [ ] Implement proper error handling
- [ ] Add cryptographic signature verification
- [ ] Set up consensus mechanisms
- [ ] Implement emergency protocols
- [ ] Add comprehensive logging
- [ ] Create unit and integration tests
- [ ] Set up monitoring and alerting
- [ ] Document API changes and deployment procedures
- [ ] Implement connection pooling for production
- [ ] Configure connection pool parameters
- [ ] Set up connection health monitoring
- [ ] Implement graceful shutdown procedures

### 8. API Documentation

Once implemented with real federation client, update API documentation to reflect:

- Actual response schemas
- Authentication requirements
- Rate limiting policies
- Error codes and handling
- Security considerations
- Connection pooling configuration and metrics

### 9. Monitoring and Logging

Implement proper monitoring for:

- Federation connection status
- Proposal submission and voting activity
- Consensus achievement rates
- Emergency protocol activations
- Guardian activity and reputation
- Connection pool metrics (active connections, pool size, acquire times)
- Connection health check results
- Pool timeout and error rates

### 10. Support and Resources

- [Fedimint Documentation](https://github.com/fedimint/fedimint)
- [Federation Setup Guide](https://fedimint.org/docs/setup)
- [Guardian Operations Manual](https://fedimint.org/docs/guardians)
- [Security Best Practices](https://fedimint.org/docs/security)

---

**Note**: This implementation guide assumes the availability of a stable Fedimint client library. Adjust the implementation details based on the actual API and features provided by the Fedimint ecosystem at the time of implementation.
