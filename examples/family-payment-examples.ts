/**
 * Family Payment System Usage Examples
 *
 * Practical examples of how to use the enhanced PhoenixD family payment system
 */

// Example 1: Weekly Allowance Distribution
export async function setupWeeklyAllowances() {
  console.log("🔄 Setting up weekly allowances for all children...");

  const children = [
    { id: "child1", name: "Alice", amount: 10000 }, // 10k sats
    { id: "child2", name: "Bob", amount: 8000 }, // 8k sats
    { id: "teen1", name: "Charlie", amount: 15000 }, // 15k sats (teenager gets more)
  ];

  for (const child of children) {
    try {
      const response = await fetch(
        "/api/family/allowance-automation/create-schedule",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyMemberId: child.id,
            amount: child.amount,
            frequency: "weekly",
            dayOfWeek: 0, // Sunday
            timeOfDay: "10:00",
            autoDistribution: true,
            parentApprovalRequired: child.amount > 12000, // Teens need approval for larger amounts
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        console.log(
          `✅ ${child.name}: ${child.amount} sats every Sunday at 10 AM`
        );
        console.log(
          `   Next distribution: ${new Date(result.nextDistribution).toLocaleString()}`
        );
      } else {
        console.error(`❌ Failed to setup allowance for ${child.name}`);
      }
    } catch (error) {
      console.error(`Error setting up allowance for ${child.name}:`, error);
    }
  }
}

// Example 2: Emergency School Payment
export async function handleSchoolEmergency() {
  console.log("🚨 Handling emergency school payment...");

  try {
    // Child needs urgent payment for school trip
    const response = await fetch("/api/family/emergency-liquidity/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        familyMemberId: "teen1",
        requiredAmount: 45000, // 45k sats for school trip
        urgency: "high",
        reason: "School trip payment deadline today",
        maxFees: 4500, // 10% max fees for emergency
        location: {
          latitude: 40.7128, // School location
          longitude: -74.006,
        },
      }),
    });

    const result = await response.json();

    if (result.approved && result.status === "completed") {
      console.log(`✅ Emergency payment completed immediately!`);
      console.log(`   Amount: ${result.amountProvided} sats`);
      console.log(`   Fees: ${result.fees} sats`);
      console.log(`   Source: ${result.liquiditySource}`);
    } else if (result.approvalRequired) {
      console.log(`⏳ Large emergency payment requires parent approval`);
      console.log(`   Emergency ID: ${result.emergencyId}`);
      console.log(`   Parents have been notified via SMS and email`);

      // Simulate parent approval
      setTimeout(() => approveEmergency(result.emergencyId), 2000);
    } else {
      console.log(`❌ Emergency payment failed: ${result.message}`);
    }
  } catch (error) {
    console.error("Emergency payment error:", error);
  }
}

// Example 3: Parent Approves Emergency
export async function approveEmergency(emergencyId: string) {
  console.log(`👨‍👩‍👧‍👦 Parent approving emergency: ${emergencyId}`);

  try {
    const response = await fetch("/api/family/emergency-liquidity/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emergencyId,
        parentId: "parent1",
        approved: true,
        comments: "Approved - verified school trip requirement",
        additionalAmount: 50000, // Approve slightly more for safety
      }),
    });

    const result = await response.json();

    if (result.success && result.status === "approved_and_completed") {
      console.log(`✅ Emergency approved and payment completed!`);
      console.log(`   Final amount: ${result.amountProvided} sats`);
      console.log(`   Total fees: ${result.fees} sats`);
    } else {
      console.log(`❌ Emergency approval failed: ${result.message}`);
    }
  } catch (error) {
    console.error("Emergency approval error:", error);
  }
}

// Example 4: Daily Family Payment
export async function sendDailyAllowance() {
  console.log("💰 Sending today's lunch money...");

  const lunchPayments = [
    { child: "child1", amount: 3000, description: "Lunch money - Alice" },
    { child: "child2", amount: 2500, description: "Lunch money - Bob" },
    { child: "teen1", amount: 4000, description: "Lunch money - Charlie" },
  ];

  for (const payment of lunchPayments) {
    try {
      const response = await fetch("/api/family/phoenixd-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromMember: "parent1",
          toMember: payment.child,
          amountSat: payment.amount,
          description: payment.description,
          preferredMethod: "phoenixd", // Use PhoenixD for low fees
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log(`✅ ${payment.description}: ${payment.amount} sats`);
        console.log(
          `   Fee: ${result.feeSat} sats (${((result.feeSat / result.amountSat) * 100).toFixed(2)}%)`
        );
        console.log(`   Time: ${result.processingTimeMs}ms`);
      } else {
        console.error(
          `❌ Failed: ${payment.description} - ${result.errorMessage}`
        );
      }
    } catch (error) {
      console.error(`Error sending ${payment.description}:`, error);
    }
  }
}

// Example 5: Check Family Liquidity Health
export async function checkFamilyHealth() {
  console.log("📊 Checking family liquidity health...");

  try {
    // Get overall family status
    const overallResponse = await fetch("/api/family/liquidity-status");
    const overallResult = await overallResponse.json();

    if (overallResult.success) {
      const stats = overallResult.overallStatus;

      console.log(`\n💰 Family Liquidity Summary:`);
      console.log(
        `   Total: ${stats.totalFamilyLiquidity.toLocaleString()} sats`
      );
      console.log(`   Health: ${stats.systemHealth.toUpperCase()}`);
      console.log(`   Healthy Members: ${stats.healthyMembers}`);
      console.log(`   Need Attention: ${stats.membersNeedingAttention}`);

      if (stats.membersNeedingAttention > 0) {
        console.log(
          `\n⚠️  Some members need attention. Checking individual status...`
        );

        // Check each member that might need attention
        const members = ["child1", "child2", "teen1"];

        for (const memberId of members) {
          const memberResponse = await fetch(
            `/api/family/liquidity-status?memberId=${memberId}`
          );
          const memberResult = await memberResponse.json();

          if (memberResult.success) {
            const status = memberResult.liquidityStatus;

            if (status.needsAttention) {
              console.log(`\n🚨 ${status.memberName} needs attention:`);
              console.log(`   Balance: ${status.totalLiquidity} sats`);
              console.log(`   Health: ${status.liquidityHealth}`);
              console.log(`   Recommendations:`);
              status.recommendations.forEach((rec: string) => {
                console.log(`     • ${rec}`);
              });
            }
          }
        }
      } else {
        console.log(`\n✅ All family members have healthy liquidity levels!`);
      }
    }
  } catch (error) {
    console.error("Health check error:", error);
  }
}

// Example 6: Bonus Payment for Good Grades
export async function sendBonusPayment() {
  console.log("🎉 Sending bonus payment for excellent grades...");

  try {
    const response = await fetch(
      "/api/family/allowance-automation/distribute-now",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyMemberId: "child1",
          amount: 25000, // 25k sats bonus
          reason: "Excellent report card - all A's!",
          isEmergency: false,
        }),
      }
    );

    const result = await response.json();

    if (result.success) {
      if (result.status === "completed") {
        console.log(`✅ Bonus payment sent immediately!`);
        console.log(`   Amount: ${result.amountSat} sats`);
        console.log(`   Payment ID: ${result.paymentId}`);
      } else if (result.status === "pending_approval") {
        console.log(`📋 Large bonus requires parent approval`);
        console.log(`   Amount: ${result.amountSat} sats`);
      }
    } else {
      console.log(`❌ Bonus payment failed: ${result.errorMessage}`);
    }
  } catch (error) {
    console.error("Bonus payment error:", error);
  }
}

// Example 7: Monitor Pending Transactions
export async function monitorPendingTransactions() {
  console.log("⏳ Checking for pending approvals...");

  try {
    // Check pending allowances
    const allowanceResponse = await fetch(
      "/api/family/allowance-automation/pending-approvals"
    );
    const allowanceResult = await allowanceResponse.json();

    if (allowanceResult.success && allowanceResult.approvals.length > 0) {
      console.log(
        `📋 ${allowanceResult.approvals.length} allowances pending approval:`
      );
      allowanceResult.approvals.forEach((approval: any) => {
        console.log(
          `   - ${approval.familyMemberId}: ${approval.amount} sats (${approval.reason})`
        );
      });
    }

    // Check pending emergencies
    const emergencyResponse = await fetch(
      "/api/family/emergency-liquidity/pending"
    );
    const emergencyResult = await emergencyResponse.json();

    if (
      emergencyResult.success &&
      emergencyResult.pendingEmergencies.length > 0
    ) {
      console.log(
        `🚨 ${emergencyResult.pendingEmergencies.length} emergencies pending approval:`
      );
      emergencyResult.pendingEmergencies.forEach((emergency: any) => {
        console.log(
          `   - ${emergency.familyMemberId}: ${emergency.requiredAmount} sats (${emergency.urgency})`
        );
        console.log(`     Reason: ${emergency.reason}`);
      });
    }

    if (
      allowanceResult.approvals?.length === 0 &&
      emergencyResult.pendingEmergencies?.length === 0
    ) {
      console.log(
        `✅ No pending approvals - all transactions processed automatically!`
      );
    }
  } catch (error) {
    console.error("Monitoring error:", error);
  }
}

// Example Usage - Run a complete family payment workflow
export async function runCompleteExample() {
  console.log("🚀 Running complete family payment system example...\n");

  // 1. Setup weekly allowances
  await setupWeeklyAllowances();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 2. Send daily lunch money
  await sendDailyAllowance();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 3. Handle an emergency
  await handleSchoolEmergency();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 4. Send bonus payment
  await sendBonusPayment();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 5. Check overall health
  await checkFamilyHealth();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 6. Monitor pending transactions
  await monitorPendingTransactions();

  console.log("\n🎉 Complete example finished! Check the results above.");
}

// Export all examples for individual use
export {
  approveEmergency,
  checkFamilyHealth,
  handleSchoolEmergency,
  monitorPendingTransactions,
  runCompleteExample,
  sendBonusPayment,
  sendDailyAllowance,
  setupWeeklyAllowances,
};

// Quick test commands for development
if (require.main === module) {
  const command = process.argv[2];

  (async () => {
    try {
      switch (command) {
        case "allowances":
          await setupWeeklyAllowances();
          break;
        case "emergency":
          await handleSchoolEmergency();
          break;
        case "lunch":
          await sendDailyAllowance();
          break;
        case "health":
          await checkFamilyHealth();
          break;
        case "bonus":
          await sendBonusPayment();
          break;
        case "monitor":
          await monitorPendingTransactions();
          break;
        case "all":
        default:
          await runCompleteExample();
          break;
      }
    } catch (error) {
      console.error("Script execution error:", error);
      process.exit(1);
    }
  })();
}
