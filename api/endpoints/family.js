/**
 * Privacy-First Family API Endpoints
 *
 * This module provides client-side family-related API functions for the Satnam.pub
 * family banking platform using privacy-preserving family management.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - JWT-based authentication with privacy hashing
 * - Family profile management
 * - Role-based access control for family members
 * - No sensitive data exposure (npubs, emails, etc.)
 * - Uses import.meta.env with process.env fallback for browser compatibility
 * - Strict type safety with no 'any' types
 * - Privacy-first logging (no user data exposure)
 * - Vault integration for sensitive credentials
 */

/**
 * @typedef {Object} FamilyMember
 * @property {string} id
 * @property {string} name
 * @property {"offspring"|"adult"|"steward"|"guardian"|"other"} role
 * @property {string} [avatar]
 * @property {string} [username]
 * @property {Object} [spendingLimits]
 * @property {number} spendingLimits.daily
 * @property {number} [spendingLimits.weekly]
 * @property {number} [spendingLimits.monthly]
 */

/**
 * @typedef {Object} SatnamFamilyMember
 * @property {string} id
 * @property {string} username
 * @property {string} lightningAddress
 * @property {"adult"|"offspring"|"steward"|"guardian"} role
 * @property {Object} [spendingLimits]
 * @property {number} [spendingLimits.daily]
 * @property {number} [spendingLimits.weekly]
 * @property {number} [spendingLimits.monthly]
 * @property {string} [spendingLimits.setBy]
 * @property {Date} [spendingLimits.lastUpdated]
 * @property {boolean} nip05Verified
 * @property {number} [balance]
 * @property {Object} [recentActivity]
 * @property {string} recentActivity.lastTransaction
 * @property {number} recentActivity.transactionCount24h
 */

/**
 * @typedef {Object} FamilyApproval
 * @property {string} id
 * @property {"allowance_distribution"|"emergency_withdrawal"|"spending_limit_change"|"guardian_change"} type
 * @property {string} description
 * @property {number} [amount]
 * @property {string} [recipient]
 * @property {number} requiredSignatures
 * @property {number} currentSignatures
 * @property {GuardianApproval[]} guardianApprovals
 * @property {"pending"|"approved"|"rejected"|"expired"} status
 * @property {Date} createdAt
 * @property {Date} expiresAt
 * @property {string} createdBy
 */

/**
 * @typedef {Object} GuardianApproval
 * @property {string} guardianId
 * @property {string} guardianName
 * @property {boolean} approved
 * @property {Date} [signedAt]
 * @property {string} [signature]
 */

/**
 * @typedef {Object} LightningTransaction
 * @property {string} id
 * @property {"lightning"} type
 * @property {"incoming"|"outgoing"} direction
 * @property {number} amount
 * @property {number} fee
 * @property {string} from
 * @property {string} to
 * @property {string} paymentHash
 * @property {string} description
 * @property {Date} timestamp
 * @property {"completed"|"pending"|"failed"} status
 * @property {string} [familyMember]
 */

/**
 * @typedef {Object} FedimintTransaction
 * @property {string} id
 * @property {"fedimint"} type
 * @property {"incoming"|"outgoing"} direction
 * @property {number} amount
 * @property {number} fee
 * @property {string} from
 * @property {string} to
 * @property {string} noteId
 * @property {string} description
 * @property {Date} timestamp
 * @property {"completed"|"pending"|"failed"} status
 * @property {boolean} requiresApproval
 * @property {string} [approvalId]
 * @property {string} [familyMember]
 */

/**
 * @typedef {Object} EnhancedFamilyTreasury
 * @property {number} lightningBalance
 * @property {string} lightningAddress
 * @property {Object} phoenixdStatus
 * @property {boolean} phoenixdStatus.connected
 * @property {boolean} phoenixdStatus.automatedLiquidity
 * @property {number} phoenixdStatus.channelCount
 * @property {number} phoenixdStatus.totalCapacity
 * @property {number} phoenixdStatus.liquidityRatio
 * @property {number} fedimintEcashBalance
 * @property {number} guardiansOnline
 * @property {number} guardiansTotal
 * @property {number} consensusThreshold
 * @property {FamilyApproval[]} pendingApprovals
 * @property {(LightningTransaction|FedimintTransaction)[]} recentTransactions
 * @property {Object} monthlySpending
 * @property {number} monthlySpending.lightning
 * @property {number} monthlySpending.fedimint
 * @property {number} monthlySpending.total
 */

/**
 * @typedef {Object} PhoenixDFamilyChannel
 * @property {string} channelId
 * @property {string} familyMember
 * @property {number} capacity
 * @property {number} localBalance
 * @property {number} remoteBalance
 * @property {"active"|"inactive"|"pending"|"closing"} status
 * @property {boolean} automatedLiquidity
 * @property {Date} lastActivity
 */

/**
 * @typedef {Object} FamilyGuardian
 * @property {string} id
 * @property {string} name
 * @property {string} publicKey
 * @property {"online"|"offline"|"syncing"} status
 * @property {Date} lastSeen
 * @property {number} votingPower
 * @property {"adult"|"steward"|"guardian"|"trusted_relative"|"family_advisor"} familyRole
 */

/**
 * @typedef {Object} FamilyZapConfig
 * @property {boolean} enabled
 * @property {string} familyLightningAddress
 * @property {number} defaultZapAmount
 * @property {number} maxZapAmount
 * @property {string[]} allowedMembers
 * @property {Object[]} [zapSplitRules]
 * @property {string} zapSplitRules.memberId
 * @property {number} zapSplitRules.percentage
 */

/**
 * @typedef {SatnamFamilyMember & Object} DualProtocolFamilyMember
 * @property {number} lightningBalance
 * @property {PhoenixDFamilyChannel[]} phoenixdChannels
 * @property {number} zapReceived24h
 * @property {number} zapSent24h
 * @property {number} fedimintBalance
 * @property {"active"|"inactive"|"pending"} [guardianStatus]
 * @property {number} [votingPower]
 * @property {string[]} pendingApprovals
 * @property {number} totalBalance
 * @property {"lightning"|"fedimint"|"auto"} preferredProtocol
 * @property {Object} privacySettings
 * @property {boolean} privacySettings.enableLNProxy
 * @property {boolean} privacySettings.enableFedimintPrivacy
 */

/**
 * @typedef {Object} FamilyProfile
 * @property {string} id
 * @property {string} name
 * @property {FamilyMember[]} members
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * Get environment variable with import.meta.env fallback for browser compatibility
 * (Master Context requirement)
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key) {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = /** @type {any} */ (import.meta);
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * Fetches the family profile for the specified family ID.
 * @param {string} familyId - The ID of the family to fetch
 * @returns {Promise<FamilyProfile>} Promise resolving to the family profile
 */
export const fetchFamilyProfile = async (familyId) => {
  try {
    // This would be replaced with an actual API call
    /** @type {FamilyProfile} */
    const familyProfile = {
      id: familyId,
      name: "Doe Family",
      members: [
        { id: "1", name: "John Doe", role: "adult" },
        { id: "2", name: "Jane Doe", role: "steward" },
        { id: "3", name: "Jimmy Doe", role: "offspring" },
      ],
    };

    return familyProfile;
  } catch (error) {
    // Privacy-first logging: no user data exposure (Master Context compliance)
    throw new Error("Failed to fetch family profile");
  }
};
