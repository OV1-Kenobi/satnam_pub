/**
 * Decay Exemption Service
 * Manages exemptions from trust decay for certain user categories
 */

import { createClient } from "@supabase/supabase-js";
import { DecayWarning, TrustDecayService } from "./decay-mechanism";

export class DecayExemptionService {
  private supabase: ReturnType<typeof createClient>;
  private decayService: TrustDecayService;

  constructor(supabaseClient: ReturnType<typeof createClient>) {
    this.supabase = supabaseClient;
    this.decayService = new TrustDecayService(supabaseClient);
  }

  async isExemptFromDecay(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);

    // Type guard for created_at
    const createdAt =
      typeof user.created_at === "string" ? new Date(user.created_at) : null;

    // Exemptions
    const exemptions = [
      // New accounts (< 30 days)
      createdAt
        ? createdAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        : false,

      // Guardian role (trusted users)
      user.role === "guardian",

      // Active federation members
      await this.isActiveFederationMember(userId),

      // Recent large transaction
      await this.hasRecentLargeTransaction(userId),
    ];

    return exemptions.some((e) => e);
  }

  async getDecayWarning(userId: string): Promise<DecayWarning | null> {
    const isExempt = await this.isExemptFromDecay(userId);
    if (isExempt) return null;

    return this.decayService.getDecayWarning(userId);
  }

  private async getUser(userId: string) {
    const { data: user } = await this.supabase
      .from("user_identities")
      .select("created_at, role")
      .eq("id", userId)
      .single();

    if (!user) throw new Error("User not found");
    return user;
  }

  private async isActiveFederationMember(userId: string): Promise<boolean> {
    const { data: memberships } = await this.supabase
      .from("family_members")
      .select("id")
      .eq("user_duid", userId)
      .eq("is_active", true)
      .limit(1);

    return (memberships?.length || 0) > 0;
  }

  private async hasRecentLargeTransaction(userId: string): Promise<boolean> {
    // Check for transactions in the last 30 days
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    // TODO: Integrate with actual payment system
    // For now, return false as placeholder
    return false;
  }
}
