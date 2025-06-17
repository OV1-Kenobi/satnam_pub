// lib/fedimint/integrated-federation-api.ts
import { FederationInvite } from "./discovery";
import { FederationManager } from "./federation-manager";
import { FederationInfo, Guardian } from "./types";

export interface CreateFederationRequest {
  name: string;
  description: string;
  guardianUrls: string[];
  threshold: number;
}

export interface CreateInviteRequest {
  federationId: string;
  createdBy: string;
  expiresIn?: number; // milliseconds
}

export interface JoinFederationRequest {
  inviteCode: string;
}

export interface FederationWithHealth extends FederationInfo {
  guardianHealth: Guardian[];
  healthScore: number; // 0-100 based on online guardians
}

/**
 * Integrated Federation API
 * Combines Federation Management with Discovery Service
 */
export class IntegratedFederationAPI {
  private manager: FederationManager;

  constructor() {
    this.manager = new FederationManager();
  }

  // Federation Management
  async createFederation(request: CreateFederationRequest): Promise<{
    federationId: string;
    inviteCode: string;
  }> {
    const { name, description, guardianUrls, threshold } = request;

    // Create the federation
    const federationId = await this.manager.createFederation(
      name,
      description,
      guardianUrls,
      threshold,
    );

    // Create an initial invite code
    const inviteCode = await this.manager.createInvite(
      federationId,
      "system",
      7 * 24 * 60 * 60 * 1000, // 7 days
    );

    return { federationId, inviteCode };
  }

  async joinFederation(request: JoinFederationRequest): Promise<{
    federationId: string;
    federationInfo: FederationInfo;
  }> {
    const { inviteCode } = request;

    const federationId = await this.manager.joinFederation(inviteCode);
    const federationInfo = this.manager.getFederation(federationId);

    if (!federationInfo) {
      throw new Error("Failed to retrieve federation information");
    }

    return { federationId, federationInfo };
  }

  // Invite Management
  async createInvite(request: CreateInviteRequest): Promise<{
    inviteCode: string;
    expiresAt?: Date;
  }> {
    const { federationId, createdBy, expiresIn } = request;

    const inviteCode = await this.manager.createInvite(
      federationId,
      createdBy,
      expiresIn,
    );

    const invite = await this.manager.validateInvite(inviteCode);

    return {
      inviteCode,
      expiresAt: invite?.expiresAt,
    };
  }

  async validateInvite(inviteCode: string): Promise<FederationInvite | null> {
    return await this.manager.validateInvite(inviteCode);
  }

  // Discovery and Search
  async discoverFederations(searchTerm?: string): Promise<FederationInfo[]> {
    return await this.manager.discoverFederations(searchTerm);
  }

  async getFederationsByCategory(): Promise<{
    family: FederationInfo[];
    business: FederationInfo[];
    community: FederationInfo[];
    other: FederationInfo[];
  }> {
    const allFederations = await this.manager.discoverFederations();

    return {
      family: allFederations.filter(
        (fed) =>
          fed.name.toLowerCase().includes("family") ||
          fed.description.toLowerCase().includes("family"),
      ),
      business: allFederations.filter(
        (fed) =>
          fed.name.toLowerCase().includes("business") ||
          fed.name.toLowerCase().includes("corporate") ||
          fed.description.toLowerCase().includes("business") ||
          fed.description.toLowerCase().includes("corporate"),
      ),
      community: allFederations.filter(
        (fed) =>
          fed.name.toLowerCase().includes("community") ||
          fed.description.toLowerCase().includes("community"),
      ),
      other: allFederations.filter(
        (fed) =>
          !fed.name
            .toLowerCase()
            .match(/(family|business|corporate|community)/) &&
          !fed.description
            .toLowerCase()
            .match(/(family|business|corporate|community)/),
      ),
    };
  }

  // Health and Monitoring
  async getFederationHealth(
    federationId: string,
  ): Promise<FederationWithHealth> {
    const federationWithHealth =
      await this.manager.getFederationWithHealth(federationId);

    if (!federationWithHealth) {
      throw new Error("Federation not found");
    }

    const onlineGuardians = federationWithHealth.guardianHealth.filter(
      (g) => g.status === "online",
    ).length;
    const healthScore = Math.round(
      (onlineGuardians / federationWithHealth.guardianHealth.length) * 100,
    );

    return {
      ...federationWithHealth,
      healthScore,
    };
  }

  async getAllFederationsHealth(): Promise<FederationWithHealth[]> {
    const federationsWithHealth =
      await this.manager.getAllFederationsWithHealth();

    return federationsWithHealth.map((fed) => {
      const onlineGuardians = fed.guardianHealth.filter(
        (g) => g.status === "online",
      ).length;
      const healthScore = Math.round(
        (onlineGuardians / fed.guardianHealth.length) * 100,
      );

      return {
        ...fed,
        healthScore,
      };
    });
  }

  async getNetworkStatistics(): Promise<{
    totalFederations: number;
    totalGuardians: number;
    averageThreshold: number;
    healthDistribution: {
      healthy: number; // >= 80% guardians online
      moderate: number; // 50-79% guardians online
      unhealthy: number; // < 50% guardians online
    };
  }> {
    const allFederationsWithHealth = await this.getAllFederationsHealth();

    const totalFederations = allFederationsWithHealth.length;
    const totalGuardians = allFederationsWithHealth.reduce(
      (sum, fed) => sum + fed.guardians.length,
      0,
    );
    const averageThreshold =
      totalFederations > 0
        ? Math.round(
            allFederationsWithHealth.reduce(
              (sum, fed) => sum + fed.threshold,
              0,
            ) / totalFederations,
          )
        : 0;

    const healthDistribution = allFederationsWithHealth.reduce(
      (dist, fed) => {
        if (fed.healthScore >= 80) dist.healthy++;
        else if (fed.healthScore >= 50) dist.moderate++;
        else dist.unhealthy++;
        return dist;
      },
      { healthy: 0, moderate: 0, unhealthy: 0 },
    );

    return {
      totalFederations,
      totalGuardians,
      averageThreshold,
      healthDistribution,
    };
  }

  // Connection Management
  async connectToFederation(federationId: string): Promise<boolean> {
    return await this.manager.connectToFederation(federationId);
  }

  async connectToAllFederations(): Promise<{
    successful: string[];
    failed: string[];
  }> {
    const federations = this.manager.listFederations();
    const successful: string[] = [];
    const failed: string[] = [];

    await Promise.all(
      federations.map(async (federation) => {
        try {
          const connected = await this.manager.connectToFederation(
            federation.id,
          );
          if (connected) {
            successful.push(federation.id);
          } else {
            failed.push(federation.id);
          }
        } catch (error) {
          failed.push(federation.id);
        }
      }),
    );

    return { successful, failed };
  }

  // Utility Methods
  getFederation(federationId: string): FederationInfo | undefined {
    return this.manager.getFederation(federationId);
  }

  listFederations(): FederationInfo[] {
    return this.manager.listFederations();
  }

  getClient(federationId: string) {
    return this.manager.getClient(federationId);
  }

  // Direct access to underlying services (for advanced usage)
  getFederationManager(): FederationManager {
    return this.manager;
  }

  getDiscoveryService() {
    return this.manager.getDiscoveryService();
  }
}
