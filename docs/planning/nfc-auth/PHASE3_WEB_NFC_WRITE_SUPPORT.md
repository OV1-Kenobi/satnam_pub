# Phase 3 – Web NFC Write Support Master Plan

## 1. Project Manager Summary

Goals:

- Implement challenge-response protocols for NFC writes (challenge generation, on-card signing, response verification).
- Support multiple card types (NTAG424, Tapsigner, Boltcard) with shared abstractions.
- Enhance NDEF record handling (complex payloads, batching, validation) for write flows.
  Success metrics:
- 100% of supported cards pass challenge-response write validation.
- Multi-card detection accuracy ≥ 99% (verified via device tests).
- NDEF writing latency < 2s average; error rate < 1% across device matrix.
- Zero-knowledge compliance (no raw keys/signatures logged).
  Dependencies:
- `src/lib/nfc` (existing `nfc-auth`, `capability-detector`, upcoming challenge modules).
- `src/components/auth` (AuthProvider, NFC UI components, future write flows).
- Config/feature flags (`src/config/env.client.ts`, `src/lib/nfc/feature-flags.ts`).
  Alignment:
- Builds on capability detector + feature flags by introducing write-specific flags (`VITE_NFC_WRITE_ENABLED`, etc.), enabling UI gating and environment control.

## 2. Architect Blueprint

### Module boundaries

- `src/lib/nfc/challenge/`
  - `challenge-factory.ts`: issue challenges per card type.
  - `challenge-verifier.ts`: validate signed responses.
  - `session-manager.ts`: track challenge lifetimes, entropy harvesting.
- `src/lib/nfc/cards/`
  - `card-registry.ts`: detect card by ATR/UID/payload.
  - `card-adapters/{ntag424,tapsigner,boltcard}.ts`: implement card-specific read/write, challenge mapping, capability metadata.
- `src/lib/nfc/ndef/`
  - `ndef-schema.ts`: schema definitions & versioning.
  - `ndef-writer.ts`: batching writes, ensures atomic sequences.
  - `ndef-validator.ts`: schema enforcement, payload sanitization.

### Data contracts

- `ChallengeRequest`: `{ cardUid, cardType, challengeType, timeoutMs }`.
- `ChallengeResponse`: `{ cardUid, challengeId, payloadHex, signatureHex, publicKeyHex, curve }`.
- `CardCapability`: `{ cardType, supports: { read, write, signature, challenge }, transport: "ndef" | "sun" | "apdu" }`.
- `NdefWriteBatch`: `{ records: NdefRecordInit[], schemaVersion, checksum }`.

### Error handling

- Standardized `NfcWriteError` codes (`UNSUPPORTED_CARD`, `CHALLENGE_TIMEOUT`, `SIGNATURE_INVALID`, `NDEF_SCHEMA_MISMATCH`, etc.).
- Retry/backoff policy for transient NFC errors.
- Logging via zero-knowledge truncated IDs; no raw payload logs.

### Integration points

- Existing readers/writers: reuse `NFCAuthService` or extend with `writeWithChallenge`.
- Feature flags: `isNFCWriteEnabled()` gating entrypoints.
- UI: new flows in Auth screens (or dedicated NFC settings).
- Backends: challenge verification may call CEPS or local crypto; ensure CEPS placeholders replaced.

## 3. Planner A – Backend/Logic Tasks

1. **Challenge Schema Definition**

   - Define types/interfaces for challenge requests/responses; serialize to hex/JSON as needed.

2. **Challenge Generation Service**

   - Implement deterministic but unique challenges per session (nonce + timestamp + user salt).
   - Support multiple challenge types (hash signing, MAC). Include timeout metadata.

3. **Challenge Verification**

   - Verify responses using curve-specific logic.
   - Validate challengeId, expiry, card UID match.
   - Integrate with zero-knowledge logging (truncated IDs).

4. **Secure Session Handling**

   - Session manager stores outstanding challenges (Map by cardUid).
   - Enforces single active challenge/card; auto-expire after timeout.
   - Exposes hooks for UI to show countdown.

5. **Timeout/Retry Management**

   - Provide utilities to handle NFC scan timeouts.
   - Define retry budget and fallback escalation (e.g., prompt user to reposition card).

6. **Integration with NFCAuthService**
   - Add `writeWithChallenge()` to `NFCAuthService`.
   - Reuse existing logging/zero-knowledge patterns.

## 4. Planner B – Multi-Card Handling Tasks

1. **Card Detection Logic**

   - Implement `identifyCardType(message: NDEFMessage, uid: string)` returning `CardType`.
   - Maintain registry mapping detection strategies.

2. **Capability Mapping**

   - Define `CardCapability` objects per type.
   - Use to gate advanced features (e.g., Boltcard lacking challenge support).

3. **Adapter Strategy**

   - For each card type, implement adapter exposing:
     - `supportsChallenge()`, `buildChallengeRecords()`, `parseResponse()`.
     - `writePayload(batch: NdefWriteBatch)`.

4. **Adapter Factory**

   - Provide `getCardAdapter(cardType)` to unify flows.

5. **Boltcard SUN Integration (if required)**
   - Ensure SUN message handling for write operations (if supported).
   - Validate counters/CMAC.

## 5. Planner C – Enhanced NDEF Handling Tasks

1. **NDEF Schema Definitions**

   - Create `ndef-schema.ts` enumerating record types (challenge, response, metadata, user payload).
   - Include schema versioning.

2. **Payload Validation**

   - `ndef-validator.ts` checks record order, data lengths, JSON structure.

3. **Write Batching**

   - `ndef-writer.ts` orchestrates write sequences:
     - Challenge record → user payload → signature record.
     - Handles partial successes (rollback/retry strategy).

4. **Metadata/Checksums**

   - Include checksum or MAC fields for tamper detection.
   - Optionally embed truncated operation hash.

5. **Compatibility Layer**
   - Provide conversions for existing Tapsigner formats.

## 6. Planner D – Testing & QA

1. **Unit Tests**

   - Challenge generator/verifier (multiple curves).
   - Card adapters detection/capability.
   - NDEF schema validator.

2. **Integration Tests**

   - Simulate complete challenge-response flow with mock NDEFReader/Writer.
   - Multi-card test harness (NTAG424, Tapsigner, Boltcard).

3. **E2E Tests**

   - React-level tests to ensure UI flows handle success/failure.
   - Browser automation using Web NFC mocks.

4. **Device Matrix**

   - Test on:
     - Android Chrome (Pixel, Samsung).
     - Android WebView (if applicable).
     - Document lack of iOS support.
   - Record latencies and error cases.

5. **Security Regression**
   - Ensure zero-knowledge logging (no raw keys).

- Validate CEPS alignment (no placeholder functions).
- Pen-test scenarios for replay, tampering.

## 7. Code Monkey – Implementation SOP

For each Jira/task:

- Specify file path, change summary, snippet.
- Include tests (filename, cases).
- Document environment variables and UI copy.
- Maintain references to `UI_PHASE4_TASKS`.

(Implementation not executed here; follow backlog.)

## 8. Code Mode – Diff Checklist

When implementing:

- Update TypeScript types, ensure lint compliance.
- Add new modules to barrel exports if needed.
- Provide context references (e.g., [`src/lib/nfc/challenge/challenge-factory.ts`](src/lib/nfc/challenge/challenge-factory.ts)).

## 9. Front-end Considerations

UI/UX updates:

- Auth flows: add “Write to NFC” actions when `cardCapability.write === true`.
- Reader/writer components: show progress indicators (challenge sent, waiting for response, writing payload).
- Failure states: toast/modals explaining reason and fallback options.
- Hooks (e.g., `useNfcWriteFlow`) manage state machines with capability detector and feature flags.
- Copy: strict zero-knowledge (“Card ready”, “Signature invalid”, etc.).

## 10. Debug Mode 1 – Static Analysis Plan

- Run `pnpm lint` (or npm equivalent) to confirm new modules type-check.
- Address TypeScript warns (e.g., optional chaining, unused variables).
- Validate tsconfig flags for new directories (include `src/lib/nfc/**`).
- Document any deprecation warnings (e.g., `baseUrl`) for follow-up.

## 11. Debug Mode 2 – Runtime Validation Plan

- Emulator tests:
  - Chrome DevTools Web NFC emulator.
  - Android devices with sample cards.
- Logs:
  - Expect `Challenge issued`, `Challenge verified`, `NDEF batch succeeded`.
  - On failure, confirm `NfcWriteError` code printed; no sensitive data.
- Edge cases:
  - Timeout, user cancels, card mismatch, schema mismatch.

## 12. Debug Mode 3 – Deployment Readiness

- Feature flags: introduce `VITE_ENABLE_NFC_WRITE`, `VITE_NFC_WRITE_TIMEOUT_MS`.
- Rollout plan:
  - Stage 1: internal testers (flag off for public).
  - Stage 2: staged rollout (10%).
  - Stage 3: full enable after monitoring.
- Monitoring:
  - Add telemetry hooks (success/failure counts per card type).
  - Alerting on high error rate.
- Final verification: confirm docs updated, tests passing, feature flags documented, release notes prepared.
