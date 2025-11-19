# Iroh Node Integration: Assessment & Implementation Plan for Satnam

## 1. Purpose & Scope

This document evaluates whether Satnam should run a dedicated Iroh node on the existing Lunanode VPS (alongside LNbits, Phoenixd, Cashu, and potentially a PKARR homeserver), and how that would interact with Satnam’s attestation system. It mirrors the PKARR homeserver assessment in structure and depth, but focuses on Iroh’s node/discovery model and how it strengthens or overlaps with other attestation methods.

---

## 2. Current Satnam Iroh & Attestation Architecture

### 2.1 How Satnam Uses Iroh Today

Satnam already integrates Iroh as an **optional node discovery attestation method** alongside SimpleProof and PKARR:

- **Attestation Manager (client)** – `src/lib/attestation-manager.ts`
  - `AttestationRequest` supports `includeIroh` and `nodeId` fields.
  - When `includeIroh && nodeId` are provided, `createAttestation()` calls:
    - `POST /.netlify/functions/iroh-proxy` with `{ action: "discover_node", payload: { verification_id, node_id } }` and a 30s timeout.
  - The JSON response is stored as `irohNodeDiscovery` in the returned `Attestation` object and persisted in Supabase via `attestations.iroh_discovery_id` → `iroh_node_discovery` foreign key.
  - Status logic treats Iroh as parallel to SimpleProof: both may succeed, partially succeed, or fail; Iroh failure alone does not block the attestation.

- **Unified Iroh Proxy (backend)** – `netlify/functions/iroh-proxy.ts`
  - Follows the `pkarr-proxy` pattern with action-based routing:
    - `discover_node` – DHT-based lookup and DB insertion.
    - `verify_node` – reachability verification, with 1-hour in-memory caching.
    - `get_node_info` – fetch stored node info from `iroh_node_discovery`.
    - `update_node_status` – admin-only reachability updates.
  - Uses environment variables:
    - `IROH_DHT_URL = process.env.VITE_IROH_DHT_URL || "https://dht.iroh.computer"`.
    - `IROH_TIMEOUT = parseInt(process.env.VITE_IROH_TIMEOUT || "10000", 10)`.
  - Core discovery function:
    - `discoverIrohNode(nodeId, dhtUrl)` performs `GET ${dhtUrl}/lookup/${nodeId}` with `IROH_TIMEOUT`, expecting an `IrohDhtResponse` (node_id, relay_url, direct_addresses, is_reachable).
  - All DHT errors fall back to `is_reachable: false` with error logging, preserving privacy and resilience.

- **Iroh Verification Service (client)** – `src/services/irohVerificationService.ts`
  - Provides a typed wrapper around `iroh-proxy` for **app-level** use:
    - `discoverNode({ verification_id, node_id })` → `discover_node` action.
    - `verifyNode({ node_id })` → `verify_node` action, including cache hints (`cached`, `last_seen`).
  - Gated by feature flag: `VITE_IROH_ENABLED` (configured via `src/config/env.client.ts`).
  - On errors or when disabled, returns safe default responses with `is_reachable: false` and an error message.

- **Hybrid NIP-05 Verification (client)** – `src/lib/nip05-verification.ts` and `docs/IROH_API_DOCUMENTATION.md`
  - Iroh is wired in as an **optional 5th verification method** in `HybridNIP05Verifier`:
    - Config fields: `enableIrohDiscovery` (default `false`) and `irohTimeout` (default 10s).
    - When enabled, Iroh-based node discovery runs in parallel with kind:0, PKARR, and DNS and contributes to trust scoring.
  - `docs/IROH_API_DOCUMENTATION.md` and `docs/IROH_INTEGRATION_COMPLETE.md` describe this flow and show how Iroh results are surfaced to users.

- **Database schema (conceptual)**
  - `iroh_node_discovery` table stores:
    - `node_id`, `relay_url`, `direct_addresses`, `is_reachable`, `discovered_at`, `last_seen`.
  - `attestations` references `iroh_node_discovery` via `iroh_discovery_id`, giving a unified attestation view per verification attempt.

### 2.2 What Is Not Present Yet

- Satnam does **not** currently run its own Iroh node or Iroh DHT gateway.
- All discovery and verification call out to `https://dht.iroh.computer` (or a configured alternative) via HTTP.
- Iroh integration is **optional**, disabled by default, and considered an “advanced” extra trust signal, not a core requirement for identity verification.

---

## 3. Iroh & Node Model: What Iroh Nodes Actually Do

Drawing from `docs/IROH_SIMPLEPROOF_INTEGRATION_ANALYSIS.md` and `https://iroh.computer/docs`:

- **Iroh in general**
  - A peer-to-peer networking stack focused on **global node discovery**, direct QUIC connections, and privacy-preserving connectivity.
  - Uses a combination of:
    - **PKARR on BitTorrent DHT** for public-key-addressable discovery of nodes and their addresses.
    - **Relays (DERP-like)** to assist with NAT traversal and fallback connectivity.
  - Provides authenticated, encrypted, end-to-end connections between endpoints, with pluggable “protocols” on top.

- **Iroh nodes**
  - Run on user devices or servers and participate in:
    - Publishing their reachability information (relay URLs, direct addresses) into the DHT.
    - Responding to DHT-based lookups for their node IDs.
    - Handling application-level protocols over encrypted connections.
  - Node IDs are long, base-encoded identifiers that can be embedded in kind:0 metadata and other attestations.

- **What Satnam cares about**
  - For Satnam’s current attestation usage, the important part is **discovery and reachability**:
    - Given a claimed Iroh node ID associated with a user or service, can we:
      - Look it up in the Iroh DHT via `IROH_DHT_URL`?
      - Determine whether it’s reachable and via which relay or direct addresses?
  - Application-level Iroh protocols (file sync, custom RPC) are **out of scope** for current Satnam attestation flows but may be relevant later for UDNA/identity-native networking.

---

## 4. Technical Feasibility: Do We Need a Dedicated Iroh Node?

### 4.1 Is a self-hosted Iroh node required for current Satnam flows?

**No, it is not required.**

- Today, `iroh-proxy` only needs an HTTP-accessible DHT lookup endpoint (`IROH_DHT_URL`):
  - Default: `https://dht.iroh.computer`.
  - All lookups and verifications succeed or fail based on that remote service.
- Attestations are already functional and production-ready without any Satnam-operated Iroh node.
- Iroh is clearly positioned in your docs as an **optional enhancement** (“5th method”), disabled by default and not required for core identity verification.

### 4.2 What would a self-hosted Iroh node provide?

If you run your own Iroh node plus an HTTP DHT gateway (or small proxy) on the Lunanode VPS, you could:

- Provide a **private DHT lookup endpoint** for Satnam:
  - Replace or front `IROH_DHT_URL` with something like `https://iroh.dht.my-satnam-vps`.
  - `iroh-proxy` would then query your node (or gateway) instead of—or in front of—`dht.iroh.computer`.
- Potentially act as:
  - A **DHT participant** improving network robustness (by adding another node to the swarm).
  - A **relay** or “home node” for certain Satnam services or guardians, if you later run Iroh protocols there.

For the **current** “is this node reachable?” attestation, self-hosting is more about:
- **Sovereignty and independence** from the main `dht.iroh.computer` service.
- **Observability** (you control logs/metrics for lookups).
- **Failover** if upstream DHT HTTP services go down.

### 4.3 Resource Requirements on Lunanode VPS

Based on Iroh’s design (Rust implementation with QUIC, DHT, and relay support) and typical P2P node behavior:

- **CPU:**
  - 1 vCPU can handle modest DHT and relay workloads for Satnam’s current scale.
  - 2 vCPUs provide comfortable headroom when combined with LNbits, Phoenixd, and Cashu.

- **RAM:**
  - 512 MB–1 GB for Iroh node processes is typically sufficient for modest traffic.
  - On a 2–4 GB VPS, co-location with your existing services is realistic.

- **Storage:**
  - Mainly for logs and small local caches; usually <1 GB.

- **Bandwidth:**
  - DHT traffic: small, frequent UDP/TCP messages.
  - Relay traffic (if you enable it): depends on how much actual data is proxied through your node; initially low for Satnam’s attestation use case.

### 4.4 Compatibility with Existing Lunanode Stack

- OS-level: A standard Linux VPS (likely Ubuntu/Debian) is fully compatible with the official Iroh node binaries.
- Co-location with LNbits, Phoenixd, Cashu:
  - Technically feasible, provided you:
    - Use separate Unix user for Iroh.
    - Configure firewall rules carefully.
    - Monitor aggregate CPU/RAM usage.

---

## 5. Co-location Risk & Failure Domain Analysis

### 5.1 Security Implications

- **Increased attack surface:**
  - An Iroh node will open additional network ports (for DHT, QUIC, and potentially HTTP gateway), adding to the externally exposed services.
  - A vulnerability in Iroh or its HTTP gateway could become another entry point onto the VPS.

- **Lateral movement risk:**
  - If an attacker compromises the Iroh process, they may pivot to LNbits, Phoenixd, or Cashu unless you enforce strong OS-level isolation.

- **Mitigations:**
  - Dedicated `iroh` Unix user and isolated data directories.
  - Minimal privileges (no access to Lightning/Cashu keys or databases).
  - Strict firewall (only expose necessary ports; keep admin endpoints on localhost/VPN).

### 5.2 Maintenance & Operational Complexity

- Running Iroh adds:
  - Another long-lived process (or container) to supervise.
  - Periodic upgrades and configuration tuning (bootstrap peers, relay settings, log levels).
  - Additional metrics/alerts to watch.

- For your scale, this is manageable, but it is non-zero overhead relative to simply calling `https://dht.iroh.computer`.

### 5.3 Failure Domain

- **Single VPS dependency:**
  - If the Lunanode VPS fails, you lose:
    - LNbits, Phoenixd, Cashu.
    - PKARR homeserver (if co-located).
    - Iroh node / DHT gateway.

- **Attestation degradation behavior:**
  - Even without your own Iroh node, Satnam’s identity verification can fall back to:
    - NIP-05 over DNS.
    - Nostr kind:0 metadata.
    - PKARR records.
    - SimpleProof timestamps.
  - This remains true if your self-hosted Iroh node goes down; the app can be configured to fall back to public DHT endpoints, or simply disable Iroh gracefully.

### 5.4 Resource Contention

- At low to moderate traffic, a single Iroh node should not significantly compete with LNbits/Phoenixd/Cashu.
- Heavy Iroh relay usage (if you choose to enable it) could increase CPU and bandwidth usage; you should monitor and cap relay responsibilities initially.

---

## 6. Architectural Role: Iroh in Satnam’s Orthogonal Attestation Design

Iroh plays a different role from PKARR and SimpleProof, but complements them:

- **PKARR:** binds public keys to DNS-like records (NIP-05, nostr npub, and potentially service endpoints) on the BitTorrent DHT.
- **SimpleProof:** anchors important identity artifacts and events (e.g., PKARR records) onto Bitcoin for immutability and auditability.
- **Iroh:** validates **network reachability** of nodes identified by public keys / node IDs via a peer-to-peer discovery and relay network.

Within Satnam:

- Iroh is used to answer: **“Is this claimed node actually reachable on the network, and via which addresses/relays?”**
- PKARR and NIP-05 answer: **“Is this NIP-05 ↔ pubkey mapping consistent and signed by the right party?”**
- SimpleProof answers: **“Has this identity artifact been timestamped in an immutable way?”**

Combining them yields:
- Logical identity assurance (DNS/NIP-05, PKARR, kind:0).
- Historical integrity (SimpleProof).
- Live network reachability (Iroh).

A self-hosted Iroh node enhances the **reachability** part by making Satnam less dependent on a single external DHT HTTP service and by potentially improving connectivity for Satnam-linked nodes.

---

## 7. Deployment Guide: Iroh Node on Lunanode VPS

### 7.1 High-Level Steps

1. **Plan service boundaries**
   - Decide whether this node is **internal-only DHT lookup** for Satnam or a broader public Iroh relay/endpoint.
   - Choose ports for:
     - DHT/QUIC transport.
     - Optional HTTP DHT gateway that exposes `GET /lookup/<node_id>`.

2. **Create a dedicated system user**
   - Example: `adduser --system --group iroh`.
   - Use `/etc/iroh/` for config and `/var/lib/iroh/` for data/logs.

3. **Install the official Iroh binary**
   - Download and install the official Rust-based `iroh` binary from the Iroh GitHub releases.
   - Place it under `/usr/local/bin/iroh` and ensure it’s owned by root but run by the `iroh` user.

4. **Configure and run the node**
   - Initialize configuration (bootstrap peers, relay behavior) using Iroh’s CLI as described in upstream docs.
   - Start an Iroh node process that:
     - Joins the global Iroh network.
     - Participates in DHT operations.
     - Optionally exposes an HTTP gateway that supports DHT lookups.

5. **Add a compatible HTTP DHT gateway**
   - Either:
     - Use any official Iroh DHT HTTP gateway mode (if provided), **or**
     - Run a thin HTTP proxy next to the node that exposes `GET /lookup/<node_id>` and forwards queries to the local Iroh node (via CLI or IPC) to satisfy Satnam’s current `discoverIrohNode` expectations.

6. **Configure systemd service**
   - Create `/etc/systemd/system/iroh-node.service` to:
     - Run `iroh` (and any required gateway) as `iroh` user.
     - Restart on failure.
     - Log to journald.

7. **Integrate with reverse proxy & firewall**
   - If exposing HTTP gateway over TLS, route via nginx/Caddy/Traefik.
   - Restrict public exposure to the minimal set of ports; keep management interfaces internal only.

### 7.2 Satnam Integration Steps

1. **Point Satnam at the self-hosted gateway**
   - On Netlify (or your functions environment), set:
     - `VITE_IROH_DHT_URL=https://iroh-dht.my.satnam.pub` (or similar), aligned with your new HTTP DHT gateway.
   - This causes `netlify/functions/iroh-proxy.ts` to query your node instead of `https://dht.iroh.computer`.

2. **Tune timeouts & feature flags**
   - Ensure `VITE_IROH_TIMEOUT` is set to a value that balances reliability and responsiveness (e.g., 10000–15000 ms).
   - Enable Iroh on the client for testing via `.env.local`:
     - `VITE_IROH_ENABLED=true`.

3. **Test flows end-to-end**
   - Use `tests/iroh-integration.test.ts` and any Iroh-specific manual tests to verify:
     - Node discovery still works.
     - Error handling behaves correctly when your Iroh node or gateway is down.
   - Run attestation flows with `includeIroh: true` and confirm `attestations` rows link to `iroh_node_discovery` entries sourced from your node.

---

## 8. Monitoring, Maintenance, Backup & Security

### 8.1 Monitoring & Health Checks

- Track:
  - `iroh-node.service` status via systemd.
  - Basic metrics: DHT lookups per minute, errors/timeouts, CPU/RAM usage.
  - HTTP gateway health via `GET /health` or a known test node lookup.

### 8.2 Maintenance

- Upgrade procedure:
  - Stop service → upgrade binary → restart → run integration tests.
- Log management:
  - Use logrotate or journald retention caps to prevent disk exhaustion.

### 8.3 Backup & Disaster Recovery

- Persistent state needs are minimal for Satnam’s attestation use case:
  - Main data of record remains in Supabase (`iroh_node_discovery`, `attestations`).
  - Iroh caches can be re-established on restart.
- Back up:
  - Iroh configuration files.
  - Any local bootstrap lists or custom routing config.
- Recovery:
  - Rebuild node from backups.
  - Restore config.
  - Satnam will resume using the node automatically via `VITE_IROH_DHT_URL`.

### 8.4 Security Hardening

- Dedicated low-privilege user.
- Firewalled ports, minimal public exposure.
- Regular patching of the Iroh binary.
- No shared secrets or DB credentials with LNbits/Phoenixd/Cashu.

---

## 9. Comparative Analysis: Iroh vs PKARR

### 9.1 Conceptual Differences

- **Problem space:**
  - PKARR: public-key-addressable DNS-style records; identity and metadata mapping.
  - Iroh: peer-to-peer node discovery and connectivity; reachability and transport.

- **Data stored/served:**
  - PKARR: small DNS-like TXT records (e.g., `_nip05`, `_nostr`, homeserver URLs).
  - Iroh: node reachability info (relay URLs, direct addresses), connection tickets, and protocol endpoints.

- **Network model:**
  - PKARR: BitTorrent DHT + HTTP relays serving PKARR records; optional homeservers as canonical data stores.
  - Iroh: DHT + QUIC endpoints + relay servers; uses PKARR under the hood for addressability in some modes.

### 9.2 Operational Differences

- **Resource footprint:**
  - PKARR homeserver: light HTTP + DB, modest CPU/RAM/bandwidth.
  - Iroh node: continuous DHT participation and optional relay duties; slightly more CPU and bandwidth variability.

- **Deployment complexity:**
  - PKARR: straightforward HTTP service with simple REST-ish interface.
  - Iroh: network stack with DHT, QUIC, relays, and optional HTTP gateways; slightly more complex to configure and monitor.

- **Maintenance burden:**
  - PKARR: primarily about DB integrity, DHT publishing schedule, and HTTP uptime.
  - Iroh: also about keeping in sync with protocol evolution and managing transport-level metrics (latency, connection health).

### 9.3 Use Case Differentiation

- **When to use PKARR in Satnam:**
  - For identity mapping (NIP-05 ↔ npub), binding identities to PKARR records.
  - When you want signed, optionally SimpleProof-anchored records that are discoverable via DHT and DNS-like mechanisms.

- **When to use Iroh in Satnam:**
  - To attest that a given Iroh node ID, associated with an identity, is actually reachable on the network.
  - For scenarios where live connectivity and node presence matter (e.g., guardian nodes, family federation infrastructure, private relays).

- **Can one replace the other?**
  - No. They are **complementary**:
    - PKARR focuses on naming and mapping.
    - Iroh focuses on finding and connecting to live nodes.
  - Iroh itself can leverage PKARR for its own discovery, but from Satnam’s perspective they remain distinct attestation layers.

---

## 10. Recommendation

**Short-term (current scope):**
- Satnam’s attestation system for Iroh is already production-ready using **public Iroh infrastructure** (`https://dht.iroh.computer`) and does **not require** a self-hosted node.
- For now, you can safely continue to rely on existing Iroh infrastructure while using Iroh as an optional, advanced attestation method.

**Medium-term:**
- Running a **co-located Iroh node on your Lunanode VPS** is **technically feasible** and can improve sovereignty, observability, and resilience against external DHT outages.
- The added operational and security overhead is moderate but manageable, especially if you already run a PKARR homeserver and are comfortable with network services.

**Net recommendation:**
- **Do not treat a self-hosted Iroh node as mandatory** for Satnam’s core attestation guarantees.
- If your goal is stronger independence from third-party Iroh infrastructure and better control over discovery metrics, it is reasonable to **proceed with a co-located Iroh node**, limited initially to DHT participation and HTTP gateway functionality.
- Consider moving Iroh to **separate infrastructure** only if you later:
  - Operate it as a high-traffic public relay.
  - Use it for latency-sensitive or regulated workloads where isolation is crucial.

