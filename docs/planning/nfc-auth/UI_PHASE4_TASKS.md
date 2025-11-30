# NFC UI Phase 4 Detailed Tasks (Planner-C/D - QA Approved)

Each task is atomic, with mode hints, integration points, acceptance criteria, and QA notes.

---

## Phase 1 – Foundations

### Task 1: Implement NFC Capability Detector

- Action: Create `src/lib/nfc/capability-detector.ts` exporting `detectNFCCapability()`.
- Mode: /code-monkey
- Integration:
  - Uses `window.NDEFReader`, `location`, `navigator.userAgent`.
  - Reads feature flags via helper (Task 2).
- Acceptance:
  - Returns `{ available, reason, fallback, features }`.
  - Unit tests cover supported/unsupported cases.
- QA Notes:
  - Ensure HTTPS vs localhost logic correct.
  - Avoid referencing undefined globals in SSR contexts.

### Task 2: Add Feature Flag Helpers

- Action: Update `.env.example`, `src/config/env.client.ts`, create `src/lib/nfc/feature-flags.ts`.
- Mode: /code-monkey
- Integration:
  - Expose `isNFCEnabled`, `isNFCMFAEnabled`, `getNFCTimeoutMs`.
- Acceptance:
  - Defaults documented.
  - Helper tests ensure bounds on timeout.
- QA Notes:
  - Validate environment parsing works for SSR/build tools.
  - Document defaults in README.

### Task 3: Extend AuthProvider with NFC Context

- Action: Modify `src/components/auth/AuthProvider.tsx` to expose `authenticateWithNFC`, `nfcStatus`.
- Mode: /code
- Integration:
  - Leverage `NFCHardwareSecurityManager`.
  - Use capability detector & feature flags.
  - Map errors to enums.
- Acceptance:
  - Context consumers can trigger NFC auth.
  - Zero-knowledge logging preserved.
- QA Notes:
  - Single NFC manager instance enforced.
  - Ensure cleanup on unmount to avoid dangling listeners.

---

## Phase 2 – UI Components

### Task 4: Build NFCAuthButton Component

- Action: Create `src/components/auth/NFCAuthButton.tsx`.
- Mode: /front-end
- Integration:
  - Consumes AuthProvider context & capability detector.
  - Supports states: idle, scanning, success, error, unavailable.
- Acceptance:
  - Accessible (aria-live).
  - Handles guardian placeholder messaging.
  - Unit tests cover state machine.
- QA Notes:
  - Prevent double submits by disabling while scanning.
  - Provide analytics-friendly events without sensitive data.

### Task 5: Create NFCCapabilityBanner

- Action: `src/components/nfc/NFCCapabilityBanner.tsx`.
- Mode: /front-end
- Integration:
  - Displays `reason` & fallback from capability detector.
  - Dismiss state stored via localStorage.
- Acceptance:
  - Renders only when `available === false`.
  - Copy zero-knowledge compliant.
- QA Notes:
  - Provide screen-reader friendly copy.
  - Ensure banner doesn't reappear within same session once dismissed.

### Task 6: Implement NFCFallbackDialog

- Action: `src/components/nfc/NFCFallbackDialog.tsx`.
- Mode: /front-end
- Integration:
  - Triggered after repeated errors or manual fallback.
  - Offers password/NIP-07/QR options.
- Acceptance:
  - Buttons invoke callbacks.
  - Copy references secure fallback flows.
- QA Notes:
  - Escape/close button support.
  - Focus trap inside modal.

---

## Phase 3 – Integration & UX

### Task 7: Wire Components into Login/Auth Views

- Action: Update `src/pages/Login.tsx` and related auth screens to include banner, button, fallback dialog.
- Mode: /front-end
- Integration:
  - Evaluate capability on mount.
  - Show/hide NFC options based on detector.
- Acceptance:
  - NFC option only appears when supported & enabled.
  - Fallback instructions shown otherwise.
- QA Notes:
  - Ensure SSR-compatible imports (lazy load if needed).
  - Provide consistent styling with existing auth UI.

### Task 8: Copy & Accessibility Review

- Action: Audit strings for zero-knowledge compliance, add i18n keys if applicable.
- Mode: /task-simple
- Integration:
  - Update `en.json` (or existing locale file).
- Acceptance:
  - All new UI text centralized.
  - WCAG compliance verified (contrast, aria labels).
- QA Notes:
  - Avoid revealing device-specific info in copy.

---

## Phase 4 – Testing & Documentation

### Task 9: Unit & Integration Tests

- Action: Add tests for detector, feature flags, AuthProvider NFC logic, button states, banners.
- Mode: /tester
- Integration:
  - Use Jest + React Testing Library.
- Acceptance:
  - Coverage ≥80% for new modules.
  - Mocks simulate supported/unsupported browsers.
- QA Notes:
  - Include timeout/fallback scenarios.
  - Test guardian placeholder messaging.

### Task 10: Update Documentation & Audit Notes

- Action: Document NFC UI behavior in README / docs, update `audit-reports/IMPLEMENTATION_STATUS_DETAIL.md`.
- Mode: /docs-writer
- Integration:
  - Reference zero-knowledge requirements, fallback behavior.
- Acceptance:
  - Docs describe prerequisites (Android + HTTPS).
  - Audit file reflects UI completion status.
- QA Notes:
  - Highlight CEPS placeholder dependence in docs/warnings.

---

## Dependencies Summary

1. Tasks 1-3 (foundations) must precede UI work.
2. Task 4 depends on Task 3.
3. Tasks 5-6 depend on Task 1.
4. Task 7 depends on Tasks 4-6.
5. Tasks 8-10 occur after UI integration.

---

## Acceptance Criteria Alignment

- Capability detection & feature flags ensure user sees correct options.
- AuthProvider enables secure NFC invocation with error mapping.
- UI components are accessible, zero-knowledge, and handle failures gracefully.
- Documentation/testing confirm production readiness.

QA Review Status: ✅ Reviewed and approved for execution.
