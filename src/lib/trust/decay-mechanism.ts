/**
 * Trust Decay Mechanism Service
 * Handles trust score decay for inactive users with grace periods and warnings
 */

import { createClient } from "@supabase/supabase-js";

export interface DecayResult {
  penalty: number;
  status: "active" | "warning" | "at_risk" | "critical";
  inactiveDays: number;
}

export interface DecayWarning {
  message: string;
  preventionActions: string[];
  urgency: "low" | "medium" | "high";
}

export class TrustDecayService {
  private supabase: ReturnType<typeof createClient>;

  constructor(supabaseClient: ReturnType<typeof createClient>) {
    this.supabase = supabaseClient;
  }

  async calculateDecay(userId: string): Promise<DecayResult> {
    const user = await this.getUser(userId);

    // Type guard for last_activity_at
    if (typeof user.last_activity_at !== "string") {
      return { penalty: 0, status: "active", inactiveDays: 0 };
    }

    const lastActivityMs =
      Date.now() - new Date(user.last_activity_at).getTime();
    const inactiveDays = lastActivityMs / (1000 * 60 * 60 * 24);

    // Decay schedule
    const decaySchedule = [
      { days: 30, penalty: 0, status: "active" as const },
      { days: 60, penalty: -5, status: "warning" as const },
      { days: 90, penalty: -10, status: "at_risk" as const },
      { days: 180, penalty: -15, status: "critical" as const },
    ];

    let penalty = 0;
    let status: "active" | "warning" | "at_risk" | "critical" = "active";
    for (const schedule of decaySchedule) {
      if (inactiveDays >= schedule.days) {
        penalty = schedule.penalty;
        status = schedule.status;
      }
    }

    return { penalty, status, inactiveDays };
  }

  async applyDecayIfNeeded(userId: string): Promise<void> {
    const decay = await this.calculateDecay(userId);

    if (decay.penalty < 0) {
      const currentScore = await this.getCurrentTrustScore(userId);
      const newScore = Math.max(currentScore + decay.penalty, 0);

      await this.supabase
        .from("user_identities")
        .update({ trust_score: newScore })
        .eq("id", userId);

      // Record decay in history
      await this.supabase.from("trust_history").insert({
        user_id: userId,
        trust_score_before: currentScore,
        trust_score_after: newScore,
        trust_delta: decay.penalty,
        reason: "decay",
        metadata: { inactiveDays: Math.floor(decay.inactiveDays) },
        recorded_at: new Date().toISOString(),
      });

      // Notify user if critical
      if (decay.status === "critical") {
        await this.sendDecayWarning(userId, decay);
      }
    }
  }

  async preventDecay(userId: string): Promise<void> {
    // Any activity prevents decay by updating last_activity_at
    await this.supabase
      .from("user_identities")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", userId);
  }

  async getDecayWarning(userId: string): Promise<DecayWarning | null> {
    const decay = await this.calculateDecay(userId);

    if (decay.status === "warning") {
      return {
        // FIX: Added Math.max(0, ...) to prevent negative day values
        message: `Your trust score will decay in ${Math.max(
          0,
          60 - Math.floor(decay.inactiveDays)
        )} days`,
        preventionActions: ["login", "send_message", "send_payment"],
        urgency: "low",
      };
    }

    if (decay.status === "at_risk") {
      return {
        // FIX: Added Math.max(0, ...) to prevent negative day values
        message: `Your trust score is at risk of decay. Take action within ${Math.max(
          0,
          90 - Math.floor(decay.inactiveDays)
        )} days`,
        preventionActions: ["login", "send_message", "send_payment"],
        urgency: "medium",
      };
    }

    if (decay.status === "critical") {
      return {
        message: `Your trust score will decay immediately. Take action now!`,
        preventionActions: ["login", "send_message", "send_payment"],
        urgency: "high",
      };
    }

    return null;
  }

  private async getUser(userId: string) {
    const { data: user } = await this.supabase
      .from("user_identities")
      .select("last_activity_at")
      .eq("id", userId)
      .single();

    if (!user) throw new Error("User not found");
    return user;
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

  private async sendDecayWarning(
    userId: string,
    decay: DecayResult
  ): Promise<void> {
    // TODO: Implement notification system (email, Nostr DM, etc.)
    console.log(`Decay warning for user ${userId}:`, decay);
  }
}
