// lib/fedimint/federation-manager.ts
import { FedimintClient } from "./client";
import { FederationDiscovery, FederationInvite } from "./discovery";
import type { FederationInfo, FedimintConfig, Guardian } from "./types";

export class FederationManager {
  private federations: Map<string, FederationInfo> = new Map();
  private clients: Map<string, FedimintClient> = new Map();
  private discoveryService: FederationDiscovery = new FederationDiscovery();

  async createFederation(
    name: string,
    description: string,
    guardianUrls: string[],
    threshold: number,
  ): Promise<string> {
    const federationId = this.generateFederationId();

    const guardians: Guardian[] = guardianUrls.map((url, index) => ({
      id: `guardian_${index}`,
      url,
      publicKey: this.generateMockPubkey(),
      status: "offline",
      lastSeen: new Date(),
    }));

    const federation: FederationInfo = {
      id: federationId,
      name,
      description,
      guardians,
      threshold,
      currency: "BTC",
      epochHeight: 0,
      createdAt: new Date(),
    };

    this.federations.set(federationId, federation);

    // Register federation with discovery service
    this.discoveryService.registerFederation(federation);

    // Create and store client
    const config: FedimintConfig = {
      federationId,
      guardianUrls,
      threshold,
      totalGuardians: guardianUrls.length,
    };

    const client = new FedimintClient(config);
    this.clients.set(federationId, client);

    console.log(`🏛️ Created federation: ${name} (${federationId})`);
    return federationId;
  }

  async joinFederation(inviteCode: string): Promise<string> {
    // Validate invite through discovery service
    const invite = await this.discoveryService.validateInvite(inviteCode);
    if (!invite) {
      throw new Error("Invalid or expired invite code");
    }

    // Check if federation is already known
    let federation = this.federations.get(invite.federationId);
    if (!federation) {
      // If not known locally, we need to fetch federation info
      // In a real implementation, this would connect to the federation to get full details
      federation = await this.fetchFederationInfo(invite);
      this.federations.set(federation.id, federation);
      this.discoveryService.registerFederation(federation);
    }

    const config: FedimintConfig = {
      federationId: federation.id,
      guardianUrls: federation.guardians.map((g) => g.url),
      threshold: federation.threshold,
      totalGuardians: federation.guardians.length,
      inviteCode,
    };

    const client = new FedimintClient(config);
    this.clients.set(federation.id, client);

    console.log(`🤝 Joined federation: ${federation.name}`);
    return federation.id;
  }

  private async fetchFederationInfo(
    invite: FederationInvite,
  ): Promise<FederationInfo> {
    // In a real implementation, this would connect to the federation and fetch details
    // For now, we'll simulate based on the invite information
    const guardians: Guardian[] = Array.from(
      { length: invite.guardianCount },
      (_, index) => ({
        id: `guardian_${index}`,
        url: `https://guardian${index + 1}.${invite.federationId}.com`,
        publicKey: this.generateMockPubkey(),
        status: "online" as const,
        lastSeen: new Date(),
      }),
    );

    return {
      id: invite.federationId,
      name: invite.name,
      description: invite.description,
      guardians,
      threshold: invite.threshold,
      currency: "BTC",
      epochHeight: 0,
      createdAt: new Date(),
    };
  }

  private generateMockPubkey(): string {
    return Buffer.from(crypto.getRandomValues(new Uint8Array(33))).toString(
      "hex",
    );
  }

  private generateFederationId(): string {
    return `fed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getFederation(federationId: string): FederationInfo | undefined {
    return this.federations.get(federationId);
  }

  getClient(federationId: string): FedimintClient | undefined {
    return this.clients.get(federationId);
  }

  listFederations(): FederationInfo[] {
    return Array.from(this.federations.values());
  }

  async connectToFederation(federationId: string): Promise<boolean> {
    const client = this.getClient(federationId);
    if (!client) {
      throw new Error("Federation not found");
    }
    return await client.connect();
  }

  async deleteFederation(federationId: string): Promise<void> {
    if (!this.federations.has(federationId)) {
      throw new Error("Federation not found");
    }

    // Disconnect and clean up client if it exists
    const client = this.clients.get(federationId);
    if (client) {
      try {
        await client.disconnect();
      } catch (error) {
        console.warn(
          `Failed to disconnect client for federation ${federationId}:`,
          error,
        );
      }
      this.clients.delete(federationId);
    }

    // Remove federation from local storage
    this.federations.delete(federationId);

    // Unregister from discovery service
    this.discoveryService.unregisterFederation(federationId);

    console.log(`🗑️ Deleted federation: ${federationId}`);
  }

  // Discovery Service Integration Methods

  async createInvite(
    federationId: string,
    createdBy: string,
    expiresIn?: number,
  ): Promise<string> {
    if (!this.federations.has(federationId)) {
      throw new Error("Federation not found");
    }
    return await this.discoveryService.createInvite(
      federationId,
      createdBy,
      expiresIn,
    );
  }

  async validateInvite(inviteCode: string): Promise<FederationInvite | null> {
    return await this.discoveryService.validateInvite(inviteCode);
  }

  async discoverFederations(searchTerm?: string): Promise<FederationInfo[]> {
    return await this.discoveryService.discoverFederations(searchTerm);
  }

  async getGuardianHealth(federationId: string): Promise<Guardian[]> {
    return await this.discoveryService.getGuardianHealth(federationId);
  }

  // Enhanced federation management methods

  async getFederationWithHealth(
    federationId: string,
  ): Promise<(FederationInfo & { guardianHealth: Guardian[] }) | null> {
    const federation = this.getFederation(federationId);
    if (!federation) return null;

    const guardianHealth = await this.getGuardianHealth(federationId);
    return {
      ...federation,
      guardianHealth,
    };
  }

  async getAllFederationsWithHealth(): Promise<
    Array<FederationInfo & { guardianHealth: Guardian[] }>
  > {
    const federations = this.listFederations();
    const federationsWithHealth = await Promise.all(
      federations.map(async (federation) => {
        const guardianHealth = await this.getGuardianHealth(federation.id);
        return {
          ...federation,
          guardianHealth,
        };
      }),
    );
    return federationsWithHealth;
  }

  getDiscoveryService(): FederationDiscovery {
    return this.discoveryService;
  }
}
