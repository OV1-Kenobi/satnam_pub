/**
 * ENHANCED FAMILY PAYMENT API ENDPOINT
 *
 * Advanced payment processing with Voltage Lightning and PhoenixD LSP integration,
 * intelligent routing, and real-time WebSocket updates.
 */

import type { ApiRequest, ApiResponse } from "../../types/api";
import {
  encryptSensitiveData,
  generateSecureUUID,
  logPrivacyOperation,
} from "../../src/lib/privacy/encryption";
import { supabase } from "../../src/lib/supabase";
import { EnhancedFamilyCoordinator } from "../../src/lib/enhanced-family-coordinator";
import { LiquidityIntelligenceSystem } from "../../src/lib/liquidity-intelligence";
import type { LiquidityMetrics } from "../../src/lib/liquidity-intelligence";

interface EnhancedPaymentRequest {
  familyId: string;
  fromMemberId: string;
  toDestination: string;
  amount: number;
  memo?: string;
  preferences?: {
    maxFee?: number;
    maxTime?: number;
    privacy?: "high" | "medium" | "low";
    layer?: "lightning" | "ecash" | "auto";
    useJit?: boolean;
    requireApproval?: boolean;
  };
  urgency?: "low" | "medium" | "high" | "critical";
  approvalRequired?: boolean;
  approvers?: string[];
}

interface EnhancedPaymentResponse {
  success: boolean;
  paymentId?: string;
  status: "completed" | "pending_approval" | "processing" | "failed";
  route?: {
    type: string;
    estimatedFee: number;
    estimatedTime: number;
    privacy: string;
    phoenixdJitRequired?: boolean;
  };
  execution?: {
    transactionId?: string;
    actualFee: number;
    executionTime: number;
    confirmationTime?: number;
    routingHops?: number;
  };
  approval?: {
    approvalId: string;
    requiredApprovers: string[];
    expiresAt: string;
    urgency: string;
  };
  intelligence?: {
    riskScore: number;
    recommendations: string[];
    costOptimization: {
      originalCost: number;
      optimizedCost: number;
      savings: number;
      method: string;
    };
  };
  error?: string;
  metadata: {
    timestamp: string;
    coordinatorVersion: string;
    phoenixdLspUsed: boolean;
    liquiditySourceUsed: string;
  };
}

export default async function handler(
  req: ApiRequest,
  res: ApiResponse<EnhancedPaymentResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      status: "failed",
      error: "Method not allowed",
      metadata: {
        timestamp: new Date().toISOString(),
        coordinatorVersion: "2.0",
        phoenixdLspUsed: false,
        liquiditySourceUsed: "none",
      },
    });
  }

  const startTime = Date.now();

  try {
    console.log("🚀 Enhanced family payment request received");

    // Validate request body
    const paymentRequest: EnhancedPaymentRequest = req.body;

    if (
      !paymentRequest.familyId ||
      !paymentRequest.fromMemberId ||
      !paymentRequest.toDestination ||
      !paymentRequest.amount
    ) {
      return res.status(400).json({
        success: false,
        status: "failed",
        error:
          "Missing required fields: familyId, fromMemberId, toDestination, amount",
        metadata: {
          timestamp: new Date().toISOString(),
          coordinatorVersion: "2.0",
          phoenixdLspUsed: false,
          liquiditySourceUsed: "none",
        },
      });
    }

    // Validate amount
    if (paymentRequest.amount < 1 || paymentRequest.amount > 10000000) {
      return res.status(400).json({
        success: false,
        status: "failed",
        error: "Amount must be between 1 and 10,000,000 sats",
        metadata: {
          timestamp: new Date().toISOString(),
          coordinatorVersion: "2.0",
          phoenixdLspUsed: false,
          liquiditySourceUsed: "none",
        },
      });
    }

    // Get family configuration
    const { data: familyConfig, error: configError } = await supabase
      .from("secure_families")
      .select("*")
      .eq("family_uuid", paymentRequest.familyId)
      .single();

    if (configError || !familyConfig) {
      return res.status(404).json({
        success: false,
        status: "failed",
        error: "Family not found or access denied",
        metadata: {
          timestamp: new Date().toISOString(),
          coordinatorVersion: "2.0",
          phoenixdLspUsed: false,
          liquiditySourceUsed: "none",
        },
      });
    }

    // Initialize enhanced family coordinator
    const coordinator = new EnhancedFamilyCoordinator({
      familyId: paymentRequest.familyId,
      voltageNodeId: process.env.VOLTAGE_NODE_ID || "mock-voltage-node",
      lnbitsAdminKey: process.env.LNBITS_ADMIN_KEY || "mock-lnbits-key",
      lnproxyEnabled: true,
      phoenixLspEnabled: familyConfig.phoenixd_integration_enabled,
      phoenixLspEndpoint: familyConfig.phoenixd_endpoint,
      phoenixApiKey: familyConfig.phoenixd_api_key_encrypted, // Would be decrypted in real implementation
      liquidityThreshold: 5000000, // 5M sats
      emergencyReserve: 1000000, // 1M sats
      paymentAutomation: familyConfig.allowance_automation_enabled,
      intelligentRouting: true,
      cronSchedules: {
        paymentDistribution: "0 9 * * *",
        liquidityRebalancing: "0 */6 * * *",
        healthChecks: "*/15 * * * *",
      },
      websocketEnabled: familyConfig.websocket_enabled,
      websocketPort: familyConfig.websocket_port,
    });

    // Initialize coordinator if not already done
    await coordinator.initialize();

    // Initialize liquidity intelligence for risk assessment
    const intelligence = new LiquidityIntelligenceSystem({
      endpoint: familyConfig.phoenixd_endpoint,
      apiKey: familyConfig.phoenixd_api_key_encrypted, // Would be decrypted
    });

    // Get current liquidity metrics for intelligence analysis
    const liquidityMetrics = await intelligence.getLiquidityMetrics(
      paymentRequest.familyId
    );

    // Calculate risk score
    const riskScore = calculatePaymentRiskScore(
      paymentRequest,
      liquidityMetrics
    );

    // Check if approval is required
    const requiresApproval = await checkApprovalRequirement(
      paymentRequest,
      riskScore,
      familyConfig
    );

    let response: EnhancedPaymentResponse;

    if (requiresApproval) {
      // Create approval request
      const approvalResult = await createPaymentApproval(
        paymentRequest,
        riskScore
      );

      response = {
        success: true,
        paymentId: generateSecureUUID(),
        status: "pending_approval",
        approval: {
          approvalId: approvalResult.approvalId,
          requiredApprovers: approvalResult.requiredApprovers,
          expiresAt: approvalResult.expiresAt,
          urgency: paymentRequest.urgency || "medium",
        },
        intelligence: {
          riskScore,
          recommendations: generateIntelligenceRecommendations(
            riskScore,
            liquidityMetrics
          ),
          costOptimization: await generateCostOptimization(
            paymentRequest,
            liquidityMetrics
          ),
        },
        metadata: {
          timestamp: new Date().toISOString(),
          coordinatorVersion: "2.0",
          phoenixdLspUsed: familyConfig.phoenixd_integration_enabled,
          liquiditySourceUsed: "pending_approval",
        },
      };
    } else {
      // Execute payment immediately
      console.log("💸 Executing enhanced payment...");

      // Get optimal payment routes
      const routes = await coordinator.routePayment(
        paymentRequest.fromMemberId,
        paymentRequest.toDestination,
        paymentRequest.amount,
        paymentRequest.preferences
      );

      if (routes.length === 0) {
        return res.status(400).json({
          success: false,
          status: "failed",
          error: "No payment routes available",
          intelligence: {
            riskScore,
            recommendations: [
              "Check liquidity status",
              "Consider enabling PhoenixD JIT liquidity",
            ],
            costOptimization: {
              originalCost: 0,
              optimizedCost: 0,
              savings: 0,
              method: "No routes available",
            },
          },
          metadata: {
            timestamp: new Date().toISOString(),
            coordinatorVersion: "2.0",
            phoenixdLspUsed: false,
            liquiditySourceUsed: "none",
          },
        });
      }

      // Execute payment using the best route
      const executionResult = await coordinator.executePayment(
        paymentRequest.fromMemberId,
        paymentRequest.toDestination,
        paymentRequest.amount,
        0, // Use best route (index 0)
        paymentRequest.preferences
      );

      const executionTime = Date.now() - startTime;

      if (executionResult.success) {
        // Store encrypted payment record
        await storeEnhancedPaymentRecord({
          paymentRequest,
          executionResult,
          route: routes[0],
          riskScore,
          executionTime,
        });

        response = {
          success: true,
          paymentId: generateSecureUUID(),
          status: "completed",
          route: {
            type: routes[0].type,
            estimatedFee: routes[0].estimatedFee,
            estimatedTime: routes[0].estimatedTime,
            privacy: routes[0].privacy,
            phoenixdJitRequired: false, // Will be determined by route analysis
          },
          execution: {
            transactionId: executionResult.transactionId,
            actualFee: executionResult.actualFee,
            executionTime: executionResult.executionTime,
            routingHops: executionResult.routingHops,
          },
          intelligence: {
            riskScore,
            recommendations: generateIntelligenceRecommendations(
              riskScore,
              liquidityMetrics
            ),
            costOptimization: await generateCostOptimization(
              paymentRequest,
              liquidityMetrics
            ),
          },
          metadata: {
            timestamp: new Date().toISOString(),
            coordinatorVersion: "2.0",
            phoenixdLspUsed: executionResult.routeType === "lightning",
            liquiditySourceUsed: determineLiquiditySource(routes[0]),
          },
        };
      } else {
        // Payment failed
        response = {
          success: false,
          paymentId: generateSecureUUID(),
          status: "failed",
          route: {
            type: routes[0].type,
            estimatedFee: routes[0].estimatedFee,
            estimatedTime: routes[0].estimatedTime,
            privacy: routes[0].privacy,
            phoenixdJitRequired: false,
          },
          error: executionResult.error,
          intelligence: {
            riskScore,
            recommendations: [
              "Payment execution failed",
              "Check liquidity and try again",
              ...generateIntelligenceRecommendations(
                riskScore,
                liquidityMetrics
              ),
            ],
            costOptimization: await generateCostOptimization(
              paymentRequest,
              liquidityMetrics
            ),
          },
          metadata: {
            timestamp: new Date().toISOString(),
            coordinatorVersion: "2.0",
            phoenixdLspUsed: executionResult.routeType === "lightning",
            liquiditySourceUsed: "failed",
          },
        };
      }
    }

    // Log privacy operation
    logPrivacyOperation({
      action: "access",
      dataType: "family_data",
      familyId: paymentRequest.familyId,
      success: response.success,
    });

    console.log(
      `✅ Enhanced payment ${response.success ? "completed" : "failed"}: ${response.status}`
    );

    return res.status(response.success ? 200 : 400).json(response);
  } catch (error) {
    console.error("❌ Enhanced payment API error:", error);

    const errorResponse: EnhancedPaymentResponse = {
      success: false,
      status: "failed",
      error: error instanceof Error ? error.message : "Internal server error",
      metadata: {
        timestamp: new Date().toISOString(),
        coordinatorVersion: "2.0",
        phoenixdLspUsed: false,
        liquiditySourceUsed: "error",
      },
    };

    return res.status(500).json(errorResponse);
  }
}

// Helper functions

function calculatePaymentRiskScore(
  request: EnhancedPaymentRequest,
  metrics: LiquidityMetrics
): number {
  let riskScore = 0.1; // Base risk

  // Amount-based risk
  if (request.amount > 1000000) riskScore += 0.2; // 1M+ sats
  if (request.amount > 5000000) riskScore += 0.3; // 5M+ sats

  // Liquidity utilization risk
  if (metrics.utilization.current > 0.8) riskScore += 0.2;
  if (metrics.utilization.current > 0.9) riskScore += 0.3;

  // Urgency risk
  switch (request.urgency) {
    case "critical":
      riskScore += 0.1;
      break;
    case "high":
      riskScore += 0.05;
      break;
  }

  // Privacy preference risk (higher privacy = lower risk for internal systems)
  if (request.preferences?.privacy === "high") riskScore -= 0.1;

  return Math.min(1.0, Math.max(0.0, riskScore));
}

async function checkApprovalRequirement(
  request: EnhancedPaymentRequest,
  riskScore: number,
  _familyConfig: any
): Promise<boolean> {
  // Force approval if explicitly requested
  if (request.approvalRequired) return true;

  // Approval required for high-risk payments
  if (riskScore > 0.7) return true;

  // Approval required for large amounts (>2M sats)
  if (request.amount > 2000000) return true;

  // Family-specific approval rules would be checked here
  return false;
}

async function createPaymentApproval(
  request: EnhancedPaymentRequest,
  riskScore: number
): Promise<{
  approvalId: string;
  requiredApprovers: string[];
  expiresAt: string;
}> {
  const approvalId = generateSecureUUID();
  const requiredApprovers = request.approvers || ["parent1", "parent2"]; // Mock
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  // Store encrypted approval request
  const encryptedFamilyId = await encryptSensitiveData(request.familyId);
  const encryptedMemberId = await encryptSensitiveData(request.fromMemberId);
  const encryptedDestination = await encryptSensitiveData(
    request.toDestination
  );
  const encryptedAmount = await encryptSensitiveData(request.amount.toString());
  const encryptedMemo = request.memo
    ? await encryptSensitiveData(request.memo)
    : null;
  const encryptedApprovers = await encryptSensitiveData(
    JSON.stringify(requiredApprovers)
  );
  const encryptedRiskAssessment = await encryptSensitiveData(
    JSON.stringify({
      riskScore,
      factors: ["amount", "liquidity_utilization", "urgency"],
      timestamp: new Date().toISOString(),
    })
  );

  await supabase.from("secure_payment_approvals").insert({
    approval_uuid: approvalId,
    encrypted_family_id: encryptedFamilyId.encrypted,
    family_salt: encryptedFamilyId.salt,
    family_iv: encryptedFamilyId.iv,
    family_tag: encryptedFamilyId.tag,
    encrypted_requesting_member_id: encryptedMemberId.encrypted,
    req_member_salt: encryptedMemberId.salt,
    req_member_iv: encryptedMemberId.iv,
    req_member_tag: encryptedMemberId.tag,
    encrypted_to_destination: encryptedDestination.encrypted,
    destination_salt: encryptedDestination.salt,
    destination_iv: encryptedDestination.iv,
    destination_tag: encryptedDestination.tag,
    encrypted_amount: encryptedAmount.encrypted,
    amount_salt: encryptedAmount.salt,
    amount_iv: encryptedAmount.iv,
    amount_tag: encryptedAmount.tag,
    encrypted_memo: encryptedMemo?.encrypted,
    memo_salt: encryptedMemo?.salt,
    memo_iv: encryptedMemo?.iv,
    memo_tag: encryptedMemo?.tag,
    encrypted_required_approvers: encryptedApprovers.encrypted,
    approvers_salt: encryptedApprovers.salt,
    approvers_iv: encryptedApprovers.iv,
    approvers_tag: encryptedApprovers.tag,
    encrypted_risk_assessment: encryptedRiskAssessment.encrypted,
    risk_salt: encryptedRiskAssessment.salt,
    risk_iv: encryptedRiskAssessment.iv,
    risk_tag: encryptedRiskAssessment.tag,
    risk_score: riskScore,
    urgency: request.urgency || "medium",
    expires_at: expiresAt,
    phoenixd_jit_required: request.preferences?.useJit || false,
    phoenixd_jit_amount: request.preferences?.useJit ? request.amount : null,
  });

  console.log(`📋 Payment approval request created: ${approvalId}`);

  return { approvalId, requiredApprovers, expiresAt };
}

function generateIntelligenceRecommendations(
  riskScore: number,
  metrics: LiquidityMetrics
): string[] {
  const recommendations = [];

  if (riskScore > 0.7) {
    recommendations.push("High risk payment - consider manual review");
  }

  if (metrics.utilization.current > 0.8) {
    recommendations.push("High liquidity utilization - consider rebalancing");
  }

  if (metrics.efficiency.routingSuccessRate < 0.9) {
    recommendations.push(
      "Low routing success rate - check channel connectivity"
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("Payment conditions are optimal");
  }

  return recommendations;
}

interface CostOptimization {
  originalCost: number;
  optimizedCost: number;
  savings: number;
  method: string;
}

async function generateCostOptimization(
  request: EnhancedPaymentRequest,
  metrics: LiquidityMetrics
): Promise<CostOptimization> {
  const originalCost = Math.ceil(request.amount * 0.001);
  const optimizedCost = Math.ceil(request.amount * 0.0005);
  
  return {
    originalCost,
    optimizedCost,
    savings: originalCost - optimizedCost,
    method: "PhoenixD JIT liquidity optimization",
  };
}

function determineLiquiditySource(route: any): string {
  if (route.type === "internal") return "family_balance";
  if (route.path[0]?.layer === "ecash") return "ecash_federation";
  if (route.path[0]?.layer === "voltage") return "voltage_lightning";
  return "lightning_network";
}

async function storeEnhancedPaymentRecord(data: {
  paymentRequest: EnhancedPaymentRequest;
  executionResult: any;
  route: any;
  riskScore: number;
  executionTime: number;
}): Promise<void> {
  try {
    // Encrypt all sensitive payment data
    const encryptedFamilyId = await encryptSensitiveData(
      data.paymentRequest.familyId
    );
    const encryptedFromMember = await encryptSensitiveData(
      data.paymentRequest.fromMemberId
    );
    const encryptedDestination = await encryptSensitiveData(
      data.paymentRequest.toDestination
    );
    const encryptedAmount = await encryptSensitiveData(
      data.paymentRequest.amount.toString()
    );
    const encryptedMemo = data.paymentRequest.memo
      ? await encryptSensitiveData(data.paymentRequest.memo)
      : null;
    const encryptedTxId = await encryptSensitiveData(
      data.executionResult.transactionId || generateSecureUUID()
    );
    const encryptedFee = await encryptSensitiveData(
      data.executionResult.actualFee.toString()
    );
    const encryptedRoutePath = await encryptSensitiveData(
      JSON.stringify(data.route.path)
    );

    await supabase.from("secure_family_payments").insert({
      payment_uuid: generateSecureUUID(),
      encrypted_family_id: encryptedFamilyId.encrypted,
      family_salt: encryptedFamilyId.salt,
      family_iv: encryptedFamilyId.iv,
      family_tag: encryptedFamilyId.tag,
      encrypted_from_member_id: encryptedFromMember.encrypted,
      from_member_salt: encryptedFromMember.salt,
      from_member_iv: encryptedFromMember.iv,
      from_member_tag: encryptedFromMember.tag,
      encrypted_to_destination: encryptedDestination.encrypted,
      destination_salt: encryptedDestination.salt,
      destination_iv: encryptedDestination.iv,
      destination_tag: encryptedDestination.tag,
      encrypted_amount: encryptedAmount.encrypted,
      amount_salt: encryptedAmount.salt,
      amount_iv: encryptedAmount.iv,
      amount_tag: encryptedAmount.tag,
      encrypted_memo: encryptedMemo?.encrypted,
      memo_salt: encryptedMemo?.salt,
      memo_iv: encryptedMemo?.iv,
      memo_tag: encryptedMemo?.tag,
      encrypted_transaction_id: encryptedTxId.encrypted,
      tx_id_salt: encryptedTxId.salt,
      tx_id_iv: encryptedTxId.iv,
      tx_id_tag: encryptedTxId.tag,
      encrypted_route_path: encryptedRoutePath.encrypted,
      route_path_salt: encryptedRoutePath.salt,
      route_path_iv: encryptedRoutePath.iv,
      route_path_tag: encryptedRoutePath.tag,
      encrypted_actual_fee: encryptedFee.encrypted,
      fee_salt: encryptedFee.salt,
      fee_iv: encryptedFee.iv,
      fee_tag: encryptedFee.tag,
      execution_time: data.executionTime,
      confirmation_time: data.executionResult.executionTime,
      routing_hops: data.route.path.length,
      status: "completed",
      phoenixd_lsp_used: data.executionResult.routeType === "lightning",
      phoenixd_jit_liquidity_used: false, // Will be determined by actual route analysis
      payment_category: "transfer",
      payment_type: "transfer",
      route_type: data.executionResult.routeType,
    });

    console.log(`💾 Enhanced payment record stored successfully`);
  } catch (error) {
    console.error("❌ Failed to store enhanced payment record:", error);
  }
}
