# Signer Adapters Test Plan (Manual Validation)

Scope: Validate 4 adapters and Settings → Signing Methods UI before implementing NIP-46 handshake.

Adapters under test:
- NIP-05 / Password (default)
- NIP-07 Extension
- NTAG424 Physical MFA
- Amber (NIP-46/NIP-55) scaffold

Feature flags and defaults:
- VITE_ENABLE_NIP07_SIGNING: default true
- VITE_ENABLE_NFC_SIGNING: default false
- VITE_ENABLE_AMBER_SIGNING: default false

General prerequisites:
- Build the client in a browser environment (no Node APIs required at runtime)
- Ensure CEPS auto-registration side-effect import is present (src/App.tsx imports ./lib/signers/register-signers)
- Ensure the global NFC orchestrator is mounted (src/App.tsx mounts mountNfcAuthOrchestrator())
- Settings page includes Signing Methods section (src/components/Settings.tsx)

---------------------------------------------------------------------
## 1) UI Integration Validation (Settings → Signing Methods)

1.1 Enable feature flags and load Settings
- Configure env and build/start the client
- Confirm the Signing Methods section renders

1.2 Verify signers list
- NIP-05/Password: always listed
- NIP-07: listed when VITE_ENABLE_NIP07_SIGNING=true
- NTAG424: listed when VITE_ENABLE_NFC_SIGNING=true
- Amber: listed when VITE_ENABLE_AMBER_SIGNING=true AND on Android device

1.3 Verify capability badges
- NIP-05/Password: event=true, payment=true, threshold=true
- NIP-07: event=true, payment=false, threshold=false
- NTAG424: event=true, payment=true, threshold=true
- Amber: event=true, payment=false, threshold=false

1.4 Verify connect/disconnect buttons
- For each signer, when status is available/locked → Connect is enabled
- When status is connected → Disconnect is enabled
- When status is unavailable → Connect is disabled

1.5 Verify preferred method selection persists
- Set a preferred radio option; reload page and confirm selection persists (localStorage key: satnam.signing.preferred)

1.6 Verify status labels
- Shows: Connected / Available / Locked / Unavailable / Error

Success criteria:
- All enabled adapters appear with correct labels and capability badges
- Connect/Disconnect and Preferred work and reflect state changes without console errors
- Status labels and error messages visible and reasonably clear

---------------------------------------------------------------------
## 2) NIP-05 / Password Adapter

Prereqs:
- A valid vault setup in ClientSessionVault (user has previously registered or imported identity)

Flags:
- No special flags required

Platform:
- Any modern browser

Steps:
1) Open Settings → Signing Methods; locate “NIP-05 / Password”
2) Observe initial status: Available or Locked
3) Click Connect:
   - If Locked → interactive unlock expected (ClientSessionVault UI/flow)
   - After success, status should become Connected
4) Click Disconnect → status should return to Available (or Locked if vault relocks)
5) Attempt a signing flow (e.g., an operation that routes to CEPS.signEventWithActiveSession):
   - If connected, signature should succeed

Expected:
- Connect creates a temporary secure session via SecureNsecManager
- Sign succeeds without exposing plaintext nsec; zero-knowledge preserved
- Disconnect clears temp session

Success criteria:
- Status transitions correct
- Signing successful while connected; fails with clear “Vault locked” if not connected

---------------------------------------------------------------------
## 3) NIP-07 Extension Adapter

Prereqs:
- NIP-07-compatible browser extension installed (e.g., nos2x, Alby) and enabled for the site

Flags:
- VITE_ENABLE_NIP07_SIGNING=true (default)

Platform:
- Any modern desktop browser with the extension

Steps:
1) Open Settings → Signing Methods; locate “NIP-07 Extension”
2) Status should show Available if extension is detected
3) Click Connect → extension may prompt for permission; on approval status becomes Connected
4) Click Disconnect → status should revert to Available
5) Attempt a signing flow that uses NIP-07 (e.g., Sign via preferred method set to nip07)

Expected:
- CEPS.verifyEvent (if available) should accept signed events
- Clear error if extension not installed or permission denied

Success criteria:
- Status reflects connect/disconnect
- Signing via extension succeeds or shows explicit denial errors

---------------------------------------------------------------------
## 4) NTAG424 Physical MFA Adapter

Prereqs:
- Device/browser with Web NFC support (e.g., Android Chrome)
- NTAG424AuthModal present and functional
- Netlify function lnbits-proxy action validateBoltcardPin enabled and reachable

Flags:
- VITE_ENABLE_NFC_SIGNING=true

Platform:
- Android with NFC; browser supporting Web NFC (NDEFReader or navigator.nfc)

Steps:
1) Open Settings → Signing Methods; locate “NTAG424 Physical MFA”
2) Status should show Available or Locked (Locked typical until an NFC auth succeeds)
3) Click Connect → orchestrator should open NTAG424AuthModal via CustomEvent; complete PIN + NFC tap
4) On success, status should become Connected (for a short authentication TTL window)
5) Attempt a signing flow (event/payment/threshold):
   - Adapter will request NFC auth per operation; after success, delegates to CEPS.
6) Disconnect → status returns to Available/Locked as appropriate

Expected:
- No plaintext PIN storage; PIN validated server-side via constant-time check
- CustomEvent orchestration: satnam:open-ntag-auth and satnam:ntag-auth-result exchange
- Clear errors for invalid PIN, user cancel, NFC unavailable, or timeout

Success criteria:
- Modal opens reliably; successful auth transitions to Connected
- Signing operations prompt auth and then succeed via CEPS

---------------------------------------------------------------------
## 5) Amber (NIP-46/NIP-55) Adapter (Scaffold)

Prereqs:
- Android device with Amber installed (for deep-link pairing)

Flags:
- VITE_ENABLE_AMBER_SIGNING=true

Platform:
- Android device/browser

Steps:
1) Open Settings → Signing Methods; locate “Amber (Nostr Connect)”
2) Click Connect
   - App should open via nostrconnect://<pubkey>?relay=...&secret=...
3) Return to app; status will remain Available (pairing confirmation pending)
4) Attempt signEvent → expect a staged error (handshake not yet implemented)

Expected:
- Correct pairing URI format and deep link launch on Android
- No secrets stored beyond memory; no Node APIs used

Success criteria:
- Adapter is visible and connect triggers deep link
- Sign returns an explicit "not yet connected" message (by design)

---------------------------------------------------------------------
## 6) Known Edge Cases to Test

- Vault present but locked (NIP-05/Password): Connect prompts for unlock; sign blocked until unlocked
- NIP-07 not installed: Adapter shows Unavailable; Connect errors with clear message
- NFC not supported: NTAG424 shows Unavailable; Connect disabled
- NTAG424 PIN incorrect: Server returns 401; modal shows clear error; rate-limit respected
- Amber on non-Android: Adapter Unavailable even if flag is true
- Preferred method persistence across reloads

---------------------------------------------------------------------
## 7) Observability & Error Expectations

- Console should not show TypeScript/runtime errors during normal flows
- Clear, user-friendly error messages for denial, missing capabilities, or unsupported platforms
- No sensitive data in logs (PINs, nsec, secrets)

---------------------------------------------------------------------
## 8) Security & Privacy Checklist

- No plaintext nsec or PIN ever stored client-side; only ephemeral in-memory use
- PIN verified server-side via constant-time comparison; rate limiting enabled
- Web Crypto API used for randomness and hashing where applicable
- Feature flags default to safe values (NFC/Amber off by default)

---------------------------------------------------------------------
## 9) Success Criteria Summary

- UI lists all eligible adapters under the correct flags/platforms
- Capability badges reflect each adapter
- Connect/Disconnect work and update statuses
- Preferred method persists and is respected by flows
- NIP-05/Password and NIP-07 produce valid signatures when connected
- NTAG424 triggers PIN+NFC auth and then delegates signing via CEPS
- Amber launches pairing via deep link and returns a staged signing error until handshake is implemented

---------------------------------------------------------------------
## 10) Issues, Improvements, and Risks (to log during testing)

Record any findings here during validation:
- TypeScript errors or runtime exceptions
- Confusing or insufficient error messages (suggest clearer text)
- Status inconsistencies (e.g., Amber still shows Available after connection attempt)
- NFC auth timeouts and retries UX
- Performance concerns (excessive re-renders, memory leaks, event listeners not removed)

---------------------------------------------------------------------
## 11) Recommended Next Steps (post-validation)

- Based on test findings, address prioritized issues and UX copy improvements
- Implement CEPS NIP-46 handshake:
  - JSON-RPC request/response over relays using NIP-04/44 encryption
  - Pairing confirmation and signer key binding
  - Timeouts/retry policy and error codes mapping to user-friendly messages
  - (Optional) NIP-55 Android intent fallback for direct communication
- Add targeted automated tests for adapters and CEPS routing where feasible

