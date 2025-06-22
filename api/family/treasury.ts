import { Request, Response } from "express";
import { z } from "zod";
import {
  authenticateRequest,
  checkFamilyAccess,
  checkFamilyAdminAccess,
} from "../../lib/middleware/auth";

// Enhanced Family Treasury interfaces
interface FamilyTreasury {
  familyId: string;
  totalBalance: number;
  totalLightning: number;
  totalEcash: number;
  totalChannelCapacity: number;
  liquidityRatio: number;
  weeklyGrowth: number;
  monthlyGrowth: number;
  yearlyGrowth: number;
  breakdown: TreasuryBreakdown;
  analytics: TreasuryAnalytics;
  emergencyReserves: EmergencyReserves;
  lastUpdated: Date;
}

interface TreasuryBreakdown {
  byMember: MemberBalance[];
  byType: {
    lightning: number;
    ecash: number;
    channels: number;
    reserves: number;
  };
  byRole: {
    parents: number;
    children: number;
    guardians: number;
  };
}

interface MemberBalance {
  memberId: string;
  username: string;
  role: string;
  totalBalance: number;
  lightningBalance: number;
  ecashBalance: number;
  channelBalance: number;
  lastActivity: Date;
}

interface TreasuryAnalytics {
  weeklySpending: number;
  monthlySpending: number;
  averageTransactionSize: number;
  transactionCount24h: number;
  transactionCountWeek: number;
  topSpendingCategories: SpendingCategory[];
  growthTrend: GrowthTrend[];
  liquidityHealth: LiquidityHealth;
}

interface SpendingCategory {
  category: string;
  amount: number;
  percentage: number;
  transactionCount: number;
}

interface GrowthTrend {
  period: string;
  date: Date;
  balance: number;
  growth: number;
}

interface LiquidityHealth {
  status: "excellent" | "good" | "warning" | "critical";
  ratio: number;
  recommendation: string;
  emergencyThreshold: number;
  optimalRange: [number, number];
}

interface EmergencyReserves {
  totalReserves: number;
  liquidReserves: number;
  channelReserves: number;
  federationReserves: number;
  lastEmergencyUse?: Date;
  emergencyProtocolsActive: boolean;
}

/**
 * Get Family Treasury Overview
 * GET /api/family/treasury
 */
export async function getFamilyTreasury(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { familyId, includePrivate = "false" } = req.query;

    // Authenticate the request
    const authResult = await authenticateRequest(req);
    if (!authResult.success) {
      res.status(401).json({
        success: false,
        error: "Unauthorized",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    // Verify family membership
    const accessCheck = await checkFamilyAccess(
      authResult.user!,
      familyId as string
    );
    if (!accessCheck.allowed) {
      res.status(403).json({
        success: false,
        error: "Access denied",
        details: accessCheck.error,
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    // In a real implementation, this would:
    // 1. ✅ Authenticate the request - IMPLEMENTED
    // 2. ✅ Verify family membership - IMPLEMENTED
    // 3. Query PhoenixD for Lightning balances
    // 4. Query Fedimint for eCash balances
    // 5. Calculate real-time analytics

    // Mock treasury data for demonstration
    const mockTreasury: FamilyTreasury = {
      familyId: (familyId as string) || "satnam_family",
      totalBalance: 8770000, // 8.77M sats
      totalLightning: 5435000, // 5.435M sats
      totalEcash: 3335000, // 3.335M sats
      totalChannelCapacity: 50000000, // 50M sats
      liquidityRatio: 0.72,
      weeklyGrowth: 12.5,
      monthlyGrowth: 45.2,
      yearlyGrowth: 180.7,
      breakdown: {
        byMember: [
          {
            memberId: "1",
            username: "satnam_dad",
            role: "parent",
            totalBalance: 5000000,
            lightningBalance: 3200000,
            ecashBalance: 1800000,
            channelBalance: 3000000,
            lastActivity: new Date(),
          },
          {
            memberId: "2",
            username: "satnam_mom",
            role: "parent",
            totalBalance: 3500000,
            lightningBalance: 2100000,
            ecashBalance: 1400000,
            channelBalance: 0,
            lastActivity: new Date(Date.now() - 30 * 60 * 1000),
          },
          {
            memberId: "3",
            username: "arjun_teen",
            role: "child",
            totalBalance: 150000,
            lightningBalance: 90000,
            ecashBalance: 60000,
            channelBalance: 0,
            lastActivity: new Date(Date.now() - 60 * 60 * 1000),
          },
          {
            memberId: "4",
            username: "priya_kid",
            role: "child",
            totalBalance: 75000,
            lightningBalance: 25000,
            ecashBalance: 50000,
            channelBalance: 0,
            lastActivity: new Date(Date.now() - 3 * 60 * 60 * 1000),
          },
          {
            memberId: "5",
            username: "kiran_child",
            role: "child",
            totalBalance: 45000,
            lightningBalance: 20000,
            ecashBalance: 25000,
            channelBalance: 0,
            lastActivity: new Date(Date.now() - 6 * 60 * 60 * 1000),
          },
        ],
        byType: {
          lightning: 5435000,
          ecash: 3335000,
          channels: 3000000,
          reserves: 1000000,
        },
        byRole: {
          parents: 8500000,
          children: 270000,
          guardians: 0,
        },
      },
      analytics: {
        weeklySpending: 125000,
        monthlySpending: 450000,
        averageTransactionSize: 15000,
        transactionCount24h: 26,
        transactionCountWeek: 156,
        topSpendingCategories: [
          {
            category: "Family Allowances",
            amount: 75000,
            percentage: 60,
            transactionCount: 12,
          },
          {
            category: "Lightning Fees",
            amount: 25000,
            percentage: 20,
            transactionCount: 45,
          },
          {
            category: "Emergency Fund",
            amount: 15000,
            percentage: 12,
            transactionCount: 3,
          },
          {
            category: "Education",
            amount: 10000,
            percentage: 8,
            transactionCount: 8,
          },
        ],
        growthTrend: [
          {
            period: "Week 1",
            date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            balance: 7800000,
            growth: 0,
          },
          {
            period: "Week 2",
            date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
            balance: 8100000,
            growth: 3.8,
          },
          {
            period: "Week 3",
            date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
            balance: 8400000,
            growth: 3.7,
          },
          {
            period: "Week 4",
            date: new Date(),
            balance: 8770000,
            growth: 4.4,
          },
        ],
        liquidityHealth: {
          status: "good",
          ratio: 0.72,
          recommendation:
            "Consider opening additional channels for better routing",
          emergencyThreshold: 0.1,
          optimalRange: [0.3, 0.8],
        },
      },
      emergencyReserves: {
        totalReserves: 1000000,
        liquidReserves: 500000,
        channelReserves: 300000,
        federationReserves: 200000,
        emergencyProtocolsActive: false,
      },
      lastUpdated: new Date(),
    };

    // Apply privacy filtering based on user permissions and request parameters
    const isAdmin = accessCheck.role === "admin";
    const isParent = accessCheck.role === "parent";
    const requestPrivateData = includePrivate === "true";

    // Check authorization for private data access
    if (requestPrivateData && !isAdmin) {
      res.status(403).json({
        success: false,
        error: "Admin access required for private treasury data",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    // Apply data filtering based on user role and privacy settings
    if (!isAdmin) {
      // Filter sensitive member-specific data for non-admin users
      mockTreasury.breakdown.byMember = mockTreasury.breakdown.byMember.map(
        (member) => {
          // Parents can see their own data and limited child data
          if (isParent && member.memberId === authResult.user!.id) {
            // Parent viewing their own data - show full details
            return member;
          } else if (isParent && member.role === "child") {
            // Parent viewing child data - show limited info
            return {
              ...member,
              lightningBalance: requestPrivateData
                ? member.lightningBalance
                : 0,
              ecashBalance: requestPrivateData ? member.ecashBalance : 0,
              channelBalance: 0, // Always hide channel details from parents
              totalBalance: member.totalBalance,
            };
          } else if (member.role === "parent") {
            // Non-admin viewing parent data - show only totals
            return {
              ...member,
              lightningBalance: 0,
              ecashBalance: 0,
              channelBalance: 0,
              totalBalance: member.totalBalance,
            };
          } else {
            // Non-admin viewing other member data - hide all sensitive info
            return {
              ...member,
              lightningBalance: 0,
              ecashBalance: 0,
              channelBalance: 0,
              totalBalance: member.role === "child" ? 0 : member.totalBalance,
            };
          }
        }
      );

      // Filter emergency reserves for non-admin users
      if (!requestPrivateData) {
        mockTreasury.emergencyReserves = {
          ...mockTreasury.emergencyReserves,
          liquidReserves: 0,
          channelReserves: 0,
          federationReserves: 0,
          lastEmergencyUse: undefined,
        };
      }

      // Filter detailed analytics for non-admin users
      if (!isParent) {
        mockTreasury.analytics.topSpendingCategories =
          mockTreasury.analytics.topSpendingCategories.map((category) => ({
            ...category,
            amount: 0, // Hide specific amounts for non-parent users
          }));
      }
    }

    res.status(200).json({
      success: true,
      data: mockTreasury,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
        includePrivate: includePrivate === "true",
        userRole: accessCheck.role,
        familyId: familyId as string,
      },
    });
  } catch (error) {
    console.error("Family treasury error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to retrieve family treasury data",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}

/**
 * Update Treasury Configuration
 * POST /api/family/treasury/config
 */
export async function updateTreasuryConfig(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const configSchema = z.object({
      familyId: z.string().min(1),
      emergencyThreshold: z.number().min(0.05).max(0.5).optional(),
      autoRebalancing: z.boolean().optional(),
      spendingLimits: z
        .object({
          daily: z.number().positive().optional(),
          weekly: z.number().positive().optional(),
          monthly: z.number().positive().optional(),
        })
        .optional(),
      liquidityTargets: z
        .object({
          minRatio: z.number().min(0.1).max(0.9).optional(),
          maxRatio: z.number().min(0.1).max(0.9).optional(),
          rebalanceThreshold: z.number().min(0.05).max(0.5).optional(),
        })
        .optional(),
    });

    const validationResult = configSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Invalid treasury configuration",
        details: validationResult.error.errors,
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    const config = validationResult.data;

    // Add business logic validation
    if (config.liquidityTargets) {
      if (
        config.liquidityTargets.minRatio &&
        config.liquidityTargets.maxRatio
      ) {
        if (
          config.liquidityTargets.minRatio >= config.liquidityTargets.maxRatio
        ) {
          res.status(400).json({
            success: false,
            error: "Minimum liquidity ratio must be less than maximum ratio",
            meta: {
              timestamp: new Date().toISOString(),
              demo: true,
            },
          });
          return;
        }
      }

      // Validate rebalance threshold is reasonable
      if (config.liquidityTargets.rebalanceThreshold) {
        const minRatio = config.liquidityTargets.minRatio || 0.1;
        const maxRatio = config.liquidityTargets.maxRatio || 0.9;
        const threshold = config.liquidityTargets.rebalanceThreshold;

        if (threshold >= (maxRatio - minRatio) / 2) {
          res.status(400).json({
            success: false,
            error:
              "Rebalance threshold too large for the liquidity ratio range",
            meta: {
              timestamp: new Date().toISOString(),
              demo: true,
            },
          });
          return;
        }
      }
    }

    // Validate spending limits hierarchy (daily <= weekly <= monthly)
    if (config.spendingLimits) {
      const { daily, weekly, monthly } = config.spendingLimits;

      if (daily && weekly && daily > weekly) {
        res.status(400).json({
          success: false,
          error: "Daily spending limit cannot exceed weekly limit",
          meta: {
            timestamp: new Date().toISOString(),
            demo: true,
          },
        });
        return;
      }

      if (weekly && monthly && weekly > monthly) {
        res.status(400).json({
          success: false,
          error: "Weekly spending limit cannot exceed monthly limit",
          meta: {
            timestamp: new Date().toISOString(),
            demo: true,
          },
        });
        return;
      }

      if (daily && monthly && daily > monthly) {
        res.status(400).json({
          success: false,
          error: "Daily spending limit cannot exceed monthly limit",
          meta: {
            timestamp: new Date().toISOString(),
            demo: true,
          },
        });
        return;
      }

      // Validate reasonable spending limits (not too small to be practical)
      const minPracticalLimit = 1000; // 1000 sats minimum
      if (daily && daily < minPracticalLimit) {
        res.status(400).json({
          success: false,
          error: `Daily spending limit must be at least ${minPracticalLimit} sats`,
          meta: {
            timestamp: new Date().toISOString(),
            demo: true,
          },
        });
        return;
      }
    }

    // Validate emergency threshold is reasonable
    if (config.emergencyThreshold) {
      if (
        config.liquidityTargets?.minRatio &&
        config.emergencyThreshold >= config.liquidityTargets.minRatio
      ) {
        res.status(400).json({
          success: false,
          error:
            "Emergency threshold must be lower than minimum liquidity ratio",
          meta: {
            timestamp: new Date().toISOString(),
            demo: true,
          },
        });
        return;
      }
    }

    // Authenticate the request
    const authResult = await authenticateRequest(req);
    if (!authResult.success) {
      res.status(401).json({
        success: false,
        error: "Unauthorized",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    // Verify family admin access (treasury config requires admin permissions)
    const accessCheck = await checkFamilyAdminAccess(
      authResult.user!,
      config.familyId
    );
    if (!accessCheck.allowed) {
      res.status(403).json({
        success: false,
        error: "Admin access required",
        details: accessCheck.error,
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    // In a real implementation, this would:
    // 1. ✅ Validate family permissions - IMPLEMENTED
    // 2. Update treasury configuration in database
    // 3. Notify PhoenixD of liquidity changes
    // 4. Update Fedimint federation settings
    // 5. Trigger rebalancing if needed

    console.log("Treasury configuration updated:", config);

    res.status(200).json({
      success: true,
      data: {
        message: "Treasury configuration updated successfully",
        config,
        effectiveDate: new Date(),
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
        userRole: accessCheck.role,
        familyId: config.familyId,
      },
    });
  } catch (error) {
    console.error("Treasury config update error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to update treasury configuration",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}

/**
 * Get Treasury Analytics
 * GET /api/family/treasury/analytics
 */
export async function getTreasuryAnalytics(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const {
      familyId,
      period = "30d",
      includeProjections = "false",
    } = req.query;

    // Authenticate the request
    const authResult = await authenticateRequest(req);
    if (!authResult.success) {
      res.status(401).json({
        success: false,
        error: "Unauthorized",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    // Verify family membership
    const accessCheck = await checkFamilyAccess(
      authResult.user!,
      familyId as string
    );
    if (!accessCheck.allowed) {
      res.status(403).json({
        success: false,
        error: "Access denied",
        details: accessCheck.error,
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    // Mock analytics data
    const analytics = {
      period: period as string,
      summary: {
        totalGrowth: 45.2,
        averageDailyGrowth: 1.5,
        bestPerformingWeek: "Week 4",
        totalTransactions: 156,
        averageTransactionSize: 15000,
        totalFees: 2500,
      },
      trends: {
        balanceGrowth: [
          { date: "2024-01-01", balance: 7800000 },
          { date: "2024-01-08", balance: 8100000 },
          { date: "2024-01-15", balance: 8400000 },
          { date: "2024-01-22", balance: 8770000 },
        ],
        spendingPatterns: [
          { category: "Allowances", trend: "increasing", change: 15.2 },
          { category: "Lightning Fees", trend: "stable", change: 2.1 },
          { category: "Emergency", trend: "decreasing", change: -5.8 },
        ],
      },
      projections:
        includeProjections === "true"
          ? {
              nextMonth: {
                estimatedBalance: 9200000,
                confidence: 85,
                factors: [
                  "Current growth rate",
                  "Seasonal patterns",
                  "Family spending habits",
                ],
              },
              nextQuarter: {
                estimatedBalance: 10500000,
                confidence: 70,
                factors: [
                  "Long-term trends",
                  "Economic conditions",
                  "Family goals",
                ],
              },
            }
          : undefined,
    };

    // Apply privacy filtering based on user role
    const isAdmin = accessCheck.role === "admin";
    const isParent = accessCheck.role === "parent";

    if (!isAdmin) {
      // Filter sensitive analytics data for non-admin users
      if (!isParent) {
        // Non-parent users get limited analytics
        analytics.summary.averageTransactionSize = 0;
        analytics.summary.totalFees = 0;

        // Hide specific balance amounts for non-parent users
        analytics.trends.balanceGrowth = analytics.trends.balanceGrowth.map(
          (item) => ({ ...item, balance: 0 })
        );
      }

      // Projections require admin access for full details
      if (analytics.projections && !isAdmin) {
        analytics.projections = {
          nextMonth: {
            ...analytics.projections.nextMonth,
            estimatedBalance: isParent
              ? analytics.projections.nextMonth.estimatedBalance
              : 0,
            factors: ["Limited access - contact admin for details"],
          },
          nextQuarter: {
            ...analytics.projections.nextQuarter,
            estimatedBalance: isParent
              ? analytics.projections.nextQuarter.estimatedBalance
              : 0,
            factors: ["Limited access - contact admin for details"],
          },
        };
      }
    }

    res.status(200).json({
      success: true,
      data: analytics,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
        period: period as string,
        includeProjections: includeProjections === "true",
        userRole: accessCheck.role,
        familyId: familyId as string,
      },
    });
  } catch (error) {
    console.error("Treasury analytics error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to retrieve treasury analytics",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}

export default {
  getFamilyTreasury,
  updateTreasuryConfig,
  getTreasuryAnalytics,
};
