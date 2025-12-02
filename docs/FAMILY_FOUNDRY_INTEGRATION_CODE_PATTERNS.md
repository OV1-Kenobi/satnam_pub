# Family Foundry Integration - Code Patterns & Examples

**Date**: December 1, 2025
**Purpose**: Reference implementation patterns for backend integration

---

## PATTERN 1: Federation DUID Generation

```typescript
// src/lib/family-foundry-integration.ts
import { PrivacyEngine } from "./privacy-engine";

export async function generateFederationDuid(
  familyName: string,
  creatorUserDuid: string
): Promise<string> {
  // Privacy-first DUID: SHA-256(family_name + creator_duid + timestamp + salt)
  const encoder = new TextEncoder();
  const timestamp = Date.now().toString();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const data = encoder.encode(
    `federation_${familyName}_${creatorUserDuid}_${timestamp}`
  );

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const duid = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 32);

  return duid;
}
```

---

## PATTERN 2: User DUID Mapping

```typescript
// Map npub to user_duid during member invitation
export async function mapNpubToUserDuid(npub: string): Promise<string> {
  // Query user_identities table for npub
  const { data, error } = await supabase
    .from("user_identities")
    .select("id")
    .eq("npub", npub)
    .single();

  if (error || !data) {
    throw new Error(`User not found for npub: ${npub}`);
  }

  return data.id; // Returns user_duid (DUID format)
}
```

---

## PATTERN 3: Role Validation

```typescript
// Validate role hierarchy
const ROLE_HIERARCHY = {
  guardian: 4,
  steward: 3,
  adult: 2,
  offspring: 1,
};

export function validateRoleHierarchy(roles: string[]): boolean {
  // Ensure at least one guardian
  if (!roles.includes("guardian")) return false;

  // Ensure roles are valid
  return roles.every((role) => role in ROLE_HIERARCHY);
}

export function canManageRole(
  currentRole: string,
  targetRole: string
): boolean {
  const currentLevel = ROLE_HIERARCHY[currentRole];
  const targetLevel = ROLE_HIERARCHY[targetRole];
  return currentLevel > targetLevel;
}
```

---

## PATTERN 4: FROST Threshold Configuration

```typescript
// Configure FROST based on guardian count
export function calculateFrostThreshold(
  guardianCount: number,
  policy: "conservative" | "balanced" | "aggressive" = "balanced"
): { threshold: number; total: number } {
  const thresholds = {
    conservative: { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 },
    balanced: { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 },
    aggressive: { 1: 1, 2: 2, 3: 2, 4: 2, 5: 3 },
  };

  const threshold =
    thresholds[policy][guardianCount] || Math.ceil(guardianCount * 0.66);

  return { threshold, total: guardianCount };
}
```

---

## PATTERN 5: NFC MFA Policy Setup

```typescript
// Initialize NFC MFA policy during federation creation
export async function initializeNfcMfaPolicy(
  federationDuid: string,
  charter: CharterDefinition
): Promise<void> {
  const policy = {
    federation_duid: federationDuid,
    policy: "required_for_high_value", // or 'optional', 'required', 'disabled'
    high_value_threshold: 100000, // satoshis
    requires_nfc_mfa: true,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("nfc_mfa_policies").insert(policy);

  if (error) throw error;
}
```

---

## PATTERN 6: Steward Approval Integration

```typescript
// Publish steward approval requests after federation creation
export async function publishFederationApprovalRequests(
  federationDuid: string,
  guardianPubkeys: string[],
  stewardThreshold: number
): Promise<void> {
  const operationHash = await hashFederationData(federationDuid);

  await stewardApprovalClient.publishApprovalRequests({
    operationHash,
    operationKind: "federation_creation",
    operationAmount: 0, // Not a payment
    nfcMfaRequired: true,
    nfcMfaPolicy: "required",
    uidHint: federationDuid.substring(0, 8),
    stewardThreshold,
    federationDuid,
    expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    recipients: guardianPubkeys.map((pubkey) => ({ pubkeyHex: pubkey })),
  });
}
```

---

## PATTERN 7: Complete Federation Creation

```typescript
// Main integration function
export async function createFederationWithBackend(
  charter: CharterDefinition,
  rbac: RBACDefinition,
  members: TrustedPeer[],
  userDuid: string
): Promise<{ federationDuid: string; federationId: string }> {
  try {
    // Step 1: Generate federation DUID
    const federationDuid = await generateFederationDuid(
      charter.familyName,
      userDuid
    );

    // Step 2: Validate roles
    const roles = rbac.roles.map((r) => r.id);
    if (!validateRoleHierarchy(roles)) {
      throw new Error("Invalid role hierarchy");
    }

    // Step 3: Call backend API
    const response = await fetch("/api/family/foundry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ charter, rbac }),
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error);

    // Step 4: Initialize FROST
    const guardianCount = members.filter((m) => m.role === "guardian").length;
    const frostConfig = calculateFrostThreshold(guardianCount);

    // Step 5: Initialize NFC MFA policy
    await initializeNfcMfaPolicy(federationDuid, charter);

    // Step 6: Publish steward approvals
    const guardianPubkeys = members
      .filter((m) => m.role === "guardian")
      .map((m) => m.npub);

    await publishFederationApprovalRequests(
      federationDuid,
      guardianPubkeys,
      frostConfig.threshold
    );

    return {
      federationDuid,
      federationId: result.data.federationId,
    };
  } catch (error) {
    console.error("Federation creation failed:", error);
    throw error;
  }
}
```

---

## PATTERN 8: Error Handling & Rollback

```typescript
// Graceful error handling with cleanup
export async function createFederationWithRollback(
  charter: CharterDefinition,
  rbac: RBACDefinition,
  members: TrustedPeer[],
  userDuid: string
): Promise<{ federationDuid: string; federationId: string }> {
  const createdResources: string[] = [];

  try {
    // Create federation
    const result = await createFederationWithBackend(
      charter,
      rbac,
      members,
      userDuid
    );
    return result;
  } catch (error) {
    // Rollback: Delete created resources
    for (const resourceId of createdResources) {
      try {
        await supabase.from("family_federations").delete().eq("id", resourceId);
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError);
      }
    }
    throw error;
  }
}
```

---

## PATTERN 9: Testing Pattern

```typescript
// Unit test example
describe("Federation DUID Generation", () => {
  it("should generate unique DUIDs for same family", async () => {
    const duid1 = await generateFederationDuid("TestFamily", "user1");
    const duid2 = await generateFederationDuid("TestFamily", "user1");

    expect(duid1).not.toBe(duid2); // Different timestamps
    expect(duid1).toHaveLength(32);
    expect(duid2).toHaveLength(32);
  });

  it("should validate role hierarchy", () => {
    expect(validateRoleHierarchy(["guardian", "steward", "adult"])).toBe(true);
    expect(validateRoleHierarchy(["steward", "adult"])).toBe(false); // No guardian
  });
});
```

---

## INTEGRATION CHECKLIST

- [ ] DUID generation implemented and tested
- [ ] User DUID mapping working
- [ ] Role validation enforced
- [ ] FROST threshold calculation correct
- [ ] NFC MFA policy initialized
- [ ] Steward approval workflow integrated
- [ ] Error handling and rollback working
- [ ] All tests passing
- [ ] Performance acceptable
- [ ] Security review passed
