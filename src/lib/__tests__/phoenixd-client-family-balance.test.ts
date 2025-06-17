/**
 * Tests for PhoenixdClient Family Balance Tracking
 *
 * Tests the fix for checkFamilyLiquidity which previously ignored
 * the familyMember parameter and only used global balance.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhoenixdClient } from "../phoenixd-client";

// Mock axios to avoid real API calls in tests
vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn().mockResolvedValue({
        data: { balanceSat: 1000000, feeCreditSat: 0 }, // Mock global balance
      }),
      post: vi.fn(),
    })),
  },
}));

// Mock the privacy layer
vi.mock("../../../lib/privacy/lnproxy-privacy", () => ({
  SatnamPrivacyLayer: vi.fn().mockImplementation(() => ({
    wrapInvoiceForPrivacy: vi.fn(),
    testPrivacyConnection: vi.fn(),
  })),
}));

describe("PhoenixdClient Family Balance Tracking", () => {
  let phoenixdClient: PhoenixdClient;

  beforeEach(() => {
    phoenixdClient = new PhoenixdClient();
  });

  describe("checkFamilyLiquidity", () => {
    it("should return per-member balance, not global balance", async () => {
      // Initialize family members with different balances
      await phoenixdClient.initializeFamilyMember("alice", 100000);
      await phoenixdClient.initializeFamilyMember("bob", 50000);

      // Check Alice's liquidity
      const aliceCheck = await phoenixdClient.checkFamilyLiquidity(
        "alice",
        25000
      );
      expect(aliceCheck.currentBalance).toBe(100000);
      expect(aliceCheck.needsLiquidity).toBe(false);
      expect(aliceCheck.memberTransactionCount).toBe(1); // Initialization transaction

      // Check Bob's liquidity
      const bobCheck = await phoenixdClient.checkFamilyLiquidity("bob", 75000);
      expect(bobCheck.currentBalance).toBe(50000);
      expect(bobCheck.needsLiquidity).toBe(true);
      expect(bobCheck.memberTransactionCount).toBe(1);
    });

    it("should track transactions and update per-member balances", async () => {
      // Initialize family member
      await phoenixdClient.initializeFamilyMember("charlie", 30000);

      // Simulate outgoing payment
      await phoenixdClient["trackFamilyTransaction"]("charlie", {
        type: "outgoing",
        amountSat: 10000,
        feeSat: 500,
        timestamp: Date.now(),
        paymentHash: "test-payment-hash",
        description: "Test payment",
        tags: ["test"],
      });

      // Check updated balance
      const charlieCheck = await phoenixdClient.checkFamilyLiquidity(
        "charlie",
        25000
      );
      expect(charlieCheck.currentBalance).toBe(19500); // 30000 - 10000 - 500
      expect(charlieCheck.needsLiquidity).toBe(true);
      expect(charlieCheck.memberTransactionCount).toBe(2); // Init + payment
    });

    it("should handle family members with no transactions", async () => {
      // Check liquidity for non-existent family member
      const newMemberCheck = await phoenixdClient.checkFamilyLiquidity(
        "newbie",
        1000
      );
      expect(newMemberCheck.currentBalance).toBe(0);
      expect(newMemberCheck.needsLiquidity).toBe(true);
      expect(newMemberCheck.memberTransactionCount).toBe(0);
    });
  });

  describe("Family Member Balance Tracking", () => {
    it("should properly track incoming and outgoing transactions", async () => {
      await phoenixdClient.initializeFamilyMember("david", 50000);

      // Track incoming payment
      await phoenixdClient.trackIncomingPayment(
        "david",
        "incoming-hash",
        20000
      );

      // Track outgoing payment
      await phoenixdClient.trackFamilyTransaction("david", {
        type: "outgoing",
        amountSat: 15000,
        feeSat: 1000,
        timestamp: Date.now(),
        paymentHash: "outgoing-hash",
        description: "Test outgoing",
        tags: ["test"],
      });

      const balance = await phoenixdClient.getFamilyMemberBalance("david");
      expect(balance.balanceSat).toBe(54000); // 50k + 20k - 15k - 1k
      expect(balance.incomingSat).toBe(70000); // 50k init + 20k incoming
      expect(balance.outgoingSat).toBe(15000);
      expect(balance.feesSat).toBe(1000);
    });

    it("should handle internal family transfers", async () => {
      await phoenixdClient.initializeFamilyMember("eve", 40000);
      await phoenixdClient.initializeFamilyMember("frank", 10000);

      const transfer = await phoenixdClient.transferBetweenFamilyMembers(
        "eve",
        "frank",
        15000,
        "Test transfer"
      );

      expect(transfer.success).toBe(true);
      expect(transfer.fromBalance).toBe(25000); // 40k - 15k
      expect(transfer.toBalance).toBe(25000); // 10k + 15k

      // Verify individual balances
      const eveBalance = await phoenixdClient.getFamilyMemberBalance("eve");
      const frankBalance = await phoenixdClient.getFamilyMemberBalance("frank");

      expect(eveBalance.balanceSat).toBe(25000);
      expect(frankBalance.balanceSat).toBe(25000);
    });
  });

  describe("Family Balance Overview", () => {
    it("should return all family member balances", async () => {
      await phoenixdClient.initializeFamilyMember("grace", 30000);
      await phoenixdClient.initializeFamilyMember("henry", 20000);

      const allBalances = phoenixdClient.getAllFamilyBalances();
      expect(allBalances).toHaveLength(2);

      const graceBalance = allBalances.find((b) => b.familyMember === "grace");
      const henryBalance = allBalances.find((b) => b.familyMember === "henry");

      expect(graceBalance?.balanceSat).toBe(30000);
      expect(henryBalance?.balanceSat).toBe(20000);
    });
  });
});
