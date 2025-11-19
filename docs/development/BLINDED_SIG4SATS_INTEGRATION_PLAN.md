# Blinded Authentication × Sig4Sats Integration Planning

This document explores how Satnam's blinded-auth architecture and the Sig4Sats Cashu↔Nostr adaptor-signature protocol can be combined.

For avatar-specific business, family office, and AI-agent use cases built on these features, see `BLINDED_SIG4SATS_AVATAR_USE_CASES.md`.

## 1. Synergy Analysis (High-Level)

- **Shared primitives**: Both systems hinge on Schnorr-style signatures over Nostr events. Satnam already verifies Nostr signatures for auth; Sig4Sats adds adaptor signatures that cryptographically bind a signature to a payment.
- **Capability vs. conditional payment**: Blinded auth issues unlinkable capability tokens for privileged Lightning operations; Sig4Sats makes Nostr signatures _conditional_ on Cashu payments. Together, we get _paid, unlinkable capabilities_.
- **Decoupled trust domains**: Satnam's blind issuer knows entitlements but not usage; LNbits/LNURL know usage but not identity. Sig4Sats adds a third domain (Cashu mints) that sees payments but not Nostr identity mapping inside Satnam.
- **Payment-as-proof-of-commitment**: Sig4Sats can turn Cashu payments into verifiable Nostr signatures on specific events (entitlement grants, guardian approvals, attestations), which then drive blind token issuance or consumption.
- **Redundant crypto reduction**: Where Satnam would otherwise separately (1) verify a Nostr signature and (2) account for an off-chain payment, Sig4Sats can collapse this into one atomic adaptor-signature flow.

## 2. Combined-Protocol Feature Ideas (Ranked)

---

**1. Cashu-Backed Blinded Lightning Entitlement Tokens**

- **What it enables**: Users can privately upgrade to Satnam Lightning features (e.g., premium LNURL limits, extra addresses, high-privacy routes) using Cashu, with entitlements represented as blinded capability tokens instead of account flags.
- **How it works**:
  1. User chooses a premium Lightning feature; Satnam creates a Nostr entitlement event template (e.g., "grant feature X to hashed DUID Y").
  2. Satnam exposes a Sig4Sats adaptor offer that binds a Cashu payment to a valid signature on that entitlement event.
  3. User pays via Cashu; Sig4Sats completes the adaptor signature, yielding a signed entitlement event.
  4. A Netlify blind-issuer function verifies the entitlement event and blind-signs one or more blinded tokens for `service_id = "lightning-feature-X"`.
  5. Frontend stores unblinded tokens (E2EE) and presents them when calling `lnbits-proxy` for the relevant feature.
- **Unique value proposition**: Premium Lightning features become _cash-and-carry capabilities_—no long-lived subscription rows or cleartext linkage between who paid and which LN address they use. Without Sig4Sats you must trust Satnam to mint tokens after payment; without blinded auth, entitlements are linkable account metadata.
- **Privacy considerations**: Cashu mints see only ecash transfers; Satnam only sees a Nostr entitlement event and a blinded token request keyed to hashed identifiers (DUIDs). LNbits and LNURL endpoints see only capability tokens and technical wallet data. No single actor can correlate NIP-05, npub, Lightning Address, and payment history.
- **Technical feasibility**: Architecturally compatible: implemented as new Netlify functions (`sig4sats-entitlement-offer`, `blinded-auth-issue`) and Supabase tables (`blinded_service_entitlements`, `blinded_tokens_spent`). Uses existing Web Crypto/Schnorr tooling plus Cashu client libs. **Complexity: Medium–High** (new crypto flows + Cashu integration, but largely orthogonal to existing LNbits stack).
- **User value**: Mainly benefits **adult/steward/guardian** roles who want premium Lightning capabilities without KYC-like linkage. Offspring can inherit features via family policies without knowing or exposing who paid.
- **Challenges**: Needs robust Cashu mint selection and UX, audited adaptor-signature implementation, and careful entitlement semantics (refunds, expirations, multi-device backup of tokens).

---

**2. Guardian Recovery Bonds via Sig4Sats-Backed Blinded Tokens**

- **What it enables**: Guardians can stake economic skin-in-the-game (via Cashu) when approving sensitive recovery actions (key rotation, account takeover recovery), with recovery capabilities represented as blinded tokens that are only issued once N-of-M guardian approvals _and_ associated payments clear.
- **How it works**:
  1. A recovery request creates a Nostr recovery event describing the action (new npub, affected DUIDs, federation scope) and the required guardian set.
  2. Each guardian receives a Sig4Sats offer tying a small Cashu bond to their signature on that recovery event.
  3. When enough guardians sign (via Sig4Sats), Satnam aggregates the signed recovery event and verifies the Cashu-side scalars.
  4. A blind-issuer function then issues a one-time **recovery capability token** to the requesting user/federation.
  5. The user spends this token in `auth-unified`/`identity-forge` flows to perform the actual recovery operations.
- **Unique value proposition**: Recovery becomes an _economically accountable, privacy-preserving_ N-of-M process: guardians prove they approved (by signing) and had funds at risk (bond), while the actual recovery operations remain gated by unlinkable blinded tokens rather than manual admin toggles.
- **Privacy considerations**: Guardian npubs and roles are already part of federation metadata; Cashu bonds happen off-ledger. The blinded recovery token is independent of which guardians participated and reveals only that policy-threshold approval occurred. Logs should record only hashed recovery IDs and token digests.
- **Technical feasibility**: Fits Netlify Functions + Supabase: recovery requests live in privacy-first tables; Sig4Sats runs as a separate coordinator function; blind issuance plugs into existing `SecureSessionManager` and key-rotation code. **Complexity: High** due to multi-party coordination, error handling, and UX for failed/partial approvals.
- **User value**: Strongest value for **guardian/steward** roles in family federations, providing auditable but privacy-preserving recovery; **private/adult** users gain clearer, safer emergency flows.
- **Challenges**: Designing incentive-compatible bond sizes; handling disputes/refunds; ensuring guardian devices can safely run Sig4Sats flows; making multi-step recovery understandable to non-expert users.

---

**3. Blinded Allowance Tokens for Offspring Spending (Cashu-Funded)**

- **What it enables**: Guardians fund child allowances using Cashu; those payments are converted into blinded spending tokens that offspring can redeem for Lightning payments via LNbits, under role-based limits and without directly tying every payment to the guardian's identity or funding method.
- **How it works**:
  1. Guardian initiates a "fund allowance" action; Satnam prepares a Nostr allowance event (amount, cadence, constraints, child DUID).
  2. Guardian completes a Sig4Sats swap where Cashu ecash is paid in exchange for a valid signature on this allowance event.
  3. Satnam verifies the event and issues a batch of **blinded allowance tokens** to the offspring's device(s), each representing a spendable allowance chunk.
  4. When an offspring sends sats (via LNbits wallet through `lnbits-proxy`), their client consumes a token alongside the normal authenticated request; LNbits sees only a capability token and wallet ID.
  5. Spent tokens are tracked in `blinded_tokens_spent`, with high-level aggregates available to guardians (e.g., "3 of 10 weekly tokens spent"), but without per-merchant linkage.
- **Unique value proposition**: Family allowances become _tokenized capabilities_ that sit between guardians' funding sources and children's spending, giving fine-grained control and auditability without building a surveillance ledger of every payment.
- **Privacy considerations**: Guardian–offspring relationships already exist in `family_members`; the extra risk is correlating specific merchants or times. Using blinded tokens, LNbits/proxy endpoints do not learn guardian identity, and Supabase stores only hashed aggregates. Cashu provides off-ledger funding.
- **Technical feasibility**: Extends existing LNbits + family banking flows with additional token checks and entitlement tables; Sig4Sats is used only at funding time. **Complexity: Medium** (multi-role UX + Cashu integration, but no new critical-path auth changes).
- **User value**: Directly targets **offspring/adult/guardian** interactions: guardians set budgets, offspring get controlled autonomy, stewards get aggregate visibility without raw transaction histories.
- **Challenges**: Ensuring guardians understand allowance semantics; managing expired/unredeemed tokens; safely syncing allowance tokens across multiple offspring devices via E2EE backup.

---

**4. Paid, Unlinkable Attestation Credits for Satnam Attestation Engine**

- **What it enables**: Users or federations can pay (via Cashu) for higher-priority or extended attestation services (e.g., more frequent OpenTimestamps anchoring, longer retention), with Sig4Sats binding each payment to an attestation-policy event and blinded tokens representing consumable "attestation credits".
- **How it works**:
  1. Satnam defines a Nostr attestation-policy event (e.g., "30 days of priority anchoring for DUID Y" or "N attestations for federation Z").
  2. User/federation completes a Sig4Sats swap exchanging Cashu for a signature on this policy event.
  3. A blind-issuer function consumes the signed policy event and mints a set of **attestation credit tokens**.
  4. When the Attestation Engine processes operations (timestamps, archival), it consumes one token per high-cost action via a shared validator (`validateBlindedToken("attestation-premium", token)`).
  5. Logs record only token digests and policy IDs, not payer identity.
- **Unique value proposition**: Converts attestation resource usage into private, pre-paid credits, avoiding account-level metering that could reveal sensitive patterns of key rotation, recovery, or federation changes.
- **Privacy considerations**: Attestations are already privacy-sensitive; coupling them with cleartext billing data would be dangerous. Here, Cashu hides payments, Sig4Sats proves which policy was paid for, and blinded tokens hide which concrete attestations consumed which credits.
- **Technical feasibility**: Attestation flows already interact with Supabase and Netlify; adding token checks and a Sig4Sats-based purchase step is conceptually straightforward. **Complexity: Medium–High** (needs robust metering and failure semantics but no changes to LNbits).
- **User value**: Most relevant for **steward/guardian** roles managing many identities/federations or heavy attestation usage; also valuable for privacy-conscious **private** users who want stronger audit trails without account-style billing.
- **Challenges**: Designing understandable UX around "credits"; ensuring credits cannot be double-spent across concurrent attestation jobs; handling long-lived policies and token expiration cleanly.

---

**5. Blinded Sig4Sats Relay Tickets for High-Volume Messaging**

- **What it enables**: Heavy Nostr messaging or contact-management operations (group messaging, high-rate NIP-58/59 flows) can be throttled using prepaid, blinded "relay tickets" purchased via Sig4Sats and consumed by Satnam's messaging-related endpoints.
- **How it works**:
  1. User or federation buys a bundle of messaging capacity by completing a Sig4Sats Cashu swap tied to a Nostr "relay-ticket policy" event (rate limits, duration).
  2. Blind issuer verifies the signed policy event and issues a batch of **messaging relay tokens**.
  3. When Satnam's unified messaging services (Netlify Functions + Nostr relays) handle high-volume operations, the client attaches a token; backend validates and marks it spent.
  4. Standard, low-volume use remains free and tokenless; only advanced/bursty workloads need tickets.
- **Unique value proposition**: Provides DoS resistance and resource-fairness for Satnam-hosted messaging without sacrificing pseudonymity: capacity is tied to tokens, not to stable, billable identities.
- **Privacy considerations**: Relays see tokens and message metadata but do not learn which Cashu wallet funded them; Supabase only stores token digests and aggregate usage. Care is needed to avoid logging IPs or stable identifiers that would undercut unlinkability.
- **Technical feasibility**: Requires Satnam to mediate some Nostr flows via its own infrastructure (already true for OTP and contact services) and to add token checks to those Netlify Functions. **Complexity: High** due to interaction with external relays and rate limiting logic.
- **User value**: Benefits **stewards/guardians** running large federations or high-volume groups, and advanced **adult/private** users who need reliable messaging under load.
- **Challenges**: Coordinating with third-party relays; defining fair, abuse-resistant ticket policies; avoiding UX where basic users feel "paywalled" out of normal messaging.

---

**6. Multi-Party Family Goal Contracts with Cashu Escrowed Rewards**

- **What it enables**: Families can create shared "goal contracts" (e.g., education milestones, chores) where guardians escrow Cashu rewards that are only released when specific Nostr events—signed by offspring and optionally stewards—are observed, and successful completion mints blinded reward tokens or triggers LNbits payouts.
- **How it works**:
  1. Guardians define a goal as a Nostr contract event (participants, conditions, reward structure) and escrow Cashu via a Sig4Sats swap tied to that event.
  2. Offspring (and/or stewards) later publish and sign completion events referencing the contract.
  3. Sig4Sats flows complete, revealing scalars that allow claiming the Cashu reward or triggering LNbits transfers.
  4. Optionally, completion also causes a blind issuer to mint **reward capability tokens** that unlock certain Satnam features (e.g., higher allowances, new federation roles).
- **Unique value proposition**: Turns family goals into cryptographically enforced, privacy-preserving micro-contracts, blending Cashu-based incentive payments with Satnam's role/entitlement system. Neither Sig4Sats nor blinded auth alone can tie "goal achieved" to both payment and feature unlock in a single atomic story.
- **Privacy considerations**: Contract details live in Nostr events that can be kept within private relays; Cashu hides funding; blinded tokens hide which specific goals unlocked which capabilities. Care is needed around how much goal metadata is stored in Supabase vs. encrypted client-side.
- **Technical feasibility**: Conceptually compatible but touches many systems (Nostr relays, Cashu, blind issuer, LNbits, family federation UX). **Complexity: Very High** and therefore more speculative.
- **User value**: Targets **offspring/adult/guardian** dynamics, aligning incentives while preserving autonomy and privacy.
- **Challenges**: Complex UX; risk of over-financializing family interactions; high implementation surface area and need for thorough threat modeling.
