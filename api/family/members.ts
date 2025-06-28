import { randomBytes } from "crypto";

/**
 * Generate a secure, unique ID for family members
 * Format: fm_<timestamp>_<random_hex>
 * This prevents collisions even with concurrent requests
 */
const generateSecureId = (): string => {
  return `fm_${Date.now()}_${randomBytes(8).toString("hex")}`;
};

// Enhanced Family Member interface with Lightning and eCash support
interface FamilyMember {
  id: string;
  username: string;
  lightningAddress: string;
  role: "parent" | "child" | "guardian";
  spendingLimits?: {
    daily: number;
    weekly: number;
  };
  nip05Verified: boolean;
  balance?: number;
  lightningBalance?: number; // New: Lightning Network balance
  ecashBalance?: number; // New: Fedimint eCash balance
  phoenixdChannels?: PhoenixDChannel[]; // New: Lightning channels
  federationMembership?: FederationMembership; // New: Fedimint membership
  recentActivity?: {
    lastTransaction: string;
    transactionCount24h: number;
    lightningTransactions24h?: number;
    ecashTransactions24h?: number;
  };
}

// New interfaces for enhanced functionality
interface PhoenixDChannel {
  id: string;
  capacity: number;
  localBalance: number;
  remoteBalance: number;
  status: "active" | "inactive" | "pending";
  peer: string;
}

interface FederationMembership {
  federationId: string;
  guardianStatus: "active" | "inactive" | "pending";
  votingPower: number;
  lastActivity: Date;
}

// Enhanced mock data with Lightning and eCash balances
const mockFamilyMembers: FamilyMember[] = [
  {
    id: "1",
    username: "satnam_dad",
    lightningAddress: "satnam_dad@satnam.pub",
    role: "parent",
    nip05Verified: true,
    balance: 5000000, // 5M sats total
    lightningBalance: 3200000, // 3.2M sats in Lightning
    ecashBalance: 1800000, // 1.8M sats in eCash
    phoenixdChannels: [
      {
        id: "ch_dad_acinq_001",
        capacity: 5000000,
        localBalance: 3000000,
        remoteBalance: 2000000,
        status: "active",
        peer: "ACINQ",
      },
    ],
    federationMembership: {
      federationId: "fed_satnam_family",
      guardianStatus: "active",
      votingPower: 2,
      lastActivity: new Date(),
    },
    recentActivity: {
      lastTransaction: "2 hours ago",
      transactionCount24h: 12,
      lightningTransactions24h: 8,
      ecashTransactions24h: 4,
    },
  },
  {
    id: "2",
    username: "satnam_mom",
    lightningAddress: "satnam_mom@satnam.pub",
    role: "parent",
    nip05Verified: true,
    balance: 3500000, // 3.5M sats total
    lightningBalance: 2100000, // 2.1M sats in Lightning
    ecashBalance: 1400000, // 1.4M sats in eCash
    federationMembership: {
      federationId: "fed_satnam_family",
      guardianStatus: "active",
      votingPower: 2,
      lastActivity: new Date(Date.now() - 30 * 60 * 1000),
    },
    recentActivity: {
      lastTransaction: "5 minutes ago",
      transactionCount24h: 8,
      lightningTransactions24h: 5,
      ecashTransactions24h: 3,
    },
  },
  {
    id: "3",
    username: "arjun_teen",
    lightningAddress: "arjun_teen@satnam.pub",
    role: "child",
    spendingLimits: {
      daily: 100000, // 100k sats daily
      weekly: 500000, // 500k sats weekly
    },
    nip05Verified: true,
    balance: 150000, // 150k sats total
    lightningBalance: 90000, // 90k sats in Lightning
    ecashBalance: 60000, // 60k sats in eCash
    recentActivity: {
      lastTransaction: "1 hour ago",
      transactionCount24h: 3,
      lightningTransactions24h: 2,
      ecashTransactions24h: 1,
    },
  },
  {
    id: "4",
    username: "priya_kid",
    lightningAddress: "priya_kid@satnam.pub",
    role: "child",
    spendingLimits: {
      daily: 50000, // 50k sats daily
      weekly: 200000, // 200k sats weekly
    },
    nip05Verified: false,
    balance: 75000, // 75k sats total
    lightningBalance: 25000, // 25k sats in Lightning
    ecashBalance: 50000, // 50k sats in eCash
    recentActivity: {
      lastTransaction: "3 hours ago",
      transactionCount24h: 1,
      lightningTransactions24h: 0,
      ecashTransactions24h: 1,
    },
  },
  {
    id: "5",
    username: "kiran_child",
    lightningAddress: "kiran_child@satnam.pub",
    role: "child",
    spendingLimits: {
      daily: 25000, // 25k sats daily
      weekly: 100000, // 100k sats weekly
    },
    nip05Verified: true,
    balance: 45000, // 45k sats total
    lightningBalance: 20000, // 20k sats in Lightning
    ecashBalance: 25000, // 25k sats in eCash
    recentActivity: {
      lastTransaction: "6 hours ago",
      transactionCount24h: 2,
      lightningTransactions24h: 1,
      ecashTransactions24h: 1,
    },
  },
];

import { ApiRequest, ApiResponse } from "../../types/api";
import { setCorsHeaders } from "../../utils/cors";

// Note: CORS handling is now managed by the shared utility

/**
 * Family Members API Endpoint
 * GET /api/family/members - Get all family members
 * POST /api/family/members - Create a new family member
 * PUT /api/family/members - Update a family member (requires id in query)
 * DELETE /api/family/members - Delete a family member (requires id in query)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Set CORS headers with appropriate methods for this endpoint
  setCorsHeaders(req, res, { methods: "GET, POST, PUT, DELETE, OPTIONS" });

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    switch (req.method) {
      case "GET":
        await handleGetMembers(req, res);
        break;
      case "POST":
        await handleCreateMember(req, res);
        break;
      case "PUT":
        await handleUpdateMember(req, res);
        break;
      case "DELETE":
        await handleDeleteMember(req, res);
        break;
      default:
        res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
        res.status(405).json({
          success: false,
          error: "Method not allowed",
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
    }
  } catch (error) {
    console.error("Family members API error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Handle GET requests - Retrieve family members
 */
async function handleGetMembers(req: ApiRequest, res: ApiResponse) {
  const { familyId, role, verified } = req.query;

  let members = [...mockFamilyMembers];

  // Filter by family ID (in a real implementation, this would query the database)
  if (familyId && typeof familyId === "string") {
    // For demo purposes, we'll return all members regardless of familyId
    // In production, this would filter by actual family membership
  }

  // Filter by role
  if (role && typeof role === "string") {
    members = members.filter((member) => member.role === role);
  }

  // Filter by verification status
  if (verified !== undefined) {
    const isVerified = verified === "true";
    members = members.filter((member) => member.nip05Verified === isVerified);
  }

  // Simulate network delay for realistic demo
  await new Promise((resolve) => setTimeout(resolve, 300));

  res.status(200).json({
    success: true,
    data: members,
    meta: {
      total: members.length,
      timestamp: new Date().toISOString(),
      demo: true, // Indicates this is mock data
    },
  });
}

/**
 * Handle POST requests - Create a new family member
 */
async function handleCreateMember(req: ApiRequest, res: ApiResponse) {
  const { username, role, spendingLimits } = req.body;

  // Validate required fields
  if (!username || !role) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields",
      required: ["username", "role"],
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Validate role
  if (!["parent", "child", "guardian"].includes(role)) {
    return res.status(400).json({
      success: false,
      error: "Invalid role",
      validRoles: ["parent", "child", "guardian"],
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Check if username already exists
  const existingMember = mockFamilyMembers.find(
    (member) => member.username === username
  );
  if (existingMember) {
    return res.status(409).json({
      success: false,
      error: "Username already exists",
      username,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Create new member
  const newMember: FamilyMember = {
    id: generateSecureId(),
    username,
    lightningAddress: `${username}@satnam.pub`,
    role,
    spendingLimits: role === "child" ? spendingLimits : undefined,
    nip05Verified: false, // New members start unverified
    balance: 0,
    recentActivity: {
      lastTransaction: "Never",
      transactionCount24h: 0,
    },
  };

  // Add to mock data (in production, this would save to database)
  mockFamilyMembers.push(newMember);

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  res.status(201).json({
    success: true,
    data: newMember,
    message: "Family member created successfully",
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Handle PUT requests - Update a family member
 */
async function handleUpdateMember(req: ApiRequest, res: ApiResponse) {
  const { id } = req.query;
  const updates = req.body;

  if (!id || typeof id !== "string") {
    return res.status(400).json({
      success: false,
      error: "Member ID is required",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  const memberIndex = mockFamilyMembers.findIndex((member) => member.id === id);
  if (memberIndex === -1) {
    return res.status(404).json({
      success: false,
      error: "Family member not found",
      id,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Update member (in production, this would update the database)
  const updatedMember = {
    ...mockFamilyMembers[memberIndex],
    ...updates,
    // Prevent changing certain fields
    id: mockFamilyMembers[memberIndex].id,
    lightningAddress: mockFamilyMembers[memberIndex].lightningAddress,
    federationMembership: mockFamilyMembers[memberIndex].federationMembership, // Protect federation data
    phoenixdChannels: mockFamilyMembers[memberIndex].phoenixdChannels, // Protect channel data
  };

  mockFamilyMembers[memberIndex] = updatedMember;

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  res.status(200).json({
    success: true,
    data: updatedMember,
    message: "Family member updated successfully",
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Handle DELETE requests - Delete a family member
 */
async function handleDeleteMember(req: ApiRequest, res: ApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({
      success: false,
      error: "Member ID is required",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  const memberIndex = mockFamilyMembers.findIndex((member) => member.id === id);
  if (memberIndex === -1) {
    return res.status(404).json({
      success: false,
      error: "Family member not found",
      id,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Remove member (in production, this would delete from database)
  const deletedMember = mockFamilyMembers.splice(memberIndex, 1)[0];

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  res.status(200).json({
    success: true,
    data: deletedMember,
    message: "Family member deleted successfully",
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}
