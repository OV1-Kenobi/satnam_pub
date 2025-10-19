/**
 * Time-Based Trust Escalation Service
 * Implements progressive trust increases based on account age, activity frequency, and success rate
 */

import { createClient } from "@supabase/supabase-js";

export const TRUST_CHECKPOINTS = [
  { days: 7, name: "week_one", trustBonus: 5 },
  { days: 30, name: "month_one", trustBonus: 15 },
  { days: 90, name: "quarter_one", trustBonus: 25 },
  { days: 180, name: "half_year", trustBonus: 35 },
  { days: 365, name: "year_one", trustBonus: 50 },
];

export interface CheckpointReached {
  checkpoint: string;
  trustBonus: number;
  reachedAt: Date;
}

export interface UserMetrics {
  createdAt: Date;
  actionsLast30Days: number;
  successfulTransactions: number;
  totalTransactions: number;
}

export class TimeBasedEscalationService {
  private supabase: ReturnType<typeof createClient>;

  constructor(supabaseClient: ReturnType<typeof createClient>) {
    this.supabase = supabaseClient;
  }

  async calculateTrustDelta(userId: string): Promise<number> {
    const metrics = await this.getUserMetrics(userId);

    // Account age factor (0-100)
    const accountAgeDays = Math.floor(
      (Date.now() - metrics.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    const ageFactorMax = Math.min(accountAgeDays / 365, 1); // Cap at 1 year
    const ageFactor = ageFactorMax * 100;

    // Activity frequency factor (0-100)
    const activityCount = metrics.actionsLast30Days;
    const activityFactor = Math.min((activityCount / 30) * 100, 100); // 1 action/day = 100

    // Success rate factor (0-100)
    // FIX: Added zero-check to prevent division by zero for new users with no transactions
    const successRate =
      metrics.totalTransactions > 0
        ? metrics.successfulTransactions / metrics.totalTransactions
        : 0;
    const successFactor = successRate * 100;

    // Calculate delta
    const delta =
      ageFactor * 0.4 + activityFactor * 0.35 + successFactor * 0.25;

    return Math.min(delta, 100);
  }

  async checkCheckpoints(userId: string): Promise<CheckpointReached[]> {
    const user = await this.getUser(userId);

    // Type guard for created_at
    if (typeof user.created_at !== "string") {
      return [];
    }

    const accountAgeDays = Math.floor(
      (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    const reached: CheckpointReached[] = [];
    for (const checkpoint of TRUST_CHECKPOINTS) {
      if (accountAgeDays >= checkpoint.days) {
        const alreadyRewarded = await this.checkpointAlreadyRewarded(
          userId,
          checkpoint.name
        );
        if (!alreadyRewarded) {
          reached.push({
            checkpoint: checkpoint.name,
            trustBonus: checkpoint.trustBonus,
            reachedAt: new Date(),
          });
          await this.recordCheckpointReward(userId, checkpoint.name);
        }
      }
    }

    return reached;
  }

  private async getUserMetrics(userId: string): Promise<UserMetrics> {
    const { data: user } = await this.supabase
      .from("user_identities")
      .select("created_at")
      .eq("id", userId)
      .single();

    if (!user) throw new Error("User not found");

    // Type guard for created_at
    if (typeof user.created_at !== "string") {
      throw new Error("Invalid user created_at");
    }

    // Get actions in last 30 days
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    const { data: actions } = await this.supabase
      .from("reputation_actions")
      .select("id")
      .eq("user_id", userId)
      .gte("recorded_at", thirtyDaysAgo);

    // Get transaction metrics (placeholder - integrate with actual payment system)
    const successfulTransactions = 0;
    const totalTransactions = 0;

    return {
      createdAt: new Date(user.created_at),
      actionsLast30Days: actions?.length || 0,
      successfulTransactions,
      totalTransactions,
    };
  }

  private async getUser(userId: string) {
    const { data: user } = await this.supabase
      .from("user_identities")
      .select("created_at")
      .eq("id", userId)
      .single();

    if (!user) throw new Error("User not found");
    return user;
  }

  private async checkpointAlreadyRewarded(
    userId: string,
    checkpointName: string
  ): Promise<boolean> {
    const { data } = await this.supabase
      .from("trust_history")
      .select("id")
      .eq("user_id", userId)
      .eq("checkpoint_name", checkpointName)
      .eq("reason", "checkpoint")
      .limit(1);

    return (data?.length || 0) > 0;
  }

  private async recordCheckpointReward(
    userId: string,
    checkpointName: string
  ): Promise<void> {
    const checkpoint = TRUST_CHECKPOINTS.find((c) => c.name === checkpointName);
    if (!checkpoint) throw new Error(`Unknown checkpoint: ${checkpointName}`);

    const currentScore = await this.getCurrentTrustScore(userId);
    const newScore = Math.min(currentScore + checkpoint.trustBonus, 100);

    await this.supabase.from("trust_history").insert({
      user_id: userId,
      trust_score_before: currentScore,
      trust_score_after: newScore,
      trust_delta: checkpoint.trustBonus,
      reason: "checkpoint",
      checkpoint_name: checkpointName,
      recorded_at: new Date().toISOString(),
    });

    await this.supabase
      .from("user_identities")
      .update({ trust_score: newScore })
      .eq("id", userId);
  }

  private async getCurrentTrustScore(userId: string): Promise<number> {
    const { data: user } = await this.supabase
      .from("user_identities")
      .select("trust_score")
      .eq("id", userId)
      .single();

    const score = user?.trust_score;
    return typeof score === "number" ? score : 0;
  }
}
