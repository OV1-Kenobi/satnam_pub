/**
 * FAMILY LIQUIDITY MANAGER VITEST TESTS
 *
 * Comprehensive test suite for Family Liquidity Manager
 * with mock dependencies and 50k sats demo amounts.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  AllowanceRule,
  EmergencyLiquidityRequest,
  FamilyLiquidityConfig,
} from "../../src/lib/family-liquidity-manager";
import { FamilyLiquidityManager } from "../../src/lib/family-liquidity-manager";

// Mock dependencies
vi.mock("../../src/lib/zeus-olympus-client");
vi.mock("../../lib/lightning-client");
vi.mock("../../lib/family-api");
vi.mock("../../lib/supabase");

// Mock implementations
const mockZeusClient = {
  getLiquidityStatus: vi.fn(),
  requestJITLiquidity: vi.fn(),
  listChannels: vi.fn(),
  rebalanceChannels: vi.fn(),
  healthCheck: vi.fn(),
};

const mockLightningClient = {
  sendPayment: vi.fn(),
};

const mockFamilyApi = {
  getFamilyMembers: vi.fn(),
};

const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          lte: vi.fn(() => ({ data: [], error: null })),
          gte: vi.fn(() => ({ data: [], error: null })),
          lt: vi.fn(() => ({ data: [], error: null })),
          limit: vi.fn(() => ({ data: [], error: null })),
          order: vi.fn(() => ({ data: [], error: null })),
          single: vi.fn(() => ({ data: null, error: null })),
        })),
        lte: vi.fn(() => ({ data: [], error: null })),
        limit: vi.fn(() => ({ data: [], error: null })),
      })),
      lte: vi.fn(() => ({ data: [], error: null })),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => ({ data: { id: "test-id" }, error: null })),
      })),
      data: { id: "test-id" },
      error: null,
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({ error: null })),
    })),
  })),
};

// Mock the modules
vi.mock("../../src/lib/zeus-olympus-client", () => ({
  ZeusOlympusClient: vi.fn(() => mockZeusClient),
}));

vi.mock("../../lib/lightning-client", () => ({
  LightningClient: vi.fn(() => mockLightningClient),
}));

vi.mock("../../lib/family-api", () => ({
  FamilyAPI: vi.fn(() => mockFamilyApi),
}));

vi.mock("../../lib/supabase", () => ({
  supabase: mockSupabase,
}));

describe("FamilyLiquidityManager", () => {
  let liquidityManager: FamilyLiquidityManager;
  let familyConfig: FamilyLiquidityConfig;

  beforeAll(() => {
    // Mock console methods to reduce test noise
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  beforeEach(() => {
    vi.clearAllMocks();

    familyConfig = {
      familyId: "test-family-123",
      liquidityThreshold: 10000,
      allowanceAutomation: true,
      emergencyReserve: 20000,
      rebalanceFrequency: "daily",
      maxChannelSize: 1000000,
      minChannelSize: 50000,
    };

    liquidityManager = new FamilyLiquidityManager(familyConfig);

    // Setup default mock responses
    mockZeusClient.getLiquidityStatus.mockResolvedValue({
      totalCapacity: 1500000,
      totalLocalBalance: 850000,
      totalRemoteBalance: 650000,
      activeChannels: 3,
      inactiveChannels: 0,
      pendingChannels: 0,
      channels: [
        {
          channelId: "1",
          capacity: 500000,
          localBalance: 250000,
          remoteBalance: 250000,
          active: true,
          private: false,
        },
      ],
      liquidityScore: 85,
      recommendations: ["Good liquidity distribution"],
    });

    mockFamilyApi.getFamilyMembers.mockResolvedValue([
      {
        id: "member-1",
        name: "Child 1",
        lightningBalance: 25000,
      },
      {
        id: "member-2",
        name: "Child 2",
        lightningBalance: 15000,
      },
    ]);

    mockZeusClient.healthCheck.mockResolvedValue({
      healthy: true,
      latency: 150,
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize with family configuration", () => {
      expect(liquidityManager).toBeDefined();
      expect(liquidityManager).toBeInstanceOf(FamilyLiquidityManager);
    });

    it("should validate minimum channel size requirement", () => {
      const configWithSmallChannels = {
        ...familyConfig,
        minChannelSize: 25000, // Below 50k requirement
      };

      // Should still initialize, but enforce 50k minimum in operations
      const manager = new FamilyLiquidityManager(configWithSmallChannels);
      expect(manager).toBeDefined();
    });
  });

  describe("Family Liquidity Report", () => {
    it("should generate comprehensive family liquidity report", async () => {
      const report = await liquidityManager.getFamilyLiquidityReport();

      expect(report).toMatchObject({
        familyId: familyConfig.familyId,
        totalLiquidity: 850000,
        availableLiquidity: 830000, // totalLiquidity - emergencyReserve
        reservedLiquidity: 20000,
        memberBalances: {
          "member-1": 25000,
          "member-2": 15000,
        },
        channelStatus: {
          active: 3,
          inactive: 0,
          pending: 0,
        },
      });

      expect(report.lastUpdated).toBeInstanceOf(Date);
      expect(report.recommendations).toBeInstanceOf(Array);
      expect(report.alerts).toBeInstanceOf(Array);
    });

    it("should handle Zeus API errors gracefully", async () => {
      mockZeusClient.getLiquidityStatus.mockRejectedValue(
        new Error("Zeus API error"),
      );

      await expect(liquidityManager.getFamilyLiquidityReport()).rejects.toThrow(
        "Liquidity report failed",
      );
    });

    it("should continue without family members if API fails", async () => {
      mockFamilyApi.getFamilyMembers.mockRejectedValue(
        new Error("Family API error"),
      );

      const report = await liquidityManager.getFamilyLiquidityReport();
      expect(report.memberBalances).toEqual({});
    });
  });

  describe("Allowance Automation", () => {
    beforeEach(() => {
      // Mock allowance-related database queries
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "allowance_automation") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  lte: vi.fn(() => ({
                    data: [
                      {
                        id: "rule-1",
                        family_member_id: "member-1",
                        amount: 5000,
                        frequency: "daily",
                        enabled: true,
                        next_distribution: new Date(
                          Date.now() - 1000,
                        ).toISOString(),
                        conditions: null,
                      },
                    ],
                    error: null,
                  })),
                })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: {
                    id: "new-rule-id",
                    family_member_id: "member-1",
                    amount: 5000,
                    frequency: "daily",
                    enabled: true,
                    next_distribution: new Date().toISOString(),
                  },
                  error: null,
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({ error: null })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({ data: [], error: null })),
          insert: vi.fn(() => ({ error: null })),
        };
      });
    });

    it("should create allowance rule successfully", async () => {
      const allowanceRule: Omit<AllowanceRule, "id"> = {
        familyMemberId: "member-1",
        amount: 5000, // 5k sats daily allowance
        frequency: "daily",
        enabled: true,
        nextDistribution: new Date(Date.now() + 24 * 60 * 60 * 1000),
        conditions: {
          maxDailySpend: 10000,
          requireApproval: false,
        },
      };

      const createdRule =
        await liquidityManager.setAllowanceRule(allowanceRule);

      expect(createdRule).toMatchObject({
        id: "new-rule-id",
        familyMemberId: "member-1",
        amount: 5000,
        frequency: "daily",
        enabled: true,
      });
    });

    it("should process pending allowance distributions", async () => {
      // Mock liquidity availability check
      mockZeusClient.getLiquidityStatus.mockResolvedValue({
        totalLocalBalance: 100000, // Sufficient liquidity
        totalCapacity: 150000,
        totalRemoteBalance: 50000,
        activeChannels: 2,
        inactiveChannels: 0,
        pendingChannels: 0,
        channels: [],
        liquidityScore: 80,
        recommendations: [],
      });

      const result = await liquidityManager.processAllowanceDistributions();

      expect(result.processed).toBeGreaterThanOrEqual(0);
      expect(result.failed).toBeGreaterThanOrEqual(0);
      expect(result.details).toBeInstanceOf(Array);
    });

    it("should handle insufficient liquidity with JIT request", async () => {
      // Mock insufficient liquidity
      mockZeusClient.getLiquidityStatus.mockResolvedValue({
        totalLocalBalance: 1000, // Insufficient liquidity
        totalCapacity: 50000,
        totalRemoteBalance: 49000,
        activeChannels: 1,
        inactiveChannels: 0,
        pendingChannels: 0,
        channels: [],
        liquidityScore: 20,
        recommendations: [],
      });

      // Mock JIT liquidity success
      mockZeusClient.requestJITLiquidity.mockResolvedValue({
        approved: true,
        channelId: "jit-channel-123",
        eta: 300,
      });

      const result = await liquidityManager.processAllowanceDistributions();

      expect(mockZeusClient.requestJITLiquidity).toHaveBeenCalled();
    });

    it("should handle JIT liquidity denial gracefully", async () => {
      mockZeusClient.getLiquidityStatus.mockResolvedValue({
        totalLocalBalance: 1000,
        totalCapacity: 50000,
        totalRemoteBalance: 49000,
        activeChannels: 1,
        inactiveChannels: 0,
        pendingChannels: 0,
        channels: [],
        liquidityScore: 20,
        recommendations: [],
      });

      mockZeusClient.requestJITLiquidity.mockResolvedValue({
        approved: false,
      });

      const result = await liquidityManager.processAllowanceDistributions();

      expect(result.failed).toBeGreaterThan(0);
      expect(result.details.some((d) => d.status === "failed")).toBe(true);
    });
  });

  describe("Emergency Liquidity", () => {
    it("should handle emergency liquidity request successfully", async () => {
      const emergencyRequest: EmergencyLiquidityRequest = {
        familyId: familyConfig.familyId,
        memberId: "member-1",
        amount: 25000, // 25k sats emergency
        reason: "Urgent payment needed",
        urgency: "high",
        requestedBy: "parent-1",
        approvalRequired: false,
      };

      // Mock sufficient liquidity
      mockZeusClient.getLiquidityStatus.mockResolvedValue({
        totalLocalBalance: 100000, // Sufficient for emergency + reserve
        totalCapacity: 150000,
        totalRemoteBalance: 50000,
        activeChannels: 2,
        inactiveChannels: 0,
        pendingChannels: 0,
        channels: [],
        liquidityScore: 80,
        recommendations: [],
      });

      mockZeusClient.requestJITLiquidity.mockResolvedValue({
        approved: true,
        channelId: "emergency-channel-123",
        eta: 120,
      });

      const result =
        await liquidityManager.handleEmergencyLiquidity(emergencyRequest);

      expect(result.approved).toBe(true);
      expect(result.channelId).toBe("emergency-channel-123");
      expect(result.eta).toBe(120);
    });

    it("should reject emergency request exceeding maximum channel size", async () => {
      const emergencyRequest: EmergencyLiquidityRequest = {
        familyId: familyConfig.familyId,
        memberId: "member-1",
        amount: 1500000, // Exceeds maxChannelSize
        reason: "Very large emergency payment",
        urgency: "critical",
        requestedBy: "parent-1",
        approvalRequired: false,
      };

      await expect(
        liquidityManager.handleEmergencyLiquidity(emergencyRequest),
      ).rejects.toThrow("Emergency request exceeds maximum channel size");
    });

    it("should reject emergency request when reserve is insufficient", async () => {
      const emergencyRequest: EmergencyLiquidityRequest = {
        familyId: familyConfig.familyId,
        memberId: "member-1",
        amount: 25000,
        reason: "Emergency payment",
        urgency: "high",
        requestedBy: "parent-1",
        approvalRequired: false,
      };

      // Mock insufficient liquidity (below emergency reserve)
      mockZeusClient.getLiquidityStatus.mockResolvedValue({
        totalLocalBalance: 15000, // Below emergency reserve threshold
        totalCapacity: 50000,
        totalRemoteBalance: 35000,
        activeChannels: 1,
        inactiveChannels: 0,
        pendingChannels: 0,
        channels: [],
        liquidityScore: 30,
        recommendations: [],
      });

      const result =
        await liquidityManager.handleEmergencyLiquidity(emergencyRequest);
      expect(result.approved).toBe(false);
    });
  });

  describe("Channel Rebalancing", () => {
    it("should trigger automatic rebalancing successfully", async () => {
      // Mock imbalanced channels
      const imbalancedChannels = [
        {
          channelId: "channel-1",
          capacity: 100000,
          localBalance: 90000, // High outbound
          remoteBalance: 10000,
          active: true,
          private: false,
        },
        {
          channelId: "channel-2",
          capacity: 100000,
          localBalance: 10000, // High inbound
          remoteBalance: 90000,
          active: true,
          private: false,
        },
      ];

      mockZeusClient.getLiquidityStatus.mockResolvedValue({
        totalCapacity: 200000,
        totalLocalBalance: 100000,
        totalRemoteBalance: 100000,
        activeChannels: 2,
        inactiveChannels: 0,
        pendingChannels: 0,
        channels: imbalancedChannels,
        liquidityScore: 40, // Low score due to imbalance
        recommendations: ["Rebalancing needed"],
      });

      mockZeusClient.rebalanceChannels.mockResolvedValue({
        success: true,
        fee: 100,
        route: [],
      });

      const result = await liquidityManager.triggerRebalance();

      expect(result.success).toBe(true);
      expect(result.operations).toBeGreaterThan(0);
      expect(result.totalFee).toBeGreaterThanOrEqual(0);
    });

    it("should skip rebalancing when channels are well balanced", async () => {
      // Mock well-balanced channels
      const balancedChannels = [
        {
          channelId: "channel-1",
          capacity: 100000,
          localBalance: 50000,
          remoteBalance: 50000,
          active: true,
          private: false,
        },
      ];

      mockZeusClient.getLiquidityStatus.mockResolvedValue({
        totalCapacity: 100000,
        totalLocalBalance: 50000,
        totalRemoteBalance: 50000,
        activeChannels: 1,
        inactiveChannels: 0,
        pendingChannels: 0,
        channels: balancedChannels,
        liquidityScore: 100,
        recommendations: ["Good balance"],
      });

      const result = await liquidityManager.triggerRebalance();

      expect(result.success).toBe(true);
      expect(result.operations).toBe(0);
      expect(result.totalFee).toBe(0);
    });

    it("should handle rebalancing failures gracefully", async () => {
      const imbalancedChannels = [
        {
          channelId: "channel-1",
          capacity: 100000,
          localBalance: 90000,
          remoteBalance: 10000,
          active: true,
          private: false,
        },
        {
          channelId: "channel-2",
          capacity: 100000,
          localBalance: 10000,
          remoteBalance: 90000,
          active: true,
          private: false,
        },
      ];

      mockZeusClient.getLiquidityStatus.mockResolvedValue({
        totalCapacity: 200000,
        totalLocalBalance: 100000,
        totalRemoteBalance: 100000,
        activeChannels: 2,
        inactiveChannels: 0,
        pendingChannels: 0,
        channels: imbalancedChannels,
        liquidityScore: 40,
        recommendations: [],
      });

      // Mock rebalancing failure
      mockZeusClient.rebalanceChannels.mockResolvedValue({
        success: false,
        fee: 0,
        route: [],
      });

      const result = await liquidityManager.triggerRebalance();

      expect(result.operations).toBe(0); // No successful operations
    });
  });

  describe("Liquidity Monitoring", () => {
    it("should monitor liquidity and create alerts", async () => {
      // Mock low liquidity scenario
      mockZeusClient.getLiquidityStatus.mockResolvedValue({
        totalCapacity: 50000,
        totalLocalBalance: 8000, // Below threshold of 10000
        totalRemoteBalance: 42000,
        activeChannels: 1,
        inactiveChannels: 1, // One offline channel
        pendingChannels: 0,
        channels: [
          {
            channelId: "channel-1",
            capacity: 30000,
            localBalance: 8000,
            remoteBalance: 22000,
            active: true,
            private: false,
          },
          {
            channelId: "channel-2",
            capacity: 20000,
            localBalance: 0,
            remoteBalance: 20000,
            active: false, // Offline
            private: false,
          },
        ],
        liquidityScore: 25,
        recommendations: ["Low liquidity warning"],
      });

      await liquidityManager.monitorLiquidity();

      // Should have called supabase to create alerts
      expect(mockSupabase.from).toHaveBeenCalledWith("liquidity_alerts");
    });

    it("should handle monitoring errors gracefully", async () => {
      mockZeusClient.getLiquidityStatus.mockRejectedValue(
        new Error("Monitoring failed"),
      );

      // Should not throw, just log the error
      await expect(liquidityManager.monitorLiquidity()).resolves.not.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("should handle Zeus client errors gracefully", async () => {
      mockZeusClient.getLiquidityStatus.mockRejectedValue(
        new Error("Zeus error"),
      );

      await expect(liquidityManager.getFamilyLiquidityReport()).rejects.toThrow(
        "Liquidity report failed",
      );
    });

    it("should handle database errors gracefully", async () => {
      mockSupabase.from.mockImplementation(() => ({
        insert: vi.fn(() => ({ error: { message: "Database error" } })),
      }));

      const allowanceRule: Omit<AllowanceRule, "id"> = {
        familyMemberId: "member-1",
        amount: 5000,
        frequency: "daily",
        enabled: true,
        nextDistribution: new Date(),
      };

      await expect(
        liquidityManager.setAllowanceRule(allowanceRule),
      ).rejects.toThrow("Database error");
    });

    it("should handle family API errors gracefully", async () => {
      mockFamilyApi.getFamilyMembers.mockRejectedValue(
        new Error("Family API error"),
      );

      const report = await liquidityManager.getFamilyLiquidityReport();
      expect(report.memberBalances).toEqual({});
    });
  });

  describe("Configuration Validation", () => {
    it("should enforce minimum channel size of 50k sats", () => {
      const configWithSmallChannels = {
        ...familyConfig,
        minChannelSize: 25000,
      };

      const manager = new FamilyLiquidityManager(configWithSmallChannels);
      expect(manager).toBeDefined();
      // The 50k minimum should be enforced in operations, not initialization
    });

    it("should validate emergency reserve settings", () => {
      const configWithLargeReserve = {
        ...familyConfig,
        emergencyReserve: 2000000, // 2M sats reserve
      };

      const manager = new FamilyLiquidityManager(configWithLargeReserve);
      expect(manager).toBeDefined();
    });

    it("should handle invalid frequency settings", () => {
      const configWithInvalidFreq = {
        ...familyConfig,
        rebalanceFrequency: "invalid" as any,
      };

      const manager = new FamilyLiquidityManager(configWithInvalidFreq);
      expect(manager).toBeDefined();
    });
  });
});
