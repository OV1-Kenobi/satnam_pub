/**
 * NIP-42 Relay Authentication helpers (browser)
 * Leverages CEPS which already wires onauth handlers into nostr-tools pool
 */

import { central_event_publishing_service as CEPS } from '../../../lib/central_event_publishing_service';

export interface RelayAuthResult {
  relay: string;
  ok: boolean;
  error?: string;
}

export async function authenticateWithRelays(
  relays: string[],
  opts?: { timeoutMs?: number }
): Promise<RelayAuthResult[]> {
  const results: RelayAuthResult[] = [];
  const timeout = opts?.timeoutMs ?? 8000;

  for (const r of relays) {
    try {
      // Try a simple list() with onauth; CEPS will invoke signEventWithActiveSession
      await CEPS.list([{ kinds: [1], limit: 1 }], [r], { eoseTimeout: timeout });
      results.push({ relay: r, ok: true });
    } catch (e) {
      results.push({ relay: r, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

