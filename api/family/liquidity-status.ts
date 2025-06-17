/**
 * Family Liquidity Status API
 * Real-time liquidity across all channels and payment methods
 */

import { getFamilyMember, getFamilyMembers } from "../../lib/family-api";
import { LightningClient } from "../../lib/lightning-client";
import { PhoenixdClient } from "../../src/lib/phoenixd-client";

interface FamilyLiquidityStatus {
  familyMemberId: string;
  memberName: string;
  memberRole: string;
  phoenixd: {
    available: boolean;
    balanceSat: number;
    inboundCapacitySat: number;
    channelCount: number;
    feeCreditSat: number;
  };
  lightning: {
    available: boolean;
    balanceSat: number;
    inboundCapacitySat: number;
    outboundCapacitySat: number;
    channelCount: number;
  };
  ecash: {
    available: boolean;
    balanceSat: number;
  };
  lnbits: {
    available: boolean;
    balanceSat: number;
  };
  totalLiquidity: number;
  liquidityHealth: "excellent" | "good" | "warning" | "critical";
  needsAttention: boolean;
  recommendations: string[];
  lastUpdated: string;
}

interface OverallLiquidityStats {
  totalFamilyLiquidity: number;
  totalFamilyChannels: number;
  averageLiquidityPerMember: number;
  healthyMembers: number;
  membersNeedingAttention: number;
  phoenixdTotalLiquidity: number;
  lightningTotalLiquidity: number;
  ecashTotalLiquidity: number;
  systemHealth: "excellent" | "good" | "warning" | "critical";
  lastUpdated: string;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const memberId = url.searchParams.get("memberId");

    if (memberId) {
      // Get liquidity status for specific member
      const memberStatus = await getFamilyMemberLiquidityStatus(memberId);
      if (!memberStatus) {
        return new Response(
          JSON.stringify({
            success: false,
            errorMessage: "Family member not found",
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          liquidityStatus: memberStatus,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } else {
      // Get overall family liquidity status
      const overallStatus = await getOverallFamilyLiquidityStatus();
      return new Response(
        JSON.stringify({
          success: true,
          overallStatus,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("Liquidity status error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

async function getFamilyMemberLiquidityStatus(
  memberId: string,
): Promise<FamilyLiquidityStatus | null> {
  try {
    const familyMember = await getFamilyMember(memberId);
    if (!familyMember) {
      return null;
    }

    const phoenixdClient = new PhoenixdClient();
    const lightningClient = new LightningClient();

    // Get PhoenixD status
    let phoenixdStatus = {
      available: false,
      balanceSat: 0,
      inboundCapacitySat: 0,
      channelCount: 0,
      feeCreditSat: 0,
    };

    try {
      const phoenixdBalance = await phoenixdClient.getBalance();
      const phoenixdChannels = await phoenixdClient.listChannels();

      phoenixdStatus = {
        available: true,
        balanceSat: phoenixdBalance.balanceSat,
        inboundCapacitySat: phoenixdChannels.reduce((sum, channel) => {
          return (
            sum + (channel.data?.commitments?.localCommit?.spec?.toRemote || 0)
          );
        }, 0),
        channelCount: phoenixdChannels.filter((c) => c.state === "NORMAL")
          .length,
        feeCreditSat: phoenixdBalance.feeCreditSat,
      };
    } catch (error) {
      console.warn("PhoenixD not available for member:", memberId);
    }

    // Get Lightning status
    let lightningStatus = {
      available: false,
      balanceSat: 0,
      inboundCapacitySat: 0,
      outboundCapacitySat: 0,
      channelCount: 0,
    };

    try {
      const nodeInfo = await lightningClient.getNodeInfo();

      lightningStatus = {
        available: nodeInfo.synced_to_chain,
        balanceSat: nodeInfo.balance_sat || 0,
        inboundCapacitySat: nodeInfo.inbound_liquidity_sat || 0,
        outboundCapacitySat: nodeInfo.outbound_liquidity_sat || 0,
        channelCount: nodeInfo.active_channels || 0,
      };
    } catch (error) {
      console.warn("Lightning not available for member:", memberId);
    }

    // Mock eCash and LNbits status (TODO: Implement actual checks)
    const ecashStatus = {
      available: true,
      balanceSat: 25000, // Mock balance
    };

    const lnbitsStatus = {
      available: true,
      balanceSat: 15000, // Mock balance
    };

    // Calculate total liquidity
    const totalLiquidity =
      phoenixdStatus.balanceSat +
      lightningStatus.balanceSat +
      ecashStatus.balanceSat +
      lnbitsStatus.balanceSat;

    // Determine liquidity health
    const liquidityHealth = determineLiquidityHealth(
      totalLiquidity,
      familyMember.role,
    );
    const needsAttention =
      liquidityHealth === "warning" || liquidityHealth === "critical";
    const recommendations = generateRecommendations(
      phoenixdStatus,
      lightningStatus,
      ecashStatus,
      lnbitsStatus,
      familyMember.role,
    );

    return {
      familyMemberId: memberId,
      memberName: familyMember.name,
      memberRole: familyMember.role,
      phoenixd: phoenixdStatus,
      lightning: lightningStatus,
      ecash: ecashStatus,
      lnbits: lnbitsStatus,
      totalLiquidity,
      liquidityHealth,
      needsAttention,
      recommendations,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error getting member liquidity status:", error);
    return null;
  }
}

async function getOverallFamilyLiquidityStatus(): Promise<OverallLiquidityStats> {
  try {
    const familyMembers = await getFamilyMembers();
    const memberStatuses: FamilyLiquidityStatus[] = [];

    // Get status for each family member
    for (const member of familyMembers) {
      const status = await getFamilyMemberLiquidityStatus(member.id);
      if (status) {
        memberStatuses.push(status);
      }
    }

    // Calculate overall statistics
    const totalFamilyLiquidity = memberStatuses.reduce(
      (sum, status) => sum + status.totalLiquidity,
      0,
    );
    const totalFamilyChannels = memberStatuses.reduce(
      (sum, status) =>
        sum + status.phoenixd.channelCount + status.lightning.channelCount,
      0,
    );
    const averageLiquidityPerMember =
      memberStatuses.length > 0
        ? totalFamilyLiquidity / memberStatuses.length
        : 0;

    const healthyMembers = memberStatuses.filter(
      (status) =>
        status.liquidityHealth === "excellent" ||
        status.liquidityHealth === "good",
    ).length;
    const membersNeedingAttention = memberStatuses.filter(
      (status) => status.needsAttention,
    ).length;

    const phoenixdTotalLiquidity = memberStatuses.reduce(
      (sum, status) => sum + status.phoenixd.balanceSat,
      0,
    );
    const lightningTotalLiquidity = memberStatuses.reduce(
      (sum, status) => sum + status.lightning.balanceSat,
      0,
    );
    const ecashTotalLiquidity = memberStatuses.reduce(
      (sum, status) => sum + status.ecash.balanceSat,
      0,
    );

    // Determine overall system health
    let systemHealth: OverallLiquidityStats["systemHealth"] = "excellent";
    if (membersNeedingAttention > familyMembers.length * 0.5) {
      systemHealth = "critical";
    } else if (membersNeedingAttention > familyMembers.length * 0.25) {
      systemHealth = "warning";
    } else if (membersNeedingAttention > 0) {
      systemHealth = "good";
    }

    return {
      totalFamilyLiquidity,
      totalFamilyChannels,
      averageLiquidityPerMember,
      healthyMembers,
      membersNeedingAttention,
      phoenixdTotalLiquidity,
      lightningTotalLiquidity,
      ecashTotalLiquidity,
      systemHealth,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error getting overall liquidity status:", error);
    throw error;
  }
}

function determineLiquidityHealth(
  totalLiquidity: number,
  memberRole: string,
): FamilyLiquidityStatus["liquidityHealth"] {
  // Define thresholds based on role
  let criticalThreshold = 5000; // 5k sats
  let warningThreshold = 20000; // 20k sats
  let goodThreshold = 50000; // 50k sats

  switch (memberRole) {
    case "parent":
      criticalThreshold = 50000; // 50k sats
      warningThreshold = 100000; // 100k sats
      goodThreshold = 250000; // 250k sats
      break;
    case "teen":
      criticalThreshold = 10000; // 10k sats
      warningThreshold = 30000; // 30k sats
      goodThreshold = 75000; // 75k sats
      break;
    case "child":
      criticalThreshold = 5000; // 5k sats
      warningThreshold = 15000; // 15k sats
      goodThreshold = 40000; // 40k sats
      break;
  }

  if (totalLiquidity < criticalThreshold) {
    return "critical";
  } else if (totalLiquidity < warningThreshold) {
    return "warning";
  } else if (totalLiquidity < goodThreshold) {
    return "good";
  } else {
    return "excellent";
  }
}

function generateRecommendations(
  phoenixd: FamilyLiquidityStatus["phoenixd"],
  lightning: FamilyLiquidityStatus["lightning"],
  ecash: FamilyLiquidityStatus["ecash"],
  lnbits: FamilyLiquidityStatus["lnbits"],
  memberRole: string,
): string[] {
  const recommendations: string[] = [];

  // PhoenixD recommendations
  if (!phoenixd.available) {
    recommendations.push("Setup PhoenixD for automated liquidity management");
  } else if (phoenixd.balanceSat < 10000) {
    recommendations.push("Consider requesting additional PhoenixD liquidity");
  }

  // Lightning recommendations
  if (!lightning.available) {
    recommendations.push(
      "Enable Lightning connectivity for more payment options",
    );
  } else if (lightning.inboundCapacitySat < 25000) {
    recommendations.push(
      "Increase Lightning inbound capacity for receiving payments",
    );
  }

  // Role-specific recommendations
  if (memberRole === "parent") {
    if (phoenixd.balanceSat + lightning.balanceSat < 100000) {
      recommendations.push(
        "Increase parent liquidity for family allowance distributions",
      );
    }
  }

  if (memberRole === "child") {
    if (phoenixd.balanceSat < 5000) {
      recommendations.push("Request allowance top-up for spending capacity");
    }
  }

  // General recommendations
  const totalBalance =
    phoenixd.balanceSat +
    lightning.balanceSat +
    ecash.balanceSat +
    lnbits.balanceSat;
  if (totalBalance === 0) {
    recommendations.push(
      "Initialize payment methods to start using family banking",
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Liquidity levels are healthy across all payment methods",
    );
  }

  return recommendations;
}
