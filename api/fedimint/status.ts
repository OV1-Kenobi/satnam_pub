import { setCorsHeaders } from "../utils/cors";

// Note: CORS handling is now managed by the shared utility

interface FedimintStatus {
  federationId: string;
  federationName: string;
  isOnline: boolean;
  guardianCount: number;
  activeGuardians: number;
  consensusHeight: number;
  totalEcash: number;
  familyBalance: number;
  lastConsensus: Date;
  network: "mainnet" | "testnet" | "regtest";
  guardians: Guardian[];
}

interface Guardian {
  id: string;
  name: string;
  isOnline: boolean;
  lastSeen: Date;
  votingPower: number;
}

/**
 * Fedimint Federation Status API Endpoint
 * GET /api/fedimint/status - Get Fedimint federation status
 */
export default async function handler(req: any, res: any) {
  // Set CORS headers with appropriate methods for this endpoint
  setCorsHeaders(req, res, { methods: "GET, POST, OPTIONS" });

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).json({
      success: false,
      error: "Method not allowed",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  try {
    // In a real implementation, this would connect to your Fedimint federation
    // const fedimintClient = new FedimintClient(process.env.FEDERATION_CONFIG);
    // const status = await fedimintClient.getStatus();

    // Mock Fedimint status for demonstration
    const mockStatus: FedimintStatus = {
      federationId: "fed_satnam_family_2024",
      federationName: "Satnam Family Federation",
      isOnline: true,
      guardianCount: 5,
      activeGuardians: 5,
      consensusHeight: 15420,
      totalEcash: 25000000, // 0.25 BTC worth of ecash
      familyBalance: 8500000, // 0.085 BTC family balance
      lastConsensus: new Date(Date.now() - 30000), // 30 seconds ago
      network: "mainnet",
      guardians: [
        {
          id: "guardian_dad",
          name: "Dad's Guardian",
          isOnline: true,
          lastSeen: new Date(),
          votingPower: 2,
        },
        {
          id: "guardian_mom",
          name: "Mom's Guardian",
          isOnline: true,
          lastSeen: new Date(Date.now() - 60000),
          votingPower: 2,
        },
        {
          id: "guardian_uncle",
          name: "Uncle's Guardian",
          isOnline: true,
          lastSeen: new Date(Date.now() - 120000),
          votingPower: 1,
        },
        {
          id: "guardian_aunt",
          name: "Aunt's Guardian",
          isOnline: true,
          lastSeen: new Date(Date.now() - 180000),
          votingPower: 1,
        },
        {
          id: "guardian_grandpa",
          name: "Grandpa's Guardian",
          isOnline: true,
          lastSeen: new Date(Date.now() - 300000),
          votingPower: 1,
        },
      ],
    };

    res.status(200).json({
      success: true,
      data: mockStatus,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("Fedimint status error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to retrieve Fedimint federation status",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}
