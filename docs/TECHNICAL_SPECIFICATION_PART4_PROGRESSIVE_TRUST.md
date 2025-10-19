# Part 4: Progressive Trust System Specification

## Overview

This specification extends the existing `src/lib/trust/trust-score.ts` with time-based escalation, action-based reputation, progressive feature disclosure, and trust decay mechanisms.

---

## 1. Time-Based Trust Escalation

### 1.1 Trust Increase Formula

**Formula:**

```
trust_delta = (account_age_factor × 0.4) + (activity_frequency_factor × 0.35) + (success_rate_factor × 0.25)

Where:
- account_age_factor: 0-100 (based on days since creation)
- activity_frequency_factor: 0-100 (actions in last 30 days)
- success_rate_factor: 0-100 (successful transactions / total transactions)
```

**Checkpoint Intervals:**

```typescript
// File: src/lib/trust/progressive-escalation.ts
export const TRUST_CHECKPOINTS = [
  { days: 7, name: "week_one", trustBonus: 5 },
  { days: 30, name: "month_one", trustBonus: 15 },
  { days: 90, name: "quarter_one", trustBonus: 25 },
  { days: 180, name: "half_year", trustBonus: 35 },
  { days: 365, name: "year_one", trustBonus: 50 },
];

export class TimeBasedEscalationService {
  async calculateTrustDelta(userId: string): Promise<number> {
    const metrics = await this.getUserMetrics(userId);

    // Account age factor (0-100)
    const accountAgeDays = Math.floor(
      (Date.now() - metrics.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    const ageFactorMax = Math.min(accountAgeDays / 365, 1); // Cap at 1 year
    const ageFactor = ageFactorMax * 100;

    // Activity frequency factor (0-100)
    const activityCount = metrics.actionsLast30Days;
    const activityFactor = Math.min((activityCount / 30) * 100, 100); // 1 action/day = 100

    // Success rate factor (0-100)
    const successRate =
      metrics.totalTransactions > 0
        ? metrics.successfulTransactions / metrics.totalTransactions
        : 0;
    const successFactor = successRate * 100;

    // Calculate delta
    const delta =
      ageFactor * 0.4 + activityFactor * 0.35 + successFactor * 0.25;

    return Math.min(delta, 100);
  }

  async checkCheckpoints(userId: string): Promise<CheckpointReached[]> {
    const user = await this.getUser(userId);
    const accountAgeDays = Math.floor(
      (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    const reached: CheckpointReached[] = [];
    for (const checkpoint of TRUST_CHECKPOINTS) {
      if (accountAgeDays >= checkpoint.days) {
        const alreadyRewarded = await this.checkpointAlreadyRewarded(
          userId,
          checkpoint.name
        );
        if (!alreadyRewarded) {
          reached.push({
            checkpoint: checkpoint.name,
            trustBonus: checkpoint.trustBonus,
            reachedAt: new Date(),
          });
          await this.recordCheckpointReward(userId, checkpoint.name);
        }
      }
    }

    return reached;
  }
}
```

### 1.2 Database Schema for Trust History

```sql
CREATE TABLE IF NOT EXISTS public.trust_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  trust_score_before SMALLINT,
  trust_score_after SMALLINT,
  trust_delta SMALLINT,
  reason VARCHAR(50),  -- 'checkpoint', 'action', 'decay', 'manual'
  checkpoint_name VARCHAR(50),
  action_type VARCHAR(50),
  metadata JSONB,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_trust_history_user ON public.trust_history(user_id);
CREATE INDEX idx_trust_history_recorded ON public.trust_history(recorded_at);

ALTER TABLE public.trust_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_see_own_trust_history" ON public.trust_history
  FOR SELECT USING (user_id = auth.uid());
```

### 1.3 Database Schema for Reputation Actions

```sql
CREATE TABLE IF NOT EXISTS public.reputation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL,  -- 'lightning_payment_sent', 'peer_attestation_given', etc.
  weight SMALLINT NOT NULL,  -- Action weight (1-25)
  category VARCHAR(50) NOT NULL,  -- 'payment', 'social', 'governance', 'engagement'
  metadata JSONB,  -- Additional context (e.g., amount, recipient, attestation details)
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reputation_actions_user ON public.reputation_actions(user_id);
CREATE INDEX idx_reputation_actions_recorded ON public.reputation_actions(recorded_at);
CREATE INDEX idx_reputation_actions_category ON public.reputation_actions(category);

ALTER TABLE public.reputation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_see_own_reputation_actions" ON public.reputation_actions
  FOR SELECT USING (user_id = auth.uid());
```

---

## 2. Action-Based Reputation

### 2.1 Weighted Actions

**Action Weights:**

```typescript
// File: src/lib/trust/action-reputation.ts
export const ACTION_WEIGHTS = {
  // Payments
  lightning_payment_sent: { weight: 5, category: "payment" },
  lightning_payment_received: { weight: 3, category: "payment" },
  cashu_payment_sent: { weight: 4, category: "payment" },
  fedimint_payment_sent: { weight: 6, category: "payment" },

  // Social
  peer_attestation_given: { weight: 10, category: "social" },
  peer_attestation_received: { weight: 8, category: "social" },
  nfc_peer_scan: { weight: 4, category: "social" },

  // Guardian
  guardian_approval_given: { weight: 20, category: "governance" },
  guardian_approval_received: { weight: 15, category: "governance" },
  federation_created: { weight: 25, category: "governance" },

  // Engagement
  message_sent: { weight: 1, category: "engagement" },
  contact_added: { weight: 2, category: "engagement" },
  profile_updated: { weight: 3, category: "engagement" },
};

export class ActionReputationService {
  async recordAction(
    userId: string,
    actionType: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const weight = ACTION_WEIGHTS[actionType as keyof typeof ACTION_WEIGHTS];
    if (!weight) throw new Error(`Unknown action type: ${actionType}`);

    // 1. Record action
    await supabase.from("reputation_actions").insert({
      user_id: userId,
      action_type: actionType,
      weight: weight.weight,
      category: weight.category,
      metadata,
      recorded_at: new Date().toISOString(),
    });

    // 2. Update reputation score
    const newScore = await this.calculateReputationScore(userId);
    await supabase
      .from("user_identities")
      .update({ reputation_score: newScore })
      .eq("id", userId);

    // 3. Check for trust escalation
    const escalation = await this.checkTrustEscalation(userId);
    if (escalation) {
      await this.applyTrustEscalation(userId, escalation);
    }
  }

  async calculateReputationScore(userId: string): Promise<number> {
    const actions = await supabase
      .from("reputation_actions")
      .select("weight, recorded_at")
      .eq("user_id", userId)
      .gte(
        "recorded_at",
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      );

    let score = 0;
    for (const action of actions.data || []) {
      // Apply decay based on age
      const ageMs = Date.now() - new Date(action.recorded_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const decayFactor = Math.exp(-ageDays / 30); // Exponential decay over 30 days
      score += action.weight * decayFactor;
    }

    return Math.min(Math.floor(score), 100);
  }
}
```

### 2.2 Reputation Decay

**Decay Formula:**

```typescript
// File: src/lib/trust/reputation-decay.ts
export class ReputationDecayService {
  async calculateDecay(userId: string): Promise<number> {
    const user = await this.getUser(userId);
    const lastActivityMs = Date.now() - new Date(user.lastActivityAt).getTime();
    const inactiveDays = lastActivityMs / (1000 * 60 * 60 * 24);

    // Decay formula: starts at 0 days, reaches -15 at 180 days
    if (inactiveDays <= 30) return 0; // Grace period
    if (inactiveDays >= 180) return -15;

    const decayRate = -15 / (180 - 30);
    return decayRate * (inactiveDays - 30);
  }

  async applyDecay(userId: string): Promise<void> {
    const decay = await this.calculateDecay(userId);
    if (decay < 0) {
      const currentScore = await this.getCurrentTrustScore(userId);
      const newScore = Math.max(currentScore + decay, 0);

      await supabase.from("trust_history").insert({
        user_id: userId,
        trust_score_before: currentScore,
        trust_score_after: newScore,
        trust_delta: decay,
        reason: "decay",
        metadata: { inactiveDays: Math.floor(inactiveDays) },
      });

      await supabase
        .from("user_identities")
        .update({ trust_score: newScore })
        .eq("id", userId);
    }
  }

  async preventDecay(userId: string, action: string): Promise<void> {
    // Update last activity timestamp
    await supabase
      .from("user_identities")
      .update({ lastActivityAt: new Date().toISOString() })
      .eq("id", userId);

    // Record decay prevention
    await supabase.from("trust_history").insert({
      user_id: userId,
      reason: "decay_prevention",
      metadata: { action },
    });
  }
}
```

---

## 3. Progressive Feature Disclosure

### 3.1 Feature Gate Mapping

```typescript
// File: src/lib/trust/feature-gates.ts
export const FEATURE_GATES = {
  // Basic features (trust: 0+)
  basic_messaging: { minTrust: 0, minPop: 0, minUp: 0 },
  view_contacts: { minTrust: 0, minPop: 0, minUp: 0 },

  // Intermediate features (trust: 25+)
  cashu_payments: { minTrust: 25, minPop: 25, minUp: 0 },
  create_lightning_address: { minTrust: 25, minPop: 25, minUp: 10 },

  // Advanced features (trust: 50+)
  lightning_payments: { minTrust: 50, minPop: 50, minUp: 30 },
  create_family_federation: { minTrust: 50, minPop: 50, minUp: 40 },

  // Guardian features (trust: 75+)
  guardian_role: { minTrust: 75, minPop: 75, minUp: 60 },
  approve_transactions: { minTrust: 75, minPop: 75, minUp: 60 },
  manage_federation: { minTrust: 75, minPop: 75, minUp: 60 },

  // Admin features (trust: 90+)
  admin_panel: { minTrust: 90, minPop: 90, minUp: 85 },
  manage_instances: { minTrust: 90, minPop: 90, minUp: 85 },
};

export class FeatureGateService {
  async isFeatureAvailable(
    userId: string,
    featureName: string
  ): Promise<boolean> {
    const gate = FEATURE_GATES[featureName as keyof typeof FEATURE_GATES];
    if (!gate) return false;

    const user = await this.getUser(userId);
    const popScore = await this.calculatePopScore(userId);
    const upScore = await this.calculateUpScore(userId);

    return (
      user.trustScore >= gate.minTrust &&
      popScore >= gate.minPop &&
      upScore >= gate.minUp
    );
  }

  async getLockedFeatures(userId: string): Promise<LockedFeature[]> {
    const user = await this.getUser(userId);
    const popScore = await this.calculatePopScore(userId);
    const upScore = await this.calculateUpScore(userId);

    const locked: LockedFeature[] = [];
    for (const [featureName, gate] of Object.entries(FEATURE_GATES)) {
      const isAvailable =
        user.trustScore >= gate.minTrust &&
        popScore >= gate.minPop &&
        upScore >= gate.minUp;

      if (!isAvailable) {
        locked.push({
          featureName,
          requirements: {
            trustScore: { current: user.trustScore, required: gate.minTrust },
            popScore: { current: popScore, required: gate.minPop },
            upScore: { current: upScore, required: gate.minUp },
          },
          nextMilestone: this.getNextMilestone(user.trustScore, gate.minTrust),
        });
      }
    }

    return locked;
  }
}
```

### 3.2 UI Components for Locked Features

```typescript
// File: src/components/FeatureGate.tsx
interface FeatureRequirements {
  trustScore: { current: number; required: number };
  popScore: { current: number; required: number };
  upScore: { current: number; required: number };
}

export function FeatureGate({
  featureName,
  children,
  fallback,
}: {
  featureName: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [requirements, setRequirements] = useState<FeatureRequirements | null>(
    null
  );

  useEffect(() => {
    const checkAccess = async () => {
      const available = await featureGateService.isFeatureAvailable(
        currentUserId,
        featureName
      );
      setIsAvailable(available);

      if (!available) {
        const locked = await featureGateService.getLockedFeatures(
          currentUserId
        );
        const feature = locked.find((f) => f.featureName === featureName);
        setRequirements(feature?.requirements);
      }
    };

    checkAccess();
  }, [featureName, currentUserId]);

  if (isAvailable) return <>{children}</>;

  return (
    fallback || (
      <div className="p-4 border border-yellow-300 rounded bg-yellow-50">
        <h3 className="font-bold">Feature Locked</h3>
        <p>You need to reach the following milestones:</p>
        <ul className="mt-2 space-y-1">
          {requirements && (
            <>
              <li>
                Trust Score: {requirements.trustScore.current}/
                {requirements.trustScore.required}
              </li>
              <li>
                PoP Score: {requirements.popScore.current}/
                {requirements.popScore.required}
              </li>
              <li>
                UP Score: {requirements.upScore.current}/
                {requirements.upScore.required}
              </li>
            </>
          )}
        </ul>
      </div>
    )
  );
}
```

---

## 4. Trust Decay Mechanism

### 4.1 Decay Formula

```typescript
// File: src/lib/trust/decay-mechanism.ts
export class TrustDecayService {
  async calculateDecay(userId: string): Promise<DecayResult> {
    const user = await this.getUser(userId);
    const lastActivityMs = Date.now() - new Date(user.lastActivityAt).getTime();
    const inactiveDays = lastActivityMs / (1000 * 60 * 60 * 24);

    // Decay schedule
    const decaySchedule = [
      { days: 30, penalty: 0, status: "active" },
      { days: 60, penalty: -5, status: "warning" },
      { days: 90, penalty: -10, status: "at_risk" },
      { days: 180, penalty: -15, status: "critical" },
    ];

    let penalty = 0;
    let status = "active";
    for (const schedule of decaySchedule) {
      if (inactiveDays >= schedule.days) {
        penalty = schedule.penalty;
        status = schedule.status;
      }
    }

    return { penalty, status, inactiveDays };
  }

  async applyDecayIfNeeded(userId: string): Promise<void> {
    const decay = await this.calculateDecay(userId);

    if (decay.penalty < 0) {
      const currentScore = await this.getCurrentTrustScore(userId);
      const newScore = Math.max(currentScore + decay.penalty, 0);

      await supabase
        .from("user_identities")
        .update({ trustScore: newScore })
        .eq("id", userId);

      // Notify user if critical
      if (decay.status === "critical") {
        await this.sendDecayWarning(userId, decay);
      }
    }
  }

  async preventDecay(userId: string): Promise<void> {
    // Any of these actions prevent decay
    const preventionActions = [
      "login",
      "send_message",
      "send_payment",
      "receive_payment",
      "update_profile",
    ];

    await supabase
      .from("user_identities")
      .update({ lastActivityAt: new Date().toISOString() })
      .eq("id", userId);
  }
}
```

### 4.2 Grace Periods and Exemptions

```typescript
// File: src/lib/trust/decay-exemptions.ts
export class DecayExemptionService {
  async isExemptFromDecay(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);

    // Exemptions
    const exemptions = [
      // New accounts (< 30 days)
      user.createdAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),

      // Guardian role (trusted users)
      user.role === "guardian",

      // Active federation members
      await this.isActiveFederationMember(userId),

      // Recent large transaction
      await this.hasRecentLargeTransaction(userId),
    ];

    return exemptions.some((e) => e);
  }

  async getDecayWarning(userId: string): Promise<DecayWarning | null> {
    const decay = await this.calculateDecay(userId);

    if (decay.status === "warning") {
      return {
        message: `Your trust score will decay in ${Math.max(
          0,
          60 - Math.floor(decay.inactiveDays)
        )} days`,
        preventionActions: ["login", "send_message", "send_payment"],
        urgency: "low",
      };
    }

    if (decay.status === "at_risk") {
      return {
        message: `Your trust score is at risk of decay. Take action within ${Math.max(
          0,
          90 - Math.floor(decay.inactiveDays)
        )} days`,
        preventionActions: ["login", "send_message", "send_payment"],
        urgency: "medium",
      };
    }

    if (decay.status === "critical") {
      return {
        message: `Your trust score will decay immediately. Take action now!`,
        preventionActions: ["login", "send_message", "send_payment"],
        urgency: "high",
      };
    }

    return null;
  }
}
```

---

## 5. API Endpoints

### 5.1 Trust Score Endpoints

**GET /api/trust/score**

```json
{
  "trustScore": 65,
  "popScore": 70,
  "upScore": 45,
  "reputationScore": 55,
  "nextCheckpoint": "month_one",
  "daysToNextCheckpoint": 15
}
```

**GET /api/trust/history**

```json
{
  "history": [
    {
      "date": "2025-10-18",
      "reason": "checkpoint",
      "delta": 15,
      "checkpoint": "week_one"
    }
  ]
}
```

**GET /api/trust/features**

```json
{
  "available": ["basic_messaging", "cashu_payments"],
  "locked": [
    {
      "featureName": "lightning_payments",
      "requirements": {
        "trustScore": { "current": 65, "required": 50 }
      }
    }
  ]
}
```

---

## Implementation Timeline

| Week | Task                              | Dependencies |
| ---- | --------------------------------- | ------------ |
| 1    | Time-based escalation schema      | None         |
| 2    | Action-based reputation system    | Week 1       |
| 3    | Reputation decay mechanism        | Week 2       |
| 4    | Feature gate system               | Week 1-3     |
| 5    | UI components for locked features | Week 4       |
| 6    | Trust decay warnings              | Week 3       |
| 7    | Testing & documentation           | Week 1-6     |
