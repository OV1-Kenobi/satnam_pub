# LNbits + Cashu Enhancement Implementation Plan

**Version:** 2.0 (Draft)
**Classification:** Internal Technical Specification
**Status:** Pending Review
**Last Updated:** 2026-01-05

## 1. Executive Summary

This document specifies the implementation of a **progressive enhancement model** for LNbits integration within Satnam, with a **parallel Cashu Address workstream** for offline-capable eCash identity. The plan enables three tiers of user experience from beginner-friendly unified gateway to full sovereignty, while adding persistent Cashu addressing for offline payments and family allowances.

**Key Outcomes:**

- Unified identity format: `alice@my.satnam.pub` resolves to NIP-05, Lightning Address, AND Cashu Address
- Auto-provisioned wallets (Lightning + Cashu) on identity creation
- Offline-first payment capability via Cashu bearer instruments
- Progressive sovereignty from managed to self-hosted

## 2. Infrastructure Context

### 2.1 Current VPS Infrastructure

Satnam operates a **remote VPS infrastructure** for payment services:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ SATNAM VPS INFRASTRUCTURE (Remote Hosted)                              │
├─────────────────────────────────────────────────────────────────────────┤
│ PhoenixD                                                                │
│ ├── Lightning node backend                                              │
│ ├── Provides channel management & liquidity                             │
│ └── URL: Configured via PHOENIXD_NODE_URL                               │
├─────────────────────────────────────────────────────────────────────────┤
│ LNbits                                                                  │
│ ├── Wallet management layer                                             │
│ ├── NWC Provider extension enabled                                      │
│ ├── Boltcard extension for NFC payments                                 │
│ └── URL: Configured via VOLTAGE_LNBITS_URL                              │
├─────────────────────────────────────────────────────────────────────────┤
│ Cashu Mint (PLANNED)                                                    │
│ ├── eCash mint for bearer instruments                                   │
│ ├── Lightning backend via PhoenixD/LNbits                               │
│ ├── NUTS-00 through NUTS-12 compliance                                  │
│ └── URL: https://mint.my.satnam.pub (planned)                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Domain Architecture

All user-facing identifiers use the `my.satnam.pub` subdomain:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ UNIFIED IDENTITY: alice@my.satnam.pub                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ NIP-05 (Nostr Identity)                                                 │
│ └── GET https://my.satnam.pub/.well-known/nostr.json?name=alice         │
│     → { "names": { "alice": "npub1..." } }                              │
├─────────────────────────────────────────────────────────────────────────┤
│ Lightning Address (LNURL-pay)                                           │
│ └── GET https://my.satnam.pub/.well-known/lnurlp/alice                  │
│     → LNURL-pay metadata (routes to LNbits wallet)                      │
├─────────────────────────────────────────────────────────────────────────┤
│ Cashu Address (eCash - NEW)                                             │
│ └── GET https://my.satnam.pub/.well-known/cashu?name=alice              │
│     → { "cashu_addresses": {...}, "mints": [...] }                      │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. Architecture Overview

### 3.1 Three-Tier Progressive Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│ TIER 1 (BEGINNER): Unified Gateway - Single Credential Experience      │
│ ├── Satnam creates Nostr + LNbits + Cashu accounts automatically        │
│ ├── User sees single identity: alice@my.satnam.pub                      │
│ ├── Keys separated under the hood (security preserved)                 │
│ ├── Lightning + Cashu addresses auto-provisioned                        │
│ └── Target: Undocumented displaced, first-time Bitcoin/Nostr users     │
├─────────────────────────────────────────────────────────────────────────┤
│ TIER 2 (INTERMEDIATE): NWC-Connected Identity                          │
│ ├── User brings own Nostr nsec (NIP-07 or import)                      │
│ ├── Connects via NWC to Satnam's LNbits OR external wallet             │
│ ├── Can configure custom Cashu mint preferences                         │
│ ├── Can switch LNbits/wallet providers anytime                         │
│ └── Target: Privacy-conscious users, existing Nostr users              │
├─────────────────────────────────────────────────────────────────────────┤
│ TIER 3 (ADVANCED): Full Self-Hosted Sovereignty                        │
│ ├── User self-hosts entire stack (LNbits + Cashu Mint + relay)          │
│ ├── Satnam is just UI layer connecting via NWC                         │
│ ├── Self-operated Cashu mint for family federation                      │
│ ├── All data on user's infrastructure                                  │
│ └── Target: Private family offices, sovereignty maximalists            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Integration with Existing Architecture

This plan builds on existing infrastructure:

- **Identity Layer:** IdentityForge.tsx, AuthIntegration.tsx, NIP-07/NIP-05 auth flows
- **Wallet Layer:** LNBitsIntegrationPanel.tsx, lnbits-proxy.ts, provisionWallet(), createLightningAddress()
- **NWC Layer:** useNWCWallet.ts, NWCManagementPanel.tsx, nostr-wallet-connect.js API
- **Cashu Layer:** api/individual/cashu/wallet.js, cross-mint-cashu-manager.ts, cashu-mint-schema.sql
- **Onboarding:** high_volume_onboarding_plan.md, PhysicalPeerOnboardingModal architecture

### 3.3 Cashu Client-Side Wallet Architecture

This section defines the **client-side Cashu wallet architecture** that complements the LNbits progressive enhancement model. It uses a browser-compatible TypeScript implementation with role-based spending controls aligned with the Master Context hierarchy.

#### 3.3.1 Library Selection and Rationale

- **Primary library:** `@cashu/cashu-ts` (cashubtc/cashu-ts)
- **Compatibility:** Pure TypeScript, ESM, browser-friendly, Vite-compatible (no Node.js-only dependencies)
- **Protocol coverage:** NUT-00 through NUT-25 (including NUT-11 P2PK, NUT-18, NUT-23)
- **API design:** `Wallet` + `wallet.ops.*` fluent builder, event subscriptions (`wallet.on.*`), deterministic counters with persistence

This library is preferred over forking Svelte/Angular reference wallets (e.g. cashu-brrr, orchard) because it:

- Integrates cleanly into the existing React + Vite frontend
- Keeps bundle size manageable while providing full protocol support
- Encapsulates mint/melt/send/receive logic behind a stable, well-documented API

#### 3.3.2 Integration Points with Satnam Infrastructure

The Cashu client wallet integrates with existing Satnam layers as follows:

- **Vite build:** Direct ESM import of `@cashu/cashu-ts` in browser code (no Netlify Function usage)
- **Identity layer:** Uses `user_duid` and Master Context roles to derive spending limits and allowance behavior
- **Wallet layer:** Exposed through `UnifiedWalletService` as an additional balance source beside LNbits/NWC
- **NWC layer:** Cashu _melt_ operations fund Lightning invoices via existing NWC or LNbits flows
- **Storage layer:** Uses `ClientSessionVault` (encrypted storage) plus database tables (`wallet_links`, `cashu_address_registry`, `cashu_mint_schema.sql`) for durable mapping and preferences

#### 3.3.3 SatnamCashuWalletService

**New Service:** `src/services/cashu-wallet-service.ts`

High-level responsibilities:

- Instantiate a `Wallet` from `@cashu/cashu-ts` for the user's default mint
- Load and persist keysets, keys, and deterministic counters
- Provide high-level methods for mint, melt, send, receive and balance queries
- Enforce Master Context role-based spending rules for Cashu operations

Key API surface (representative, not exhaustive):

```typescript
class SatnamCashuWalletService {
  async initialize(): Promise<void>;
  async getBalance(): Promise<number>;
  async mintTokens(amountSats: number): Promise<MintQuoteAndProofs>;
  async receiveToken(
    token: string,
    opts?: { privkey?: string }
  ): Promise<Proof[]>;
  async sendWithLimits(
    amountSats: number,
    opts: { role: MasterContextRole; recipientPubkey?: string }
  ): Promise<{ token: string }>;
  async meltToLightning(invoice: string): Promise<MeltResult>;
}
```

`SatnamCashuWalletService` is consumed by `UnifiedWalletService` to:

- Include Cashu balances in the unified wallet view
- Decide whether to route small payments through Cashu (melt) or Lightning directly
- Implement offspring allowances and budgets using Cashu bearer tokens

#### 3.3.4 Token Storage and Security Patterns

Token security uses a **two-layer approach**:

1. **Client-side encrypted storage (preferred):**

   - Extend `ClientSessionVault` with a `CashuProofStorage` structure (encrypted AES-256-GCM payloads)
   - Store proofs, keysets and deterministic counters locally in the browser
   - Never persist raw secrets or tokens unencrypted

2. **Server-side mapping and policy:**
   - `wallet_links` tracks the user's default mint URL and tier configuration
   - `cashu_address_registry` tracks per-user Cashu addresses and spending limits

Deterministic counter updates from `@cashu/cashu-ts` are persisted using event callbacks:

```typescript
wallet.on.countersReserved(async ({ keysetId, next }) => {
  await clientSessionVault.updateCashuCounter(keysetId, next);
});
```

#### 3.3.5 Role-Based P2PK Allowances

For **offspring allowances**, the system uses NUT-11 P2PK locking:

- Allowance tokens are locked to the **Adult role "parent" pubkey** that created the offspring account
- The parent can always reclaim or refill allowances by unlocking with their private key
- Cashu allowances respect the same budgets as NWC/LNbits (`defaultBudgets.offspring`)
- P2PK is **not** tied to arbitrary guardians; it is strictly bound to the creating Adult parent for clarity and safety

These rules are enforced inside `SatnamCashuWalletService.sendWithLimits` and related helpers, which check the caller's role and parent relationship before issuing or accepting allowance tokens.

## 4. Tier 1: Beginner - Unified Gateway Implementation

### 4.1 User Flow

```
User enters Satnam → Creates Nostr identity (npub) →
LNbits wallet auto-provisioned → Lightning Address auto-assigned →
Cashu Address auto-created → NWC auto-configured → Single dashboard view

Result: alice@my.satnam.pub works for:
  • NIP-05 verification
  • Lightning payments (LNURL-pay)
  • Cashu token delivery (offline payments)
```

### 4.2 Implementation Requirements

#### 4.2.1 Auto-Provisioning on Identity Creation

**Location:** Extend `src/components/IdentityForge.tsx` registration flow

```typescript
// After successful Nostr identity creation in handleForge():
async function autoProvisionUnifiedWallet(
  npub: string,
  nip05: string // e.g., "alice@my.satnam.pub"
): Promise<UnifiedWalletResult> {
  const username = nip05.split("@")[0]; // "alice"

  // 1. Provision LNbits wallet (existing: provisionWallet())
  const walletResult = await provisionWallet();
  if (!walletResult.success) throw new Error(walletResult.error);

  // 2. Create Lightning Address (existing: createLightningAddress())
  const lnAddressResult = await createLightningAddress({
    nip05Handle: username,
  });
  // Result: alice@my.satnam.pub (Lightning)

  // 3. Create Cashu Address (NEW: createCashuAddress())
  const cashuResult = await createCashuAddress({
    username,
    addressTypes: ["primary"],
    mintUrl: clientConfig.cashu?.defaultMint || "https://mint.my.satnam.pub",
    userRole: userRole, // For allowance limits on offspring
  });
  // Result: cashu://alice@my.satnam.pub

  // 4. Auto-configure NWC connection (new: autoConfigureNWC())
  const nwcResult = await autoConfigureNWC({
    walletId: walletResult.data.walletId,
    permissions: ["get_balance", "make_invoice", "pay_invoice"],
    budgetSats: null, // Unlimited for adults
  });

  // 5. Store mapping in wallet_links table
  await linkWalletToIdentity(
    npub,
    walletResult.data.walletId,
    nwcResult.connectionId,
    cashuResult.primaryAddress
  );

  return {
    walletId,
    lightningAddress: `${username}@my.satnam.pub`,
    cashuAddress: `cashu://${username}@my.satnam.pub`,
    nwcConfigured: true,
  };
}
```

#### 4.2.2 Unified Dashboard Component

**New Component:** `src/components/wallet/UnifiedWalletDashboard.tsx`

Purpose: Present a single view combining Nostr identity + Lightning wallet + Cashu balance.

Key features:

- Combined balance display (Lightning + Cashu)
- Send/Receive Lightning payments
- Cashu token mint/melt operations
- Transaction history (both Lightning and Cashu)
- Unified address display: `alice@my.satnam.pub`
- QR code for receiving (Lightning or Cashu)
- Offline token generation for Cashu

#### 4.2.3 Database Schema Extensions

```sql
-- New table: wallet_links (links identity to LNbits wallet + Cashu)
CREATE TABLE IF NOT EXISTS wallet_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_duid TEXT NOT NULL REFERENCES user_identities(user_duid) ON DELETE CASCADE,

  -- LNbits integration
  lnbits_user_id TEXT NOT NULL,
  lnbits_wallet_id TEXT NOT NULL,
  nwc_connection_id TEXT,
  lightning_address TEXT,  -- alice@my.satnam.pub

  -- Cashu integration (NEW)
  cashu_addresses JSONB DEFAULT '{}',  -- { primary, offline, emergency, allowance }
  default_mint_url TEXT DEFAULT 'https://mint.my.satnam.pub',

  -- Tier configuration
  tier INTEGER DEFAULT 1 CHECK (tier IN (1, 2, 3)),
  provider TEXT DEFAULT 'satnam' CHECK (provider IN ('satnam', 'external', 'self-hosted')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_duid)
);

-- Cashu address types for structured access (supports multiple addresses per user)
CREATE TABLE IF NOT EXISTS cashu_address_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_duid TEXT NOT NULL REFERENCES user_identities(user_duid) ON DELETE CASCADE,
  address_type TEXT NOT NULL CHECK (address_type IN ('primary', 'offline', 'emergency', 'allowance', 'custom')),
  cashu_uri TEXT NOT NULL,  -- cashu://alice@my.satnam.pub
  mint_url TEXT NOT NULL,   -- https://mint.my.satnam.pub

  -- Spending controls (for offspring allowance addresses)
  spending_limit_sats INTEGER,
  daily_budget_sats INTEGER,
  requires_guardian_approval BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_duid, address_type)
);

-- Enable RLS
ALTER TABLE wallet_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashu_address_registry ENABLE ROW LEVEL SECURITY;
```

### 4.3 Feature Flags

```typescript
// env.client.ts additions
VITE_TIER1_AUTO_PROVISION: boolean; // Enable auto-provisioning
VITE_TIER1_UNIFIED_DASHBOARD: boolean; // Show unified view vs separate panels
VITE_TIER1_DEFAULT_BUDGET_SATS: number; // Default spending limit for offspring
VITE_CASHU_ADDRESS_ENABLED: boolean; // Enable Cashu Address creation
VITE_CASHU_MINT_URL: string; // Default: https://mint.my.satnam.pub
```

## 5. Tier 2: Intermediate - NWC-Connected Identity

### 5.1 User Flow

```
User imports Nostr identity (NIP-07 or nsec) →
Chooses wallet connection method:
  Option A: Connect to Satnam's LNbits via NWC
  Option B: Connect external NWC-compatible wallet
  Option C: Configure custom Cashu mint preferences
→ Unified operations via NWC protocol
→ Cashu Address still resolves to Satnam mint or custom mint
```

### 5.2 Implementation Requirements

#### 5.2.1 Wallet Connection Selector

**New Component:** `src/components/wallet/WalletConnectionSelector.tsx`

```typescript
interface WalletConnectionOption {
  id: "satnam_lnbits" | "external_nwc" | "bring_own";
  label: string;
  description: string;
  requiresNWCUri: boolean;
  cashuMintOption: "satnam" | "custom" | "none";
}

const options: WalletConnectionOption[] = [
  {
    id: "satnam_lnbits",
    label: "Use Satnam Wallet",
    description: "Quick setup - we manage your Lightning + Cashu wallet",
    requiresNWCUri: false,
    cashuMintOption: "satnam",
  },
  {
    id: "external_nwc",
    label: "Connect External Wallet (NWC)",
    description: "Use your own wallet - paste NWC connection string",
    requiresNWCUri: true,
    cashuMintOption: "custom", // Can configure preferred mint
  },
  {
    id: "bring_own",
    label: "Self-Hosted (Advanced)",
    description: "Connect your own LNbits/Cashu Mint via NWC",
    requiresNWCUri: true,
    cashuMintOption: "custom",
  },
];
```

#### 5.2.2 External NWC Connection Flow

**Location:** Extend existing `src/hooks/useNWCWallet.ts`

Add method for connecting external wallets with validation:

```typescript
async function connectExternalWallet(
  nwcUri: string,
  cashuMintUrl?: string // Optional custom Cashu mint
): Promise<ConnectionResult> {
  // 1. Validate NWC URI format
  // 2. Test connection (get_balance)
  // 3. Store encrypted connection (existing pattern)
  // 4. Update wallet_links with provider='external'
  // 5. Update cashu mint preference if provided
}
```

#### 5.2.3 Wallet Portability

Users can disconnect from Satnam's LNbits and reconnect to different provider:

- Export NWC connection for use in other Nostr apps
- Switch providers without losing Nostr identity
- Lightning Address forwarding via Scrub service
- Cashu Address still works (tokens minted from user's preferred mint)

## 6. Tier 3: Advanced - Full Self-Hosted Sovereignty

### 6.1 User Flow

```
User self-hosts:
  ├── LNbits instance (with PhoenixD backend)
  ├── Cashu Mint (using cashu-rs-mint or nutshell)
  ├── Private Nostr relay (optional)
  └── Satnam frontend (optional static hosting)
→ Connects all via NWC internally
→ Zero third-party dependencies
→ Family Federation operates own mint
```

### 6.2 Implementation Requirements

#### 6.2.1 Self-Hosted Configuration Guide

**New Documentation:** `docs/SELF_HOSTED_SOVEREIGNTY_GUIDE.md`

Contents:

- Docker Compose stack for LNbits + PhoenixD + Cashu Mint
- Private relay setup (optional)
- NWC configuration for internal communication
- Cashu mint setup with Lightning backend
- Satnam frontend static deployment options
- Backup and recovery procedures

#### 6.2.2 Detection and Configuration

**Location:** `src/config/wallet-config.ts`

```typescript
interface SovereigntyConfig {
  tier: 1 | 2 | 3;
  lnbitsUrl?: string; // Custom LNbits instance URL
  cashuMintUrl?: string; // Custom Cashu mint URL
  relayUrl?: string; // Custom relay for NWC
  selfHostedMode: boolean;
}

// Detect self-hosted mode from env or user preference
function detectSovereigntyTier(): SovereigntyConfig {
  if (getEnvVar("VITE_SELF_HOSTED_MODE") === "true") {
    return {
      tier: 3,
      selfHostedMode: true,
      lnbitsUrl: getEnvVar("VITE_LNBITS_URL"),
      cashuMintUrl: getEnvVar("VITE_CASHU_MINT_URL"),
    };
  }
  // Check user preference from stored config
  // ...
}
```

## 7. Security Considerations

### 7.1 Key Separation (All Tiers)

**Critical Principle:** Even in Tier 1 "unified gateway", Nostr signing keys and LNbits spending keys MUST remain separate:

```
┌─────────────────────────────────────────────────────────────────┐
│ SECURITY BOUNDARY (maintained across all tiers)                │
├─────────────────────────────────────────────────────────────────┤
│ Nostr nsec → Signs identity events, messages                   │
│              Stored: ClientSessionVault / NIP-07 extension     │
│              NEVER sent to LNbits                              │
├─────────────────────────────────────────────────────────────────┤
│ LNbits Admin Key → Authorizes payments                         │
│                    Stored: Server-side only (lnbits-proxy)     │
│                    User accesses via NWC (scoped permissions)  │
├─────────────────────────────────────────────────────────────────┤
│ NWC Connection → Bridge layer with spending limits             │
│                  Encrypted client-side (AES-256-GCM)           │
│                  Scoped permissions + budgets                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Spending Controls by Role

```typescript
// Default NWC + Cashu budget configurations by Master Context role
const defaultBudgets: Record<MasterContextRole, BudgetConfig> = {
  offspring: {
    dailyBudgetSats: 100_000,
    perPaymentMaxSats: 10_000,
    requireApprovalAbove: 5_000,
    cashuAllowanceSats: 50_000, // Pre-minted offline allowance
  },
  adult: {
    dailyBudgetSats: null, // Unlimited
    perPaymentMaxSats: null,
    requireApprovalAbove: 100_000,
    cashuAllowanceSats: null,
  },
  steward: {
    dailyBudgetSats: null,
    perPaymentMaxSats: null,
    requireApprovalAbove: 500_000,
    cashuAllowanceSats: null,
  },
  guardian: {
    dailyBudgetSats: null,
    perPaymentMaxSats: null,
    requireApprovalAbove: 1_000_000,
    cashuAllowanceSats: null,
  },
  private: {
    dailyBudgetSats: null, // Individual sovereignty
    perPaymentMaxSats: null,
    requireApprovalAbove: null,
    cashuAllowanceSats: null,
  },
};
```

### 7.3 Compromise Mitigation

| Scenario                   | Tier 1                                    | Tier 2               | Tier 3               |
| -------------------------- | ----------------------------------------- | -------------------- | -------------------- |
| Nostr nsec compromised     | Identity lost, wallet safe (separate key) | Same                 | Same                 |
| NWC connection compromised | Limited by budget/permissions             | Same                 | Same                 |
| Device compromised         | Spending limited by NWC config            | Can revoke NWC       | Full control         |
| LNbits server compromised  | User funds at risk                        | Can switch providers | User controls server |
| Cashu mint compromised     | Tokens at risk (limited by allowance)     | Can switch mints     | User controls mint   |

### 7.4 Cashu-Specific Security

- **Blinded signatures:** Mint cannot link tokens to user identity
- **Bearer instruments:** Tokens are self-custody (client-side encrypted storage)
- **Offline capability:** Tokens work without network (local P2P transfer possible)
- **Emergency recovery:** Offline tokens can be swept if device lost (with backup seed)

## 8. Integration with Physical Peer Onboarding

### 8.1 Tier Selection in Onboarding Flow

**Location:** Extend `ParticipantIntakeStep` in high_volume_onboarding_plan.md

```typescript
// Add to intake form
interface ParticipantIntake {
  // ... existing fields
  walletPreference: "auto" | "bring_own" | "external_nwc";
  existingNwcUri?: string;
  existingLightningAddress?: string;
  existingCashuAddress?: string; // NEW
  technicalComfort: "beginner" | "intermediate" | "advanced";
}
```

### 8.2 Adaptive Step Sequence

- **Beginner (Tier 1):** Skip wallet configuration, auto-provision Lightning + Cashu
- **Intermediate (Tier 2):** Show NWC connection options, configure Cashu mint preference
- **Advanced (Tier 3):** Provide self-hosted configuration prompts (LNbits + Cashu Mint)

## 9. API Enhancements

### 9.1 New/Extended Endpoints

```typescript
// Unified wallet operations (works across all tiers)
POST /api/wallet/unified/balance      // Get balance (Lightning + Cashu combined)
POST /api/wallet/unified/pay          // Pay invoice (NWC or LNbits)
POST /api/wallet/unified/invoice      // Create invoice (NWC or LNbits)
POST /api/wallet/unified/history      // Transaction history (Lightning + Cashu)

// Tier management
GET  /api/wallet/tier                 // Get current tier
POST /api/wallet/tier/upgrade         // Request tier upgrade
POST /api/wallet/tier/configure       // Configure tier-specific settings

// NWC management (extends existing)
POST /api/wallet/nwc/auto-configure   // Auto-configure NWC for Tier 1
POST /api/wallet/nwc/switch-provider  // Switch wallet provider (Tier 2+)

// Cashu Address endpoints (NEW)
GET  /.well-known/cashu               // Resolve Cashu Address (alice@my.satnam.pub)
POST /api/cashu/address/create        // Create Cashu Address for user
POST /api/cashu/address/configure     // Configure mint preferences
GET  /api/cashu/address/list          // List user's Cashu addresses
POST /api/cashu/mint/tokens           // Mint tokens (requires Lightning payment)
POST /api/cashu/melt/tokens           // Melt tokens to Lightning
GET  /api/cashu/balance               // Get Cashu token balance
```

### 9.2 Unified Wallet Service

**New Service:** `services/unified-wallet.ts`

```typescript
class UnifiedWalletService {
  private tier: 1 | 2 | 3;
  private nwcConnection?: NWCConnection;
  private lnbitsClient?: LNbitsClient;
  private cashuWallet?: CashuWallet;

  async getBalance(): Promise<{
    lightning: number;
    cashu: number;
    total: number;
  }> {
    const lightning =
      this.tier >= 2 && this.nwcConnection
        ? await this.nwcConnection.getBalance()
        : await this.lnbitsClient.getBalance();

    const cashu = this.cashuWallet ? await this.cashuWallet.getBalance() : 0;

    return { lightning, cashu, total: lightning + cashu };
  }

  async payInvoice(invoice: string): Promise<PaymentResult> {
    // Route through appropriate provider based on tier
    // Prefer Cashu tokens for small payments, Lightning for larger
  }

  async createInvoice(amount: number, memo: string): Promise<string> {
    // Route through appropriate provider based on tier
  }

  async mintCashuTokens(amountSats: number): Promise<CashuToken[]> {
    // Pay Lightning invoice from mint, receive tokens
  }

  async meltCashuTokens(tokens: CashuToken[]): Promise<number> {
    // Return tokens to mint, receive Lightning payment
  }
}
```

## 10. Implementation Phases (LNbits + Cashu Client Wallet)

This implementation uses **parallel workstreams**: LNbits Gateway (primary) and Cashu Client Wallet (parallel).

### Phase 1: Foundation (Week 1-2)

**LNbits Gateway Track:**

- [ ] Create `wallet_links` database table with Cashu fields
- [ ] Implement `UnifiedWalletService` with LNbits-only support
- [ ] Add auto-provisioning to IdentityForge registration flow
- [ ] Create basic `UnifiedWalletDashboard` component
- [ ] Feature flags for tier control

**Cashu Client Track (Parallel):**

- [ ] Confirm and document `@cashu/cashu-ts` as the standard client library
- [ ] Create `cashu_address_registry` database table (if not already present)
- [ ] Extend `wallet_links` schema with `cashu_addresses` JSONB field
- [ ] Create `SatnamCashuWalletService` (`src/services/cashu-wallet-service.ts`)
- [ ] Extend `ClientSessionVault` with encrypted `CashuProofStorage`
- [ ] Wire `SatnamCashuWalletService` into `UnifiedWalletService` (balance-only initially)

### Phase 2: NWC + Cashu Endpoint Integration (Week 3-4)

**LNbits Gateway Track:**

- [ ] Implement auto-NWC configuration for Tier 1
- [ ] Create `WalletConnectionSelector` component
- [ ] Add external NWC connection support to `useNWCWallet`
- [ ] Extend `UnifiedWalletService` for NWC routing
- [ ] Add wallet provider switching capability

**Cashu Client Track (Parallel):**

- [ ] Implement `/.well-known/cashu` endpoint (Netlify Function) for Cashu Address resolution
- [ ] Create `cashu-address` Netlify function and add redirect rule in `netlify.toml`
- [ ] Add Cashu balance display to `UnifiedWalletDashboard` using `SatnamCashuWalletService`
- [ ] Implement basic mint/receive/send flows in the client (using default Satnam mint)
- [ ] Persist deterministic counters via `wallet.on.countersReserved` callbacks

### Phase 3: Onboarding + Cashu UI Integration (Week 5-6)

**Combined:**

- [ ] Add tier selection to `ParticipantIntakeStep`
- [ ] Implement adaptive step sequence in physical onboarding
- [ ] Create Tier 2/3 configuration flows
- [ ] Test bulk onboarding with tier variety
- [ ] Integrate Cashu Address creation in IdentityForge.tsx
- [ ] Implement offspring allowance address creation **using P2PK tokens locked to the Adult parent pubkey that created the offspring account**
- [ ] Add Cashu balance + recent activity to the unified dashboard
- [ ] Create Cashu mint preference configuration UI (per-user/default)

### Phase 4: Production Mint + Advanced Features (Week 7-8)

**Server Track:**

- [ ] Deploy Cashu Mint on VPS (`https://mint.my.satnam.pub`)
- [ ] Connect mint Lightning backend to PhoenixD/LNbits
- [ ] Implement mint/melt API endpoints and health monitoring
- [ ] Add Docker Compose definitions for Cashu Mint to the stack
- [ ] Finalize self-hosted configuration documentation (LNbits + Cashu Mint + PhoenixD)

**Client Track:**

- [ ] Implement NIP-61 Cashu Zaps (nutzaps) using Cashu tokens and Nostr events
- [ ] Enhance `src/lib/cross-mint-cashu-manager.ts` with real cross-mint swap operations (NUT-15)
- [ ] Implement token backup/restore via encrypted export/import (leveraging `ClientSessionVault`)
- [ ] Add emergency token sweep tools for compromised devices/accounts

### Phase 5: Polish and Documentation (Week 9-10)

**Combined:**

- [ ] User-facing tier upgrade/downgrade flows
- [ ] Migration utilities between tiers (LNbits-only ↔ LNbits+Cashu ↔ self-hosted)
- [ ] Finalize Cashu token backup/restore and allowance workflows
- [ ] Comprehensive testing across tiers (Lightning + Cashu + NWC)
- [ ] User documentation and guides for LNbits + Cashu setup and usage

## 11. Success Metrics

| Metric                               | Target                                        |
| ------------------------------------ | --------------------------------------------- |
| Tier 1 onboarding time               | < 60 seconds from identity to funded wallet   |
| Tier 2 connection success rate       | > 95% for valid NWC URIs                      |
| Tier 3 documentation completeness    | Self-deploy within 30 minutes                 |
| Key separation verification          | 100% - no nsec ever touches LNbits            |
| Cashu Address resolution success     | > 99% for valid alice@my.satnam.pub addresses |
| Unified identity resolution          | Same address works for NIP-05, LN, Cashu      |
| User satisfaction (tier-appropriate) | > 4.5/5 across all tiers                      |

## 12. Open Questions

1. **Tier upgrade UX:** How do we guide users from Tier 1 → Tier 2 as they become more sophisticated?
2. **Fallback behavior:** If NWC connection fails, should Tier 2 users fall back to direct LNbits API?
3. **Family federation inheritance:** Should offspring inherit parent's tier configuration?
4. **Lightning Address portability:** How do we handle Lightning Address when switching from Tier 1 to Tier 2 external wallet?
5. **Cashu mint selection:** Should we support multiple mints, or require all users to use the Satnam mint?
6. **Offline token limits:** How much should offspring be able to hold in offline Cashu tokens?
7. **Cross-mint support:** Should we support receiving tokens from external mints (NUTS-15)?

## 13. References

- NIP-47: Nostr Wallet Connect specification
- NIP-61: Cashu Zaps (nutzaps)
- NUTS-00 through NUTS-12: Cashu protocol specifications
- Cashu Address NIP (proposed): Human-readable Cashu addressing
- high_volume_onboarding_plan.md: Physical peer onboarding architecture
- docs/lnbits-nwc-provider-setup.md: LNbits NWC configuration
- src/hooks/useNWCWallet.ts: Existing NWC integration
- src/components/LNBitsIntegrationPanel.tsx: Current LNbits UI
- database/cashu-mint-schema.sql: Existing Cashu database schema
- api/individual/cashu/wallet.js: Existing Cashu API endpoint
- src/lib/cross-mint-cashu-manager.ts: Cross-mint Cashu support
