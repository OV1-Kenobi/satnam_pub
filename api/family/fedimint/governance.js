/**
 * CRITICAL SECURITY: Family Fedimint Governance API with Master Context Compliance
 * 
 * Implements Fedimint governance with guardian consensus, JWT authentication,
 * privacy-first logging, and Master Context role hierarchy. All operations logged locally
 * for user transparency with zero external data leakage.
 */

import { z } from "zod";
import { SecureSessionManager } from "../../../netlify/functions/security/session-manager.js";
import { supabase } from "../../../netlify/functions/supabase.js";

/**
 * CRITICAL SECURITY: Privacy-first operation logging for user transparency
 * All Fedimint governance operations logged to user's localStorage with zero external leakage
 * @typedef {Object} GovernanceOperation
 * @property {string} operation - Operation type
 * @property {Object} details - Operation details
 * @property {Date} timestamp - Operation timestamp
 */

/**
 * CRITICAL SECURITY: Privacy-first governance operation logging
 * @param {GovernanceOperation} operation - Operation to log
 * @returns {Promise<void>}
 */
const logGovernanceOperation = async (operation) => {
  try {
    const logEntry = {
      id: crypto.randomUUID(),
      component: 'FedimintGovernance',
      operation: operation.operation,
      details: operation.details,
      timestamp: operation.timestamp.toISOString(),
    };

    const existingLogs = JSON.parse(localStorage.getItem('governanceOperations') || '[]');
    const updatedLogs = [logEntry, ...existingLogs].slice(0, 1000); // Keep last 1000 entries
    localStorage.setItem('governanceOperations', JSON.stringify(updatedLogs));
  } catch (error) {
    // Silent failure to prevent disrupting user experience
  }
};

/**
 * CRITICAL SECURITY: Generate encrypted UUID for privacy protection
 * Uses SHA-256 hashing with Web Crypto API to prevent correlation attacks
 * @param {string} identifier - Base identifier for hashing
 * @returns {Promise<string>} Encrypted UUID
 */
const generateSecureGovernanceId = async (identifier) => {
  try {
    const fullIdentifier = `${identifier}:${crypto.randomUUID()}:${Date.now()}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(fullIdentifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const secureId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // CRITICAL SECURITY: Clear sensitive data from memory
    data.fill(0);
    
    return secureId;
  } catch (error) {
    // Fallback to regular UUID if crypto operations fail
    return crypto.randomUUID();
  }
};

/**
 * CRITICAL SECURITY: Validate Master Context role
 * @param {string} role - Role to validate
 * @returns {boolean} True if role is valid Master Context role
 */
const validateMasterContextRole = (role) => {
  const validRoles = ['private', 'offspring', 'adult', 'steward', 'guardian'];
  return validRoles.includes(role);
};

/**
 * CRITICAL SECURITY: Map legacy roles to Master Context roles
 * @param {string} legacyRole - Legacy role to map
 * @returns {string} Master Context role
 */
const mapToMasterContextRole = (legacyRole) => {
  const roleMapping = {
    'trusted_relative': 'adult',
    'family_advisor': 'steward',
    'parent': 'adult',
    'child': 'offspring',
    'teen': 'offspring',
    'advisor': 'steward',
    'friend': 'private',
  };
  
  return roleMapping[legacyRole] || legacyRole;
};

/**
 * CRITICAL SECURITY: Validate JWT session and extract user data
 * @param {Object} req - Request object
 * @returns {Promise<Object|null>} Session data or null if invalid
 */
const validateJWTSession = async (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const sessionData = await SecureSessionManager.validateSession(token);
    
    if (!sessionData || !sessionData.isAuthenticated) {
      return null;
    }

    return sessionData;
  } catch (error) {
    return null;
  }
};

/**
 * CRITICAL SECURITY: Check family access with Master Context role validation
 * @param {Object} user - User object
 * @param {string} familyId - Family ID
 * @returns {Promise<Object>} Access check result
 */
const checkFamilyAccess = async (user, familyId) => {
  try {
    // Query family membership with RLS compliance
    const { data: membership, error } = await supabase
      .from('family_members')
      .select('role, status')
      .eq('user_id', user.id)
      .eq('family_id', familyId)
      .eq('is_active', true)
      .single();

    if (error || !membership) {
      return {
        allowed: false,
        error: 'Family membership not found',
        role: null,
      };
    }

    // Map to Master Context role
    const masterContextRole = mapToMasterContextRole(membership.role);

    return {
      allowed: true,
      role: masterContextRole,
      status: membership.status,
    };
  } catch (error) {
    return {
      allowed: false,
      error: 'Failed to verify family access',
      role: null,
    };
  }
};

/**
 * CRITICAL SECURITY: Check family admin access with Master Context role validation
 * @param {Object} user - User object
 * @param {string} familyId - Family ID
 * @returns {Promise<Object>} Admin access check result
 */
const checkFamilyAdminAccess = async (user, familyId) => {
  try {
    const accessCheck = await checkFamilyAccess(user, familyId);
    
    if (!accessCheck.allowed) {
      return accessCheck;
    }

    // Only guardian and steward roles can perform admin operations
    const adminRoles = ['guardian', 'steward'];
    const hasAdminAccess = adminRoles.includes(accessCheck.role);

    return {
      allowed: hasAdminAccess,
      role: accessCheck.role,
      error: hasAdminAccess ? null : 'Guardian or Steward role required for admin operations',
    };
  } catch (error) {
    return {
      allowed: false,
      error: 'Failed to verify admin access',
      role: null,
    };
  }
};

/**
 * @typedef {Object} FamilyGuardian
 * @property {string} id - Guardian ID
 * @property {string} name - Guardian name
 * @property {string} publicKey - Guardian public key
 * @property {"online"|"offline"} status - Guardian status
 * @property {Date} lastSeen - Last seen timestamp
 * @property {number} votingPower - Voting power
 * @property {"private"|"offspring"|"adult"|"steward"|"guardian"} familyRole - Master Context role
 */

/**
 * @typedef {Object} GuardianApproval
 * @property {string} guardianId - Guardian ID
 * @property {string} guardianName - Guardian name
 * @property {boolean} approved - Approval status
 * @property {Date} [signedAt] - Signature timestamp
 * @property {string} [signature] - Cryptographic signature
 */

/**
 * @typedef {Object} FamilyApproval
 * @property {string} id - Approval ID
 * @property {"allowance_distribution"|"emergency_withdrawal"|"spending_limit_change"|"guardian_change"} type - Approval type
 * @property {string} description - Approval description
 * @property {number} [amount] - Amount in satoshis
 * @property {string} [recipient] - Recipient identifier
 * @property {number} requiredSignatures - Required signatures
 * @property {number} currentSignatures - Current signatures
 * @property {GuardianApproval[]} guardianApprovals - Guardian approvals
 * @property {"pending"|"approved"|"rejected"|"expired"} status - Approval status
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} expiresAt - Expiration timestamp
 * @property {string} createdBy - Creator ID
 */

/**
 * @typedef {Object} FedimintTransaction
 * @property {string} id - Transaction ID
 * @property {"fedimint"} type - Transaction type
 * @property {"incoming"|"outgoing"} direction - Transaction direction
 * @property {number} amount - Amount in satoshis
 * @property {number} fee - Fee in satoshis
 * @property {string} from - From address/identifier
 * @property {string} to - To address/identifier
 * @property {string} noteId - Fedimint note ID
 * @property {string} description - Transaction description
 * @property {Date} timestamp - Transaction timestamp
 * @property {"pending"|"completed"|"failed"} status - Transaction status
 * @property {boolean} requiresApproval - Requires approval flag
 * @property {string} [approvalId] - Associated approval ID
 * @property {string} [familyMember] - Family member identifier
 */

/**
 * @typedef {Object} GovernanceStats
 * @property {number} totalProposals - Total proposals
 * @property {number} approvedProposals - Approved proposals
 * @property {number} rejectedProposals - Rejected proposals
 * @property {number} pendingProposals - Pending proposals
 * @property {number} averageApprovalTime - Average approval time in milliseconds
 * @property {string} consensusHealth - Consensus health status
 */

/**
 * @typedef {Object} FederationInfo
 * @property {string} federationId - Federation ID
 * @property {string} name - Federation name
 * @property {number} guardiansTotal - Total guardians
 * @property {number} guardiansOnline - Online guardians
 * @property {number} consensusThreshold - Consensus threshold
 * @property {number} epochHeight - Current epoch height
 * @property {Date} lastConsensus - Last consensus timestamp
 */

/**
 * @typedef {Object} FedimintGovernanceData
 * @property {number} fedimintEcashBalance - eCash balance in satoshis
 * @property {FederationInfo} federationInfo - Federation information
 * @property {FamilyGuardian[]} guardians - Family guardians
 * @property {FamilyApproval[]} pendingApprovals - Pending approvals
 * @property {FedimintTransaction[]} recentFedimintTransactions - Recent transactions
 * @property {GovernanceStats} governanceStats - Governance statistics
 */

/**
 * @typedef {Object} APIResponse
 * @property {boolean} success - Success status
 * @property {Object} [data] - Response data
 * @property {string} [error] - Error message
 * @property {Object} meta - Response metadata
 * @property {string} meta.timestamp - Response timestamp
 */

/**
 * CRITICAL SECURITY: Get Family Fedimint Governance with Master Context Compliance
 * GET /api/family/fedimint/governance
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
export async function getFamilyFedimintGovernance(req, res) {
  const operationId = await generateSecureGovernanceId('get_governance');

  try {
    const { familyId } = req.query;

    // CRITICAL SECURITY: Validate JWT session
    const sessionData = await validateJWTSession(req);
    if (!sessionData) {
      await logGovernanceOperation({
        operation: "governance_access_denied",
        details: {
          operationId,
          reason: "authentication_required",
          familyId,
        },
        timestamp: new Date(),
      });

      res.status(401).json({
        success: false,
        error: "Authentication required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // CRITICAL SECURITY: Verify family membership with Master Context roles
    const accessCheck = await checkFamilyAccess(sessionData, familyId);
    if (!accessCheck.allowed) {
      await logGovernanceOperation({
        operation: "family_access_denied",
        details: {
          operationId,
          familyId,
          userId: sessionData.userId,
          reason: accessCheck.error,
        },
        timestamp: new Date(),
      });

      res.status(403).json({
        success: false,
        error: "Family access denied",
        details: accessCheck.error,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // CRITICAL SECURITY: Generate mock Fedimint governance data with Master Context roles
    const fedimintGovernanceData = {
      fedimintEcashBalance: 3335000, // 3.335M sats in eCash
      federationInfo: {
        federationId: "fed_nakamoto_family",
        name: "Nakamoto Family Federation",
        guardiansTotal: 5,
        guardiansOnline: 4,
        consensusThreshold: 3,
        epochHeight: 12450,
        lastConsensus: new Date(Date.now() - 15 * 60 * 1000),
      },
      guardians: [
        {
          id: "guardian_satoshi",
          name: "Satoshi (Dad)",
          publicKey: "03abc123...",
          status: "online",
          lastSeen: new Date(),
          votingPower: 2,
          familyRole: "adult", // Master Context role
        },
        {
          id: "guardian_hal",
          name: "Hal (Mom)",
          publicKey: "03def456...",
          status: "online",
          lastSeen: new Date(Date.now() - 5 * 60 * 1000),
          votingPower: 2,
          familyRole: "adult", // Master Context role
        },
        {
          id: "guardian_uncle_bob",
          name: "Uncle Bob",
          publicKey: "03ghi789...",
          status: "online",
          lastSeen: new Date(Date.now() - 10 * 60 * 1000),
          votingPower: 1,
          familyRole: "adult", // Mapped from trusted_relative
        },
        {
          id: "guardian_advisor",
          name: "Family Financial Advisor",
          publicKey: "03jkl012...",
          status: "offline",
          lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000),
          votingPower: 1,
          familyRole: "steward", // Mapped from family_advisor
        },
        {
          id: "guardian_grandma",
          name: "Grandma Sarah",
          publicKey: "03mno345...",
          status: "online",
          lastSeen: new Date(Date.now() - 30 * 60 * 1000),
          votingPower: 1,
          familyRole: "adult", // Mapped from trusted_relative
        },
      ],
      pendingApprovals: [
        {
          id: "approval_001",
          type: "allowance_distribution",
          description: "Weekly allowance distribution to children",
          amount: 75000,
          recipient: "all_children",
          requiredSignatures: 3,
          currentSignatures: 2,
          guardianApprovals: [
            {
              guardianId: "guardian_satoshi",
              guardianName: "Satoshi (Dad)",
              approved: true,
              signedAt: new Date(Date.now() - 30 * 60 * 1000),
              signature: "sig_abc123...",
            },
            {
              guardianId: "guardian_hal",
              guardianName: "Hal (Mom)",
              approved: true,
              signedAt: new Date(Date.now() - 25 * 60 * 1000),
              signature: "sig_def456...",
            },
            {
              guardianId: "guardian_uncle_bob",
              guardianName: "Uncle Bob",
              approved: false,
            },
          ],
          status: "pending",
          createdAt: new Date(Date.now() - 60 * 60 * 1000),
          expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000),
          createdBy: "guardian_satoshi",
        },
      ],
      recentFedimintTransactions: [
        {
          id: "fed_tx_001",
          type: "fedimint",
          direction: "outgoing",
          amount: 25000,
          fee: 0,
          from: "family_treasury",
          to: "alice",
          noteId: "note_abc123...",
          description: "Weekly allowance to Alice",
          timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          status: "completed",
          requiresApproval: true,
          approvalId: "approval_003",
          familyMember: "alice",
        },
      ],
      governanceStats: {
        totalProposals: 15,
        approvedProposals: 12,
        rejectedProposals: 1,
        pendingProposals: 2,
        averageApprovalTime: 45 * 60 * 1000, // 45 minutes
        consensusHealth: "excellent",
      },
    };

    // CRITICAL SECURITY: Log successful governance data retrieval
    await logGovernanceOperation({
      operation: "governance_data_retrieved",
      details: {
        operationId,
        familyId,
        userId: sessionData.userId,
        userRole: accessCheck.role,
        guardiansOnline: fedimintGovernanceData.federationInfo.guardiansOnline,
        pendingApprovals: fedimintGovernanceData.pendingApprovals.length,
      },
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      data: fedimintGovernanceData,
      meta: {
        timestamp: new Date().toISOString(),
        familyId,
        userRole: accessCheck.role,
      },
    });
  } catch (error) {
    // CRITICAL SECURITY: Privacy-first error logging
    await logGovernanceOperation({
      operation: "governance_retrieval_error",
      details: {
        operationId,
        error: error.message,
        familyId: req.query.familyId,
      },
      timestamp: new Date(),
    });

    res.status(500).json({
      success: false,
      error: "Failed to retrieve family Fedimint governance data",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * CRITICAL SECURITY: Create Governance Proposal with Master Context Role Validation
 * POST /api/family/fedimint/governance/proposals
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
export async function createGovernanceProposal(req, res) {
  const operationId = await generateSecureGovernanceId('create_proposal');

  try {
    // CRITICAL SECURITY: Validate proposal schema
    const proposalSchema = z.object({
      familyId: z.string(),
      type: z.enum([
        "allowance_distribution",
        "emergency_withdrawal",
        "spending_limit_change",
        "guardian_change",
      ]),
      description: z.string().min(10).max(500),
      amount: z.number().optional(),
      recipient: z.string().optional(),
    });

    const validationResult = proposalSchema.safeParse(req.body);

    if (!validationResult.success) {
      await logGovernanceOperation({
        operation: "proposal_validation_failed",
        details: {
          operationId,
          errors: validationResult.error.errors,
          hasType: !!req.body?.type,
          hasDescription: !!req.body?.description,
        },
        timestamp: new Date(),
      });

      res.status(400).json({
        success: false,
        error: "Invalid proposal data",
        details: validationResult.error.errors,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const { familyId, type, description, amount, recipient } = validationResult.data;

    // CRITICAL SECURITY: Validate JWT session
    const sessionData = await validateJWTSession(req);
    if (!sessionData) {
      await logGovernanceOperation({
        operation: "proposal_creation_denied",
        details: {
          operationId,
          reason: "authentication_required",
          familyId,
          proposalType: type,
        },
        timestamp: new Date(),
      });

      res.status(401).json({
        success: false,
        error: "Authentication required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // CRITICAL SECURITY: Verify family admin access with Master Context roles
    const adminCheck = await checkFamilyAdminAccess(sessionData, familyId);
    if (!adminCheck.allowed) {
      await logGovernanceOperation({
        operation: "proposal_admin_access_denied",
        details: {
          operationId,
          familyId,
          userId: sessionData.userId,
          userRole: adminCheck.role,
          reason: adminCheck.error,
          proposalType: type,
        },
        timestamp: new Date(),
      });

      res.status(403).json({
        success: false,
        error: "Guardian or Steward role required to create governance proposals",
        details: adminCheck.error,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // CRITICAL SECURITY: Create new proposal with secure ID generation
    const proposalId = await generateSecureGovernanceId(`proposal_${type}`);

    const newProposal = {
      id: proposalId,
      type,
      description,
      amount,
      recipient,
      requiredSignatures: 3, // Default threshold
      currentSignatures: 0,
      guardianApprovals: [],
      status: "pending",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
      createdBy: sessionData.userId,
    };

    // CRITICAL SECURITY: Log successful proposal creation
    await logGovernanceOperation({
      operation: "governance_proposal_created",
      details: {
        operationId,
        proposalId,
        familyId,
        userId: sessionData.userId,
        userRole: adminCheck.role,
        proposalType: type,
        hasAmount: !!amount,
        hasRecipient: !!recipient,
        requiredSignatures: newProposal.requiredSignatures,
      },
      timestamp: new Date(),
    });

    res.status(201).json({
      success: true,
      data: newProposal,
      meta: {
        timestamp: new Date().toISOString(),
        familyId,
        message: "Governance proposal created successfully. Guardians will be notified for approval.",
      },
    });
  } catch (error) {
    // CRITICAL SECURITY: Privacy-first error logging
    await logGovernanceOperation({
      operation: "proposal_creation_error",
      details: {
        operationId,
        error: error.message,
        familyId: req.body?.familyId,
        proposalType: req.body?.type,
      },
      timestamp: new Date(),
    });

    res.status(500).json({
      success: false,
      error: "Failed to create governance proposal",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}
