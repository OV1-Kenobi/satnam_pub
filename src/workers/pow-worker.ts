// NIP-13 PoW Web Worker for client-side mining
// - Offloads CPU-heavy hashing from UI
// - Optional: only used for relays requiring PoW

// Import minePow lazily to reduce main-bundle impact when worker not used
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - worker context
self.onmessage = async (e: MessageEvent) => {
  const { event, difficulty } = e.data as { event: any; difficulty: number };
  try {
    const mod = await import('nostr-tools/nip13');
    const mined = await mod.minePow(event, difficulty);
    // Send back mined event (with id & nonce tag)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - worker context
    self.postMessage({ success: true, event: mined });
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - worker context
    self.postMessage({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
};

