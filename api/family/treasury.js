import { z } from "zod";
import { vault } from "../../lib/vault.js";
import {
    SecureSessionManager,
} from "../../netlify/functions/security/session-manager.js";

function getEnvVar(key) {
  return process.env[key];
}

async function getApiBaseUrl() {
  try {
    const vaultUrl = await vault.getCredentials("api_base_url");
    if (vaultUrl) {
      return vaultUrl;
    }
  } catch (error) {
    // Vault not available, fall back to environment variables
  }

  const envUrl = getEnvVar("API_BASE_URL") || getEnvVar("VITE_API_BASE_URL");
  if (envUrl) {
    return envUrl;
  }

  return "https://api.satnam.pub";
}

/**
 * @typedef {Object} FamilyTreasury
 * @property {string} familyId
 * @property {number} totalBalance
 * @property {number} totalLightning
 * @property {number} totalEcash
 * @property {number} totalChannelCapacity
 * @property {number} liquidityRatio
 * @property {number} weeklyGrowth
 * @property {number} monthlyGrowth
 * @property {number} yearlyGrowth
 * @property {TreasuryBreakdown} breakdown
 * @property {TreasuryAnalytics} analytics
 * @property {EmergencyReserves} emergencyReserves
 * @property {Date} lastUpdated
 */

/**
 * @typedef {Object} MemberBalance
 * @property {string} memberId
 * @property {string} username
 * @property {"private"|"offspring"|"adult"|"steward"|"guardian"} role
 * @property {number} totalBalance
 * @property {number} lightningBalance
 * @property {number} ecashBalance
 * @property {number} channelBalance
 * @property {Date} lastActivity
 */

/**
 * @typedef {Object} TreasuryBreakdown
 * @property {Object} byType
 * @property {number} byType.lightning
 * @property {number} byType.ecash
 * @property {number} byType.channels
 * @property {Object} byRole
 * @property {number} byRole.private
 * @property {number} byRole.offspring
 * @property {number} byRole.adult
 * @property {number} byRole.steward
 * @property {number} byRole.guardian
 * @property {MemberBalance[]} members
 */

/**
 * @typedef {Object} TreasuryAnalytics
 * @property {Object} summary
 * @property {number} summary.totalTransactions
 * @property {number} summary.averageTransactionSize
 * @property {number} summary.largestTransaction
 * @property {Object} growth
 * @property {number} growth.weekly
 * @property {number} growth.monthly
 * @property {number} growth.yearly
 * @property {Object} liquidity
 * @property {number} liquidity.ratio
 * @property {number} liquidity.availableCapacity
 * @property {number} liquidity.utilizationRate
 */

/**
 * @typedef {Object} EmergencyReserves
 * @property {number} amount
 * @property {number} threshold
 * @property {string} status
 * @property {Date} lastUpdated
 */

const treasuryConfigSchema = z.object({
  familyId: z.string(),
  emergencyThreshold: z.number().min(0),
  liquidityTarget: z.number().min(0).max(1),
  autoRebalance: z.boolean(),
  notifications: z.object({
    lowBalance: z.boolean(),
    largeTransactions: z.boolean(),
    weeklyReports: z.boolean(),
  }),
});

/**
 * Get family treasury data with privacy filtering
 */
export const getFamilyTreasury = async (req, res) => {
  try {
    const { familyId, includePrivate } = req.query;

    const authHeader = req.headers.authorization;
    const sessionData = await SecureSessionManager.validateSessionFromHeader(authHeader);

    if (!sessionData?.isAuthenticated || !sessionData.sessionToken) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    const isAdmin = sessionData.federationRole === "guardian";
    const isParent =
      sessionData.federationRole === "adult" ||
      sessionData.federationRole === "guardian";
    
    if (!familyId) {
      res.status(400).json({
        success: false,
        error: "Family ID required",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    const mockTreasury = {
      familyId: familyId,
      totalBalance: 8770000,
      totalLightning: 5300000,
      totalEcash: 3200000,
      totalChannelCapacity: 3000000,
      liquidityRatio: 0.75,
      weeklyGrowth: 0.12,
      monthlyGrowth: 0.45,
      yearlyGrowth: 1.23,
      breakdown: {
        byType: {
          lightning: 5300000,
          ecash: 3200000,
          channels: 3000000,
        },
        byRole: {
          private: 0,
          offspring: 270000,
          adult: 3500000,
          steward: 0,
          guardian: 5000000,
        },
        members: [
          {
            memberId: "1",
            username: "satnam_dad",
            role: "guardian",
            totalBalance: 5000000,
            lightningBalance: 3200000,
            ecashBalance: 1800000,
            channelBalance: 3000000,
            lastActivity: new Date(),
          },
          {
            memberId: "2",
            username: "satnam_mom",
            role: "adult",
            totalBalance: 3500000,
            lightningBalance: 2100000,
            ecashBalance: 1400000,
            channelBalance: 0,
            lastActivity: new Date(Date.now() - 30 * 60 * 1000),
          },
          {
            memberId: "3",
            username: "satnam_teen",
            role: "offspring",
            totalBalance: 270000,
            lightningBalance: 0,
            ecashBalance: 270000,
            channelBalance: 0,
            lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000),
          },
        ],
      },
      analytics: {
        summary: {
          totalTransactions: 1247,
          averageTransactionSize: 45000,
          largestTransaction: 500000,
        },
        growth: {
          weekly: 0.12,
          monthly: 0.45,
          yearly: 1.23,
        },
        liquidity: {
          ratio: 0.75,
          availableCapacity: 2250000,
          utilizationRate: 0.25,
        },
      },
      emergencyReserves: {
        amount: 1000000,
        threshold: 500000,
        status: "healthy",
        lastUpdated: new Date(),
      },
      lastUpdated: new Date(),
    };

    const requestPrivateData = includePrivate === "true";

    if (requestPrivateData && !isAdmin) {
      res.status(403).json({
        success: false,
        error: "Admin access required for private data",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    const filteredTreasury = {
      ...mockTreasury,
      breakdown: {
        ...mockTreasury.breakdown,
        members: mockTreasury.breakdown.members.map(
        (member) => {
          if (isParent && member.memberId === sessionData.userId) {
            return member;
          } else if (isParent && member.role === "offspring") {
            return {
              ...member,
              lightningBalance: requestPrivateData
                ? member.lightningBalance
                : 0,
              ecashBalance: requestPrivateData ? member.ecashBalance : 0,
              channelBalance: 0,
              totalBalance: member.totalBalance,
            };
          } else if (member.role === "guardian" || member.role === "adult") {
            return {
              ...member,
              lightningBalance: 0,
              ecashBalance: 0,
              channelBalance: 0,
              totalBalance: member.totalBalance,
            };
          } else {
            return {
              ...member,
              lightningBalance: 0,
              ecashBalance: 0,
              channelBalance: 0,
              totalBalance: member.role === "offspring" ? 0 : member.totalBalance,
            };
          }
        }
      ),
      },
    };

    if (!requestPrivateData) {
      filteredTreasury.emergencyReserves = {
        ...filteredTreasury.emergencyReserves,
        amount: 0,
      };
    }

    if (!isParent) {
      filteredTreasury.analytics.summary.averageTransactionSize = 0;
      filteredTreasury.analytics.summary.largestTransaction = 0;
      filteredTreasury.emergencyReserves = {
        ...filteredTreasury.emergencyReserves,
        amount: 0,
      };
    }

    res.status(200).json({
      success: true,
      data: filteredTreasury,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
        includePrivate: includePrivate === "true",
        userRole: sessionData.federationRole,
        familyId: familyId,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve family treasury data",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
};

/**
 * Update family treasury configuration
 */
export const updateTreasuryConfig = async (req, res) => {
  try {
    const config = req.body;

    const authHeader = req.headers.authorization;
    const sessionData = await SecureSessionManager.validateSessionFromHeader(authHeader);

    if (!sessionData?.isAuthenticated || !sessionData.sessionToken) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    if (sessionData.federationRole !== "guardian") {
      res.status(403).json({
        success: false,
        error: "Guardian access required for treasury configuration",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    const validationResult = treasuryConfigSchema.safeParse(config);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Invalid configuration data",
        details: validationResult.error.errors,
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        message: "Treasury configuration updated successfully",
        config: validationResult.data,
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
        userRole: sessionData.federationRole,
        familyId: config.familyId,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to update treasury configuration",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
};

/**
 * Get family treasury analytics with privacy filtering
 */
export const getTreasuryAnalytics = async (req, res) => {
  try {
    const { familyId, timeframe = "month" } = req.query;

    const authHeader = req.headers.authorization;
    const sessionData = await SecureSessionManager.validateSessionFromHeader(authHeader);

    if (!sessionData?.isAuthenticated || !sessionData.sessionToken) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    const isAdmin = sessionData.federationRole === "guardian";
    const isParent =
      sessionData.federationRole === "adult" ||
      sessionData.federationRole === "guardian";

    if (!familyId) {
      res.status(400).json({
        success: false,
        error: "Family ID required",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    const analytics = {
      familyId: familyId,
      timeframe: timeframe,
      summary: {
        totalTransactions: 1247,
        totalVolume: 55890000,
        averageTransactionSize: 45000,
        largestTransaction: 500000,
        growthRate: timeframe === "week" ? 0.12 : timeframe === "month" ? 0.45 : 1.23,
      },
      breakdown: {
        byType: {
          lightning: { transactions: 892, volume: 40120000 },
          ecash: { transactions: 355, volume: 15770000 },
        },
        byMember: [
          { memberId: "1", username: "satnam_dad", transactions: 456, volume: 25000000 },
          { memberId: "2", username: "satnam_mom", transactions: 234, volume: 12000000 },
          { memberId: "3", username: "satnam_teen", transactions: 89, volume: 890000 },
        ],
      },
      trends: {
        daily: Array.from({ length: 30 }, (_, i) => ({
          date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          transactions: Math.floor(Math.random() * 50) + 10,
          volume: Math.floor(Math.random() * 2000000) + 500000,
        })),
      },
      liquidity: isAdmin
        ? {
            currentRatio: 0.75,
            targetRatio: 0.80,
            availableCapacity: 2250000,
            utilizationRate: 0.25,
            rebalanceRecommendations: [
              { type: "increase_lightning", amount: 500000, priority: "medium" },
            ],
          }
        : undefined,
    };

    if (!isAdmin) {
      if (!isParent) {
        analytics.summary.averageTransactionSize = 0;
        analytics.summary.largestTransaction = 0;
        analytics.breakdown.byMember = analytics.breakdown.byMember.map(member => ({
          ...member,
          volume: member.memberId === sessionData.userId ? member.volume : 0,
        }));
      }
    }

    res.status(200).json({
      success: true,
      data: analytics,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
        timeframe: timeframe,
        userRole: sessionData.federationRole,
        familyId: familyId,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve treasury analytics",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
};
