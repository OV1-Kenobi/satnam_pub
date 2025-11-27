/**
 * Action-Based Reputation Service
 * Tracks user actions and calculates reputation scores with exponential decay
 */

import { createClient } from "@supabase/supabase-js";

export const ACTION_WEIGHTS = {
  // Payments
  lightning_payment_sent: { weight: 5, category: "payment" },
  lightning_payment_received: { weight: 3, category: "payment" },
  cashu_payment_sent: { weight: 4, category: "payment" },
  fedimint_payment_sent: { weight: 6, category: "payment" },

  // Social
  peer_attestation_given: { weight: 10, category: "social" },
  peer_attestation_received: { weight: 8, category: "social" },
  nfc_peer_scan: { weight: 4, category: "social" },

  // Guardian
  guardian_approval_given: { weight: 20, category: "governance" },
  guardian_approval_received: { weight: 15, category: "governance" },
  federation_created: { weight: 25, category: "governance" },

  // Engagement
  message_sent: { weight: 1, category: "engagement" },
  contact_added: { weight: 2, category: "engagement" },
  profile_updated: { weight: 3, category: "engagement" },

  // Phase 3: Geo-Room Contacts & Physical MFA
  geo_contact_added: { weight: 3, category: "social" },
  contact_verified_via_physical_mfa: { weight: 15, category: "social" },
};

export class ActionReputationService {
  private supabase: ReturnType<typeof createClient>;

  constructor(supabaseClient: ReturnType<typeof createClient>) {
    this.supabase = supabaseClient;
  }

  async recordAction(
    userId: string,
    actionType: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const weight = ACTION_WEIGHTS[actionType as keyof typeof ACTION_WEIGHTS];
    if (!weight) throw new Error(`Unknown action type: ${actionType}`);

    // 1. Record action
    await this.supabase.from("reputation_actions").insert({
      user_id: userId,
      action_type: actionType,
      weight: weight.weight,
      category: weight.category,
      metadata,
      recorded_at: new Date().toISOString(),
    });

    // 2. Update reputation score
    const newScore = await this.calculateReputationScore(userId);
    await this.supabase
      .from("user_identities")
      .update({ reputation_score: newScore })
      .eq("id", userId);

    // 3. Check for trust escalation
    const escalation = await this.checkTrustEscalation(userId);
    if (escalation) {
      await this.applyTrustEscalation(userId, escalation);
    }
  }

  async calculateReputationScore(userId: string): Promise<number> {
    const actions = await this.supabase
      .from("reputation_actions")
      .select("weight, recorded_at")
      .eq("user_id", userId)
      .gte(
        "recorded_at",
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      );

    let score = 0;
    for (const action of actions.data || []) {
      // Type guard for recorded_at
      if (typeof action.recorded_at !== "string") continue;

      // Type guard for weight
      if (typeof action.weight !== "number") continue;

      // Apply decay based on age
      const ageMs = Date.now() - new Date(action.recorded_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const decayFactor = Math.exp(-ageDays / 30); // Exponential decay over 30 days
      score += action.weight * decayFactor;
    }

    return Math.min(Math.floor(score), 100);
  }

  private async checkTrustEscalation(userId: string): Promise<number | null> {
    const currentScore = await this.getCurrentReputationScore(userId);

    // Check if reputation score crossed a threshold
    const thresholds = [25, 50, 75];
    for (const threshold of thresholds) {
      if (currentScore >= threshold) {
        const alreadyRecorded = await this.checkEscalationRecorded(
          userId,
          threshold
        );
        if (!alreadyRecorded) {
          return threshold;
        }
      }
    }

    return null;
  }

  private async applyTrustEscalation(
    userId: string,
    threshold: number
  ): Promise<void> {
    const trustBonus = threshold === 25 ? 10 : threshold === 50 ? 20 : 30;
    const currentTrust = await this.getCurrentTrustScore(userId);
    const newTrust = Math.min(currentTrust + trustBonus, 100);

    await this.supabase.from("trust_history").insert({
      user_id: userId,
      trust_score_before: currentTrust,
      trust_score_after: newTrust,
      trust_delta: trustBonus,
      reason: "action",
      metadata: { reputation_threshold: threshold },
      recorded_at: new Date().toISOString(),
    });

    await this.supabase
      .from("user_identities")
      .update({ trust_score: newTrust })
      .eq("id", userId);
  }

  private async getCurrentReputationScore(userId: string): Promise<number> {
    const { data: user } = await this.supabase
      .from("user_identities")
      .select("reputation_score")
      .eq("id", userId)
      .single();

    const score = user?.reputation_score;
    return typeof score === "number" ? score : 0;
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

  private async checkEscalationRecorded(
    userId: string,
    threshold: number
  ): Promise<boolean> {
    const { data } = await this.supabase
      .from("trust_history")
      .select("id")
      .eq("user_id", userId)
      .eq("reason", "action")
      .contains("metadata", { reputation_threshold: threshold })
      .limit(1);

    return (data?.length || 0) > 0;
  }
}
