# Part 2: Proof-of-Personhood and Unique Personhood Implementation Plan

## Overview

This specification defines two complementary systems:

- **Proof-of-Personhood (PoP)**: Verify "not a bot" without revealing identity
- **Unique Personhood (UP)**: Verify "only one account per person" in this domain

---

## 1. Proof-of-Personhood (PoP) System

### 1.1 PoP Score Calculation Algorithm

**Formula:**

```
PoP_Score = (NFC_Score × 0.35) + (Social_Score × 0.35) + (Time_Score × 0.30)

Where:
- NFC_Score: 0-100 (physical verification)
- Social_Score: 0-100 (peer attestations)
- Time_Score: 0-100 (account age + activity)
```

**Score Ranges:**

- 0-25: Unverified (new account)
- 26-50: Partially verified (some PoP signals)
- 51-75: Verified (multiple PoP signals)
- 76-100: Highly verified (strong PoP signals)

### 1.2 NFC Physical Verification Enhancement

**Database Schema:**

```sql
CREATE TABLE IF NOT EXISTS public.nfc_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  nfc_tag_id TEXT NOT NULL,
  verification_type VARCHAR(20) CHECK (verification_type IN ('self_scan', 'peer_scan', 'guardian_scan')),
  verified_by_user_id UUID REFERENCES user_identities(id),
  verification_timestamp TIMESTAMPTZ NOT NULL,
  location_hash TEXT,  -- Privacy-preserving location
  device_fingerprint_hash TEXT,
  nfc_score_contribution SMALLINT DEFAULT 10,  -- 0-100
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_nfc_user ON public.nfc_verifications(user_id);
CREATE INDEX idx_nfc_timestamp ON public.nfc_verifications(verification_timestamp);

ALTER TABLE public.nfc_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_nfc" ON public.nfc_verifications
  FOR ALL USING (user_id = auth.uid());
```

**NFC Score Calculation:**

```typescript
// File: src/lib/pop/nfc-verification.ts
export class NFCVerificationService {
  calculateNFCScore(verifications: NFCVerification[]): number {
    if (verifications.length === 0) return 0;

    // Self-scan: 10 points
    const selfScans = verifications.filter(
      (v) => v.verification_type === "self_scan"
    ).length;
    const selfScore = Math.min(selfScans * 10, 30);

    // Peer scans: 15 points each (max 40)
    const peerScans = verifications.filter(
      (v) => v.verification_type === "peer_scan"
    ).length;
    const peerScore = Math.min(peerScans * 15, 40);

    // Guardian scans: 20 points each (max 30)
    const guardianScans = verifications.filter(
      (v) => v.verification_type === "guardian_scan"
    ).length;
    const guardianScore = Math.min(guardianScans * 20, 30);

    return Math.min(selfScore + peerScore + guardianScore, 100);
  }
}
```

### 1.3 Social Attestations from Trusted Peers

**Database Schema:**

```sql
CREATE TABLE IF NOT EXISTS public.pop_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attester_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  attestee_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  attestation_type VARCHAR(20) CHECK (attestation_type IN ('peer_verification', 'guardian_approval', 'social_proof')),
  nostr_event_id TEXT,  -- Reference to Nostr event
  attestation_data JSONB,  -- Flexible data structure
  weight SMALLINT DEFAULT 10,  -- 0-100
  verified_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(attester_id, attestee_id, attestation_type)
);

CREATE INDEX idx_attestations_attestee ON public.pop_attestations(attestee_id);
CREATE INDEX idx_attestations_verified ON public.pop_attestations(verified_at);

ALTER TABLE public.pop_attestations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_see_own_attestations" ON public.pop_attestations
  FOR SELECT USING (attestee_id = auth.uid() OR attester_id = auth.uid());
```

**Attestation Nostr Event (Custom Kind):**

```json
{
  "kind": 30078,
  "tags": [
    ["d", "pop_attestation"],
    ["p", "attestee_npub"],
    ["attestation_type", "peer_verification"],
    ["weight", "15"],
    ["verified_method", "nfc_scan"]
  ],
  "content": "I have verified this person in person via NFC scan"
}
```

**Social Score Calculation:**

```typescript
// File: src/lib/pop/social-attestation.ts
export class SocialAttestationService {
  calculateSocialScore(attestations: PopAttestation[]): number {
    if (attestations.length === 0) return 0;

    // Weight by attestation type
    let score = 0;
    for (const att of attestations) {
      if (att.attestation_type === "guardian_approval") {
        score += Math.min(att.weight * 2, 30);
      } else if (att.attestation_type === "peer_verification") {
        score += Math.min(att.weight, 20);
      } else {
        score += Math.min(att.weight * 0.5, 10);
      }
    }

    // Diversity bonus: different attesters
    const uniqueAttesters = new Set(attestations.map((a) => a.attester_id))
      .size;
    const diversityBonus = Math.min(uniqueAttesters * 5, 20);

    return Math.min(score + diversityBonus, 100);
  }
}
```

### 1.4 Time-Based Verification

**Database Schema:**

```sql
CREATE TABLE IF NOT EXISTS public.pop_time_metrics (
  user_id UUID PRIMARY KEY REFERENCES user_identities(id) ON DELETE CASCADE,
  account_age_days SMALLINT,
  last_activity_at TIMESTAMPTZ,
  activity_frequency_30d SMALLINT,  -- Actions in last 30 days
  transaction_success_rate DECIMAL(3,2),  -- 0.0-1.0
  login_streak_days SMALLINT,
  time_score_contribution SMALLINT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.pop_time_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_time_metrics" ON public.pop_time_metrics
  FOR ALL USING (user_id = auth.uid());
```

**Time Score Calculation:**

```typescript
// File: src/lib/pop/time-verification.ts
export class TimeVerificationService {
  calculateTimeScore(metrics: PopTimeMetrics): number {
    let score = 0;

    // Account age: 0-30 points
    const ageScore = Math.min(Math.floor(metrics.account_age_days / 12), 30);
    score += ageScore;

    // Activity frequency: 0-30 points
    const activityScore = Math.min(
      Math.floor(metrics.activity_frequency_30d / 2),
      30
    );
    score += activityScore;

    // Transaction success rate: 0-20 points
    const successScore = Math.floor(metrics.transaction_success_rate * 20);
    score += successScore;

    // Login streak: 0-20 points
    const streakScore = Math.min(Math.floor(metrics.login_streak_days / 5), 20);
    score += streakScore;

    return Math.min(score, 100);
  }
}
```

---

## 2. Unique Personhood (UP) System

### 2.1 Fedimint-Based Identity Sharding

**Architecture:**

```
Master Identity Secret
        ↓
    FROST Polynomial
        ↓
    Shard Distribution
    ├─ Guardian 1 (Shard 1)
    ├─ Guardian 2 (Shard 2)
    ├─ Guardian 3 (Shard 3)
    └─ Guardian 4 (Shard 4)
        ↓
    Threshold: 3 of 4 needed for reconstruction
```

**Database Schema:**

```sql
CREATE TABLE IF NOT EXISTS public.identity_shards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  shard_index SMALLINT NOT NULL,
  guardian_id UUID NOT NULL REFERENCES user_identities(id),
  encrypted_shard TEXT NOT NULL,
  shard_commitment TEXT,  -- Polynomial commitment for verification
  threshold SMALLINT NOT NULL,
  total_shards SMALLINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, shard_index)
);

CREATE INDEX idx_shards_user ON public.identity_shards(user_id);
CREATE INDEX idx_shards_guardian ON public.identity_shards(guardian_id);

ALTER TABLE public.identity_shards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guardians_see_own_shards" ON public.identity_shards
  FOR SELECT USING (guardian_id = auth.uid());
```

**Implementation:**

```typescript
// File: src/lib/up/identity-sharding.ts
export class IdentityShardingService {
  async createIdentityShards(
    userId: string,
    guardianIds: string[],
    threshold: number
  ): Promise<void> {
    // RFC 9591 threshold validation
    if (threshold <= 0 || threshold > guardianIds.length) {
      throw new Error(
        `Invalid threshold: must be between 1 and ${guardianIds.length}`
      );
    }

    // 1. Generate master identity secret
    const masterSecret = await this.generateMasterSecret(userId);

    // 2. Create FROST polynomial
    const polynomial = await FrostPolynomial.generate(masterSecret, threshold);

    // 3. Generate shares
    const shares = await FrostPolynomial.generateShares(
      polynomial,
      guardianIds.length
    );

    // 4. Encrypt and distribute shards
    for (let i = 0; i < guardianIds.length; i++) {
      const encryptedShard = await this.encryptShard(shares[i], guardianIds[i]);
      await supabase.from("identity_shards").insert({
        user_id: userId,
        shard_index: i,
        guardian_id: guardianIds[i],
        encrypted_shard: encryptedShard,
        shard_commitment: polynomial.commitments[i],
        threshold,
        total_shards: guardianIds.length,
      });
    }
  }
}
```

### 2.2 Guardian Consensus for Duplicate Detection

**Database Schema:**

```sql
CREATE TABLE IF NOT EXISTS public.duplicate_detection_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suspected_duplicate_user_id UUID NOT NULL REFERENCES user_identities(id),
  original_user_id UUID NOT NULL REFERENCES user_identities(id),
  voting_guardian_id UUID NOT NULL REFERENCES user_identities(id),
  vote VARCHAR(10) CHECK (vote IN ('duplicate', 'not_duplicate', 'abstain')),
  evidence TEXT,
  voted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(suspected_duplicate_user_id, voting_guardian_id)
);

CREATE INDEX idx_votes_suspected ON public.duplicate_detection_votes(suspected_duplicate_user_id);
```

**Voting Mechanism:**

```typescript
// File: src/lib/up/duplicate-detection.ts
export class DuplicateDetectionService {
  async initiateDuplicateVote(
    suspectedUserId: string,
    originalUserId: string,
    evidence: string
  ): Promise<void> {
    // 1. Get all guardians
    const guardians = await this.getActiveGuardians();

    // 2. Create voting record
    for (const guardian of guardians) {
      await supabase.from("duplicate_detection_votes").insert({
        suspected_duplicate_user_id: suspectedUserId,
        original_user_id: originalUserId,
        voting_guardian_id: guardian.id,
        vote: "abstain",
        evidence,
      });
    }
  }

  async checkDuplicateConsensus(
    suspectedUserId: string,
    threshold: number = 3
  ): Promise<DuplicateVerdict> {
    const votes = await supabase
      .from("duplicate_detection_votes")
      .select("vote")
      .eq("suspected_duplicate_user_id", suspectedUserId);

    const duplicateVotes =
      votes.data?.filter((v) => v.vote === "duplicate").length || 0;
    const totalVotes = votes.data?.length || 0;

    if (totalVotes === 0) {
      return { isDuplicate: false, confidence: 0 };
    }

    if (duplicateVotes >= threshold) {
      return { isDuplicate: true, confidence: duplicateVotes / totalVotes };
    }
    return { isDuplicate: false, confidence: 0 };
  }
}
```

### 2.3 Progressive Trust Escalation

**Extended Role Hierarchy:**

```typescript
// File: src/lib/up/trust-escalation.ts
export const TRUST_LEVELS = {
  PRIVATE: {
    role: "private",
    minPopScore: 0,
    minUpScore: 0,
    features: ["basic_messaging"],
  },
  OFFSPRING: {
    role: "offspring",
    minPopScore: 25,
    minUpScore: 10,
    features: ["cashu_payments"],
  },
  ADULT: {
    role: "adult",
    minPopScore: 50,
    minUpScore: 30,
    features: ["lightning_payments"],
  },
  STEWARD: {
    role: "steward",
    minPopScore: 75,
    minUpScore: 60,
    features: ["federation_creation"],
  },
  GUARDIAN: {
    role: "guardian",
    minPopScore: 90,
    minUpScore: 85,
    features: ["all"],
  },
};

export class TrustEscalationService {
  async checkEligibilityForPromotion(
    userId: string
  ): Promise<EligibilityResult> {
    const popScore = await this.calculatePopScore(userId);
    const upScore = await this.calculateUpScore(userId);
    const currentRole = await this.getUserRole(userId);

    for (const [level, requirements] of Object.entries(TRUST_LEVELS)) {
      if (
        popScore >= requirements.minPopScore &&
        upScore >= requirements.minUpScore
      ) {
        if (
          this.getRoleHierarchy(requirements.role) >
          this.getRoleHierarchy(currentRole)
        ) {
          return {
            eligible: true,
            nextRole: requirements.role,
            popScore,
            upScore,
          };
        }
      }
    }

    return { eligible: false, popScore, upScore };
  }

  private getRoleHierarchy(role: string): number {
    const hierarchy: Record<string, number> = {
      private: 0,
      offspring: 1,
      adult: 2,
      steward: 3,
      guardian: 4,
    };
    return hierarchy[role] ?? -1;
  }
}
```

---

## 3. API Endpoints

### 3.1 PoP Endpoints

**GET /api/pop/score**

```json
{
  "popScore": 65,
  "nfcScore": 40,
  "socialScore": 70,
  "timeScore": 60,
  "level": "verified"
}
```

**POST /api/pop/attestation**

```json
{
  "attesteeId": "user_id",
  "attestationType": "peer_verification",
  "weight": 15
}
```

### 3.2 UP Endpoints

**GET /api/up/score**

```json
{
  "upScore": 45,
  "shardingStatus": "complete",
  "duplicateRisk": 0.02,
  "trustLevel": "adult"
}
```

**POST /api/up/report-duplicate**

```json
{
  "suspectedUserId": "user_id",
  "evidence": "Same IP address, similar activity patterns"
}
```

---

## Implementation Timeline

| Week | Task                       | Dependencies |
| ---- | -------------------------- | ------------ |
| 1    | NFC schema + scoring       | None         |
| 2    | Social attestations        | Week 1       |
| 3    | Time-based verification    | Week 1-2     |
| 4    | Identity sharding          | Week 1-3     |
| 5    | Duplicate detection voting | Week 4       |
| 6    | Trust escalation system    | Week 1-5     |
| 7    | UI components + testing    | Week 1-6     |
