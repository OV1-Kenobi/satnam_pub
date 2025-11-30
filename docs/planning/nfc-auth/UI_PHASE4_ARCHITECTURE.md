# NFC UI Phase 4 Architecture Review

## Objective

Establish architectural context and integration points for NFC UI components (capability detection, auth button, graceful degradation) while honoring zero-knowledge security requirements identified in prior audits.

## Existing NFC Stack Summary

- Core implementation: `src/lib/nfc-auth.ts` (~1600 LOC) providing `NFCAuthService` (tap-to-spend/sign) and `NFCHardwareSecurityManager`.
- Cryptographic protections: deterministic hashing via `ntag424Manager`, secp256k1/P-256 signing, zero-knowledge logging, encrypted card configs, `secureNsecManager` for Nostr keys.
- Guardian/steward flows: placeholders exist; UI must surface these constraints (pending backend integration).
- No current UI entrypoints for NFC authentication; login/auth flows expose only password/Nostr methods.

## Integration Points & Dependencies

1. **Auth Context** (`src/components/auth/AuthProvider.tsx`):

   - Extend context to expose NFC state (`available`, `scanning`, `error`) and handler `authenticateWithNFC()`.
   - Must reuse singleton `NFCHardwareSecurityManager` to avoid duplicate scanners.

2. **Login / Auth Views** (`src/pages/Login.tsx`, `src/components/auth/NIP05PasswordAuth.tsx`):

   - Inject NFC button/banners alongside existing auth methods.
   - Provide fallback flows when NFC is unavailable or fails.

3. **Feature Flags & Config** (`src/config/env.client.ts`):

   - Add flags: `VITE_ENABLE_NFC_AUTH`, `VITE_ENABLE_NFC_MFA`, `VITE_NFC_TIMEOUT_MS`, `VITE_TAPSIGNER_DEBUG`.
   - Create helper (`src/lib/nfc/feature-flags.ts`) to centralize flag access.

4. **Capability Detection Utility**:

   - New module `src/lib/nfc/capability-detector.ts` to check:
     - `'NDEFReader' in window`
     - HTTPS context (or localhost)
     - Platform (Android-only Web NFC)
     - Feature flags
   - Should return structured result with fallback recommendation (password, NIP-07, QR).

5. **UI Components**:

   - `NFCAuthButton.tsx`:
     - States: unavailable, ready, scanning, success, failure.
     - Visual cues (icons, progress spinner), a11y labels, ARIA live updates.
     - Invokes `authenticateWithNFC()`; handles promise lifecycle, guardian approval requirements, timeouts (default 10s).
   - `NFCCapabilityBanner.tsx` / `NFCFallbackNotice.tsx`:
     - Inform users when NFC unsupported/disabled.
     - Provide actionable fallback links (password login, NIP-07, QR).
   - `NFCDegradedFlowDialog.tsx`:
     - Modal triggered on failure/timeouts; offers retry or fallback options.

6. **Graceful Degradation Patterns**:

   - Capability check before rendering NFC UI; automatically hide button on unsupported devices.
   - On unsupported contexts (iOS, desktop, HTTP), show fallback notice with reason derived from capability detector.
   - Timeout handler: after `VITE_NFC_TIMEOUT_MS`, show modal encouraging retry or fallback.
   - Guardian approval placeholders: when `requiresGuardianApproval` true, display explanatory copy referencing pending steward workflow (no raw details).

7. **Security Alignment**:

   - UI must never expose raw UID, signature, or nsec data. Use truncated identifiers where necessary (e.g., `uid.slice(0, 8)`).
   - All NFC actions flow through `NFCAuthService` to retain zero-knowledge safeguards.
   - Logging remains server-side; client UI should limit to user feedback.
   - Respect CEPS placeholder risk: if CEPS reports invalid signature or placeholder behavior, UI must surface warning and disable NFC option until resolved.

8. **Error Handling & Telemetry**:

   - Centralize NFC error mapping (unsupported browser, permission denied, timeout, guardian required) with user-friendly messages.
   - Maintain zero-knowledge compliance: no sensitive data in telemetry; use anonymized operation hashes if needed.

9. **Accessibility & UX**:

   - Buttons must be keyboard-accessible, with aria attributes describing status.
   - Provide textual instructions for visually impaired users (e.g., “Tap your NFC card to the back of your phone now”).
   - Use high-contrast icons and ensure color alone isn’t the only indicator.

10. **Testing Considerations**:
    - Need mock capability detector and NFCHardwareSecurityManager for unit tests.
    - Simulate browsers lacking Web NFC, iOS Safari, desktop Chrome, HTTP contexts.
    - Validate fallback flows via jest + react-testing-library.

## Next Steps

Proceed to Planner Mode (a-d) to define requirements, prioritize tasks, allocate resources, and assess risks based on this architecture.
