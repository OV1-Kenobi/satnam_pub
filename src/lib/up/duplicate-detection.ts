/*
 * DuplicateDetectionService
 * Scope: Guardian consensus voting for duplicate federated family accounts ONLY (NOT individual users)
 * Federation-only operation. Individual users use self-sovereign recovery.
 */

import type { FederationRole } from "../../types/auth";
import { supabase } from "../supabase";

export interface DuplicateVerdict {
  isDuplicate: boolean;
  confidence: number; // 0..1
}

interface FederationInfo {
  role: FederationRole;
  federationId?: string | null;
}

export class DuplicateDetectionService {
  constructor(private client = supabase) {}

  private async getFederationInfo(userId: string): Promise<FederationInfo> {
    // Try user_identities first
    const { data: ident, error: identErr } = await (this.client as any)
      .from("user_identities")
      .select("role, family_federation_id")
      .eq("id", userId)
      .single();

    if (!identErr && ident) {
      const role: FederationRole = (ident.role as FederationRole) || "private";
      const federationId = ident.family_federation_id || null;
      return { role, federationId };
    }

    // Fallback to family_members mapping
    const { data: member } = await (this.client as any)
      .from("family_members")
      .select("family_federation_id, family_role")
      .eq("user_duid", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle?.();

    if (member) {
      const role: FederationRole =
        (member.family_role as FederationRole) || "private";
      return { role, federationId: member.family_federation_id };
    }

    return { role: "private", federationId: null };
  }

  private ensureFederationUser(info: FederationInfo, context: string): void {
    if (info.role === "private" || !info.federationId) {
      throw new Error(
        `${context}: Federation-only operation. Individual/private users must use self-sovereign recovery.`
      );
    }
  }

  /**
   * Create voting records for all guardians in the suspected user's federation.
   */
  async initiateDuplicateVote(
    suspectedUserId: string,
    originalUserId: string,
    evidence: string
  ): Promise<void> {
    const suspected = await this.getFederationInfo(suspectedUserId);
    const original = await this.getFederationInfo(originalUserId);

    this.ensureFederationUser(suspected, "initiateDuplicateVote");
    this.ensureFederationUser(original, "initiateDuplicateVote");

    // Gather guardians for the suspected user's federation
    const { data: guardians, error: guardErr } = await (this.client as any)
      .from("family_members")
      .select("user_duid")
      .eq("family_federation_id", suspected.federationId)
      .eq("family_role", "guardian")
      .eq("is_active", true);

    if (guardErr) {
      throw new Error("Failed to load guardians for federation");
    }

    const guardianIds: string[] = Array.isArray(guardians)
      ? guardians.map((g: any) => String(g.user_duid))
      : [];

    if (!guardianIds.length) return; // Nothing to insert

    // Insert abstain votes for each guardian (RLS enforced)
    const rows = guardianIds.map((gid) => ({
      suspected_duplicate_user_id: suspectedUserId,
      original_user_id: originalUserId,
      voting_guardian_id: gid,
      vote: "abstain",
      evidence,
    }));

    const { error: insErr } = await (this.client as any)
      .from("duplicate_detection_votes")
      .insert(rows);

    if (insErr) {
      // RLS or unique constraint may prevent duplicates; log and continue
      // eslint-disable-next-line no-console
      console.warn(
        "initiateDuplicateVote insert warning:",
        insErr?.message || insErr
      );
    }
  }

  /**
   * Null-safe consensus check with confidence computation.
   */
  async checkDuplicateConsensus(
    suspectedUserId: string,
    threshold: number = 3
  ): Promise<DuplicateVerdict> {
    const suspected = await this.getFederationInfo(suspectedUserId);
    this.ensureFederationUser(suspected, "checkDuplicateConsensus");

    const { data: votes, error } = await (this.client as any)
      .from("duplicate_detection_votes")
      .select("vote")
      .eq("suspected_duplicate_user_id", suspectedUserId);

    if (error) {
      // eslint-disable-next-line no-console
      console.error("checkDuplicateConsensus query error:", error);
      return { isDuplicate: false, confidence: 0 };
    }

    const castVotes = (votes || []).filter(
      (v: any) => v.vote === "duplicate" || v.vote === "not_duplicate"
    );
    const duplicateVotes =
      castVotes.filter((v: any) => v.vote === "duplicate").length || 0;
    const totalVotes = castVotes.length || 0;

    if (totalVotes === 0) {
      return { isDuplicate: false, confidence: 0 };
    }

    const isDuplicate = duplicateVotes >= threshold;
    const confidence = totalVotes > 0 ? duplicateVotes / totalVotes : 0;
    return { isDuplicate, confidence };
  }
}
