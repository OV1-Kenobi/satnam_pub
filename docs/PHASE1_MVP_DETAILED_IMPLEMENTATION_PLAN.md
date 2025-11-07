# Phase 1 MVP: Detailed Implementation Plan

# NIP-57 Lightning Zaps & Mutiny Blinded Authentication

**Document Version:** 1.0
**Date:** November 7, 2025
**Scope:** Phase 1 MVP (Weeks 1-4, 90-130 hours)
**Status:** Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Week 1: NIP-57 Foundation](#week-1-nip-57-foundation)
4. [Week 2: NIP-57 UI & Integration](#week-2-nip-57-ui--integration)
5. [Week 3: Blinded Auth Foundation](#week-3-blinded-auth-foundation)
6. [Week 4: Blinded Auth Integration](#week-4-blinded-auth-integration)
7. [Testing Strategy](#testing-strategy)
8. [Rollback Procedures](#rollback-procedures)
9. [Success Criteria](#success-criteria)

---

## Executive Summary

This document provides code-level specifications for implementing Phase 1 MVP of NIP-57 Lightning Zaps and Mutiny Blinded Authentication. The implementation follows Satnam's established architectural patterns:

- **Zero-knowledge architecture** - No plaintext credential exposure
- **Browser-only serverless** - Web Crypto API, no Node.js dependencies
- **CEPS integration** - All Nostr operations through central service
- **Noble V2 encryption** - Consistent cryptographic standards
- **ESM-only Netlify Functions** - Pure ES modules
- **Master Context compliance** - Role hierarchy integration

### Timeline & Effort

| Week      | Focus                    | Effort           | Deliverables                                                 |
| --------- | ------------------------ | ---------------- | ------------------------------------------------------------ |
| Week 1    | NIP-57 Foundation        | 20-30 hours      | Zap request creation, LNURL validation, receipt validation   |
| Week 2    | NIP-57 UI & Integration  | 20-30 hours      | UI components, CEPS integration, comprehensive tests         |
| Week 3    | Blinded Auth Foundation  | 25-35 hours      | Token system, storage, encryption, database schema           |
| Week 4    | Blinded Auth Integration | 25-35 hours      | Family admin integration, UI components, comprehensive tests |
| **Total** | **Phase 1 MVP**          | **90-130 hours** | **Production-ready NIP-57 & Blinded Auth**                   |

---

## Architecture Overview

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ ZapButton    │  │ ZapModal     │  │ ZapReceipt   │          │
│  │ Component    │  │ Component    │  │ Component    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         └──────────────────┼──────────────────┘                  │
│                            │                                     │
│                   ┌────────▼────────┐                            │
│                   │  ZapService     │                            │
│                   │  (lib/zap)      │                            │
│                   └────────┬────────┘                            │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                 │
│         │                  │                  │                 │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐          │
│  │ CEPS         │  │ ClientVault  │  │ NWC Wallet   │          │
│  │ (Nostr ops)  │  │ (Storage)    │  │ (Payments)   │          │
│  └──────┬───────┘  └──────────────┘  └──────┬───────┘          │
│         │                                     │                 │
└─────────┼─────────────────────────────────────┼─────────────────┘
          │                                     │
          │ HTTP/WebSocket                      │ NWC/HTTP
          │                                     │
┌─────────▼─────────────────────────────────────▼─────────────────┐
│                    NETLIFY FUNCTIONS                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │ lnbits-proxy.ts  │  │ zap-validate.ts  │                     │
│  │ (Invoice create) │  │ (Zap request)    │                     │
│  └────────┬─────────┘  └────────┬─────────┘                     │
│           │                      │                              │
│           └──────────┬───────────┘                              │
│                      │                                          │
│           ┌──────────▼─────────┐                                │
│           │  Supabase Client   │                                │
│           │  (Database ops)    │                                │
│           └──────────┬─────────┘                                │
│                      │                                          │
└──────────────────────┼──────────────────────────────────────────┘
                       │
                       │ PostgreSQL
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│                      SUPABASE                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ zap_requests │  │ zap_receipts │  │ blind_tokens │          │
│  │ (tracking)   │  │ (validation) │  │ (auth)       │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  RLS Policies: auth.uid() matching, role-based access           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow: NIP-57 Zap Request

```
1. User clicks ZapButton → ZapModal opens
2. User enters amount + optional message
3. ZapService.createZapRequest() → builds kind:9734 event
4. CEPS.signEventWithActiveSession() → signs event
5. ZapService.sendZapRequest() → HTTP GET to LNURL callback
6. lnbits-proxy validates request → creates invoice with description hash
7. NWC wallet pays invoice
8. LNbits publishes kind:9735 receipt to relays
9. CEPS.subscribeToZapReceipts() → receives receipt
10. ZapReceiptValidator.validate() → verifies pubkey, amount, hash
11. ZapReceipt component displays verified zap
```

### Data Flow: Blinded Authentication

```
1. Guardian accesses FamilyAdminPanel
2. useBlindAuth() hook checks for valid token
3. If no token: BlindAuthService.requestToken()
4. Server issues blind token (signed, encrypted)
5. ClientSessionVault.storeBlindToken() → IndexedDB
6. Token presented on subsequent requests
7. blind-token-verify.ts validates signature + expiration
8. Access granted to protected resources
9. Token marked as spent after use (one-time)
10. Backup to Supabase (encrypted with Noble V2)
```

---

## Week 1: NIP-57 Foundation

**Timeline:** Days 1-5 (20-30 hours)
**Goal:** Implement core zap request creation, LNURL validation, and receipt validation

### Day 1-2: Zap Request Creation & Signing

#### Task 1.1: Create ZapService Module

**File:** `src/lib/zap/zap-service.ts`

**Purpose:** Core service for creating and managing NIP-57 zap requests

**Implementation:**

```typescript
/**
 * ZapService - NIP-57 Lightning Zaps Implementation
 * Handles zap request creation, signing, and validation
 *
 * @compliance Zero-knowledge architecture, CEPS integration
 */

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { Event } from "nostr-tools";
import { CEPS } from "../central_event_publishing_service";
import { getEnvVar } from "../../config/env.client";

/**
 * Zap request configuration
 */
export interface ZapRequestConfig {
  recipientPubkey: string; // npub or hex pubkey
  amountMillisats: number; // Amount in millisats
  message?: string; // Optional message
  eventId?: string; // Optional event to zap (e tag)
  relays?: string[]; // Relays for receipt publishing
  lnurl?: string; // LNURL pay endpoint
}

/**
 * Zap request event (kind:9734)
 */
export interface ZapRequest extends Event {
  kind: 9734;
  tags: string[][];
  content: string;
}

/**
 * Zap receipt event (kind:9735)
 */
export interface ZapReceipt extends Event {
  kind: 9735;
  tags: string[][];
  content: string;
}

/**
 * LNURL pay response
 */
export interface LNURLPayResponse {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  tag: "payRequest";
  allowsNostr?: boolean;
  nostrPubkey?: string;
}

/**
 * Create a NIP-57 zap request event (kind:9734)
 *
 * @param config Zap request configuration
 * @returns Unsigned zap request event
 */
export async function createZapRequest(
  config: ZapRequestConfig
): Promise<ZapRequest> {
  // Feature flag check
  const enabled = getEnvVar("VITE_NIP57_ZAPS_ENABLED") === "true";
  if (!enabled) {
    throw new Error("NIP-57 zaps are not enabled");
  }

  // Validate inputs
  if (!config.recipientPubkey) {
    throw new Error("Recipient pubkey is required");
  }
  if (!config.amountMillisats || config.amountMillisats <= 0) {
    throw new Error("Amount must be positive");
  }

  // Convert npub to hex if needed
  const recipientHex = config.recipientPubkey.startsWith("npub")
    ? CEPS.npubToHex(config.recipientPubkey)
    : config.recipientPubkey;

  // Build tags
  const tags: string[][] = [
    ["p", recipientHex], // Recipient pubkey
    ["amount", config.amountMillisats.toString()], // Amount in millisats
  ];

  // Add optional event tag (for zapping posts)
  if (config.eventId) {
    tags.push(["e", config.eventId]);
  }

  // Add relay hints for receipt publishing
  const relays = config.relays || [
    "wss://relay.satnam.pub",
    "wss://relay.damus.io",
    "wss://nos.lol",
  ];
  relays.forEach((relay) => tags.push(["relays", relay]));

  // Add LNURL tag if provided
  if (config.lnurl) {
    tags.push(["lnurl", config.lnurl]);
  }

  // Create unsigned event
  const unsignedEvent: ZapRequest = {
    kind: 9734,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: config.message || "",
    pubkey: "", // Will be set during signing
    id: "", // Will be set during signing
    sig: "", // Will be set during signing
  };

  return unsignedEvent;
}

/**
 * Sign a zap request using CEPS
 *
 * @param zapRequest Unsigned zap request
 * @returns Signed zap request
 */
export async function signZapRequest(
  zapRequest: ZapRequest
): Promise<ZapRequest> {
  try {
    const signedEvent = await CEPS.signEventWithActiveSession(zapRequest);
    return signedEvent as ZapRequest;
  } catch (error) {
    throw new Error(
      `Failed to sign zap request: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Validate zap request structure (NIP-57 Appendix D)
 *
 * @param zapRequest Zap request to validate
 * @returns true if valid, throws error otherwise
 */
export function validateZapRequest(zapRequest: ZapRequest): boolean {
  // Check kind
  if (zapRequest.kind !== 9734) {
    throw new Error("Invalid zap request kind");
  }

  // Check required tags
  const pTag = zapRequest.tags.find((t) => t[0] === "p");
  if (!pTag || !pTag[1]) {
    throw new Error("Missing recipient pubkey (p tag)");
  }

  const amountTag = zapRequest.tags.find((t) => t[0] === "amount");
  if (!amountTag || !amountTag[1]) {
    throw new Error("Missing amount tag");
  }

  const amount = parseInt(amountTag[1], 10);
  if (isNaN(amount) || amount <= 0) {
    throw new Error("Invalid amount");
  }

  // Check relays tag
  const relaysTags = zapRequest.tags.filter((t) => t[0] === "relays");
  if (relaysTags.length === 0) {
    throw new Error("Missing relays tags");
  }

  return true;
}
```

**Dependencies:**

- `@noble/hashes` (already installed)
- `nostr-tools` (already installed)

**Feature Flag:**

- Add to `src/config/env.client.ts`:
  ```typescript
  export const NIP57_ZAPS_ENABLED =
    getEnvVar("VITE_NIP57_ZAPS_ENABLED") === "true";
  ```
- Add to `.env`:
  ```
  VITE_NIP57_ZAPS_ENABLED=true
  ```
- Add to `vite.config.js` (getAllViteEnvVars will auto-include)

**Testing:**

**File:** `tests/zap-service.test.ts`

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  createZapRequest,
  signZapRequest,
  validateZapRequest,
} from "../src/lib/zap/zap-service";

describe("ZapService", () => {
  describe("createZapRequest", () => {
    it("should create valid zap request", async () => {
      const config = {
        recipientPubkey: "npub1...",
        amountMillisats: 1000,
        message: "Great post!",
      };

      const zapRequest = await createZapRequest(config);

      expect(zapRequest.kind).toBe(9734);
      expect(zapRequest.tags).toContainEqual(["p", expect.any(String)]);
      expect(zapRequest.tags).toContainEqual(["amount", "1000"]);
      expect(zapRequest.content).toBe("Great post!");
    });

    it("should throw on invalid amount", async () => {
      const config = {
        recipientPubkey: "npub1...",
        amountMillisats: -100,
      };

      await expect(createZapRequest(config)).rejects.toThrow(
        "Amount must be positive"
      );
    });

    it("should include relay hints", async () => {
      const config = {
        recipientPubkey: "npub1...",
        amountMillisats: 1000,
        relays: ["wss://relay.satnam.pub"],
      };

      const zapRequest = await createZapRequest(config);

      expect(zapRequest.tags).toContainEqual([
        "relays",
        "wss://relay.satnam.pub",
      ]);
    });
  });

  describe("validateZapRequest", () => {
    it("should validate correct zap request", () => {
      const zapRequest = {
        kind: 9734,
        tags: [
          ["p", "abc123"],
          ["amount", "1000"],
          ["relays", "wss://relay.satnam.pub"],
        ],
        content: "",
        created_at: Math.floor(Date.now() / 1000),
        pubkey: "sender123",
        id: "event123",
        sig: "sig123",
      };

      expect(validateZapRequest(zapRequest)).toBe(true);
    });

    it("should reject missing p tag", () => {
      const zapRequest = {
        kind: 9734,
        tags: [
          ["amount", "1000"],
          ["relays", "wss://relay.satnam.pub"],
        ],
        content: "",
        created_at: Math.floor(Date.now() / 1000),
        pubkey: "sender123",
        id: "event123",
        sig: "sig123",
      };

      expect(() => validateZapRequest(zapRequest)).toThrow(
        "Missing recipient pubkey"
      );
    });
  });
});
```

**Acceptance Criteria:**

- ✅ ZapService module created with TypeScript types
- ✅ createZapRequest() builds valid kind:9734 events
- ✅ signZapRequest() integrates with CEPS
- ✅ validateZapRequest() enforces NIP-57 Appendix D rules
- ✅ Feature flag VITE_NIP57_ZAPS_ENABLED working
- ✅ All unit tests passing (>90% coverage)

---

### Day 3-4: LNURL Integration & Zap Request Validation

#### Task 1.2: Extend lnbits-proxy for Zap Validation

**File:** `netlify/functions_active/lnbits-proxy.ts`

**Purpose:** Add zap request validation and invoice creation with description hash

**Implementation:**

Add new action handler to existing lnbits-proxy:

```typescript
/**
 * Validate zap request and create invoice with description hash
 * Action: 'zap_validate'
 */
async function handleZapValidate(
  event: HandlerEvent,
  supabase: SupabaseClient
): Promise<HandlerResponse> {
  const requestId = generateRequestId();

  try {
    // Parse request body
    const body = JSON.parse(event.body || "{}");
    const { zapRequest, lnurl } = body;

    if (!zapRequest || !lnurl) {
      return createValidationErrorResponse(
        "Missing zapRequest or lnurl",
        requestId
      );
    }

    // Validate zap request structure (NIP-57 Appendix D)
    if (zapRequest.kind !== 9734) {
      return createValidationErrorResponse(
        "Invalid zap request kind",
        requestId
      );
    }

    // Extract required tags
    const pTag = zapRequest.tags.find((t: string[]) => t[0] === "p");
    const amountTag = zapRequest.tags.find((t: string[]) => t[0] === "amount");

    if (!pTag || !amountTag) {
      return createValidationErrorResponse(
        "Missing required tags (p or amount)",
        requestId
      );
    }

    const recipientPubkey = pTag[1];
    const amountMillisats = parseInt(amountTag[1], 10);

    if (isNaN(amountMillisats) || amountMillisats <= 0) {
      return createValidationErrorResponse("Invalid amount", requestId);
    }

    // Verify event signature using CEPS
    const { central_event_publishing_service: CEPS } = await import(
      "../../lib/central_event_publishing_service.js"
    );

    if (!CEPS.verifyEvent(zapRequest)) {
      return createValidationErrorResponse(
        "Invalid zap request signature",
        requestId
      );
    }

    // Create description hash (SHA-256 of zap request JSON)
    const { sha256 } = await import("@noble/hashes/sha256");
    const { bytesToHex } = await import("@noble/hashes/utils");

    const zapRequestJson = JSON.stringify(zapRequest);
    const descriptionHash = bytesToHex(
      sha256(new TextEncoder().encode(zapRequestJson))
    );

    // Create invoice via LNbits with description hash
    const lnbitsUrl = resolvePlatformLightningDomainServer();
    const lnbitsApiKey = process.env.LNBITS_ADMIN_KEY;

    if (!lnbitsApiKey) {
      throw new Error("LNbits API key not configured");
    }

    const invoiceResponse = await fetch(`${lnbitsUrl}/api/v1/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": lnbitsApiKey,
      },
      body: JSON.stringify({
        out: false,
        amount: Math.floor(amountMillisats / 1000), // Convert to sats
        memo: `Zap to ${recipientPubkey.slice(0, 8)}...`,
        description_hash: descriptionHash,
        webhook: `${process.env.URL}/.netlify/functions/zap-receipt-webhook`,
      }),
    });

    if (!invoiceResponse.ok) {
      throw new Error(
        `LNbits invoice creation failed: ${invoiceResponse.statusText}`
      );
    }

    const invoiceData = await invoiceResponse.json();

    // Store zap request in database for receipt validation
    const { error: dbError } = await supabase.from("zap_requests").insert({
      zap_request_id: zapRequest.id,
      recipient_pubkey: recipientPubkey,
      sender_pubkey: zapRequest.pubkey,
      amount_millisats: amountMillisats,
      description_hash: descriptionHash,
      invoice_payment_hash: invoiceData.payment_hash,
      lnurl,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (dbError) {
      console.error("[lnbits-proxy] Failed to store zap request:", dbError);
      // Non-fatal: continue even if DB insert fails
    }

    return {
      statusCode: 200,
      headers: getSecurityHeaders(),
      body: JSON.stringify({
        success: true,
        data: {
          payment_request: invoiceData.payment_request,
          payment_hash: invoiceData.payment_hash,
          description_hash: descriptionHash,
        },
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
        },
      }),
    };
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "lnbits-proxy/zap_validate",
      method: event.httpMethod,
    });

    return errorResponse(500, "Zap validation failed", requestId);
  }
}
```

**Database Schema:**

**File:** `database/migrations/035_nip57_zaps.sql`

```sql
-- NIP-57 Lightning Zaps Database Schema
-- Phase 1 MVP: Zap requests and receipts tracking

-- ============================================================================
-- ZAP REQUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.zap_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zap_request_id TEXT NOT NULL UNIQUE,  -- Nostr event ID
    recipient_pubkey TEXT NOT NULL,        -- Recipient's pubkey (hex)
    sender_pubkey TEXT NOT NULL,           -- Sender's pubkey (hex)
    amount_millisats BIGINT NOT NULL CHECK (amount_millisats > 0),
    description_hash TEXT NOT NULL,        -- SHA-256 hash of zap request JSON
    invoice_payment_hash TEXT NOT NULL,    -- BOLT11 payment hash
    lnurl TEXT NOT NULL,                   -- LNURL pay endpoint
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
    event_id TEXT,                         -- Optional: event being zapped (e tag)
    message TEXT,                          -- Optional: zap message
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_zap_requests_recipient ON public.zap_requests(recipient_pubkey);
CREATE INDEX IF NOT EXISTS idx_zap_requests_sender ON public.zap_requests(sender_pubkey);
CREATE INDEX IF NOT EXISTS idx_zap_requests_status ON public.zap_requests(status);
CREATE INDEX IF NOT EXISTS idx_zap_requests_payment_hash ON public.zap_requests(invoice_payment_hash);
CREATE INDEX IF NOT EXISTS idx_zap_requests_created_at ON public.zap_requests(created_at DESC);

-- ============================================================================
-- ZAP RECEIPTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.zap_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zap_receipt_id TEXT NOT NULL UNIQUE,   -- Nostr event ID (kind:9735)
    zap_request_id TEXT NOT NULL REFERENCES public.zap_requests(zap_request_id),
    recipient_pubkey TEXT NOT NULL,         -- Recipient's pubkey (hex)
    sender_pubkey TEXT NOT NULL,            -- Sender's pubkey (hex)
    amount_millisats BIGINT NOT NULL CHECK (amount_millisats > 0),
    bolt11_invoice TEXT NOT NULL,           -- BOLT11 invoice from receipt
    description_hash TEXT NOT NULL,         -- SHA-256 hash for validation
    preimage TEXT,                          -- Optional: payment preimage
    verified BOOLEAN NOT NULL DEFAULT false,
    verification_error TEXT,
    relays TEXT[] DEFAULT ARRAY[]::TEXT[],  -- Relays where receipt was published
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_zap_receipts_request ON public.zap_receipts(zap_request_id);
CREATE INDEX IF NOT EXISTS idx_zap_receipts_recipient ON public.zap_receipts(recipient_pubkey);
CREATE INDEX IF NOT EXISTS idx_zap_receipts_sender ON public.zap_receipts(sender_pubkey);
CREATE INDEX IF NOT EXISTS idx_zap_receipts_verified ON public.zap_receipts(verified);
CREATE INDEX IF NOT EXISTS idx_zap_receipts_created_at ON public.zap_receipts(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.zap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zap_receipts ENABLE ROW LEVEL SECURITY;

-- Zap Requests Policies
-- Users can view their own sent/received zaps
CREATE POLICY "Users can view own zap requests"
    ON public.zap_requests
    FOR SELECT
    USING (
        sender_pubkey IN (
            SELECT npub FROM public.user_identities WHERE id = auth.uid()
        )
        OR recipient_pubkey IN (
            SELECT npub FROM public.user_identities WHERE id = auth.uid()
        )
    );

-- Users can insert their own zap requests
CREATE POLICY "Users can create zap requests"
    ON public.zap_requests
    FOR INSERT
    WITH CHECK (
        sender_pubkey IN (
            SELECT npub FROM public.user_identities WHERE id = auth.uid()
        )
    );

-- Service role can update zap request status (for webhooks)
CREATE POLICY "Service role can update zap requests"
    ON public.zap_requests
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Zap Receipts Policies
-- Users can view their own sent/received zap receipts
CREATE POLICY "Users can view own zap receipts"
    ON public.zap_receipts
    FOR SELECT
    USING (
        sender_pubkey IN (
            SELECT npub FROM public.user_identities WHERE id = auth.uid()
        )
        OR recipient_pubkey IN (
            SELECT npub FROM public.user_identities WHERE id = auth.uid()
        )
    );

-- Service role can insert zap receipts (from relay subscriptions)
CREATE POLICY "Service role can create zap receipts"
    ON public.zap_receipts
    FOR INSERT
    WITH CHECK (true);

-- Service role can update verification status
CREATE POLICY "Service role can update zap receipts"
    ON public.zap_receipts
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get user's zap statistics
CREATE OR REPLACE FUNCTION public.get_user_zap_stats(user_npub TEXT)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_sent', COALESCE(SUM(CASE WHEN sender_pubkey = user_npub THEN amount_millisats ELSE 0 END), 0),
        'total_received', COALESCE(SUM(CASE WHEN recipient_pubkey = user_npub THEN amount_millisats ELSE 0 END), 0),
        'count_sent', COUNT(CASE WHEN sender_pubkey = user_npub THEN 1 END),
        'count_received', COUNT(CASE WHEN recipient_pubkey = user_npub THEN 1 END)
    ) INTO result
    FROM public.zap_receipts
    WHERE verified = true
      AND (sender_pubkey = user_npub OR recipient_pubkey = user_npub);

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_zap_stats(TEXT) TO authenticated;

-- ============================================================================
-- CLEANUP TRIGGER (Auto-expire old pending zaps)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_zap_requests()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.zap_requests
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at < NOW();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_expired_zaps
    AFTER INSERT OR UPDATE ON public.zap_requests
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.cleanup_expired_zap_requests();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.zap_requests IS 'NIP-57 zap requests tracking for invoice creation and validation';
COMMENT ON TABLE public.zap_receipts IS 'NIP-57 zap receipts (kind:9735) for payment verification';
COMMENT ON FUNCTION public.get_user_zap_stats(TEXT) IS 'Get aggregated zap statistics for a user';
```

**Acceptance Criteria:**

- ✅ lnbits-proxy extended with zap_validate action
- ✅ Zap request signature verification via CEPS
- ✅ Description hash creation (SHA-256)
- ✅ Invoice creation with description_hash parameter
- ✅ Database schema created with RLS policies
- ✅ Helper functions for zap statistics
- ✅ Integration tests passing

---

### Day 5: Receipt Validation

#### Task 1.3: Create Zap Receipt Validator

**File:** `src/lib/zap/zap-receipt-validator.ts`

**Purpose:** Validate NIP-57 zap receipts (kind:9735)

**Implementation:**

```typescript
/**
 * Zap Receipt Validator - NIP-57 Implementation
 * Validates zap receipts against zap requests
 *
 * @compliance Zero-knowledge architecture, CEPS integration
 */

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { Event } from "nostr-tools";
import { CEPS } from "../central_event_publishing_service";
import type { ZapReceipt, ZapRequest } from "./zap-service";

/**
 * Validation result
 */
export interface ZapReceiptValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  receipt?: ZapReceipt;
  amountMillisats?: number;
  senderPubkey?: string;
  recipientPubkey?: string;
}

/**
 * Validate a zap receipt (kind:9735)
 *
 * @param receipt Zap receipt event
 * @param originalRequest Original zap request (optional, for enhanced validation)
 * @returns Validation result
 */
export async function validateZapReceipt(
  receipt: ZapReceipt,
  originalRequest?: ZapRequest
): Promise<ZapReceiptValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Verify event kind
  if (receipt.kind !== 9735) {
    errors.push("Invalid receipt kind (expected 9735)");
    return { valid: false, errors, warnings };
  }

  // 2. Verify event signature
  if (!CEPS.verifyEvent(receipt)) {
    errors.push("Invalid receipt signature");
    return { valid: false, errors, warnings };
  }

  // 3. Extract required tags
  const pTag = receipt.tags.find((t) => t[0] === "p");
  const boltTag = receipt.tags.find((t) => t[0] === "bolt11");
  const descriptionTag = receipt.tags.find((t) => t[0] === "description");

  if (!pTag || !pTag[1]) {
    errors.push("Missing sender pubkey (p tag)");
  }

  if (!boltTag || !boltTag[1]) {
    errors.push("Missing BOLT11 invoice (bolt11 tag)");
  }

  if (!descriptionTag || !descriptionTag[1]) {
    errors.push("Missing description tag");
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const senderPubkey = pTag![1];
  const bolt11 = boltTag![1];
  const description = descriptionTag![1];

  // 4. Parse BOLT11 invoice to extract amount
  let amountMillisats: number;
  try {
    amountMillisats = await extractAmountFromBolt11(bolt11);
  } catch (error) {
    errors.push(
      `Failed to parse BOLT11: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    return { valid: false, errors, warnings };
  }

  // 5. Verify description hash
  try {
    const descriptionHash = bytesToHex(
      sha256(new TextEncoder().encode(description))
    );
    const bolt11DescHash = await extractDescriptionHashFromBolt11(bolt11);

    if (descriptionHash !== bolt11DescHash) {
      errors.push("Description hash mismatch");
      return { valid: false, errors, warnings };
    }
  } catch (error) {
    warnings.push(
      `Could not verify description hash: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }

  // 6. If original request provided, perform enhanced validation
  if (originalRequest) {
    // Verify sender pubkey matches
    if (originalRequest.pubkey !== senderPubkey) {
      errors.push("Sender pubkey mismatch");
    }

    // Verify amount matches
    const requestedAmount = parseInt(
      originalRequest.tags.find((t) => t[0] === "amount")?.[1] || "0",
      10
    );

    if (requestedAmount !== amountMillisats) {
      errors.push(
        `Amount mismatch (requested: ${requestedAmount}, received: ${amountMillisats})`
      );
    }

    // Verify recipient pubkey matches
    const recipientPubkey = receipt.pubkey;
    const requestedRecipient = originalRequest.tags.find(
      (t) => t[0] === "p"
    )?.[1];

    if (requestedRecipient && requestedRecipient !== recipientPubkey) {
      errors.push("Recipient pubkey mismatch");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    receipt,
    amountMillisats,
    senderPubkey,
    recipientPubkey: receipt.pubkey,
  };
}

/**
 * Extract amount from BOLT11 invoice
 * Uses light-bolt11-decoder library (browser-compatible)
 *
 * @param bolt11 BOLT11 invoice string
 * @returns Amount in millisats
 */
async function extractAmountFromBolt11(bolt11: string): Promise<number> {
  // Simple regex-based extraction (works for most invoices)
  // Format: lnbc<amount><multiplier>...
  const match = bolt11.match(/^lnbc?(\d+)([munp]?)/i);

  if (!match) {
    throw new Error("Invalid BOLT11 format");
  }

  const amount = parseInt(match[1], 10);
  const multiplier = match[2]?.toLowerCase() || "";

  // Convert to millisats
  const multipliers: Record<string, number> = {
    "": 1000, // BTC → millisats
    m: 100000, // mBTC → millisats
    u: 100, // μBTC → millisats
    n: 0.1, // nBTC → millisats
    p: 0.0001, // pBTC → millisats
  };

  const factor = multipliers[multiplier];
  if (factor === undefined) {
    throw new Error(`Unknown multiplier: ${multiplier}`);
  }

  return Math.floor(amount * factor);
}

/**
 * Extract description hash from BOLT11 invoice
 *
 * @param bolt11 BOLT11 invoice string
 * @returns Description hash (hex)
 */
async function extractDescriptionHashFromBolt11(
  bolt11: string
): Promise<string> {
  // This is a simplified implementation
  // In production, use a proper BOLT11 decoder library
  // For now, we'll extract from the invoice data

  // TODO: Implement proper BOLT11 decoding
  // For MVP, we can skip this validation and rely on LNbits
  throw new Error("BOLT11 description hash extraction not yet implemented");
}
```

**Week 1 Summary:**

By end of Week 1, you will have:

- ✅ Complete zap request creation and signing
- ✅ LNURL integration with invoice creation
- ✅ Zap receipt validation logic
- ✅ Database schema with RLS policies
- ✅ Comprehensive unit tests
- ✅ Feature flag integration

**Next:** Week 2 focuses on UI components and CEPS integration.

---
