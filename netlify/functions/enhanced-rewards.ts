/**
 * Enhanced Rewards API - Netlify Function
 * Bitcoin-only reward system with comprehensive anti-gaming protection
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import { Handler } from "@netlify/functions";
import { supabase } from "./supabase.js";

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

// Anti-gaming measures
const RAPID_SUBMISSION_WINDOW = 5 * 60 * 1000; // 5 minutes
const MAX_RAPID_SUBMISSIONS = 3;
const MIN_TIME_BETWEEN_ACTIONS = 30 * 1000; // 30 seconds

interface RewardRequest {
  action: "available" | "history" | "redeem" | "validate" | "progress";
  studentPubkey: string;
  familyId?: string;
  rewardType?: string;
  guardianApproval?: boolean;
  browserFingerprint?: string;
}

interface RewardResponse {
  success: boolean;
  data?: any;
  error?: string;
  antiGamingValidation?: {
    is_valid: boolean;
    violations: string[];
    risk_score: number;
    recommendations: string[];
  };
}

/**
 * Rate limiting middleware
 */
function checkRateLimit(clientId: string): {
  allowed: boolean;
  reason?: string;
} {
  const now = Date.now();
  const clientData = rateLimitMap.get(clientId);

  if (!clientData || now > clientData.resetTime) {
    rateLimitMap.set(clientId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    return { allowed: true };
  }

  if (clientData.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      reason: `Rate limit exceeded: ${clientData.count}/${MAX_REQUESTS_PER_WINDOW} requests per minute`,
    };
  }

  clientData.count++;
  return { allowed: true };
}

/**
 * Check rapid submissions
 */
async function checkRapidSubmissions(
  studentPubkey: string
): Promise<{ allowed: boolean; reason?: string }> {
  const now = Date.now();
  const windowStart = now - RAPID_SUBMISSION_WINDOW;

  const { data: recentSubmissions, error } = await supabase
    .from("reward_redemptions")
    .select("created_at")
    .eq("student_pubkey", studentPubkey)
    .gte("created_at", windowStart);

  if (error) {
    return { allowed: true }; // Allow if we can't check
  }

  if (recentSubmissions && recentSubmissions.length >= MAX_RAPID_SUBMISSIONS) {
    return {
      allowed: false,
      reason: `${recentSubmissions.length} submissions in 5 minutes`,
    };
  }

  return { allowed: true };
}

/**
 * Check time between actions
 */
async function checkTimeBetweenActions(
  studentPubkey: string
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: lastAction, error } = await supabase
    .from("reward_redemptions")
    .select("created_at")
    .eq("student_pubkey", studentPubkey)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !lastAction) {
    return { allowed: true };
  }

  const timeSinceLastAction = Date.now() - lastAction.created_at;
  if (timeSinceLastAction < MIN_TIME_BETWEEN_ACTIONS) {
    return {
      allowed: false,
      reason: `${Math.round(
        (MIN_TIME_BETWEEN_ACTIONS - timeSinceLastAction) / 1000
      )}s too soon`,
    };
  }

  return { allowed: true };
}

/**
 * Validate browser fingerprint
 */
async function validateBrowserFingerprint(
  studentPubkey: string,
  currentFingerprint: string
): Promise<{ valid: boolean; reason?: string }> {
  // Get student progress to check historical fingerprints
  const { data: progress, error } = await supabase
    .from("student_progress")
    .select("browser_fingerprints")
    .eq("student_pubkey", studentPubkey)
    .single();

  if (error || !progress) {
    // First time user, accept fingerprint
    return { valid: true };
  }

  const historicalFps = progress.browser_fingerprints || [];
  if (historicalFps.length === 0) {
    return { valid: true };
  }

  // Check if current fingerprint matches any historical ones
  const hasMatchingFingerprint = historicalFps.some(
    (fp) => compareFingerprints(fp, currentFingerprint) > 0.8
  );

  if (!hasMatchingFingerprint) {
    return {
      valid: false,
      reason: "Browser fingerprint changed significantly",
    };
  }

  return { valid: true };
}

/**
 * Compare fingerprints for similarity
 */
function compareFingerprints(fp1: string, fp2: string): number {
  if (fp1 === fp2) return 1.0;

  const minLength = Math.min(fp1.length, fp2.length);
  let commonPrefix = 0;

  for (let i = 0; i < minLength; i++) {
    if (fp1[i] === fp2[i]) {
      commonPrefix++;
    } else {
      break;
    }
  }

  return commonPrefix / Math.max(fp1.length, fp2.length);
}

/**
 * Get available rewards with anti-gaming validation
 */
async function getAvailableRewards(
  studentPubkey: string,
  familyId?: string
): Promise<RewardResponse> {
  try {
    // Get student progress
    const { data: progress, error: progressError } = await supabase
      .from("student_progress")
      .select("*")
      .eq("student_pubkey", studentPubkey)
      .single();

    if (progressError || !progress) {
      return { success: false, error: "Student progress not found" };
    }

    // Get reward configurations
    const { data: configs, error: configError } = await supabase
      .from("reward_configs")
      .select("*")
      .eq("active", true);

    if (configError || !configs) {
      return { success: false, error: "Failed to load reward configurations" };
    }

    // Filter and validate rewards
    const availableRewards = [];
    const validations = [];

    for (const config of configs) {
      const validation = await validateRewardEligibility(
        config,
        progress,
        studentPubkey,
        familyId
      );
      if (validation.isValid) {
        availableRewards.push(config);
      }
      validations.push(validation);
    }

    return {
      success: true,
      data: availableRewards,
      antiGamingValidation: {
        is_valid: validations.every((v) => v.isValid),
        violations: validations.flatMap((v) => v.violations),
        risk_score: Math.max(...validations.map((v) => v.riskScore)),
        recommendations: generateRecommendations(validations),
      },
    };
  } catch (error) {
    return { success: false, error: "Failed to get available rewards" };
  }
}

/**
 * Validate reward eligibility
 */
async function validateRewardEligibility(
  config: any,
  progress: any,
  studentPubkey: string,
  familyId?: string
): Promise<{ isValid: boolean; violations: string[]; riskScore: number }> {
  const violations: string[] = [];
  let riskScore = 0;

  // Check basic requirements
  if (config.requirements && config.requirements.length > 0) {
    for (const requirement of config.requirements) {
      if (!progress.completed_modules?.includes(requirement)) {
        violations.push(`Missing requirement: ${requirement}`);
        riskScore += 10;
      }
    }
  }

  // Check study time
  if (
    config.minimum_study_time &&
    progress.total_study_time < config.minimum_study_time
  ) {
    violations.push(
      `Insufficient study time: ${progress.total_study_time}/${config.minimum_study_time} minutes`
    );
    riskScore += 15;
  }

  // Check course progress for course credits
  if (config.currency === "course_credits" && config.course_id) {
    const courseProgress = progress.course_progress?.[config.course_id] || 0;
    if (config.requires_course_completion && courseProgress < 100) {
      violations.push(`Course not completed: ${courseProgress}%`);
      riskScore += 20;
    }
  }

  // Check family requirements
  if (config.currency === "family-credits" && !familyId) {
    violations.push("Family membership required");
    riskScore += 25;
  }

  // Check invitation patterns
  if (config.max_invitations_per_day) {
    const todayInvitations = getTodayInvitations(
      progress.invitation_history || []
    );
    if (todayInvitations.length >= config.max_invitations_per_day) {
      violations.push(`Too many invitations today: ${todayInvitations.length}`);
      riskScore += 15;
    }
  }

  return {
    isValid: violations.length === 0 && riskScore < 50,
    violations,
    riskScore,
  };
}

/**
 * Get today's invitations
 */
function getTodayInvitations(invitationHistory: any[]): any[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  return invitationHistory.filter((inv) => inv.timestamp >= todayStart);
}

/**
 * Generate recommendations
 */
function generateRecommendations(validations: any[]): string[] {
  const recommendations: string[] = [];
  const allViolations = validations.flatMap((v) => v.violations);

  if (allViolations.some((v) => v.includes("study time"))) {
    recommendations.push("Complete more study time to unlock rewards");
  }

  if (allViolations.some((v) => v.includes("course"))) {
    recommendations.push("Complete required courses to earn course credits");
  }

  if (allViolations.some((v) => v.includes("invitation"))) {
    recommendations.push("Focus on quality invitations rather than quantity");
  }

  if (allViolations.some((v) => v.includes("fingerprint"))) {
    recommendations.push("Use the same browser and device consistently");
  }

  return recommendations;
}

/**
 * Get student redemptions
 */
async function getStudentRedemptions(
  studentPubkey: string
): Promise<RewardResponse> {
  try {
    const { data, error } = await supabase
      .from("reward_redemptions")
      .select("*")
      .eq("student_pubkey", studentPubkey)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: "Failed to load redemptions" };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    return { success: false, error: "Failed to get redemptions" };
  }
}

/**
 * Redeem a reward
 */
async function redeemReward(
  studentPubkey: string,
  rewardType: string,
  guardianApproval?: boolean,
  browserFingerprint?: string
): Promise<RewardResponse> {
  try {
    // Get reward configuration
    const { data: config, error: configError } = await supabase
      .from("reward_configs")
      .select("*")
      .eq("type", rewardType)
      .eq("active", true)
      .single();

    if (configError || !config) {
      return { success: false, error: "Reward configuration not found" };
    }

    // Validate eligibility
    const { data: progress, error: progressError } = await supabase
      .from("student_progress")
      .select("*")
      .eq("student_pubkey", studentPubkey)
      .single();

    if (progressError || !progress) {
      return { success: false, error: "Student progress not found" };
    }

    const eligibility = await validateRewardEligibility(
      config,
      progress,
      studentPubkey
    );
    if (!eligibility.isValid) {
      return {
        success: false,
        error: `Not eligible: ${eligibility.violations.join(", ")}`,
        antiGamingValidation: {
          is_valid: false,
          violations: eligibility.violations,
          risk_score: eligibility.riskScore,
          recommendations: generateRecommendations([eligibility]),
        },
      };
    }

    // Create redemption record
    const redemption = {
      id: crypto.randomUUID(),
      student_pubkey: studentPubkey,
      reward_type: rewardType,
      value: config.value,
      currency: config.currency,
      status:
        config.family_approval_required && !guardianApproval
          ? "pending"
          : "approved",
      created_at: Date.now(),
      privacy_encrypted: config.privacy_level === "encrypted",
      browser_fingerprint: browserFingerprint,
      course_id:
        config.currency === "course_credits" ? config.course_id : undefined,
      study_time_minutes: progress.total_study_time,
    };

    // Save redemption
    const { error: saveError } = await supabase
      .from("reward_redemptions")
      .insert([redemption]);

    if (saveError) {
      return { success: false, error: "Failed to save redemption" };
    }

    // Update browser fingerprint if provided
    if (browserFingerprint && progress.browser_fingerprints) {
      const updatedFps = [
        ...(progress.browser_fingerprints || []),
        browserFingerprint,
      ];
      await supabase
        .from("student_progress")
        .update({ browser_fingerprints: updatedFps })
        .eq("student_pubkey", studentPubkey);
    }

    return { success: true, data: redemption };
  } catch (error) {
    return { success: false, error: "Failed to redeem reward" };
  }
}

/**
 * Main handler
 */
export const handler: Handler = async (event, context) => {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  try {
    // Rate limiting
    const clientId =
      event.headers["x-forwarded-for"] ||
      event.headers["client-ip"] ||
      "unknown";
    const rateLimitCheck = checkRateLimit(clientId);
    if (!rateLimitCheck.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          success: false,
          error: rateLimitCheck.reason,
        }),
      };
    }

    // Parse request
    const request: RewardRequest =
      event.httpMethod === "GET"
        ? {
            action: event.queryStringParameters?.action as any,
            studentPubkey: event.queryStringParameters?.studentPubkey || "",
            familyId: event.queryStringParameters?.familyId,
            rewardType: event.queryStringParameters?.rewardType,
          }
        : JSON.parse(event.body || "{}");

    if (!request.action || !request.studentPubkey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Missing required parameters",
        }),
      };
    }

    // Anti-gaming checks for redemption
    if (request.action === "redeem") {
      // Check rapid submissions
      const rapidCheck = await checkRapidSubmissions(request.studentPubkey);
      if (!rapidCheck.allowed) {
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({
            success: false,
            error: rapidCheck.reason,
          }),
        };
      }

      // Check time between actions
      const timeCheck = await checkTimeBetweenActions(request.studentPubkey);
      if (!timeCheck.allowed) {
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({
            success: false,
            error: timeCheck.reason,
          }),
        };
      }

      // Validate browser fingerprint
      if (request.browserFingerprint) {
        const fingerprintCheck = await validateBrowserFingerprint(
          request.studentPubkey,
          request.browserFingerprint
        );
        if (!fingerprintCheck.valid) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
              success: false,
              error: fingerprintCheck.reason,
            }),
          };
        }
      }
    }

    // Process request
    let response: RewardResponse;

    switch (request.action) {
      case "available":
        response = await getAvailableRewards(
          request.studentPubkey,
          request.familyId
        );
        break;

      case "history":
        response = await getStudentRedemptions(request.studentPubkey);
        break;

      case "redeem":
        if (!request.rewardType) {
          response = { success: false, error: "Reward type required" };
        } else {
          response = await redeemReward(
            request.studentPubkey,
            request.rewardType,
            request.guardianApproval,
            request.browserFingerprint
          );
        }
        break;

      default:
        response = { success: false, error: "Invalid action" };
    }

    return {
      statusCode: response.success ? 200 : 400,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Enhanced rewards API error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Internal server error",
      }),
    };
  }
};
