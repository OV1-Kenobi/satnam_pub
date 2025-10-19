import { describe, it, expect } from 'vitest';
import { central_event_publishing_service as CEPS } from '../../../lib/central_event_publishing_service';
import type { SignerAdapter } from '../signers/signer-adapter';

describe('CEPS external signer registry and preference routing', () => {
  it('register/get/clear signers works', async () => {
    CEPS.clearExternalSigner();
    const mock: SignerAdapter = {
      id: 'nip07',
      label: 'Mock NIP07',
      capabilities: { event: true },
      async initialize() {},
      async getStatus() { return 'connected' },
      async signEvent(unsigned: any) { return { ...unsigned, used: 'mock' } },
    } as any;

    CEPS.registerExternalSigner(mock);
    const list = CEPS.getRegisteredSigners();
    expect(Array.isArray(list)).toBe(true);
    expect(list.find(s => s.id === 'nip07')).toBeTruthy();

    // Ensure copy returned
    list.length = 0;
    expect(CEPS.getRegisteredSigners().length).toBeGreaterThan(0);

    CEPS.clearExternalSigner();
    expect(CEPS.getRegisteredSigners().length).toBe(0);
  });

  it('signEventWithPreferredOrSession routes to preferred when connected', async () => {
    CEPS.clearExternalSigner();
    // Set preference
    window.localStorage.setItem('satnam.signing.preferred', 'mock1');

    const mock1: SignerAdapter = {
      id: 'mock1',
      label: 'Mock1',
      capabilities: { event: true },
      async initialize() {},
      async getStatus() { return 'connected' },
      async signEvent(unsigned: any) { return { ...unsigned, used: 'mock1' } },
    } as any;

    const mock2: SignerAdapter = {
      id: 'mock2',
      label: 'Mock2',
      capabilities: { event: true },
      async initialize() {},
      async getStatus() { return 'connected' },
      async signEvent(unsigned: any) { return { ...unsigned, used: 'mock2' } },
    } as any;

    CEPS.registerExternalSigner(mock1);
    CEPS.registerExternalSigner(mock2);

    const res = await (CEPS as any).signEventWithPreferredOrSession({ a: 1 });
    expect(res.used).toBe('mock1');
  });
});

