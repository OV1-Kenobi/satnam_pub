import { useCallback, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export type Nip05Strategy = "keep" | "create";
export type LightningStrategy = "keep" | "create";

export interface RotationStartResult {
  success: boolean;
  rotationId?: string;
  current?: {
    npub: string | null;
    nip05: string | null;
    lightningAddress: string | null;
  };
  whitelists?: { nip05Domains: string[] };
  deprecationDays?: number;
  error?: string;
}

export interface RotationCompleteInput {
  rotationId: string;
  oldNpub: string;
  newNpub: string;
  nip05?: { strategy: Nip05Strategy; identifier?: string };
  lightning?: { strategy: LightningStrategy; address?: string };
  ceps?: {
    delegationEventId?: string;
    kind0EventIds?: string[];
    noticeEventIds?: string[];
    profileUpdateEventId?: string;
  };
}

export interface RotationStatusResult {
  success: boolean;
  rotation?: any;
  error?: string;
}

async function authHeader(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("No session");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

const base = "/.netlify/functions/key-rotation-unified";

export function useKeyRotation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotationId, setRotationId] = useState<string | null>(null);
  const [current, setCurrent] = useState<{
    npub: string | null;
    nip05: string | null;
    lightningAddress: string | null;
  } | null>(null);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [deprecationDays, setDeprecationDays] = useState<number>(30);

  const start = useCallback(
    async (
      opts: { nip05?: Nip05Strategy; lightning?: LightningStrategy } = {}
    ): Promise<RotationStartResult> => {
      setLoading(true);
      setError(null);
      try {
        const headers = await authHeader();
        const res = await fetch(`${base}/start`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            desiredNip05Strategy: opts.nip05 || "keep",
            desiredLightningStrategy: opts.lightning || "keep",
          }),
        });
        const data = (await res.json()) as RotationStartResult;
        if (!res.ok || !data.success)
          throw new Error(data.error || `HTTP ${res.status}`);
        setRotationId(data.rotationId || null);
        setCurrent(data.current || null);
        setWhitelist(data.whitelists?.nip05Domains || []);
        setDeprecationDays(data.deprecationDays || 30);
        return data;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to start rotation";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const complete = useCallback(
    async (
      input: RotationCompleteInput
    ): Promise<{
      success: boolean;
      error?: string;
      notifications?: { sent: number; failed: number; eventIds: string[] };
    }> => {
      setLoading(true);
      setError(null);
      try {
        const headers = await authHeader();
        const res = await fetch(`${base}/complete`, {
          method: "POST",
          headers,
          body: JSON.stringify(input),
        });
        const data = await res.json();
        if (!res.ok || !data?.success)
          throw new Error(data?.error || `HTTP ${res.status}`);

        // After successful DB commit, send CEPS notifications (best-effort)
        let notifications: {
          sent: number;
          failed: number;
          eventIds: string[];
        } = { sent: 0, failed: 0, eventIds: [] };
        try {
          notifications = await notifyKeyRotationFanout({
            rotationId: input.rotationId,
            oldNpub: input.oldNpub,
            newNpub: input.newNpub,
            nip05ChangedTo: input.nip05?.identifier,
            deprecationDays,
          });
        } catch (fanoutErr) {
          console.warn("Key rotation fanout failed:", fanoutErr);
        }

        return { success: true, notifications };
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to complete rotation";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [deprecationDays]
  );

  const status = useCallback(
    async (rotationIdParam?: string): Promise<RotationStatusResult> => {
      setLoading(true);
      setError(null);
      try {
        const headers = await authHeader();
        const rid = rotationIdParam || rotationId || "";
        const res = await fetch(
          `${base}/status?rotationId=${encodeURIComponent(rid)}`,
          { method: "GET", headers }
        );
        const data = (await res.json()) as RotationStatusResult;
        if (!res.ok || !data.success)
          throw new Error(data.error || `HTTP ${res.status}`);
        return data;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to fetch status";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [rotationId]
  );

  const rollback = useCallback(
    async (
      rotationIdParam?: string
    ): Promise<{ success: boolean; error?: string }> => {
      setLoading(true);
      setError(null);
      try {
        const headers = await authHeader();
        const rid = rotationIdParam || rotationId || "";
        const res = await fetch(`${base}/rollback`, {
          method: "POST",
          headers,
          body: JSON.stringify({ rotationId: rid }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success)
          throw new Error(data?.error || `HTTP ${res.status}`);
        return { success: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to rollback";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [rotationId]
  );

  const ceps = useMemo(
    () => ({
      // Publish Nostr events related to rotation. Best-effort: do not throw; return partials on failure.
      publishRotationEvents: async (
        oldNpub: string,
        newNpub: string,
        opts?: { days?: number }
      ): Promise<{
        delegationEventId?: string;
        kind0EventIds?: string[];
        noticeEventIds?: string[];
        profileUpdateEventId?: string;
      }> => {
        try {
          const mod = await import(
            "../../lib/central_event_publishing_service"
          );
          const CEPS = mod.central_event_publishing_service;
          const days =
            typeof opts?.days === "number" ? opts.days : deprecationDays;
          const result: {
            delegationEventId?: string;
            kind0EventIds?: string[];
            noticeEventIds?: string[];
            profileUpdateEventId?: string;
          } = { kind0EventIds: [], noticeEventIds: [] };

          // Acquire active secure session for temporary nsec usage
          const { secureNsecManager } = await import(
            "../lib/secure-nsec-manager"
          );
          const sessionId = secureNsecManager.getActiveSessionId();
          if (!sessionId) {
            console.warn("No active secure session for CEPS publishing");
            return result;
          }

          // Use the nsec only within the provided closure for zero-knowledge handling
          await secureNsecManager.useTemporaryNsec(
            sessionId,
            async (oldNsecHex) => {
              // 1) Delegation (NIP-26): old -> new
              try {
                const newPubkeyHex = await CEPS.npubToHex(newNpub);
                const del = await CEPS.publishNIP26Delegation(
                  oldNsecHex,
                  newPubkeyHex,
                  [0, 1, 1777],
                  days
                );
                if (del && typeof del === "object" && "eventId" in del) {
                  result.delegationEventId = (del as any).eventId as string;
                }
              } catch (e) {
                console.warn("Delegation publish failed:", e);
              }

              // 2) Kind:0 profile update from old key to reference new npub (preserve basic fields)
              try {
                const profileContent: Record<string, unknown> = {};
                if (current?.nip05) profileContent.nip05 = current.nip05;
                if (current?.lightningAddress)
                  profileContent.lud16 = current.lightningAddress;
                const kind0Id = await CEPS.publishProfile(
                  oldNsecHex,
                  profileContent
                );
                if (typeof kind0Id === "string") {
                  result.kind0EventIds = [
                    ...(result.kind0EventIds || []),
                    kind0Id,
                  ];
                  result.profileUpdateEventId = kind0Id;
                }
              } catch (e) {
                console.warn("Kind:0 publish failed:", e);
              }

              // 3) Notices (best-effort) - optional, do not block on failure
              try {
                if (typeof CEPS.publishNIP41Deprecation === "function") {
                  const oldPubkeyHex = CEPS.getPublicKeyHex(oldNsecHex);
                  const newPubkeyHex = CEPS.npubToHex(newNpub);
                  const noticeResult = await CEPS.publishNIP41Deprecation(
                    oldPubkeyHex,
                    newPubkeyHex
                  );
                  if (noticeResult.success && noticeResult.eventId) {
                    result.noticeEventIds = [
                      ...(result.noticeEventIds || []),
                      noticeResult.eventId,
                    ];
                  }
                }
              } catch (e) {
                console.warn("Notice publish failed:", e);
              }
            }
          );

          return result;
        } catch (e) {
          console.warn("CEPS integration unavailable:", e);
          return {} as {
            delegationEventId?: string;
            kind0EventIds?: string[];
            noticeEventIds?: string[];
            profileUpdateEventId?: string;
          };
        }
      },
    }),
    [current, deprecationDays]
  );

  // Notification format:
  // - Human-readable plaintext, followed by a JSON metadata block separated by a delimiter line '---'.
  // - Metadata keys:
  //   {
  //     type: "key_rotation_notice",
  //     version: "1.0",
  //     old_npub: string,
  //     new_npub: string,
  //     deprecation_days: number,
  //     nip05_identifier?: string,
  //     rotation_id: string,
  //     timestamp: string (ISO 8601)
  //   }
  // Recipient clients may parse the trailing JSON to auto-update contact records.
  const notifyKeyRotationFanout = useCallback(
    async (args: {
      rotationId: string;
      oldNpub: string;
      newNpub: string;
      nip05ChangedTo?: string;
      deprecationDays: number;
    }): Promise<{ sent: number; failed: number; eventIds: string[] }> => {
      const { rotationId, oldNpub, newNpub, nip05ChangedTo, deprecationDays } =
        args;
      const eventIds: string[] = [];
      let sent = 0;
      let failed = 0;

      try {
        // Build human-readable message and structured metadata
        const header = "Key Rotation Notice";
        const lines = [
          `${header}: I have rotated my Nostr keys.`,
          `Old npub: ${oldNpub}`,
          `New npub: ${newNpub}`,
          `Deprecation window: ${deprecationDays} days (old key remains valid during this window)`,
        ];
        if (nip05ChangedTo) lines.push(`NIP-05 updated: ${nip05ChangedTo}`);
        const plaintext = lines.join("\n");
        const metadata = {
          type: "key_rotation_notice",
          version: "1.0",
          old_npub: oldNpub,
          new_npub: newNpub,
          deprecation_days: deprecationDays,
          ...(nip05ChangedTo ? { nip05_identifier: nip05ChangedTo } : {}),
          rotation_id: rotationId,
          timestamp: new Date().toISOString(),
        } as const;
        const combined = `${plaintext}\n\n---\n${JSON.stringify(metadata)}`;

        // Resolve recipients
        const recipients = new Set<string>();
        // Separate bucket for encrypted contacts (gift-wrap path) if decryption fails
        const encryptedContactCandidates: Array<{
          encrypted_npub: string;
          preferred_encryption?: "gift-wrap" | "nip04" | "auto";
          supports_gift_wrap?: boolean;
          display_name_hash?: string;
          trust_level?: "family" | "trusted" | "known" | "unverified";
        }> = [];

        // 1) Family federation members
        let authId: string | undefined = undefined;
        try {
          const { data: userInfo } = await supabase.auth.getUser();
          authId = userInfo.user?.id as string | undefined;
          if (authId) {
            const { data: myMemberships } = await supabase
              .from("family_members")
              .select("family_federation_id, user_duid, is_active")
              .eq("user_duid", authId)
              .eq("is_active", true);
            const federationIds = Array.from(
              new Set(
                (myMemberships || [])
                  .map((m: any) => m.family_federation_id)
                  .filter(Boolean)
              )
            );
            if (federationIds.length) {
              const { data: allMembers } = await supabase
                .from("family_members")
                .select("user_duid, is_active")
                .in("family_federation_id", federationIds)
                .eq("is_active", true);
              const duids = Array.from(
                new Set(
                  (allMembers || [])
                    .map((m: any) => m.user_duid)
                    .filter((x: string) => x && x !== authId)
                )
              );
              if (duids.length) {
                const { data: ids } = await supabase
                  .from("user_identities")
                  .select("id, npub")
                  .in("id", duids);
                (ids || []).forEach((r: any) => {
                  const np = String(r?.npub || "").trim();
                  if (np && np !== oldNpub && np !== newNpub)
                    recipients.add(np);
                });
              }
            }
          }
        } catch (famErr) {
          console.warn("Family recipients resolution failed:", famErr);
        }

        // 2) Privacy-first contacts (encrypted_contacts) via CEPS helper
        try {
          const mod = await import(
            "../../lib/central_event_publishing_service"
          );
          const { central_event_publishing_service: CEPS2 } = mod as any;
          const contacts: Array<{ npub: string; relayHints?: string[] }> =
            await CEPS2.loadAndDecryptContacts();
          for (const c of contacts) {
            const np = String(c?.npub || "").trim();
            if (np && np !== oldNpub && np !== newNpub) recipients.add(np);
          }
        } catch (encContactsErr) {
          console.warn(
            "encrypted_contacts resolution via CEPS failed:",
            encContactsErr
          );
          // Fallback: queue gift-wrapped candidates without decryption
          try {
            const { data: encRows } = await supabase
              .from("encrypted_contacts")
              .select(
                "encrypted_npub, preferred_encryption, supports_gift_wrap, display_name_hash, trust_level"
              )
              .limit(1000);
            if (Array.isArray(encRows)) {
              for (const row of encRows) {
                const enc = String(row?.encrypted_npub || "").trim();
                if (!enc) continue;
                encryptedContactCandidates.push({
                  encrypted_npub: enc,
                  preferred_encryption: row?.preferred_encryption || "auto",
                  supports_gift_wrap: !!row?.supports_gift_wrap,
                  display_name_hash: row?.display_name_hash,
                  trust_level: row?.trust_level,
                });
              }
            }
          } catch (fallbackErr) {
            console.warn(
              "encrypted_contacts fallback (gift-wrap) failed:",
              fallbackErr
            );
          }
        }

        // 3) Legacy contacts (best-effort): attempt to read from a plain contacts table if present
        try {
          const tryTables = ["user_contacts", "contacts"]; // legacy fallbacks
          for (const tbl of tryTables) {
            const { data, error } = await supabase
              .from(tbl)
              .select("npub")
              .limit(200);
            if (!error && Array.isArray(data)) {
              data.forEach((row: any) => {
                const np = String(row?.npub || "").trim();
                if (np && np !== oldNpub && np !== newNpub) recipients.add(np);
              });
              break; // stop after first success
            }
          }
        } catch (cErr) {
          console.warn("Contacts recipients resolution skipped:", cErr);
        }

        // Prepare CEPS and session for sending
        const mod2 = await import("../../lib/central_event_publishing_service");
        const CEPS2 = (mod2 as any).central_event_publishing_service;
        const { secureNsecManager } = await import(
          "../lib/secure-nsec-manager"
        );
        const sessionId = secureNsecManager.getActiveSessionId();
        if (!sessionId) {
          console.warn("Cannot send notifications: no active secure session");
          return { sent, failed, eventIds };
        }

        await secureNsecManager.useTemporaryNsec(
          sessionId,
          async (_nsecHex: string) => {
            // 3a) Send to decrypted recipients via standard DM
            const tasks1 = Array.from(recipients).map(async (npub) => {
              try {
                const id = await CEPS2.sendStandardDirectMessage(
                  npub,
                  combined
                );
                if (id) {
                  eventIds.push(id);
                  sent += 1;
                } else {
                  failed += 1;
                }
              } catch (sendErr) {
                console.warn("Notification send failed for", npub, sendErr);
                failed += 1;
              }
            });

            // 3b) Send to encrypted contacts via gift-wrapped path (no plaintext npub exposure)
            const tasks2 = encryptedContactCandidates.map(async (row) => {
              try {
                const contact = {
                  sessionId: sessionId,
                  encryptedNpub: row.encrypted_npub,
                  displayNameHash: row.display_name_hash || "",
                  trustLevel: (row.trust_level as any) || "known",
                  supportsGiftWrap: !!row.supports_gift_wrap,
                  preferredEncryption:
                    (row.preferred_encryption as any) || "auto",
                };
                const id = await CEPS2.sendGiftWrappedDirectMessage(contact, {
                  plaintext,
                  meta: metadata,
                });
                if (id) {
                  eventIds.push(id);
                  sent += 1;
                } else {
                  failed += 1;
                }
              } catch (sendErr) {
                console.warn("Gift-wrapped notification send failed", sendErr);
                failed += 1;
              }
            });

            await Promise.allSettled([...tasks1, ...tasks2]);
          }
        );

        // Merge notification event IDs into key_rotation_events.ceps_event_ids (best-effort)
        try {
          const { data: row } = await supabase
            .from("key_rotation_events")
            .select("ceps_event_ids")
            .eq("id", rotationId)
            .maybeSingle();
          const existing = (row?.ceps_event_ids as any) || {};
          const merged = {
            ...existing,
            notifications: Array.from(
              new Set([...(existing.notifications || []), ...eventIds])
            ),
          };
          await supabase
            .from("key_rotation_events")
            .update({ ceps_event_ids: merged })
            .eq("id", rotationId);
        } catch (mergeErr) {
          console.warn(
            "Could not merge notification IDs into key_rotation_events:",
            mergeErr
          );
        }
      } catch (outerErr) {
        console.warn("notifyKeyRotationFanout encountered an error:", outerErr);
      }

      return { sent, failed, eventIds };
    },
    [deprecationDays]
  );

  return {
    loading,
    error,
    rotationId,
    current,
    whitelist,
    deprecationDays,
    start,
    complete,
    status,
    rollback,
    ceps,
  } as const;
}
