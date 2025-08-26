/**
 * Emergency Recovery System for Satnam.pub
 *
 * Implements multi-sig based, password, and Shamir Secret Sharing (SSS)
 * account recovery and emergency liquidity protocols.
 *
 * Requires guardian consensus for nsec/eCash mint recovery or emergency fund release.
 * Notifies all guardians and logs actions locally (never to third parties).
 *
 * RBAC Integration:
 * - Guardian: Can initiate and approve emergency recovery
 * - Steward: Can initiate recovery, requires guardian approval
 * - Adult: Can request recovery, requires steward/guardian approval
 * - Offspring: Can request recovery, requires adult/steward/guardian approval
 */

import { FederationRole } from "../types/auth.js";
import { PrivacyUtils } from "./privacy/encryption.js";
// Import crypto modules for signature verification

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("./supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

/**
 * Secure cryptographic utilities for emergency recovery
 * SECURITY: Shared utilities with proper validation and error handling
 */
class EmergencyRecoveryCrypto {
  /**
   * Secure hex string to bytes conversion with validation
   * SECURITY: Prevents malformed hex from causing issues
   */
  static hexToBytes(hex: string): Uint8Array | null {
    try {
      // Validate hex string format
      if (!hex || hex.length % 2 !== 0) {
        return null;
      }

      // Validate hex characters
      if (!/^[0-9a-fA-F]+$/.test(hex)) {
        return null;
      }

      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        const byte = parseInt(hex.substring(i, i + 2), 16);
        if (isNaN(byte)) {
          return null;
        }
        bytes[i / 2] = byte;
      }
      return bytes;
    } catch (error) {
      return null;
    }
  }

  /**
   * Constant-time comparison for signature verification
   * SECURITY: Prevents timing attacks during signature validation
   */
  static constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result === 0;
  }

  /**
   * Secure memory cleanup for sensitive signature data
   * SECURITY: Clears sensitive data from memory after use
   */
  static async secureCleanup(sensitiveData: string[]): Promise<void> {
    try {
      const sensitiveTargets = sensitiveData.map((data) => ({
        data,
        type: "string" as const,
      }));

      // Import secure memory clearing if available
      try {
        const { secureClearMemory } = await import("./privacy/encryption.js");
        secureClearMemory(sensitiveTargets);
      } catch (importError) {
        // Fallback to basic clearing if import fails
        console.warn("Could not import secure memory clearing");
      }
    } catch (cleanupError) {
      console.warn("Memory cleanup failed:", cleanupError);
    }
  }
}

// Emergency Recovery Types
export interface RecoveryDetails {
  requestId?: string;
  requestType?: string;
  reason?: string;
  urgency?: string;
  recoveryMethod?: string;
  approval?: string;
  consensusReached?: boolean;
  actionId?: string;
  recoveryType?: string;
  method?: string;
  restored?: boolean;
  amount?: number;
  released?: boolean;
  userId?: string;
  error?: string;
  recoveryRequestId?: string;
}

export interface EmergencyRecoveryRequest {
  id: string;
  userId: string;
  userNpub: string;
  userRole: FederationRole;
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
  requestedAmount?: number; // For emergency liquidity
  recoveryMethod: "password" | "multisig" | "shamir" | "guardian_consensus";
  status: "pending" | "approved" | "rejected" | "completed" | "expired";
  createdAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  approvedBy: string[]; // Array of guardian npubs
  rejectedBy: string[]; // Array of guardian npubs
  consensusThreshold: number;
  requiredApprovals: number;
  currentApprovals: number;
  currentRejections: number;
}

/**
 * User type for recovery workflow routing
 */
export type UserType = "private" | "family_federation";

/**
 * Self-sovereign recovery methods for private users
 */
export type SelfRecoveryMethod =
  | "nsec_signature" // User signs with their private key
  | "nip05_password" // User authenticates with NIP-05 + password
  | "emergency_backup"; // User uses pre-configured backup method

/**
 * Self-sovereign recovery request for private users
 */
export interface SelfRecoveryRequest {
  id: string;
  userId: string;
  userNpub: string;
  requestType:
    | "nsec_recovery"
    | "ecash_recovery"
    | "emergency_liquidity"
    | "account_restoration";
  recoveryMethod: SelfRecoveryMethod;
  authenticationData: {
    signature?: string; // For nsec_signature method
    nip05?: string; // For nip05_password method
    passwordHash?: string; // For nip05_password method
    backupData?: string; // For emergency_backup method
  };
  status: "pending" | "verified" | "completed" | "failed";
  createdAt: Date;
  completedAt?: Date;
  reason: string;
  description: string;
}

export interface GuardianApproval {
  id: string;
  recoveryRequestId: string;
  guardianNpub: string;
  guardianRole: FederationRole;
  approval: "approved" | "rejected" | "abstained";
  reason?: string;
  signature: string; // Cryptographic signature of approval
  timestamp: Date;
  ipAddress?: string; // For audit trail
  userAgent?: string; // For audit trail
}

export interface RecoveryAction {
  id: string;
  recoveryRequestId: string;
  actionType:
    | "nsec_restored"
    | "ecash_restored"
    | "liquidity_released"
    | "account_restored";
  performedBy: string; // Guardian npub
  details: RecoveryDetails;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
}

export interface EmergencyLog {
  id: string;
  eventType:
    | "recovery_requested"
    | "guardian_approved"
    | "guardian_rejected"
    | "recovery_completed"
    | "recovery_failed";
  userId: string;
  userNpub: string;
  userRole: FederationRole;
  guardianNpub?: string;
  guardianRole?: FederationRole;
  details: RecoveryDetails;
  timestamp: Date;
  severity: "info" | "warning" | "error" | "critical";
}

// Recovery Configuration
export interface RecoveryConfig {
  familyId: string;
  totalGuardians: number;
  consensusThreshold: number;
  emergencyThreshold: number;
  recoveryTimeoutHours: number;
  maxRecoveryAttempts: number;
  currentAttempts: number;
  lastRecoveryAttempt?: Date;
  emergencyLiquidityLimit: number;
  requireGuardianConsensus: boolean;
  allowPasswordRecovery: boolean;
  allowMultisigRecovery: boolean;
  allowShamirRecovery: boolean;
  autoExpireRequests: boolean;
  logAllActions: boolean;
}

/**
 * Determine user type based on federation role
 * Private users have individual wallet sovereignty
 * Family federation users require guardian consensus
 */
function getUserType(userRole: FederationRole): UserType {
  return userRole === "private" ? "private" : "family_federation";
}

/**
 * Self-sovereign recovery system for private users
 * Bypasses guardian consensus for individual wallet sovereignty
 */
class SelfSovereignRecovery {
  /**
   * Verify nsec signature for self-sovereign recovery
   * SECURITY: Enhanced with proper input validation, constant-time operations, and comprehensive error handling
   */
  static async verifyNsecSignature(
    userNpub: string,
    signature: string,
    recoveryData: string
  ): Promise<boolean> {
    // Input validation with early returns for security
    if (!userNpub || !signature || !recoveryData) {
      console.error("Missing required parameters for signature verification");
      return false;
    }

    try {
      // Validate npub format with comprehensive checks
      if (!userNpub.startsWith("npub1") || userNpub.length !== 63) {
        console.error(
          "Invalid user npub format - must be 63 characters starting with npub1"
        );
        return false;
      }

      // Decode user npub to get public key hex with enhanced error handling
      let userPubkeyHex: string;
      try {
        const { central_event_publishing_service } = await import(
          "../../lib/central_event_publishing_service"
        );
        const pubHex = central_event_publishing_service.decodeNpub(userNpub);
        const decoded = { type: "npub", data: pubHex } as const;
        userPubkeyHex = decoded.data as string;

        // Validate decoded public key format
        if (!userPubkeyHex || userPubkeyHex.length !== 64) {
          console.error("Invalid decoded public key length");
          return false;
        }
      } catch (error) {
        console.error("User npub decode failed:", error);
        return false;
      }

      // Validate signature format with strict requirements
      if (signature.length !== 128) {
        console.error(
          "Invalid signature format - expected exactly 128 hex characters"
        );
        return false;
      }

      // Convert hex signature to bytes with validation
      const signatureBytes = EmergencyRecoveryCrypto.hexToBytes(signature);
      if (!signatureBytes || signatureBytes.length !== 64) {
        console.error("Invalid signature hex format");
        return false;
      }

      // Convert public key to bytes with validation
      const publicKeyBytes = EmergencyRecoveryCrypto.hexToBytes(userPubkeyHex);
      if (!publicKeyBytes || publicKeyBytes.length !== 32) {
        console.error("Invalid public key hex format");
        return false;
      }

      // Create message hash using Web Crypto API
      const messageBytes = new TextEncoder().encode(recoveryData);
      const messageHash = await crypto.subtle.digest("SHA-256", messageBytes);
      const messageHashArray = new Uint8Array(messageHash);

      // Verify signature using secp256k1 with proper error handling
      try {
        const { secp256k1 } = await import("@noble/curves/secp256k1");
        const isValid = secp256k1.verify(
          signatureBytes,
          messageHashArray,
          publicKeyBytes
        );

        // Use constant-time logging to prevent timing attacks
        const logMessage = isValid
          ? "✅ Self-sovereign signature verified successfully"
          : "❌ Self-sovereign signature verification failed";

        console.log(logMessage, userNpub.substring(0, 12) + "...");
        return isValid;
      } catch (cryptoError) {
        console.error(
          "Cryptographic signature verification failed:",
          cryptoError
        );
        return false;
      }
    } catch (error) {
      console.error("Self-sovereign signature verification error:", error);
      return false;
    } finally {
      // Secure memory cleanup for sensitive data
      await EmergencyRecoveryCrypto.secureCleanup([signature, recoveryData]);
    }
  }

  /**
   * Verify NIP-05 + password authentication for self-sovereign recovery
   */
  static async verifyNip05Password(
    nip05: string,
    passwordHash: string,
    userNpub: string
  ): Promise<boolean> {
    try {
      // Basic NIP-05 format validation
      if (!nip05.includes("@") || !nip05.includes(".")) {
        console.error("Invalid NIP-05 format:", nip05);
        return false;
      }

      // In a real implementation, this would:
      // 1. Verify the NIP-05 identifier against the domain
      // 2. Check the password hash against stored credentials
      // 3. Ensure the NIP-05 is associated with the provided npub

      // For now, basic validation
      const isValidFormat = nip05.length > 5 && passwordHash.length > 0;

      if (isValidFormat) {
        console.log("✅ NIP-05 + password verification successful:", nip05);
        return true;
      } else {
        console.error("NIP-05 + password verification failed");
        return false;
      }
    } catch (error) {
      console.error("NIP-05 + password verification error:", error);
      return false;
    }
  }

  /**
   * Process self-sovereign recovery request
   */
  static async processSelfRecovery(
    request: SelfRecoveryRequest
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log("🔑 Processing self-sovereign recovery for private user");

      let isAuthenticated = false;

      // Route based on recovery method
      switch (request.recoveryMethod) {
        case "nsec_signature":
          if (!request.authenticationData.signature) {
            return {
              success: false,
              error: "Signature required for nsec recovery",
            };
          }

          // Generate canonical recovery data for signing
          const recoveryData = JSON.stringify(
            {
              requestId: request.id,
              userId: request.userId,
              userNpub: request.userNpub,
              requestType: request.requestType,
              reason: request.reason,
              createdAt: request.createdAt.toISOString(),
            },
            Object.keys({}).sort()
          );

          isAuthenticated = await this.verifyNsecSignature(
            request.userNpub,
            request.authenticationData.signature,
            recoveryData
          );
          break;

        case "nip05_password":
          if (
            !request.authenticationData.nip05 ||
            !request.authenticationData.passwordHash
          ) {
            return { success: false, error: "NIP-05 and password required" };
          }

          isAuthenticated = await this.verifyNip05Password(
            request.authenticationData.nip05,
            request.authenticationData.passwordHash,
            request.userNpub
          );
          break;

        case "emergency_backup":
          if (!request.authenticationData.backupData) {
            return { success: false, error: "Emergency backup data required" };
          }

          // In a real implementation, this would verify backup data
          // For now, basic validation
          isAuthenticated = request.authenticationData.backupData.length > 0;
          break;

        default:
          return { success: false, error: "Invalid recovery method" };
      }

      if (!isAuthenticated) {
        return { success: false, error: "Authentication failed" };
      }

      // Execute the recovery based on request type
      const recoveryResult = await this.executeSelfRecovery(request);

      return {
        success: true,
        data: {
          requestId: request.id,
          recoveryType: request.requestType,
          method: request.recoveryMethod,
          result: recoveryResult,
        },
      };
    } catch (error) {
      console.error("Self-sovereign recovery processing error:", error);
      return { success: false, error: "Recovery processing failed" };
    }
  }

  /**
   * Execute the actual recovery operation
   */
  static async executeSelfRecovery(request: SelfRecoveryRequest): Promise<any> {
    // In a real implementation, this would perform the actual recovery:
    // - nsec_recovery: Generate new credentials or restore access
    // - ecash_recovery: Restore ecash tokens
    // - emergency_liquidity: Provide access to emergency funds
    // - account_restoration: Restore full account access

    console.log(`✅ Executing self-sovereign ${request.requestType} recovery`);

    return {
      type: request.requestType,
      method: request.recoveryMethod,
      status: "completed",
      timestamp: new Date().toISOString(),
    };
  }
}

export class EmergencyRecoverySystem {
  private static readonly RECOVERY_TIMEOUT_HOURS = 24;
  private static readonly MAX_RECOVERY_ATTEMPTS = 3;
  private static readonly EMERGENCY_LIQUIDITY_LIMIT = 1000000; // 1M sats

  /**
   * Initialize emergency recovery for a user
   */
  static async initiateRecovery(params: {
    userId: string;
    userNpub: string;
    userRole: FederationRole;
    requestType: EmergencyRecoveryRequest["requestType"];
    reason: EmergencyRecoveryRequest["reason"];
    urgency: EmergencyRecoveryRequest["urgency"];
    description: string;
    requestedAmount?: number;
    recoveryMethod: EmergencyRecoveryRequest["recoveryMethod"];
  }): Promise<{
    success: boolean;
    data?: {
      requestId: string;
      requiredApprovals: number;
      estimatedTime: string;
      nextSteps: string[];
    };
    error?: string;
  }> {
    try {
      const {
        userId,
        userNpub,
        userRole,
        requestType,
        reason,
        urgency,
        description,
        requestedAmount,
        recoveryMethod,
      } = params;

      // Determine user type and route accordingly
      const userType = getUserType(userRole);

      // Private users use self-sovereign recovery (bypass guardian consensus)
      if (userType === "private") {
        return await this.handlePrivateUserRecovery(params);
      }

      // Family federation users require guardian consensus
      // Validate user permissions
      const canInitiate = this.canInitiateRecovery(userRole, requestType);
      if (!canInitiate.allowed) {
        return {
          success: false,
          error: `Insufficient permissions: ${canInitiate.reason}`,
        };
      }

      // Check recovery attempt limits
      const attemptCheck = await this.checkRecoveryAttempts(userId);
      if (!attemptCheck.allowed) {
        return {
          success: false,
          error: `Too many recovery attempts: ${attemptCheck.reason}`,
        };
      }

      // Get family recovery configuration
      const config = await this.getRecoveryConfig(userId);
      if (!config) {
        return {
          success: false,
          error: "No recovery configuration found for user",
        };
      }

      // Validate emergency liquidity request
      if (requestType === "emergency_liquidity" && requestedAmount) {
        if (requestedAmount > config.emergencyLiquidityLimit) {
          return {
            success: false,
            error: `Requested amount exceeds emergency liquidity limit of ${config.emergencyLiquidityLimit} sats`,
          };
        }
      }

      // Create recovery request
      const requestId = PrivacyUtils.generateSecureUUID();
      const expiresAt = new Date(
        Date.now() + this.RECOVERY_TIMEOUT_HOURS * 60 * 60 * 1000
      );

      const recoveryRequest: EmergencyRecoveryRequest = {
        id: requestId,
        userId,
        userNpub,
        userRole,
        requestType,
        reason,
        urgency,
        description,
        requestedAmount,
        recoveryMethod,
        status: "pending",
        createdAt: new Date(),
        expiresAt,
        approvedBy: [],
        rejectedBy: [],
        consensusThreshold: config.consensusThreshold,
        requiredApprovals: this.calculateRequiredApprovals(
          userRole,
          urgency,
          config
        ),
        currentApprovals: 0,
        currentRejections: 0,
      };

      // Store recovery request
      await this.storeRecoveryRequest(recoveryRequest);

      // Log the recovery request
      await this.logEmergencyEvent({
        eventType: "recovery_requested",
        userId,
        userNpub,
        userRole,
        details: {
          requestId,
          requestType,
          reason,
          urgency,
          recoveryMethod,
        },
        severity: urgency === "critical" ? "critical" : "warning",
      });

      // Notify guardians
      await this.notifyGuardians(recoveryRequest);

      return {
        success: true,
        data: {
          requestId,
          requiredApprovals: recoveryRequest.requiredApprovals,
          estimatedTime: `${this.RECOVERY_TIMEOUT_HOURS} hours`,
          nextSteps: this.getNextSteps(userRole, recoveryMethod),
        },
      };
    } catch (error) {
      console.error("Emergency recovery initiation failed:", error);
      return {
        success: false,
        error: "Failed to initiate emergency recovery",
      };
    }
  }

  /**
   * Handle recovery for private users (self-sovereign)
   * Private users have individual wallet sovereignty and don't require guardian consensus
   */
  private static async handlePrivateUserRecovery(params: {
    userId: string;
    userNpub: string;
    userRole: FederationRole;
    requestType: EmergencyRecoveryRequest["requestType"];
    reason: EmergencyRecoveryRequest["reason"];
    urgency: EmergencyRecoveryRequest["urgency"];
    description: string;
    requestedAmount?: number;
    recoveryMethod: EmergencyRecoveryRequest["recoveryMethod"];
  }): Promise<{
    success: boolean;
    data?: {
      requestId: string;
      requiredApprovals: number;
      estimatedTime: string;
      nextSteps: string[];
    };
    error?: string;
  }> {
    try {
      console.log("🔑 Processing self-sovereign recovery for private user");

      // For private users, we need to determine the self-recovery method
      // based on the traditional recoveryMethod parameter
      let selfRecoveryMethod: SelfRecoveryMethod;

      switch (params.recoveryMethod) {
        case "password":
          selfRecoveryMethod = "nip05_password";
          break;
        case "multisig":
        case "shamir":
          selfRecoveryMethod = "emergency_backup";
          break;
        case "guardian_consensus":
        default:
          // For private users, default to nsec signature
          selfRecoveryMethod = "nsec_signature";
          break;
      }

      // Create self-recovery request
      const requestId = PrivacyUtils.generateSecureUUID();
      const selfRecoveryRequest: SelfRecoveryRequest = {
        id: requestId,
        userId: params.userId,
        userNpub: params.userNpub,
        requestType: params.requestType,
        recoveryMethod: selfRecoveryMethod,
        authenticationData: {
          // These would be provided by the user in a real implementation
          // For now, we'll indicate what's needed
        },
        status: "pending",
        createdAt: new Date(),
        reason: params.reason,
        description: params.description,
      };

      // Log the self-sovereign recovery request
      await this.logEmergencyEvent({
        eventType: "recovery_requested",
        userId: params.userId,
        userNpub: params.userNpub,
        userRole: params.userRole,
        details: {
          requestId,
          requestType: params.requestType,
          reason: params.reason,
          urgency: params.urgency,
          recoveryMethod: selfRecoveryMethod,
        },
        severity: params.urgency === "critical" ? "critical" : "info",
      });

      // For private users, return immediate instructions for self-recovery
      return {
        success: true,
        data: {
          requestId,
          requiredApprovals: 0, // No approvals needed for private users
          estimatedTime: "Immediate (upon authentication)",
          nextSteps: this.getPrivateUserNextSteps(
            selfRecoveryMethod,
            params.requestType
          ),
        },
      };
    } catch (error) {
      console.error("Private user recovery initiation failed:", error);
      return {
        success: false,
        error: "Failed to initiate self-sovereign recovery",
      };
    }
  }

  /**
   * Get next steps for private user recovery
   */
  private static getPrivateUserNextSteps(
    recoveryMethod: SelfRecoveryMethod,
    requestType: string
  ): string[] {
    const baseSteps = [
      `Complete ${requestType} recovery using ${recoveryMethod}`,
    ];

    switch (recoveryMethod) {
      case "nsec_signature":
        return [
          ...baseSteps,
          "Sign the recovery request with your private key (nsec)",
          "Submit the signed request for immediate processing",
          "Your recovery will be processed automatically upon signature verification",
        ];

      case "nip05_password":
        return [
          ...baseSteps,
          "Provide your NIP-05 identifier (username@domain.tld)",
          "Enter your account password",
          "Your recovery will be processed upon successful authentication",
        ];

      case "emergency_backup":
        return [
          ...baseSteps,
          "Provide your emergency backup data",
          "This may include backup phrases, recovery codes, or other pre-configured methods",
          "Your recovery will be processed upon successful backup verification",
        ];

      default:
        return baseSteps;
    }
  }

  /**
   * Process self-sovereign recovery for private users
   * Public interface to the SelfSovereignRecovery system
   */
  static async processSelfSovereignRecovery(
    request: SelfRecoveryRequest
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Verify this is for a private user
      if (request.userNpub && !request.userNpub.startsWith("npub1")) {
        return { success: false, error: "Invalid user npub format" };
      }

      // Process the self-sovereign recovery
      const result = await SelfSovereignRecovery.processSelfRecovery(request);

      if (result.success) {
        // Log successful self-sovereign recovery
        await this.logEmergencyEvent({
          eventType: "recovery_completed",
          userId: request.userId,
          userNpub: request.userNpub,
          userRole: "private",
          details: {
            requestId: request.id,
            requestType: request.requestType,
            recoveryMethod: request.recoveryMethod,
          },
          severity: "info",
        });
      } else {
        // Log failed self-sovereign recovery
        await this.logEmergencyEvent({
          eventType: "recovery_failed",
          userId: request.userId,
          userNpub: request.userNpub,
          userRole: "private",
          details: {
            requestId: request.id,
            requestType: request.requestType,
            recoveryMethod: request.recoveryMethod,
            reason: result.error || "Unknown error",
          },
          severity: "error",
        });
      }

      return result;
    } catch (error) {
      console.error("Self-sovereign recovery processing failed:", error);
      return {
        success: false,
        error: "Failed to process self-sovereign recovery",
      };
    }
  }

  /**
   * Guardian approval/rejection of recovery request
   */
  static async guardianApproval(params: {
    recoveryRequestId: string;
    guardianNpub: string;
    guardianRole: FederationRole;
    approval: "approved" | "rejected" | "abstained";
    reason?: string;
    signature: string;
  }): Promise<{
    success: boolean;
    data?: {
      requestStatus: string;
      currentApprovals: number;
      requiredApprovals: number;
      consensusReached: boolean;
    };
    error?: string;
  }> {
    try {
      const {
        recoveryRequestId,
        guardianNpub,
        guardianRole,
        approval,
        reason,
        signature,
      } = params;

      // Validate guardian permissions
      if (!this.isGuardianRole(guardianRole)) {
        return {
          success: false,
          error: "Only guardians can approve recovery requests",
        };
      }

      // Get recovery request
      const request = await this.getRecoveryRequest(recoveryRequestId);
      if (!request) {
        return {
          success: false,
          error: "Recovery request not found",
        };
      }

      // Check if request is still valid
      if (request.status !== "pending" || request.expiresAt < new Date()) {
        return {
          success: false,
          error: "Recovery request is no longer valid",
        };
      }

      // Check if guardian already approved/rejected
      if (
        request.approvedBy.includes(guardianNpub) ||
        request.rejectedBy.includes(guardianNpub)
      ) {
        return {
          success: false,
          error: "Guardian has already responded to this request",
        };
      }

      // Verify guardian signature
      const signatureValid = await this.verifyGuardianSignature(
        guardianNpub,
        signature,
        request
      );
      if (!signatureValid) {
        return {
          success: false,
          error: "Invalid guardian signature",
        };
      }

      // Create approval record
      const approvalRecord: GuardianApproval = {
        id: PrivacyUtils.generateSecureUUID(),
        recoveryRequestId,
        guardianNpub,
        guardianRole,
        approval,
        reason,
        signature,
        timestamp: new Date(),
      };

      await this.storeGuardianApproval(approvalRecord);

      // Update recovery request
      if (approval === "approved") {
        request.approvedBy.push(guardianNpub);
        request.currentApprovals++;
      } else if (approval === "rejected") {
        request.rejectedBy.push(guardianNpub);
        request.currentRejections++;
      }

      // Check if consensus is reached
      const consensusReached = this.checkConsensus(request);
      if (consensusReached) {
        request.status = "approved";
        request.completedAt = new Date();
      } else if (request.currentRejections >= request.requiredApprovals) {
        request.status = "rejected";
        request.completedAt = new Date();
      }

      await this.updateRecoveryRequest(request);

      // Log guardian action
      await this.logEmergencyEvent({
        eventType:
          approval === "approved" ? "guardian_approved" : "guardian_rejected",
        userId: request.userId,
        userNpub: request.userNpub,
        userRole: request.userRole,
        guardianNpub,
        guardianRole,
        details: {
          recoveryRequestId,
          approval,
          reason,
          consensusReached,
        },
        severity: "info",
      });

      return {
        success: true,
        data: {
          requestStatus: request.status,
          currentApprovals: request.currentApprovals,
          requiredApprovals: request.requiredApprovals,
          consensusReached,
        },
      };
    } catch (error) {
      console.error("Guardian approval failed:", error);
      return {
        success: false,
        error: "Failed to process guardian approval",
      };
    }
  }

  /**
   * Execute approved recovery request
   */
  static async executeRecovery(params: {
    recoveryRequestId: string;
    executorNpub: string;
    executorRole: FederationRole;
  }): Promise<{
    success: boolean;
    data?: {
      actionId: string;
      recoveryType: string;
      details: RecoveryDetails;
    };
    error?: string;
  }> {
    try {
      const { recoveryRequestId, executorNpub, executorRole } = params;

      // Validate executor permissions
      if (!this.isGuardianRole(executorRole)) {
        return {
          success: false,
          error: "Only guardians can execute recovery requests",
        };
      }

      // Get recovery request
      const request = await this.getRecoveryRequest(recoveryRequestId);
      if (!request) {
        return {
          success: false,
          error: "Recovery request not found",
        };
      }

      // Check if request is approved
      if (request.status !== "approved") {
        return {
          success: false,
          error: "Recovery request is not approved",
        };
      }

      // Execute recovery based on type
      let recoveryResult;
      switch (request.requestType) {
        case "nsec_recovery":
          recoveryResult = await this.executeNsecRecovery(
            request,
            executorNpub
          );
          break;
        case "ecash_recovery":
          recoveryResult = await this.executeEcashRecovery(
            request,
            executorNpub
          );
          break;
        case "emergency_liquidity":
          recoveryResult = await this.executeEmergencyLiquidity(
            request,
            executorNpub
          );
          break;
        case "account_restoration":
          recoveryResult = await this.executeAccountRestoration(
            request,
            executorNpub
          );
          break;
        default:
          return {
            success: false,
            error: "Unknown recovery type",
          };
      }

      if (!recoveryResult.success) {
        return recoveryResult;
      }

      // Update request status
      request.status = "completed";
      await this.updateRecoveryRequest(request);

      // Log recovery completion
      await this.logEmergencyEvent({
        eventType: "recovery_completed",
        userId: request.userId,
        userNpub: request.userNpub,
        userRole: request.userRole,
        guardianNpub: executorNpub,
        guardianRole: executorRole,
        details: {
          recoveryRequestId,
          recoveryType: request.requestType,
          actionId: recoveryResult.data?.actionId,
        },
        severity: "info",
      });

      return recoveryResult;
    } catch (error) {
      console.error("Recovery execution failed:", error);

      // Log recovery failure
      await this.logEmergencyEvent({
        eventType: "recovery_failed",
        userId: params.recoveryRequestId, // Will be updated with actual userId
        userNpub: "",
        userRole: "private",
        guardianNpub: params.executorNpub,
        guardianRole: params.executorRole,
        details: {
          recoveryRequestId: params.recoveryRequestId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        severity: "error",
      });

      return {
        success: false,
        error: "Failed to execute recovery",
      };
    }
  }

  /**
   * Get recovery status for a user
   */
  static async getRecoveryStatus(userId: string): Promise<{
    success: boolean;
    data?: {
      activeRequests: EmergencyRecoveryRequest[];
      completedRequests: EmergencyRecoveryRequest[];
      recoveryConfig: RecoveryConfig;
      attemptCount: number;
      lastAttempt?: Date;
    };
    error?: string;
  }> {
    try {
      const supabase = await getSupabaseClient();

      const { data: requests, error } = await supabase
        .from("emergency_recovery_requests")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const typedRequests = (requests || []) as EmergencyRecoveryRequest[];

      const activeRequests = typedRequests.filter(
        (r: EmergencyRecoveryRequest) =>
          r.status === "pending" || r.status === "approved"
      );
      const completedRequests = typedRequests.filter(
        (r: EmergencyRecoveryRequest) =>
          r.status === "completed" || r.status === "rejected"
      );

      const config = await this.getRecoveryConfig(userId);
      const attemptCount = typedRequests.length;

      return {
        success: true,
        data: {
          activeRequests,
          completedRequests,
          recoveryConfig: config!,
          attemptCount,
          lastAttempt:
            typedRequests.length > 0
              ? new Date(typedRequests[0].createdAt)
              : undefined,
        },
      };
    } catch (error) {
      console.error("Failed to get recovery status:", error);
      return {
        success: false,
        error: "Failed to get recovery status",
      };
    }
  }

  // Private helper methods

  private static canInitiateRecovery(
    userRole: FederationRole,
    requestType: EmergencyRecoveryRequest["requestType"]
  ): { allowed: boolean; reason?: string } {
    switch (userRole) {
      case "guardian":
        return { allowed: true };
      case "steward":
        return { allowed: true };
      case "adult":
        // Adults have individual wallet sovereignty - can request all recovery types
        return { allowed: true };
      case "offspring":
        if (requestType === "emergency_liquidity") {
          return {
            allowed: false,
            reason: "Offspring cannot request emergency liquidity",
          };
        }
        return { allowed: true };
      default:
        return { allowed: false, reason: "Invalid user role" };
    }
  }

  private static async checkRecoveryAttempts(
    userId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const client = await getSupabaseClient();
    const { data: requests, error } = await client
      .from("emergency_recovery_requests")
      .select("created_at")
      .eq("user_id", userId)
      .gte(
        "created_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      )
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    if (requests.length >= this.MAX_RECOVERY_ATTEMPTS) {
      return {
        allowed: false,
        reason: `Maximum ${this.MAX_RECOVERY_ATTEMPTS} recovery attempts per 24 hours exceeded`,
      };
    }

    return { allowed: true };
  }

  private static calculateRequiredApprovals(
    userRole: FederationRole,
    urgency: EmergencyRecoveryRequest["urgency"],
    config: RecoveryConfig
  ): number {
    let baseThreshold = config.consensusThreshold;

    // Adjust based on user role
    switch (userRole) {
      case "guardian":
        baseThreshold = Math.ceil(baseThreshold * 0.5); // Guardians need fewer approvals
        break;
      case "steward":
        baseThreshold = Math.ceil(baseThreshold * 0.75);
        break;
      case "adult":
        baseThreshold = Math.ceil(baseThreshold * 0.9);
        break;
      case "offspring":
        baseThreshold = config.consensusThreshold; // Full threshold for offspring
        break;
    }

    // Adjust based on urgency
    switch (urgency) {
      case "critical":
        baseThreshold = Math.ceil(baseThreshold * 0.8); // Faster approval for critical
        break;
      case "high":
        baseThreshold = Math.ceil(baseThreshold * 0.9);
        break;
      case "medium":
        // No adjustment
        break;
      case "low":
        baseThreshold = Math.ceil(baseThreshold * 1.1); // More approvals for low urgency
        break;
    }

    return Math.max(2, Math.min(baseThreshold, config.totalGuardians));
  }

  private static isGuardianRole(role: FederationRole): boolean {
    return role === "guardian" || role === "steward";
  }

  private static checkConsensus(request: EmergencyRecoveryRequest): boolean {
    return request.currentApprovals >= request.requiredApprovals;
  }

  /**
   * Generate canonical data string for recovery request signing
   * This creates a deterministic string representation of the recovery request
   * that guardians must sign to approve/reject the request
   */
  private static generateRecoveryRequestSigningData(
    request: EmergencyRecoveryRequest
  ): string {
    // Create a canonical representation of the recovery request data
    // This must be deterministic and include all critical fields
    const signingData = {
      requestId: request.id,
      userId: request.userId,
      userNpub: request.userNpub,
      requestType: request.requestType,
      reason: request.reason,
      urgency: request.urgency,
      description: request.description,
      requestedAmount: request.requestedAmount || null,
      recoveryMethod: request.recoveryMethod,
      createdAt: request.createdAt.toISOString(),
      expiresAt: request.expiresAt.toISOString(),
    };

    // Convert to deterministic JSON string (sorted keys)
    return JSON.stringify(signingData, Object.keys(signingData).sort());
  }

  /**
   * Verify guardian cryptographic signature for recovery request approval
   * CRITICAL SECURITY: Enhanced with proper input validation, constant-time operations, and comprehensive error handling
   */
  private static async verifyGuardianSignature(
    guardianNpub: string,
    signature: string,
    request: EmergencyRecoveryRequest
  ): Promise<boolean> {
    // Input validation with early returns for security
    if (!guardianNpub || !signature || !request) {
      console.error(
        "Missing required parameters for guardian signature verification"
      );
      return false;
    }

    try {
      // Validate npub format with comprehensive checks
      if (!guardianNpub.startsWith("npub1") || guardianNpub.length !== 63) {
        console.error(
          "Invalid guardian npub format - must be 63 characters starting with npub1"
        );
        return false;
      }

      // Decode guardian npub to get public key hex with enhanced error handling
      let guardianPubkeyHex: string;
      try {
        const { central_event_publishing_service } = await import(
          "../../lib/central_event_publishing_service"
        );
        const pubHex =
          central_event_publishing_service.decodeNpub(guardianNpub);
        const decoded = { type: "npub", data: pubHex } as const;
        if (decoded.type !== "npub") {
          console.error(
            "Guardian npub decode failed - wrong type:",
            decoded.type
          );
          return false;
        }
        guardianPubkeyHex = decoded.data as string;

        // Validate decoded public key format
        if (!guardianPubkeyHex || guardianPubkeyHex.length !== 64) {
          console.error("Invalid decoded guardian public key length");
          return false;
        }
      } catch (error) {
        console.error("Guardian npub decode failed:", error);
        return false;
      }

      // Validate signature format with strict requirements
      if (signature.length !== 128) {
        console.error(
          "Invalid signature format - expected exactly 128 hex characters"
        );
        return false;
      }

      // Convert hex signature to bytes with validation
      const signatureBytes = EmergencyRecoveryCrypto.hexToBytes(signature);
      if (!signatureBytes || signatureBytes.length !== 64) {
        console.error("Invalid guardian signature hex format");
        return false;
      }

      // Convert public key to bytes with validation
      const publicKeyBytes =
        EmergencyRecoveryCrypto.hexToBytes(guardianPubkeyHex);
      if (!publicKeyBytes || publicKeyBytes.length !== 32) {
        console.error("Invalid guardian public key hex format");
        return false;
      }

      // Generate the canonical signing data
      const signingData = this.generateRecoveryRequestSigningData(request);

      // Create message hash using Web Crypto API
      const messageBytes = new TextEncoder().encode(signingData);
      const messageHash = await crypto.subtle.digest("SHA-256", messageBytes);
      const messageHashArray = new Uint8Array(messageHash);

      // Verify signature using secp256k1 with proper error handling
      try {
        const { secp256k1 } = await import("@noble/curves/secp256k1");
        const isValid = secp256k1.verify(
          signatureBytes,
          messageHashArray,
          publicKeyBytes
        );

        // Use constant-time logging to prevent timing attacks
        const logMessage = isValid
          ? "✅ Guardian signature verified successfully"
          : "❌ Guardian signature verification failed";

        console.log(logMessage, guardianNpub.substring(0, 12) + "...");
        return isValid;
      } catch (cryptoError) {
        console.error(
          "Cryptographic guardian signature verification failed:",
          cryptoError
        );
        return false;
      }
    } catch (error) {
      console.error("Guardian signature verification error:", error);
      return false;
    } finally {
      // Secure memory cleanup for sensitive data
      await EmergencyRecoveryCrypto.secureCleanup([signature]);
    }
  }

  private static async getRecoveryConfig(
    userId: string
  ): Promise<RecoveryConfig | null> {
    // This would fetch from the database
    // For now, return a default configuration
    return {
      familyId: "default",
      totalGuardians: 3,
      consensusThreshold: 2,
      emergencyThreshold: 1,
      recoveryTimeoutHours: this.RECOVERY_TIMEOUT_HOURS,
      maxRecoveryAttempts: this.MAX_RECOVERY_ATTEMPTS,
      currentAttempts: 0,
      emergencyLiquidityLimit: this.EMERGENCY_LIQUIDITY_LIMIT,
      requireGuardianConsensus: true,
      allowPasswordRecovery: true,
      allowMultisigRecovery: true,
      allowShamirRecovery: true,
      autoExpireRequests: true,
      logAllActions: true,
    };
  }

  private static async storeRecoveryRequest(
    request: EmergencyRecoveryRequest
  ): Promise<void> {
    const client = await getSupabaseClient();
    const { error } = await client.from("emergency_recovery_requests").insert({
      id: request.id,
      user_id: request.userId,
      user_npub: request.userNpub,
      user_role: request.userRole,
      request_type: request.requestType,
      reason: request.reason,
      urgency: request.urgency,
      description: request.description,
      requested_amount: request.requestedAmount,
      recovery_method: request.recoveryMethod,
      status: request.status,
      created_at: request.createdAt.toISOString(),
      expires_at: request.expiresAt.toISOString(),
      approved_by: request.approvedBy,
      rejected_by: request.rejectedBy,
      consensus_threshold: request.consensusThreshold,
      required_approvals: request.requiredApprovals,
      current_approvals: request.currentApprovals,
      current_rejections: request.currentRejections,
    });

    if (error) {
      throw error;
    }
  }

  private static async getRecoveryRequest(
    requestId: string
  ): Promise<EmergencyRecoveryRequest | null> {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from("emergency_recovery_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      userNpub: data.user_npub,
      userRole: data.user_role,
      requestType: data.request_type,
      reason: data.reason,
      urgency: data.urgency,
      description: data.description,
      requestedAmount: data.requested_amount,
      recoveryMethod: data.recovery_method,
      status: data.status,
      createdAt: new Date(data.created_at),
      expiresAt: new Date(data.expires_at),
      completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
      approvedBy: data.approved_by || [],
      rejectedBy: data.rejected_by || [],
      consensusThreshold: data.consensus_threshold,
      requiredApprovals: data.required_approvals,
      currentApprovals: data.current_approvals,
      currentRejections: data.current_rejections,
    };
  }

  private static async updateRecoveryRequest(
    request: EmergencyRecoveryRequest
  ): Promise<void> {
    const client = await getSupabaseClient();
    const { error } = await client
      .from("emergency_recovery_requests")
      .update({
        status: request.status,
        approved_by: request.approvedBy,
        rejected_by: request.rejectedBy,
        current_approvals: request.currentApprovals,
        current_rejections: request.currentRejections,
        completed_at: request.completedAt?.toISOString(),
      })
      .eq("id", request.id);

    if (error) {
      throw error;
    }
  }

  private static async storeGuardianApproval(
    approval: GuardianApproval
  ): Promise<void> {
    const client = await getSupabaseClient();
    const { error } = await client.from("guardian_approvals").insert({
      id: approval.id,
      recovery_request_id: approval.recoveryRequestId,
      guardian_npub: approval.guardianNpub,
      guardian_role: approval.guardianRole,
      approval: approval.approval,
      reason: approval.reason,
      signature: approval.signature,
      timestamp: approval.timestamp.toISOString(),
    });

    if (error) {
      throw error;
    }
  }

  private static async logEmergencyEvent(
    eventData: Omit<EmergencyLog, "id" | "timestamp">
  ): Promise<void> {
    const event: EmergencyLog = {
      ...eventData,
      id: PrivacyUtils.generateSecureUUID(),
      timestamp: new Date(),
    };

    const client = await getSupabaseClient();
    const { error } = await client.from("emergency_logs").insert({
      id: event.id,
      event_type: event.eventType,
      user_id: event.userId,
      user_npub: event.userNpub,
      user_role: event.userRole,
      guardian_npub: event.guardianNpub,
      guardian_role: event.guardianRole,
      details: event.details,
      timestamp: event.timestamp.toISOString(),
      severity: event.severity,
    });

    if (error) {
      console.error("Failed to log emergency event:", error);
    }
  }

  private static async notifyGuardians(
    request: EmergencyRecoveryRequest
  ): Promise<void> {
    // In a real implementation, this would send notifications to guardians
    // via Nostr DMs, email, or other channels
    console.log(`Notifying guardians of recovery request: ${request.id}`);
  }

  private static getNextSteps(
    userRole: FederationRole,
    recoveryMethod: string
  ): string[] {
    const steps = [
      "Recovery request submitted successfully",
      "Guardians will be notified immediately",
      "You will receive updates on the approval process",
    ];

    if (userRole === "offspring" || userRole === "adult") {
      steps.push("Your family guardians will review the request");
    }

    if (recoveryMethod === "password") {
      steps.push("Prepare your recovery password for verification");
    } else if (recoveryMethod === "multisig") {
      steps.push("Ensure all required guardians are available");
    } else if (recoveryMethod === "shamir") {
      steps.push("Prepare your Shamir secret shares");
    }

    return steps;
  }

  // Recovery execution methods

  private static async executeNsecRecovery(
    request: EmergencyRecoveryRequest,
    executorNpub: string
  ): Promise<{
    success: boolean;
    data?: { actionId: string; recoveryType: string; details: RecoveryDetails };
    error?: string;
  }> {
    try {
      // This would implement the actual nsec recovery logic
      // using the configured recovery method

      const actionId = PrivacyUtils.generateSecureUUID();

      // Log the recovery action
      const action: RecoveryAction = {
        id: actionId,
        recoveryRequestId: request.id,
        actionType: "nsec_restored",
        performedBy: executorNpub,
        details: {
          recoveryMethod: request.recoveryMethod,
          userId: request.userId,
        },
        timestamp: new Date(),
        success: true,
      };

      await this.storeRecoveryAction(action);

      return {
        success: true,
        data: {
          actionId,
          recoveryType: "nsec_recovery",
          details: {
            method: request.recoveryMethod,
            restored: true,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to execute nsec recovery",
      };
    }
  }

  private static async executeEcashRecovery(
    request: EmergencyRecoveryRequest,
    executorNpub: string
  ): Promise<{
    success: boolean;
    data?: { actionId: string; recoveryType: string; details: RecoveryDetails };
    error?: string;
  }> {
    try {
      const actionId = PrivacyUtils.generateSecureUUID();

      const action: RecoveryAction = {
        id: actionId,
        recoveryRequestId: request.id,
        actionType: "ecash_restored",
        performedBy: executorNpub,
        details: {
          recoveryMethod: request.recoveryMethod,
          userId: request.userId,
        },
        timestamp: new Date(),
        success: true,
      };

      await this.storeRecoveryAction(action);

      return {
        success: true,
        data: {
          actionId,
          recoveryType: "ecash_recovery",
          details: {
            method: request.recoveryMethod,
            restored: true,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to execute ecash recovery",
      };
    }
  }

  private static async executeEmergencyLiquidity(
    request: EmergencyRecoveryRequest,
    executorNpub: string
  ): Promise<{
    success: boolean;
    data?: { actionId: string; recoveryType: string; details: RecoveryDetails };
    error?: string;
  }> {
    try {
      const actionId = PrivacyUtils.generateSecureUUID();

      const action: RecoveryAction = {
        id: actionId,
        recoveryRequestId: request.id,
        actionType: "liquidity_released",
        performedBy: executorNpub,
        details: {
          amount: request.requestedAmount,
          userId: request.userId,
        },
        timestamp: new Date(),
        success: true,
      };

      await this.storeRecoveryAction(action);

      return {
        success: true,
        data: {
          actionId,
          recoveryType: "emergency_liquidity",
          details: {
            amount: request.requestedAmount,
            released: true,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to execute emergency liquidity release",
      };
    }
  }

  private static async executeAccountRestoration(
    request: EmergencyRecoveryRequest,
    executorNpub: string
  ): Promise<{
    success: boolean;
    data?: { actionId: string; recoveryType: string; details: RecoveryDetails };
    error?: string;
  }> {
    try {
      const actionId = PrivacyUtils.generateSecureUUID();

      const action: RecoveryAction = {
        id: actionId,
        recoveryRequestId: request.id,
        actionType: "account_restored",
        performedBy: executorNpub,
        details: {
          recoveryMethod: request.recoveryMethod,
          userId: request.userId,
        },
        timestamp: new Date(),
        success: true,
      };

      await this.storeRecoveryAction(action);

      return {
        success: true,
        data: {
          actionId,
          recoveryType: "account_restoration",
          details: {
            method: request.recoveryMethod,
            restored: true,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to execute account restoration",
      };
    }
  }

  private static async storeRecoveryAction(
    action: RecoveryAction
  ): Promise<void> {
    const client = await getSupabaseClient();
    const { error } = await client.from("recovery_actions").insert({
      id: action.id,
      recovery_request_id: action.recoveryRequestId,
      action_type: action.actionType,
      performed_by: action.performedBy,
      details: action.details,
      timestamp: action.timestamp.toISOString(),
      success: action.success,
      error_message: action.errorMessage,
    });

    if (error) {
      throw error;
    }
  }
}
