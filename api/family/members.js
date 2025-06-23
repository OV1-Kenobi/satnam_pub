/**
 * Family Members Management API
 * GET /api/family/members - Get family members
 * POST /api/family/members - Add family member
 * PUT /api/family/members - Update family member
 * DELETE /api/family/members - Remove family member
 */

// Handle CORS
function setCorsHeaders(req, res) {
  const allowedOrigins = process.env.NODE_ENV === "production"
    ? [process.env.FRONTEND_URL || "https://satnam.pub"]
    : ["http://localhost:3000", "http://localhost:5173", "http://localhost:3002"];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// Mock family members data
const mockFamilyMembers = [
  {
    id: "parent1",
    name: "Dad",
    role: "parent",
    permissions: ["treasury", "allowances", "payments"],
    lightningAddress: "dad@satnam.family",
    balance: {
      lightning: 2500000,
      ecash: 500000,
    },
    status: "active",
    joinedAt: "2024-01-15T10:00:00Z",
  },
  {
    id: "parent2", 
    name: "Mom",
    role: "parent",
    permissions: ["treasury", "allowances", "payments"],
    lightningAddress: "mom@satnam.family",
    balance: {
      lightning: 1800000,
      ecash: 300000,
    },
    status: "active",
    joinedAt: "2024-01-15T10:05:00Z",
  },
  {
    id: "child1",
    name: "Arjun",
    role: "child",
    permissions: ["payments"],
    lightningAddress: "arjun@satnam.family",
    balance: {
      lightning: 50000,
      ecash: 25000,
    },
    allowance: {
      weekly: 10000,
      nextPayment: "2024-12-22T00:00:00Z",
    },
    status: "active",
    joinedAt: "2024-01-20T14:30:00Z",
  },
  {
    id: "child2",
    name: "Priya",
    role: "child", 
    permissions: ["payments"],
    lightningAddress: "priya@satnam.family",
    balance: {
      lightning: 35000,
      ecash: 15000,
    },
    allowance: {
      weekly: 8000,
      nextPayment: "2024-12-22T00:00:00Z",
    },
    status: "active",
    joinedAt: "2024-02-01T09:15:00Z",
  },
];

export default async function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res);

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    switch (req.method) {
      case "GET":
        // Get family members
        const { memberId } = req.query;
        
        if (memberId) {
          const member = mockFamilyMembers.find(m => m.id === memberId);
          if (!member) {
            res.status(404).json({
              success: false,
              error: "Family member not found",
              meta: {
                timestamp: new Date().toISOString(),
              },
            });
            return;
          }
          
          res.status(200).json({
            success: true,
            data: member,
            meta: {
              timestamp: new Date().toISOString(),
              demo: true,
            },
          });
        } else {
          res.status(200).json({
            success: true,
            data: {
              members: mockFamilyMembers,
              totalMembers: mockFamilyMembers.length,
              activeMembers: mockFamilyMembers.filter(m => m.status === "active").length,
            },
            meta: {
              timestamp: new Date().toISOString(),
              demo: true,
            },
          });
        }
        break;

      case "POST":
        // Add new family member
        const newMember = req.body;
        
        if (!newMember.name || !newMember.role) {
          res.status(400).json({
            success: false,
            error: "Missing required fields: name and role are required",
            meta: {
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        const memberToAdd = {
          id: `member_${Date.now()}`,
          name: newMember.name,
          role: newMember.role,
          permissions: newMember.role === "parent" ? ["treasury", "allowances", "payments"] : ["payments"],
          lightningAddress: `${newMember.name.toLowerCase()}@satnam.family`,
          balance: {
            lightning: 0,
            ecash: 0,
          },
          status: "active",
          joinedAt: new Date().toISOString(),
        };

        res.status(201).json({
          success: true,
          data: memberToAdd,
          meta: {
            timestamp: new Date().toISOString(),
            demo: true,
          },
        });
        break;

      default:
        res.setHeader("Allow", ["GET", "POST"]);
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
      error: "Failed to process family members request",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}