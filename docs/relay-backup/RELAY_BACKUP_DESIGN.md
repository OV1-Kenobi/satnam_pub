# Satnam.pub — Decentralized Relay Backup for Encrypted Nostr Keys (Design)

Status: Proposal (awaiting answers to open questions below). Zero‑knowledge and Noble V2 preserved. No server dependency at recovery time.

## Goals
- Users can back up encrypted nsec to Nostr relays and later recover with only:
  - their npub
  - a recovery password/passphrase OR a WebAuthn credential
  - any Nostr client (to fetch events) — Satnam infrastructure may be offline
- Multi‑relay redundancy with an optional “Safebox‑style” distribution mode
- Maintain compatibility with current Satnam architecture: Noble V2, ClientSessionVault, NIP‑07/Amber/NIP‑46, Family Federation

## Non‑goals
- Storing any plaintext secrets on relays or servers
- Replacing Noble V2 or changing Satnam’s zero‑knowledge model

## Standards & references
- NIP‑78 Application‑specific data (kind 30078)
- NIP‑33 Parameterized replaceable events (addressable events using `d` tag)
- Nostr Safebox (community project): uses NIP‑44 for encryption and a replaceable index + parameterized items pattern. We borrow the multi‑relay “portable safebox” concept but keep encryption with Noble V2, not NIP‑44, to remain consistent with Satnam’s standard.

## High‑level architecture
- Encrypted Backup Envelope (EBE) is created client‑side using Noble V2
- EBE is published as a Nostr event by the user’s npub to:
  - Primary: wss://relay.satnam.pub (onion/clearnet as available)
  - Secondary: user‑configurable relays list (redundancy)
- Event kind: 30078 (app‑specific data). Addressed via NIP‑33 `d` tag so it can be replaceable (single latest) or versioned (if we choose immutable series)
- Recovery: fetch event(s) with any Nostr client, copy EBE JSON, decrypt locally with password (PBKDF2) or WebAuthn

## Event schema (proposal)
Kind: 30078 (NIP‑78), Addressable (NIP‑33)

Tags:
- ["d", "satnam:backup:v1"] — logical address (unique per identity/profile). Alternate forms (if we support multiple backups): `satnam:backup:v1:<label>`
- ["content-type", "application/json"] (optional hint)
- ["alt", "Encrypted backup for Satnam identity"] (optional accessibility)
- Optionally: ["x-format", "satnam.nsec.backup"], ["x-wrap", "webauthn|pbkdf2|both"], ["x-alg", "noble-v2"]

Content (JSON; header is intentionally not encrypted so anyone can know how to attempt decryption; secrets only in `ct`):
```
{
  "v": 1,
  "alg": "noble-v2",
  "wrap": "webauthn" | "pbkdf2" | "both",
  "kdf": {
    "name": "PBKDF2-SHA512",
    "salt": "<base64>",
    "iterations": 100000
  },
  "nonce": "<base64>",
  "ct": "<base64-ciphertext>",
  "meta": {
    "createdAt": "<ISO8601>",
    "npub": "<author npub>",
    "label": "<optional user label>",
    "format": "satnam.nsec.backup",
    "version": "1"
  },
  "wrapInfo": {
    // present if wrap === "webauthn" or "both"
    "type": "webauthn",
    "credentialId": "<base64>",
    "rpId": "<domain hint>",
    "alg": "<webauthn alg>"
  }
}
```
Notes:
- `ct` contains the Noble V2‑encrypted payload: { encrypted_nsec, associated npub, minimal relay hints, and optional user metadata }, authenticated with AEAD.
- If `wrap === "pbkdf2"`, only `kdf`/`nonce`/`ct` are needed.
- If `wrap === "webauthn"`, `wrapInfo` describes the credential required to unwrap the key material; manual recovery needs a small local HTML/JS page to prompt the authenticator (documented in Recovery Guide).
- If `wrap === "both"`, we store 2 independently usable wrappers around the same random 32‑byte backupKey: one PBKDF2, one WebAuthn (two EBE contents or a single content with two header sections; we recommend two events, each with distinct `d` tag, e.g., `satnam:backup:v1:pw` and `satnam:backup:v1:wa`).

## Encryption details (unchanged standard)
- Use the same Noble V2 encryption routinely used for at‑rest `encrypted_nsec`
- Symmetric key: a random 32‑byte `backupKey` generated client‑side
  - WebAuthn mode: `backupKey` is wrapped/unwrapped by WebAuthn
  - PBKDF2 mode: derive a key from user password (SHA‑512, 100k, 64‑byte), then encrypt/decrypt `backupKey`
- The EBE `ct` is produced by encrypting the plaintext payload with `backupKey`

## Replaceable vs immutable
- Replaceable (recommended default): NIP‑33 addressable event with `d = satnam:backup:v1`. Latest event supersedes older ones; smaller query surface; simple mental model
- Immutable with versions (optional): publish a new event per version and include a `prev` reference tag, or use `d = satnam:backup:v1:<timestamp>`; adds history but increases leak surface

## Multi‑relay redundancy and “Safebox‑style” modes
Two modes behind VITE flags:
- Replication (phase 1, simple, robust): publish identical EBE to all configured relays (Primary + Secondary list). Recovery succeeds if any relay returns the event
- Sharded key wrap (phase 2, optional): threshold‑split ONLY the `backupKey wrap` (e.g., Shamir 3‑of‑5) across relays. The big ciphertext remains identical on every relay; user reconstructs the wrap from N shares, then decrypts the single ciphertext. Avoids complexity of sharding the ciphertext itself

Safebox compatibility
- Nostr Safebox (community project) uses NIP‑44 encryption and replaceable+parameterized patterns. Our design aligns on multi‑relay portability and addressable events but keeps Noble V2 encryption for the payload. Interop is feasible at the “storage pattern” level; crypto remains Satnam‑specific

## Publishing flow (client‑side)
1) Pick mode: PBKDF2 or WebAuthn (or both)
2) Create `backupKey` (random 32 bytes). For PBKDF2: derive wrapping key and encrypt `backupKey`. For WebAuthn: wrap `backupKey` via WebAuthn
3) Build plaintext payload: { encrypted_nsec, npub, minimal relay hints, createdAt, optional non‑sensitive metadata }
4) Produce Noble V2 EBE: AEAD encrypt payload with `backupKey` → `ct`, and record `nonce`
5) Create Nostr event (kind 30078) with `d` tag as defined, JSON content as above
6) Sign with NIP‑07 (or local signer/Amber/NIP‑46). Author MUST be the user’s identity npub
7) Publish to: (a) wss://relay.satnam.pub (if reachable), (b) all secondary relays (user‑configurable)
8) Verify acceptance; record the event id(s) locally; optionally cross‑check replication

## Recovery flow (no Satnam required)
- Using any Nostr client/CLI to fetch: filter by `authors=[npub]`, `kinds=[30078]`, `#d=["satnam:backup:v1"]` (or `:pw`, `:wa`)
- Copy JSON content; decrypt locally:
  - PBKDF2: derive key from password, unwrap `backupKey`, decrypt `ct`
  - WebAuthn: use a small local HTML/JS page to call `navigator.credentials.get(...)` and unwrap `backupKey`, then decrypt `ct`
- Restore to ClientSessionVault (or equivalent) locally
- See RECOVERY_GUIDE.md for step‑by‑step instructions and example tooling

## UI: “Tested backup” pattern
- After publishing, prompt user to immediately test recovery:
  - Fetch the latest backup event from a secondary relay
  - Decrypt locally and verify `npub` matches current identity
  - If success, set a local `backupVerifiedAt` timestamp and show green status

## Feature flags
- `VITE_RELAY_BACKUP_ENABLED` (default: false)
- `VITE_SAFEBOX_PROTOCOL_ENABLED` (default: false) — gates “sharded key wrap” mode
These are standard VITE_* flags; they are auto‑exposed via the existing getAllViteEnvVars() pattern and should be accessed with `getEnvVar()` in client code.

## Open questions (please confirm)
1) Make relay backup REQUIRED by default or optional with local‑only alternative?
2) For sharded mode, default threshold? (e.g., 3‑of‑5). Should users be able to fully customize relays and threshold?
3) Family Federation users: use BOTH guardian‑based recovery and relay backup (recommended), or limit relay backup to private users only?
4) Finalize event kind choice: adopt NIP‑78 kind 30078 with `d = satnam:backup:v1`?
5) Replaceable vs immutable default? (Propose replaceable default; immutable as advanced option)
6) Backup key wrap: support both WebAuthn and PBKDF2 in parallel (two events), or force a single choice per user?

## Rollout plan (once decisions are made)
- Phase A: Implement replication mode (no sharding), PBKDF2 first, WebAuthn second
- Phase B: Add optional “both” wraps (two events), gated by UI
- Phase C: Add sharded key‑wrap mode behind `VITE_SAFEBOX_PROTOCOL_ENABLED`
- Phase D: Add CLI helpers and downloadable offline HTML for WebAuthn recovery

