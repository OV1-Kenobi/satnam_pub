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

#### Environment Variable Access Pattern

**MANDATORY**: Use this exact `getEnvVar()` function template for ALL environment variable access:

```javascript
function getEnvVar(key) {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = /** @type {any} */ (import.meta);
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}
```

**Requirements**:

- Replace ALL direct `process.env.VARIABLE` usage with `getEnvVar('VARIABLE')`
- Ensures browser compatibility with `import.meta.env` while maintaining serverless support
- Maintains exact JSDoc type casting: `/** @type {any} */ (import.meta)`
- Preserves fallback chain: `import.meta.env` primary, `process.env` secondary

### File Structure Compliance

```
src/
├── components/           # React components (.tsx)
├── lib/                  # Utility functions (.ts)
├── types/                # TypeScript definitions (.ts)
├── hooks/                # React hooks (.ts)
api/                      # Serverless functions (.js)
```

Security & Privacy Protocols
Privacy-First Architecture
NEVER log user data, transaction details, or family information

NO external logging services or third-party analytics

Use Supabase Vault for all sensitive credentials

Implement data minimization - collect only essential information

All communications must use NIP-59 Gift Wrapped messaging

Provide programmable deletability controls for all user data with a unified deletion modal

Client-side verification for all security operations

User-controlled, locally-stored encrypted audit logs (optional)

Differential privacy techniques for any aggregated data

Ephemeral computing - process data in memory without persistence

Secure multi-party computation for collaborative operations

Plausible deniability features for sensitive operations

Encryption & Security Standards
Use Web Crypto API for all cryptographic operations

AES-256-GCM for data encryption

Store secrets in Supabase Vault, NOT .env files

Implement end-to-end encryption for all family communications

Privacy metrics for all communications and transactions

HTTPS enforcement with strict TLS requirements

Content Security Policy (CSP) headers for XSS prevention

Rate limiting for authentication endpoints

Input validation using Zod schemas

Secure JWT token management with automatic expiration

All destructive operations must have rollback instructions

Authentication Layers
NIP-07 Browser extension signing

Direct nsec import For secure key management

OTP invitation For secure onboarding

Hardware security Integration (future)

Zero-Knowledge Nsec Handling
Family Federation Trust Architecture

## Roles & Responsibilities

**CRITICAL**: Use only the following standardized roles:

- **Private**: Default for new users, autonomous users not part of any Family Federation
- **Family Federation Roles**:
  - **Founder**: TEMPORARY ROLE - Creates Family Federation, assigns initial roles through Family Foundry modal, then promoted to a Guardian or Steward role
  - **Guardians**: Oversight role, can remove Stewards, unanimous consensus required
  - **Stewards**: Active management, payment distributions, majority threshold operations
  - **Adults**: Full control within federation scope, can create Offspring accounts
  - **Offspring**: Controlled accounts managed by Adults

## 🚨 CRITICAL: Individual Wallet Sovereignty Principle

**FUNDAMENTAL PRINCIPLE**: Individual wallets are completely autonomous for Adults, Stewards, and Guardians. This is the cornerstone of the platform's sovereignty architecture.

### Sovereignty Rules

1. **Individual Financial Sovereignty**:

   - **Private, Adult, Steward, Guardian** roles have **UNLIMITED** spending authority over their individual wallets
   - **NO spending limits** (-1 values in configuration)
   - **NO approval requirements** for individual wallet operations
   - **Complete autonomy** over personal financial decisions

2. **Family Federation Authority** (SEPARATE from individual sovereignty):

   - **Stewards**: Management of family structure and shared Family Federation resources
   - **Guardians**: Passive oversight of Family Federation, protection against Steward abuse
   - **Adults**: Can create and manage Offspring accounts (parent-offspring authorization)

3. **Parent-Offspring Authorization** (ONLY exception to sovereignty):
   - **Offspring accounts**: Require approval from their creating Adult for spending
   - **Specific relationship**: Only the Adult who created the Offspring account can approve
   - **Spending limits**: Apply ONLY to Offspring accounts, never to sovereign roles

### Configuration Standards

```typescript
// ✅ CORRECT: Sovereignty configuration
spendingLimits: {
  daily: -1,        // -1 = unlimited (sovereignty)
  weekly: -1,       // -1 = unlimited (sovereignty)
  requiresApproval: -1  // -1 = no approval (sovereignty)
}

// ✅ CORRECT: Offspring configuration
spendingLimits: {
  daily: 50000,     // Positive value = limit (offspring only)
  weekly: 200000,   // Positive value = limit (offspring only)
  requiresApproval: 10000  // Positive value = threshold (offspring only)
}
```

### Implementation Requirements

- **Payment Automation**: Must bypass all spending checks for sovereign roles
- **Wallet Management**: Must enforce unlimited spending for sovereign roles
- **Configuration**: Must use -1 values for unlimited sovereignty
- **Emergency Recovery**: Must respect individual wallet sovereignty
- **Lightning Network**: Must allow unlimited individual wallet operations

**VIOLATION PREVENTION**: Any code that imposes spending limits or approval requirements on Adults, Stewards, or Guardians for their individual wallets violates the sovereignty principle and must be corrected immediately.

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

1. **NIP-07** default for most users - Browser extension signing
2. **Direct nsec import** For secure key management for existing Nostr users, clarify our zero-knowledge approach to handling nsecs, client-side storage and decryption
3. **OTP invitation** For secure onboarding of new users with existing Nostr profiles
4. **Hardware security** Integration with N424 NFC tags (future)

### Secure Family Operations

1. **Secure Multi-Party Computation (MPC)** For family treasury management
2. **Threshold Signatures** For distributed approval without revealing keys
3. **Blind Custody** For parental controls without visibility into child transactions
4. **Privacy-Preserving Verification** For age/identity verification without data exposure

---

## Bitcoin-Only Protocol Stack

### Lightning Network Stack

- **Voltage** - default and fallback node built for Enterprise Lightning infrastructure
- **PhoenixD** - Mobile wallet integration for internal family and P2P payments within Satnam ecosystem (development)
- **LNProxy** - Privacy routing for all payments
- **Breez** - SDK integration for external payments (development)
- **Human-readable Lightning addresses** - username@satnam.pub

### Fedimint Integration

- Family federations, RBACs, ranging from 1-of-2 to 5-of-7 role based access controls
- Fedimint eCash issuance for internal family payments
- Guardian threshold signatures for decentralized custody of Family Nsecs
- Federatedconsensus for large transactions
- Multi-layer Lightning/Cashu/Fedimint bridge

### Cashu eCash Implementation

- **Bearer Instruments**: Tokens, Nuts, Proofs
- Mult-eNut payments for privacy
- eNut swapping for denomination optimization
- Integration with Fedimint through atomic LN swaps for family eCash cross-protocol payments and transfers between Individuals, between different Family Federated funds
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

### Error Prevention

```typescript
// ✅ CORRECT: Proper type definitions with sovereignty principles
interface FamilyMember {
  id: string;
  npub: string;
  username: string;
  role: 'private' | 'offspring' | 'adult' | 'steward' | 'guardian';
  spendingLimits?: {
    daily: number;    // -1 = unlimited (sovereignty), positive = limit (offspring only)
    weekly: number;   // -1 = unlimited (sovereignty), positive = limit (offspring only)
    requiresApproval: number; // -1 = no approval (sovereignty), positive = threshold (offspring only)
  };
}

// ✅ CORRECT: Sovereignty configuration for Adults/Stewards/Guardians
const sovereignMember: FamilyMember = {
  id: "adult-123",
  npub: "npub1...",
  username: "parent",
  role: "adult",
  spendingLimits: {
    daily: -1,        // Unlimited individual wallet spending
    weekly: -1,       // Unlimited individual wallet spending
    requiresApproval: -1  // No approval required for individual wallet
  }
};

// ✅ CORRECT: Offspring configuration with limits
const offspringMember: FamilyMember = {
  id: "offspring-456",
  npub: "npub1...",
  username: "child",
  role: "offspring",
  spendingLimits: {
    daily: 50000,     // 50K sats daily limit
    weekly: 200000,   // 200K sats weekly limit
    requiresApproval: 10000  // Requires parent approval above 10K sats
  }
};

// ❌ WRONG: Any types or missing definitions
const member: any = {...}

// ❌ WRONG: Imposing spending limits on sovereign roles
const adultWithLimits: FamilyMember = {
  role: "adult",
  spendingLimits: {
    daily: 100000,    // VIOLATION: Adults must have unlimited spending (-1)
    requiresApproval: 50000  // VIOLATION: Adults require no approval (-1)
  }
};
```

### Destructive Operations

- All destructive operations must have rollback instructions
- Must be verified before and after execution
- Provide clear documentation for recovery procedures
- Test in isolation before integration

---

## Master Context Compliance Audits

### Sovereignty Compliance Checklist

**MANDATORY**: All code changes must pass this sovereignty compliance audit:

1. **Individual Wallet Sovereignty Verification**:

   - ✅ Adults, Stewards, Guardians have unlimited individual wallet spending (-1 values)
   - ✅ No spending limits imposed on sovereign roles for individual wallets
   - ✅ No approval requirements for sovereign individual wallet operations
   - ✅ Configuration uses -1 values for unlimited sovereignty

2. **Parent-Offspring Authorization Verification**:

   - ✅ Only Offspring accounts have spending limits (positive values)
   - ✅ Only the specific creating Adult can approve Offspring spending
   - ✅ Parent-offspring relationship preserved and enforced

3. **Family Federation Authority Verification**:

   - ✅ Stewards have Family Federation management authority (NOT individual wallet control)
   - ✅ Guardians have passive oversight role (NOT active financial control)
   - ✅ Family Federation operations separate from individual wallet sovereignty

4. **System Integration Verification**:
   - ✅ Payment automation respects sovereignty principles
   - ✅ Wallet management enforces unlimited spending for sovereign roles
   - ✅ Emergency recovery respects individual wallet sovereignty
   - ✅ Lightning Network allows unlimited individual wallet operations

### Compliance Audit Process

1. **Pre-Implementation**: Review Master Context document for sovereignty requirements
2. **Implementation**: Apply sovereignty principles throughout code changes
3. **Post-Implementation**: Verify no sovereignty violations introduced
4. **Integration Testing**: Confirm sovereign roles have unlimited individual wallet access
5. **Documentation**: Update any affected documentation to reflect sovereignty principles

**CRITICAL**: Any code that violates the Individual Wallet Sovereignty Principle must be immediately corrected before deployment.

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
- Ensure responsive design works on mobile/desktop
- Check for console errors and fix them if necessary
- Make NO ASSUMPTIONS, review relevant files before making changes
- Review all related files when modifying a component
- Do EXACTLY what's specified in the prompt, no more, no less
- Avoid changing unrelated files unless absolutely necessary
- Never assume anything about the project structure
- Only modify files that directly relate to your task
- Always test in isolation before integrating
- Maintain existing styling and UI patterns
- Preserve all Bitcoin-only integrations
- Keep privacy-first protocols intact
- Maintain zero-knowledge architecture without exception
- Emphasize privacy, sovereignty, and auditability in all documentation

---

## Development Roadmap

1. **Hardware Security Integration**

   - NFC + PIN physical device authentication
   - Hardware wallet support (Coldcard, Jade, etc.)

2. **Production Federation**

   - Full Fedimint guardian implementation
   - Production-ready family federation

## Success Metrics

### Code Quality Standards

- ✅ Zero TypeScript compilation errors
- ✅ All components render without console errors
- ✅ Responsive design works on mobile/desktop
- ✅ Privacy protocols maintained throughout
- ✅ Bitcoin-only architecture preserved

### Security Compliance

- ✅ No sensitive data in logs or console
- ✅ Client side storage of private keys
- ✅ Audit logs stored locally encrypted
- ✅ Zero-knowledge proofs for verification without data exposure
- ✅ Forward secrecy for all communications
- ✅ Ephemeral computing with no data persistence
- ✅ Plausible deniability features implemented
- ✅ Trustless verification mechanisms in place
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
- ✅ Secure MPC for family treasury management
- ✅ FROSTThreshold signatures for decentralized custody of Family Nsecs
- ✅ Atomic swaps for cross-protocol payments between Lightning and Fedim
- ✅ Multi-layer Lightning/Cashu/Fedimint bridge
- ✅ Trustless verification mechanisms in place

---

## 🎯 Remember

> This platform represents months of sophisticated development. Every change must enhance the existing Bitcoin-only family banking infrastructure while maintaining uncompromising privacy standards and browser compatibility.

**When in doubt, ASK before implementing. Preservation of existing functionality is more important than adding new features.**

---

_Last Updated: July 2025_
_Document Version: 2.0_
