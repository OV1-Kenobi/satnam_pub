# Phase 1: Read-Only Geo Discovery Planning

> **STATUS: ✅ IMPLEMENTATION COMPLETE** (2024-11-26)
>
> All checklist items implemented and tested. 83 total tests passing (60 Phase 0 + 23 Phase 1).

## 1. Phase Overview

- **Objective:** Introduce a browser-only, read-only geohash discovery experience in `GiftwrappedMessaging` that lets users select and preview geo-rooms without sending live messages.
- **Success Criteria:**
  - ✅ `GiftwrappedMessaging` exposes a "Geo Rooms (Bitchat)" tab wired to geohash selection.
  - ✅ Users can input or derive a geohash and see its precision (region/city/neighborhood/block).
  - ✅ Privacy warnings and consent flow appear on first use.
  - ✅ All logic is fully gated behind a `VITE_GEOCHAT_ENABLED`-style feature flag.
- **Estimated Complexity/Time:** Low–Medium (2–4 developer-days including tests and UX polish).
- **Dependencies:**
  - **Phase 0:** `georelays.json` registry for relay preview (read-only display of which relays would be used).
  - Existing Nostr config: `config.nostr.relays`, `src/lib/gift-wrapped-messaging/privacy-first-service.ts` `MESSAGING_CONFIG.relays`.
  - UI: `src/components/communications/GiftwrappedMessaging.tsx`, `src/components/communications/MessagingIntegration.tsx`.
  - No new DB tables; relies on current privacy-first identity model.

## 2. Technical Specifications

- **Data Models (TypeScript examples):**
  - `GeoPrecision = "region" | "city" | "neighborhood" | "block";`
  - `GeoRoomSelection` with `geohash: string`, `precision: GeoPrecision`, `source: "manual" | "browser_geolocation" | "search"`.
  - `GeoDiscoveryState` with `currentSelection?: GeoRoomSelection`, `hasConsented: boolean`.
- **APIs / Functions:**
  - `resolveGeoPrecision(geohash: string): GeoPrecision` in `src/lib/geochat/geo-utils.ts`.
  - `normalizeGeohash(input: string): string | null` (validation, lowercase, trim).
  - Optional Phase-1-only helper: `previewGeoRoom(geohash: string): Promise<void>` which logs or simulates CEPS usage without full live messaging.
- **Database Schema Changes:**
  - None in Phase 1; all state is in-memory React state or browser storage (optional `localStorage` consent flag).
- **Environment Variables / Feature Flags:**
  - `VITE_GEOCHAT_ENABLED` (controls whether Geo Rooms tab is shown at all).
  - Reuse `MESSAGING_FEATURES.ENHANCED_RELAY_DISCOVERY` for future phases but do not depend on it here.
- **Integration Points:**
  - `GiftwrappedMessaging.tsx`: expand the existing `currentTab === 'bitchat'` block into a real geohash selection UI with consent banner.
  - `src/lib/gift-wrapped-messaging/privacy-first-service.ts`: read `MESSAGING_CONFIG.relays` for Phase-1 relay preview text only (no new CEPS calls yet).

## 3. Architecture & Design Decisions

- **Component Structure:**
  - New small hook `useGeoDiscovery` in `src/hooks/useGeoDiscovery.ts` that wraps geohash validation, precision detection, and consent state.
  - `GiftwrappedMessaging` consumes `useGeoDiscovery` for the "Geo Rooms" tab.
- **Data Flow (User Journey):**
  - User selects the Geo tab → onboarding modal explains risks → user consents.
  - User enters a geohash or chooses "Use approximate location" → `useGeoDiscovery` computes precision and updates local state.
  - Component renders summary: precision, approximate radius, and which relays _would_ be used (from existing config), but does not yet subscribe.
- **Security & Privacy:**
  - No raw GPS coordinates leave the browser; geohashes are computed client-side only.
  - No DB writes; geohash selections are not persisted server-side.
  - Onboarding clearly marks Phase 1 as discovery-only with no guarantees of message delivery or anonymity.
- **Browser/Serverless Constraints:**
  - Any geohash helper must be pure TypeScript using browser-safe math utilities; no Node.js `crypto` or `Buffer`.
  - No Netlify Functions required in Phase 1.
- **Web Crypto Usage:**
  - Phase 1 can avoid Web Crypto entirely or limit use to optional hashing for future phases; if needed, use `crypto.subtle` inside functions (never at module top level).

## 4. Implementation Checklist

1. ✅ **Create Geo Types and Helpers**
   - Files: `src/lib/geochat/types.ts`, `src/lib/geochat/geo-utils.ts`, `src/lib/geochat/index.ts`
   - Implemented: `GeoPrecision`, `GeoRoomSelection`, `GeoDiscoveryState`, `GeoRoomPreview`, `GeoDiscoveryError`
   - Utilities: `normalizeGeohash`, `resolveGeoPrecision`, `getApproximateRadius`, `getRadiusDescription`, `validateGeohash`, `isValidGeohash`, `buildGeoRoomPreview`, `getGeohashFromBrowserLocation`
2. ✅ **Create `useGeoDiscovery` Hook**
   - File: `src/hooks/useGeoDiscovery.ts`
   - Exposes: `{ state, setSelection, reset, recordConsent, revokeConsent, consentStatus, requestBrowserLocation, preview, isEnabled }`
   - Strict typing with no `any`; auto-initializes GeoRelaySelector from Phase 0
3. ✅ **Wire Geo Tab in GiftwrappedMessaging**
   - Created: `src/components/communications/GeoRoomTab.tsx` (standalone component)
   - Modified: `src/components/communications/GiftwrappedMessaging.tsx` to integrate GeoRoomTab
   - Features: consent modal, geohash input, browser geolocation, precision/radius display, relay preview
4. ✅ **Add Feature Flag Integration**
   - File: `src/config/env.client.ts` - added `VITE_GEOCHAT_ENABLED` flag (default: false)
   - `clientConfig.flags.geochatEnabled` wired to conditional rendering
5. ✅ **Tests**
   - Created: `src/lib/geochat/__tests__/geo-utils.test.ts` (23 tests)
   - All 83 tests passing (Phase 0: 60, Phase 1: 23)

## 5. Testing Strategy

- **Unit Tests:**
  - Validate `resolveGeoPrecision` for different geohash lengths.
  - Ensure invalid geohashes are rejected by `normalizeGeohash`.
- **Integration Tests:**
  - Mount `GiftwrappedMessaging` with `VITE_GEOCHAT_ENABLED=true` and assert that consent banner appears and that state updates as user types a geohash.
- **Manual Testing:**
  - Use dev build to confirm that toggling `VITE_GEOCHAT_ENABLED` hides/shows the Geo tab.
  - Confirm nothing breaks existing messaging when Geo tab is disabled.
- **Privacy/Security Validation:**
  - Verify no network calls are made purely on geohash entry.
  - Confirm no geohash values are persisted to Supabase or logged with precise timestamps beyond client console (to be disabled in production).

## 6. User Experience Flow

- User opens Communications → sees optional "Geo Rooms" card.
- On first click, onboarding modal explains public discovery, geolocation risks, and that this phase is read-only.
- User chooses precision and geohash source and sees a summary: approximate area and example relays.
- Errors: invalid geohash, denied browser geolocation, or disabled feature flag show clear, non-technical messages.
- Accessibility: ensure labels and instructions are screen-reader friendly and keyboard navigable.

## 7. Migration & Rollout Plan

- Introduce `VITE_GEOCHAT_ENABLED` defaulting to `false` in all environments.
- No schema or API changes, so backward compatibility is trivial.
- Rollout by enabling flag for internal testers, measuring adoption, then widening scope.
- Rollback: simply turn feature flag off; no persistent data to clean up.

## 8. Open Questions & Risks

- ✅ **RESOLVED:** Which geohash library (if any) to use → Used internal implementation from Phase 0 `GeoRelaySelector.encodeGeohash()` and `decodeGeohash()`.
- UX risk: users may overestimate privacy; copy must emphasize limitations.
- Potential need for i18n in later phases for geohash explanations.
- Future phases will connect this discovery UI to live Nostr traffic; ensure current design leaves enough space for message lists and actions.

---

## 9. Implementation Summary

### Files Created

| File                                           | Purpose                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/lib/geochat/types.ts`                     | TypeScript types (GeoPrecision, GeoRoomSelection, GeoDiscoveryState, etc.)           |
| `src/lib/geochat/geo-utils.ts`                 | Utility functions (normalizeGeohash, resolveGeoPrecision, buildGeoRoomPreview, etc.) |
| `src/lib/geochat/index.ts`                     | Barrel exports                                                                       |
| `src/hooks/useGeoDiscovery.ts`                 | React hook for geo-room state and consent management                                 |
| `src/components/communications/GeoRoomTab.tsx` | Standalone geo-room UI component                                                     |
| `src/lib/geochat/__tests__/geo-utils.test.ts`  | 23 unit tests                                                                        |

### Files Modified

| File                                                     | Changes                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/config/env.client.ts`                               | Added `VITE_GEOCHAT_ENABLED` flag and `geochatEnabled` to ClientConfig |
| `src/components/communications/GiftwrappedMessaging.tsx` | Integrated GeoRoomTab, replaced static Bitchat stub                    |

### Test Results

- **Phase 0:** 60 tests passing
- **Phase 1:** 23 tests passing
- **Total:** 83 tests passing
