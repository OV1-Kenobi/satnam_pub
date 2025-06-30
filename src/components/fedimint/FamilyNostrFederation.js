export class FamilyNostrFederation {
  constructor() {
    this.federationId = process.env.FEDIMINT_FAMILY_FEDERATION_ID;
    this.guardianThreshold = parseInt(process.env.FEDIMINT_NOSTR_THRESHOLD);
    this.guardianCount = parseInt(process.env.FEDIMINT_NOSTR_GUARDIAN_COUNT);
  }
  async protectFamilyMemberNsec(familyMemberId, nsec, guardianList) {
    const response = await fetch('/api/federation/nostr/protect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        familyMemberId,
        nsec,
        guardians: guardianList,
        threshold: this.guardianThreshold,
        federationId: this.federationId
      })
    });
    return response.json();
  }
  async requestGuardianApprovalForSigning(nostrEvent, familyMemberId) {
    const response = await fetch('/api/federation/nostr/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: nostrEvent,
        familyMemberId,
        requiresApproval: this.requiresGuardianApproval(nostrEvent),
        federationId: this.federationId
      })
    });
    return response.json();
  }
  requiresGuardianApproval(nostrEvent) {
    const sensitiveKinds = [0, 10002, 30023, 1984];
    return sensitiveKinds.includes(nostrEvent.kind) || 
           nostrEvent.tags.some(tag => tag[0] === 'family-governance');
  }
  async getFamilyEcashBalances() {
    const response = await fetch('/api/federation/ecash/family-balances');
    return response.json();
  }
  async transferLightningToEcash(amount, familyMemberId) {
    const response = await fetch('/api/federation/ecash/lightning-to-ecash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        familyMemberId,
        federationId: this.federationId
      })
    });
    return response.json();
  }

  async transferEcashToLightning(amount, familyMemberId) {
    const response = await fetch('/api/federation/ecash/ecash-to-lightning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        familyMemberId,
        federationId: this.federationId
      })
    });
    return response.json();
  }
}