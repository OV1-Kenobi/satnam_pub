/**
 * Citadel Academy Reward System
 * Bitcoin-only reward system with anti-gaming protection
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("../supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};
import { generateBrowserFingerprint } from "../privacy/browser-fingerprint";

// Core Reward Types
export type RewardType =
  | "lightning-sats"
  | "family-credits"
  | "course-credits"
  | "achievement-nft"
  | "premium-access"
  | "mentorship-time"
  | "hardware-discount"
  | "conference-access"
  | "citadel-equity";

export interface RewardConfig {
  id: string;
  type: RewardType;
  name: string;
  description: string;
  value: number; // in satoshis or credits
  currency: "sats" | "ecash" | "fedimint" | "course_credits";
  privacy_level: "public" | "private" | "encrypted";
  max_redemptions: number;
  family_approval_required: boolean;
  expiry_days?: number;
  requirements: string[];
  anti_gaming_measures: AntiGamingMeasures;
  created_at: string;
  updated_at: string;
}

export interface AntiGamingMeasures {
  requires_verification: boolean;
  max_per_timeframe: number;
  timeframe: "hour" | "day" | "week" | "month";
  requires_real_interaction: boolean;
  minimum_study_time?: number; // minutes
  requires_course_progress?: boolean;
  requires_guardian_verification?: boolean;
  max_invitations_per_day?: number;
  invitation_cooldown_hours?: number;
  browser_fingerprint_required: boolean;
  rate_limiting_enabled: boolean;
  max_rapid_submissions: number;
  min_time_between_actions: number; // milliseconds
}

export interface RewardRedemption {
  id: string;
  student_pubkey: string;
  reward_type: RewardType;
  value: number;
  currency: "sats" | "ecash" | "fedimint" | "course_credits";
  status: "pending" | "approved" | "rejected" | "processed" | "expired";
  redemption_proof?: string;
  guardian_approval?: {
    guardian_pubkey: string;
    approved: boolean;
    reason?: string;
    timestamp: string;
  };
  created_at: number;
  processed_at?: number;
  expires_at?: number;
  privacy_encrypted: boolean;
  browser_fingerprint?: string;
  family_id?: string;
  course_id?: string;
  study_time_minutes?: number;
  invitation_quality_score?: number;
}

export interface CourseCreditReward extends RewardConfig {
  currency: "course_credits";
  course_id: string;
  credit_amount: number;
  requires_course_completion: boolean;
  anti_gaming_measures: AntiGamingMeasures & {
    requires_verification: true;
    requires_real_interaction: true;
    requires_course_progress: true;
    max_invitations_per_day: number;
    invitation_cooldown_hours: number;
  };
}

export interface StudentProgress {
  student_pubkey: string;
  completed_modules: string[];
  achievements: string[];
  total_study_time: number; // minutes
  last_activity: string;
  level: number;
  badges: string[];
  course_progress: Record<string, number>; // course_id -> progress percentage
  invitation_history: InvitationRecord[];
  browser_fingerprints: string[];
  created_at: string;
  updated_at: string;
}

export interface InvitationRecord {
  id: string;
  inviter_pubkey: string;
  invitee_pubkey: string;
  timestamp: number;
  accepted: boolean;
  quality_score: number;
  family_id?: string;
}

export interface AntiGamingValidation {
  is_valid: boolean;
  violations: string[];
  risk_score: number; // 0-100
  recommendations: string[];
}

/**
 * Reward System Service
 */
export class RewardSystemService {
  private static instance: RewardSystemService;

  private constructor() {}

  static getInstance(): RewardSystemService {
    if (!RewardSystemService.instance) {
      RewardSystemService.instance = new RewardSystemService();
    }
    return RewardSystemService.instance;
  }

  /**
   * Get available rewards for a student
   */
  async getAvailableRewards(
    studentPubkey: string,
    familyId?: string
  ): Promise<RewardConfig[]> {
    try {
      // Get student progress
      const progress = await this.getStudentProgress(studentPubkey);
      if (!progress) {
        return [];
      }

      // Get all reward configurations
      const { data: configs, error } = await supabase
        .from("reward_configs")
        .select("*")
        .eq("active", true);

      if (error || !configs) {
        return [];
      }

      // Filter rewards based on progress and anti-gaming measures
      const availableRewards: RewardConfig[] = [];

      for (const config of configs) {
        if (
          await this.checkRewardEligibility(
            config,
            progress,
            studentPubkey,
            familyId
          )
        ) {
          availableRewards.push(config);
        }
      }

      return availableRewards;
    } catch (error) {
      console.error("Error getting available rewards:", error);
      return [];
    }
  }

  /**
   * Check if student is eligible for a specific reward
   */
  private async checkRewardEligibility(
    config: RewardConfig,
    progress: StudentProgress,
    studentPubkey: string,
    familyId?: string
  ): Promise<boolean> {
    try {
      // Check basic requirements
      if (!this.checkBasicRequirements(config, progress)) {
        return false;
      }

      // Check anti-gaming measures
      const antiGamingValidation = await this.validateAntiGamingMeasures(
        config.anti_gaming_measures,
        studentPubkey,
        progress
      );

      if (!antiGamingValidation.is_valid) {
        return false;
      }

      // Check course-specific requirements
      if (config.currency === "course_credits") {
        const courseCreditConfig = config as CourseCreditReward;
        if (!this.checkCourseRequirements(courseCreditConfig, progress)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error("Error checking reward eligibility:", error);
      return false;
    }
  }

  /**
   * Check basic reward requirements
   */
  private checkBasicRequirements(
    config: RewardConfig,
    progress: StudentProgress
  ): boolean {
    // Check if student has completed required modules
    for (const requirement of config.requirements) {
      if (!progress.completed_modules.includes(requirement)) {
        return false;
      }
    }

    // Check study time requirements
    if (config.anti_gaming_measures.minimum_study_time) {
      if (
        progress.total_study_time <
        config.anti_gaming_measures.minimum_study_time
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check course-specific requirements
   */
  private checkCourseRequirements(
    config: CourseCreditReward,
    progress: StudentProgress
  ): boolean {
    // Check course progress
    if (config.requires_course_completion) {
      const courseProgress = progress.course_progress[config.course_id];
      if (!courseProgress || courseProgress < 100) {
        return false;
      }
    }

    // Check invitation quality
    if (config.anti_gaming_measures.max_invitations_per_day) {
      const todayInvitations = this.getTodayInvitations(
        progress.invitation_history
      );
      if (
        todayInvitations.length >=
        config.anti_gaming_measures.max_invitations_per_day
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate anti-gaming measures
   */
  private async validateAntiGamingMeasures(
    measures: AntiGamingMeasures,
    studentPubkey: string,
    progress: StudentProgress
  ): Promise<AntiGamingValidation> {
    const violations: string[] = [];
    let riskScore = 0;

    // Check rate limiting
    if (measures.rate_limiting_enabled) {
      const rateLimitCheck = await this.checkRateLimit(studentPubkey, measures);
      if (!rateLimitCheck.isValid) {
        violations.push(`Rate limit exceeded: ${rateLimitCheck.reason}`);
        riskScore += 30;
      }
    }

    // Check rapid submissions
    if (measures.max_rapid_submissions) {
      const rapidSubmissionCheck = await this.checkRapidSubmissions(
        studentPubkey,
        measures
      );
      if (!rapidSubmissionCheck.isValid) {
        violations.push(
          `Too many rapid submissions: ${rapidSubmissionCheck.reason}`
        );
        riskScore += 25;
      }
    }

    // Check time between actions
    if (measures.min_time_between_actions) {
      const timeCheck = await this.checkTimeBetweenActions(
        studentPubkey,
        measures
      );
      if (!timeCheck.isValid) {
        violations.push(`Actions too frequent: ${timeCheck.reason}`);
        riskScore += 20;
      }
    }

    // Check browser fingerprint consistency
    if (measures.browser_fingerprint_required) {
      const fingerprintCheck = await this.checkBrowserFingerprint(
        studentPubkey,
        progress
      );
      if (!fingerprintCheck.isValid) {
        violations.push(
          `Browser fingerprint inconsistency: ${fingerprintCheck.reason}`
        );
        riskScore += 15;
      }
    }

    // Check invitation patterns
    if (measures.max_invitations_per_day) {
      const invitationCheck = this.checkInvitationPatterns(progress, measures);
      if (!invitationCheck.isValid) {
        violations.push(
          `Suspicious invitation pattern: ${invitationCheck.reason}`
        );
        riskScore += 10;
      }
    }

    const isValid = violations.length === 0 && riskScore < 50;
    const recommendations = this.generateRecommendations(violations, riskScore);

    return {
      is_valid: isValid,
      violations,
      risk_score: riskScore,
      recommendations,
    };
  }

  /**
   * Check rate limiting
   */
  private async checkRateLimit(
    studentPubkey: string,
    measures: AntiGamingMeasures
  ): Promise<{ isValid: boolean; reason?: string }> {
    const timeframe = measures.timeframe;
    const maxPerTimeframe = measures.max_per_timeframe;

    // Get recent redemptions
    const { data: recentRedemptions, error } = await supabase
      .from("reward_redemptions")
      .select("created_at")
      .eq("student_pubkey", studentPubkey)
      .gte("created_at", this.getTimeframeStart(timeframe));

    if (error || !recentRedemptions) {
      return { isValid: true }; // Allow if we can't check
    }

    if (recentRedemptions.length >= maxPerTimeframe) {
      return {
        isValid: false,
        reason: `${recentRedemptions.length}/${maxPerTimeframe} redemptions in ${timeframe}`,
      };
    }

    return { isValid: true };
  }

  /**
   * Check rapid submissions
   */
  private async checkRapidSubmissions(
    studentPubkey: string,
    measures: AntiGamingMeasures
  ): Promise<{ isValid: boolean; reason?: string }> {
    const maxRapid = measures.max_rapid_submissions;
    const timeWindow = 5 * 60 * 1000; // 5 minutes

    // Get recent submissions
    const { data: recentSubmissions, error } = await supabase
      .from("reward_redemptions")
      .select("created_at")
      .eq("student_pubkey", studentPubkey)
      .gte("created_at", Date.now() - timeWindow);

    if (error || !recentSubmissions) {
      return { isValid: true };
    }

    if (recentSubmissions.length >= maxRapid) {
      return {
        isValid: false,
        reason: `${recentSubmissions.length} submissions in 5 minutes`,
      };
    }

    return { isValid: true };
  }

  /**
   * Check time between actions
   */
  private async checkTimeBetweenActions(
    studentPubkey: string,
    measures: AntiGamingMeasures
  ): Promise<{ isValid: boolean; reason?: string }> {
    const minTime = measures.min_time_between_actions;

    // Get last action
    const { data: lastAction, error } = await supabase
      .from("reward_redemptions")
      .select("created_at")
      .eq("student_pubkey", studentPubkey)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !lastAction) {
      return { isValid: true };
    }

    const timeSinceLastAction = Date.now() - lastAction.created_at;
    if (timeSinceLastAction < minTime) {
      return {
        isValid: false,
        reason: `${Math.round(minTime - timeSinceLastAction)}ms too soon`,
      };
    }

    return { isValid: true };
  }

  /**
   * Check browser fingerprint consistency
   */
  private async checkBrowserFingerprint(
    studentPubkey: string,
    progress: StudentProgress
  ): Promise<{ isValid: boolean; reason?: string }> {
    const currentFingerprint = await generateBrowserFingerprint();

    if (progress.browser_fingerprints.length === 0) {
      // First time user, add fingerprint
      progress.browser_fingerprints.push(currentFingerprint);
      await this.updateStudentProgress(progress);
      return { isValid: true };
    }

    // Check if current fingerprint matches any previous ones
    const hasMatchingFingerprint = progress.browser_fingerprints.some(
      (fp) => this.compareFingerprints(fp, currentFingerprint) > 0.8
    );

    if (!hasMatchingFingerprint) {
      return {
        isValid: false,
        reason: "Browser fingerprint changed significantly",
      };
    }

    return { isValid: true };
  }

  /**
   * Check invitation patterns
   */
  private checkInvitationPatterns(
    progress: StudentProgress,
    measures: AntiGamingMeasures
  ): { isValid: boolean; reason?: string } {
    const todayInvitations = this.getTodayInvitations(
      progress.invitation_history
    );

    // Check for circular invitations
    const circularInvitations = this.detectCircularInvitations(
      progress.invitation_history
    );
    if (circularInvitations.length > 0) {
      return {
        isValid: false,
        reason: "Circular invitation pattern detected",
      };
    }

    // Check invitation quality scores
    const lowQualityInvitations = todayInvitations.filter(
      (inv) => inv.quality_score < 0.5
    );
    if (lowQualityInvitations.length > 2) {
      return {
        isValid: false,
        reason: "Too many low-quality invitations",
      };
    }

    return { isValid: true };
  }

  /**
   * Get today's invitations
   */
  private getTodayInvitations(
    invitationHistory: InvitationRecord[]
  ): InvitationRecord[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    return invitationHistory.filter((inv) => inv.timestamp >= todayStart);
  }

  /**
   * Detect circular invitations
   */
  private detectCircularInvitations(
    invitationHistory: InvitationRecord[]
  ): InvitationRecord[] {
    const circular: InvitationRecord[] = [];
    const invitationMap = new Map<string, string[]>();

    // Build invitation graph
    for (const inv of invitationHistory) {
      if (!invitationMap.has(inv.inviter_pubkey)) {
        invitationMap.set(inv.inviter_pubkey, []);
      }
      invitationMap.get(inv.inviter_pubkey)!.push(inv.invitee_pubkey);
    }

    // Detect cycles
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const [inviter, invitees] of invitationMap) {
      if (!visited.has(inviter)) {
        if (this.hasCycle(inviter, invitationMap, visited, recursionStack)) {
          // Find the circular invitations
          const circularInvitations = invitationHistory.filter(
            (inv) =>
              inv.inviter_pubkey === inviter ||
              invitees.includes(inv.invitee_pubkey)
          );
          circular.push(...circularInvitations);
        }
      }
    }

    return circular;
  }

  /**
   * Check for cycles in invitation graph
   */
  private hasCycle(
    node: string,
    graph: Map<string, string[]>,
    visited: Set<string>,
    recursionStack: Set<string>
  ): boolean {
    visited.add(node);
    recursionStack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (this.hasCycle(neighbor, graph, visited, recursionStack)) {
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(node);
    return false;
  }

  /**
   * Compare browser fingerprints
   */
  private compareFingerprints(fp1: string, fp2: string): number {
    // Simple similarity check - in production, use more sophisticated comparison
    const similarity = fp1 === fp2 ? 1.0 : 0.0;
    return similarity;
  }

  /**
   * Generate recommendations based on violations
   */
  private generateRecommendations(
    violations: string[],
    riskScore: number
  ): string[] {
    const recommendations: string[] = [];

    if (riskScore > 30) {
      recommendations.push("Account flagged for manual review");
    }

    if (violations.some((v) => v.includes("rapid"))) {
      recommendations.push("Slow down your actions - wait between submissions");
    }

    if (violations.some((v) => v.includes("fingerprint"))) {
      recommendations.push("Use the same browser and device consistently");
    }

    if (violations.some((v) => v.includes("invitation"))) {
      recommendations.push("Focus on quality invitations rather than quantity");
    }

    return recommendations;
  }

  /**
   * Get timeframe start timestamp
   */
  private getTimeframeStart(timeframe: string): number {
    const now = Date.now();
    switch (timeframe) {
      case "hour":
        return now - 60 * 60 * 1000;
      case "day":
        return now - 24 * 60 * 60 * 1000;
      case "week":
        return now - 7 * 24 * 60 * 60 * 1000;
      case "month":
        return now - 30 * 24 * 60 * 60 * 1000;
      default:
        return now - 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Get student progress
   */
  async getStudentProgress(
    studentPubkey: string
  ): Promise<StudentProgress | null> {
    try {
      const { data, error } = await supabase
        .from("student_progress")
        .select("*")
        .eq("student_pubkey", studentPubkey)
        .single();

      if (error || !data) {
        return null;
      }

      return data as StudentProgress;
    } catch (error) {
      console.error("Error getting student progress:", error);
      return null;
    }
  }

  /**
   * Update student progress
   */
  private async updateStudentProgress(
    progress: StudentProgress
  ): Promise<void> {
    try {
      await (await getSupabaseClient())
        .from("student_progress")
        .upsert([progress]);
    } catch (error) {
      console.error("Error updating student progress:", error);
    }
  }

  /**
   * Get student redemptions
   */
  async getStudentRedemptions(
    studentPubkey: string
  ): Promise<RewardRedemption[]> {
    try {
      const { data, error } = await supabase
        .from("reward_redemptions")
        .select("*")
        .eq("student_pubkey", studentPubkey)
        .order("created_at", { ascending: false });

      if (error || !data) {
        return [];
      }

      return data as RewardRedemption[];
    } catch (error) {
      console.error("Error getting student redemptions:", error);
      return [];
    }
  }

  /**
   * Redeem a reward
   */
  async redeemReward(
    studentPubkey: string,
    rewardType: RewardType,
    guardianApproval?: boolean
  ): Promise<RewardRedemption | null> {
    try {
      // Get reward configuration
      const { data: config, error: configError } = await supabase
        .from("reward_configs")
        .select("*")
        .eq("type", rewardType)
        .eq("active", true)
        .single();

      if (configError || !config) {
        throw new Error("Reward configuration not found");
      }

      // Validate eligibility
      const progress = await this.getStudentProgress(studentPubkey);
      if (!progress) {
        throw new Error("Student progress not found");
      }

      const isEligible = await this.checkRewardEligibility(
        config,
        progress,
        studentPubkey
      );
      if (!isEligible) {
        throw new Error("Not eligible for this reward");
      }

      // Create redemption record
      const redemption: RewardRedemption = {
        id: crypto.randomUUID(),
        student_pubkey: studentPubkey,
        reward_type: rewardType,
        value: config.value,
        currency: config.currency,
        status: "pending",
        created_at: Date.now(),
        privacy_encrypted: config.privacy_level === "encrypted",
        browser_fingerprint: await generateBrowserFingerprint(),
        course_id:
          config.currency === "course_credits"
            ? (config as CourseCreditReward).course_id
            : undefined,
        study_time_minutes: progress.total_study_time,
      };

      // Check if approval is required
      if (config.family_approval_required && !guardianApproval) {
        redemption.status = "pending";
      } else {
        redemption.status = "approved";
        redemption.processed_at = Date.now();
      }

      // Save redemption
      const { error: saveError } = await supabase
        .from("reward_redemptions")
        .insert([redemption]);

      if (saveError) {
        throw new Error("Failed to save redemption");
      }

      return redemption;
    } catch (error) {
      console.error("Error redeeming reward:", error);
      return null;
    }
  }

  /**
   * Get reward configuration
   */
  getRewardConfig(rewardType: RewardType): RewardConfig | null {
    // This would typically fetch from database
    // For now, return null
    return null;
  }

  /**
   * Update reward configuration (admin only)
   */
  updateRewardConfig(
    rewardType: RewardType,
    updates: Record<string, unknown>
  ): void {
    // Implementation for admin updates
    console.log(`Updating reward config for ${rewardType}:`, updates);
  }
}

// Export singleton instance
export const rewardSystem = RewardSystemService.getInstance();
