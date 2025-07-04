# Satnam.pub Sovereign Family Banking & Identity Forge — Master Agent Context

## 🚨 CRITICAL: READ BEFORE MAKING ANY CHANGES

This document serves as the master context for all development work on the Satnam.pub sovereign family banking platform. **NEVER deviate from these protocols without explicit approval.**

---

## Mission & Core Principles

**Mission:**  
Satnam.pub is a Bitcoin-only, privacy-first, sovereign family banking and identity platform. The codebase is architected for maximum user sovereignty, minimal third-party trust, and full self-authentication, as well as progressive self-custody. All communications and payments are built on open protocols—Bitcoin, Lightning, Nostr, and Chaumian eCash—without altcoins or unnecessary intermediaries.

**Key Principles:**

- **Bitcoin-only:** No altcoins, no tokens. All payment and authentication is Bitcoin-native and denominated in satoshis as the standard unit of account (on and off-chain Bitcoin, Fedimint, Cashu).
- **Privacy-first:** End-to-end encryption, metadata minimization, no external logging, and user-controlled data, private by default.
- **Sovereignty:** Users control their keys, identities, and funds. No custodial risk, no vendor lock-in.
- **Auditability:** All code, infrastructure, and flows are transparent, documented, and verifiable both personally and programatically.
- **Modularity:** Clear separation of frontend (React/Vite) and backend (Netlify Functions). No Node.js server code in the frontend.

---

## Technical Architecture

### Browser-Based Serverless Environment

- **ONLY** use browser-compatible APIs - Web Crypto API, fetch, localStorage
- **NO** Node.js modules: crypto, events, fs, path, stream, util
- **NO** polyfills or Node.js compatibility layers
- All frontend code must be browser-only (React/Vite)
- All backend logic in Netlify Functions
- Use TypeScript (.ts/.tsx) for components, JavaScript (.js) for API routes
- Strict separation of concerns, barrel files for all modules

### File Structure Compliance

```
src/
├── components/           # React components (.tsx)
├── lib/                  # Utility functions (.ts)
├── types/                # TypeScript definitions (.ts)
├── hooks/                # React hooks (.ts)
api/                      # Serverless functions (.js)
```

---

## Security & Privacy Protocols

### Privacy-First Architecture

- **NEVER** log user data, transaction details, or family information
- **NO** external logging services or third-party analytics
- Use Supabase Vault for all sensitive credentials
- Implement data minimization - collect only essential information
- All communications must use NIP-59 Gift Wrapped messaging
- Provide programmable deletability controls for all user data with a unified deletion modal
- Client-side verification for all security operations
- User-controlled, locally-stored encrypted audit logs (optional)
- Differential privacy techniques for any aggregated data
- Ephemeral computing - process data in memory without persistence
- Secure multi-party computation for collaborative operations
- Plausible deniability features for sensitive operations

### Encryption & Security Standards

- Use Web Crypto API for all cryptographic operations
- AES-256-GCM for data encryption
- Store secrets in Supabase Vault, **NOT** .env files
- Implement end-to-end encryption for all family communications
- Privacy metrics for all communications and transactions
- HTTPS enforcement with strict TLS requirements
- Content Security Policy (CSP) headers for XSS prevention
- Rate limiting for authentication endpoints
- Input validation using Zod schemas
- Secure JWT token management with automatic expiration
- All destructive operations must have rollback instructions

### Authentication Layers

1. **NIP-07** Browser extension signing
2. **Direct nsec import** For secure key management
3. **OTP invitation** For secure onboarding
4. **Hardware security** Integration (future)

### Secure Family Operations

1. **Secure Multi-Party Computation (MPC)** For family treasury management
2. **Threshold Signatures** For distributed approval without revealing keys
3. **Blind Custody** For parental controls without visibility into child transactions
4. **Privacy-Preserving Verification** For age/identity verification without data exposure

### Zero-Knowledge Proof Deployment

1. **Client-Side ZKP Generation**

   - All proofs generated in browser using WebAssembly
   - No server-side proof generation to prevent data leakage
   - Optimized for mobile devices with limited computational resources

2. **Verification Infrastructure**

   - Decentralized verification through Nostr relays
   - Trustless verification without central authority
   - Federated verification for family operations

3. **ZKP Libraries & Implementation**

   - **circom** and **snarkjs** for zk-SNARK implementations
   - **bulletproofs-js** for range proofs
   - **stark-wasm** for transparent proofs
   - Custom WebAssembly optimizations for browser performance

4. **Deployment Phases**
   - **Phase 1 (Current - Q3 2025)**: Basic transaction verification proofs
   - **Phase 2 (Q4 2025)**: Identity and authentication proofs
   - **Phase 3 (Q2 2026)**: Full treasury management with ZKP
   - **Phase 4 (Q4 2026)**: Cross-protocol ZKP for Lightning/Cashu/Fedimint

### Zero-Knowledge Proof Auditing

1. **Formal Verification**

   - Mathematical verification of ZKP circuits
   - Formal proof of security properties
   - Verification of cryptographic assumptions

2. **Independent Security Audits**

   - Proposed audit partners (seeking user feedback):
     - Least Authority audit of ZKP implementation
     - Trail of Bits review of cryptographic protocols
     - Other potential partners under consideration
   - Comprehensive audit process starting Q3 2025
   - Initial audit completed Q2 2025
   - Open-source community review process

3. **Continuous Verification**

   - Automated testing of all ZKP circuits
   - Fuzzing of proof generation and verification
   - Stress testing under various network conditions

4. **Transparent Audit Reports**

   - All audit reports published publicly
   - Detailed explanation of findings and remediations
   - Regular re-auditing on major version updates

5. **User Verification Tools**
   - Self-verification tools for users to validate ZKP implementation
   - Transparency logs for ZKP verification
   - Educational resources on understanding ZKP security

---

## Bitcoin-Only Protocol Stack

### Lightning Network Stack

- **Voltage** - Enterprise Lightning infrastructure
- **PhoenixD** - Mobile wallet integration (development)
- **LND** - Desktop wallet integration (development)
- **Lightning Terminal** - CLI interface for advanced users
- **LNProxy** - Privacy routing for all payments
- **Breez** - SDK integration (development)
- **Human-readable Lightning addresses** - username@satnam.pub

### Fedimint Integration

- Family federations, RBACs, ranging from 1-of-2 to 5-of-7 role based access controls
- eCash issuance for child payments
- Guardian consensus for large transactions
- Multi-layer Lightning/Cashu/Fedimint bridge

### Cashu eCash Implementation

- **Bearer Instruments**: Tokens, Nuts, Proofs
- Mult-eNut payments for privacy
- eNut swapping for denomination optimization
- Integration with Fedimint through atomic Voltage/LN proxied LN swaps for family eCash cross-protocol payments and transfers between Individual and Family Federated funds and other Fedimint guardians
- Atomic swaps for cross-protocol payments between Lightning and Fedimint

---

## Nostr Protocol Implementation

### Required NIPs

- **NIP-01** Basic protocol
- **NIP-04** Encrypted direct messages
- **NIP-05** DNS-based verification (username@satnam.pub)
- **NIP-07** Browser extension signing
- **NIP-17** Event treatment recommendations
- **NIP-18** Follow lists
- **NIP-28** Public chat channels
- **NIP-29** Group chat key management
- **NIP-58** Badge system for achievements
- **NIP-59** Gift Wrapped messages

### Self-Custody Journey

- Create pathways, maps, sign posts for self-custody
- WoT mentor-verified-verified badges to mark self-custodial journey milestones
- Guided paths from custodial fiat towards self-custodial private keys
- No custodial risk as the destination at all stages
- Integration with Citadel Academy for educational tracking
- Dual-signature verification system (Mentor + Vice-Principle)
- Non-transferable achievement stamps with privacy controls
- Future NFC badge integration for physical bearer notes

---

## Development Protocols

### TypeScript Standards

- Always define proper interfaces for all data structures
- Use strict type checking
- Export types from `src/types/` directory
- Handle undefined/null states explicitly
- Use `.boltignore` optimization for AI context window

### Error Prevention

```typescript
// ✅ CORRECT: Proper type definitions
interface FamilyMember {
  id: string;
  npub: string;
  username: string;
  role: 'parent' | 'child' | 'guardian';
  spendingLimits?: {
    daily: number;
    weekly: number;
    requiresApproval: number;
  };
}

// ❌ WRONG: Any types or missing definitions
const member: any = {...}
```

### Destructive Operations

- All destructive operations must have rollback instructions
- Must be verified before and after execution
- Provide clear documentation for recovery procedures
- Test in isolation before integration

---

## Change Management Rules

### ❌ NEVER Do These Without Explicit Approval

- Delete existing components or files
- Change authentication flows
- Modify database schemas
- Add external dependencies
- Change API endpoint structures
- Remove existing functionality
- Add non-Bitcoin blockchains or third-party analytics

### ✅ Always Do These

- Verify TypeScript compilation with `npm run type-check`
- Test components render without errors
- Maintain existing styling and UI patterns
- Preserve all Bitcoin-only integrations
- Keep privacy-first protocols intact
- Emphasize privacy, sovereignty, and auditability in all documentation

---

## Development Roadmap

1. **Hardware Security Integration**

   - NFC + PIN physical device authentication
   - Hardware wallet support (Coldcard, Jade, etc.)

2. **Production Federation**

   - Full Fedimint guardian implementation
   - Production-ready family federation

3. **Advanced Family Banking**

   - Enhanced allowance automation
   - Multi-signature treasury management stamp
   - Education-linked rewards system

4. **Citadel Academy Integration**

   - NIP-58 Badge System with WoT mentor notarization
   - Dual-signature verification (Mentor + Vice-Principle)
   - Non-transferable, privacy-preserving achievement stamps
   - Future NFC badge integration for physical bearer notes and collectibles
   - Bitcoin-only rewards for educational milestones
   - Nostr Knowledge storage, transmission, and tracking system
   - NIP-58 Badge based cognitive capital credentials
   - Curated educational tools, training, and AI tutoring personalized educational resources
   - Intellectual journey tracking, tracing, and incentivizing systems
   - Nostr Knowledge Management System for tracking learning progressions

5. **Ecosystem Expansion**
   - Mobile application
   - Browser extension integration
   - Hardware wallet support

---

## Success Metrics

### Code Quality Standards

- ✅ Zero TypeScript compilation errors
- ✅ All components render without console errors
- ✅ Responsive design works on mobile/desktop
- ✅ Privacy protocols maintained throughout
- ✅ Bitcoin-only architecture preserved

### Security Compliance

- ✅ No sensitive data in logs or console
- ✅ All API calls use proper authentication
- ✅ Encryption implemented for sensitive data
- ✅ User data sovereignty maintained
- ✅ Self-custody principles upheld
- ✅ Client-side verification for all security operations
- ✅ All destructive operations have rollback instructions
- ✅ HTTPS and TLS properly enforced
- ✅ Input validation implemented for all user inputs
- ✅ Rate limiting applied to sensitive endpoints
- ✅ Content Security Policy headers implemented
- ✅ User-controlled data deletion mechanisms in place
- ✅ Zero-knowledge proofs for verification without data exposure
- ✅ Differential privacy for any aggregated statistics
- ✅ Secure multi-party computation for collaborative operations
- ✅ Forward secrecy for all communications
- ✅ Ephemeral computing with no data persistence
- ✅ Plausible deniability features implemented
- ✅ Trustless verification mechanisms in place

---

## 🎯 Remember

> This platform represents months of sophisticated development. Every change must enhance the existing Bitcoin-only family banking infrastructure while maintaining uncompromising privacy standards and browser compatibility.

**When in doubt, ASK before implementing. Preservation of existing functionality is more important than adding new features.**

---

_Last Updated: December 2024_
_Document Version: 2.0_
