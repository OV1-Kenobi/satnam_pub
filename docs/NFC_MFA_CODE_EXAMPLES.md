# NFC Physical MFA Code Examples

**Status**: IMPLEMENTATION REFERENCE  
**Purpose**: Specific code examples for NFC MFA integration

---

## Phase 1: NFC MFA Signature Collection

### New File: `src/lib/steward/frost-nfc-mfa.ts`

```typescript
import { NFCAuthService } from "../nfc-auth";
import { PrivacyEngine } from "../privacy-engine";
import { supabase } from "../supabase-client";

export class FrostNfcMfa {
  private nfcAuthService: NFCAuthService;

  constructor() {
    this.nfcAuthService = new NFCAuthService();
  }

  /**
   * Collect NFC MFA signature for FROST operation
   */
  async collectNfcMfaSignature(
    operationHash: string,
    stewardDuid: string,
    familyId: string
  ): Promise<{
    success: boolean;
    nfcSignature?: {
      curve: "P-256";
      publicKey: string;
      signature: string;
      timestamp: number;
      cardUid: string;
    };
    error?: string;
  }> {
    try {
      // Call NFCAuthService to tap card and sign
      const result = await this.nfcAuthService.tapToSign({
        message: operationHash,
        purpose: "frost",
        requiresGuardianApproval: false,
        guardianThreshold: 0,
        signingSessionId: `frost_${Date.now()}`
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Extract P-256 signature from NTAG424 operation
      const nfcSignature = {
        curve: "P-256" as const,
        publicKey: result.signature.publicKey,
        signature: result.signature.signature,
        timestamp: Date.now(),
        cardUid: result.cardUid || "unknown"
      };

      console.log("✅ NFC MFA signature collected", {
        curve: nfcSignature.curve,
        publicKey: nfcSignature.publicKey.substring(0, 8) + "...",
        signature: nfcSignature.signature.substring(0, 8) + "...",
        timestamp: nfcSignature.timestamp,
        cardUid: nfcSignature.cardUid.substring(0, 8) + "..."
      });

      return { success: true, nfcSignature };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ NFC MFA signature collection failed", {
        error: errorMsg,
        operationHash: operationHash.substring(0, 8) + "..."
      });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Verify NFC MFA signature using Web Crypto API
   */
  async verifyNfcMfaSignature(
    operationHash: string,
    nfcSignature: {
      curve: "P-256";
      publicKey: string;
      signature: string;
      timestamp: number;
      cardUid: string;
    }
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Validate timestamp (within 5 minutes)
      const TIMESTAMP_TOLERANCE_MS = 300000; // 5 minutes
      const now = Date.now();
      const diff = Math.abs(now - nfcSignature.timestamp);

      if (diff > TIMESTAMP_TOLERANCE_MS) {
        return {
          valid: false,
          error: `Signature expired: ${diff}ms > ${TIMESTAMP_TOLERANCE_MS}ms`
        };
      }

      // Verify P-256 signature using Web Crypto API
      const publicKeyObj = await crypto.subtle.importKey(
        "raw",
        this.hexToArrayBuffer(nfcSignature.publicKey),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"]
      );

      const signatureBuffer = this.hexToArrayBuffer(nfcSignature.signature);
      const messageBuffer = new TextEncoder().encode(operationHash);

      const isValid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKeyObj,
        signatureBuffer,
        messageBuffer
      );

      if (!isValid) {
        return { valid: false, error: "Signature verification failed" };
      }

      console.log("✅ NFC MFA signature verified", {
        publicKey: nfcSignature.publicKey.substring(0, 8) + "...",
        signature: nfcSignature.signature.substring(0, 8) + "...",
        timestamp: nfcSignature.timestamp
      });

      return { valid: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ NFC MFA verification failed", { error: errorMsg });
      return { valid: false, error: errorMsg };
    }
  }

  /**
   * Store NFC MFA signature in database
   */
  async storeNfcMfaSignature(
    sessionId: string,
    participantId: string,
    nfcSignature: {
      curve: "P-256";
      publicKey: string;
      signature: string;
      timestamp: number;
      cardUid: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Update frost_signature_shares with NFC signature
      const { error } = await supabase
        .from("frost_signature_shares")
        .update({
          nfc_signature: nfcSignature.signature,
          nfc_public_key: nfcSignature.publicKey,
          nfc_verified_at: new Date(nfcSignature.timestamp).toISOString(),
          nfc_verification_error: null
        })
        .eq("session_id", sessionId)
        .eq("participant_id", participantId);

      if (error) {
        throw error;
      }

      console.log("✅ NFC MFA signature stored", {
        sessionId: sessionId.substring(0, 8) + "...",
        participantId: participantId.substring(0, 8) + "..."
      });

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ NFC MFA storage failed", { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  private hexToArrayBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes.buffer;
  }
}

export const frostNfcMfa = new FrostNfcMfa();
```

---

## Phase 2: FROST Session Integration

### Modify: `lib/frost/frost-session-manager.ts`

#### Add to FrostSession Interface (Line 49-70)

```typescript
interface FrostSession {
  // ... existing fields ...
  
  // NFC MFA Configuration
  requires_nfc_mfa: boolean;
  nfc_mfa_policy: "disabled" | "optional" | "required" | "required_for_high_value";
  
  // NFC Signature Storage
  nfc_signatures: Record<string, {
    signature: string;
    publicKey: string;
    timestamp: number;
    cardUid: string;
  }>;
  nfc_verification_status: Record<string, {
    verified: boolean;
    error?: string;
  }>;
}
```

#### Add getNfcMfaPolicy() Method

```typescript
async getNfcMfaPolicy(familyId: string): Promise<{
  policy: "disabled" | "optional" | "required" | "required_for_high_value";
  amountThreshold?: number;
  nfcMfaThreshold?: "all" | number;
}> {
  try {
    const { data, error } = await supabase
      .from("family_federations")
      .select("nfc_mfa_policy, nfc_mfa_amount_threshold, nfc_mfa_threshold")
      .eq("family_id", familyId)
      .single();

    if (error) {
      console.warn("⚠️ NFC MFA policy not found, defaulting to disabled", {
        familyId: familyId.substring(0, 8) + "..."
      });
      return { policy: "disabled" };
    }

    return {
      policy: data.nfc_mfa_policy || "disabled",
      amountThreshold: data.nfc_mfa_amount_threshold,
      nfcMfaThreshold: data.nfc_mfa_threshold
    };
  } catch (error) {
    console.error("❌ Failed to get NFC MFA policy", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
    return { policy: "disabled" };
  }
}
```

#### Add verifyNfcMfaSignatures() Method

```typescript
async verifyNfcMfaSignatures(sessionId: string): Promise<{
  success: boolean;
  verified: number;
  failed: number;
  errors: Record<string, string>;
}> {
  try {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    let verified = 0;
    let failed = 0;
    const errors: Record<string, string> = {};

    // Verify NFC signature for each participant
    for (const [participantId, nfcSig] of Object.entries(
      session.nfc_signatures || {}
    )) {
      try {
        const result = await frostNfcMfa.verifyNfcMfaSignature(
          session.message_hash,
          nfcSig
        );

        if (result.valid) {
          verified++;
          // Update verification status
          await supabase
            .from("frost_signature_shares")
            .update({ nfc_verification_error: null })
            .eq("session_id", sessionId)
            .eq("participant_id", participantId);
        } else {
          failed++;
          errors[participantId] = result.error || "Verification failed";
          // Update verification error
          await supabase
            .from("frost_signature_shares")
            .update({ nfc_verification_error: result.error })
            .eq("session_id", sessionId)
            .eq("participant_id", participantId);
        }
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        errors[participantId] = errorMsg;
      }
    }

    console.log("✅ NFC MFA verification complete", {
      sessionId: sessionId.substring(0, 8) + "...",
      verified,
      failed
    });

    return {
      success: failed === 0,
      verified,
      failed,
      errors
    };
  } catch (error) {
    console.error("❌ NFC MFA verification failed", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
    return { success: false, verified: 0, failed: 0, errors: {} };
  }
}
```

#### Modify aggregateSignatures() Method (Line 656-873)

```typescript
// After successful aggregation, add:
if (session.requires_nfc_mfa) {
  console.log("🔐 Verifying NFC MFA signatures...", {
    sessionId: sessionId.substring(0, 8) + "..."
  });

  const nfcVerification = await this.verifyNfcMfaSignatures(sessionId);
  
  if (!nfcVerification.success) {
    const errorMsg = `NFC MFA verification failed: ${JSON.stringify(
      nfcVerification.errors
    )}`;
    console.error("❌ NFC MFA verification failed", {
      sessionId: sessionId.substring(0, 8) + "...",
      errors: nfcVerification.errors
    });
    throw new Error(errorMsg);
  }

  console.log("✅ NFC MFA verification passed", {
    sessionId: sessionId.substring(0, 8) + "...",
    verified: nfcVerification.verified
  });
}
```

---

## Phase 3: Steward Approval Integration

### Modify: `src/lib/steward/frost-approval-integration.ts`

```typescript
// After FROST session creation, add NFC MFA check:

const nfcPolicy = await frostManager.getNfcMfaPolicy(familyId);
const requiresNfcMfa = nfcPolicy.policy !== "disabled";

if (requiresNfcMfa) {
  console.log("🔐 NFC MFA required for FROST signatures", {
    policy: nfcPolicy.policy,
    amountThreshold: nfcPolicy.amountThreshold
  });
}

// Before submitting FROST partial signature:

if (requiresNfcMfa) {
  try {
    const nfcResult = await frostNfcMfa.collectNfcMfaSignature(
      operationHash,
      stewardDuid,
      familyId
    );

    if (!nfcResult.success) {
      throw new Error(nfcResult.error || "NFC MFA signature collection failed");
    }

    // Store NFC signature
    await frostNfcMfa.storeNfcMfaSignature(
      sessionId,
      stewardDuid,
      nfcResult.nfcSignature!
    );

    console.log("✅ NFC MFA signature collected and stored", {
      sessionId: sessionId.substring(0, 8) + "...",
      stewardDuid: stewardDuid.substring(0, 8) + "..."
    });
  } catch (nfcError) {
    if (nfcPolicy.policy === "required") {
      throw nfcError; // Fail if NFC MFA is required
    } else {
      console.warn("⚠️ NFC MFA collection failed (optional)", {
        error: nfcError instanceof Error ? nfcError.message : "Unknown error"
      });
      // Continue without NFC MFA if optional
    }
  }
}
```

---

## Database Migration

### New File: `migrations/050_frost_nfc_mfa.sql`

```sql
-- Add NFC MFA fields to frost_signing_sessions
ALTER TABLE frost_signing_sessions ADD COLUMN (
  requires_nfc_mfa BOOLEAN DEFAULT false,
  nfc_mfa_policy TEXT DEFAULT 'disabled' 
    CHECK (nfc_mfa_policy IN ('disabled', 'optional', 'required', 'required_for_high_value')),
  nfc_signatures JSONB DEFAULT '{}',
  nfc_verification_status JSONB DEFAULT '{}'
);

-- Add NFC MFA fields to frost_signature_shares
ALTER TABLE frost_signature_shares ADD COLUMN (
  nfc_signature TEXT,
  nfc_public_key TEXT,
  nfc_verified_at TIMESTAMPTZ,
  nfc_verification_error TEXT
);

-- Add NFC MFA policy to family_federations
ALTER TABLE family_federations ADD COLUMN (
  nfc_mfa_policy TEXT DEFAULT 'disabled'
    CHECK (nfc_mfa_policy IN ('disabled', 'optional', 'required', 'required_for_high_value')),
  nfc_mfa_amount_threshold BIGINT,
  nfc_mfa_threshold TEXT DEFAULT 'all'
);

-- Create index for NFC signature lookups
CREATE INDEX idx_frost_signature_shares_nfc_verified 
  ON frost_signature_shares(nfc_verified_at) 
  WHERE nfc_verified_at IS NOT NULL;
```

---

## Environment Variables

### `.env.local`

```bash
# Enable NFC MFA feature
VITE_ENABLE_NFC_MFA=true

# NFC MFA timeout (milliseconds)
VITE_NFC_MFA_TIMEOUT_MS=30000

# NFC signature timestamp tolerance (milliseconds)
VITE_NFC_MFA_TIMESTAMP_TOLERANCE_MS=300000
```

---

## Testing Example

### `tests/frost-nfc-mfa-integration.test.ts` (Excerpt)

```typescript
describe("FROST NFC MFA Integration", () => {
  it("should collect NFC MFA signature successfully", async () => {
    const operationHash = "a1b2c3d4...";
    const stewardDuid = "steward_123...";
    const familyId = "family_456...";

    const result = await frostNfcMfa.collectNfcMfaSignature(
      operationHash,
      stewardDuid,
      familyId
    );

    expect(result.success).toBe(true);
    expect(result.nfcSignature).toBeDefined();
    expect(result.nfcSignature?.curve).toBe("P-256");
    expect(result.nfcSignature?.publicKey).toBeDefined();
    expect(result.nfcSignature?.signature).toBeDefined();
    expect(result.nfcSignature?.timestamp).toBeDefined();
    expect(result.nfcSignature?.cardUid).toBeDefined();
  });

  it("should verify valid NFC MFA signature", async () => {
    const operationHash = "a1b2c3d4...";
    const nfcSignature = {
      curve: "P-256" as const,
      publicKey: "04abc123...",
      signature: "def456...",
      timestamp: Date.now(),
      cardUid: "0123456789ABCDEF"
    };

    const result = await frostNfcMfa.verifyNfcMfaSignature(
      operationHash,
      nfcSignature
    );

    expect(result.valid).toBe(true);
  });

  it("should reject expired NFC MFA signature", async () => {
    const operationHash = "a1b2c3d4...";
    const nfcSignature = {
      curve: "P-256" as const,
      publicKey: "04abc123...",
      signature: "def456...",
      timestamp: Date.now() - 400000, // 6+ minutes old
      cardUid: "0123456789ABCDEF"
    };

    const result = await frostNfcMfa.verifyNfcMfaSignature(
      operationHash,
      nfcSignature
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired");
  });
});
```


