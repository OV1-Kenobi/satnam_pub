/**
 * Citadel Academy Rewards API Endpoints
 * Bitcoin-only reward system for educational achievements
 */

import { NextApiRequest, NextApiResponse } from "next";
import { progressTracker } from "../../lib/citadel/progress-tracker";
import { rewardSystem, RewardType } from "../../lib/citadel/reward-system";
import { verifyAuthToken } from "../../lib/middleware/auth";
import { validateInput } from "../../lib/security/input-validation";
import { rateLimiter } from "../../lib/security/rate-limiter";

/**
 * Rewards API Handler
 * Handles reward-related operations: viewing, redemption, history
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Verify authentication
    const authResult = await verifyAuthToken(req);
    if (!authResult.success) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { user } = authResult;
    const { method } = req;

    // Rate limiting
    await rateLimiter.checkLimit("rewards-api", user.id);

    switch (method) {
      case "GET":
        return await handleGet(req, res, user);
      case "POST":
        return await handlePost(req, res, user);
      case "PUT":
        return await handlePut(req, res, user);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Rewards API error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Handle GET requests - Query rewards and redemptions
 */
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { action } = req.query;

  switch (action) {
    case "available":
      return await getAvailableRewards(req, res, user);
    case "history":
      return await getRedemptionHistory(req, res, user);
    case "configs":
      return await getRewardConfigs(req, res, user);
    case "status":
      return await getRedemptionStatus(req, res, user);
    default:
      return res.status(400).json({ error: "Invalid action parameter" });
  }
}

/**
 * Handle POST requests - Redeem rewards
 */
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { action } = req.query;

  switch (action) {
    case "redeem":
      return await redeemReward(req, res, user);
    case "request-approval":
      return await requestGuardianApproval(req, res, user);
    default:
      return res.status(400).json({ error: "Invalid action parameter" });
  }
}

/**
 * Handle PUT requests - Update reward configurations
 */
async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { action } = req.query;

  switch (action) {
    case "update-config":
      return await updateRewardConfig(req, res, user);
    case "approve":
      return await approveRedemption(req, res, user);
    default:
      return res.status(400).json({ error: "Invalid action parameter" });
  }
}

/**
 * Get available rewards for a student
 */
async function getAvailableRewards(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const studentPubkey = user.npub || (req.query.studentPubkey as string);

  if (!studentPubkey) {
    return res.status(400).json({ error: "Student public key required" });
  }

  try {
    // Get student progress
    const progress = await progressTracker.getStudentProgress(studentPubkey);
    if (!progress) {
      return res.status(404).json({ error: "Student progress not found" });
    }

    // Get available rewards
    const availableRewards = await rewardSystem.getAvailableRewards(
      studentPubkey,
      progress
    );

    res.status(200).json({
      success: true,
      data: availableRewards,
      count: availableRewards.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get redemption history for a student
 */
async function getRedemptionHistory(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const studentPubkey = user.npub || (req.query.studentPubkey as string);

  if (!studentPubkey) {
    return res.status(400).json({ error: "Student public key required" });
  }

  try {
    const redemptions = await rewardSystem.getStudentRedemptions(studentPubkey);

    res.status(200).json({
      success: true,
      data: redemptions,
      count: redemptions.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get reward configurations
 */
async function getRewardConfigs(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { rewardType } = req.query;

  try {
    if (rewardType && typeof rewardType === "string") {
      const config = rewardSystem.getRewardConfig(rewardType as RewardType);
      if (!config) {
        return res
          .status(404)
          .json({ error: "Reward configuration not found" });
      }

      res.status(200).json({
        success: true,
        data: config,
      });
    } else {
      // Return all configs (admin only)
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin privileges required" });
      }

      // This would need to be implemented to return all configs
      res.status(200).json({
        success: true,
        data: [], // Placeholder
        message: "All reward configurations",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get redemption status
 */
async function getRedemptionStatus(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { redemptionId } = req.query;

  if (!redemptionId || typeof redemptionId !== "string") {
    return res.status(400).json({ error: "Redemption ID required" });
  }

  try {
    const studentPubkey = user.npub;
    const redemptions = await rewardSystem.getStudentRedemptions(studentPubkey);
    const redemption = redemptions.find((r) => r.id === redemptionId);

    if (!redemption) {
      return res.status(404).json({ error: "Redemption not found" });
    }

    res.status(200).json({
      success: true,
      data: {
        id: redemption.id,
        reward_type: redemption.reward_type,
        status: redemption.status,
        value: redemption.value,
        redemption_proof: redemption.redemption_proof,
        created_at: redemption.created_at,
        processed_at: redemption.processed_at,
        expires_at: redemption.expires_at,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Redeem a reward
 */
async function redeemReward(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { rewardType, guardianApproval } = req.body;
  const studentPubkey = user.npub;

  if (!studentPubkey || !rewardType) {
    return res.status(400).json({
      error: "Student public key and reward type required",
    });
  }

  try {
    await validateInput({ rewardType, guardianApproval }, "reward-redemption");

    const redemption = await rewardSystem.redeemReward(
      studentPubkey,
      rewardType,
      guardianApproval
    );

    res.status(200).json({
      success: true,
      data: redemption,
      message: "Reward redeemed successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Request guardian approval for a reward
 */
async function requestGuardianApproval(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { rewardType, guardianPubkey, message } = req.body;
  const studentPubkey = user.npub;

  if (!studentPubkey || !rewardType || !guardianPubkey) {
    return res.status(400).json({
      error: "Student pubkey, reward type, and guardian pubkey required",
    });
  }

  try {
    await validateInput(
      { rewardType, guardianPubkey, message },
      "approval-request"
    );

    // Create approval request (would integrate with messaging system)
    const approvalRequest = {
      id: `approval_${Date.now()}`,
      student_pubkey: studentPubkey,
      guardian_pubkey: guardianPubkey,
      reward_type: rewardType,
      message: message || `Requesting approval for ${rewardType} reward`,
      status: "pending",
      created_at: Math.floor(Date.now() / 1000),
    };

    // Store approval request (implementation depends on messaging system)
    // For now, just return success
    res.status(200).json({
      success: true,
      data: approvalRequest,
      message: "Approval request sent to guardian",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Update reward configuration (admin only)
 */
async function updateRewardConfig(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin privileges required" });
  }

  const { rewardType, updates } = req.body;

  if (!rewardType || !updates) {
    return res.status(400).json({
      error: "Reward type and updates required",
    });
  }

  try {
    await validateInput({ rewardType, updates }, "reward-config-update");

    rewardSystem.updateRewardConfig(rewardType, updates);

    res.status(200).json({
      success: true,
      message: "Reward configuration updated",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Approve a redemption (guardian only)
 */
async function approveRedemption(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { redemptionId, approval } = req.body;

  if (!redemptionId || !approval) {
    return res.status(400).json({
      error: "Redemption ID and approval required",
    });
  }

  try {
    await validateInput({ redemptionId, approval }, "redemption-approval");

    // Check if user is a guardian (would check family relationships)
    if (user.role !== "admin" && !user.familyId) {
      return res.status(403).json({ error: "Guardian privileges required" });
    }

    // Process approval (implementation depends on specific requirements)
    // For now, just return success
    res.status(200).json({
      success: true,
      message: "Redemption approved",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get Lightning reward details
 */
export async function getLightningRewardDetails(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { redemptionId } = req.query;

  if (!redemptionId || typeof redemptionId !== "string") {
    return res.status(400).json({ error: "Redemption ID required" });
  }

  try {
    // Get redemption details
    const studentPubkey = user.npub;
    const redemptions = await rewardSystem.getStudentRedemptions(studentPubkey);
    const redemption = redemptions.find((r) => r.id === redemptionId);

    if (!redemption || redemption.reward_type !== "lightning-sats") {
      return res.status(404).json({ error: "Lightning reward not found" });
    }

    // Return Lightning-specific details
    res.status(200).json({
      success: true,
      data: {
        redemption_id: redemption.id,
        amount_sats: redemption.value,
        bolt11_invoice: redemption.redemption_proof,
        status: redemption.status,
        created_at: redemption.created_at,
        processed_at: redemption.processed_at,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get family treasury reward details
 */
export async function getFamilyTreasuryRewardDetails(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { redemptionId } = req.query;

  if (!redemptionId || typeof redemptionId !== "string") {
    return res.status(400).json({ error: "Redemption ID required" });
  }

  try {
    // Get redemption details
    const studentPubkey = user.npub;
    const redemptions = await rewardSystem.getStudentRedemptions(studentPubkey);
    const redemption = redemptions.find((r) => r.id === redemptionId);

    if (!redemption || redemption.reward_type !== "family-credits") {
      return res
        .status(404)
        .json({ error: "Family treasury reward not found" });
    }

    // Return family treasury-specific details
    res.status(200).json({
      success: true,
      data: {
        redemption_id: redemption.id,
        amount_credits: redemption.value,
        family_id: user.familyId,
        transaction_id: redemption.redemption_proof,
        status: redemption.status,
        created_at: redemption.created_at,
        processed_at: redemption.processed_at,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
/**
 * Citadel Academy Rewards API Endpoints
 * Bitcoin-only reward system for educational achievements
 */

/**
 * Rewards API Handler
 * Handles reward-related operations: viewing, redemption, history
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Verify authentication
    const authResult = await verifyAuthToken(req);
    if (!authResult.success) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { user } = authResult;
    const { method } = req;

    // Rate limiting
    await rateLimiter.checkLimit("rewards-api", user.id);

    switch (method) {
      case "GET":
        return await handleGet(req, res, user);
      case "POST":
        return await handlePost(req, res, user);
      case "PUT":
        return await handlePut(req, res, user);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Rewards API error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Handle GET requests - Query rewards and redemptions
 */
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { action } = req.query;

  switch (action) {
    case "available":
      return await getAvailableRewards(req, res, user);
    case "history":
      return await getRedemptionHistory(req, res, user);
    case "configs":
      return await getRewardConfigs(req, res, user);
    case "status":
      return await getRedemptionStatus(req, res, user);
    default:
      return res.status(400).json({ error: "Invalid action parameter" });
  }
}

/**
 * Handle POST requests - Redeem rewards
 */
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { action } = req.query;

  switch (action) {
    case "redeem":
      return await redeemReward(req, res, user);
    case "request-approval":
      return await requestGuardianApproval(req, res, user);
    default:
      return res.status(400).json({ error: "Invalid action parameter" });
  }
}

/**
 * Handle PUT requests - Update reward configurations
 */
async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { action } = req.query;

  switch (action) {
    case "update-config":
      return await updateRewardConfig(req, res, user);
    case "approve":
      return await approveRedemption(req, res, user);
    default:
      return res.status(400).json({ error: "Invalid action parameter" });
  }
}

/**
 * Get available rewards for a student
 */
async function getAvailableRewards(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const studentPubkey = user.npub || (req.query.studentPubkey as string);

  if (!studentPubkey) {
    return res.status(400).json({ error: "Student public key required" });
  }

  try {
    // Get student progress
    const progress = await progressTracker.getStudentProgress(studentPubkey);
    if (!progress) {
      return res.status(404).json({ error: "Student progress not found" });
    }

    // Get available rewards
    const availableRewards = await rewardSystem.getAvailableRewards(
      studentPubkey,
      progress
    );

    res.status(200).json({
      success: true,
      data: availableRewards,
      count: availableRewards.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get redemption history for a student
 */
async function getRedemptionHistory(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const studentPubkey = user.npub || (req.query.studentPubkey as string);

  if (!studentPubkey) {
    return res.status(400).json({ error: "Student public key required" });
  }

  try {
    const redemptions = await rewardSystem.getStudentRedemptions(studentPubkey);

    res.status(200).json({
      success: true,
      data: redemptions,
      count: redemptions.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get reward configurations
 */
async function getRewardConfigs(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { rewardType } = req.query;

  try {
    if (rewardType && typeof rewardType === "string") {
      const config = rewardSystem.getRewardConfig(rewardType as RewardType);
      if (!config) {
        return res
          .status(404)
          .json({ error: "Reward configuration not found" });
      }

      res.status(200).json({
        success: true,
        data: config,
      });
    } else {
      // Return all configs (admin only)
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin privileges required" });
      }

      // This would need to be implemented to return all configs
      res.status(200).json({
        success: true,
        data: [], // Placeholder
        message: "All reward configurations",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get redemption status
 */
async function getRedemptionStatus(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { redemptionId } = req.query;

  if (!redemptionId || typeof redemptionId !== "string") {
    return res.status(400).json({ error: "Redemption ID required" });
  }

  try {
    const studentPubkey = user.npub;
    const redemptions = await rewardSystem.getStudentRedemptions(studentPubkey);
    const redemption = redemptions.find((r) => r.id === redemptionId);

    if (!redemption) {
      return res.status(404).json({ error: "Redemption not found" });
    }

    res.status(200).json({
      success: true,
      data: {
        id: redemption.id,
        reward_type: redemption.reward_type,
        status: redemption.status,
        value: redemption.value,
        redemption_proof: redemption.redemption_proof,
        created_at: redemption.created_at,
        processed_at: redemption.processed_at,
        expires_at: redemption.expires_at,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Redeem a reward
 */
async function redeemReward(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { rewardType, guardianApproval } = req.body;
  const studentPubkey = user.npub;

  if (!studentPubkey || !rewardType) {
    return res.status(400).json({
      error: "Student public key and reward type required",
    });
  }

  try {
    await validateInput({ rewardType, guardianApproval }, "reward-redemption");

    const redemption = await rewardSystem.redeemReward(
      studentPubkey,
      rewardType,
      guardianApproval
    );

    res.status(200).json({
      success: true,
      data: redemption,
      message: "Reward redeemed successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Request guardian approval for a reward
 */
async function requestGuardianApproval(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { rewardType, guardianPubkey, message } = req.body;
  const studentPubkey = user.npub;

  if (!studentPubkey || !rewardType || !guardianPubkey) {
    return res.status(400).json({
      error: "Student pubkey, reward type, and guardian pubkey required",
    });
  }

  try {
    await validateInput(
      { rewardType, guardianPubkey, message },
      "approval-request"
    );

    // Create approval request (would integrate with messaging system)
    const approvalRequest = {
      id: `approval_${Date.now()}`,
      student_pubkey: studentPubkey,
      guardian_pubkey: guardianPubkey,
      reward_type: rewardType,
      message: message || `Requesting approval for ${rewardType} reward`,
      status: "pending",
      created_at: Math.floor(Date.now() / 1000),
    };

    // Store approval request (implementation depends on messaging system)
    // For now, just return success
    res.status(200).json({
      success: true,
      data: approvalRequest,
      message: "Approval request sent to guardian",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Update reward configuration (admin only)
 */
async function updateRewardConfig(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin privileges required" });
  }

  const { rewardType, updates } = req.body;

  if (!rewardType || !updates) {
    return res.status(400).json({
      error: "Reward type and updates required",
    });
  }

  try {
    await validateInput({ rewardType, updates }, "reward-config-update");

    rewardSystem.updateRewardConfig(rewardType, updates);

    res.status(200).json({
      success: true,
      message: "Reward configuration updated",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Approve a redemption (guardian only)
 */
async function approveRedemption(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { redemptionId, approval } = req.body;

  if (!redemptionId || !approval) {
    return res.status(400).json({
      error: "Redemption ID and approval required",
    });
  }

  try {
    await validateInput({ redemptionId, approval }, "redemption-approval");

    // Check if user is a guardian (would check family relationships)
    if (user.role !== "admin" && !user.familyId) {
      return res.status(403).json({ error: "Guardian privileges required" });
    }

    // Process approval (implementation depends on specific requirements)
    // For now, just return success
    res.status(200).json({
      success: true,
      message: "Redemption approved",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get Lightning reward details
 */
export async function getLightningRewardDetails(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { redemptionId } = req.query;

  if (!redemptionId || typeof redemptionId !== "string") {
    return res.status(400).json({ error: "Redemption ID required" });
  }

  try {
    // Get redemption details
    const studentPubkey = user.npub;
    const redemptions = await rewardSystem.getStudentRedemptions(studentPubkey);
    const redemption = redemptions.find((r) => r.id === redemptionId);

    if (!redemption || redemption.reward_type !== "lightning-sats") {
      return res.status(404).json({ error: "Lightning reward not found" });
    }

    // Return Lightning-specific details
    res.status(200).json({
      success: true,
      data: {
        redemption_id: redemption.id,
        amount_sats: redemption.value,
        bolt11_invoice: redemption.redemption_proof,
        status: redemption.status,
        created_at: redemption.created_at,
        processed_at: redemption.processed_at,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get family treasury reward details
 */
export async function getFamilyTreasuryRewardDetails(
  req: NextApiRequest,
  res: NextApiResponse,
  user: any
): Promise<void> {
  const { redemptionId } = req.query;

  if (!redemptionId || typeof redemptionId !== "string") {
    return res.status(400).json({ error: "Redemption ID required" });
  }

  try {
    // Get redemption details
    const studentPubkey = user.npub;
    const redemptions = await rewardSystem.getStudentRedemptions(studentPubkey);
    const redemption = redemptions.find((r) => r.id === redemptionId);

    if (!redemption || redemption.reward_type !== "family-credits") {
      return res
        .status(404)
        .json({ error: "Family treasury reward not found" });
    }

    // Return family treasury-specific details
    res.status(200).json({
      success: true,
      data: {
        redemption_id: redemption.id,
        amount_credits: redemption.value,
        family_id: user.familyId,
        transaction_id: redemption.redemption_proof,
        status: redemption.status,
        created_at: redemption.created_at,
        processed_at: redemption.processed_at,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
