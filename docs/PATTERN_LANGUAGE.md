# Pattern Language - Satnam.pub Capabilities Catalog

**Client-Friendly Reference for Self-Sovereign Identity Systems**

**Version:** 1.0  
**Date:** 2025-10-25  
**Audience:** Non-technical clients, peer developers, V4V service providers

---

## What is This Document?

This is a **menu of capabilities** available in the Satnam.pub reference implementation. Think of it as a catalog of building blocks you can mix and match to create a custom self-sovereign identity and payment system for your family, business, or peer group.

**Key Concepts:**

- **Self-Sovereign Identity** - You own your identity, not a corporation
- **Privacy-First** - No personal data stored, everything encrypted
- **Zero-Knowledge** - Even the server can't see your private keys
- **Nostr Protocol** - Decentralized social network and messaging
- **Lightning Network** - Instant Bitcoin payments

---

## Core Patterns (Always Included)

### 1. **Privacy-First Architecture**

**What it does:** Protects your personal information by never storing it in plain text.

**How it works:**

- All user data is hashed (scrambled) with unique salts
- Private keys are encrypted with your password
- Server can't read your messages or see your contacts
- Database uses Row-Level Security (only you can see your data)

**Why it matters:** Even if the database is hacked, your data is useless to attackers.

**Technical details:** PBKDF2-SHA512 password hashing, XChaCha20-Poly1305 encryption, per-user salts, RLS policies

---

### 2. **Zero-Knowledge Nsec Handling**

**What it does:** Your Nostr private key (nsec) is never stored unencrypted.

**How it works:**

- When you create an account, your nsec is encrypted with your password
- The encrypted nsec is stored in the database
- When you sign in, your password decrypts the nsec in memory
- The nsec is immediately cleared from memory after use

**Why it matters:** Even the server operator can't steal your identity.

**Technical details:** Noble V2 encryption, TextEncoder conversion to ArrayBuffer, immediate memory cleanup

---

### 3. **Central Event Publishing Service (CEPS)**

**What it does:** Single entry point for all Nostr operations (publishing events, sending messages, etc.).

**How it works:**

- All Nostr operations go through one service
- Handles relay selection, retries, and error handling
- Supports NIP-17 (private DMs), NIP-59 (sealed sender), NIP-04/44 (legacy encryption)
- Automatically discovers recipient relays (NIP-10050)

**Why it matters:** Consistent behavior, easier debugging, better privacy controls.

**Technical details:** `lib/central_event_publishing_service.ts`, relay batching, privacy layer, NIP-42 AUTH

---

### 4. **Dynamic Environment Variable Injection**

**What it does:** Automatically includes all feature flags in production builds.

**How it works:**

- `vite.config.js` has a helper function that scans for all `VITE_*` variables
- No need to manually add new variables to the config
- Prevents production white-screen errors from missing variables

**Why it matters:** Zero maintenance when adding new features.

**Technical details:** `getAllViteEnvVars()` helper, `process.env` injection via Vite `define`

---

## Feature Modules (Mix & Match)

### **Identity & Verification**

#### **NIP-05 Identity** (Included by default)

- **What:** Username@domain.com verification (like email, but for Nostr)
- **Example:** `alice@yourdomain.com`
- **Use case:** Easy-to-remember identity, domain-based trust
- **Feature flag:** Always enabled

#### **PKARR Attestation** (Optional)

- **What:** Decentralized identity verification using BitTorrent DHT
- **Example:** Prove you own a Nostr key without relying on DNS
- **Use case:** Censorship-resistant identity, no domain required
- **Feature flag:** `VITE_PKARR_ENABLED=true`

#### **Multi-Layered Identity Verification** (Optional)

- **What:** Five complementary verification methods that cross-reference each other for maximum resilience
- **How it works:**
  1. **Kind:0 Nostr Event** - Your profile metadata published to Nostr relays (name, NIP-05, avatar)
  2. **SimpleProof Timestamping** - Cryptographic proof-of-existence anchored to Bitcoin blockchain
  3. **PKARR Attestation** - Decentralized DNS records stored in BitTorrent DHT (censorship-resistant)
  4. **Iroh Document Sync** - Peer-to-peer identity document replication across devices
  5. **Physical Name Tag NFC** - NTAG424 DNA chip containing cryptographically signed identity attestation
- **Cross-Referencing:** Each method includes references to the others (e.g., Kind:0 event contains PKARR pubkey hash, NFC tag contains SimpleProof timestamp, PKARR record points to Iroh document)
- **Example Use Cases:**
  - Your Kind:0 event is censored by relays → PKARR provides fallback lookup
  - DNS is blocked by ISP → BitTorrent DHT provides decentralized resolution
  - Lost your phone → Tap NFC Name Tag to any device to recover identity
  - Offline peer verification → Scan NFC tag, verify SimpleProof timestamp, no internet required
- **Benefits:**
  - **Convenience:** NIP-05 username@domain.com for everyday use
  - **Resilience:** Multiple fallback methods if one fails
  - **Robustness:** Cryptographic proofs prevent impersonation
  - **Human-Readable:** Connect complex keypairs to simple usernames and Lightning addresses
- **Feature flag:** `VITE_HYBRID_IDENTITY_ENABLED=true`

---

### **Authentication Methods**

#### **NIP-07 Browser Extension** (Included by default)

- **What:** Sign in with Alby, nos2x, or other Nostr browser extensions
- **Example:** Click "Sign in with Nostr" → extension pops up → approve
- **Use case:** Easiest for desktop users, no password needed
- **Feature flag:** Always enabled

#### **Amber Mobile Signer** (Optional)

- **What:** Android app for signing Nostr events on mobile
- **Example:** Tap "Sign in" → Amber app opens → approve
- **Use case:** Mobile-first users, hardware wallet-like security
- **Feature flag:** `VITE_ENABLE_AMBER_SIGNING=true`

#### **WebAuthn/FIDO2** (Optional)

- **What:** Hardware security keys (YubiKey, Titan, Feitian)
- **Example:** Plug in YubiKey → tap button → signed in
- **Use case:** Enterprise security, biometric-free MFA
- **Feature flag:** `VITE_WEBAUTHN_ENABLED=true`

#### **NFC Physical MFA** (Optional)

- **What:** Tap NFC tag to sign in (NTAG424 DNA)
- **Example:** Tap phone to NFC card → signed in
- **Use case:** Physical access control, tap-to-pay integration
- **Feature flag:** `VITE_ENABLE_NFC_MFA=true`

---

### **Messaging & Communications**

#### **NIP-17 Private DMs** (Included by default)

- **What:** Gift-wrapped encrypted messages (most private)
- **Example:** Send a message that looks like random noise to relays
- **Use case:** Maximum privacy, sealed sender
- **Feature flag:** Always enabled

#### **NIP-59 Sealed Sender** (Included by default)

- **What:** Anonymous message routing (relay can't see sender)
- **Example:** Send a message without revealing your identity
- **Use case:** Whistleblowing, anonymous tips
- **Feature flag:** Always enabled

#### **Multimedia Messaging** (Optional)

- **What:** Send files, voice notes, short videos
- **Example:** Attach a photo to a DM
- **Use case:** Rich communication, not just text
- **Feature flag:** `VITE_BLOSSOM_UPLOAD_ENABLED=true`

---

### **Payments & Lightning**

#### **LNbits Integration** (Optional)

- **What:** Custodial Lightning wallet (easy setup)
- **Example:** Receive payments to `username@yourdomain.com`
- **Use case:** Beginners, low-maintenance
- **Feature flag:** `VITE_LNBITS_INTEGRATION_ENABLED=true`

#### **Phoenixd Integration** (Optional)

- **What:** Self-hosted Lightning node (full control)
- **Example:** Run your own node on a VPS
- **Use case:** Advanced users, maximum sovereignty
- **Feature flag:** Configured via `PHOENIXD_API_URL` env var

#### **LN Proxy Node** (Optional)

- **What:** Privacy-preserving Lightning Network proxy that sits between your wallet and the network
- **How it works:**
  - Routes payments through your own node to obscure payment graph analysis
  - Provides programmable payment logic (spending limits, approval workflows, time-based rules)
  - Enables advanced features like payment batching, fee optimization, and multi-path routing
- **Privacy Benefits:**
  - **Payment Graph Obfuscation:** Third parties can't easily trace your payment patterns
  - **IP Address Protection:** Your wallet's IP is hidden from the Lightning Network
  - **Channel Privacy:** Your channel balances and peers remain private
- **Programmability Benefits:**
  - **Spending Limits:** Set daily/weekly/monthly caps per user or category
  - **Approval Workflows:** Require guardian signatures for large payments (Family Federation)
  - **Time-Based Rules:** Allow certain payments only during business hours
  - **Fee Optimization:** Automatically route through lowest-fee paths
  - **Payment Batching:** Combine multiple small payments to reduce fees
- **Use case:** Privacy-conscious users, businesses with complex payment rules, families with spending controls
- **Feature flag:** Configured via `LN_PROXY_ENABLED` and `LN_PROXY_URL` env vars

#### **NWC (Nostr Wallet Connect)** (Optional)

- **What:** Remote wallet control via Nostr
- **Example:** Connect to Alby, Mutiny, or other NWC wallets
- **Use case:** Use existing wallet, no new setup
- **Feature flag:** `VITE_ENABLE_NWC_PROVIDER=true`

#### **Boltcard NFC (Physical Tap-to-Pay)** (Optional)

- **What:** NTAG424 DNA NFC cards/tags for contactless Lightning payments
- **How it works:**
  - Tap NFC card to phone/terminal → cryptographically signed payment request → instant Lightning payment
  - Card contains encrypted LNURL that generates unique payment requests per tap
  - No battery required, works offline (card-side), validates online (server-side)
- **Feature Sets:**
  - **Tap-to-Pay:** Point-of-sale payments, vending machines, access control
  - **Tap-to-Receive:** Merchant cards that generate invoices when tapped
  - **Tap-to-Authenticate:** Use as physical MFA token (see NFC Physical MFA above)
  - **Tap-to-Verify:** Offline identity verification via cryptographic signature
  - **Spending Limits:** Set per-tap, daily, or weekly limits on the card
  - **PIN Protection:** Optional PIN requirement for high-value transactions
  - **Multi-Currency:** Support for BTC, sats, fiat-denominated payments
- **Use Cases:**
  - **Families:** Kids' allowance cards with spending limits
  - **Businesses:** Employee expense cards with category restrictions
  - **Events:** Festival wristbands for cashless payments
  - **Gifts:** Preloaded gift cards with custom designs
- **Privacy:** Card doesn't store payment history; all transactions are Lightning Network payments (same privacy as regular LN)
- **Feature flag:** Enabled when LNbits is enabled

#### **Payment Automation** (Optional)

- **What:** Scheduled/recurring Lightning payments
- **Example:** Pay $10/month to a subscription
- **Use case:** Subscriptions, allowances, recurring bills
- **Feature flag:** `VITE_PAYMENT_AUTOMATION_ENABLED=true`

---

### **Family Federation & Trust**

#### **FROST Signing** (Optional)

- **What:** Threshold signatures (e.g., 2-of-3 guardians must approve)
- **Example:** Family wallet requires 2 parents to approve large payments
- **Use case:** Shared custody, multi-signature security
- **Feature flag:** `VITE_FROST_SIGNING_ENABLED=true`

#### **Guardian Approval** (Optional)

- **What:** Multi-signature transaction workflows
- **Example:** Child requests $50 → parents approve → payment sent
- **Use case:** Parental controls, corporate approvals
- **Feature flag:** `VITE_FAMILY_FEDERATION_ENABLED=true`

#### **Role Hierarchy** (Included by default)

- **What:** 5 roles: private → offspring → adult → steward → guardian
- **Example:** Offspring can request, adults can spend, guardians can approve
- **Use case:** Family governance, organizational structure
- **Feature flag:** Always enabled

#### **NIP-85 Trust Scores** (Optional)

- **What:** Proof-of-Personhood and reputation system
- **Example:** Earn trust by completing tasks, verified by peers
- **Use case:** Anti-spam, progressive feature unlocking
- **Feature flag:** `VITE_NIP85_TRUST_PROVIDER_ENABLED=true`

#### **Emergency Recovery** (Optional)

- **What:** Guardian-assisted key recovery
- **Example:** Lost your password? Guardians can help recover your account
- **Use case:** Family safety net, corporate key escrow
- **Feature flag:** Enabled when Family Federation is enabled

---

## Integration Points (External Services)

### **Nostr Relays**

- **What:** Servers that store and relay Nostr events
- **Default:** Public relays (relay.damus.io, nos.lol)
- **Self-hosted:** `wss://relay.yourdomain.com`
- **Configuration:** `NOSTR_RELAYS` env var

### **Lightning Backends**

- **Options:** LNbits, Phoenixd, Voltage, Breez, NWC, Alby
- **Default:** None (must choose one)
- **Configuration:** `LNBITS_BASE_URL`, `PHOENIXD_API_URL`, etc.
- **Optional Add-On:** LN Proxy Node for privacy and programmable payments
  - **Configuration:** `LN_PROXY_ENABLED=true`, `LN_PROXY_URL`
  - **Benefits:** Payment graph obfuscation, spending limits, approval workflows, fee optimization

### **Blossom Server** (Media Storage)

- **What:** Decentralized file storage for images/videos
- **Default:** nostr.build (public)
- **Self-hosted:** `blossom.yourdomain.com`
- **Configuration:** `VITE_BLOSSOM_PRIMARY_URL`

### **Supabase** (Database)

- **What:** PostgreSQL database with Auth + Storage + Realtime
- **Default:** None (must create project)
- **Configuration:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### **Netlify** (Hosting)

- **What:** Serverless functions + static site hosting
- **Default:** None (must create site)
- **Configuration:** Deploy via Git, set env vars in Netlify UI

---

## Deployment Model

### **Architecture**

```
┌─────────────────┐
│  Netlify CDN    │ ← Static site (React + Vite)
│  (Frontend)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Netlify Funcs   │ ← Serverless API (TypeScript ESM)
│ (Backend)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Supabase      │ ← Database + Auth + Storage
│  (PostgreSQL)   │
└─────────────────┘

External Services:
- Nostr Relays (public or self-hosted)
- Lightning Backend (LNbits, Phoenixd, NWC, Alby)
- LN Proxy Node (optional, for privacy + programmable payments)
- Blossom Server (media storage)
- BitTorrent DHT (PKARR decentralized identity)
- Iroh (peer-to-peer document sync)
- NFC Hardware (NTAG424 DNA Name Tags + Boltcards)
```

### **Hosting Costs** (Estimated)

- **Netlify:** Free tier (100GB bandwidth, 300 build minutes/month)
- **Supabase:** Free tier (500MB database, 1GB file storage, 2GB bandwidth)
- **LNbits:** Self-hosted on VPS ($5-10/month) or Voltage ($10-30/month)
- **Phoenixd:** Self-hosted on VPS ($10-20/month)
- **LN Proxy Node:** Self-hosted on VPS ($5-10/month, can share VPS with LNbits/Phoenixd)
- **Domain:** $10-15/year
- **NFC Hardware:** NTAG424 DNA tags ($3-8 each), Boltcards ($5-15 each)

**Total:** $0-60/month depending on usage and self-hosting choices
**One-Time Hardware:** $0-100 for NFC tags/cards (optional)

---

## Feature Flag Summary

| Feature                    | Flag                                | Default | Recommended For                           |
| -------------------------- | ----------------------------------- | ------- | ----------------------------------------- |
| PKARR Attestation          | `VITE_PKARR_ENABLED`                | false   | Advanced users, censorship-resistance     |
| Multi-Layered Verification | `VITE_HYBRID_IDENTITY_ENABLED`      | false   | Production, maximum resilience            |
| SimpleProof Timestamping   | `VITE_SIMPLEPROOF_ENABLED`          | false   | Identity verification, proof-of-existence |
| Amber Signer               | `VITE_ENABLE_AMBER_SIGNING`         | false   | Mobile users                              |
| WebAuthn/FIDO2             | `VITE_WEBAUTHN_ENABLED`             | false   | Enterprise                                |
| NFC Physical MFA           | `VITE_ENABLE_NFC_MFA`               | false   | Physical access, tap-to-authenticate      |
| LNbits                     | `VITE_LNBITS_INTEGRATION_ENABLED`   | false   | Beginners                                 |
| Phoenixd                   | `PHOENIXD_API_URL` (env var)        | N/A     | Advanced users, self-sovereignty          |
| LN Proxy Node              | `LN_PROXY_ENABLED`                  | false   | Privacy, programmable payments            |
| NWC                        | `VITE_ENABLE_NWC_PROVIDER`          | false   | Existing wallets                          |
| Boltcard NFC (Tap-to-Pay)  | Enabled with LNbits                 | false   | Physical payments, families, businesses   |
| Payment Automation         | `VITE_PAYMENT_AUTOMATION_ENABLED`   | false   | Subscriptions                             |
| FROST Signing              | `VITE_FROST_SIGNING_ENABLED`        | false   | Families, multi-sig                       |
| Family Federation          | `VITE_FAMILY_FEDERATION_ENABLED`    | true    | Families                                  |
| NIP-85 Trust               | `VITE_NIP85_TRUST_PROVIDER_ENABLED` | false   | Communities                               |
| Blossom Upload             | `VITE_BLOSSOM_UPLOAD_ENABLED`       | false   | Media sharing                             |

---

## Use Case Examples

### **Family Use Case**

**Enabled Features:**

- **Identity:** NIP-05 Identity (`alice@family.com`), Multi-Layered Verification (Kind:0 + SimpleProof + PKARR + NFC Name Tags)
- **Authentication:** NFC Physical MFA (tap Name Tag to sign in)
- **Messaging:** NIP-17 Private DMs
- **Payments:** LNbits Integration (family wallet), Boltcard NFC (kids' allowance cards with spending limits)
- **Governance:** FROST Signing (2-of-3 parents), Guardian Approval (allowances), Role Hierarchy (parents = guardians, kids = offspring)
- **Privacy:** LN Proxy Node (obscure kids' payment patterns, enforce spending rules)

**Example Workflow:**

1. Parents create family federation with 2-of-3 FROST signing
2. Each family member gets NFC Name Tag for tap-to-authenticate
3. Kids get Boltcard NFC allowance cards with $20/week limit
4. Parents approve large purchases via Guardian Approval workflow
5. All payments routed through LN Proxy for privacy and spending controls

**Estimated Setup Time:** 5 hours
**Monthly Cost:** $15-25 (VPS for LNbits + LN Proxy)

---

### **Business Use Case**

**Enabled Features:**

- **Identity:** NIP-05 Identity (`employee@company.com`), Multi-Layered Verification (Kind:0 + SimpleProof + PKARR + Iroh sync)
- **Authentication:** WebAuthn/FIDO2 (YubiKey required), NFC Physical MFA (employee badges)
- **Payments:** Phoenixd Integration (self-hosted node), LN Proxy Node (programmable payment rules), Payment Automation (payroll)
- **Governance:** NIP-85 Trust (employee reputation), Role Hierarchy (employees = adults, managers = stewards, CEO = guardian)
- **Privacy:** LN Proxy Node (payment graph obfuscation, IP protection, fee optimization)

**Example Workflow:**

1. Employees authenticate with YubiKey + NFC badge tap
2. Payroll runs automatically via Payment Automation (monthly recurring payments)
3. Expense payments require manager approval (steward role)
4. All payments routed through LN Proxy with business rules (e.g., no payments outside business hours)
5. Employee reputation tracked via NIP-85 Trust scores

**Estimated Setup Time:** 10 hours
**Monthly Cost:** $40-60 (VPS for Phoenixd + LN Proxy + Supabase paid tier)

---

### **Peer Group Use Case**

**Enabled Features:**

- **Identity:** PKARR Attestation (no domain required), Multi-Layered Verification (Kind:0 + PKARR + SimpleProof)
- **Authentication:** NIP-07 Browser Extension (Alby, nos2x)
- **Messaging:** NIP-17 Private DMs, NIP-59 Sealed Sender (anonymous tips)
- **Payments:** NWC (use existing wallets like Alby, Mutiny)
- **Trust:** NIP-85 Trust (peer reputation)

**Example Workflow:**

1. Peers create accounts using PKARR (no domain needed, censorship-resistant)
2. Sign in with NIP-07 browser extension (no password needed)
3. Send anonymous tips via NIP-59 Sealed Sender
4. Pay each other using existing NWC wallets (no new setup)
5. Build reputation via NIP-85 Trust scores

**Estimated Setup Time:** 2 hours
**Monthly Cost:** $0 (free tiers only)

---

## Next Steps

1. **Review this catalog** with your team/family/group
2. **Choose features** that match your use case
3. **Estimate costs** based on hosting choices
4. **Contact a V4V developer** to customize and deploy

**Questions?** See `docs/WHITE_LABEL_REUSABILITY_ASSESSMENT.md` for technical details.
