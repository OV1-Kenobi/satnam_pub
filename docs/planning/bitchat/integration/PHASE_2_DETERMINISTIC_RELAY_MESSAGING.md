# Phase 2: Deterministic Relay Messaging Planning

## Status

- **Status:** ✅ COMPLETE
- **Completion Date:** 2025-11-26
- **Summary:** Implemented deterministic geohash-based relay selection and full public geo-room messaging over Nostr using CEPS, with feature flag gating and consent integration.

## Implementation Summary

### Files Created/Modified

| File                                                 | Action   | Description                                                                 |
| ---------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| `src/lib/geochat/types.ts`                           | Modified | Added Phase 2 types: `GeoRoomError`, `GeoRoomSubscription`, etc.            |
| `src/config/env.client.ts`                           | Modified | Added `VITE_GEOCHAT_LIVE_ENABLED`, `VITE_GEOCHAT_DEFAULT_RELAY_COUNT` flags |
| `src/lib/geochat/geo-room-service.ts`                | Created  | Core service with `publishGeoRoomMessage`, `subscribeToGeoRoom`             |
| `src/hooks/useGeoRoom.ts`                            | Created  | React hook for geo-room subscription management                             |
| `src/components/communications/GeoRoomTab.tsx`       | Modified | Added Connect button, message list, message input, error handling           |
| `src/lib/geochat/index.ts`                           | Modified | Updated barrel exports for Phase 2                                          |
| `src/lib/geochat/__tests__/geo-room-service.test.ts` | Created  | 28 unit tests for Phase 2 service                                           |

### Feature Flags

- `VITE_GEOCHAT_LIVE_ENABLED` (default: `false`) - Gates all Phase 2 functionality
- `VITE_GEOCHAT_DEFAULT_RELAY_COUNT` (default: `3`) - Relays per geo-room

### Key Behaviors

- **Relay Selection**: Uses `GeoRelaySelector.selectForGeoRoom()` with fallback to `DEFAULT_UNIFIED_CONFIG.relays`
- **Consent Integration**: `useGeoRoom` checks consent via `useGeoDiscovery` before connecting
- **Error Mapping**: All errors converted to typed `GeoRoomError` with user-friendly messages
- **Event Kind**: Uses kind `42` (NIP-28 public chat) for geo-room messages
- **Channel Tagging**: Events tagged with `['t', '#<geohash>']` for filtering

---

## 1. Phase Overview

- **Objective:** Implement deterministic geohash → relay selection and full public geo-room messaging over Nostr using CEPS, still clearly labeled as low-privacy discovery.
- **Success Criteria:**
  - `GeoRelaySelector` deterministically picks the same relay subset for a given geohash across clients.
  - Users can send and receive public messages in a geo-room using Nostr events.
  - All georoom traffic flows through CEPS and respects browser-only constraints.
- **Estimated Complexity/Time:** Medium–High (5–8 developer-days including test coverage and registry work).
- **Dependencies:**
  - **Phase 0:** `GeoRelaySelector` implementation, `georelays.json` registry with public/self-hosted trust levels.
  - Phase 1 geo discovery UI and types/hooks.
  - CEPS (in `lib/central_event_publishing_service.ts`) for publish/list/subscribe.
  - Existing `config.nostr.relays` and `MESSAGING_CONFIG.relays` as fallback when registry unavailable.

## 2. Technical Specifications

- **Data Models:**
  - `GeoRelayRecord` with `relayUrl: string`, `regionCode: string`, `latitude: number`, `longitude: number`, `healthScore: number`.
  - `GeoRelaySelectorConfig` with `maxRelaysPerGeoRoom: number`, `minHealthScore: number`.
- **API Contracts:**
  - `GeoRelaySelector.selectRelaysForGeoHash(geohash: string, count?: number): Promise<string[]>` in `src/lib/geochat/geo-relay-selector.ts`.
    - **Contract:** returns a non-empty, deterministically ordered array of relay URLs for the given geohash or throws a `GeoRelaySelectionError` when no suitable relays are available (e.g., registry unavailable or all candidates below `minHealthScore`). It MUST NOT return an empty array.
  - `publishGeoRoomMessage(params: { geohash: string; content: string; authorPubkey: string }): Promise<{ eventId: string; usedFallbackRelays: boolean }>` in `src/lib/geochat/geo-room-service.ts`.
    - **Contract:** selects relays via `GeoRelaySelector`; if selection fails, falls back to `MESSAGING_CONFIG.relays`. If both fail, rejects with a typed `GeoRoomError` of kind `"no_relays_available"` that the UI must surface.
  - `subscribeToGeoRoom(params: { geohash: string; onEvent: (event: NostrEvent) => void; onError?: (error: GeoRoomError) => void }): Promise<GeoRoomSubscription>` in `src/lib/geochat/geo-room-service.ts`.
    - **Contract:** uses `GeoRelaySelector` and CEPS `subscribeMany` to open a subscription. Returns a `GeoRoomSubscription` handle with:
      - `unsubscribe(): void` — caller MUST invoke on component unmount / tab close to clean up stale subscriptions.
      - `updateGeohash(newGeohash: string): Promise<void>` — migrates the subscription to a new geohash by unsubscribing from old relays and resubscribing to the new relay set.
    - Relay-level reconnects and transient network issues are handled by CEPS; `onError` is only called for terminal errors such as `"no_relays_available"` or invalid geohash.
- **Database Schema Changes:**
  - None required for deterministic selection; registry can be static JSON bundled under `src/config/georelays.json` or fetched from a Netlify function.
- **Environment Variables / Flags:**
  - `VITE_GEOCHAT_DEFAULT_RELAY_COUNT` (default 3) integrated via `getEnvVar` and injected into `GeoRelaySelectorConfig`.
  - Optional `VITE_GEOCHAT_REGISTRY_URL` for remote registry override.
- **Integration Points:**
  - `GiftwrappedMessaging.tsx`: use `GeoRelaySelector.selectRelaysForGeoHash` when user connects to a room.
  - CEPS: add helper methods or reuse existing `publishEvent`/`list` via a thin wrapper in `geo-room-service.ts`.

## 3. Architecture & Design Decisions

- **Module Architecture:**
  - `geo-relay-selector.ts`: pure deterministic selection logic, unit-testable and independent of React.
  - `geo-room-service.ts`: wraps CEPS calls with geohash-specific tagging, relay selection, subscription lifecycle, and error handling.
  - UI remains in `GiftwrappedMessaging` to avoid duplicating messaging surface.
- **Data Flow (Sending & Error Handling):**
  - User selects geohash → `GeoRelaySelector` returns `relayUrls` → `geo-room-service.publishGeoRoomMessage` constructs a Nostr event with tags like `['t', '#<geohash>']` and calls `CEPS.publishEvent(event, relayUrls)`.
  - If `GeoRelaySelector` throws, `geo-room-service` falls back to `MESSAGING_CONFIG.relays`. If both primary and fallback selection fail, it rejects with `GeoRoomError` of kind `"no_relays_available"` so the UI can show a clear failure state.
- **Data Flow (Receiving, Lifecycle & Reconnection):**
  - On connect, `subscribeToGeoRoom` builds filters (e.g. `kinds: [1]` or a dedicated chat kind) and calls `CEPS.subscribeMany(relayUrls, filters, handlers)`.
  - The returned `GeoRoomSubscription` is responsible for:
    - Cleaning up underlying CEPS subscriptions via `unsubscribe()` when the geo-room component unmounts or the user closes the tab.
    - Handling geohash changes via `updateGeohash(newGeohash)`, which unsubscribes from the old relay set, re-runs selection for the new geohash, and re-subscribes.
  - CEPS manages low-level WebSocket reconnects and backoff. `geo-room-service` only retries selection when geohash changes or when selection fails up front; it does not implement its own infinite reconnect loop.
- **Security & Privacy:**
  - Geohash is public; tags must not include any additional PII.
  - Clear separation between public geo-room events and private, giftwrapped DMs.
- **Privacy Model & User Consent (Phase 2 vs Phase 1):**

  - Phase 1 keeps geohash usage read-only; Phase 2 actively publishes events tagged with a geohash-derived channel (e.g. `#dr5rs`).
  - Recommended default precision is coarse (e.g. 4–6 characters, roughly city/metro-area scale, ~10–100 km²), not fine-grained (7–8 characters, street/block level).
  - UX must explain that by joining a geo-room the user discloses coarse location information to anyone watching that channel, and contrast this with the more private, non-geo giftwrapped messaging flows.
  - **Forward reference to physical MFA verification:** Phase 2 treats geo-rooms strictly as low-privacy, coarse-location public channels. It does **not** introduce any identity verification or trusted contact semantics. Phase 3 builds on this discovery surface to add optional, per-contact identity revelation and an in-person, physical MFA–based "Name Tag Reading Ritual" that can upgrade trust for contacts originally discovered in geo-rooms; see `PHASE_3_TRUST_CONTACTS_PRIVATE_MESSAGING.md` for details.

- **Browser/Serverless Constraints:**
  - Relay registry parsing must be pure browser code; if fetched, use Netlify Functions that expose static JSON, not Node-specific logic.
- **Web Crypto Usage & Deterministic Algorithm:**
  - Use `crypto.subtle.digest('SHA-256', ...)` only inside functions, never at module top level.
  - Deterministic scoring algorithm for selection:
    - Build an input string `"v1|" + geohashPrefix + "|" + relayUrl` (the `v1` prefix allows safe evolution later).
    - UTF-8 encode the input and compute `hash = SHA-256(input)` via Web Crypto.
    - Interpret `hash` as an unsigned big-endian integer score.
    - Filter out candidates below `minHealthScore`, sort remaining relays by ascending `score` (ties broken by `relayUrl`), and take the first `maxRelaysPerGeoRoom` entries.
    - Because there is no per-client salt, any client using the same registry and algorithm will converge on the same relay set for a given geohash.

### Registry Management & Versioning

- For Phase 2, the georelay registry is shipped as a **static, versioned** bundle (e.g. `src/config/georelays.json`) included in the app build; all clients on the same release use the same pinned registry.
- The registry file SHOULD include a `version` field; deterministic behavior is defined as "same N relays for a given geohash and registry version".
- Optionally, a `VITE_GEOCHAT_REGISTRY_URL` override may be supported for experimentation, but only when explicitly enabled and guarded by environment flags; if the remote fetch fails or the version does not match expectations, the implementation MUST fall back to the bundled registry.
- If both bundled and remote registries are unavailable or invalid, `GeoRelaySelector` throws and `geo-room-service` falls back to `MESSAGING_CONFIG.relays` as a last resort. If that also fails, the operation surfaces a `GeoRoomError` to the UI.

### 3.1 Code Reference Examples (Non-Production Sketches)

> The following snippets are **reference-only TypeScript/React sketches** to clarify interfaces and lifecycle; the final implementation should live in the indicated files and follow Satnam coding standards and existing CEPS integration patterns.

#### 3.1.1 TypeScript Interfaces (geo-room-service.ts)

```ts
// Reference interfaces for Phase 2
// File: src/lib/geochat/geo-room-service.ts

import type { NostrEvent } from "../../lib/nostr";

export interface GeoRoomSubscription {
  /** Clean up underlying CEPS subscriptions; MUST be called on unmount. */
  unsubscribe(): void;
  /** Migrate this subscription to a new geohash by reselection + resubscribe. */
  updateGeohash(newGeohash: string): Promise<void>;
}

export type GeoRoomErrorKind =
  | "no_relays_available"
  | "invalid_geohash"
  | "registry_unavailable";

export interface GeoRoomError extends Error {
  kind: GeoRoomErrorKind;
  /** Optional geohash that triggered the error. */
  geohash?: string;
  /** Optional underlying cause for logging/telemetry only. */
  cause?: unknown;
}

export interface SubscribeToGeoRoomParams {
  geohash: string;
  onEvent: (event: NostrEvent) => void;
  onError?: (error: GeoRoomError) => void;
}

// Contract only; implementation uses CEPS and GeoRelaySelector under the hood.
export async function subscribeToGeoRoom(
  params: SubscribeToGeoRoomParams
): Promise<GeoRoomSubscription> {
  // Implementation omitted in planning doc.
  // - Select relays via GeoRelaySelector (with fallback to MESSAGING_CONFIG.relays).
  // - Call CEPS.subscribeMany and wrap the subscription handle.
  // - Map terminal failures to typed GeoRoomError instances.
  throw new Error("Not implemented - reference only");
}
```

#### 3.1.2 React Integration Sketch (GiftwrappedMessaging.tsx)

```tsx
// Reference-only sketch of how GiftwrappedMessaging could wire geo-room subscriptions
// into the existing Bitchat tab. This is *not* production code.
// File: src/components/communications/GiftwrappedMessaging.tsx

// ... existing imports ...
import type { NostrEvent } from "../../../types/common";
import {
  subscribeToGeoRoom,
  type GeoRoomSubscription,
  type GeoRoomError,
} from "../../../lib/geochat/geo-room-service";

// Phase 2 addition: helper to map GeoRoomError.kind to user-facing copy.
function mapGeoRoomErrorToMessage(error: GeoRoomError): string {
  switch (error.kind) {
    case "no_relays_available":
      return "No healthy relays are available for this area right now. Try a broader region or try again later.";
    case "invalid_geohash":
      return "That geohash does not look valid. Check the value or pick from the suggested list.";
    case "registry_unavailable":
      return "Geo-room relay registry is temporarily unavailable. We could not join this room.";
    default:
      return "Unexpected error joining geo-room. Please try again.";
  }
}

// ... existing component definition ...

export function GiftwrappedMessaging(/* existing props */): JSX.Element {
  // ... existing state and hooks ...

  // Phase 2 addition: Bitchat geo-room state + subscription handle.
  // Reuses existing `bitchatEnabled` and `currentTab` state that already
  // control whether the Bitchat tab is shown and active.
  const [bitchatGeohashInput, setBitchatGeohashInput] = useState<string>("");
  const [bitchatActiveGeohash, setBitchatActiveGeohash] = useState<
    string | null
  >(null);
  const [bitchatMessages, setBitchatMessages] = useState<
    ReadonlyArray<NostrEvent>
  >([]);
  const [bitchatError, setBitchatError] = useState<string | null>(null);
  const bitchatSubscriptionRef = useRef<GeoRoomSubscription | null>(null);

  // Phase 2 addition: keep the geo-room subscription in sync with the
  // active geohash while the Bitchat tab is active.
  useEffect(() => {
    // If Bitchat is disabled, tab is not active, or no active geohash is set,
    // ensure we are unsubscribed and do nothing else.
    if (!bitchatEnabled || currentTab !== "bitchat" || !bitchatActiveGeohash) {
      if (bitchatSubscriptionRef.current) {
        bitchatSubscriptionRef.current.unsubscribe();
        bitchatSubscriptionRef.current = null;
      }
      return;
    }

    let isCancelled = false;

    async function ensureGeoRoomSubscription(): Promise<void> {
      // If we already have a subscription, prefer in-place migration using
      // updateGeohash so that CEPS connections are reused when possible.
      if (bitchatSubscriptionRef.current) {
        try {
          await bitchatSubscriptionRef.current.updateGeohash(
            bitchatActiveGeohash
          );
          setBitchatError(null);
          return; // Successful migration; nothing else to do.
        } catch (updateError: unknown) {
          // If migration fails, fall back to full teardown + new subscription.
          bitchatSubscriptionRef.current.unsubscribe();
          bitchatSubscriptionRef.current = null;
        }
      }

      try {
        const subscription = await subscribeToGeoRoom({
          geohash: bitchatActiveGeohash,
          onEvent: (event: NostrEvent) => {
            if (isCancelled) return; // avoid updates after cleanup
            setBitchatMessages((prev) => [...prev, event]);
          },
          onError: (geoError: GeoRoomError) => {
            if (isCancelled) return;
            setBitchatError(mapGeoRoomErrorToMessage(geoError));
          },
        });

        if (isCancelled) {
          // Effect was cleaned up before subscription resolved; dispose immediately.
          subscription.unsubscribe();
          return;
        }

        bitchatSubscriptionRef.current = subscription;
        setBitchatError(null);
      } catch (err: unknown) {
        if (isCancelled) return;
        const fallbackMessage =
          err instanceof Error
            ? err.message
            : "Unknown error while connecting to geo-room.";
        setBitchatError(fallbackMessage);
      }
    }

    void ensureGeoRoomSubscription();

    // Cleanup on dependency change (tab switch, geohash change, disable) or unmount.
    return () => {
      isCancelled = true;
      if (bitchatSubscriptionRef.current) {
        bitchatSubscriptionRef.current.unsubscribe();
        bitchatSubscriptionRef.current = null;
      }
    };
  }, [bitchatEnabled, currentTab, bitchatActiveGeohash]);

  // Phase 2 addition: handler used by the Bitchat "Connect" button.
  const handleBitchatConnect = (): void => {
    const trimmed = bitchatGeohashInput.trim();
    if (!trimmed) {
      setBitchatError(
        "Enter a geohash (e.g. 9q8yy) to join a public geo-room."
      );
      return;
    }

    // Reset messages when switching rooms; the effect above will migrate
    // or recreate the subscription as needed.
    setBitchatMessages([]);
    setBitchatError(null);
    setBitchatActiveGeohash(trimmed);
  };

  // ... existing render logic ...

  return (
    // ... existing layout wrappers ...
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {currentTab === "bitchat" ? (
        <div className="text-xs text-purple-900 space-y-2">
          <div className="font-medium">Bitchat</div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Enter geohash (e.g. 9q8yy)"
              className="border border-purple-300 rounded px-2 py-1 text-xs"
              value={bitchatGeohashInput}
              onChange={(e) => setBitchatGeohashInput(e.target.value)}
            />
            <button
              type="button"
              onClick={handleBitchatConnect}
              className="text-xs bg-purple-600 text-white rounded px-2 py-1 hover:bg-purple-700"
            >
              Connect
            </button>
          </div>

          {bitchatError && (
            <div className="p-2 text-[11px] text-red-600" role="alert">
              {bitchatError}
            </div>
          )}

          <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
            {bitchatMessages.map((event) => (
              <li key={event.id} className="text-[11px]">
                {event.content}
              </li>
            ))}
          </ul>

          <div className="text-[11px] text-purple-700">
            Public geo-rooms with minimal privacy. Use for discovery only.
          </div>
        </div>
      ) : currentTab === "groups" ? (
        // ... existing Groups tab content ...
        <div>{/* unchanged groups UI */}</div>
      ) : currentTab === "contacts" ? (
        // ... existing Contacts tab content ...
        <div>{/* unchanged contacts UI */}</div>
      ) : (
        // ... existing Strangers tab content ...
        <div>{/* unchanged strangers UI */}</div>
      )}
    </div>
  );
}
```

This sketch illustrates both lifecycle responsibilities (subscribe, migrate on geohash change, unsubscribe on cleanup) and error handling via `GeoRoomError` → user-facing message mapping, without prescribing the final UI layout.

## 4. Implementation Checklist

1. **Create Georelay Registry**
   - File: `src/config/georelays.json` (static initial registry) or a similar TS module with typed records.
   - Include a `version` field and optional metadata needed for health scoring.
2. **Implement GeoRelaySelector**
   - File: `src/lib/geochat/geo-relay-selector.ts`.
   - Implement the deterministic SHA-256-based scoring algorithm described above.
   - Enforce the contract that it **never** returns an empty array: when no candidates pass filters, throw `GeoRelaySelectionError` so callers can apply fallbacks.
3. **Create Geo Room Service**
   - File: `src/lib/geochat/geo-room-service.ts`.
   - Expose `publishGeoRoomMessage` and `subscribeToGeoRoom` wrappers using `central_event_publishing_service`.
   - Implement fallback behavior to `MESSAGING_CONFIG.relays` when selection fails, and map terminal failures to typed `GeoRoomError` instances (e.g. `"no_relays_available"`, `"invalid_geohash"`).
   - Implement `GeoRoomSubscription` with `unsubscribe()` and `updateGeohash(newGeohash)` to handle geohash changes and ensure subscriptions are cleaned up on unmount.
4. **Wire UI to Service**
   - File: `src/components/communications/GiftwrappedMessaging.tsx`.
   - Add "Connect" behavior that calls `subscribeToGeoRoom`, stores the returned `GeoRoomSubscription`, and disposes it in React effect cleanup.
   - Handle geohash changes by calling `subscription.updateGeohash(newGeohash)` or by disposing and creating a new subscription.
   - Surface `GeoRoomError` codes as user-friendly, non-technical messages (e.g. "No nearby relays available" instead of raw error text).
5. **Tests**
   - `src/lib/geochat/__tests__/geo-relay-selector.test.ts`: deterministic selection invariants, error cases (e.g. registry unavailable), and `GeoRelaySelectionError` behavior.
   - `src/lib/geochat/__tests__/geo-room-service.test.ts`: CEPS integration using mocks, lifecycle tests for `GeoRoomSubscription` (unsubscribe and `updateGeohash`), and error-to-UI mapping.

## 5. Testing Strategy

- **Unit Tests:**
  - Same geohash always yields the same ordered `relayUrls` set for a fixed registry version.
  - Changing `VITE_GEOCHAT_DEFAULT_RELAY_COUNT` changes the number of relays selected but not order.
  - `GeoRelaySelector` throws `GeoRelaySelectionError` instead of returning an empty array when no candidates are available.
- **Integration Tests:**
  - Use CEPS test doubles to verify that `publishGeoRoomMessage` tags events correctly, uses primary or fallback relays as appropriate, and surfaces `GeoRoomError` codes when no relays are available.
  - Exercise `subscribeToGeoRoom` lifecycle: initial subscribe, `updateGeohash` migration, and `unsubscribe` cleanup.
  - Simulate CEPS-level failures and ensure `onError` receives appropriate `GeoRoomError` values that the UI can map to user-facing messages.
- **Manual Testing:**
  - In dev, connect to several geohashes and verify that multiple browser sessions see the same messages and converge on the same relay set.
  - Manually kill or block selected relays (where possible) and confirm that CEPS reconnection and geo-room UI error states behave as specified.
- **Privacy/Security Validation:**
  - Confirm that no non-essential metadata (IP, precise coordinates) is stored or transmitted beyond necessary Nostr relay communication.
  - Verify that UX copies clearly describe the geohash precision and privacy trade-offs between Phase 1 (read-only) and Phase 2 (public posting).

## 6. User Experience Flow

- From Phase 1 UI, after user consents and selects a geohash (with clear copy about precision and privacy), a "Connect" button starts a live session.
- Messages appear in a minimal list, clearly labeled as "Public Geo-Room" messages, with a short description of the approximate area covered by the current geohash (e.g., "city-level room" vs "neighborhood-level room").
- Errors are mapped from `GeoRoomError` codes to non-technical messages, for example:
  - `"no_relays_available"` → "We couldnt find any healthy relays for this area. Please try a broader region or try again later."
  - `"invalid_geohash"` → "That geohash doesnt look right. Check the value or pick from the suggested list."
- Accessibility: list updates should be announced to screen readers where feasible, and error banners should use ARIA roles for alerts.

## 7. Migration & Rollout Plan

- Guard Phase 2 behavior behind `VITE_GEOCHAT_ENABLED` and possibly `VITE_GEOCHAT_LIVE_ENABLED`.
- Ensure disabling flags reverts Geo tab to Phase 1 read-only mode without breaking other messaging.
- No DB migration needed; rollback is flag-based.

## 8. Open Questions & Risks

- Long-term evolution of the georelay registry beyond the initial static, versioned bundle (e.g. introducing signed dynamic updates without breaking determinism across clients on the same version).
- Potential performance issues if many subscriptions are open; need CEPS-level rate limiting and possibly hard limits on concurrent geo-rooms per client.
- Ongoing trade-off between relay locality (better UX/latency) and privacy (using a more diverse, non-local relay set) as the registry and trust models evolve.
