/*
 * IdentityShardingService
 * Scope: FROST threshold signature sharding for federated family nsec recovery ONLY (NOT individual users)
 * Federation-only operation. Individual users use self-sovereign recovery.
 */

import type { FederationRole } from "../../types/auth";
import { NobleEncryption } from "../crypto/noble-encryption";
import { CryptoUtils } from "../frost/crypto-utils";
import { FrostPolynomialManager } from "../frost/polynomial";
import { supabase } from "../supabase";

interface FederationInfo {
  role: FederationRole;
  federationId?: string | null;
}

export class IdentityShardingService {
  constructor(private client = supabase) {}

  private async getFederationInfo(userId: string): Promise<FederationInfo> {
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

  // Retrieve per-user salt for zero-knowledge encryption
  private async getUserSalt(userId: string): Promise<string> {
    const { data, error } = await (this.client as any)
      .from("user_identities")
      .select("user_salt")
      .eq("id", userId)
      .single();

    if (error || !data?.user_salt) {
      throw new Error(
        "Missing user_salt for encryption; ensure privacy-first migration is applied"
      );
    }
    return data.user_salt as string;
  }

  /**
   * Create identity shards using FROST primitives and store them under identity_shards.
   * RFC 9591 threshold validation: 1 ≤ t ≤ n
   */
  async createIdentityShards(
    userId: string,
    guardianIds: string[],
    threshold: number
  ): Promise<{ total: number; threshold: number }> {
    const info = await this.getFederationInfo(userId);
    this.ensureFederationUser(info, "createIdentityShards");

    if (!Array.isArray(guardianIds) || guardianIds.length === 0) {
      throw new Error("No guardians provided for sharding");
    }

    // RFC 9591 threshold validation
    if (threshold <= 0 || threshold > guardianIds.length) {
      throw new Error(
        `Invalid threshold: must be between 1 and ${guardianIds.length}`
      );
    }

    // Generate master secret securely (browser-compatible Web Crypto via CryptoUtils)
    const secretBytes = CryptoUtils.generateSecureRandom(32);
    const secretHex = CryptoUtils.bytesToHex(secretBytes);

    // Generate polynomial and shares
    const polynomial = await FrostPolynomialManager.generatePolynomial(
      secretHex,
      threshold
    );
    const shares = await FrostPolynomialManager.generateShares(
      polynomial,
      guardianIds.length
    );

    // Encrypt and persist shards using Noble V2 (compact format: noble-v2.salt.iv.cipher)
    const userSalt = await this.getUserSalt(userId);
    const rows = await Promise.all(
      shares.map(async (share, idx) => {
        const enc = await NobleEncryption.encrypt(String(share.y), userSalt);
        const compact = `${enc.version}.${enc.salt}.${enc.iv}.${enc.encrypted}`;
        return {
          user_id: userId,
          guardian_id: guardianIds[idx],
          shard_index: share.index ?? idx + 1,
          encrypted_shard: compact,
          shard_commitment: null,
          threshold: threshold,
          total_shards: guardianIds.length,
        };
      })
    );

    const { error: insErr } = await (this.client as any)
      .from("identity_shards")
      .insert(rows);

    if (insErr) {
      // eslint-disable-next-line no-console
      console.error("createIdentityShards insert error:", insErr);
      throw new Error("Failed to store identity shards");
    }

    return { total: guardianIds.length, threshold };
  }

  // Helper to decrypt stored shard for recovery workflows
  async decryptIdentityShard(
    userId: string,
    encryptedShard: string
  ): Promise<string> {
    const userSalt = await this.getUserSalt(userId);
    const parts = encryptedShard.split(".");
    if (parts.length !== 4 || parts[0] !== "noble-v2") {
      throw new Error(
        "Invalid encrypted shard format - expected noble-v2.salt.iv.encrypted"
      );
    }
    const [, salt, iv, ct] = parts;
    return NobleEncryption.decrypt(
      { version: "noble-v2", salt, iv, encrypted: ct },
      userSalt
    );
  }
}
