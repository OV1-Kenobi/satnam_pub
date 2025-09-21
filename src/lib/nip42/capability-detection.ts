/**
 * Detect relays that request NIP-42 AUTH on connect/subscribe
 */

import { central_event_publishing_service as CEPS } from "../../../lib/central_event_publishing_service";

export interface CapabilityReport {
  relay: string;
  requiresAuth: boolean;
  error?: string;
}

export async function detectAuthRequirement(
  relays: string[]
): Promise<CapabilityReport[]> {
  const reports: CapabilityReport[] = [];
  for (const r of relays) {
    try {
      await CEPS.list([{ kinds: [1], limit: 1 }], [r], { eoseTimeout: 3000 });
      reports.push({ relay: r, requiresAuth: false });
    } catch (e) {
      // Distinguish between AUTH errors and other errors
      const errorMessage = e instanceof Error ? e.message : String(e);
      const isAuthError =
        errorMessage.includes("auth") || errorMessage.includes("AUTH");

      if (isAuthError) {
        reports.push({ relay: r, requiresAuth: true });
      } else {
        reports.push({ relay: r, requiresAuth: false, error: errorMessage });
      }
    }
  }
  return reports;
}
