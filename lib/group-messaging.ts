// Route Nostr operations through the central event publishing service or dynamic imports.
// This module previously statically imported nostr-tools, which forces eager bundling.
// Replace static imports with on-demand loading at call sites.

export type { Event, Filter, NostrEvent, UnsignedEvent } from "./types"; // adjust if needed

export async function loadNostrTools() {
  return await import("nostr-tools");
}

// Example wrappers (implement actual functions in this module as needed):
export async function getPool() {
  const { SimplePool } = await loadNostrTools();
  return new SimplePool();
}
