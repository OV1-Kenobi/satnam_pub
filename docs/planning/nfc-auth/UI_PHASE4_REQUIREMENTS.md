# NFC UI Phase 4 Requirements (Planner-A)

## Objectives

- Provide clear UI entrypoints for NFC authentication while preserving zero-knowledge security guarantees.
- Ensure seamless user experience across supported/unsupported devices with graceful fallbacks.
- Align with `SECURITY_AUDIT_REPORT.md` findings (no nsec exposure, placeholder avoidance, CEPS compliance).

## Functional Requirements

### 1. Capability Detection

- Implement utility `src/lib/nfc/capability-detector.ts` that returns:
  - `available` boolean.
  - `reason` string explaining unavailability (e.g., “Web NFC not supported”, “Requires HTTPS”, “Android only”).
  - `fallback` recommendation: `"password" | "nip07" | "qrcode" | null`.
  - Feature flags status (master enable, MFA enable, timeout).
- Inputs checked:
  - `'NDEFReader' in window`.
  - `location.protocol === "https:"` (or `localhost` exception).
  - `navigator.userAgent` for Android (Web NFC constraint).
  - Feature flags from `src/config/env.client.ts`.
- Output cached for session; re-check when environment changes (e.g., enabling HTTPS).

### 2. Feature Flags

- Add to `.env.example` & `src/config/env.client.ts`:
  - `VITE_ENABLE_NFC_AUTH` (default `false`).
  - `VITE_ENABLE_NFC_MFA` (default `false`).
  - `VITE_NFC_TIMEOUT_MS` (default `10000`).
  - `VITE_TAPSIGNER_DEBUG` (default `false`).
- Provide helper `src/lib/nfc/feature-flags.ts` with:
  - `isNFCEnabled()`.
  - `isNFCMFAEnabled()`.
  - `getNFCSigningMode()` (future-proof).
  - `getNFCTimeoutMs()` (bounded [5000, 60000]).
  - Logging disabled in production.

### 3. NFCAuthButton Component

- Location: `src/components/auth/NFCAuthButton.tsx`.
- Props:
  - `onSuccess(payload: NFCSuccessPayload)`.
  - `onFallback(selectedFallback: "password" | "nip07" | "qrcode")`.
  - Optional `purpose` ("login", "mfa", "tap-to-sign").
- States/UI:
  - `idle`: button enabled with NFC icon.
  - `scanning`: spinner + “Tap your NFC card…” (aria-live).
  - `success`: checkmark, auto-dismiss after callback.
  - `error`: error message, option to retry or fallback.
  - `unavailable`: disabled button w/ tooltip referencing fallback banner.
- Behavior:
  - On click, checks capability; if unavailable, triggers fallback callback.
  - Invokes shared `authenticateWithNFC()` from AuthProvider.
  - Handles Promise resolution/rejection with try/catch, respecting `VITE_NFC_TIMEOUT_MS`.
  - Guardian requirement: if `TapToSignRequest.requiresGuardianApproval` true, show modal referencing steward plan (placeholder text).
- Accessibility:
  - `aria-pressed`, `aria-live="polite"` for status messages.
  - Icon + text contrasts meet WCAG AA.

### 4. Capability Banner & Fallback UI

- Components:
  - `src/components/nfc/NFCCapabilityBanner.tsx`
    - Shows when capability detector `available === false`.
    - Displays `reason` and recommended fallback option.
    - Dismissible (localStorage key `nfcBannerDismissed`).
  - `src/components/nfc/NFCFallbackDialog.tsx`
    - Modal triggered after repeated errors/timeouts.
    - Offers fallback actions (buttons linking to password/NIP-07 flows).
- Copy must be zero-knowledge: no raw card IDs or user-specific info.

### 5. AuthProvider Enhancements

- `src/components/auth/AuthProvider.tsx`:
  - Introduce context state: `{ nfcAvailable, nfcStatus, authenticateWithNFC }`.
  - `authenticateWithNFC` pipeline:
    - Lazy instantiate `NFCHardwareSecurityManager`.
    - Run capability detection before calling `tapToSign/tapToSpend`.
    - Map results to `NFCSuccessPayload` (no sensitive data; only truncated UID, operation type).
  - Provide error enumerations for UI:
    - `NFC_UNAVAILABLE`, `PERMISSION_DENIED`, `TIMEOUT`, `HARDWARE_ERROR`, `GUARDIAN_REQUIRED`, `INTERNAL_ERROR`.
  - Ensure zero-knowledge logging: errors only include codes + truncated IDs.

### 6. Graceful Degradation Flows

- Login page logic:
  - Evaluate capability on mount.
  - If `available`, render `NFCAuthButton`; otherwise show banner and default to password.
  - Provide user choice to retry NFC after enabling features (e.g., toggling `ENABLE_NFC_AUTH`).
- Fallback logic:
  - After 2 consecutive NFC failures, prompt fallback dialog.
  - Provide manual QR code fallback stub for future work (documented, not implemented).
  - On HTTP (non-HTTPS), show instructions to access via secure URL.

### 7. Error Handling & Security

- Map raw errors to user-safe messages (e.g., DOMException).
- Do not display stack traces or internal codes.
- Ensure CEPS placeholder risk is surfaced: if CEPS returns invalid event signature, show error “Secure signing temporarily unavailable” and disable button until reload.

### 8. Logging & Telemetry

- All UI telemetry should emit anonymized events (operation type, status, fallback selection).
- No raw UIDs, signature bytes, or nsec references.

## Non-Functional Requirements

- Responsive design suitable for mobile-first (Android) but accessible on desktop (shows fallback).
- Internationalization-ready copy (strings centralized).
- Unit tests for capability detector, feature flags, button state transitions.
- Integration tests covering:
  - Successful NFC auth path (mocked).
  - Unsupported device path.
  - Timeout & fallback modal.
- Zero additional bundle size >50KB (optimize imports, lazy-load heavy modules if necessary).

## Dependencies & References

- `docs/planning/nfc-auth/UI_PHASE4_ARCHITECTURE.md` (architecture baseline).
- `SECURITY_AUDIT_REPORT.md` (zero-knowledge requirements).
- `audit-reports/IMPLEMENTATION_STATUS_DETAIL.md` (NFC implementation status).
- `secureNsecManager`, `ntag424Manager`, `NFCAuthService` usage patterns.
- Browser requirements for Web NFC (Chrome Android, HTTPS).

## Risks & Considerations

- CEPS placeholder functions still critical risk; UI must degrade gracefully if signing fails.
- Web NFC availability limited; ensure user communication is clear.
- Guardian/steward workflows incomplete; UI must signal “Authorization pending feature rollout”.
- Need to avoid race conditions when multiple NFC actions triggered simultaneously.

## Deliverables (Planner-B onward)

- Detailed task list per component (capability detector, feature flags, NFC button, banners, fallback modal, AuthProvider updates).
- Estimated effort per task with priority ranking.
- Testing strategy for UI and integration layers.
