/**
 * Family Wallet API Service
 *
 * Provides client-side API functions for interacting with family federation wallets
 * with RBAC and FROST multi-signature support.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Role-based access control (steward/guardian for spending)
 * - FROST multi-signature transaction workflows
 * - Privacy-first architecture with family isolation
 * - JWT authentication with family membership validation
 */

import type { FederationRole } from "../types/permissions";

// Environment variable access for browser compatibility
function getEnvVar(key: string): string | undefined {
  return process.env[key];
}

const API_BASE = getEnvVar("VITE_API_BASE_URL") || "/api";

// Types for family wallet data
export interface FamilyWalletData {
  family_id: string;
  balance?: number; // Only visible to stewards/guardians
  available_balance?: number;
  pending_transactions: FrostTransaction[];
  transaction_history: Transaction[];
  spending_limits: SpendingLimits;
  frost_config: FrostConfig;
  user_role: string;
  permissions: {
    can_view_balance: boolean;
    can_spend: boolean;
    can_view_history: boolean;
    can_view_guardian_consensus?: boolean;
  };
}

export interface FrostTransaction {
  id: string;
  type: string;
  amount: number;
  status:
    | "pending_signatures"
    | "threshold_met"
    | "completed"
    | "failed"
    | "expired";
  required_signatures: number;
  current_signatures: number;
  created_at: string;
  description: string;
  signature_deadline?: string;
}

export interface Transaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  created_at: string;
  description: string;
  signatures_required?: number;
  signatures_received?: number;
}

export interface SpendingLimits {
  daily_limit: number;
  weekly_limit: number;
  requires_threshold_approval: number;
}

export interface FrostConfig {
  threshold: number;
  total_guardians: number;
  active_guardians: number;
}

export interface FrostTransactionRequest {
  amount: number;
  recipient: string;
  description: string;
  type?: string;
  payment_hash?: string;
  invoice?: string;
  note_denominations?: number[];
}

/**
 * Get JWT token from secure authentication context
 * Integrates with SecureTokenManager to avoid XSS vulnerabilities
 */
async function getAuthToken(): Promise<string | null> {
  try {
    // Dynamic import to prevent circular dependencies and ensure lazy loading
    const { SecureTokenManager } = await import(
      "../lib/auth/secure-token-manager"
    );
    const accessToken = SecureTokenManager.getAccessToken();

    if (!accessToken) {
      console.warn(
        "🔒 No valid JWT token available - user may need to re-authenticate"
      );
      return null;
    }

    return accessToken;
  } catch (error) {
    console.error(
      "🔒 Failed to retrieve JWT token from SecureTokenManager:",
      error
    );
    return null;
  }
}

/**
 * Make authenticated API request with timeout and error handling
 * @param endpoint - API endpoint path
 * @param options - Fetch options
 * @param timeoutMs - Request timeout in milliseconds (default: 30 seconds)
 * @param retryAttempts - Number of retry attempts for transient failures (default: 2)
 * @returns Promise resolving to Response object
 */
async function makeAuthenticatedRequest(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = 30000,
  retryAttempts: number = 2
): Promise<Response> {
  const token = await getAuthToken();

  const headers = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  // Implement AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const requestOptions: RequestInit = {
    ...options,
    headers,
    signal: controller.signal,
  };

  let lastError: Error | null = null;

  // Retry logic for transient failures
  for (let attempt = 0; attempt <= retryAttempts; attempt++) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, requestOptions);

      // Check for specific error conditions that shouldn't be retried
      if (
        response.status === 401 ||
        response.status === 403 ||
        response.status === 404
      ) {
        clearTimeout(timeoutId);
        return response; // Don't retry authentication or not found errors
      }

      // Return successful responses or client errors (4xx) that shouldn't be retried
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        clearTimeout(timeoutId);
        return response;
      }

      // Server errors (5xx) - retry if we have attempts left
      if (attempt < retryAttempts) {
        console.warn(
          `🔄 Request failed with status ${
            response.status
          }, retrying... (attempt ${attempt + 1}/${retryAttempts + 1})`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        ); // Exponential backoff
        continue;
      }

      clearTimeout(timeoutId);
      return response; // Return the failed response on final attempt
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error as Error;

      // Handle specific error types
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(`Request timeout after ${timeoutMs}ms`);
        }

        // Network errors - retry if we have attempts left
        if (
          attempt < retryAttempts &&
          (error.message.includes("fetch") ||
            error.message.includes("network") ||
            error.message.includes("Failed to fetch"))
        ) {
          console.warn(
            `🔄 Network error, retrying... (attempt ${attempt + 1}/${
              retryAttempts + 1
            }): ${error.message}`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000)
          ); // Exponential backoff
          continue;
        }
      }

      // Re-throw error on final attempt or non-retryable errors
      if (attempt === retryAttempts) {
        throw lastError || error;
      }
    }
  }

  // This should never be reached, but included for type safety
  throw lastError || new Error("Request failed after all retry attempts");
}

/**
 * Generic function to fetch family wallet data
 * @param walletType - Type of wallet (cashu, lightning, fedimint)
 * @param familyId - Family federation ID
 * @param userHash - User's hashed UUID
 * @returns Promise resolving to family wallet data
 */
async function getFamilyWallet(
  walletType: "cashu" | "lightning" | "fedimint",
  familyId: string,
  userHash: string
): Promise<FamilyWalletData> {
  try {
    const response = await makeAuthenticatedRequest(
      `/family/${walletType}/wallet`,
      {
        method: "POST",
        body: JSON.stringify({ familyId, userHash }),
      }
    );

    if (!response.ok) {
      let errorMessage = `Failed to fetch family ${walletType} wallet`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (parseError) {
        console.warn("Failed to parse error response JSON, using status text");
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error(`Error fetching family ${walletType} wallet:`, error);
    throw error;
  }
}

/**
 * Get Family Cashu Wallet Data
 * @param familyId - Family federation ID
 * @param userHash - User's hashed UUID
 * @returns Promise resolving to family Cashu wallet data
 */
export async function getFamilyCashuWallet(
  familyId: string,
  userHash: string
): Promise<FamilyWalletData> {
  return getFamilyWallet("cashu", familyId, userHash);
}

/**
 * Get Family Lightning Wallet Data
 * @param familyId - Family federation ID
 * @param userHash - User's hashed UUID
 * @returns Promise resolving to family Lightning wallet data
 */
export async function getFamilyLightningWallet(
  familyId: string,
  userHash: string
): Promise<FamilyWalletData> {
  return getFamilyWallet("lightning", familyId, userHash);
}

/**
 * Get Family Fedimint Wallet Data
 * @param familyId - Family federation ID
 * @param userHash - User's hashed UUID
 * @returns Promise resolving to family Fedimint wallet data
 */
export async function getFamilyFedimintWallet(
  familyId: string,
  userHash: string
): Promise<FamilyWalletData> {
  return getFamilyWallet("fedimint", familyId, userHash);
}

/**
 * Initiate FROST Multi-Signature Transaction
 * @param familyId - Family federation ID
 * @param userHash - User's hashed UUID
 * @param walletType - Type of wallet (cashu, lightning, fedimint)
 * @param transaction - Transaction details
 * @returns Promise resolving to transaction initiation result
 */
export async function initiateFrostTransaction(
  familyId: string,
  userHash: string,
  walletType: "cashu" | "lightning" | "fedimint",
  transaction: FrostTransactionRequest
): Promise<{
  success: boolean;
  transaction_id: string;
  status: string;
  required_signatures: number;
  current_signatures: number;
  signature_deadline: string;
}> {
  try {
    const endpoint = `/family/${walletType}/wallet`;
    const operation =
      walletType === "lightning"
        ? "initiate_lightning_payment"
        : walletType === "fedimint"
        ? "initiate_fedimint_transaction"
        : "initiate_spending";

    const response = await makeAuthenticatedRequest(endpoint, {
      method: "POST",
      body: JSON.stringify({
        familyId,
        userHash,
        operation,
        transaction,
      }),
    });

    if (!response.ok) {
      let errorMessage = "Failed to initiate FROST transaction";
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (parseError) {
        console.warn("Failed to parse error response JSON, using status text");
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error("Error initiating FROST transaction:", error);
    throw error;
  }
}

/**
 * Get All Family Wallet Data with partial failure handling
 * @param familyId - Family federation ID
 * @param userHash - User's hashed UUID
 * @returns Promise resolving to combined wallet data (handles partial failures gracefully)
 */
export async function getAllFamilyWalletData(
  familyId: string,
  userHash: string
): Promise<{
  cashu: FamilyWalletData | null;
  lightning: FamilyWalletData | null;
  fedimint: FamilyWalletData | null;
  totalBalance: number;
  userRole: FederationRole;
  permissions: {
    can_view_balance: boolean;
    can_spend: boolean;
    can_view_history: boolean;
  };
  errors: string[];
  availableWallets: string[];
}> {
  try {
    // Use Promise.allSettled to handle partial failures
    const results = await Promise.allSettled([
      getFamilyCashuWallet(familyId, userHash),
      getFamilyLightningWallet(familyId, userHash),
      getFamilyFedimintWallet(familyId, userHash),
    ]);

    // Extract successful results and log failures
    const cashuData =
      results[0].status === "fulfilled" ? results[0].value : null;
    const lightningData =
      results[1].status === "fulfilled" ? results[1].value : null;
    const fedimintData =
      results[2].status === "fulfilled" ? results[2].value : null;

    // Collect errors for debugging
    const errors: string[] = [];
    const availableWallets: string[] = [];

    if (results[0].status === "rejected") {
      errors.push(`Cashu wallet: ${results[0].reason.message}`);
      console.error("❌ Failed to fetch Cashu wallet:", results[0].reason);
    } else {
      availableWallets.push("cashu");
    }

    if (results[1].status === "rejected") {
      errors.push(`Lightning wallet: ${results[1].reason.message}`);
      console.error("❌ Failed to fetch Lightning wallet:", results[1].reason);
    } else {
      availableWallets.push("lightning");
    }

    if (results[2].status === "rejected") {
      errors.push(`Fedimint wallet: ${results[2].reason.message}`);
      console.error("❌ Failed to fetch Fedimint wallet:", results[2].reason);
    } else {
      availableWallets.push("fedimint");
    }

    // Find the first available wallet for permissions and role
    const availableWallet = cashuData || lightningData || fedimintData;

    if (!availableWallet) {
      throw new Error("All wallet fetches failed - no wallet data available");
    }

    // Safe access to permissions
    const canViewBalance =
      availableWallet?.permissions?.can_view_balance || false;
    const totalBalance = canViewBalance
      ? (cashuData?.balance || 0) +
        (lightningData?.balance || 0) +
        (fedimintData?.balance || 0)
      : 0;

    console.log(
      `✅ Successfully fetched ${
        availableWallets.length
      }/3 family wallets: ${availableWallets.join(", ")}`
    );

    if (errors.length > 0) {
      console.warn(`⚠️ Partial wallet fetch failures: ${errors.length} errors`);
    }

    return {
      cashu: cashuData,
      lightning: lightningData,
      fedimint: fedimintData,
      totalBalance,
      userRole: availableWallet.user_role as FederationRole,
      permissions: availableWallet.permissions,
      errors,
      availableWallets,
    };
  } catch (error) {
    console.error("❌ Critical error fetching family wallet data:", error);
    throw error;
  }
}

/**
 * Get Pending FROST Transactions Across All Wallets
 * @param familyId - Family federation ID
 * @param userHash - User's hashed UUID
 * @returns Promise resolving to all pending transactions (handles null wallets gracefully)
 */
export async function getPendingFrostTransactions(
  familyId: string,
  userHash: string
): Promise<FrostTransaction[]> {
  try {
    const walletData = await getAllFamilyWalletData(familyId, userHash);

    // Safe spreading with null checks
    const allPendingTransactions = [
      ...(walletData.cashu?.pending_transactions || []),
      ...(walletData.lightning?.pending_transactions || []),
      ...(walletData.fedimint?.pending_transactions || []),
    ];

    console.log(
      `📋 Found ${allPendingTransactions.length} pending FROST transactions across ${walletData.availableWallets.length} wallets`
    );

    // Sort by creation date (newest first) with validation
    return allPendingTransactions.sort((a, b) => {
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);

      // Check for invalid dates
      const timeA = dateA.getTime();
      const timeB = dateB.getTime();

      if (isNaN(timeA) && isNaN(timeB)) {
        console.warn(
          "Both transactions have invalid created_at dates:",
          a.id,
          b.id
        );
        return 0; // Keep original order
      }

      if (isNaN(timeA)) {
        console.warn(
          "Transaction has invalid created_at date:",
          a.id,
          a.created_at
        );
        return 1; // Put invalid dates at the end
      }

      if (isNaN(timeB)) {
        console.warn(
          "Transaction has invalid created_at date:",
          b.id,
          b.created_at
        );
        return -1; // Put invalid dates at the end
      }

      return timeB - timeA; // Newest first
    });
  } catch (error) {
    console.error("❌ Error fetching pending FROST transactions:", error);
    throw error;
  }
}
