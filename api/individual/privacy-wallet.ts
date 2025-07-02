/**
 * Privacy-Enhanced Individual Wallet API
 * Handles individual wallet operations with privacy level support
 */

import { supabase } from "../../lib/supabase";
import { PrivacyLevel } from "../../src/types/privacy";
import {
  IndividualWalletWithPrivacy,
  PrivacyAPIError,
  TransactionWithPrivacy,
} from "../../types/privacy-api";
import { setCorsHeaders } from "../../utils/cors";

interface ApiRequest extends Request {
  body: any;
  method: string;
  query: any;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: any) => void;
}

/**
 * Privacy-Enhanced Individual Wallet Endpoint
 * GET /api/individual/privacy-wallet - Get wallet with privacy settings
 * POST /api/individual/privacy-wallet - Update privacy settings
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200);
  }

  try {
    const { memberId } = req.query;

    if (!memberId) {
      return res.status(400).json({
        error: "Member ID is required",
        code: "MISSING_MEMBER_ID",
      } as PrivacyAPIError);
    }

    if (req.method === "GET") {
      return await getIndividualWalletWithPrivacy(memberId, res);
    }

    if (req.method === "POST") {
      return await updateIndividualPrivacySettings(memberId, req.body, res);
    }

    return res.status(405).json({
      error: "Method not allowed",
      code: "METHOD_NOT_ALLOWED",
    } as PrivacyAPIError);
  } catch (error) {
    console.error("Individual privacy wallet error:", error);

    return res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      privacyImpact: "none",
    } as PrivacyAPIError);
  }
}

async function getIndividualWalletWithPrivacy(
  memberId: string,
  res: ApiResponse
): Promise<void> {
  try {
    // Get individual wallet data with privacy settings
    const { data: walletData, error: walletError } = await supabase
      .from("individual_wallets")
      .select(
        `
        *,
        privacy_settings,
        lightning_payments!inner(
          id,
          amount,
          fee,
          timestamp,
          status,
          privacy_level,
          privacy_routing_used,
          metadata_protection_level,
          memo,
          counterparty
        )
      `
      )
      .eq("member_id", memberId)
      .single();

    if (walletError) {
      return res.status(404).json({
        error: "Wallet not found",
        code: "WALLET_NOT_FOUND",
      } as PrivacyAPIError);
    }

    // Get recent transactions with privacy info
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select(
        `
        id,
        type,
        amount,
        fee,
        timestamp,
        status,
        privacy_level,
        privacy_routing_used,
        metadata_protection_level,
        memo,
        counterparty
      `
      )
      .eq("member_id", memberId)
      .order("timestamp", { ascending: false })
      .limit(50);

    if (txError) {
      console.error("Transaction fetch error:", txError);
    }

    // Transform to privacy-enhanced format
    const walletWithPrivacy: IndividualWalletWithPrivacy = {
      memberId: walletData.member_id,
      username: walletData.username,
      lightningAddress: walletData.lightning_address,
      lightningBalance: walletData.lightning_balance || 0,
      cashuBalance: walletData.cashu_balance || 0,
      fedimintBalance: walletData.fedimint_balance || 0,
      privacySettings: {
        defaultPrivacyLevel:
          walletData.privacy_settings?.defaultPrivacyLevel ||
          PrivacyLevel.GIFTWRAPPED,
        allowMinimalPrivacy:
          walletData.privacy_settings?.allowMinimalPrivacy || false,
        lnproxyEnabled: walletData.privacy_settings?.lnproxyEnabled || true,
        cashuPreferred: walletData.privacy_settings?.cashuPreferred || true,
        requireGuardianApproval:
          walletData.privacy_settings?.requireGuardianApproval || false,
      },
      spendingLimits: {
        daily: walletData.spending_limits?.daily || 100000,
        weekly: walletData.spending_limits?.weekly || 500000,
        requiresApproval:
          walletData.spending_limits?.requiresApproval || 1000000,
      },
      recentTransactions: (transactions || []).map(
        (tx) =>
          ({
            id: tx.id,
            type: tx.type,
            amount: tx.amount,
            fee: tx.fee,
            timestamp: tx.timestamp,
            status: tx.status,
            privacyLevel: tx.privacy_level || PrivacyLevel.GIFTWRAPPED,
            privacyRouting: tx.privacy_routing_used || false,
            metadataProtectionLevel: tx.metadata_protection_level || 100,
            memo: tx.memo,
            counterparty: tx.counterparty,
          } as TransactionWithPrivacy)
      ),
    };

    // Log privacy operation
    await logPrivacyAudit({
      userHash: `member_${memberId}`,
      operationType: "wallet_access",
      privacyLevel: walletWithPrivacy.privacySettings.defaultPrivacyLevel,
      metadataProtection: 100,
      operationDetails: {
        transactionCount: walletWithPrivacy.recentTransactions.length,
        privacySettingsAccessed: true,
      },
    });

    return res.status(200).json(walletWithPrivacy);
  } catch (error) {
    console.error("Get wallet with privacy error:", error);

    return res.status(500).json({
      error: "Failed to fetch wallet data",
      code: "FETCH_ERROR",
      privacyImpact: "metadata_leak",
    } as PrivacyAPIError);
  }
}

async function updateIndividualPrivacySettings(
  memberId: string,
  updateData: any,
  res: ApiResponse
): Promise<void> {
  try {
    const { privacySettings, spendingLimits } = updateData;

    // Validate privacy settings
    if (privacySettings) {
      const validPrivacyLevels = ["giftwrapped", "encrypted", "minimal"];
      if (
        privacySettings.defaultPrivacyLevel &&
        !validPrivacyLevels.includes(privacySettings.defaultPrivacyLevel)
      ) {
        return res.status(400).json({
          error: "Invalid privacy level",
          code: "INVALID_PRIVACY_LEVEL",
          suggestedPrivacyLevel: PrivacyLevel.GIFTWRAPPED,
        } as PrivacyAPIError);
      }
    }

    // Update privacy settings
    const { error: updateError } = await supabase
      .from("individual_wallets")
      .update({
        privacy_settings: privacySettings,
        spending_limits: spendingLimits,
        updated_at: new Date().toISOString(),
      })
      .eq("member_id", memberId);

    if (updateError) {
      return res.status(500).json({
        error: "Failed to update privacy settings",
        code: "UPDATE_ERROR",
      } as PrivacyAPIError);
    }

    // Log privacy operation
    await logPrivacyAudit({
      userHash: `member_${memberId}`,
      operationType: "privacy_settings_update",
      privacyLevel:
        privacySettings?.defaultPrivacyLevel || PrivacyLevel.GIFTWRAPPED,
      metadataProtection: 100,
      operationDetails: {
        settingsUpdated: privacySettings ? Object.keys(privacySettings) : [],
        limitsUpdated: spendingLimits ? Object.keys(spendingLimits) : [],
      },
    });

    return res.status(200).json({
      success: true,
      message: "Privacy settings updated successfully",
    });
  } catch (error) {
    console.error("Update privacy settings error:", error);

    return res.status(500).json({
      error: "Failed to update privacy settings",
      code: "UPDATE_ERROR",
      privacyImpact: "none",
    } as PrivacyAPIError);
  }
}

async function logPrivacyAudit(params: {
  userHash: string;
  operationType: string;
  privacyLevel: PrivacyLevel;
  metadataProtection: number;
  operationDetails: any;
}): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("log_privacy_operation", {
      p_user_hash: params.userHash,
      p_operation_type: params.operationType,
      p_privacy_level: params.privacyLevel,
      p_metadata_protection: params.metadataProtection,
      p_operation_details: params.operationDetails,
    });

    if (error) {
      console.error("Privacy audit logging error:", error);
    }
  } catch (error) {
    console.error("Privacy audit logging exception:", error);
  }
}
