export interface FamilyMember {
  id: string;
  name: string;
  role: "offspring" | "adult" | "steward" | "guardian";
  lightningAddress: string;
  balance: number;
  spendingLimits?: {
    daily?: number;
    weekly?: number;
    requiresApproval?: number;
  };
  nipStatus: "verified" | "pending" | "none";
}

export interface Transaction {
  id: string;
  type: "sent" | "received";
  amount: number;
  from: string;
  to: string;
  memo?: string;
  timestamp: Date;
  privacyRouted: boolean;
  status: "completed" | "pending" | "failed";
}

export interface NodeStatus {
  phoenixd: {
    connected: boolean;
    automatedLiquidity: boolean;
    version?: string;
  };
  voltage: {
    connected: boolean;
    nodeId?: string;
  };
  lnproxy: {
    active: boolean;
    privacyLevel: "high" | "medium" | "low";
  };
  lnbits: {
    operational: boolean;
  };
}
