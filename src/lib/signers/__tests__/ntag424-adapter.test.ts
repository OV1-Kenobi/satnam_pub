import { describe, it, expect } from 'vitest';
import { Ntag424Adapter } from '../../signers/ntag424-adapter';

declare global { interface Window { } }

describe('NTAG424 adapter - requestNfcAuth flow', () => {
  it('dispatches open event and resolves on matching response', async () => {
    const adapter = new Ntag424Adapter();

    // Spy on dispatch
    let capturedRequestId: string | undefined;
    const openPromise = new Promise<void>((resolve) => {
      window.addEventListener('satnam:open-ntag-auth' as any, (e: any) => {
        capturedRequestId = e?.detail?.requestId;
        resolve();
      }, { once: true });
    });

    const p = (adapter as any).requestNfcAuth('event', 1000);

    await openPromise;
    expect(capturedRequestId && typeof capturedRequestId === 'string').toBe(true);

    // Respond with matching requestId
    window.dispatchEvent(new CustomEvent('satnam:ntag-auth-result', {
      detail: { requestId: capturedRequestId, success: true },
    } as any));

    await expect(p).resolves.toEqual({ success: true });
  });

  it('times out when no response is provided', async () => {
    const adapter = new Ntag424Adapter();
    const p = (adapter as any).requestNfcAuth('event', 50);
    await expect(p).resolves.toEqual({ success: false, error: 'User cancelled NFC authentication' });
  });
});

