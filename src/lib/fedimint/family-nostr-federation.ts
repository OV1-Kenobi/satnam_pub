export class FamilyNostrFederation {
  private federationId: string;
  private guardianThreshold: number;
  private guardianCount: number;
  private connected: boolean;
  private balance: number;

  constructor() {
    // Remove process.env - use environment variables properly for browser
    this.federationId =
      import.meta.env.VITE_FEDIMINT_FAMILY_FEDERATION_ID || "demo-federation";
    this.guardianThreshold = parseInt(
      import.meta.env.VITE_FEDIMINT_NOSTR_THRESHOLD || "2"
    );
    this.guardianCount = parseInt(
      import.meta.env.VITE_FEDIMINT_NOSTR_GUARDIAN_COUNT || "3"
    );
    this.connected = false;
    this.balance = 0;
  }

  // Web Crypto API instead of Node.js crypto
  generateId(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }

  async protectFamilyMemberNsec(
    familyMemberId: string,
    nsec: string,
    guardianList: string[]
  ): Promise<any> {
    const response = await fetch("/api/federation/nostr/protect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        familyMemberId,
        nsec,
        guardians: guardianList,
        threshold: this.guardianThreshold,
        federationId: this.federationId,
      }),
    });
    return response.json();
  }

  async requestGuardianApprovalForSigning(
    nostrEvent: any,
    familyMemberId: string
  ): Promise<any> {
    const response = await fetch("/api/federation/nostr/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: nostrEvent,
        familyMemberId,
        requiresApproval: this.requiresGuardianApproval(nostrEvent),
        federationId: this.federationId,
      }),
    });
    return response.json();
  }

  requiresGuardianApproval(nostrEvent: any): boolean {
    const sensitiveKinds = [0, 10002, 30023, 1984];
    return (
      sensitiveKinds.includes(nostrEvent.kind) ||
      nostrEvent.tags.some((tag: any[]) => tag[0] === "family-governance")
    );
  }

  async getFamilyEcashBalances(): Promise<any> {
    const response = await fetch("/api/federation/ecash/family-balances");
    return response.json();
  }

  async transferLightningToEcash(
    amount: number,
    familyMemberId: string
  ): Promise<any> {
    const response = await fetch("/api/federation/ecash/lightning-to-ecash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        familyMemberId,
        federationId: this.federationId,
      }),
    });
    return response.json();
  }

  async transferEcashToLightning(
    amount: number,
    familyMemberId: string
  ): Promise<any> {
    const response = await fetch("/api/federation/ecash/ecash-to-lightning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        familyMemberId,
        federationId: this.federationId,
      }),
    });
    return response.json();
  }
}
