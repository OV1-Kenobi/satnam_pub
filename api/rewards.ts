/**
 * Citadel Academy Rewards API Endpoints
 * Bitcoin-only reward system for educational achievements
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import { supabase } from "../src/lib/supabase";
import { encryptSensitiveData } from "../src/lib/privacy/encryption";

// Types for rewards system
export interface RewardType {
  id: string;
  name: string;
  description: string;
  amount: number; // in satoshis
  currency: 'sats' | 'ecash' | 'fedimint' | 'course_credits';
  requirements: string[];
  maxRedemptions: number;
  requiresApproval: boolean;
  approvalRoles: ('guardian' | 'steward' | 'adult')[];
  expiresAfter: number; // days
  antiGamingMeasures?: {
    requiresVerification: boolean;
    maxPerTimeframe: number;
    timeframe: 'hour' | 'day' | 'week' | 'month';
    requiresRealInteraction: boolean;
    minimumStudyTime?: number; // minutes
    requiresCourseProgress?: boolean;
  };
}

export interface CourseCreditReward extends RewardType {
  currency: 'course_credits';
  courseId: string;
  creditAmount: number;
  requiresCourseCompletion: boolean;
  antiGamingMeasures: {
    requiresVerification: true;
    maxPerTimeframe: number;
    timeframe: 'day' | 'week' | 'month';
    requiresRealInteraction: true;
    minimumStudyTime: number;
    requiresCourseProgress: true;
    requiresGuardianVerification: boolean;
    maxInvitationsPerDay: number;
    invitationCooldownHours: number;
  };
}

export interface StudentProgress {
  studentPubkey: string;
  completedModules: string[];
  achievements: string[];
  totalStudyTime: number; // minutes
  lastActivity: string;
  level: number;
  badges: string[];
}

export interface RewardRedemption {
  id: string;
  studentPubkey: string;
  rewardType: string;
  amount: number;
  currency: 'sats' | 'ecash' | 'fedimint';
  status: 'pending' | 'approved' | 'rejected' | 'processed' | 'expired';
  redemptionProof?: string; // Lightning invoice, transaction hash, etc.
  guardianApproval?: {
    guardianPubkey: string;
    approved: boolean;
    reason?: string;
    timestamp: string;
  };
  createdAt: string;
  processedAt?: string;
  expiresAt: string;
}

export interface ApprovalRequest {
  id: string;
  studentPubkey: string;
  guardianPubkey: string;
  rewardType: string;
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  respondedAt?: string;
}

/**
 * Rewards API Handler for Netlify Functions
 */
interface NetlifyEvent {
  httpMethod: string;
  queryStringParameters?: Record<string, string>;
  body?: string;
  headers?: Record<string, string>;
}

interface NetlifyContext {
  functionName: string;
  functionVersion: string;
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  awsRequestId: string;
  logGroupName: string;
  logStreamName: string;
  deadlineMs?: number;
  callbackWaitsForEmptyEventLoop?: boolean;
}

export async function handler(event: NetlifyEvent, context: NetlifyContext) {
  try {
    // Verify authentication (browser-compatible)
    const authResult = await verifyAuthToken(event);
    if (!authResult.success) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
        body: JSON.stringify({ error: "Authentication required" })
      };
    }

    const { user } = authResult;
    const { httpMethod } = event;

    if (!user) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: "User not found" })
      };
    }

    // Rate limiting (browser-compatible)
    await checkRateLimit("rewards-api", user.id);

    switch (httpMethod) {
      case "GET":
        return await handleGet(event, user);
      case "POST":
        return await handlePost(event, user);
      case "PUT":
        return await handlePut(event, user);
      default:
        return {
          statusCode: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: "Method not allowed" })
        };
    }
  } catch (error) {
    console.error("Rewards API error:", error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      })
    };
  }
}

/**
 * Handle GET requests - Query rewards and redemptions
 */
interface AuthenticatedUser {
  id: string;
  npub: string;
  role: 'student' | 'guardian' | 'steward' | 'adult' | 'admin';
  familyId?: string;
  verifiedAt?: string;
}

async function handleGet(event: NetlifyEvent, user: AuthenticatedUser) {
  const { action } = event.queryStringParameters || {};

  switch (action) {
    case "available":
      return await getAvailableRewards(event, user);
    case "history":
      return await getRedemptionHistory(event, user);
    case "configs":
      return await getRewardConfigs(event, user);
    case "status":
      return await getRedemptionStatus(event, user);
    default:
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: "Invalid action parameter" })
      };
  }
}

/**
 * Handle POST requests - Redeem rewards
 */
async function handlePost(event: NetlifyEvent, user: AuthenticatedUser) {
  const { action } = event.queryStringParameters || {};
  const body = JSON.parse(event.body || '{}');

  switch (action) {
    case "redeem":
      return await redeemReward(body, user);
    case "request-approval":
      return await requestGuardianApproval(body, user);
    default:
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: "Invalid action parameter" })
      };
  }
}

/**
 * Handle PUT requests - Update reward configurations
 */
async function handlePut(event: NetlifyEvent, user: AuthenticatedUser) {
  const { action } = event.queryStringParameters || {};
  const body = JSON.parse(event.body || '{}');

  switch (action) {
    case "update-config":
      return await updateRewardConfig(body, user);
    case "approve":
      return await approveRedemption(body, user);
    default:
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: "Invalid action parameter" })
      };
  }
}

/**
 * Get available rewards for a student
 */
async function getAvailableRewards(event: NetlifyEvent, user: AuthenticatedUser) {
  const studentPubkey = user.npub || event.queryStringParameters?.studentPubkey;

  if (!studentPubkey) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: "Student public key required" })
    };
  }

  try {
    // Get student progress from database
    const { data: progress, error: progressError } = await supabase
      .from('student_progress')
      .select('*')
      .eq('student_pubkey', studentPubkey)
      .single();

    if (progressError || !progress) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: "Student progress not found" })
      };
    }

    // Get available rewards based on progress
    const availableRewards = await getAvailableRewardsForProgress(studentPubkey, progress);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        data: availableRewards,
        count: availableRewards.length,
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    };
  }
}

/**
 * Get redemption history for a student
 */
async function getRedemptionHistory(event: NetlifyEvent, user: AuthenticatedUser) {
  const studentPubkey = user.npub || event.queryStringParameters?.studentPubkey;

  if (!studentPubkey) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: "Student public key required" })
    };
  }

  try {
    const { data: redemptions, error } = await supabase
      .from('reward_redemptions')
      .select('*')
      .eq('student_pubkey', studentPubkey)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        data: redemptions || [],
        count: (redemptions || []).length,
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    };
  }
}

/**
 * Get reward configurations
 */
async function getRewardConfigs(event: NetlifyEvent, user: AuthenticatedUser) {
  const { rewardType } = event.queryStringParameters || {};

  try {
    if (rewardType) {
      const { data: config, error } = await supabase
        .from('reward_configs')
        .select('*')
        .eq('reward_type', rewardType)
        .single();

      if (error || !config) {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: "Reward configuration not found" })
        };
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: true,
          data: config,
        })
      };
    } else {
      // Return all configs (admin only)
      if (user.role !== "admin") {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: "Admin privileges required" })
        };
      }

      const { data: configs, error } = await supabase
        .from('reward_configs')
        .select('*');

      if (error) {
        throw error;
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: true,
          data: configs || [],
          message: "All reward configurations",
        })
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    };
  }
}

/**
 * Get redemption status
 */
async function getRedemptionStatus(event: NetlifyEvent, user: AuthenticatedUser) {
  const { redemptionId } = event.queryStringParameters || {};

  if (!redemptionId) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: "Redemption ID required" })
    };
  }

  try {
    const studentPubkey = user.npub;
    const { data: redemption, error } = await supabase
      .from('reward_redemptions')
      .select('*')
      .eq('id', redemptionId)
      .eq('student_pubkey', studentPubkey)
      .single();

    if (error || !redemption) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: "Redemption not found" })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        data: {
          id: redemption.id,
          reward_type: redemption.reward_type,
          status: redemption.status,
          value: redemption.amount,
          redemption_proof: redemption.redemption_proof,
          created_at: redemption.created_at,
          processed_at: redemption.processed_at,
          expires_at: redemption.expires_at,
        },
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    };
  }
}

/**
 * Redeem a reward
 */
interface RewardRedemptionRequest {
  rewardType: string;
  guardianApproval?: boolean;
}

async function redeemReward(body: RewardRedemptionRequest, user: AuthenticatedUser) {
  const { rewardType, guardianApproval } = body;
  const studentPubkey = user.npub;

  if (!studentPubkey || !rewardType) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: "Student public key and reward type required",
      })
    };
  }

  try {
    // Validate input
    await validateRewardRedemption({ rewardType, guardianApproval });

    // Create redemption record
    const redemption: RewardRedemption = {
      id: crypto.randomUUID(),
      studentPubkey,
      rewardType,
      amount: 0, // Will be set from config
      currency: 'sats', // Default to Bitcoin
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    };

    // Get reward configuration
    const { data: config, error: configError } = await supabase
      .from('reward_configs')
      .select('*')
      .eq('reward_type', rewardType)
      .single();

    if (configError || !config) {
      throw new Error('Reward configuration not found');
    }

    redemption.amount = config.amount;
    redemption.currency = config.currency;

    // Check if approval is required
    if (config.requires_approval && !guardianApproval) {
      // Create approval request
      const approvalRequest: ApprovalRequest = {
        id: crypto.randomUUID(),
        studentPubkey,
        guardianPubkey: '', // Will be set by guardian
        rewardType,
        message: `Requesting approval for ${rewardType} reward`,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      await supabase.from('approval_requests').insert([approvalRequest]);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: true,
          data: { ...redemption, approvalRequired: true, approvalRequestId: approvalRequest.id },
          message: "Reward redemption created, awaiting guardian approval",
        })
      };
    }

    // Process redemption immediately
    redemption.status = 'approved';
    redemption.processedAt = new Date().toISOString();

    // Generate redemption proof (Lightning invoice, etc.)
    redemption.redemptionProof = await generateRedemptionProof(redemption);

    // Save redemption
    await supabase.from('reward_redemptions').insert([redemption]);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        data: redemption,
        message: "Reward redeemed successfully",
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    };
  }
}

/**
 * Request guardian approval for a reward
 */
interface GuardianApprovalRequest {
  rewardType: string;
  guardianPubkey: string;
  message?: string;
}

async function requestGuardianApproval(body: GuardianApprovalRequest, user: AuthenticatedUser) {
  const { rewardType, guardianPubkey, message } = body;
  const studentPubkey = user.npub;

  if (!studentPubkey || !rewardType || !guardianPubkey) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: "Student pubkey, reward type, and guardian pubkey required",
      })
    };
  }

  try {
    // Validate input
    await validateApprovalRequest({ rewardType, guardianPubkey, message });

    // Create approval request
    const approvalRequest: ApprovalRequest = {
      id: crypto.randomUUID(),
      studentPubkey,
      guardianPubkey,
      rewardType,
      message: message || `Requesting approval for ${rewardType} reward`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    // Save approval request
    await supabase.from('approval_requests').insert([approvalRequest]);

    // Send notification to guardian (integrate with messaging system)
    await sendGuardianNotification(approvalRequest);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        data: approvalRequest,
        message: "Approval request sent to guardian",
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    };
  }
}

/**
 * Update reward configuration (admin only)
 */
interface RewardConfigUpdate {
  rewardType: string;
  updates: Record<string, unknown>;
}

async function updateRewardConfig(body: RewardConfigUpdate, user: AuthenticatedUser) {
  if (user.role !== "admin") {
    return {
      statusCode: 403,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: "Admin privileges required" })
    };
  }

  const { rewardType, updates } = body;

  if (!rewardType || !updates) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: "Reward type and updates required",
      })
    };
  }

  try {
    // Validate input
    await validateRewardConfigUpdate({ rewardType, updates });

    // Update configuration
    const { error } = await supabase
      .from('reward_configs')
      .update(updates)
      .eq('reward_type', rewardType);

    if (error) {
      throw error;
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        message: "Reward configuration updated",
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    };
  }
}

/**
 * Approve a redemption (guardian only)
 */
interface RedemptionApproval {
  redemptionId: string;
  approval: boolean;
}

async function approveRedemption(body: RedemptionApproval, user: AuthenticatedUser) {
  const { redemptionId, approval } = body;

  if (!redemptionId || approval === undefined) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: "Redemption ID and approval required",
      })
    };
  }

  try {
    // Validate input
    await validateRedemptionApproval({ redemptionId, approval });

    // Check if user is a guardian
    if (user.role !== "admin" && !user.familyId) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: "Guardian privileges required" })
      };
    }

    // Update redemption status
    const { error } = await supabase
      .from('reward_redemptions')
      .update({
        status: approval ? 'approved' : 'rejected',
        processed_at: new Date().toISOString(),
        guardian_approval: {
          guardianPubkey: user.npub,
          approved: approval,
          timestamp: new Date().toISOString(),
        }
      })
      .eq('id', redemptionId);

    if (error) {
      throw error;
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        message: approval ? "Redemption approved" : "Redemption rejected",
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    };
  }
}

// Helper functions

/**
 * Browser-compatible authentication verification
 */
interface AuthResult {
  success: boolean;
  user?: AuthenticatedUser;
  error?: string;
}

async function verifyAuthToken(event: NetlifyEvent): Promise<AuthResult> {
  // Implementation depends on your auth system
  // For now, return a mock success
  return {
    success: true,
    user: {
      id: 'user-123',
      npub: 'npub123',
      role: 'student',
      familyId: 'family-123'
    }
  };
}

/**
 * Browser-compatible rate limiting
 */
async function checkRateLimit(identifier: string, userId: string): Promise<boolean> {
  // Simple rate limiting implementation
  // In production, use a proper rate limiting service
  return true;
}

/**
 * Get available rewards based on student progress
 */
interface StudentProgressData {
  student_pubkey: string;
  completed_modules: string[];
  achievements: string[];
  total_study_time: number;
  last_activity: string;
  level: number;
  badges: string[];
}

async function getAvailableRewardsForProgress(studentPubkey: string, progress: StudentProgressData): Promise<RewardType[]> {
  // Get all reward configurations
  const { data: configs, error } = await supabase
    .from('reward_configs')
    .select('*');

  if (error || !configs) {
    return [];
  }

  // Filter rewards based on progress
  return configs.filter(config => {
    // Check if student meets requirements
    return checkRewardRequirements(config, progress);
  });
}

/**
 * Check if student meets reward requirements
 */
function checkRewardRequirements(config: RewardType, progress: StudentProgressData): boolean {
  // Implementation depends on your requirement system
  // For now, return true for all rewards
  return true;
}

/**
 * Generate redemption proof (Lightning invoice, etc.)
 */
async function generateRedemptionProof(redemption: RewardRedemption): Promise<string> {
  // Generate Lightning invoice for Bitcoin rewards
  if (redemption.currency === 'sats') {
    // In production, integrate with Lightning service
    return `lnbc${redemption.amount}1p...`; // Mock Lightning invoice
  }
  
  // For other currencies, generate appropriate proof
  return `proof_${redemption.id}_${Date.now()}`;
}

/**
 * Send notification to guardian
 */
async function sendGuardianNotification(approvalRequest: ApprovalRequest): Promise<void> {
  // Integrate with your messaging system
  // For now, just log the notification
  console.log(`Notification sent to guardian ${approvalRequest.guardianPubkey}`);
}

// Validation functions

interface ValidationData {
  rewardType?: string;
  guardianApproval?: boolean;
  guardianPubkey?: string;
  message?: string;
  updates?: Record<string, unknown>;
  redemptionId?: string;
  approval?: boolean;
}

async function validateRewardRedemption(data: ValidationData): Promise<void> {
  if (!data.rewardType || typeof data.rewardType !== 'string') {
    throw new Error('Invalid reward type');
  }
}

async function validateApprovalRequest(data: ValidationData): Promise<void> {
  if (!data.rewardType || !data.guardianPubkey) {
    throw new Error('Invalid approval request data');
  }
}

async function validateRewardConfigUpdate(data: ValidationData): Promise<void> {
  if (!data.rewardType || !data.updates) {
    throw new Error('Invalid config update data');
  }
}

async function validateRedemptionApproval(data: ValidationData): Promise<void> {
  if (!data.redemptionId || typeof data.approval !== 'boolean') {
    throw new Error('Invalid approval data');
  }
}

// Export for use in other modules
export { handler as rewardsApiHandler }; 