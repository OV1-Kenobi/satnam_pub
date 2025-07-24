# FROST SIGNATURE INTEGRATION TECHNICAL SPECIFICATION

## **🎯 FROST INTEGRATION OVERVIEW**

### **Current Implementation Status**
- ✅ **Interface Definitions**: Complete FROST interfaces implemented
- ✅ **Method Signatures**: All required function signatures defined
- ⚠️ **Cryptographic Implementation**: Placeholder implementations (requires secp256k1 library)
- ✅ **Integration Points**: Identified with existing Shamir operations
- ✅ **Compatibility**: Designed for Bitcoin/Nostr secp256k1 curve

### **Required Dependencies**
```typescript
// Additional imports needed for full FROST implementation
import * as secp256k1 from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';
```

## **🔧 IMPLEMENTATION ROADMAP**

### **Phase 1: Core FROST Cryptography (IMMEDIATE)**
```typescript
/**
 * Real FROST signature generation implementation
 */
static async generateFROSTSignature(
  message: Uint8Array,
  shares: SecretShare[],
  sessionId?: string
): Promise<FROSTSignature> {
  // 1. Validate threshold requirements
  const validation = this.validateShares(shares);
  if (!validation.valid) {
    throw new Error(`Invalid shares: ${validation.errors.join(', ')}`);
  }

  // 2. Generate nonces for each participant
  const nonces = new Map<number, { commitment: string; nonce: string }>();
  for (const share of shares) {
    const nonce = randomBytes(32);
    const commitment = secp256k1.Point.fromPrivateKey(nonce).toHex();
    nonces.set(share.shareIndex, {
      commitment,
      nonce: Buffer.from(nonce).toString('hex')
    });
  }

  // 3. Compute Lagrange coefficients
  const coefficients = this.computeLagrangeCoefficients(
    shares.map(s => s.shareIndex),
    shares[0].threshold
  );

  // 4. Generate partial signatures
  const partialSignatures = new Map<number, string>();
  for (let i = 0; i < shares.length; i++) {
    const share = shares[i];
    const coeff = coefficients[i];
    
    // Reconstruct partial private key
    const partialKey = this.multiplyScalar(
      Array.from(share.shareValue),
      coeff
    );
    
    // Generate partial signature
    const partialSig = await secp256k1.sign(
      sha256(message),
      Buffer.from(partialKey).toString('hex')
    );
    
    partialSignatures.set(share.shareIndex, partialSig.toCompactHex());
  }

  // 5. Combine partial signatures into final FROST signature
  const finalSignature = this.combineFROSTSignatures(
    partialSignatures,
    nonces,
    message
  );

  return finalSignature;
}
```

### **Phase 2: Signature Verification (HIGH PRIORITY)**
```typescript
/**
 * FROST signature verification with secp256k1
 */
static verifyFROSTSignature(
  signature: FROSTSignature,
  message: Uint8Array,
  publicKey: string
): boolean {
  try {
    // Parse signature components
    const r = BigInt('0x' + signature.r);
    const s = BigInt('0x' + signature.s);
    
    // Verify signature using secp256k1
    const pubKeyPoint = secp256k1.Point.fromHex(publicKey);
    const messageHash = sha256(message);
    
    return secp256k1.verify(
      { r, s },
      messageHash,
      pubKeyPoint
    );
  } catch (error) {
    return false;
  }
}
```

### **Phase 3: Key Reconstruction Enhancement (MEDIUM PRIORITY)**
```typescript
/**
 * Enhanced FROST key reconstruction with public key derivation
 */
static async reconstructFROSTKey(shares: SecretShare[]): Promise<FROSTKeyPair> {
  try {
    // Reconstruct private key using Shamir interpolation
    const privateKeyBytes = await this.reconstructSecretFromShares(shares);
    const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex');
    
    // Derive public key using secp256k1
    const publicKeyPoint = secp256k1.Point.fromPrivateKey(privateKeyHex);
    const publicKeyHex = publicKeyPoint.toHex(true); // compressed format
    
    // Clear sensitive data
    privateKeyBytes.fill(0);
    
    return {
      privateKey: privateKeyHex,
      publicKey: publicKeyHex
    };
  } catch (error) {
    throw new Error(`FROST key reconstruction failed: ${error.message}`);
  }
}
```

## **🔗 INTEGRATION WITH EXISTING SYSTEMS**

### **Unified Messaging Service Integration**
```typescript
// In lib/unified-messaging-service.ts
import { ShamirSecretSharing, FROSTSignature } from '../netlify/functions/crypto/shamir-secret-sharing';

class UnifiedMessagingService {
  /**
   * Sign Nostr event using FROST threshold signatures
   */
  async signEventWithFROST(
    event: NostrEvent,
    guardianShares: SecretShare[]
  ): Promise<NostrEvent> {
    const eventJson = JSON.stringify([
      0,
      event.pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content
    ]);
    
    const messageBytes = new TextEncoder().encode(eventJson);
    const frostSignature = await ShamirSecretSharing.generateFROSTSignature(
      messageBytes,
      guardianShares,
      this.sessionId
    );
    
    // Convert FROST signature to Nostr signature format
    event.sig = this.convertFROSTToNostrSignature(frostSignature);
    
    return event;
  }
}
```

### **Database Schema for FROST Sessions**
```sql
-- Add to unified-messaging-migration.sql
CREATE TABLE frost_signing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    message_hash TEXT NOT NULL,
    participants TEXT[] NOT NULL,
    threshold INTEGER NOT NULL,
    nonce_commitments JSONB DEFAULT '{}',
    partial_signatures JSONB DEFAULT '{}',
    final_signature JSONB,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    
    CONSTRAINT fk_frost_sessions_session FOREIGN KEY (session_id) 
        REFERENCES messaging_sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX idx_frost_sessions_session_id ON frost_signing_sessions(session_id);
CREATE INDEX idx_frost_sessions_status ON frost_signing_sessions(status);
CREATE INDEX idx_frost_sessions_expires_at ON frost_signing_sessions(expires_at);
```

## **⚠️ SECURITY CONSIDERATIONS**

### **Critical Security Requirements**
1. **Nonce Reuse Prevention**: Each FROST signature must use unique nonces
2. **Secure Communication**: Participant coordination must use encrypted channels
3. **Session Isolation**: FROST sessions must be isolated per messaging session
4. **Memory Protection**: All intermediate cryptographic values must be cleared
5. **Replay Protection**: Signatures must include timestamp and session validation

### **Attack Vector Mitigation**
```typescript
/**
 * Secure FROST session management with replay protection
 */
class FROSTSessionManager {
  private static activeSessions = new Map<string, FROSTSigningSession>();
  
  static createSession(
    sessionId: string,
    message: Uint8Array,
    participants: string[],
    threshold: number
  ): FROSTSigningSession {
    // Prevent session replay attacks
    const sessionHash = sha256(
      Buffer.concat([
        Buffer.from(sessionId),
        message,
        Buffer.from(Date.now().toString())
      ])
    ).toString('hex');
    
    const frostSession: FROSTSigningSession = {
      sessionId: sessionHash,
      message,
      participants,
      threshold,
      nonces: new Map(),
      partialSignatures: new Map(),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minute expiry
    };
    
    this.activeSessions.set(sessionHash, frostSession);
    
    // Auto-cleanup expired sessions
    setTimeout(() => {
      this.activeSessions.delete(sessionHash);
    }, 5 * 60 * 1000);
    
    return frostSession;
  }
}
```

## **🧪 TESTING REQUIREMENTS**

### **Unit Tests Required**
1. **FROST Signature Generation**: Test with various threshold configurations
2. **Signature Verification**: Test valid/invalid signature scenarios
3. **Key Reconstruction**: Test with minimum and excess shares
4. **Session Management**: Test session creation, expiry, and cleanup
5. **Security Tests**: Test nonce reuse prevention and replay attacks

### **Integration Tests Required**
1. **Nostr Event Signing**: Test FROST signatures with real Nostr events
2. **Database Integration**: Test FROST session storage and retrieval
3. **Unified Messaging**: Test FROST integration with messaging service
4. **Family Account Recovery**: Test 1-of-2 threshold scenarios

## **📋 IMPLEMENTATION TIMELINE**

**Week 1**: Core FROST cryptography implementation
**Week 2**: Database integration and session management
**Week 3**: Unified messaging service integration
**Week 4**: Security testing and production deployment

**Status**: **READY FOR IMPLEMENTATION** - All interfaces and integration points defined
