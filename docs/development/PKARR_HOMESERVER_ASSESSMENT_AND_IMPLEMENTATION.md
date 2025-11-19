# PKARR Homeserver Integration: Assessment & Implementation Plan for Satnam

## 1. Purpose & Scope

This document evaluates whether Satnam needs a dedicated PKARR homeserver, the trade-offs of co-locating it on your existing Lunanode VPS (LNbits, Phoenixd, future Cashu mint), and provides a concrete deployment and integration plan. It focuses on Satnam’s current PKARR-based attestations and NIP-05 identity verification flows.

---

## 2. Current Satnam PKARR & Attestation Architecture

### 2.1 What Satnam Already Does with PKARR

From the existing code and docs in this repo:

- **PKARR record creation at identity registration**
  - `netlify/functions_active/register-identity.ts`:
    - After successful identity creation + NIP-03 attestation, `publishPkarrRecordAsync()` is called (non-blocking, feature-flagged by `VITE_PKARR_ENABLED`).
    - It decodes the user’s `npub` to hex, builds TXT records:
      - `_nostr` → `TXT nostr=<npub>`
      - `_nip05` → `TXT <username>@<domain>` (standardized to `@my.satnam.pub`).
    - It then inserts a row in `pkarr_records` with:
      - `public_key` (hex nostr key)
      - `records` (JSON), `timestamp`, `sequence`, `signature` (blank for server-side), `relay_urls`, `last_published_at`.

- **PKARR publish API & SimpleProof attestation**
  - `netlify/functions_active/pkarr-publish.ts`:
    - Verifies a signed PKARR record (Ed25519 over `recordsJson + timestamp + sequence`).
    - Upserts into `pkarr_records` and optionally calls `simpleproof-timestamp` to anchor a hash of the PKARR record on Bitcoin, storing a link in `simpleproof_timestamps` and on the PKARR record.
    - This function is the *attestation bridge*: it treats PKARR records as verifiable identity data and links them into the same SimpleProof attestation fabric used elsewhere.

- **PKARR-based verification of identities and contacts**
  - `src/lib/nip05-verification.ts` (`HybridNIP05Verifier`):
    - Supports multiple verification methods: kind:0, PKARR, DNS, and optional Iroh.
    - `tryPkarrResolution()` / `tryPkarrResolutionMultiMethod()` use a DHT client (`PubkyDHTClient` / `pubky-dht-client-minimal`) to query PKARR relays:
      - Default relays: `https://pkarr.relay.pubky.tech`, `https://pkarr.relay.synonym.to` (configurable).
      - Extract NIP-05 + pubkey from returned TXT-like records and check consistency.

  - `netlify/functions/pkarr-proxy.ts`:
    - Unified proxy (verify_contact, verify_batch, analytics, admin, etc.) that:
      - Uses `HybridNIP05Verifier` with `enablePkarrResolution: true` and `enableKind0Resolution/Dns: false` for PKARR-specific checks.
      - Updates `encrypted_contacts.pkarr_verified` and `verification_level`.

- **Attestation Manager**
  - `src/lib/attestation-manager.ts`:
    - Currently orchestrates SimpleProof timestamps + Iroh discovery and writes unified `attestations` rows.
    - PKARR is *not* a first-class method here yet; instead it is an orthogonal path used for NIP-05 and contact verification (via PKARR relays and db tables `pkarr_records`, `pkarr_publish_history`, `pkarr_resolution_cache`).

- **Extensive PKARR documentation**
  - `docs/PKARR_API_DOCUMENTATION.md`, `docs/PKARR_DEPLOYMENT_CHECKLIST.md`, `docs/PKARR_QUICK_START.md`, `docs/PKARR_USER_GUIDE.md`, etc., already cover:
    - Netlify function endpoints (`pkarr-proxy`, `pkarr-publish`, `scheduled-pkarr-republish`).
    - DB schema, feature flags, rate limiting, admin dashboard, and operational readiness.

### 2.2 What is *not* implemented yet

- `pkarr-publish.ts` explicitly notes: *“BitTorrent DHT relay publishing will be implemented in Phase 2.”*
  - Currently Satnam **stores** PKARR records in Supabase and may timestamp them with SimpleProof, but **does not itself run a PKARR DHT homeserver**.
  - Resolution is done against external PKARR relays via the Pubky DHT client.

**Conclusion:** Satnam already treats PKARR as a signed, timestampable identity attestation layer, but relies on *external* PKARR homeservers/relays. A Satnam-run homeserver would add ownership and redundancy, but is not currently a hard dependency for the client flows to function.

---

## 3. PKARR & Pubky Model: What a Homeserver Actually Does

From Pubky docs (Homeservers + PKARR Introduction + Pubky knowledge base):

- **PKARR (Public-Key Addressable Resource Records)**
  - Allows a public key to act as a sovereign “domain name”.
  - You publish small signed DNS-style packets (≤ ~1000 bytes) into the Mainline DHT.
  - Clients (or relays) resolve these records via DHT or via PKARR HTTP relays that expose DNS-over-HTTPS (DoH)-style interfaces.

- **Homeservers**
  - A *homeserver* is the canonical storage backend associated with a PKARR public key.
  - It typically:
    - Provides a REST API for storing and querying user content (posts, profiles, etc.).
    - Serves data referenced via `pubky://` URLs.
    - Publishes/refreshes PKARR records pointing to itself so the DHT and PKARR relays know where to find that content.
  - Homeserver is about **content hosting and canonical data location**, *not strictly required* for identity mapping if the PKARR record itself carries the needed identity information (NIP-05, nostr key, etc.).

**Key distinction for Satnam:**
- Satnam’s current PKARR use is **identity & contact attestation** (NIP-05 ↔ pubkey, plus SimpleProof anchoring), not yet full Pubky content hosting.
- A Pubky-style homeserver would become more relevant when Satnam wants `pubky://` URLs for user data or wants to run its own PKARR relays instead of relying on third parties.

---

## 4. Technical Feasibility: Do We Need a PKARR Homeserver for Satnam?

### 4.1 Is a homeserver required for Satnam’s current attestation flows?

**Answer: No, not strictly required.**

Satnam’s current flows only demand that:
- PKARR records exist and are resolvable via some DHT/relay endpoints; and
- Satnam can publish and re-publish those records; and
- The records can be anchored via SimpleProof for tamper-evidence.

All of that is already satisfied by:
- `pkarr-publish.ts` (publishing + DB storage + optional SimpleProof anchoring).
- `scheduled-pkarr-republish` (periodic refresh) and `pkarr-proxy` for verification.
- External PKARR relays operated by Synonym/others (`pkarr.relay.pubky.tech`, `pkarr.relay.synonym.to`).

A dedicated homeserver becomes attractive when you want to:
- Reduce dependence on third-party PKARR infrastructure.
- Guarantee data locality and policy control for Satnam users.
- Host Pubky content or advanced identity metadata behind `pubky://` URLs.

### 4.2 What does a PKARR homeserver need to serve for Satnam?

For **Satnam’s identity/attestation use case**:

- **Minimal requirements**:
  - Provide an HTTP API to:
    - Accept signed PKARR records for Satnam users.
    - Store those records (in your own DB or disk) with sequence and timestamp.
    - Optionally, re-publish them to the Mainline DHT on a schedule.
  - Expose a **PKARR resolution endpoint** compatible with existing DHT clients that Satnam uses (`/resolve/<publicKey>` returning `{ public_key, records[] }`).

- **Optional / future requirements** (Pubky-style homeserver):
  - Full Pubky content API (posts, profiles, bookmarks, etc.).
  - Pubky URL resolution (`GET /resolve/<pubky-url>` returning content).
  - Mirroring, redundancy, and aggregation.

Given the current codebase, Satnam would integrate with a homeserver primarily in two ways:
- **Publishing**: `pkarr-publish` (or a future `pkarr-relay-publish`) sends records not only to Supabase but also to your homeserver.
- **Resolution**: the DHT client configuration (`PubkyDHTClient` and `pubky-dht-client-minimal`) is pointed at your homeserver/relays in addition to third-party endpoints.

### 4.3 Resource Requirements Estimate (Lunanode VPS)

PKARR homeservers are essentially:
- A small HTTP server.
- Light DB or KV store.
- A DHT node / client for Mainline (if you run a full relay) **or** a thin proxy to existing PKARR relays.

For Satnam’s current scale (identity-only, no heavy content):

- **CPU**: 1 vCPU is sufficient; 2 vCPUs give comfortable headroom.
- **RAM**: 512 MB–1 GB for the PKARR process itself; sharing 2–4 GB total on the box with LNbits/Phoenixd/Cashu is realistic.
- **Storage**: Minimal. Identity PKARR records are small; a few hundred MB for logs + DB is ample.
- **Bandwidth**:
  - Publishing per user: a few KB per publish, a few times per day (republishing).
  - Verification: PKARR lookups per contact or identity verification request (again, small HTTP/DHT lookups).

**Feasibility on your existing Lunanode VPS:**
- Co-location with LNbits, Phoenixd, and a Cashu mint is technically feasible; PKARR won’t dominate CPU or memory if tuned conservatively and if you avoid large content hosting at this stage.

---

## 5. Co‑Location Risk & Failure Domain Analysis

### 5.1 Security Implications of Co‑Location

**Threat increases from co-location:**
- A successful exploit in *any* of LNbits, Phoenixd, Cashu mint, or the PKARR homeserver can potentially impact all other services on the same VPS if the attacker gains OS-level access.
- The PKARR homeserver will expose new HTTP endpoints (possibly DHT ports), increasing total attack surface.

**Mitigations:**
- Run each service under a dedicated Unix user (or container) with minimum privileges.
- Apply strict firewall rules:
  - Limit inbound ports to:
    - HTTPS for PKARR homeserver.
    - Lightning/LNbits/Phoenixd ports as required.
  - Consider binding the PKARR admin interface to localhost or a VPN only.
- Keep dependencies minimal; avoid unnecessary frameworks.

### 5.2 Maintenance Burden & Complexity

Adding a PKARR homeserver introduces:
- Another process/service to:
  - Monitor (health, logs, TLS, DHT reachability).
  - Upgrade (security patches, protocol changes).
  - Configure (relay lists, record TTLs, publish intervals).

On a single VPS this is manageable, but you must:
- Define a clear ops runbook (see Section 8: Monitoring & Maintenance).
- Ensure you have automation for restarts and updates (systemd, Ansible, or simple scripts).

### 5.3 Attack Surface & Failure Domains

- **Attack surface:**
  - Slightly increased by adding a web-facing homeserver and possibly DHT ports.
  - Offset by the benefit of *not* depending solely on external PKARR relays (reduces risk of external compromise or misconfiguration impacting Satnam users).

- **Failure domain:**
  - Co-location means a single VPS failure (hardware, network, misconfiguration) brings down LNbits, Phoenixd, Cashu, and PKARR simultaneously.
  - However, identity verification via PKARR may *gracefully degrade* to other methods (kind:0, DNS, SimpleProof), preserving some functionality.

### 5.4 Resource Contention

- Under heavy load, PKARR lookups and republishing jobs could compete with LNbits/Phoenixd/Cashu for CPU and IO.
- With your current use case (identity-only PKARR, relatively low frequency), contention is expected to be minimal.

**Summary:** Co-location is acceptable for early-stage deployment and experimentation, as long as firewalling, OS hardening, and resource monitoring are in place. For high-assurance or production-scale Pubky content hosting, a separate VPS (or at least a separate VM/container with strict isolation) becomes preferable.

---

## 6. Architectural Role: PKARR as Orthogonal, Parallel Attestation

Satnam’s attestation landscape now includes:
- **On-chain anchoring (SimpleProof)**: timestamps important identity and attestation artifacts onto Bitcoin.
- **Relay/network reachability (Iroh)**: validates that nodes/services are discoverable.
- **PKARR-based identity mapping**:
  - Binds NIP-05 ↔ nostr pubkey ↔ (optionally) homeserver/relay location via signed PKARR records.
  - Provides an additional, independent verification path from traditional DNS and from nostr kind:0 events.

This creates **orthogonal, parallel, redundant verification**:
- A user’s identity can be checked via:
  - DNS NIP-05 resolution;
  - nostr kind:0 metadata;
  - PKARR record in the DHT (via homeserver + relays);
  - SimpleProof timestamp of the PKARR record.

A Satnam-operated PKARR homeserver strengthens this by:
- Giving Satnam users a *credible exit* path: even if third-party PKARR relays disappear or change policies, Satnam’s own homeserver and DHT participation preserve identity attestations.
- Allowing richer identity records or references to Satnam-controlled resources (e.g., `pubky://` pointers to audit logs, recovery metadata, or family federation information) without leaking raw PII (consistent with your privacy-first design).

---

## 7. Implementation Guide: PKARR Homeserver on Lunanode VPS

### 7.1 Placement in This Repo

This plan is documented here: `docs/development/PKARR_HOMESERVER_ASSESSMENT_AND_IMPLEMENTATION.md`.

It complements existing PKARR docs:
- `docs/PKARR_API_DOCUMENTATION.md`
- `docs/PKARR_DEPLOYMENT_CHECKLIST.md`
- `docs/PKARR_QUICK_START.md`
- `docs/PKARR_ADMIN_DASHBOARD.md`

### 7.2 High-Level Deployment Steps (Lunanode VPS)

**Assumptions:**
- Ubuntu/Debian-like OS.
- Existing LNbits, Phoenixd, Cashu processes owned by their own users.

1. **Plan service boundaries**
   - Decide on:
     - PKARR HTTP port (e.g., 8085 or behind existing reverse proxy).
     - Whether DHT/Mainline ports are exposed directly or proxied by an external PKARR relay.

2. **Create a dedicated system user**
   - `adduser --system --group pkarr`
   - Store config in `/etc/pkarr/`, data/logs in `/var/lib/pkarr/`.

3. **Install PKARR homeserver implementation**
   - Choose implementation (Rust or Node-based) that:
     - Can run as a pure homeserver/relay (serving `GET /resolve/<key>` and `POST /publish`-equivalent endpoints).
     - Supports Mainline DHT participation or upstream to an existing DHT relay.
   - Install via system package or standalone binary under `/usr/local/bin/pkarr-server`.

4. **Configure homeserver** (see 7.3 for details)
   - Set:
     - Listening address + port.
     - Storage backend (SQLite/Postgres or simple file-based store).
     - DHT bootstrap nodes.
     - TLS termination (usually via reverse proxy like nginx/Caddy/Traefik).

5. **Set up systemd service**
   - Create `/etc/systemd/system/pkarr-server.service` to run the binary as `pkarr` user, restart on failure, and log to journal.

6. **Integrate with reverse proxy (if present)**
   - Add HTTPS vhost `pkarr.yourdomain` or reuse `my.satnam.pub` with a subpath (e.g., `/pkarr/`).
   - Restrict any admin APIs to localhost if possible.

7. **Open firewall ports minimally**
   - Allow inbound 443 (and any DHT-necessary UDP/TCP ports if running full DHT node).
   - Block direct access to internal ports (homeserver listens on localhost, proxy handles public traffic).

8. **Test from the VPS itself, then from Satnam client**
   - Use `curl` to test publish/resolve endpoints.
   - Update Satnam configuration (Section 7.3–7.4) and run existing test suites where applicable.

### 7.3 PKARR Homeserver Configuration & Best Practices

While concrete config files depend on the chosen implementation, apply the following principles:

- **Minimal API surface**
  - Expose only:
    - `POST /publish` (or equivalent) for new PKARR records.
    - `GET /resolve/<publicKey>` for lookups.
  - If a richer Pubky API is enabled, gate write endpoints behind auth.

- **Storage & retention**
  - Use a small Postgres or SQLite DB *separate* from Satnam’s Supabase (to keep logical separation between on-chain attestations and DHT caching data).
  - Set retention windows and cleanup jobs for stale records.

- **DHT participation**
  - Bootstrap nodes from official PKARR/Mainline lists.
  - Configure conservative publish intervals (e.g., republish every 4–8 hours) to avoid spamming the DHT.

- **TLS & authentication**
  - Terminate TLS at reverse proxy.
  - Use IP allow-lists or API keys for publish endpoints if you want only Satnam backend to publish.

### 7.4 Integrating Homeserver with Satnam Code

**Goal:** Have Satnam publish identity PKARR records to your homeserver and resolve them preferentially from there, while keeping external relays as backup.

1. **Update PKARR relay/homeserver configuration**
   - In `config/index.ts` or equivalent runtime config, set:
     - `PUBKY_HOMESERVER_URL` to your Lunanode PKARR homeserver URL.
     - `PUBKY_PKARR_RELAYS` to include your homeserver’s PKARR relay endpoint as **first entry**, followed by external ones.

2. **Publish flow changes (optional enhancement)**
   - Extend `netlify/functions_active/pkarr-publish.ts` to:
     - After verifying and upserting the PKARR record in Supabase, **forward** the signed record to your homeserver’s `/publish` endpoint.
     - Treat homeserver failures as non-fatal (log + metrics, but do not block Satnam registration).

3. **Resolution flow preference**
   - In `lib/pubky-enhanced-client.ts` and `lib/pubky-dht-client-minimal.ts`:
     - Ensure your homeserver/relay URL appears first in the `relays` list so resolution hits your infrastructure first, then falls back to public relays.

4. **Attestation linkage (optional future step)**
   - Extend `pkarr-publish.ts` or a new function to create an explicit attestation record tying:
     - `pkarr_records.id` ↔ `attestations.verification_id` ↔ `simpleproof_timestamps.id`.
   - This would turn PKARR into a first-class attestation method parallel to SimpleProof and Iroh.

> RECOMMENDATION: Implement steps (1)–(3) initially; treat (4) as a later enhancement once the homeserver is stable.

---

## 8. Monitoring, Maintenance, Backup, and Recovery

### 8.1 Monitoring & Health Checks

- **Process monitoring:**
  - Ensure `pkarr-server` systemd service is `active (running)`; set `Restart=on-failure`.
- **HTTP health check:**
  - Expose a simple `GET /health` endpoint or reuse `GET /resolve/<test-key>` and wire it into your existing monitoring (Netdata, Prometheus, or simple cron + email).
- **DHT health:**
  - Track success/error rates and response times, similar to the PKARR Admin Dashboard metrics already defined in `docs/PKARR_ADMIN_DASHBOARD.md`.

### 8.2 Maintenance Procedures

- **Upgrades:**
  - Use a staged rollout: stop service → replace binary/container → restart → run quick smoke tests.
- **Log rotation:**
  - Configure logrotate or journald retention for PKARR logs (avoid disk bloat).

### 8.3 Backup & Disaster Recovery

- **Data to back up:**
  - PKARR homeserver DB (if used) and config files.
  - Note: PKARR data is fundamentally *ephemeral* in DHT; losing local cache is recoverable by republishing from Satnam’s authoritative records (Supabase via `pkarr_records`).

- **Recovery strategy:**
  - If VPS is lost:
    - Rebuild homeserver from backups (or fresh install).
    - Re-point DNS (if using separate hostname).
    - Trigger a bulk republish using existing Netlify functions and `pkarr_records`.

---

## 9. Security Hardening for Co‑Located PKARR Homeserver

- **Isolation:**
  - Run homeserver as non-root `pkarr` user.
  - Avoid sharing DB credentials or files with LNbits/Phoenixd/Cashu.

- **Network controls:**
  - Restrict incoming connections to required ports.
  - Optionally, listen on localhost and expose via reverse proxy only.

- **Least privilege:**
  - No write access to other services’ data directories.
  - No ability to bind to privileged ports.

- **Regular patching:**
  - Include PKARR homeserver in your system update routine.

---

## 10. Recommendation

**Short-term (current scope):**
- **You do not *need* a PKARR homeserver for Satnam’s existing attestation system to function.** Current flows already work against external PKARR relays and Satnam’s Netlify/Supabase infrastructure.
- However, deploying a **lightweight PKARR homeserver on the existing Lunanode VPS** is **technically feasible** and can be done safely with proper isolation and monitoring.

**Medium-term:**
- Co-location on the Lunanode VPS is acceptable for:
  - Identity-only PKARR records.
  - Modest verification traffic.
- As Satnam evolves toward heavier Pubky content and higher throughput, consider:
  - Moving the PKARR homeserver onto a **separate VPS or container boundary**, or
  - Running multiple homeservers for redundancy and credible exit.

**Net recommendation for next steps:**
- **Proceed with a co-located PKARR homeserver on the existing Lunanode VPS**, constrained to identity PKARR records and DHT participation only.
- Keep external PKARR relays configured as backup.
- Revisit separation onto dedicated infrastructure when:
  - PKARR traffic or Pubky content hosting grows significantly, or
  - You introduce stronger SLAs or regulatory constraints around identity availability.

