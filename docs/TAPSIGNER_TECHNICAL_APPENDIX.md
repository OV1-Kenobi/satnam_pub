# Tapsigner Integration - Technical Appendix

## A. Architecture Diagrams

### Current NTAG424 Flow

```
Browser (Web NFC API)
    ↓
NTAG424 card (NDEF)
    ↓
Server: PIN validation (LNbits)
    ↓
Session created (JWT)
```

### Proposed Tapsigner Flow

```
Browser (Web NFC API)
    ↓
Tapsigner card (ISO7816 + NDEF)
    ↓
Card returns: public key + signature
    ↓
Server: signature verification
    ↓
Session created (JWT)
```

### Hybrid Flow (NTAG424 + Tapsigner)

```
User selects MFA type
    ↓
├─ NTAG424 → PIN validation → Session
└─ Tapsigner → Signature verification → Session
```

---

## B. Database Schema

### Tapsigner Registrations Table

```sql
CREATE TABLE IF NOT EXISTS public.tapsigner_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hash TEXT NOT NULL,
  card_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  xpub TEXT,
  derivation_path TEXT DEFAULT "m/84h/0h/0h",
  family_role TEXT DEFAULT 'private',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used TIMESTAMPTZ,
  
  FOREIGN KEY (owner_hash) REFERENCES privacy_users(hashed_uuid)
);

CREATE INDEX idx_tapsigner_owner ON tapsigner_registrations(owner_hash);
CREATE INDEX idx_tapsigner_card_id ON tapsigner_registrations(card_id);

ALTER TABLE tapsigner_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tapsigner_owner ON tapsigner_registrations
  FOR ALL USING (owner_hash = current_setting('app.current_user_hash'))
  WITH CHECK (owner_hash = current_setting('app.current_user_hash'));
```

### Tapsigner Operations Log

```sql
CREATE TABLE IF NOT EXISTS public.tapsigner_operations_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hash TEXT NOT NULL,
  card_id TEXT NOT NULL,
  operation_type TEXT CHECK (operation_type IN ('setup', 'sign', 'verify', 'login')),
  success BOOLEAN NOT NULL,
  error_message TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  FOREIGN KEY (owner_hash) REFERENCES privacy_users(hashed_uuid)
);

CREATE INDEX idx_tapsigner_ops_owner ON tapsigner_operations_log(owner_hash);
```

---

## C. Feature Flag Configuration

### env.client.ts

```typescript
const TAPSIGNER_ENABLED =
  (getEnvVar("VITE_TAPSIGNER_ENABLED") || "false")
    .toString()
    .toLowerCase() === "true";

export const clientConfig = {
  flags: {
    tapsignerEnabled: TAPSIGNER_ENABLED,
    // ... other flags
  }
};
```

### vite.config.js

```javascript
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'tapsigner-mfa': [
            'src/lib/tapsigner-protocol.ts',
            'src/hooks/useTapsignerAuth.ts',
            'src/components/TapsignerAuthModal.tsx'
          ]
        }
      }
    }
  }
};
```

---

## D. Code Examples

### Tapsigner Protocol Implementation

```typescript
// src/lib/tapsigner-protocol.ts
export class TapsignerProtocol {
  async readCard(): Promise<TapsignerCard> {
    if (!('NDEFReader' in window)) {
      throw new Error('NFC not supported');
    }
    
    const reader = new (window as any).NDEFReader();
    return new Promise((resolve, reject) => {
      reader.scan().then(() => {
        reader.onreading = (event: any) => {
          const card = this.parseCard(event.message);
          resolve(card);
        };
      }).catch(reject);
    });
  }
  
  async signData(data: string): Promise<string> {
    const card = await this.readCard();
    // Card performs ECDSA signing
    return card.signature;
  }
  
  verifySignature(data: string, signature: string, publicKey: string): boolean {
    // Verify ECDSA signature using Web Crypto API
    return this.ecdsaVerify(data, signature, publicKey);
  }
}
```

### React Hook

```typescript
// src/hooks/useTapsignerAuth.ts
export const useTapsignerAuth = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const authenticate = useCallback(async () => {
    setIsProcessing(true);
    try {
      const protocol = new TapsignerProtocol();
      const card = await protocol.readCard();
      
      const response = await fetch('/api/tapsigner-unified/verify', {
        method: 'POST',
        body: JSON.stringify({
          cardId: card.id,
          publicKey: card.publicKey,
          signature: card.signature
        })
      });
      
      const data = await response.json();
      if (data.success) {
        // Session created
        return data.sessionToken;
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  }, []);
  
  return { authenticate, isProcessing, error };
};
```

### Netlify Function

```typescript
// netlify/functions_active/tapsigner-unified.ts
export const handler: Handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  
  switch (body.operation) {
    case 'verify':
      return await handleVerify(event);
    case 'register':
      return await handleRegister(event);
    default:
      return { statusCode: 404 };
  }
};

async function handleVerify(event: any) {
  const { cardId, publicKey, signature } = JSON.parse(event.body);
  
  // Verify signature
  const isValid = verifyECDSA(signature, publicKey);
  
  if (isValid) {
    // Create session
    const sessionToken = createJWT(cardId);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, sessionToken })
    };
  }
  
  return { statusCode: 401, body: JSON.stringify({ success: false }) };
}
```

---

## E. Security Considerations

### ECDSA Signature Verification

```typescript
async function verifyECDSASignature(
  data: string,
  signature: string,
  publicKeyHex: string
): Promise<boolean> {
  const publicKey = await crypto.subtle.importKey(
    'raw',
    hexToBytes(publicKeyHex),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );
  
  return crypto.subtle.verify(
    'ECDSA',
    publicKey,
    hexToBytes(signature),
    new TextEncoder().encode(data)
  );
}
```

### Constant-Time Comparison

```typescript
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
```

---

## F. Testing Strategy

### Unit Tests

```typescript
describe('TapsignerProtocol', () => {
  it('should verify valid ECDSA signature', async () => {
    const protocol = new TapsignerProtocol();
    const result = await protocol.verifySignature(
      'test data',
      validSignature,
      validPublicKey
    );
    expect(result).toBe(true);
  });
  
  it('should reject invalid signature', async () => {
    const protocol = new TapsignerProtocol();
    const result = await protocol.verifySignature(
      'test data',
      invalidSignature,
      validPublicKey
    );
    expect(result).toBe(false);
  });
});
```

### Integration Tests

```typescript
describe('Tapsigner Integration', () => {
  it('should complete full auth flow', async () => {
    // 1. Simulate card tap
    // 2. Verify signature
    // 3. Create session
    // 4. Verify JWT token
  });
});
```

---

## G. Comparison: NTAG424 vs Tapsigner vs Satochip

| Feature | NTAG424 | Tapsigner | Satochip |
|---------|---------|-----------|----------|
| Browser | ✅ | ✅ | ❌ |
| Mobile | ✅ | ✅ | ❌ |
| Tap-to-sign | ❌ | ✅ | ✅ |
| ECDSA | ❌ | ✅ | ✅ |
| Hardware PIN | ❌ | ✅ | ✅ |
| Backup | ❌ | ✅ | ✅ |
| Serverless | ✅ | ✅ | ❌ |
| JS library | ✅ | ✅ | ❌ |
| Cost | $0 | $11.5-18K | $38-54K |
| Timeline | Done | 3-4 weeks | 5-8 weeks |

---

## H. Migration Path

### Phase 1: Parallel Implementation
- Keep NTAG424 fully functional
- Add Tapsigner as separate code path
- No shared logic initially

### Phase 2: Abstraction Layer
- Create `PhysicalMFAAdapter` interface
- Implement for both NTAG424 and Tapsigner
- Reduce code duplication

### Phase 3: User Migration
- Allow users to switch between devices
- Provide migration UI
- Maintain backward compatibility

---

## Conclusion

Tapsigner integration is **technically straightforward** and offers:
- ✅ Browser-native NFC support
- ✅ Advanced signing capabilities
- ✅ Reasonable implementation cost
- ✅ Shorter timeline than Satochip
- ✅ Maintains zero-knowledge architecture

**Recommendation**: **PROCEED WITH TAPSIGNER** as superior alternative to Satochip.

