// lib/fedimint/types.ts
export interface FedimintConfig {
  federationId: string;
  guardianUrls: string[];
  threshold: number;
  totalGuardians: number;
  inviteCode?: string;
}

export interface Guardian {
  id: string;
  url: string;
  publicKey: string;
  status: "online" | "offline" | "syncing";
  lastSeen: Date;
}

export interface ECashNote {
  amount: number;
  noteId: string;
  spendKey: string;
  denomination: number;
  issuedAt: Date;
  expiresAt?: Date;
}

export interface FederationInfo {
  id: string;
  name: string;
  description: string;
  guardians: Guardian[];
  threshold: number;
  currency: "BTC" | "msat";
  epochHeight: number;
  createdAt: Date;
}

export interface ProposalRequest {
  type: "credential_issuance" | "treasury_withdrawal" | "policy_change";
  description: string;
  amount?: number;
  recipient?: string;
  metadata?: Record<string, any>;
}

export interface Proposal {
  id: string;
  type: "credential_issuance" | "treasury_withdrawal" | "policy_change";
  description: string;
  amount?: number;
  recipient?: string;
  metadata?: Record<string, any>;
  status: "pending" | "approved" | "rejected";
  signatures: number;
  requiredSignatures: number;
  createdAt: Date;
  expiresAt?: Date;
  createdBy: string;
}
