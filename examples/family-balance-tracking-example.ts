/**
 * Example: Family Balance Tracking with Transaction Tagging
 *
 * This example demonstrates how the updated PhoenixdClient now properly
 * tracks per-member balances using transaction tagging/accounting.
 *
 * Before the fix: checkFamilyLiquidity() ignored the familyMember parameter
 * After the fix: checkFamilyLiquidity() returns actual per-member balance
 */

import { PhoenixdClient } from "../src/lib/phoenixd-client";

async function demonstrateFamilyBalanceTracking() {
  console.log(
    "🚀 Demonstrating Family Balance Tracking with Transaction Tagging\n"
  );

  const phoenixd = new PhoenixdClient();

  try {
    // Initialize family members with different starting balances
    console.log("1. Initialize family members:");
    await phoenixd.initializeFamilyMember("alice", 100000); // Alice starts with 100k sats
    await phoenixd.initializeFamilyMember("bob", 50000); // Bob starts with 50k sats
    await phoenixd.initializeFamilyMember("charlie", 0); // Charlie starts with 0 sats

    // Check individual balances (now shows per-member balances!)
    console.log("\n2. Check individual family member liquidity:");

    const aliceCheck = await phoenixd.checkFamilyLiquidity("alice", 25000);
    console.log("Alice liquidity check:", {
      memberBalance: aliceCheck.currentBalance, // Alice's balance: 100k
      targetAmount: 25000,
      needsLiquidity: aliceCheck.needsLiquidity, // false - she has enough
      globalBalance: aliceCheck.globalBalance, // Global node balance
    });

    const bobCheck = await phoenixd.checkFamilyLiquidity("bob", 75000);
    console.log("Bob liquidity check:", {
      memberBalance: bobCheck.currentBalance, // Bob's balance: 50k
      targetAmount: 75000,
      needsLiquidity: bobCheck.needsLiquidity, // true - he needs more
      recommendedTopup: bobCheck.recommendedTopup, // Recommended amount
    });

    const charlieCheck = await phoenixd.checkFamilyLiquidity("charlie", 10000);
    console.log("Charlie liquidity check:", {
      memberBalance: charlieCheck.currentBalance, // Charlie's balance: 0
      targetAmount: 10000,
      needsLiquidity: charlieCheck.needsLiquidity, // true - he needs liquidity
    });

    // Simulate some transactions
    console.log("\n3. Simulate some family transactions:");

    // Alice sends payment (outgoing transaction)
    await phoenixd.trackFamilyTransaction("alice", {
      type: "outgoing",
      amountSat: 15000,
      feeSat: 500,
      timestamp: Date.now(),
      paymentHash: "payment-alice-out-1",
      description: "Alice pays for groceries",
      tags: ["groceries", "family-expense"],
    });

    // Charlie receives payment (incoming transaction)
    await phoenixd.trackIncomingPayment(
      "charlie",
      "payment-charlie-in-1",
      25000,
      0,
      "Charlie receives allowance"
    );

    // Internal family transfer
    await phoenixd.transferBetweenFamilyMembers(
      "bob",
      "charlie",
      10000,
      "Bob helps Charlie"
    );

    // Check updated balances
    console.log("\n4. Updated balances after transactions:");
    const familyBalances = phoenixd.getAllFamilyBalances();

    familyBalances.forEach((balance) => {
      console.log(`${balance.familyMember}:`, {
        balance: balance.balanceSat,
        incoming: balance.incomingSat,
        outgoing: balance.outgoingSat,
        fees: balance.feesSat,
        transactionCount: balance.transactionCount,
      });
    });

    // Final liquidity checks show updated per-member balances
    console.log("\n5. Final liquidity checks:");
    const finalAliceCheck = await phoenixd.checkFamilyLiquidity("alice", 25000);
    const finalBobCheck = await phoenixd.checkFamilyLiquidity("bob", 25000);
    const finalCharlieCheck = await phoenixd.checkFamilyLiquidity(
      "charlie",
      25000
    );

    console.log("Final balances:", {
      alice: finalAliceCheck.currentBalance, // ~84,500 (100k - 15k - 500 fees)
      bob: finalBobCheck.currentBalance, // 40,000 (50k - 10k transfer)
      charlie: finalCharlieCheck.currentBalance, // 35,000 (0 + 25k + 10k)
    });

    console.log(
      "\n✅ Success! checkFamilyLiquidity now properly tracks per-member balances"
    );
    console.log("🎯 The familyMember parameter is no longer ignored!");
  } catch (error) {
    console.error("❌ Error demonstrating family balance tracking:", error);
  }
}

// Run the demonstration
if (require.main === module) {
  demonstrateFamilyBalanceTracking().catch(console.error);
}

export { demonstrateFamilyBalanceTracking };
