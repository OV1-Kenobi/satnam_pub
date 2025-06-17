// lib/fedimint/discovery.ts
import { FederationInfo, Guardian } from "./types";

export interface FederationInvite {
  federationId: string;
  name: string;
  description: string;
  inviteCode: string;
  guardianCount: number;
  threshold: number;
  expiresAt?: Date;
  createdBy: string;
}

export class FederationDiscovery {
  private invites: Map<string, FederationInvite> = new Map();
  private knownFederations: Map<string, FederationInfo> = new Map();

  async createInvite(
    federationId: string,
    createdBy: string,
    expiresIn?: number,
  ): Promise<string> {
    const federation = this.knownFederations.get(federationId);
    if (!federation) {
      throw new Error("Federation not found");
    }

    const inviteCode = this.generateInviteCode(federationId);
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn) : undefined;

    const invite: FederationInvite = {
      federationId,
      name: federation.name,
      description: federation.description,
      inviteCode,
      guardianCount: federation.guardians.length,
      threshold: federation.threshold,
      expiresAt,
      createdBy,
    };

    this.invites.set(inviteCode, invite);
    return inviteCode;
  }

  async validateInvite(inviteCode: string): Promise<FederationInvite | null> {
    const invite = this.invites.get(inviteCode);
    if (!invite) return null;

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      this.invites.delete(inviteCode);
      return null;
    }

    return invite;
  }

  async discoverFederations(searchTerm?: string): Promise<FederationInfo[]> {
    const federations = Array.from(this.knownFederations.values());

    if (!searchTerm) return federations;

    return federations.filter(
      (fed) =>
        fed.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fed.description.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }

  private generateInviteCode(federationId: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `fed_invite_${timestamp}_${random}`;
  }

  registerFederation(federation: FederationInfo): void {
    this.knownFederations.set(federation.id, federation);
  }

  unregisterFederation(federationId: string): void {
    this.knownFederations.delete(federationId);

    // Also remove any invites associated with this federation
    const invitesToRemove: string[] = [];
    for (const [inviteCode, invite] of this.invites.entries()) {
      if (invite.federationId === federationId) {
        invitesToRemove.push(inviteCode);
      }
    }

    invitesToRemove.forEach((inviteCode) => {
      this.invites.delete(inviteCode);
    });
  }

  async getGuardianHealth(federationId: string): Promise<Guardian[]> {
    const federation = this.knownFederations.get(federationId);
    if (!federation) {
      throw new Error("Federation not found");
    }

    // Simulate health checks
    return federation.guardians.map((guardian) => ({
      ...guardian,
      status: Math.random() > 0.2 ? "online" : ("offline" as const),
      lastSeen: new Date(),
    }));
  }
}
