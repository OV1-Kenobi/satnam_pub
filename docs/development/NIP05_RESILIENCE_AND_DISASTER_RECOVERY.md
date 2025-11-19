# NIP-05 Resilience & Disaster Recovery Strategy for Satnam

## 1. Purpose & Scope

This document defines a resilience and disaster recovery strategy for Satnam’s NIP-05 identity service so that users can continue to prove and discover identities when the primary `my.satnam.pub` infrastructure fails (domain seizure, DNS failure, registrar suspension, or hosting provider takedown). It parallels the PKARR and Iroh assessments and assumes:

- Frontend + NIP-05 endpoints on Netlify
- Identity data in Supabase
- DNS via NameCheap for `satnam.pub` / `my.satnam.pub`
- Additional infrastructure: Lunanode VPS, Start9 OS, Satnam’s own relays, PKARR and Iroh attestation, SimpleProof.

## 2. NIP-05 Technical Foundation

**NIP-05 flow (per spec):**

1. User’s `kind:0` metadata includes `"nip05": "username@my.satnam.pub"`.
2. Client splits into `<local-part>=username`, `<domain>=my.satnam.pub`.
3. Client performs `GET https://my.satnam.pub/.well-known/nostr.json?name=username`.
4. Server returns JSON: `{ "names": { "username": "<hex-pubkey>" }, "relays": { ... } }`.
5. Client verifies that the pubkey in `names` matches the event’s `pubkey`. If so, the NIP-05 identifier is considered valid and can be displayed.

**Critical dependencies:**

- DNS: `my.satnam.pub` must resolve to a working web endpoint.
- TLS: valid HTTPS certificate for `my.satnam.pub`.
- Web server: Netlify site with `/.well-known/nostr.json` mapped to Netlify Function.
- JSON endpoint implementation:
  - `netlify/functions/nostr.ts` (and compiled `netlify/functions_active/nostr.ts`) handle `/.netlify/functions/nostr`.
  - `netlify.toml` maps `/.well-known/nostr.json` → `/.netlify/functions/nostr`.
  - `services/nip05.ts` and Supabase `nip05_records` generate mappings.
- User database: Supabase as source of truth for `name → pubkey` mappings.

**Failure modes for existing NIP-05 identifiers:**

- DNS failure or domain seizure: clients cannot resolve `my.satnam.pub`, so HTTP requests fail. NIP-05 verification becomes impossible. Pubkeys still work; only the human-readable identifier fails.
- Hosting provider takedown (Netlify): DNS still resolves, but HTTP returns errors; NIP-05 verification fails until DNS is repointed to backup infra.
- TLS / certificate failure: some clients will refuse insecure HTTP; others may degrade. In practice, NIP-05 verification should be treated as failed.
- Supabase outage / data loss: endpoint still answers, but may have incomplete or empty `names` mapping. NIP-05 verification may fail or fall back to static entries in `nostr.ts`.

**Lookup-time vs one-time verification:**

- NIP-05 is a **lookup-time dependency**: spec requires clients to fetch `/.well-known/nostr.json` and compare to current `kind:0` metadata.
- Spec explicitly says clients must follow **public keys**, not NIP-05 strings, and must stop displaying a NIP-05 if the mapping changes or disappears.
- Clients may cache results for performance, but caching behavior and TTLs are implementation-defined; there is no standardized “once verified, always valid” guarantee.

## 3. Current Satnam NIP-05 Architecture

**Domain & routing:**

- Primary identifier pattern: `username@my.satnam.pub`.
- `netlify.toml`:
  - `/.well-known/*` → static `.well-known` directory.
  - `/.well-known/nostr.json` → `/.netlify/functions/nostr`.

**NIP-05 endpoint implementation:**

- `netlify/functions/nostr.ts`:
  - Handles `GET` requests, returns `{ names, relays }`.
  - Fetches a special npub from Supabase vault and merges `nip05_records` from Supabase DB.
  - Adds fallback static entries if DB is empty.
- `services/nip05.ts`:
  - `generateNip05Json()` reads `nip05_records` and returns `{ names }` for privacy-first variants.
- `netlify/functions/nostr-json.js`:
  - Privacy-preserving per-user variant that uses an HMAC’d `name_duid` to fetch artifacts from storage.

**Verification on the client:**

- `src/lib/nip05-verification.ts`:
  - `NIP05VerificationService` performs direct HTTPS fetch to `https://<domain>/.well-known/nostr.json?name=<username>` or fetches the full file as fallback.
  - `HybridNIP05Verifier` uses DNS-based NIP-05 as one of several methods (kind:0 metadata, PKARR records, DNS, optional Iroh).

**PKARR linkage:**

- `register-identity.ts` and `IdentityForge.tsx` create PKARR TXT records:
  - `_nostr` → `"nostr=npub..."`.
  - `_nip05` → `"username@my.satnam.pub"`.
- These PKARR records are stored in `pkarr_records` and can be independently resolved by the hybrid verifier.

## 4. Threat Model & Failure Scenarios

1. **Registrar suspension / domain seizure (`satnam.pub` / `my.satnam.pub`):**

   - DNS records removed or altered at registrar/registry level.
   - NIP-05 identifiers `@my.satnam.pub` become unreachable for all clients, regardless of hosting.
   - Public keys remain usable; NIP-05-based search and “verified checkmarks” fail.

2. **Hosting provider takedown (Netlify):**

   - DNS still points to Netlify, but the site/functions are disabled.
   - NIP-05 lookups fail with HTTP errors; DNS is intact.
   - You can recover by repointing DNS (or using secondary A/AAAA/ALIAS records) to backup infra.

3. **DNS poisoning / MITM on `my.satnam.pub`:**

   - Attacker controls DNS or routes traffic to a malicious HTTP server.
   - They can serve a fake `nostr.json` mapping `username → attacker_pubkey`.
   - Clients following spec will treat this as valid NIP-05 unless they have additional trust signals.

4. **Supabase outage / data loss:**
   - DNS and hosting are intact, but identity mappings are unavailable.
   - Endpoint may return empty or partial `names`; existing identifiers appear invalid.

For each scenario we must preserve, as far as possible:

- **User sovereignty:** users retain control over their keys and can prove past ownership of `username@my.satnam.pub`.
- **Zero-knowledge principles:** no new custodial key management or centralized login.
- **Continuity:** mainstream clients still recognize users or can be guided to new identifiers.

## 5. Backup Architecture Options

### Option A – Same NIP-05 Identifiers, Alternative Infrastructure

**Goal:** keep `username@my.satnam.pub` working when Netlify or Supabase fail, assuming the domain itself is still under your control.

**Architecture sketch:**

- Secondary NIP-05 HTTP endpoint on Lunanode VPS or Start9 OS:
  - Minimal web service that implements `/.well-known/nostr.json` using a local PostgreSQL copy of `nip05_records`.
- Database resilience:
  - Supabase → replica on Start9 or VPS via periodic snapshot (pull) and/or logical replication.
- DNS strategy:
  - Primary: `my.satnam.pub` → Netlify.
  - Disaster: change A/AAAA/ALIAS to point to Lunanode/Start9; or preconfigure multiple A records with monitoring-based failover.

**Strengths:**

- Works with existing NIP-05 spec and all clients.
- Transparent to users if failover DNS changes propagate quickly.

**Limitations:**

- Cannot help if `satnam.pub` / `my.satnam.pub` are seized or suspended at registrar/registry level.
- Requires DB replication and regular failover drills.

### Option B – Backup NIP-05 Identifiers on Secondary Domain

**Goal:** give users a pre-provisioned fallback `username@<backup-domain>` mapping to the same pubkey, on an independent registrar and hosting stack.

**Architecture sketch:**

- Secondary clearnet domain (e.g., `satnam-backup.net`) at a censorship-resilient registrar (Porkbun, Njalla, or Handshake-adjacent).
- NIP-05 service for the backup domain:
  - Hosted on Start9 OS or Lunanode.
  - Uses a replicated snapshot of `nip05_records`.
- Identity mapping:
  - For each user, maintain `username@my.satnam.pub` and `username@satnam-backup.net` pointing to the same pubkey.
  - PKARR `_nip05` TXT records and kind:0 metadata can include or reference the backup identifier.

**Client constraints:**

- NIP-05 spec supports only **one** `nip05` string in kind:0 metadata; clients normally require that this string match the identifier they are verifying.
- Practically, users cannot have two simultaneously “active” NIP-05 identifiers in mainstream clients; they must choose which string to publish in their profile at any given time.

**Operational pattern:**

- Normal operation: users publish `username@my.satnam.pub` in kind:0, but Satnam pre-provisions and documents `username@satnam-backup.net`.
- Disaster where domain is seized but relays still work: users update their `kind:0` metadata (from any client) to set `nip05` to the backup identifier; clients then verify against `satnam-backup.net`.

**Strengths:**

- Survives registrar-level or TLD-level attack on `satnam.pub`.
- Uses standard NIP-05 flows; no client modifications required.

**Limitations:**

- Requires user action (update profile to point at backup domain) after a catastrophic event.
- Users who never update their profile will lose “verified” status, though their pubkey remains valid.

**On `.onion` identifiers:**

- NIP-05 spec is agnostic about TLDs and only defines HTTPS endpoints; technically `https://<onion>/.well-known/nostr.json` is allowed.
- In practice, Tor resolution and SOCKS proxy configuration for NIP-05 HTTP lookups is **client-specific and not standardized**.
- Major clients (Damus, Amethyst, Snort, Primal, Coracle, Gossip) focus on Tor support for relays; NIP-05 over `.onion` is not widely documented or relied upon.
- Conclusion: `.onion` NIP-05 endpoints can be offered as **advanced fallback** for Tor users, but **cannot be your primary DR mechanism** for the general user base.

### Option C – PKARR-Primary Identity (DNS-Minimized)

**Goal:** treat PKARR records as the canonical identity mapping, making NIP-05 optional.

**Architecture sketch:**

- Self-hosted PKARR homeserver on Lunanode (per existing PKARR assessment).
- For each user, PKARR records contain:
  - `_nostr` TXT with `nostr=npub...`.
  - `_nip05` TXT with `username@my.satnam.pub` (and potentially backup domain references as JSON).
- SimpleProof timestamps anchor PKARR records to Bitcoin for long-term auditability.
- Iroh node discovery provides liveness attestation for nodes linked to identities.

**Client compatibility:**

- Today, PKARR resolution is **not implemented** in mainstream Nostr clients; it is used primarily in the Pubky ecosystem.
- Satnam’s own `HybridNIP05Verifier` can use PKARR internally, but external clients will not.

**Conclusion:**

- PKARR is an excellent **internal** resilience layer and long-term identity registry, but cannot currently replace NIP-05 for mainstream Nostr clients.

### Option D – DNS-less Identity via No-DNS (.nostr DNS over Nostr)

**Context and concept (from No-DNS):**

- **No-DNS** is a decentralized addressing system built on Nostr that lets a Nostr key pair publish DNS records and SSL certificates directly to the Nostr network.
- It introduces a `.nostr` TLD and a dedicated DNS server (`nodns-server`) that resolves names like `npub1abc…123.nostr` by reading Nostr events instead of querying traditional DNS roots.
- The system has three main parts:
  - **Protocol:** Nostr events for DNS and certificates:
    - **Kind 11111** – DNS record events. One event per npub holds all DNS records for that `npub…nostr` “zone”, using fixed-position `"record"` tags for A/AAAA/CNAME/TXT/MX/etc.
    - **Kind 30003** – certificate events. PEM-encoded TLS certs in `content`, tagged with TLD (e.g. `nostr`) and expiry.
  - **`nodns-cli`:** manages keys, DNS records, and certificates, and publishes them to relays.
  - **`nodns-server`:** a DNS server (port 53) that:
    - Resolves `.nostr` domains using Nostr events.
    - Forwards non-`.nostr` queries to upstream DNS.
    - Optionally auto-installs TLS certs into the system trust store (explicitly marked as dangerous; recommended disabled in production).

**Operational model:**

- End users or operators run `nodns-server` locally or on an infrastructure host and configure their systems to use it as a DNS resolver.
- When a client does `dig npub1…nostr`, `nodns-server` queries Nostr relays for the relevant events, verifies signatures, and returns DNS answers.
- Web services can then be hosted at IPs pointed to by `.nostr` records, and certificates distributed via Nostr certificate events.

**Assessment for Satnam’s NIP-05 DR use case:**

- No-DNS **does not change how mainstream NIP-05 clients resolve `username@my.satnam.pub` today**:
  - NIP-05 remains hard-wired to `https://<domain>/.well-known/nostr.json` over traditional DNS/TLS.
  - `.nostr` domains only work for clients or systems explicitly configured to use `nodns-server` as a resolver.
- As a result, No-DNS **cannot be a drop-in DR mechanism for existing NIP-05 identifiers**; users’ clients will not automatically look up `username@my.satnam.pub` via `.nostr` or No-DNS.
- However, No-DNS is **highly aligned with Satnam’s sovereignty goals**:
  - Domains are controlled by Nostr keys (similar to your existing key-centric model).
  - Records and certificates are published to relays, with signature and timestamp verification.
  - It introduces a DNS plane that is independent of traditional registrars and TLDs, improving resilience against domain seizure and DNS censorship **for `.nostr` identities themselves**.

**Fit with Satnam’s broader identity/attestation stack:**

- No-DNS could be used as a **parallel, DNS-less identity channel** for advanced users who:
  - Run `nodns-server` locally, or
  - Point their resolvers at a Satnam-operated No-DNS server.
- Satnam could, in theory, maintain `.nostr` zones whose DNS records and TLS certs are cross-linked with:
  - PKARR records (for DHT-based discovery),
  - SimpleProof anchoring (for historical audit of DNS records/certs), and
  - Your existing relays and Supabase identity data.
- This would allow you to present **cryptographically strong, DNS-independent proofs of service endpoints and identities** for users and guardians who opt into this stack.

**Conclusion for this document:**

- For the specific goal of **keeping `username@my.satnam.pub` working in mainstream Nostr clients during outages**, No-DNS remains **complementary rather than core**:
  - It does not remove the dependency of current NIP-05 clients on DNS/HTTPS for `my.satnam.pub`.
  - It requires additional client/system configuration (DNS resolver changes) and is thus suitable mainly for advanced users and tooling.
- Within Satnam’s strategy, No-DNS should therefore be treated as a **future / experimental Option D**:
  - A promising DNS-less identity and service-discovery layer that aligns with Satnam’s ethos and can re-use PKARR, Iroh, SimpleProof, and Supabase data.
  - Not part of the **baseline NIP-05 DR path** (Options A and B) until there is broader client and ecosystem support for `.nostr` resolution and/or explicit No-DNS integration.

## 6. Technical Feasibility & Constraints

**NIP-05 spec constraints (from NIP-05):**

- Identifiers must be valid “internet identifiers”; `<local-part>` is restricted to `a-z0-9-_.` (case-insensitive).
- Clients must use `https://<domain>/.well-known/nostr.json?name=<local-part>` and compare pubkeys.
- Keys in `names` must be hex; `npub` is not allowed.
- No provision for multiple NIP-05 identifiers in one `kind:0` other than changing the single `nip05` field over time.

**Client support overview (based on public docs and behavior):**

- **Tor / `.onion`**: most clients that support Tor do so at the transport layer for relays; NIP-05 HTTP lookups over Tor are not consistently documented. Treat `.onion` NIP-05 as experimental.
- **PKARR**: support is limited to a few Pubky-aware tools; mainstream clients do not resolve PKARR records when NIP-05 fails.
- **Multiple identifiers**: a single pubkey can, in principle, be referenced by many NIP-05 endpoints, but clients treat the `nip05` field in `kind:0` as a **single canonical string**. Updating it overwrites the previous value; there is no widely supported “list of identifiers” semantics.

**Database synchronization (Supabase → Start9 / VPS):**

- Real-time logical replication is ideal but adds operational complexity (monitoring replication lag, schema migrations).
- Periodic snapshot (e.g., hourly export/import of `nip05_records`) is simpler and may be sufficient for DR, accepting small staleness in disaster mode.

**Operational burden for a single operator:**

- Backup domains, TLS, and database replicas add:
  - Certificate renewal and domain expiry monitoring.
  - OS updates and backups for Start9 / VPS.
  - Health checks for primary and backup `/.well-known/nostr.json` endpoints.
- This is manageable if changes are infrequent and most components are automated (e.g., ACME certificates, cron-based health checks and backups).

## 7. Multi-Method Attestation as a Resilience Layer

Satnam already uses multiple attestation methods with the `HybridNIP05Verifier`:

- **kind:0 metadata**: NIP-05 plus profile info, signed by the user’s key and stored on relays.
- **PKARR**: `_nostr` and `_nip05` TXT records on BitTorrent DHT (via Satnam’s PKARR homeserver and relays).
- **DNS NIP-05**: standard HTTPS lookup to `/.well-known/nostr.json` (discussed here).
- **Iroh node discovery**: optional liveness and reachability for nodes associated with pubkeys.
- **SimpleProof**: Bitcoin-anchored timestamps for PKARR and identity artifacts.

**How these help when NIP-05 fails:**

- PKARR records can continue to prove that a given pubkey historically claimed `username@my.satnam.pub`, even if DNS is gone.
- SimpleProof timestamps provide an immutable audit trail showing _when_ that mapping was valid.
- kind:0 metadata events on Satnam’s own relays can still show the last known `nip05` string, even if clients can no longer re-verify it over HTTPS.
- Iroh can prove that a guardian or service node associated with the identity is still reachable, even if DNS identity is broken.

While mainstream clients will not automatically use all these layers, Satnam’s own tools and dashboards can present strong evidence of continuity and past ownership to users and external verifiers.

## 8. Implementation Roadmap (Recommended Blend of Options A & B)

**Phase 1 – Hardening current NIP-05 (Option A baseline):**

1. Deploy a minimal NIP-05 service on Lunanode or Start9 that can serve `/.well-known/nostr.json` using a local snapshot of `nip05_records`.
2. Implement periodic exports from Supabase (e.g., hourly) to the backup DB.
3. Add DNS runbook and automation for repointing `my.satnam.pub` to backup infra upon Netlify failure.
4. Add monitoring for primary endpoint availability and domain health.

**Phase 2 – Secondary domain (Option B):**

1. Register a censorship-resilient secondary domain (e.g., `satnam-backup.net`).
2. Deploy a NIP-05 service for the secondary domain on Start9 / VPS, backed by the same replicated DB.
3. Extend registration flows and user docs so each user knows their backup identifier `username@satnam-backup.net`.
4. Store both primary and backup identifiers in PKARR records (e.g., as JSON value in `_nip05` TXT) and/or in additional metadata fields, even if clients only display one at a time.

**Phase 3 – PKARR-centric resilience (Option C as internal layer):**

1. Ensure all identity registration and updates always publish updated PKARR records with `_nostr` and `_nip05` TXT entries.
2. Anchor PKARR updates via SimpleProof.
3. Expose a “proof of historical NIP-05 ownership” endpoint or dashboard that validates PKARR + SimpleProof, independent of DNS.

## 9. Monitoring, Maintenance & Testing

**Monitoring:**

- External health checks for:
  - `https://my.satnam.pub/.well-known/nostr.json?name=testuser` (primary).
  - Backup endpoints on secondary domain and/or backup hosts.
- Domain and certificate expiry alerts for all domains involved.
- DB replication job status and lag.

**Maintenance:**

- Regular OS and package updates on Start9 / VPS.
- Periodic DR drills: simulate Netlify failure by temporarily routing `my.satnam.pub` to backup infra and verifying NIP-05 lookups from a test client.
- Schema migration playbook that covers both Supabase and backup DBs.

**Testing:**

- Automated tests that:
  - Verify NIP-05 responses from both primary and backup endpoints for a sample of users.
  - Confirm that PKARR records and SimpleProof attestations remain in sync with NIP-05 mappings.

## 10. Recommendation

**Short term:**

- Implement **Option A** (backup NIP-05 endpoint + DNS failover) as a baseline, since it preserves `username@my.satnam.pub` for all failures where you still control the domain and registrar.

**Medium term:**

- Add **Option B** (secondary domain) to protect against registrar or TLD-level issues, and proactively communicate backup identifiers to users.
- Use PKARR + SimpleProof to record both primary and backup identifiers as historical evidence of continuity.

**Long term:**

- Treat **Option C** (PKARR-primary identity) as an internal source of truth and future-facing direction, but do not rely on it for mainstream client interoperability until PKARR resolution is widely supported.

This blended approach maximizes resilience, keeps user sovereignty and zero-knowledge principles intact, and stays compatible with existing Nostr clients while leveraging Satnam’s multi-method attestation stack for stronger assurance where clients support it.
