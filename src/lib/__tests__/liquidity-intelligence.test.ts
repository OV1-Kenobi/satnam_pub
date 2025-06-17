/**
 * LIQUIDITY INTELLIGENCE SYSTEM INTEGRATION TESTS
 *
 * Real integration tests for AI-powered liquidity forecasting and optimization.
 * Requires real credentials to be provided via environment variables.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import {
  encryptSensitiveData,
  generateSecureUUID,
} from "../../../lib/privacy/encryption";
import { supabase } from "../../../lib/supabase";
import { LiquidityIntelligenceSystem } from "../liquidity-intelligence";

// Test configuration
const TEST_CONFIG = {
  familyId: process.env.TEST_FAMILY_ID || generateSecureUUID(),
  zeusLspEndpoint: process.env.ZEUS_LSP_ENDPOINT || "",
  zeusApiKey: process.env.ZEUS_API_KEY || "",
  voltageNodeId: process.env.VOLTAGE_NODE_ID || "",
  lnbitsAdminKey: process.env.LNBITS_ADMIN_KEY || "",
  realCredentials: Boolean(
    process.env.ZEUS_LSP_ENDPOINT &&
      process.env.ZEUS_API_KEY &&
      process.env.VOLTAGE_NODE_ID &&
      process.env.LNBITS_ADMIN_KEY,
  ),
};

describe("Liquidity Intelligence System Integration Tests", () => {
  let intelligenceSystem: LiquidityIntelligenceSystem;
  let testDataCreated = false;

  beforeAll(async () => {
    console.log(
      "🧠 Starting Liquidity Intelligence System integration tests...",
    );
    console.log(`Real credentials available: ${TEST_CONFIG.realCredentials}`);

    if (!TEST_CONFIG.realCredentials) {
      console.warn("⚠️  Using mock credentials - some tests will be skipped");
    }

    // Initialize intelligence system
    const lspConfig = TEST_CONFIG.realCredentials
      ? {
          endpoint: TEST_CONFIG.zeusLspEndpoint,
          apiKey: TEST_CONFIG.zeusApiKey,
        }
      : undefined;

    intelligenceSystem = new LiquidityIntelligenceSystem(lspConfig);
  });

  beforeEach(async () => {
    // Create test data if using real credentials
    if (TEST_CONFIG.realCredentials && !testDataCreated) {
      try {
        // Create test family with liquidity monitoring enabled
        const { error: familyError } = await supabase
          .from("secure_families")
          .upsert({
            family_uuid: TEST_CONFIG.familyId,
            member_count: 3,
            privacy_level: 3,
            encryption_version: "1.0",
            allowance_automation_enabled: true,
            zeus_integration_enabled: true,
            zeus_lsp_endpoint: TEST_CONFIG.zeusLspEndpoint,
            emergency_protocols_enabled: true,
            liquidity_monitoring_enabled: true,
            real_time_alerts_enabled: true,
          });

        if (familyError) {
          console.warn("⚠️  Failed to create test family:", familyError);
          return;
        }

        // Create sample liquidity data for forecasting
        await createSampleLiquidityData();

        testDataCreated = true;
        console.log("✅ Test family and liquidity data created successfully");
      } catch (error) {
        console.warn("⚠️  Failed to create test data:", error);
      }
    }
  });

  afterAll(async () => {
    // Cleanup test data
    if (testDataCreated) {
      try {
        await supabase
          .from("secure_liquidity_forecasts")
          .delete()
          .eq("family_uuid", TEST_CONFIG.familyId);
        await supabase
          .from("secure_families")
          .delete()
          .eq("family_uuid", TEST_CONFIG.familyId);

        console.log("🧹 Test data cleaned up");
      } catch (error) {
        console.warn("⚠️  Failed to cleanup test data:", error);
      }
    }
  });

  describe("System Initialization", () => {
    test("should initialize with Zeus LSP configuration", () => {
      expect(intelligenceSystem).toBeDefined();
      expect(intelligenceSystem.zeusLspEnabled).toBe(
        TEST_CONFIG.realCredentials,
      );
    });

    test("should validate configuration parameters", () => {
      const validConfig = {
        endpoint: "https://test.zeusln.app",
        apiKey: "test-key",
      };

      expect(() => new LiquidityIntelligenceSystem(validConfig)).not.toThrow();
      expect(() => new LiquidityIntelligenceSystem(undefined)).not.toThrow();
    });

    test("should initialize AI models", async () => {
      const modelStatus = await intelligenceSystem.getModelStatus();

      expect(modelStatus).toBeDefined();
      expect(modelStatus.lstmModel).toBeDefined();
      expect(modelStatus.arimaModel).toBeDefined();
      expect(modelStatus.randomForestModel).toBeDefined();
      expect(modelStatus.zeusMLModel).toBeDefined();
      expect(modelStatus.lastTraining).toBeDefined();

      console.log("🤖 AI model status:", modelStatus);
    });
  });

  describe("Liquidity Metrics Collection", () => {
    test("should collect comprehensive liquidity metrics", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping metrics collection test - no credentials provided",
        );
        return;
      }

      const metrics = await intelligenceSystem.getLiquidityMetrics(
        TEST_CONFIG.familyId,
      );

      expect(metrics).toBeDefined();
      expect(metrics.utilization).toBeDefined();
      expect(metrics.utilization.current).toBeGreaterThanOrEqual(0);
      expect(metrics.utilization.current).toBeLessThanOrEqual(1);
      expect(metrics.utilization.average24h).toBeGreaterThanOrEqual(0);
      expect(metrics.utilization.peak24h).toBeGreaterThanOrEqual(0);

      expect(metrics.efficiency).toBeDefined();
      expect(metrics.efficiency.routingSuccessRate).toBeGreaterThanOrEqual(0);
      expect(metrics.efficiency.routingSuccessRate).toBeLessThanOrEqual(1);
      expect(metrics.efficiency.averageRoutingTime).toBeGreaterThan(0);
      expect(metrics.efficiency.costEfficiency).toBeGreaterThanOrEqual(0);

      expect(metrics.reliability).toBeDefined();
      expect(metrics.reliability.uptime).toBeGreaterThanOrEqual(0);
      expect(metrics.reliability.uptime).toBeLessThanOrEqual(1);
      expect(metrics.reliability.emergencyActivations).toBeGreaterThanOrEqual(
        0,
      );

      expect(metrics.zeusLsp).toBeDefined();
      expect(metrics.zeusLsp.jitLiquidity).toBeGreaterThanOrEqual(0);
      expect(metrics.zeusLsp.jitUsageRate).toBeGreaterThanOrEqual(0);

      console.log("📊 Liquidity metrics collected:", {
        utilization: metrics.utilization.current,
        routingSuccess: metrics.efficiency.routingSuccessRate,
        uptime: metrics.reliability.uptime,
        jitLiquidity: metrics.zeusLsp.jitLiquidity,
      });
    }, 20000);

    test("should collect real-time network data", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping real-time data test - no credentials provided",
        );
        return;
      }

      const networkData = await intelligenceSystem.collectNetworkData();

      expect(networkData).toBeDefined();
      expect(networkData.networkCapacity).toBeGreaterThan(0);
      expect(networkData.averageFeeRate).toBeGreaterThanOrEqual(0);
      expect(networkData.channelCount).toBeGreaterThan(0);
      expect(networkData.timestamp).toBeDefined();
      expect(Array.isArray(networkData.feeDistribution)).toBe(true);
      expect(Array.isArray(networkData.capacityDistribution)).toBe(true);

      console.log("🌐 Network data collected:", {
        capacity: networkData.networkCapacity,
        avgFee: networkData.averageFeeRate,
        channels: networkData.channelCount,
      });
    }, 15000);
  });

  describe("AI-Powered Forecasting", () => {
    test("should generate daily liquidity forecast", async () => {
      const forecast = await intelligenceSystem.generateLiquidityForecast(
        TEST_CONFIG.familyId,
        "daily",
        7, // 7 days ahead
      );

      expect(forecast).toBeDefined();
      expect(forecast.id).toBeDefined();
      expect(forecast.familyId).toBe(TEST_CONFIG.familyId);
      expect(forecast.forecastDate).toBeDefined();
      expect(forecast.timeframe).toBe("daily");
      expect(forecast.forecastHorizon).toBe(7);

      expect(forecast.predictions).toBeDefined();
      expect(forecast.predictions.expectedInflow).toBeGreaterThanOrEqual(0);
      expect(forecast.predictions.expectedOutflow).toBeGreaterThanOrEqual(0);
      expect(forecast.predictions.netFlow).toBeDefined();
      expect(forecast.predictions.confidenceLevel).toBeGreaterThan(0);
      expect(forecast.predictions.confidenceLevel).toBeLessThanOrEqual(1);

      expect(forecast.liquidityNeeds).toBeDefined();
      expect(forecast.liquidityNeeds.minimumRequired).toBeGreaterThan(0);
      expect(forecast.liquidityNeeds.optimalLevel).toBeGreaterThan(0);
      expect(forecast.liquidityNeeds.bufferAmount).toBeGreaterThan(0);

      expect(Array.isArray(forecast.riskFactors)).toBe(true);
      expect(Array.isArray(forecast.recommendations.channelAdjustments)).toBe(
        true,
      );

      console.log("🔮 Daily forecast generated:", {
        netFlow: forecast.predictions.netFlow,
        confidence: forecast.predictions.confidenceLevel,
        minRequired: forecast.liquidityNeeds.minimumRequired,
        riskFactors: forecast.riskFactors.length,
      });
    }, 30000);

    test("should generate weekly forecast with higher accuracy", async () => {
      const weeklyForecast = await intelligenceSystem.generateLiquidityForecast(
        TEST_CONFIG.familyId,
        "weekly",
        4, // 4 weeks ahead
      );

      expect(weeklyForecast).toBeDefined();
      expect(weeklyForecast.timeframe).toBe("weekly");
      expect(weeklyForecast.forecastHorizon).toBe(4);
      expect(weeklyForecast.predictions.confidenceLevel).toBeGreaterThan(0.5); // Should be reasonably confident

      // Weekly forecasts should have different patterns than daily
      expect(weeklyForecast.predictions.expectedInflow).not.toBe(0);
      expect(weeklyForecast.predictions.expectedOutflow).not.toBe(0);

      console.log("📅 Weekly forecast generated:", {
        netFlow: weeklyForecast.predictions.netFlow,
        confidence: weeklyForecast.predictions.confidenceLevel,
        patterns: weeklyForecast.patterns?.length || 0,
      });
    }, 25000);

    test("should generate monthly forecast for long-term planning", async () => {
      const monthlyForecast =
        await intelligenceSystem.generateLiquidityForecast(
          TEST_CONFIG.familyId,
          "monthly",
          3, // 3 months ahead
        );

      expect(monthlyForecast).toBeDefined();
      expect(monthlyForecast.timeframe).toBe("monthly");
      expect(monthlyForecast.forecastHorizon).toBe(3);

      // Monthly forecasts should consider seasonal patterns
      expect(monthlyForecast.liquidityNeeds.scalingFactors).toBeDefined();
      expect(
        monthlyForecast.liquidityNeeds.scalingFactors.seasonalAdjustment,
      ).toBeGreaterThan(0);

      console.log("🗓️  Monthly forecast generated:", {
        netFlow: monthlyForecast.predictions.netFlow,
        seasonalAdj:
          monthlyForecast.liquidityNeeds.scalingFactors.seasonalAdjustment,
      });
    }, 20000);
  });

  describe("Pattern Recognition", () => {
    test("should detect recurring patterns", async () => {
      const patterns = await intelligenceSystem.detectLiquidityPatterns(
        TEST_CONFIG.familyId,
        {
          timeRange: 30, // 30 days
          patternTypes: ["recurring", "seasonal", "event_driven"],
          minConfidence: 0.6,
        },
      );

      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);

      patterns.forEach((pattern) => {
        expect(pattern.pattern).toBeDefined();
        expect(pattern.frequency).toBeDefined();
        expect(pattern.magnitude).toBeGreaterThan(0);
        expect(pattern.confidence).toBeGreaterThanOrEqual(0.6);
        expect(pattern.confidence).toBeLessThanOrEqual(1);
        expect(pattern.description).toBeDefined();
        expect(pattern.predictiveValue).toBeGreaterThanOrEqual(0);
      });

      console.log(
        "🔍 Patterns detected:",
        patterns.map((p) => ({
          type: p.pattern,
          confidence: p.confidence,
          predictive: p.predictiveValue,
        })),
      );
    }, 25000);

    test("should analyze spending velocity patterns", async () => {
      const velocityAnalysis = await intelligenceSystem.analyzeSpendingVelocity(
        TEST_CONFIG.familyId,
        {
          memberId: "test-member",
          timeWindow: 24, // 24 hours
          granularity: "hourly",
        },
      );

      expect(velocityAnalysis).toBeDefined();
      expect(velocityAnalysis.averageVelocity).toBeGreaterThanOrEqual(0);
      expect(velocityAnalysis.peakVelocity).toBeGreaterThanOrEqual(0);
      expect(velocityAnalysis.velocityTrend).toBeDefined();
      expect(Array.isArray(velocityAnalysis.hourlyBreakdown)).toBe(true);
      expect(velocityAnalysis.riskScore).toBeGreaterThanOrEqual(0);
      expect(velocityAnalysis.riskScore).toBeLessThanOrEqual(1);

      console.log("🏃 Spending velocity analysis:", {
        avgVelocity: velocityAnalysis.averageVelocity,
        peakVelocity: velocityAnalysis.peakVelocity,
        trend: velocityAnalysis.velocityTrend,
        riskScore: velocityAnalysis.riskScore,
      });
    });
  });

  describe("Zeus LSP Optimization", () => {
    test("should generate Zeus-specific recommendations", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping Zeus optimization test - no credentials provided",
        );
        return;
      }

      const zeusOptimizations =
        await intelligenceSystem.generateZeusOptimizations(
          TEST_CONFIG.familyId,
        );

      expect(zeusOptimizations).toBeDefined();
      expect(Array.isArray(zeusOptimizations.jitOptimizations)).toBe(true);
      expect(Array.isArray(zeusOptimizations.capacityRecommendations)).toBe(
        true,
      );
      expect(Array.isArray(zeusOptimizations.feeOptimizations)).toBe(true);
      expect(zeusOptimizations.costBenefitAnalysis).toBeDefined();

      zeusOptimizations.jitOptimizations.forEach((opt) => {
        expect(opt.action).toBeDefined();
        expect(opt.currentValue).toBeGreaterThanOrEqual(0);
        expect(opt.recommendedValue).toBeGreaterThanOrEqual(0);
        expect(opt.expectedImpact).toBeDefined();
        expect(opt.costBenefit).toBeGreaterThan(0);
        expect(opt.confidence).toBeGreaterThan(0);
        expect(opt.confidence).toBeLessThanOrEqual(1);
      });

      console.log("⚡ Zeus optimizations generated:", {
        jitOpts: zeusOptimizations.jitOptimizations.length,
        capacityRecs: zeusOptimizations.capacityRecommendations.length,
        feeOpts: zeusOptimizations.feeOptimizations.length,
      });
    }, 20000);

    test("should calculate optimal JIT liquidity amounts", async () => {
      const jitCalculation =
        await intelligenceSystem.calculateOptimalJitLiquidity(
          TEST_CONFIG.familyId,
          {
            currentUtilization: 0.85,
            expectedGrowth: 0.15,
            riskTolerance: "medium",
            costSensitivity: "high",
          },
        );

      expect(jitCalculation).toBeDefined();
      expect(jitCalculation.recommendedAmount).toBeGreaterThan(0);
      expect(jitCalculation.confidence).toBeGreaterThan(0);
      expect(jitCalculation.confidence).toBeLessThanOrEqual(1);
      expect(jitCalculation.expectedCost).toBeGreaterThanOrEqual(0);
      expect(jitCalculation.expectedBenefit).toBeGreaterThan(0);
      expect(jitCalculation.paybackPeriod).toBeGreaterThan(0);
      expect(Array.isArray(jitCalculation.scenarios)).toBe(true);

      console.log("💡 Optimal JIT calculation:", {
        amount: jitCalculation.recommendedAmount,
        confidence: jitCalculation.confidence,
        cost: jitCalculation.expectedCost,
        benefit: jitCalculation.expectedBenefit,
        payback: jitCalculation.paybackPeriod,
      });
    });
  });

  describe("Risk Assessment", () => {
    test("should assess liquidity risk levels", async () => {
      const riskAssessment = await intelligenceSystem.assessLiquidityRisk(
        TEST_CONFIG.familyId,
        {
          timeHorizon: 72, // 72 hours
          includeExternalFactors: true,
          riskFactors: [
            "utilization",
            "growth",
            "network_conditions",
            "seasonal",
          ],
        },
      );

      expect(riskAssessment).toBeDefined();
      expect(riskAssessment.overallRisk).toBeDefined();
      expect(["low", "medium", "high", "critical"]).toContain(
        riskAssessment.overallRisk,
      );
      expect(riskAssessment.riskScore).toBeGreaterThanOrEqual(0);
      expect(riskAssessment.riskScore).toBeLessThanOrEqual(1);
      expect(Array.isArray(riskAssessment.riskFactors)).toBe(true);
      expect(Array.isArray(riskAssessment.mitigationStrategies)).toBe(true);
      expect(riskAssessment.timeToRisk).toBeGreaterThan(0);

      riskAssessment.riskFactors.forEach((factor) => {
        expect(factor.factor).toBeDefined();
        expect(factor.impact).toBeDefined();
        expect(["low", "medium", "high", "critical"]).toContain(factor.impact);
        expect(factor.probability).toBeGreaterThanOrEqual(0);
        expect(factor.probability).toBeLessThanOrEqual(1);
      });

      console.log("⚠️  Risk assessment:", {
        overallRisk: riskAssessment.overallRisk,
        riskScore: riskAssessment.riskScore,
        timeToRisk: riskAssessment.timeToRisk,
        factors: riskAssessment.riskFactors.length,
        mitigations: riskAssessment.mitigationStrategies.length,
      });
    }, 15000);

    test("should provide early warning system", async () => {
      const earlyWarning = await intelligenceSystem.getEarlyWarningSignals(
        TEST_CONFIG.familyId,
        {
          alertThreshold: 0.7,
          lookAheadHours: 48,
          includeNetworkAlerts: true,
        },
      );

      expect(earlyWarning).toBeDefined();
      expect(Array.isArray(earlyWarning.warnings)).toBe(true);
      expect(Array.isArray(earlyWarning.recommendations)).toBe(true);
      expect(earlyWarning.urgency).toBeDefined();
      expect(["low", "medium", "high", "critical"]).toContain(
        earlyWarning.urgency,
      );
      expect(earlyWarning.nextCheckIn).toBeDefined();

      earlyWarning.warnings.forEach((warning) => {
        expect(warning.type).toBeDefined();
        expect(warning.severity).toBeDefined();
        expect(warning.probability).toBeGreaterThanOrEqual(0);
        expect(warning.probability).toBeLessThanOrEqual(1);
        expect(warning.timeframe).toBeDefined();
        expect(warning.description).toBeDefined();
      });

      console.log("🚨 Early warning system:", {
        warnings: earlyWarning.warnings.length,
        urgency: earlyWarning.urgency,
        nextCheck: earlyWarning.nextCheckIn,
      });
    });
  });

  describe("Optimization Strategies", () => {
    test("should generate comprehensive optimization strategies", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping optimization strategies test - no credentials provided",
        );
        return;
      }

      const mockMetrics = {
        utilization: { current: 0.8, average24h: 0.75, peak24h: 0.95 },
        efficiency: {
          routingSuccessRate: 0.85,
          averageRoutingTime: 2500,
          costEfficiency: 0.7,
        },
        reliability: { uptime: 0.99, emergencyActivations: 2 },
        zeusLsp: { jitLiquidity: 5000000, jitUsageRate: 0.15 },
        growth: { memberGrowthImpact: 0.1, transactionVolumeGrowth: 0.25 },
      };

      const mockForecast = {
        predictions: { netFlow: -500000, confidenceLevel: 0.8 },
        liquidityNeeds: { minimumRequired: 2000000, optimalLevel: 3000000 },
        riskFactors: [
          { factor: "high_utilization", impact: "medium" as const },
        ],
      };

      const strategies =
        await intelligenceSystem.generateOptimizationStrategies(
          TEST_CONFIG.familyId,
          mockMetrics,
          mockForecast,
        );

      expect(strategies).toBeDefined();
      expect(Array.isArray(strategies)).toBe(true);

      strategies.forEach((strategy) => {
        expect(strategy.id).toBeDefined();
        expect(strategy.name).toBeDefined();
        expect(strategy.description).toBeDefined();
        expect(strategy.totalCost).toBeGreaterThanOrEqual(0);
        expect(strategy.totalBenefit).toBeGreaterThan(0);
        expect(strategy.netBenefit).toBeDefined();
        expect(strategy.implementationTime).toBeGreaterThan(0);
        expect(strategy.successProbability).toBeGreaterThan(0);
        expect(strategy.successProbability).toBeLessThanOrEqual(1);
        expect(strategy.priority).toBeGreaterThan(0);
        expect(Array.isArray(strategy.actions)).toBe(true);
      });

      // Sort by priority and check the top strategy
      const topStrategy = strategies.sort((a, b) => b.priority - a.priority)[0];
      expect(topStrategy.netBenefit).toBeGreaterThan(0);

      console.log("🎯 Optimization strategies generated:", {
        count: strategies.length,
        topStrategy: topStrategy.name,
        topBenefit: topStrategy.netBenefit,
        avgSuccessProb:
          strategies.reduce((sum, s) => sum + s.successProbability, 0) /
          strategies.length,
      });
    }, 25000);

    test("should prioritize strategies by ROI", async () => {
      const mockStrategies = [
        {
          id: "strategy1",
          name: "Channel Rebalancing",
          totalCost: 5000,
          totalBenefit: 15000,
          implementationTime: 2,
          successProbability: 0.9,
        },
        {
          id: "strategy2",
          name: "Zeus JIT Optimization",
          totalCost: 10000,
          totalBenefit: 40000,
          implementationTime: 1,
          successProbability: 0.85,
        },
        {
          id: "strategy3",
          name: "Capacity Expansion",
          totalCost: 50000,
          totalBenefit: 100000,
          implementationTime: 7,
          successProbability: 0.7,
        },
      ];

      const prioritizedStrategies =
        intelligenceSystem.prioritizeStrategiesByROI(mockStrategies, {
          riskAdjusted: true,
          timeWeighted: true,
          maxImplementationTime: 5,
        });

      expect(prioritizedStrategies).toBeDefined();
      expect(Array.isArray(prioritizedStrategies)).toBe(true);
      expect(prioritizedStrategies.length).toBeLessThanOrEqual(
        mockStrategies.length,
      );

      // Should be sorted by priority score
      for (let i = 1; i < prioritizedStrategies.length; i++) {
        expect(prioritizedStrategies[i - 1].priority).toBeGreaterThanOrEqual(
          prioritizedStrategies[i].priority,
        );
      }

      console.log(
        "📊 Prioritized strategies:",
        prioritizedStrategies.map((s) => ({
          name: s.name,
          priority: s.priority,
          roi: s.netBenefit / s.totalCost,
        })),
      );
    });
  });

  describe("Performance and Analytics", () => {
    test("should provide system performance metrics", async () => {
      const performanceMetrics =
        await intelligenceSystem.getSystemPerformance();

      expect(performanceMetrics).toBeDefined();
      expect(performanceMetrics.uptime).toBeGreaterThanOrEqual(0);
      expect(performanceMetrics.forecastsGenerated).toBeGreaterThanOrEqual(0);
      expect(performanceMetrics.averageForecastTime).toBeGreaterThan(0);
      expect(performanceMetrics.predictionAccuracy).toBeGreaterThan(0);
      expect(performanceMetrics.predictionAccuracy).toBeLessThanOrEqual(1);
      expect(performanceMetrics.modelTrainingTime).toBeGreaterThan(0);
      expect(performanceMetrics.dataPointsProcessed).toBeGreaterThanOrEqual(0);

      console.log("🚀 System performance:", performanceMetrics);
    });

    test("should track model accuracy over time", async () => {
      const accuracyTracking = await intelligenceSystem.getModelAccuracyHistory(
        {
          days: 30,
          modelTypes: ["lstm", "arima", "random_forest", "zeus_ml"],
          includeComparison: true,
        },
      );

      expect(accuracyTracking).toBeDefined();
      expect(Array.isArray(accuracyTracking.dailyAccuracy)).toBe(true);
      expect(accuracyTracking.overallAccuracy).toBeGreaterThan(0);
      expect(accuracyTracking.overallAccuracy).toBeLessThanOrEqual(1);
      expect(accuracyTracking.bestPerformingModel).toBeDefined();
      expect(accuracyTracking.improvementTrend).toBeDefined();

      accuracyTracking.dailyAccuracy.forEach((day) => {
        expect(day.date).toBeDefined();
        expect(day.lstm).toBeGreaterThanOrEqual(0);
        expect(day.arima).toBeGreaterThanOrEqual(0);
        expect(day.randomForest).toBeGreaterThanOrEqual(0);
        expect(day.zeusML).toBeGreaterThanOrEqual(0);
      });

      console.log("📈 Model accuracy tracking:", {
        overallAccuracy: accuracyTracking.overallAccuracy,
        bestModel: accuracyTracking.bestPerformingModel,
        trend: accuracyTracking.improvementTrend,
        daysTracked: accuracyTracking.dailyAccuracy.length,
      });
    }, 10000);
  });

  describe("Real-time Monitoring", () => {
    test("should provide real-time liquidity alerts", async () => {
      if (!TEST_CONFIG.realCredentials) {
        console.log(
          "⏭️  Skipping real-time monitoring test - no credentials provided",
        );
        return;
      }

      const alertingResult = await intelligenceSystem.startRealTimeMonitoring(
        TEST_CONFIG.familyId,
        {
          utilizationThreshold: 0.85,
          riskThreshold: 0.7,
          anomalyDetection: true,
          alertChannels: ["webhook", "database"],
          checkInterval: 30000, // 30 seconds
        },
      );

      expect(alertingResult).toBeDefined();
      expect(alertingResult.monitoringStarted).toBe(true);
      expect(alertingResult.monitoringId).toBeDefined();
      expect(alertingResult.checkInterval).toBe(30000);

      // Wait for a monitoring cycle
      await new Promise((resolve) => setTimeout(resolve, 35000));

      // Stop monitoring
      const stopResult = await intelligenceSystem.stopRealTimeMonitoring(
        alertingResult.monitoringId,
      );
      expect(stopResult.monitoringStopped).toBe(true);

      console.log("📡 Real-time monitoring test completed:", {
        monitoringId: alertingResult.monitoringId,
        duration: "35 seconds",
      });
    }, 45000);

    test("should handle monitoring errors gracefully", async () => {
      const invalidMonitoringResult =
        await intelligenceSystem.startRealTimeMonitoring("invalid-family-id", {
          utilizationThreshold: 0.85,
          riskThreshold: 0.7,
          anomalyDetection: true,
          alertChannels: ["webhook"],
          checkInterval: 30000,
        });

      expect(invalidMonitoringResult).toBeDefined();
      expect(invalidMonitoringResult.monitoringStarted).toBe(false);
      expect(invalidMonitoringResult.error).toBeDefined();
    });
  });

  // Helper function to create sample liquidity data
  async function createSampleLiquidityData(): Promise<void> {
    try {
      const sampleForecasts = [];
      const now = new Date();

      // Create 30 days of sample forecasting data
      for (let i = 0; i < 30; i++) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const encryptedFamilyId = await encryptSensitiveData(
          TEST_CONFIG.familyId,
        );
        const encryptedInflow = await encryptSensitiveData(
          String(Math.floor(Math.random() * 1000000) + 500000),
        );
        const encryptedOutflow = await encryptSensitiveData(
          String(Math.floor(Math.random() * 800000) + 400000),
        );

        sampleForecasts.push({
          forecast_uuid: generateSecureUUID(),
          encrypted_family_id: encryptedFamilyId.encrypted,
          family_salt: encryptedFamilyId.salt,
          family_iv: encryptedFamilyId.iv,
          family_tag: encryptedFamilyId.tag,
          forecast_date: date.toISOString(),
          timeframe: "daily",
          forecast_horizon: 1,
          encrypted_expected_inflow: encryptedInflow.encrypted,
          inflow_salt: encryptedInflow.salt,
          inflow_iv: encryptedInflow.iv,
          inflow_tag: encryptedInflow.tag,
          encrypted_expected_outflow: encryptedOutflow.encrypted,
          outflow_salt: encryptedOutflow.salt,
          outflow_iv: encryptedOutflow.iv,
          outflow_tag: encryptedOutflow.tag,
          confidence_level: 0.75 + Math.random() * 0.2, // 75-95% confidence
          model_version: "2.0",
          zeus_lsp_integration: true,
          created_at: date.toISOString(),
        });
      }

      const { error } = await supabase
        .from("secure_liquidity_forecasts")
        .insert(sampleForecasts);
      if (error) {
        console.warn("⚠️  Failed to create sample forecast data:", error);
      } else {
        console.log("✅ Sample liquidity data created");
      }
    } catch (error) {
      console.warn("⚠️  Error creating sample data:", error);
    }
  }
});
