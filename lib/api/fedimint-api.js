/**
 * Fedimint API Client
 * MASTER CONTEXT COMPLIANCE: Browser-only serverless architecture with privacy-first principles
 * Converted from TypeScript to JavaScript with comprehensive JSDoc
 */

/**
 * Environment variable getter with browser compatibility
 * @param {string} key - Environment variable key
 * @param {string} [defaultValue] - Default value if not found
 * @returns {string} Environment variable value
 */
function getEnvVar(key, defaultValue = '') {
  // Primary: import.meta.env for Vite/browser environments
  if (typeof window !== 'undefined' && window.import && window.import.meta && window.import.meta.env) {
    return window.import.meta.env[key] || defaultValue;
  }
  // Secondary: process.env for Node.js environments
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue;
  }
  return defaultValue;
}

/**
 * @typedef {Object} ECashNote
 * @property {string} id - Note ID
 * @property {number} amount - Amount in satoshis
 * @property {string} token - Encrypted token data
 * @property {string} federationId - Federation identifier
 * @property {string} createdAt - Creation timestamp
 */

/**
 * @typedef {Object} FederationInfo
 * @property {string} id - Federation ID
 * @property {string} name - Federation name
 * @property {string} description - Federation description
 * @property {string[]} guardianUrls - Guardian node URLs
 * @property {number} threshold - Signing threshold
 * @property {string} status - Federation status
 * @property {number} memberCount - Number of members
 */

/**
 * @typedef {Object} Proposal
 * @property {string} id - Proposal ID
 * @property {string} title - Proposal title
 * @property {string} description - Proposal description
 * @property {string} proposer - Proposer identifier
 * @property {string} status - Proposal status
 * @property {number} votesFor - Votes in favor
 * @property {number} votesAgainst - Votes against
 * @property {string} createdAt - Creation timestamp
 * @property {string} expiresAt - Expiration timestamp
 */

/**
 * @typedef {Object} FederationCreateData
 * @property {string} name - Federation name
 * @property {string} description - Federation description
 * @property {string[]} guardianUrls - Guardian node URLs
 * @property {number} threshold - Signing threshold
 */

/**
 * @typedef {Object} APIResponse
 * @template T
 * @property {boolean} success - Whether the operation was successful
 * @property {T} [data] - Response data if successful
 * @property {string} [error] - Error message if failed
 * @property {string} [message] - Additional message
 */

/**
 * Generate a privacy-preserving hash using Web Crypto API
 * @param {string} data - Data to hash
 * @param {string} [salt] - Optional salt
 * @returns {Promise<string>} Hashed data
 */
async function generatePrivacyHash(data, salt = '') {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const dataToHash = encoder.encode(data + salt);
    const hash = await crypto.subtle.digest('SHA-256', dataToHash);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Fallback for environments without Web Crypto API
    let hash = 0;
    const str = data + salt;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Fedimint API client for browser-based operations
 */
export class FedimintAPI {
  /**
   * @param {string} [baseUrl] - Base URL for API endpoints
   */
  constructor(baseUrl = "/api/fedimint") {
    this.baseUrl = baseUrl;
  }

  /**
   * Create a new federation
   * @param {FederationCreateData} data - Federation creation data
   * @returns {Promise<{federationId: string}>} Created federation ID
   */
  async createFederation(data) {
    try {
      const response = await fetch(`${this.baseUrl}/federation`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ action: "create", ...data }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to create federation`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to create federation");
      }

      return { federationId: result.data.federationId };
    } catch (error) {
      console.error("Error creating federation:", error);
      throw error;
    }
  }

  /**
   * Get federation information
   * @param {string} federationId - Federation ID
   * @returns {Promise<FederationInfo>} Federation information
   */
  async getFederation(federationId) {
    try {
      const response = await fetch(`${this.baseUrl}/federation/${federationId}`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to get federation`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to get federation");
      }

      return result.data;
    } catch (error) {
      console.error("Error getting federation:", error);
      throw error;
    }
  }

  /**
   * List all federations
   * @returns {Promise<FederationInfo[]>} Array of federation information
   */
  async listFederations() {
    try {
      const response = await fetch(`${this.baseUrl}/federations`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to list federations`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to list federations");
      }

      return result.data || [];
    } catch (error) {
      console.error("Error listing federations:", error);
      throw error;
    }
  }

  /**
   * Join an existing federation
   * @param {string} federationId - Federation ID to join
   * @param {string} inviteCode - Invitation code
   * @returns {Promise<{success: boolean}>} Join result
   */
  async joinFederation(federationId, inviteCode) {
    try {
      const response = await fetch(`${this.baseUrl}/federation/${federationId}/join`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ inviteCode }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to join federation`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to join federation");
      }

      return { success: true };
    } catch (error) {
      console.error("Error joining federation:", error);
      throw error;
    }
  }

  /**
   * Issue eCash notes
   * @param {string} federationId - Federation ID
   * @param {number} amount - Amount in satoshis
   * @returns {Promise<ECashNote>} Issued eCash note
   */
  async issueECash(federationId, amount) {
    try {
      // Generate privacy-safe note ID
      const noteId = await generatePrivacyHash(
        `${federationId}-${amount}-${Date.now()}`
      );

      const response = await fetch(`${this.baseUrl}/ecash/issue`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ 
          federationId, 
          amount,
          noteId
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to issue eCash`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to issue eCash");
      }

      return result.data;
    } catch (error) {
      console.error("Error issuing eCash:", error);
      throw error;
    }
  }

  /**
   * Redeem eCash notes
   * @param {string} token - eCash token to redeem
   * @returns {Promise<{amount: number, success: boolean}>} Redemption result
   */
  async redeemECash(token) {
    try {
      const response = await fetch(`${this.baseUrl}/ecash/redeem`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to redeem eCash`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to redeem eCash");
      }

      return result.data;
    } catch (error) {
      console.error("Error redeeming eCash:", error);
      throw error;
    }
  }

  /**
   * Get federation balance
   * @param {string} federationId - Federation ID
   * @returns {Promise<{balance: number}>} Federation balance
   */
  async getBalance(federationId) {
    try {
      const response = await fetch(`${this.baseUrl}/federation/${federationId}/balance`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to get balance`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to get balance");
      }

      return { balance: result.data.balance || 0 };
    } catch (error) {
      console.error("Error getting balance:", error);
      throw error;
    }
  }

  /**
   * Create a governance proposal
   * @param {string} federationId - Federation ID
   * @param {Object} proposalData - Proposal data
   * @param {string} proposalData.title - Proposal title
   * @param {string} proposalData.description - Proposal description
   * @returns {Promise<{proposalId: string}>} Created proposal ID
   */
  async createProposal(federationId, proposalData) {
    try {
      const proposalId = await generatePrivacyHash(
        `${federationId}-${proposalData.title}-${Date.now()}`
      );

      const response = await fetch(`${this.baseUrl}/federation/${federationId}/proposals`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ 
          ...proposalData,
          proposalId
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to create proposal`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to create proposal");
      }

      return { proposalId: result.data.proposalId };
    } catch (error) {
      console.error("Error creating proposal:", error);
      throw error;
    }
  }

  /**
   * Vote on a proposal
   * @param {string} federationId - Federation ID
   * @param {string} proposalId - Proposal ID
   * @param {boolean} vote - Vote (true for yes, false for no)
   * @returns {Promise<{success: boolean}>} Vote result
   */
  async voteOnProposal(federationId, proposalId, vote) {
    try {
      const response = await fetch(`${this.baseUrl}/federation/${federationId}/proposals/${proposalId}/vote`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ vote }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to vote on proposal`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to vote on proposal");
      }

      return { success: true };
    } catch (error) {
      console.error("Error voting on proposal:", error);
      throw error;
    }
  }

  /**
   * Get proposals for a federation
   * @param {string} federationId - Federation ID
   * @returns {Promise<Proposal[]>} Array of proposals
   */
  async getProposals(federationId) {
    try {
      const response = await fetch(`${this.baseUrl}/federation/${federationId}/proposals`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to get proposals`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to get proposals");
      }

      return result.data || [];
    } catch (error) {
      console.error("Error getting proposals:", error);
      throw error;
    }
  }
}

// Export utility functions
export { generatePrivacyHash };
