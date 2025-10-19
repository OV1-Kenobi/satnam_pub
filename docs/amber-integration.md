# Amber Android Signer Integration (NIP-46 + NIP-55)

This document explains how Satnam integrates the Amber Android signer for event signing, covering both NIP-46 (Nostr Connect) and NIP-55 (Android intent bridge) flows.

## Overview
- Pluggable SignerAdapter pattern is used to register external signers with CEPS (Central Event Publishing Service).
- The Amber adapter combines:
  - NIP-46 remote signing over relays (pairing + encrypted messages)
  - NIP-55 Android intent deep-link bridge with paste-back callback
- Android-only UI CTAs are provided in Identity Forge, Signin, and Settings for quick pairing.

## Feature Flags
- VITE_ENABLE_AMBER_SIGNING=true
  - Gates all Amber-related UI and the adapter registration.
- VITE_ENABLE_AMBER_NIP55=true (optional)
  - Enables the Android intent bridge as a preferred path when available; otherwise NIP-46 is used.

## Key Files
- src/lib/signers/amber-adapter.ts — Combined Amber adapter implementing SignerAdapter
- src/lib/signers/register-signers.ts — Registers adapters with CEPS at app startup
- lib/central_event_publishing_service.ts — CEPS with NIP-46 helpers and external signer selection
- src/components/auth/AmberIntentCallback.tsx — Handles NIP-55 paste-back callback
- src/components/auth/AmberConnectButton.tsx — Reusable compact CTA button (Android + flag gated)
- src/components/IdentityForge.tsx — Adds CTA for quick pairing during onboarding
- src/components/IndividualAuth.tsx — Adds CTA near signin methods
- src/components/Settings.tsx — Adds CTA above Signing Methods section

## Environment Variables
- VITE_ENABLE_AMBER_SIGNING — Enable/disable the feature (client)
- VITE_ENABLE_AMBER_NIP55 — Prefer Android intent (client)
- Optional Android intent config (if used by adapter):
  - VITE_AMBER_PACKAGE_NAME
  - VITE_AMBER_INTENT_SCHEME

Note: Client code reads VITE_* vars via process.env/insertions; Netlify Functions must use process.env only.

## How it Works
1) Registration
- On startup, when VITE_ENABLE_AMBER_SIGNING is true, register an AmberAdapter instance with CEPS via register-signers.ts.

2) Status and capability
- AmberAdapter implements getStatus():
  - "unavailable" on non-Android or when disabled
  - "available" when discoverable but not paired
  - "connected" when paired (NIP-46) or when NIP-55 signer is active

3) Connecting
- The CTA calls adapter.connect():
  - If NIP-55 is enabled and supported, launches the Android intent and completes via AmberIntentCallback
  - Otherwise, establishes NIP-46 pairing using CEPS.establishNip46Connection()

4) Signing
- When an event needs to be signed, CEPS.selectSigner("event") prefers a registered external signer.
- Adapter.signEvent(unsigned) routes to NIP-55 when available, otherwise NIP-46 via CEPS.nip46SignEvent().
- Returned events are verified via CEPS.verifyEvent(). Invalid signatures cause fallback to secure-session signing.

## UI CTAs
- Identity Forge, Individual Signin, Settings render AmberConnectButton.
- AmberConnectButton:
  - Detects Android via navigator.userAgent
  - Checks VITE_ENABLE_AMBER_SIGNING flag
  - Reads current adapter status and shows "Connect Amber" or "Connected"
  - Provides error feedback on failure

## Troubleshooting
- No button visible: Ensure Android device and VITE_ENABLE_AMBER_SIGNING=true.
- Pairing times out: Check relay connectivity and CEPS NIP-46 configuration.
- Callback not received: Verify AmberIntentCallback route is accessible (e.g., /amber-intent-callback) and Android intent scheme matches.
- Signature rejected: See console for CEPS verification logs; adapter may need re-connect.

## Testing Tips
- Unit tests should mock CEPS.getRegisteredSigners() and adapter methods.
- Avoid network calls; prefer deterministic status and connect() outcomes.
- For NIP-55 flow, simulate URLSearchParams in AmberIntentCallback and verify navigation behavior.

## Security Notes
- Do not import nostr-tools directly in UI/adapters; use CEPS only.
- Never store plaintext nsec; follow zero-knowledge and ClientSessionVault standards.
- Follow TypeScript strict patterns for error handling and type safety.

