/**
 * Feature Gate Service
 * Progressive feature disclosure based on trust, PoP, and UP scores
 */

import { createClient } from "@supabase/supabase-js";

export interface FeatureGateConfig {
  minTrust: number;
  minPop: number;
  minUp: number;
}

export interface FeatureRequirements {
  trustScore: { current: number; required: number };
  popScore: { current: number; required: number };
  upScore: { current: number; required: number };
}

export interface LockedFeature {
  featureName: string;
  requirements: FeatureRequirements;
  nextMilestone: number;
}

export const FEATURE_GATES: Record<string, FeatureGateConfig> = {
  // Basic features (trust: 0+)
  basic_messaging: { minTrust: 0, minPop: 0, minUp: 0 },
  view_contacts: { minTrust: 0, minPop: 0, minUp: 0 },

  // Intermediate features (trust: 25+)
  cashu_payments: { minTrust: 25, minPop: 25, minUp: 0 },
  create_lightning_address: { minTrust: 25, minPop: 25, minUp: 10 },

  // Advanced features (trust: 50+)
  lightning_payments: { minTrust: 50, minPop: 50, minUp: 30 },
  create_family_federation: { minTrust: 50, minPop: 50, minUp: 40 },

  // Guardian features (trust: 75+)
  guardian_role: { minTrust: 75, minPop: 75, minUp: 60 },
  approve_transactions: { minTrust: 75, minPop: 75, minUp: 60 },
  manage_federation: { minTrust: 75, minPop: 75, minUp: 60 },

  // Admin features (trust: 90+)
  admin_panel: { minTrust: 90, minPop: 90, minUp: 85 },
  manage_instances: { minTrust: 90, minPop: 90, minUp: 85 },
};

export class FeatureGateService {
  private supabase: ReturnType<typeof createClient>;

  constructor(supabaseClient: ReturnType<typeof createClient>) {
    this.supabase = supabaseClient;
  }

  async isFeatureAvailable(
    userId: string,
    featureName: string
  ): Promise<boolean> {
    const gate = FEATURE_GATES[featureName];
    if (!gate) return false;

    const user = await this.getUser(userId);
    const popScore = await this.calculatePopScore(userId);
    const upScore = await this.calculateUpScore(userId);

    // Type guards for scores
    const trustScore =
      typeof user.trust_score === "number" ? user.trust_score : 0;

    return (
      trustScore >= gate.minTrust &&
      popScore >= gate.minPop &&
      upScore >= gate.minUp
    );
  }

  async getLockedFeatures(userId: string): Promise<LockedFeature[]> {
    const user = await this.getUser(userId);
    const popScore = await this.calculatePopScore(userId);
    const upScore = await this.calculateUpScore(userId);

    // Type guard for trust_score
    const trustScore =
      typeof user.trust_score === "number" ? user.trust_score : 0;

    const locked: LockedFeature[] = [];
    for (const [featureName, gate] of Object.entries(FEATURE_GATES)) {
      const isAvailable =
        trustScore >= gate.minTrust &&
        popScore >= gate.minPop &&
        upScore >= gate.minUp;

      if (!isAvailable) {
        locked.push({
          featureName,
          requirements: {
            trustScore: { current: trustScore, required: gate.minTrust },
            popScore: { current: popScore, required: gate.minPop },
            upScore: { current: upScore, required: gate.minUp },
          },
          nextMilestone: this.getNextMilestone(trustScore, gate.minTrust),
        });
      }
    }

    return locked;
  }

  private async getUser(userId: string) {
    const { data: user } = await this.supabase
      .from("user_identities")
      .select("trust_score, pop_score, up_score")
      .eq("id", userId)
      .single();

    if (!user) throw new Error("User not found");
    return user;
  }

  private async calculatePopScore(userId: string): Promise<number> {
    const { data: user } = await this.supabase
      .from("user_identities")
      .select("pop_score")
      .eq("id", userId)
      .single();

    const score = user?.pop_score;
    return typeof score === "number" ? score : 0;
  }

  private async calculateUpScore(userId: string): Promise<number> {
    const { data: user } = await this.supabase
      .from("user_identities")
      .select("up_score")
      .eq("id", userId)
      .single();

    const score = user?.up_score;
    return typeof score === "number" ? score : 0;
  }

  private getNextMilestone(current: number, required: number): number {
    if (current >= required) return required;

    // Return the next milestone (25, 50, 75, 90)
    const milestones = [25, 50, 75, 90];
    for (const milestone of milestones) {
      if (current < milestone && milestone <= required) {
        return milestone;
      }
    }

    return required;
  }
}
