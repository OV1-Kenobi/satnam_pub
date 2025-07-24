/**
 * Emergency Recovery Hook
 *
 * Integrates the lib/emergency-recovery.ts with React components
 * Provides a clean interface for emergency recovery operations
 */

import { useCallback, useState } from "react";
import { EmergencyRecoveryLib } from '../../lib/emergency-recovery.js';
import { FederationRole } from "../types/auth";

interface UseEmergencyRecoveryProps {
  userId: string;
  userNpub: string;
  userRole: FederationRole;
  familyId?: string;
}

interface RecoveryRequest {
  requestType:
    | "nsec_recovery"
    | "ecash_recovery"
    | "emergency_liquidity"
    | "account_restoration";
  reason:
    | "lost_key"
    | "compromised_key"
    | "emergency_funds"
    | "account_lockout"
    | "guardian_request";
  urgency: "low" | "medium" | "high" | "critical";
  description: string;
  requestedAmount?: number;
  recoveryMethod: "password" | "multisig" | "shamir" | "guardian_consensus";
}

interface GuardianApproval {
  recoveryRequestId: string;
  guardianNpub: string;
  guardianRole: FederationRole;
  approval: "approved" | "rejected";
  signature: string;
  reason?: string;
}

export function useEmergencyRecovery({
  userId,
  userNpub,
  userRole,
  familyId,
}: UseEmergencyRecoveryProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const initiateRecovery = useCallback(
    async (request: RecoveryRequest) => {
      if (!familyId) {
        setError("Family ID is required for recovery");
        return { success: false, error: "Family ID is required" };
      }

      setIsLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const result = await EmergencyRecoveryLib.initiateRecovery({
          userId,
          userNpub,
          userRole,
          familyId,
          ...request,
        });

        if (result.success) {
          setSuccess("Recovery request submitted successfully");
        } else {
          setError(result.error || "Failed to initiate recovery");
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "An unknown error occurred";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setIsLoading(false);
      }
    },
    [userId, userNpub, userRole, familyId]
  );

  const getFamilyGuardians = useCallback(async () => {
    if (!familyId) {
      setError("Family ID is required");
      return { success: false, error: "Family ID is required" };
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await EmergencyRecoveryLib.getFamilyGuardians(familyId);

      if (!result.success) {
        setError(result.error || "Failed to fetch guardians");
      }

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An unknown error occurred";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, [familyId]);

  const processGuardianApproval = useCallback(
    async (approval: GuardianApproval) => {
      setIsLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const result = await EmergencyRecoveryLib.processGuardianApproval(
          approval
        );

        if (result.success) {
          setSuccess("Guardian approval processed successfully");
        } else {
          setError(result.error || "Failed to process guardian approval");
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "An unknown error occurred";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const getRecoveryStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await EmergencyRecoveryLib.getRecoveryStatus(userId);

      if (!result.success) {
        setError(result.error || "Failed to get recovery status");
      }

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An unknown error occurred";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Utility functions for the UI
  const canInitiateRecovery = useCallback(
    (requestType: RecoveryRequest["requestType"]) => {
      // Guardian and steward can initiate any type
      if (userRole === "guardian" || userRole === "steward") {
        return true;
      }

      // Adult and offspring cannot request emergency liquidity
      if (requestType === "emergency_liquidity") {
        return false;
      }

      return true;
    },
    [userRole]
  );

  const getRecoveryMethodOptions = useCallback(() => {
    const options = [
      { value: "guardian_consensus", label: "Guardian Consensus" },
      { value: "password", label: "Password Recovery" },
      { value: "multisig", label: "Multi-Signature" },
      { value: "shamir", label: "Shamir Secret Sharing" },
    ];

    return options;
  }, []);

  const getUrgencyLevels = useCallback(() => {
    return [
      { value: "low", label: "Low", description: "Not urgent, can wait" },
      { value: "medium", label: "Medium", description: "Moderately urgent" },
      { value: "high", label: "High", description: "Urgent attention needed" },
      {
        value: "critical",
        label: "Critical",
        description: "Emergency situation",
      },
    ];
  }, []);

  const getRecoveryTypes = useCallback(() => {
    const types = [
      {
        value: "nsec_recovery",
        label: "Private Key Recovery",
        description: "Recover your Nostr private key (nsec)",
        icon: "key",
      },
      {
        value: "ecash_recovery",
        label: "eCash Recovery",
        description: "Recover your eCash tokens from Fedimint",
        icon: "coins",
      },
      {
        value: "emergency_liquidity",
        label: "Emergency Liquidity",
        description: "Access emergency Bitcoin funds",
        icon: "zap",
        disabled: !canInitiateRecovery("emergency_liquidity"),
      },
      {
        value: "account_restoration",
        label: "Account Restoration",
        description: "Full account recovery and restoration",
        icon: "user",
      },
    ];

    return types;
  }, [canInitiateRecovery]);

  return {
    // State
    isLoading,
    error,
    success,

    // Actions
    initiateRecovery,
    getFamilyGuardians,
    processGuardianApproval,
    getRecoveryStatus,
    clearMessages,

    // Utilities
    canInitiateRecovery,
    getRecoveryMethodOptions,
    getUrgencyLevels,
    getRecoveryTypes,
  };
}
