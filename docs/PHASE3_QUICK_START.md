# Phase 3: Frontend Integration - Quick Start Guide

**For Developers**: Quick reference for using Phase 3 components

---

## 1. Trust Score Calculator

### Import
```typescript
import {
  calculateTrustScore,
  getTrustLevelBadge,
  formatTrustScore,
  TrustScoreBreakdown,
  VerificationData,
} from '@/lib/trust-score-calculator';
```

### Calculate Score
```typescript
const verificationData: VerificationData = {
  simpleproofTimestamp: {
    verified: true,
    bitcoinBlock: 123456,
    createdAt: Math.floor(Date.now() / 1000),
  },
  irohNodeDiscovery: {
    isReachable: true,
    discoveredAt: Math.floor(Date.now() / 1000),
  },
  nip05Verified: true,
  accountCreatedAt: Math.floor(Date.now() / 1000),
};

const breakdown = calculateTrustScore(verificationData);
console.log(`Score: ${formatTrustScore(breakdown.totalScore)}`);
// Output: "Score: 35/100"

const badge = getTrustLevelBadge(breakdown.totalScore);
console.log(`Level: ${badge.level}`); // "partial"
```

---

## 2. Attestation Manager

### Import
```typescript
import {
  createAttestation,
  getAttestations,
  getAttestation,
  formatAttestation,
  AttestationEventType,
  Attestation,
} from '@/lib/attestation-manager';
```

### Create Attestation
```typescript
const attestation = await createAttestation({
  verificationId: 'user-verification-id',
  eventType: 'account_creation',
  metadata: 'Account created via Identity Forge',
  includeSimpleproof: true,
  includeIroh: false,
});

console.log(`Status: ${attestation.status}`);
```

### Retrieve Attestations
```typescript
const attestations = await getAttestations('user-verification-id');
attestations.forEach((att) => {
  const formatted = formatAttestation(att);
  console.log(`${formatted.title} - ${formatted.timestamp}`);
});
```

---

## 3. Verification Badge Component

### Import
```typescript
import { VerificationBadge } from '@/components/identity/VerificationBadge';
```

### Compact Badge
```typescript
<VerificationBadge
  score={75}
  compact={true}
  showTooltip={true}
  onClick={() => console.log('Badge clicked')}
/>
```

### Detailed Badge
```typescript
<VerificationBadge
  score={75}
  breakdown={trustScoreBreakdown}
  compact={false}
  showTooltip={true}
/>
```

---

## 4. Attestation History Table

### Import
```typescript
import { AttestationHistoryTable } from '@/components/identity/AttestationHistoryTable';
```

### Usage
```typescript
<AttestationHistoryTable
  verificationId="user-verification-id"
  onViewDetails={(attestation) => {
    console.log('View details:', attestation);
  }}
/>
```

---

## 5. Manual Attestation Modal

### Import
```typescript
import { ManualAttestationModal } from '@/components/identity/ManualAttestationModal';
```

### Usage
```typescript
const [showModal, setShowModal] = useState(false);

<ManualAttestationModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  verificationId="user-verification-id"
  onSuccess={() => {
    console.log('Attestation created');
    loadAttestations();
  }}
/>
```

---

## Common Patterns

### Display User's Trust Score
```typescript
import { useAuth } from '@/components/auth/AuthProvider';
import { calculateTrustScore } from '@/lib/trust-score-calculator';
import { VerificationBadge } from '@/components/identity/VerificationBadge';

export function UserTrustDisplay() {
  const { user } = useAuth();
  const [breakdown, setBreakdown] = useState<TrustScoreBreakdown | null>(null);

  useEffect(() => {
    if (user?.verificationData) {
      const score = calculateTrustScore(user.verificationData);
      setBreakdown(score);
    }
  }, [user]);

  if (!breakdown) return null;

  return (
    <VerificationBadge
      score={breakdown.totalScore}
      breakdown={breakdown}
      compact={false}
    />
  );
}
```

### Create Attestation on Event
```typescript
import { createAttestation } from '@/lib/attestation-manager';
import { showToast } from '@/services/toastService';

async function handleProfileUpdate(verificationId: string) {
  try {
    const attestation = await createAttestation({
      verificationId,
      eventType: 'profile_update',
      metadata: 'Profile updated via dashboard',
      includeSimpleproof: true,
      includeIroh: false,
    });

    showToast.success('Profile update timestamped');
  } catch (error) {
    showToast.error('Failed to create attestation');
  }
}
```

### Display Attestations in Dashboard
```typescript
import { AttestationHistoryTable } from '@/components/identity/AttestationHistoryTable';
import { ManualAttestationModal } from '@/components/identity/ManualAttestationModal';

export function AttestationsSection({ verificationId }: { verificationId: string }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-white">Identity Attestations</h3>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
        >
          Create New Timestamp
        </button>
      </div>

      <AttestationHistoryTable
        verificationId={verificationId}
        onViewDetails={(att) => console.log('View:', att)}
      />

      <ManualAttestationModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        verificationId={verificationId}
        onSuccess={() => console.log('Attestation created')}
      />
    </div>
  );
}
```

---

## Feature Flag Gating

### Check Flags
```typescript
import { clientConfig } from '@/config/env.client';

if (clientConfig.flags.simpleproofEnabled) {
  // Show SimpleProof UI
}

if (clientConfig.flags.irohEnabled) {
  // Show Iroh UI
}
```

### Conditional Rendering
```typescript
{clientConfig.flags.simpleproofEnabled && (
  <VerificationBadge score={75} compact={true} />
)}
```

---

## Error Handling

### Try-Catch Pattern
```typescript
try {
  const attestation = await createAttestation({
    verificationId,
    eventType: 'account_creation',
    includeSimpleproof: true,
  });
  showToast.success('Attestation created');
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  showToast.error(`Failed: ${message}`);
  console.error('Attestation error:', error);
}
```

---

## Testing

### Unit Test Example
```typescript
import { calculateTrustScore, getTrustLevelBadge } from '@/lib/trust-score-calculator';

describe('Trust Score Calculator', () => {
  it('should calculate correct score', () => {
    const data = {
      simpleproofTimestamp: { verified: true, createdAt: Date.now() / 1000 },
      nip05Verified: true,
    };

    const breakdown = calculateTrustScore(data);
    expect(breakdown.totalScore).toBe(15); // 10 + 5
  });

  it('should return verified badge for high score', () => {
    const badge = getTrustLevelBadge(75);
    expect(badge.level).toBe('verified');
  });
});
```

---

## Performance Tips

1. **Lazy Load Attestations**: Use pagination for large lists
2. **Cache Trust Scores**: Store in state with 1-hour TTL
3. **Debounce Form Input**: Prevent excessive API calls
4. **Memoize Components**: Use React.memo for VerificationBadge

---

## Troubleshooting

### "Feature flag not enabled"
- Check `VITE_SIMPLEPROOF_ENABLED` and `VITE_IROH_ENABLED` env vars
- Verify `src/config/env.client.ts` has flags defined

### "Attestation creation failed"
- Check network connectivity
- Verify API endpoints are accessible
- Check rate limiting (20/hour for discovery, 50/hour for verify)

### "Trust score not updating"
- Verify verification data is complete
- Check database queries for errors
- Ensure RLS policies allow access

---

## Resources

- **Full Guide**: `docs/PHASE3_FRONTEND_INTEGRATION_GUIDE.md`
- **Status**: `docs/PHASE3_IMPLEMENTATION_STATUS.md`
- **Architecture**: `docs/SIMPLEPROOF_ARCHITECTURE_INTEGRATION.md`

---

**Last Updated**: 2025-10-21  
**Version**: 1.0


