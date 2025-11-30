# Phase 3 Web NFC Write Support – Deployment Plan

## Step-by-Step Execution Plan

1. **Flag Validation & Plumbing**

   - [ ] Review `.env.example` for NFC write flags (`VITE_ENABLE_NFC_WRITE`, `VITE_NFC_WRITE_TIMEOUT_MS`).
   - [ ] Update `src/config/env.client.ts` to expose new flags under `clientConfig.flags`.
   - [ ] Ensure `src/lib/nfc/feature-flags.ts` reads write flags and falls back to env defaults.

2. **Capability Detector Alignment**

   - [ ] Confirm `capability-detector.ts` uses cached checks and `isBrowser` guard consistently.
   - [ ] Add write-specific capability checks (e.g., `features.write`) paid forward from feature flags.
   - [ ] Document fallback reasons in detector for write operations.

3. **AuthProvider Integration Prep**

   - [ ] Enumerate NFC write flows in `AuthProvider` (state, handlers).
   - [ ] Ensure context exposes new status enums for write ops.
   - [ ] Wire detectors and feature flags to control UI gates.

4. **Engineering Backlog Execution**

   - Follow `PHASE3_WEB_NFC_WRITE_SUPPORT.md` tasks (challenge modules, card adapters, NDEF handling).
   - Prioritize backend/challenge logic, then adapters, NDEF writer, UI, tests.

5. **Testing & QA**

   - Plan unit/integration/E2E as outlined.
   - Define device matrix for runtime validation.

6. **Deployment & Monitoring**
   - Prepare feature flag rollout steps (staged enablement).
   - Document monitoring hooks and telemetry.

## Dependencies & Alignment

- **Docs Reference:** `docs/planning/nfc-auth/PHASE3_WEB_NFC_WRITE_SUPPORT.md`.
- **Existing Modules:** `src/lib/nfc/capability-detector.ts`, `src/lib/nfc/feature-flags.ts`, `src/components/auth/AuthProvider.tsx`.
- **Upcoming Work:** Challenge flow modules (`src/lib/nfc/challenge/*`), card adapters, enhanced NDEF writers.

## Blockers / Open Issues

- [ ] CEPS placeholder cryptographic functions must be replaced before final rollout.
- [ ] Need hardware test devices (NTAG424, Tapsigner, Boltcard) for validation.
- [ ] Browser Web NFC availability limited to Android/HTTPS; ensure fallback UX in place.

## Next Actions (High Priority)

1. Implement NFC write feature flags across `.env.example`, `env.client.ts`, and feature helper.
2. Update capability detector to factor write readiness (flags + device support).
3. Extend AuthProvider context with NFC write status/handlers.
4. Begin backend challenge-response module implementation per Planner tasks.
