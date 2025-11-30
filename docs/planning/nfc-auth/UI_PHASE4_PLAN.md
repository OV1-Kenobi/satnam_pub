# NFC UI Phase 4 Planning (Planner-B)

## 1. Requirement Summary (from Planner-A)

- Capability detection utility with fallback recommendations.
- Feature flag plumbing for NFC toggles/timeouts.
- NFCAuthButton component (states, accessibility, guardian awareness).
- Capability banners/fallback dialogs for unsupported scenarios.
- AuthProvider enhancements to expose NFC flows.
- Graceful degradation logic across login/auth flows.
- Error/security handling aligned with zero-knowledge requirements.

## 2. Task Prioritization & Dependencies

| Priority | Task                                                                     | Dependencies                                    | Notes                                       |
| -------- | ------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------- |
| P0       | Capability Detector module (`src/lib/nfc/capability-detector.ts`)        | Architecture baseline                           | Required before any UI gating.              |
| P0       | Feature flag utilities (`env.client.ts`, `src/lib/nfc/feature-flags.ts`) | None                                            | Flags consumed in detector/button.          |
| P1       | AuthProvider NFC context updates                                         | Capability detector, NFCHardwareSecurityManager | Exposes `authenticateWithNFC` to UI.        |
| P1       | NFCAuthButton component                                                  | Capability detector, AuthProvider updates       | Primary user entrypoint.                    |
| P1       | NFCCapabilityBanner / fallback notices                                   | Capability detector                             | Provide user feedback when NFC unavailable. |
| P2       | NFCFallbackDialog (graceful degradation)                                 | AuthProvider error states                       | Triggered after failures/timeouts.          |
| P2       | Login/auth view integration                                              | All above                                       | Wire UI components into flows.              |
| P3       | Copy/telemetry/internationalization polish                               | Prior tasks                                     | Final UX touches.                           |
| P3       | Documentation updates & testing                                          | All                                             | Unit/integration tests, README updates.     |

## 3. Resource & Effort Estimates

| Task                                                          | Effort (hrs) | Owner Skillset                               |
| ------------------------------------------------------------- | ------------ | -------------------------------------------- |
| Capability detector utility                                   | 4            | Frontend engineer                            |
| Feature flag wiring                                           | 3            | Frontend engineer                            |
| AuthProvider context + NFCHardwareSecurityManager integration | 6            | Senior frontend (React + security awareness) |
| NFCAuthButton component + state machine                       | 8            | Frontend engineer                            |
| Capability banner & fallback dialog                           | 6            | Frontend engineer                            |
| Login page integration & flows                                | 6            | Frontend engineer                            |
| Accessibility & copy review                                   | 3            | UX/Frontend                                  |
| Unit/integration tests                                        | 6            | Frontend/test engineer                       |
| Documentation updates                                         | 2            | Engineer/Technical writer                    |

**Total estimate:** ~44 hours.

## 4. Risks & Mitigations

| Risk                                       | Impact             | Mitigation                                                                                         |
| ------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------- |
| Web NFC unavailable on non-Android devices | Users blocked      | Capability detector + fallback UI ensures alternative methods.                                     |
| CEPS placeholders cause signing failures   | Security integrity | Surface friendly error and disable NFC path until CEPS fixed; log event.                           |
| Guardian approvals not implemented         | Blocked flows      | UI should display “Guardian approval pending feature rollout” message and require manual fallback. |
| NFCAuthButton causing duplicate scans      | Resource/conflict  | AuthProvider ensures single NFCHardwareSecurityManager instance and queue requests.                |
| Feature flags misconfigured                | Unexpected UI      | Provide sane defaults (false) with console warnings.                                               |
| Accessibility gaps                         | UX issues          | Follow WCAG (aria-live, keyboard support, contrast).                                               |

## 5. Acceptance Criteria Overview

- Capability detector returns structured object and is unit-tested.
- Feature flags accessible via helper functions; environment vars documented.
- AuthProvider exposes NFC context with clear statuses and safe error mapping.
- NFCAuthButton handles all states, integrates with context, and triggers fallbacks.
- Capability banner/fallback dialog appear appropriately based on detector output.
- Login/auth flows show NFC option only when valid; fallback instructions otherwise.
- All messaging zero-knowledge compliant; no sensitive identifiers shown.
- Tests cover detector, button state transitions, fallback flows.

## 6. Next Steps

- Planner-C: break down prioritized tasks into executable tickets with mode hints.
- Planner-D: QA review of tasks before implementation.
- Orchestrator: schedule execution order (detector/flags → provider → UI).
- Code/Debug modes: implement, test, and verify across Android/iOS/desktop fallback scenarios.
