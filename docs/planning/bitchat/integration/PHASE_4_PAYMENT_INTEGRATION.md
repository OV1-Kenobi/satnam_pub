# Phase 4: Payment Integration Planning

## 1. Phase Overview

- **Objective:** Enable safe, optional payments (Lightning, Cashu, Fedimint) initiated from geo-room contexts, reusing Satnam's existing payment stack and maintaining privacy-first controls.
- **Success Criteria:**
  - From a geo-room message or contact, users can open a payment flow prefilled with that peer.
  - Payments route through existing APIs (`privacy-enhanced-payments`, `payment-automation`, `automated-signing-manager`).
  - Additional safeguards are in place for low-trust, geo-discovered contacts.
- **Estimated Complexity/Time:** Medium–High (6–9 developer-days including UX, plumbing, and security review).
- **Dependencies:**
  - **Phase 0:** Verified LNbits wallet provisioning, documented payment primitives (tips, streaming sats, micro-payments).
  - Phases 1–3 (geo-rooms, contacts, trust, private messaging).
  - Payment modules: `lib/fedimint/*`, `lib/lightning-client.ts`, `src/lib/automated-signing-manager.ts`, `src/lib/payment-automation.ts`.
  - APIs: `api/family/privacy-enhanced-payments.js`, `api/payments/p2p-lightning.js`, `api/family/cashu/wallet.js`.

## 2. Technical Specifications

- **Data Models:**
  - `GeoPaymentContext` with `originGeohash: string`, `recipientNpub: string`, `trustLevel: string`, `paymentMethodHint?: "lightning" | "cashu" | "fedimint"`.
- **API Contracts:**
  - UI-level helper `openGeoPaymentDialog(context: GeoPaymentContext): void` in `src/components/communications/GeoPaymentButton.tsx`.
  - Service-level `geo-room-service.ts` helper `createGeoPaymentRequest(context: GeoPaymentContext, amount: number): Promise<void>` that delegates to existing payment orchestration.
- **Database Schema Changes:**
  - None strictly required; payments are already tracked in family/payment tables with minimal context.
  - Optionally include `origin_geohash` or `origin_context` as additional metadata in payment records, guarded by RLS and hashed if needed.
- **Environment Variables / Flags:**
  - `VITE_GEOCHAT_PAYMENTS_ENABLED` to gate payment UI in geo-rooms.
  - Reuse existing payment feature flags (`VITE_FEDIMINT_INTEGRATION_ENABLED`, `VITE_BIFROST_ENABLED`, etc.) via `getEnvVar` in payment modules.
- **Integration Points:**
  - `GiftwrappedMessaging.tsx`: message context menu entry "Send payment" when payments are enabled.
  - `src/lib/automated-signing-manager.ts`: invoked when the user confirms a payment.
  - `src/lib/payment-automation.ts` and `api/family/privacy-enhanced-payments.js`: used for more advanced routing.

## 3. Architecture & Design Decisions

- **Component/Service Arrangement:**
  - A small presentational component `GeoPaymentButton` for UI inside geo-room message actions.
  - A thin `geo-payment-service.ts` module that wraps calls into existing payment orchestration, so geo-specific concerns stay out of core payment logic.
- **Data Flow:**
  - User selects "Send payment" → builds `GeoPaymentContext` → opens payment modal.
  - On confirm, `geo-payment-service` selects routing (or defers to existing `determineOptimalRouting`), then calls the appropriate backend.
- **Security & Privacy:**
  - Payments to low-trust, geo-found contacts should have explicit warnings and possibly stricter limits.
  - No new keys or wallets created; all flows use existing family or user wallets.
- **Browser/Serverless Constraints:**
  - Client code only initiates HTTP requests to Netlify Functions (`/api/...`); no direct LN node connections from browser.
- **Web Crypto Usage:**
  - Use existing Web Crypto patterns (e.g., payment hash generation where already implemented); avoid duplicating or altering cryptographic code in this phase.

## 4. Implementation Checklist

1. **Define Geo Payment Context Types**
   - File: `src/lib/geochat/geo-payment-types.ts`.
   - Define `GeoPaymentContext` and helpers for deriving context from a geo-room message.
2. **Create Geo Payment Service**
   - File: `src/lib/geochat/geo-payment-service.ts`.
   - Implement `createGeoPaymentRequest` delegating to `AutomatedSigningManager` or payment APIs.
3. **UI Integration**
   - File: `src/components/communications/GiftwrappedMessaging.tsx`.
   - Add "Send payment" to message actions when `VITE_GEOCHAT_PAYMENTS_ENABLED` is true.
4. **Trust-Aware Safeguards**
   - Files: `src/lib/trust/enhanced-trust-scoring.ts`, `src/lib/trust/trust-score.ts`.
   - Introduce helper to categorize trust into levels and expose guidance to the payment UI.
5. **Tests**
   - Unit tests for `geo-payment-service` ensuring correct routing parameters.
   - Integration tests exercising one end-to-end payment initiation from geo-room into payment backend using mocks.

## 5. Testing Strategy

- **Unit Tests:**
  - Validate mapping of `GeoPaymentContext` to payment payloads: correct recipient, amount, and metadata.
- **Integration Tests:**
  - Simulate user clicking "Send payment" in a geo-room and ensure the correct Netlify Function is called based on routing.
- **Manual Testing:**
  - In a staging environment with test wallets, send small payments between test accounts discovered via geo-rooms.
- **Privacy/Security Validation:**
  - Confirm no payment secrets (keys, seeds) appear in client logs or network payloads.

## 6. User Experience Flow

- From a geo-room message, user selects "Send payment".
- A modal shows the recipient, trust level indication, and amount field, plus clear warnings for low-trust peers.
- After confirmation, a progress indicator shows payment routing and final status.
- Errors (insufficient funds, disabled payment integrations, routing failures) guide users to resolve or cancel.

## 7. Migration & Rollout Plan

- Introduce `VITE_GEOCHAT_PAYMENTS_ENABLED` off by default.
- Validate payment flows in internal and canary environments before public flag enablement.
- Rollback plan: toggle off flag; payment entries in geo-rooms disappear, while underlying payment infra remains unaffected.

## 8. Open Questions & Risks

- UX complexity of exposing multiple payment rails (Lightning, Cashu, Fedimint) in a small modal.
- Potential for social-engineering scams in public rooms; may require content warnings or heuristics.
- Interaction between family-level payment policies and geo-originated payments (e.g., guardian approvals).

---

## 9. Implementation Notes

### 9.1 Implementation Status

| Priority | Description            | Status      | Completion Date |
| -------- | ---------------------- | ----------- | --------------- |
| 1        | Geo Payment Types      | ✅ Complete | 2025-11-26      |
| 2        | Feature Flag           | ✅ Complete | 2025-11-26      |
| 3        | Geo Payment Service    | ✅ Complete | 2025-11-26      |
| 4        | Trust-Aware Safeguards | ✅ Complete | 2025-11-26      |
| 5        | UI Integration         | ✅ Complete | 2025-11-26      |
| 6        | Unit Tests             | ✅ Complete | 2025-11-26      |

### 9.2 Code Artifacts

| File                                                    | Description                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/lib/geochat/geo-payment-types.ts`                  | Phase 4 type definitions (GeoPaymentContext, GeoPaymentRequest, GeoPaymentResult, PaymentWarning, etc.) |
| `src/config/env.client.ts`                              | Added `GEOCHAT_PAYMENTS_ENABLED` feature flag                                                           |
| `src/lib/geochat/geo-payment-service.ts`                | Payment service with account detection, trust safeguards, and payment routing                           |
| `src/components/communications/GeoRoomTab.tsx`          | UI integration with payment button and modal placeholder                                                |
| `src/lib/geochat/__tests__/geo-payment-service.test.ts` | 13 unit tests for Phase 4 payment functionality                                                         |

### 9.3 Test Coverage Summary

**Phase 4 Tests (13 tests):**

- `getPaymentWarning()`: 6 tests covering trust thresholds and custom thresholds
- `getAccountContext()`: 2 tests for individual and federation account detection
- `buildGeoPaymentContext()`: 2 tests for context building and geohash truncation
- `createGeoPaymentRequest()`: 3 tests for blocked payments, successful payments, and warnings

**Total Geochat Tests:** 77 tests passing

### 9.4 Key Implementation Decisions

1. **Account Type Detection**: Uses `user_identities` table with fallback to `family_members` table to determine if user is individual or federation member.

2. **Trust Thresholds**: Implemented as confirmed by user:

   - Unknown contacts: warn at >5,000 sats, block at >50,000 sats
   - Known contacts: warn at >50,000 sats
   - Verified contacts: no automatic blocks

3. **Privacy Level Default**: Set to `"auto"` (not `"giftwrapped"`) as confirmed by user.

4. **Guardian Approval**: Determined by federation settings (`guardian_approval_threshold`), not geo-specific logic.

5. **Payment Routing**: Individual users route through `/api/family/privacy-enhanced-payments`, federation members route through `/api/family/fedimint/payment`.

6. **Geohash Privacy**: Origin geohash is truncated to 4 characters for privacy protection.

7. **npub Conversion**: Hex pubkeys from Nostr events are converted to npub format using `nip19.npubEncode()`.
