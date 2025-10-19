# Phase 1 Week 2 - Quick Reference Guide

## What Was Implemented

### 1. HybridNIP05Verifier - Full Implementation
```typescript
// Usage
const verifier = new HybridNIP05Verifier({
  enableKind0Resolution: true,
  enablePkarrResolution: true,
  enableDnsResolution: true,
  kind0Timeout: 3000,
  pkarrTimeout: 3000,
});

// Verify with hybrid method
const result = await verifier.verifyHybrid(identifier, pubkey);
// Returns: { verified, verificationMethod, nip05, name, picture, about, ... }
```

### 2. VerificationStatusDisplay Component
```typescript
import { VerificationStatusDisplay } from "@/components/identity/VerificationStatusDisplay";

<VerificationStatusDisplay
  status={verificationResult}
  showDetails={true}
  compact={false}
/>
```

### 3. VerificationMethodSelector Component
```typescript
import { VerificationMethodSelector } from "@/components/identity/VerificationMethodSelector";

<VerificationMethodSelector
  selectedMethod="auto"
  onMethodChange={(method) => console.log(method)}
  enabledMethods={["auto", "kind:0", "pkarr", "dns"]}
/>
```

---

## Verification Methods

### kind:0 (Nostr Metadata)
- **Speed**: Fastest (if available)
- **Decentralization**: Fully decentralized
- **Timeout**: 3 seconds
- **Pros**: User-controlled, fast, decentralized
- **Cons**: Requires published kind:0 event

### PKARR (BitTorrent DHT)
- **Speed**: Medium
- **Decentralization**: Fully decentralized
- **Timeout**: 3 seconds
- **Pros**: No DNS required, censorship resistant
- **Cons**: Slower than kind:0

### DNS (NIP-05)
- **Speed**: Medium to slow
- **Decentralization**: Centralized
- **Timeout**: 5 seconds
- **Pros**: Most compatible, widely supported
- **Cons**: Centralized, DNS dependent

---

## API Usage

### Verify Identity
```typescript
const verifier = new HybridNIP05Verifier();
const result = await verifier.verifyHybrid(
  "alice@satnam.pub",
  "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
);

if (result.verified) {
  console.log(`Verified via ${result.verificationMethod}`);
  console.log(`Name: ${result.name}`);
  console.log(`Response time: ${result.response_time_ms}ms`);
}
```

### Clear Cache
```typescript
verifier.clearCache();
```

---

## Component Props

### VerificationStatusDisplay
```typescript
interface VerificationStatusDisplayProps {
  status: VerificationStatus;
  showDetails?: boolean;  // Show detailed info
  compact?: boolean;      // Compact view mode
}
```

### VerificationMethodSelector
```typescript
interface VerificationMethodSelectorProps {
  selectedMethod: VerificationMethod;
  onMethodChange: (method: VerificationMethod) => void;
  enabledMethods?: VerificationMethod[];
  loading?: boolean;
  disabled?: boolean;
}
```

---

## Test Files

### Integration Tests
```bash
npm test tests/hybrid-nip05-verification.integration.test.ts
```

**Coverage**:
- kind:0 resolution
- PKARR resolution
- DNS fallback
- Timeout handling
- Caching behavior
- Error handling

### Performance Tests
```bash
npm test tests/hybrid-verification-performance.test.ts
```

**Benchmarks**:
- Response time by method
- Cache efficiency
- Concurrent requests
- Relay connectivity

---

## Configuration

### Feature Flags
```bash
VITE_HYBRID_IDENTITY_ENABLED=true
VITE_PKARR_ENABLED=true
```

### Timeout Settings
```typescript
const verifier = new HybridNIP05Verifier({
  kind0Timeout: 3000,      // 3 seconds
  pkarrTimeout: 3000,      // 3 seconds
  default_timeout_ms: 5000, // 5 seconds for DNS
  cache_duration_ms: 300000, // 5 minutes cache
});
```

---

## Verification Result Structure

```typescript
interface VerificationStatus {
  verified: boolean;
  verificationMethod: "kind:0" | "pkarr" | "dns" | "none";
  pubkey?: string;
  nip05?: string;
  name?: string;
  picture?: string;
  about?: string;
  error?: string;
  verification_timestamp: number;
  response_time_ms: number;
}
```

---

## Error Handling

### Timeout Error
```typescript
if (result.error === "kind:0 resolution timeout") {
  // Try next method
}
```

### NIP-05 Mismatch
```typescript
if (result.error?.includes("NIP-05 mismatch")) {
  // Identifier doesn't match resolved NIP-05
}
```

### All Methods Failed
```typescript
if (result.verificationMethod === "none") {
  // No verification method succeeded
  console.error(result.error);
}
```

---

## Performance Tips

1. **Use Caching**: Results are cached for 5 minutes
2. **Batch Requests**: Use concurrent verification for multiple identities
3. **Monitor Response Times**: Track `response_time_ms` for performance
4. **Clear Cache When Needed**: Call `clearCache()` to force re-verification

---

## Troubleshooting

### Verification Always Fails
- Check network connectivity
- Verify feature flags are enabled
- Check relay configuration
- Ensure identifier format is correct (user@domain)

### Slow Verification
- Check relay response times
- Verify cache is working
- Monitor network latency
- Consider increasing timeouts

### Method Not Used
- Check if method is enabled in config
- Verify prerequisites (kind:0 event published, PKARR record set)
- Check timeout settings
- Review error messages

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/lib/nip05-verification.ts` | HybridNIP05Verifier implementation |
| `src/components/identity/VerificationStatusDisplay.tsx` | Status display component |
| `src/components/identity/VerificationMethodSelector.tsx` | Method selector component |
| `tests/hybrid-nip05-verification.integration.test.ts` | Integration tests |
| `tests/hybrid-verification-performance.test.ts` | Performance tests |

---

## Next Steps

1. **Week 3**: Integrate into authentication flows
2. **Week 4**: Add monitoring and alerting
3. **Week 5**: User testing and documentation

---

## Support

For issues or questions:
1. Check `PHASE1_WEEK2_IMPLEMENTATION_SUMMARY.md` for detailed documentation
2. Review test files for usage examples
3. Check component props for configuration options
4. Monitor response times for performance issues

