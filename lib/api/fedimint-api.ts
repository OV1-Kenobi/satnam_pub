// lib/api/fedimint-api.ts
import { ECashNote, FederationInfo, Proposal } from "@/lib/fedimint/types";

export class FedimintAPI {
  private baseUrl: string;

  constructor(baseUrl: string = "/api/fedimint") {
    this.baseUrl = baseUrl;
  }

  async createFederation(data: {
    name: string;
    description: string;
    guardianUrls: string[];
    threshold: number;
  }): Promise<{ federationId: string }> {
    const response = await fetch(`${this.baseUrl}/federation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...data }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to create federation`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to create federation");
    }

    return { federationId: result.federationId };
  }

  async joinFederation(inviteCode: string): Promise<{ federationId: string }> {
    const response = await fetch(`${this.baseUrl}/federation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", inviteCode }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to join federation`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to join federation");
    }

    return { federationId: result.federationId };
  }

  async getFederations(): Promise<FederationInfo[]> {
    const response = await fetch(`${this.baseUrl}/federation`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch federations`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to fetch federations");
    }

    return result.federations;
  }

  async getBalance(federationId: string): Promise<number> {
    const response = await fetch(`${this.baseUrl}/ecash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_balance", federationId }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to get balance`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to get balance");
    }

    return result.balance;
  }

  async issueECash(federationId: string, amount: number): Promise<ECashNote[]> {
    const response = await fetch(`${this.baseUrl}/ecash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "issue_ecash", federationId, amount }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to issue e-cash`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to issue e-cash");
    }

    return result.notes;
  }

  async createLightningInvoice(
    federationId: string,
    amount: number,
    description?: string,
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/ecash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_invoice",
        federationId,
        amount,
        description,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to create invoice`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to create invoice");
    }

    return result.invoice;
  }

  async payLightningInvoice(
    federationId: string,
    invoice: string,
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/ecash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pay_invoice", federationId, invoice }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to pay invoice`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to pay invoice");
    }

    return result.paymentHash;
  }

  async createProposal(
    federationId: string,
    type: Proposal["type"],
    description: string,
    requiredSignatures: number,
    amount?: number,
    recipient?: string,
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/governance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_proposal",
        federationId,
        type,
        description,
        requiredSignatures,
        amount,
        recipient,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to create proposal`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to create proposal");
    }

    return result.proposalId;
  }

  async getProposals(federationId: string): Promise<Proposal[]> {
    const response = await fetch(
      `${this.baseUrl}/governance?federationId=${federationId}`,
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch proposals`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to fetch proposals");
    }

    return result.proposals;
  }

  async voteOnProposal(
    federationId: string,
    proposalId: string,
    approve: boolean,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/governance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "vote",
        federationId,
        proposalId,
        approve,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to vote on proposal`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to vote on proposal");
    }
  }
}

// Export singleton instance
export const fedimintAPI = new FedimintAPI();
