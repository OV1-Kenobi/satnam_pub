import { z } from "zod";
import {
    SecureSessionManager,
} from "../../netlify/functions/security/session-manager.js";

function getEnvVar(key) {
  return process.env[key];
}

async function getApiBaseUrl() {
  const envUrl = getEnvVar("API_BASE_URL") || getEnvVar("VITE_API_BASE_URL");
  if (envUrl) return envUrl;
  return "https://api.satnam.pub";
}

/**
 * @typedef {Object} FederationGovernance
 * @property {string} federationId
 * @property {number} totalGuardians
 * @property {number} activeGuardians
 * @property {number} consensusThreshold
 * @property {number} pendingProposals
 * @property {Date} lastConsensus
 * @property {boolean} emergencyMode
 * @property {Guardian[]} guardians
 * @property {Proposal[]} proposals
 * @property {EmergencyProtocol[]} emergencyProtocols
 */

/**
 * @typedef {Object} Guardian
 * @property {string} id
 * @property {string} name
 * @property {string} publicKey
 * @property {"active"|"inactive"|"suspended"} status
 * @property {number} votingPower
 * @property {Date} lastActivity
 * @property {number} reputation
 * @property {"private"|"offspring"|"adult"|"steward"|"guardian"} familyRole
 * @property {string[]} emergencyContacts
 */

/**
 * @typedef {Object} Proposal
 * @property {string} id
 * @property {"spending_limit"|"guardian_addition"|"guardian_removal"|"emergency_protocol"|"configuration_change"} type
 * @property {string} title
 * @property {string} description
 * @property {string} proposer
 * @property {"pending"|"voting"|"approved"|"rejected"|"executed"} status
 * @property {number} votesFor
 * @property {number} votesAgainst
 * @property {number} requiredVotes
 * @property {Date} createdAt
 * @property {Date} votingDeadline
 * @property {Date} [executionDate]
 * @property {Object} metadata
 */

/**
 * @typedef {Object} EmergencyProtocol
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string[]} triggerConditions
 * @property {string[]} actions
 * @property {number} requiredApprovals
 * @property {boolean} isActive
 * @property {Date} [lastTriggered]
 * @property {number} successRate
 */

/**
 * @typedef {Object} Vote
 * @property {string} proposalId
 * @property {string} guardianId
 * @property {"for"|"against"|"abstain"} vote
 * @property {string} [reason]
 * @property {Date} timestamp
 */

const MOCK_GUARDIANS = [
  {
    id: "guardian_satoshi",
    name: "Satoshi Nakamoto",
    publicKey: "02a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789ab",
    status: "active",
    votingPower: 2,
    lastActivity: new Date(),
    reputation: 98,
    familyRole: "guardian",
    emergencyContacts: ["hal@satnam.pub", "+1-555-0123"],
  },
  {
    id: "guardian_hal",
    name: "Hal Finney",
    publicKey: "03b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789abc1",
    status: "active",
    votingPower: 2,
    lastActivity: new Date(Date.now() - 30 * 60 * 1000),
    reputation: 95,
    familyRole: "guardian",
    emergencyContacts: ["satoshi@satnam.pub", "+1-555-0124"],
  },
  {
    id: "guardian_nick",
    name: "Nick Szabo",
    publicKey: "04c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789abcd2",
    status: "active",
    votingPower: 1,
    lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000),
    reputation: 92,
    familyRole: "guardian",
    emergencyContacts: ["satoshi@satnam.pub", "hal@satnam.pub"],
  },
  {
    id: "guardian_adam",
    name: "Adam Back",
    publicKey: "05d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789abcde3",
    status: "active",
    votingPower: 1,
    lastActivity: new Date(Date.now() - 4 * 60 * 60 * 1000),
    reputation: 88,
    familyRole: "guardian",
    emergencyContacts: ["satoshi@satnam.pub"],
  },
  {
    id: "guardian_gavin",
    name: "Gavin Andresen",
    publicKey: "06e5f6789abcdef0123456789abcdef0123456789abcdef0123456789abcdef4",
    status: "active",
    votingPower: 1,
    lastActivity: new Date(Date.now() - 6 * 60 * 60 * 1000),
    reputation: 90,
    familyRole: "guardian",
    emergencyContacts: ["satoshi@satnam.pub"],
  },
];

const MOCK_PROPOSAL_TEMPLATES = [
  {
    id: "prop_spending_limit_2024_001",
    type: "spending_limit",
    title: "Increase Alice's Weekly Spending Limit",
    description: "Proposal to increase Alice's weekly spending limit from 50,000 to 75,000 sats due to increased responsibilities and good spending behavior.",
    proposer: "guardian_satoshi",
    requiredVotes: 3,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    votingDeadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    metadata: {
      memberId: "alice_nakamoto",
      currentLimit: 50000,
      proposedLimit: 75000,
      reason: "increased_responsibility",
    },
  },
  {
    id: "prop_emergency_protocol_2024_002",
    type: "emergency_protocol",
    title: "Update Emergency Recovery Protocol",
    description: "Update the emergency recovery protocol to include new multi-signature requirements and backup guardian procedures.",
    proposer: "guardian_hal",
    requiredVotes: 4,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    votingDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    metadata: {
      protocolVersion: "2.1",
      changes: ["multi_sig_threshold", "backup_guardians", "notification_system"],
    },
  },
];

const mockVoteStorage = new Map();

function initializeMockVotes() {
  const spendingProposal = MOCK_PROPOSAL_TEMPLATES.find((p) => p.type === "spending_limit");
  if (spendingProposal) {
    mockVoteStorage.set(spendingProposal.id, [
      {
        proposalId: spendingProposal.id,
        guardianId: "guardian_satoshi",
        vote: "for",
        reason: "Alice has shown responsible spending behavior",
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
      {
        proposalId: spendingProposal.id,
        guardianId: "guardian_hal",
        vote: "for",
        reason: "Agreed, she's been very responsible",
        timestamp: new Date(Date.now() - 20 * 60 * 60 * 1000),
      },
    ]);
  }

  const emergencyProposal = MOCK_PROPOSAL_TEMPLATES.find((p) => p.type === "emergency_protocol");
  if (emergencyProposal) {
    mockVoteStorage.set(emergencyProposal.id, [
      {
        proposalId: emergencyProposal.id,
        guardianId: "guardian_hal",
        vote: "for",
        reason: "Important security improvement",
        timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
    ]);
  }
}

initializeMockVotes();

function calculateVoteResults(proposalId, guardians) {
  const votes = mockVoteStorage.get(proposalId) || [];
  const guardianPowerMap = new Map(guardians.map((g) => [g.id, g.votingPower]));

  let votesFor = 0;
  let votesAgainst = 0;
  let votesAbstain = 0;
  let totalVotingPower = 0;

  const votedGuardians = new Set();

  for (const vote of votes) {
    if (!votedGuardians.has(vote.guardianId)) {
      const votingPower = guardianPowerMap.get(vote.guardianId) || 1;

      switch (vote.vote) {
        case "for":
          votesFor += votingPower;
          break;
        case "against":
          votesAgainst += votingPower;
          break;
        case "abstain":
          votesAbstain += votingPower;
          break;
      }

      totalVotingPower += votingPower;
      votedGuardians.add(vote.guardianId);
    }
  }

  return {
    votesFor,
    votesAgainst,
    votesAbstain,
    totalVotingPower,
    totalVotes: votes.length,
    uniqueVoters: votedGuardians.size,
  };
}

function checkConsensus(proposalType, voteResults, requiredVotes, totalGuardians) {
  const { votesFor, votesAgainst, totalVotingPower } = voteResults;

  switch (proposalType) {
    case "emergency_protocol":
    case "guardian_removal": {
      const criticalThreshold = Math.ceil(totalVotingPower * 0.75);
      return {
        consensusReached: votesFor >= criticalThreshold,
        status: votesFor >= criticalThreshold ? "approved" : votesAgainst >= criticalThreshold ? "rejected" : "voting",
      };
    }

    case "guardian_addition": {
      const majorityThreshold = Math.ceil(totalGuardians * 0.6);
      return {
        consensusReached: votesFor >= majorityThreshold,
        status: votesFor >= majorityThreshold ? "approved" : votesAgainst >= majorityThreshold ? "rejected" : "voting",
      };
    }

    default:
      return {
        consensusReached: votesFor >= requiredVotes,
        status: votesFor >= requiredVotes ? "approved" : votesAgainst >= requiredVotes ? "rejected" : "voting",
      };
  }
}

/**
 * Get Federation Governance Status
 * GET /api/federation/governance
 */
export async function getFederationGovernance(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const sessionData = await SecureSessionManager.validateSessionFromHeader(authHeader);

    if (!sessionData?.isAuthenticated || !sessionData.sessionToken) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (sessionData.federationRole !== "guardian") {
      res.status(403).json({
        success: false,
        error: "Guardian privileges required",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const mockGovernance = {
      federationId: "fed_nakamoto_family_2024",
      totalGuardians: 5,
      activeGuardians: 5,
      consensusThreshold: 3,
      pendingProposals: 2,
      lastConsensus: new Date(Date.now() - 10 * 60 * 1000),
      emergencyMode: false,
      guardians: MOCK_GUARDIANS,
      proposals: [],
      emergencyProtocols: [],
    };

    const proposalTemplates = MOCK_PROPOSAL_TEMPLATES;

    mockGovernance.proposals = proposalTemplates.map((template) => {
      const voteResults = calculateVoteResults(template.id, mockGovernance.guardians);
      const consensusResult = checkConsensus(template.type, voteResults, template.requiredVotes, mockGovernance.totalGuardians);

      return {
        ...template,
        status: consensusResult.status,
        votesFor: voteResults.votesFor,
        votesAgainst: voteResults.votesAgainst,
        executionDate: consensusResult.consensusReached ? new Date() : undefined,
      };
    });

    mockGovernance.emergencyProtocols = [
      {
        id: "emergency_recovery_v2",
        name: "Emergency Recovery Protocol v2.0",
        description: "Multi-signature emergency recovery with backup guardian procedures",
        triggerConditions: ["Guardian majority offline", "Suspected key compromise", "Critical system failure"],
        actions: ["Freeze all transactions", "Notify all guardians", "Initiate backup procedures", "Execute recovery protocol"],
        requiredApprovals: 4,
        isActive: true,
        successRate: 95,
      },
      {
        id: "spending_freeze_protocol",
        name: "Emergency Spending Freeze",
        description: "Immediate freeze of all spending above threshold limits",
        triggerConditions: ["Unusual spending patterns detected", "Guardian consensus failure", "Security breach suspected"],
        actions: ["Freeze high-value transactions", "Require additional approvals", "Audit recent transactions", "Notify family members"],
        requiredApprovals: 3,
        isActive: true,
        lastTriggered: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        successRate: 88,
      },
    ];

    res.status(200).json({
      success: true,
      data: mockGovernance,
      message: "Federation governance status retrieved successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve federation governance status",
      message: error instanceof Error ? error.message : "Unknown error occurred",
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Cast Vote on Federation Proposal
 * POST /api/federation/governance/vote
 */
export async function castVote(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const sessionData = await SecureSessionManager.validateSessionFromHeader(authHeader);

    if (!sessionData?.isAuthenticated || !sessionData.sessionToken) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (sessionData.federationRole !== "guardian") {
      res.status(403).json({
        success: false,
        error: "Guardian privileges required",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const voteSchema = z.object({
      proposalId: z.string().min(1),
      guardianId: z.string().min(1),
      vote: z.enum(["for", "against", "abstain"]),
      reason: z.string().max(500).optional(),
    });

    const validationResult = voteSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Invalid vote data",
        details: validationResult.error.errors,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const voteData = validationResult.data;

    const vote = {
      proposalId: voteData.proposalId,
      guardianId: voteData.guardianId,
      vote: voteData.vote,
      reason: voteData.reason,
      timestamp: new Date(),
    };

    const existingVotes = mockVoteStorage.get(voteData.proposalId) || [];
    const filteredVotes = existingVotes.filter((v) => v.guardianId !== voteData.guardianId);
    filteredVotes.push(vote);
    mockVoteStorage.set(voteData.proposalId, filteredVotes);

    const mockGuardians = MOCK_GUARDIANS;
    const voteResults = calculateVoteResults(voteData.proposalId, mockGuardians);

    const proposalType = voteData.proposalId.includes("emergency") ? "emergency_protocol" : "spending_limit";
    const requiredVotes = proposalType === "emergency_protocol" ? 4 : 3;

    const consensusResult = checkConsensus(proposalType, voteResults, requiredVotes, mockGuardians.length);

    res.status(200).json({
      success: true,
      data: {
        vote,
        voteResults: {
          proposalId: voteData.proposalId,
          totalVotes: voteResults.totalVotes,
          uniqueVoters: voteResults.uniqueVoters,
          votesFor: voteResults.votesFor,
          votesAgainst: voteResults.votesAgainst,
          votesAbstain: voteResults.votesAbstain,
          totalVotingPower: voteResults.totalVotingPower,
          consensusReached: consensusResult.consensusReached,
          proposalStatus: consensusResult.status,
        },
      },
      message: `Vote cast successfully. ${
        consensusResult.consensusReached
          ? `Consensus reached - proposal ${consensusResult.status}.`
          : "Waiting for more votes."
      }`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to cast vote",
      message: error instanceof Error ? error.message : "Unknown error occurred",
      timestamp: new Date().toISOString(),
    });
  }
}

export function getProposalVoteStatus(proposalId, guardians) {
  const voteResults = calculateVoteResults(proposalId, guardians);
  const votes = mockVoteStorage.get(proposalId) || [];

  return {
    proposalId,
    votes,
    summary: {
      totalVotes: voteResults.totalVotes,
      uniqueVoters: voteResults.uniqueVoters,
      votesFor: voteResults.votesFor,
      votesAgainst: voteResults.votesAgainst,
      votesAbstain: voteResults.votesAbstain,
      totalVotingPower: voteResults.totalVotingPower,
    },
  };
}
