/**
 * @fileoverview Comprehensive Vitest test suite for Atomic Swap functionality
 * @description Tests the complete atomic swap system including API endpoints and bridge logic
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtomicSwapRequest } from "../lib/internal-lightning-bridge";
import { SatnamInternalLightningBridge } from "../lib/internal-lightning-bridge";

// Mock external dependencies
const mockSupabase = {
  from: vi.fn((table: string) => {
    const mockChain = {
      select: vi.fn((fields: string) => mockChain),
      eq: vi.fn((field: string, value: any) => mockChain),
      single: vi.fn(() => {
        if (table === "family_members") {
          // Default to parent role for most tests
          return {
            data: {
              id: "1",
              role: "parent",
              spending_limits: { requiresApproval: 5000 },
            },
            error: null,
          };
        } else if (table === "guardian_approvals") {
          // Default to no approval found
          return {
            data: null,
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      order: vi.fn(() => ({ data: [], error: null })),
      insert: vi.fn(() => ({ data: null, error: null })),
      update: vi.fn(() => mockChain),
    };
    return mockChain;
  }),
  raw: vi.fn((query, params) => `${query} ${params?.join(", ") || ""}`),
};

const mockPhoenixd = {
  createInvoice: vi.fn(() =>
    Promise.resolve({
      paymentRequest:
        "lnbc1000n1pskuawzpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq",
      paymentHash: "hash123456789abcdef",
      invoiceId: "inv_123456789",
    })
  ),
  waitForPayment: vi.fn(() =>
    Promise.resolve({
      success: true,
      paymentHash: "hash123456789abcdef",
      fee: 1,
    })
  ),
};

const mockFedimint = {
  getBalance: vi.fn(() => Promise.resolve(10000)),
  atomicRedeemToPay: vi.fn(() =>
    Promise.resolve({
      success: true,
      txId: "fed_tx_123456789",
      fee: 2,
    })
  ),
  rollbackRedemption: vi.fn(() => Promise.resolve()),
};

const mockCashuManager = {
  requestMint: vi.fn(() =>
    Promise.resolve({
      pr: "lnbc500n1pskuawzpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq",
      hash: "cashu_mint_hash_123",
    })
  ),
  completeMint: vi.fn(() =>
    Promise.resolve({
      success: true,
      tokens: "cashuABC123DEF456GHI789",
      tokenId: "token_123456789",
      fee: 1,
    })
  ),
};

describe("Atomic Swap Integration Tests", () => {
  let bridge: SatnamInternalLightningBridge;

  beforeEach(() => {
    vi.clearAllMocks();

    bridge = new SatnamInternalLightningBridge();

    // Inject mocks
    (bridge as any).supabase = mockSupabase;
    (bridge as any).phoenixd = mockPhoenixd;
    (bridge as any).fedimint = mockFedimint;
    (bridge as any).cashuManager = mockCashuManager;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Fedimint to Lightning Atomic Swap", () => {
    const fedimintToLightningRequest: AtomicSwapRequest = {
      fromContext: "family",
      toContext: "individual",
      fromMemberId: "parent_001",
      toMemberId: "child_001",
      amount: 1000,
      swapType: "fedimint_to_lightning",
      purpose: "weekly_allowance",
      requiresApproval: false,
    };

    it("should successfully execute fedimint to lightning swap", async () => {
      const result = await bridge.executeAtomicSwap(fedimintToLightningRequest);

      expect(result.success).toBe(true);
      expect(result.amount).toBe(1000);
      expect(result.fees.fedimintFee).toBe(2);
      expect(result.fees.lightningFee).toBe(1);
      expect(result.fees.totalFee).toBe(3);
      expect(result.swapId).toMatch(/^swap_\d+_[a-z0-9]+$/);

      // Verify all external services were called correctly
      expect(mockFedimint.getBalance).toHaveBeenCalledWith("parent_001");
      expect(mockPhoenixd.createInvoice).toHaveBeenCalledWith({
        amount: 1000,
        description: expect.stringContaining("Atomic swap"),
        expiry: 3600,
        metadata: expect.objectContaining({
          fromMemberId: "parent_001",
          toMemberId: "child_001",
          purpose: "weekly_allowance",
        }),
      });
      expect(mockFedimint.atomicRedeemToPay).toHaveBeenCalled();
      expect(mockPhoenixd.waitForPayment).toHaveBeenCalled();
    });

    it("should handle insufficient fedimint balance", async () => {
      mockFedimint.getBalance.mockResolvedValueOnce(500); // Less than requested 1000

      const result = await bridge.executeAtomicSwap(fedimintToLightningRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Insufficient Fedimint eCash balance");
      expect(mockFedimint.atomicRedeemToPay).not.toHaveBeenCalled();
    });

    it("should handle fedimint redemption failure", async () => {
      mockFedimint.atomicRedeemToPay.mockResolvedValueOnce({
        success: false,
        error: "Fedimint node unreachable",
      });

      const result = await bridge.executeAtomicSwap(fedimintToLightningRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Fedimint redemption failed");
    });

    it("should handle lightning payment timeout and rollback", async () => {
      mockPhoenixd.waitForPayment.mockResolvedValueOnce({
        success: false,
      });

      const result = await bridge.executeAtomicSwap(fedimintToLightningRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Lightning payment not received within timeout"
      );
      expect(mockFedimint.rollbackRedemption).toHaveBeenCalled();
    });
  });

  describe("Fedimint to Cashu Atomic Swap", () => {
    const fedimintToCashuRequest: AtomicSwapRequest = {
      fromContext: "family",
      toContext: "individual",
      fromMemberId: "parent_001",
      toMemberId: "child_001",
      amount: 2000,
      swapType: "fedimint_to_cashu",
      purpose: "pocket_money",
      requiresApproval: false,
    };

    it("should successfully execute fedimint to cashu swap", async () => {
      const result = await bridge.executeAtomicSwap(fedimintToCashuRequest);

      expect(result.success).toBe(true);
      expect(result.amount).toBe(2000);
      expect(result.fees.fedimintFee).toBe(2);
      expect(result.fees.cashuFee).toBe(1);
      expect(result.fees.totalFee).toBe(3);

      // Verify Cashu minting process
      expect(mockCashuManager.requestMint).toHaveBeenCalledWith(2000);
      expect(mockFedimint.atomicRedeemToPay).toHaveBeenCalledWith({
        memberId: "parent_001",
        amount: 2000,
        lightningInvoice:
          "lnbc500n1pskuawzpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq",
        swapId: expect.any(String),
      });
      expect(mockCashuManager.completeMint).toHaveBeenCalled();
    });

    it("should handle cashu minting failure and rollback", async () => {
      mockCashuManager.completeMint.mockResolvedValueOnce({
        success: false,
        error: "Cashu mint server error",
      });

      const result = await bridge.executeAtomicSwap(fedimintToCashuRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Cashu minting failed");
      expect(mockFedimint.rollbackRedemption).toHaveBeenCalled();
    });
  });

  describe("Guardian Approval System", () => {
    const highAmountRequest: AtomicSwapRequest = {
      fromContext: "family",
      toContext: "individual",
      fromMemberId: "child_001",
      toMemberId: "child_002",
      amount: 50000, // High amount requiring approval
      swapType: "fedimint_to_lightning",
      purpose: "emergency_fund",
      requiresApproval: true,
    };

    it("should approve swaps for parent role without limits", async () => {
      // Create a new bridge instance with parent role mock
      const parentMockSupabase = {
        from: vi.fn((table: string) => {
          const mockChain = {
            select: vi.fn(() => mockChain),
            eq: vi.fn(() => mockChain),
            single: vi.fn(() => {
              if (table === "family_members") {
                return {
                  data: {
                    id: "1",
                    role: "parent",
                    spending_limits: { requiresApproval: 5000 },
                  },
                  error: null,
                };
              } else if (table === "guardian_approvals") {
                return { data: null, error: null };
              }
              return { data: null, error: null };
            }),
            order: vi.fn(() => ({ data: [], error: null })),
            insert: vi.fn(() => ({ data: null, error: null })),
            update: vi.fn(() => mockChain),
          };
          return mockChain;
        }),
        raw: vi.fn((query, params) => `${query} ${params?.join(", ") || ""}`),
      };

      // Create bridge with parent mock and sufficient balance
      const parentBridge = new SatnamInternalLightningBridge();
      (parentBridge as any).supabase = parentMockSupabase;

      // Create a mock fedimint with sufficient balance for this test
      const mockFedimintWithBalance = {
        getBalance: vi.fn(() => Promise.resolve(50000)), // Sufficient balance
        atomicRedeemToPay: vi.fn(() =>
          Promise.resolve({
            success: true,
            txId: "fed_tx_123456789",
            fee: 2,
          })
        ),
        rollbackRedemption: vi.fn(() => Promise.resolve()),
      };

      (parentBridge as any).fedimint = mockFedimintWithBalance;
      (parentBridge as any).phoenixd = mockPhoenixd;
      (parentBridge as any).cashuManager = mockCashuManager;

      const result = await parentBridge.executeAtomicSwap(highAmountRequest);

      expect(result.success).toBe(true);
    });

    it("should require guardian approval for child with spending limits", async () => {
      // Create a new bridge instance with child role mock
      const childMockSupabase = {
        from: vi.fn((table: string) => {
          const mockChain = {
            select: vi.fn(() => mockChain),
            eq: vi.fn(() => mockChain),
            single: vi.fn(() => {
              if (table === "family_members") {
                return {
                  data: {
                    id: "1",
                    role: "child",
                    spending_limits: { requiresApproval: 10000 },
                  },
                  error: null,
                };
              } else if (table === "guardian_approvals") {
                return { data: null, error: null };
              }
              return { data: null, error: null };
            }),
            order: vi.fn(() => ({ data: [], error: null })),
            insert: vi.fn(() => ({ data: null, error: null })),
            update: vi.fn(() => mockChain),
          };
          return mockChain;
        }),
        raw: vi.fn((query, params) => `${query} ${params?.join(", ") || ""}`),
      };

      // Create bridge with child mock and sufficient balance
      const childBridge = new SatnamInternalLightningBridge();
      (childBridge as any).supabase = childMockSupabase;

      // Create a mock fedimint with sufficient balance for this test
      const mockFedimintWithBalance = {
        getBalance: vi.fn(() => Promise.resolve(50000)), // Sufficient balance
        atomicRedeemToPay: vi.fn(() =>
          Promise.resolve({
            success: true,
            txId: "fed_tx_123456789",
            fee: 2,
          })
        ),
        rollbackRedemption: vi.fn(() => Promise.resolve()),
      };

      (childBridge as any).fedimint = mockFedimintWithBalance;
      (childBridge as any).phoenixd = mockPhoenixd;
      (childBridge as any).cashuManager = mockCashuManager;

      const result = await childBridge.executeAtomicSwap(highAmountRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain("guardian approval required");
    });

    it("should proceed when guardian approval exists", async () => {
      // Create a new bridge instance with child role and approval mock
      const approvedChildMockSupabase = {
        from: vi.fn((table: string) => {
          const mockChain = {
            select: vi.fn(() => mockChain),
            eq: vi.fn(() => mockChain),
            single: vi.fn(() => {
              if (table === "family_members") {
                return {
                  data: {
                    id: "1",
                    role: "child",
                    spending_limits: { requiresApproval: 10000 },
                  },
                  error: null,
                };
              } else if (table === "guardian_approvals") {
                return {
                  data: {
                    swap_id: "test_swap",
                    status: "approved",
                    approved_by: "parent_001",
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            }),
            order: vi.fn(() => ({ data: [], error: null })),
            insert: vi.fn(() => ({ data: null, error: null })),
            update: vi.fn(() => mockChain),
          };
          return mockChain;
        }),
        raw: vi.fn((query, params) => `${query} ${params?.join(", ") || ""}`),
      };

      // Create bridge with approved child mock and sufficient balance
      const approvedChildBridge = new SatnamInternalLightningBridge();
      (approvedChildBridge as any).supabase = approvedChildMockSupabase;

      // Create a mock fedimint with sufficient balance for this test
      const mockFedimintWithBalance = {
        getBalance: vi.fn(() => Promise.resolve(50000)), // Sufficient balance
        atomicRedeemToPay: vi.fn(() =>
          Promise.resolve({
            success: true,
            txId: "fed_tx_123456789",
            fee: 2,
          })
        ),
        rollbackRedemption: vi.fn(() => Promise.resolve()),
      };

      (approvedChildBridge as any).fedimint = mockFedimintWithBalance;
      (approvedChildBridge as any).phoenixd = mockPhoenixd;
      (approvedChildBridge as any).cashuManager = mockCashuManager;

      const result =
        await approvedChildBridge.executeAtomicSwap(highAmountRequest);

      expect(result.success).toBe(true);
    });
  });

  describe("Validation and Error Handling", () => {
    it("should reject invalid amounts", async () => {
      const invalidRequest: AtomicSwapRequest = {
        fromContext: "family",
        toContext: "individual",
        fromMemberId: "parent_001",
        toMemberId: "child_001",
        amount: 0, // Invalid amount
        swapType: "fedimint_to_lightning",
        purpose: "test",
        requiresApproval: false,
      };

      const result = await bridge.executeAtomicSwap(invalidRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Swap amount must be greater than 0");
    });

    it("should reject invalid member IDs", async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({ data: null, error: "Not found" })),
          })),
        })),
      });

      const invalidRequest: AtomicSwapRequest = {
        fromContext: "family",
        toContext: "individual",
        fromMemberId: "invalid_member",
        toMemberId: "child_001",
        amount: 1000,
        swapType: "fedimint_to_lightning",
        purpose: "test",
        requiresApproval: false,
      };

      const result = await bridge.executeAtomicSwap(invalidRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid family member IDs");
    });

    it("should reject unsupported swap types", async () => {
      const unsupportedRequest: AtomicSwapRequest = {
        fromContext: "family",
        toContext: "individual",
        fromMemberId: "parent_001",
        toMemberId: "child_001",
        amount: 1000,
        swapType: "unsupported_type" as any,
        purpose: "test",
        requiresApproval: false,
      };

      const result = await bridge.executeAtomicSwap(unsupportedRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported swap type");
    });
  });

  describe("Database Logging and Audit Trail", () => {
    it("should log successful swaps to database", async () => {
      const request: AtomicSwapRequest = {
        fromContext: "family",
        toContext: "individual",
        fromMemberId: "parent_001",
        toMemberId: "child_001",
        amount: 1000,
        swapType: "fedimint_to_lightning",
        purpose: "allowance",
        requiresApproval: false,
      };

      // Spy on the logAtomicSwap method
      const logAtomicSwapSpy = vi.spyOn(bridge as any, "logAtomicSwap");

      const result = await bridge.executeAtomicSwap(request);

      expect(result.success).toBe(true);

      // Verify that logAtomicSwap was called
      expect(logAtomicSwapSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          amount: 1000,
          swapId: expect.any(String),
        })
      );

      logAtomicSwapSpy.mockRestore();
    });

    it("should update individual wallet balances correctly", async () => {
      const request: AtomicSwapRequest = {
        fromContext: "family",
        toContext: "individual",
        fromMemberId: "parent_001",
        toMemberId: "child_001",
        amount: 1000,
        swapType: "fedimint_to_lightning",
        purpose: "allowance",
        requiresApproval: false,
      };

      // Spy on the creditIndividualLightningWallet method
      const creditWalletSpy = vi.spyOn(
        bridge as any,
        "creditIndividualLightningWallet"
      );

      const result = await bridge.executeAtomicSwap(request);

      expect(result.success).toBe(true);

      // Verify that creditIndividualLightningWallet was called
      expect(creditWalletSpy).toHaveBeenCalledWith(
        "child_001",
        1000,
        expect.any(String)
      );

      creditWalletSpy.mockRestore();
    });
  });

  describe("Swap ID Generation", () => {
    it("should generate unique swap IDs", async () => {
      const request: AtomicSwapRequest = {
        fromContext: "family",
        toContext: "individual",
        fromMemberId: "parent_001",
        toMemberId: "child_001",
        amount: 1000,
        swapType: "fedimint_to_lightning",
        purpose: "test",
        requiresApproval: false,
      };

      const result1 = await bridge.executeAtomicSwap(request);
      const result2 = await bridge.executeAtomicSwap(request);

      expect(result1.swapId).not.toBe(result2.swapId);
      expect(result1.swapId).toMatch(/^swap_\d+_[a-z0-9]+$/);
      expect(result2.swapId).toMatch(/^swap_\d+_[a-z0-9]+$/);
    });
  });
});
