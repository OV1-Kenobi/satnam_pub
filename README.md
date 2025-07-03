# Satnam.pub - Sovereign Bitcoin Family Banking & Identity Forge

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)]()
[![Bitcoin Only](https://img.shields.io/badge/Bitcoin-Only-f2a900.svg)]()
[![Nostr Protocol](https://img.shields.io/badge/Protocol-Nostr-purple.svg)]()
[![Privacy First](https://img.shields.io/badge/Privacy-First-green.svg)]()

> **Forge Your Sovereign Family Legacy** - Create decentralized, interoperable identities and human-readable Bitcoin addresses for your family with no custodians, no compromises, and complete privacy.

## Table of Contents

- [Overview](#overview)
- [Core Principles](#core-principles)
- [Features](#features)
- [Open Protocols](#open-protocols)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Security & Privacy](#security--privacy)
- [API Documentation](#api-documentation)
- [Development Roadmap](#development-roadmap)
- [Contributing](#contributing)
- [License](#license)

## Overview

Satnam.pub is a Bitcoin-only, privacy-first, sovereign family banking and identity platform that empowers families and individuals to create and manage decentralized digital identities and finances without relying on custodial services. Built exclusively on Bitcoin, Lightning, Nostr, and eCash protocols, the platform provides a comprehensive suite of tools for identity forging, education, family coordination, and financial sovereignty.

The project combines the security and sovereignty of Bitcoin with the interoperability of Nostr to create human-readable addresses, family dashboards, and educational resources - all while maintaining complete user control over private keys, identity data, and financial information.

Whether you're a Bitcoin beginner seeking education or an advanced user coordinating family security, Satnam.pub provides the tools to build your digital dynasty with pure Bitcoin sovereignty and uncompromising privacy.

## Core Principles

### 🛡️ **Bitcoin-Only**

- No altcoins, no tokens, no compromises
- All value transfer and authentication is Bitcoin-native
- Lightning Network, Fedimint, and Cashu for all payments

### 🔒 **Privacy-First**

- End-to-end encryption for all communications
- Metadata minimization in all transactions
- No external logging or analytics
- User-controlled data with programmable deletion

### ⚡ **Sovereignty**

- Users control their keys, identities, and funds
- No custodial risk, no vendor lock-in
- Self-custody as the destination at all stages
- Guided paths from custodial services to self-custody

### 📝 **Auditability**

- All code, infrastructure, and flows are transparent
- Documented and verifiable processes
- Open-source and community-reviewed

## Features

### 🔨 **Identity Forge**

- Create sovereign digital identities with no custodians
- Generate human-readable Lightning addresses (username@satnam.pub)
- Customizable usernames and family names
- Secure recovery system with encrypted backups
- Multi-factor authentication with OTP via Nostr DMs
- Seamless integration with Nostr ecosystem
- Nostr-native authentication (NIP-07, direct nsec, OTP)
- Secure private key management and backup systems
- Self-custody journey with Nostr badges for milestones

### 👨‍👩‍👧‍👦 **Family Coordination**

- Family dashboard for coordinated Bitcoin, Lightning & eCash management
- Multi-generational onboarding and education
- Guardian approval system for large transactions
- Family-wide Lightning Network & Nostr account integration
- Privacy-enhanced messaging for family communications

### 🔄 **Giftwrapped Messaging**

- End-to-end encrypted communications
- Individual and group messaging
- Privacy metrics for all communications
- Metadata minimization
- Programmable data deletion controls

### 📚 **Citadel Academy Integration**

- Comprehensive Bitcoin education for all skill levels through Citadel Academy
- Nostr Knowledge Management System for tracking learning progress
- Nostr badges for intellectual and skill mastery journeys
- Security best practices and hands-on exercises
- Self-custody journey with guided pathways
- Rewards for educational achievements

### 🌐 **Nostr Protocol Integration**

- Native Nostr protocol implementation (NIP-04, NIP-05, NIP-07, NIP-17, NIP-28, NIP-29, NIP-59)
- Human-readable verification system (username@satnam.pub)
- Lightning addresses for seamless 'Zap' payments
- Cross-platform identity portability
- Nostr badges for self-custody milestones

### 🔐 **Advanced Security & Privacy**

- No passwords stored server-side
- Time-based challenge authentication
- Encrypted private key backups
- Multi-factor authentication with OTP via Nostr DMs
- Comprehensive security guidelines and monitoring
- Guardian approval for large transactions
- Hardware security integration (future)
- Unified data deletion modal

### ⚡ **Multi-Layer Bitcoin Stack**

- Human-readable Lightning addresses (username@satnam.pub)
- Voltage, PhoenixD, and LNProxy integration
- Family-wide Lightning Network invoices and payments
- Multi-signature setup for enhanced security
- Real-time transaction monitoring
- Fedimint federation with guardian approval
- Cashu eCash for private transactions
- Multi-layer Lightning/Cashu/Fedimint bridge

## Open Protocols

Satnam.pub is built exclusively on open protocols:

- **Bitcoin:** The foundation of all value transfer
- **Lightning Network:** Instant, low-fee payments
- **Nostr:** Decentralized identity and messaging
  - NIP-04: Encrypted direct messages
  - NIP-05: DNS-based verification
  - NIP-07: Browser extension signing
  - NIP-17: Event treatment recommendations
  - NIP-28: Public chat channels
  - NIP-29: Group chat key management
  - NIP-59: Gift Wrapped messages
- **Fedimint:** Federation-based custody and privacy
- **Cashu:** Private eCash for Bitcoin

## Installation

### Prerequisites

- **Node.js** 20.x or higher
- **npm** 9.x or higher
- **PostgreSQL** 14.x or higher (for production)
- **Redis** 6.x or higher (for session management)

### Development Setup

For detailed development setup instructions, see [DEVELOPMENT.md](DEVELOPMENT.md).

**Quick Start:**

1. **Clone and install**

   ```bash
   git clone https://github.com/OV1_kenobi/satnam.git
   cd satnam
   npm install
   ```

2. **Setup environment**

   ```bash
   cp .env.example .env.local
   ```

3. **Start servers**

   ```bash
   # Terminal 1 - Backend (Netlify Functions)
   npm run functions:dev

   # Terminal 2 - Frontend
   npm run dev
   ```

4. **Access application**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:8888/.netlify/functions

### Production Deployment

1. **Build the application**

   ```bash
   npm run build
   ```

2. **Deploy to Netlify**
   ```bash
   npm run deploy
   ```

### Testing

The project uses Vitest for fast, reliable testing with TypeScript support.

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- privacy-first-messaging.test.ts

# Run tests with UI
npm run test:ui
```

**Test Structure:**

- Unit tests: `**/*.test.ts`
- Integration tests: `**/__tests__/**/*.test.ts`
- Component tests: `**/*.test.tsx`

## Quick Start

### 1. Forge Your Identity

Visit `http://localhost:3000` and click "Forge Identity" to create your sovereign digital identity:

```typescript
// Example: Creating a new identity
const identity = await forgeIdentity({
  username: "satoshi",
  familyName: "nakamoto",
  recoveryPassword: "your-secure-recovery-password",
});
```

### 2. Authentication Methods

**Option A: NIP-07 Browser Extension (Recommended)**

```typescript
// Sign authentication challenge with browser extension
const challenge = await getAuthChallenge(npub);
const signature = await window.nostr.signEvent(challenge);
const token = await authenticate(npub, signature);
```

**Option B: Direct nsec Import**

```typescript
// Import private key directly (only in secure contexts)
const identity = await importIdentity(nsec);
const token = await authenticateWithNsec(nsec);
```

**Option C: One-Time Password via Nostr DM**

```typescript
// Request OTP
await requestOTP(npub);
// Check your Nostr DMs for the code
const token = await authenticateWithOTP(npub, otpCode);
```

### 3. Family Dashboard Access

After authentication, access your family dashboard to:

- View family members and their Bitcoin addresses
- Coordinate multi-signature setups
- Share educational resources
- Monitor Lightning Network activity
- Manage privacy settings and data deletion

### 4. Recovery Process

If you lose access, use the recovery system:

```typescript
// Recover identity using backup
const recoveredIdentity = await recoverIdentity(
  username,
  recoveryPassword,
  encryptedBackup
);
```

## Architecture

### Frontend Architecture

- **React 18** with TypeScript
- **Vite** for development and building
- **Tailwind CSS** for styling
- **Browser-only** code (no Node.js polyfills)
- **Strict separation** of concerns with barrel files

### Backend Architecture

- **Netlify Functions** for serverless backend
- **TypeScript** for type safety
- **Supabase** for database and authentication
- **Vault** for encrypted local logging (no PII)
- **No external logging** or analytics

### Bitcoin & Nostr Integration

- **nostr-tools** for Nostr protocol implementation
- **@noble/secp256k1** for cryptographic operations
- **bech32** for address encoding
- **bolt11** for Lightning invoice parsing
- **Fedimint** for family federation
- **Cashu** for eCash implementation

### Project Structure

```
src/
├── components/          # React components
│   ├── EducationPlatform.tsx
│   ├── FamilyDashboard.tsx
│   ├── IdentityForge.tsx
│   ├── PrivacyControls.tsx
│   └── SignInModal.tsx
├── services/           # Business logic
│   ├── auth.ts
│   ├── identity.ts
│   ├── privacy.ts
│   └── lightning.ts
├── utils/              # Utility functions
│   ├── crypto.ts
│   └── validation.ts
├── types/              # TypeScript definitions
└── App.tsx             # Main application component

netlify/functions/      # Serverless functions
├── auth/
│   ├── challenge.ts
│   ├── nip07-signin.ts
│   └── otp-verify.ts
├── family/
│   ├── members.ts
│   └── treasury.ts
└── lightning/
    ├── address.ts
    └── payment.ts

lib/
├── nostr.ts           # Nostr protocol implementation
├── secure-storage.ts  # Encrypted storage utilities
└── supabase.ts        # Database configuration
```

## Security & Privacy

### 🔐 **Zero-Knowledge Security Model**

Satnam.pub implements a zero-knowledge security model where:

- No passwords are stored on the server
- All authentication uses cryptographic signatures
- Private keys remain under user control
- Recovery systems use encrypted backups
- No external logging or analytics
- Programmable data deletion controls
- Verifiable client-side operations
- **zk-SNARKs** for transaction verification without revealing amounts or participants
- **Bulletproofs** for range proofs to verify transaction validity without exposing values
- **zk-STARKs** for scalable, transparent verification of complex operations
- **Blind signature schemes** for privacy-preserving authentication
- **Homomorphic encryption** for secure computations without data exposure

### 🛡️ **Privacy-First Security Features**

- **End-to-End Encryption**: All communications are encrypted
- **Metadata Minimization**: Reduce transaction fingerprinting
- **Privacy Metrics**: Measure and improve privacy levels
- **Unified Deletion Modal**: Control all your data
- **Self-Custody Journey**: Guided paths to sovereignty
- **Guardian Approval**: Family-based security model
- **Local Verification**: Security checks run client-side
- **Encrypted Audit Logs**: User-controlled, locally stored
- **HTTPS Enforcement**: All connections use TLS encryption
- **Input Validation**: Comprehensive validation using Zod schemas
- **Rate Limiting**: Protection against brute force attacks
- **Session Management**: Secure JWT tokens with automatic expiration
- **CSP Headers**: Content Security Policy for XSS prevention
- **Decentralized Verification**: Nostr-based security attestations
- **Trustless Security Model**: No reliance on central authorities
- **Ephemeral Sessions**: Temporary credentials that leave no trace
- **Secure Enclaves**: Isolated execution environments for sensitive operations
- **Forward Secrecy**: Protection of past communications if keys are compromised

### 🔍 **Zero-Knowledge Proof Implementation**

Satnam.pub leverages zero-knowledge proofs in several key areas, with a comprehensive audit process starting Q3 2025 (seeking user feedback on potential audit partners):

1. **Transaction Verification** (zk-SNARKs) - Phase 1, Current-Q3 2025

   - Verify Lightning payment amounts without revealing values
   - Confirm transaction history without exposing transaction graph
   - Validate spending limits compliance without revealing actual spending

2. **Identity & Authentication** (Bulletproofs) - Phase 2, Q4 2025

   - Age verification without revealing birth date
   - Guardian approval without exposing transaction details
   - Account ownership proof without linking identities

3. **Family Treasury Management** (zk-STARKs) - Phase 3, Q2 2026

   - Multi-signature verification without revealing individual signatures
   - Treasury balance verification without exposing actual amounts
   - Spending policy compliance without revealing transaction details

4. **Fedimint & Cashu Integration** - Phase 4, Q4 2026
   - Blind issuance and redemption of eCash tokens
   - Federated custody verification without revealing guardian identities
   - Cross-federation transfers without exposing source/destination

### 📊 **Privacy-Preserving Analytics**

Satnam.pub implements a unique approach to analytics that preserves privacy:

- **Local-Only Analytics**: All usage data stays on your device
- **Differential Privacy**: Any shared metrics have mathematical privacy guarantees
- **Aggregated Insights**: Only non-identifying statistical data is processed
- **Opt-In Only**: All analytics are disabled by default and require explicit consent
- **Self-Sovereign Data**: View and delete your own analytics data at any time
- **Zero-Knowledge Proofs**: Verify system health without exposing individual data

### ⚠️ **Security Guidelines**

Please review our comprehensive [Security Guidelines](SECURITY_GUIDELINES.md) before using the platform. Key points:

- Never enter your private key on HTTP websites
- Use incognito/private browsing mode
- Avoid public WiFi for sensitive operations
- Consider using Nostr browser extensions
- Always verify you're on the correct domain
- All destructive operations have rollback instructions
- Use hardware security devices when available
- Regularly rotate encryption keys for long-term storage

### 🚨 **Security Reporting**

If you discover a security vulnerability, please report it to our security team immediately:

- Email: ov1_kenobi@mailfence.com
- For sensitive issues, use our Nostr ID: ov1@satnam.pub

## API Documentation

### Authentication Endpoints

#### Get Authentication Challenge

```http
GET /.netlify/functions/auth/challenge/:npub
```

Response:

```json
{
  "challenge": "auth_challenge_1234567890",
  "expires_at": "2024-01-01T12:00:00Z"
}
```

#### Authenticate with NIP-07 Signature

```http
POST /.netlify/functions/auth/nip07-signin
Content-Type: application/json

{
  "npub": "npub1...",
  "signature": "signature_hex",
  "challenge": "auth_challenge_1234567890"
}
```

#### Request OTP

```http
POST /.netlify/functions/auth/otp-request
Content-Type: application/json

{
  "npub": "npub1..."
}
```

For complete API documentation, see our [API Reference](docs/api-reference.md).

## Development Roadmap

### Phase 1: Core Identity & Privacy ✅

- [x] Nostr-native authentication (NIP-07, direct nsec, OTP)
- [x] Identity forging and management
- [x] Privacy-first architecture
- [x] Recovery system with encrypted backups
- [x] Giftwrapped messaging implementation

### Phase 2: Family Banking 🚧

- [x] Family dashboard
- [x] Multi-user onboarding
- [x] Human-readable Lightning addresses
- [ ] Guardian approval workflows
- [ ] Enhanced family coordination tools

### Phase 3: Advanced Bitcoin Stack ⏳

- [ ] Multi-layer Lightning/Cashu/Fedimint bridge
- [ ] Family federation with guardian consensus
- [ ] Privacy metrics and enhancement tools
- [ ] Multi-signature treasury management

### Phase 4: Citadel Academy & Ecosystem ⏳

- [ ] Full Citadel Academy integration
- [ ] Nostr Knowledge Management System
- [ ] Badge-based learning achievements
- [ ] Hardware security integration
- [ ] Mobile application
- [ ] Browser extension
- [ ] Advanced self-custody journey tools

## Contributing

We welcome contributions from the Bitcoin and Nostr communities! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting pull requests.

### Development Process

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Code Standards

- Use TypeScript for all new code
- Follow the existing code style and formatting
- Write tests for new functionality
- Update documentation as needed
- Ensure all security guidelines are followed
- Emphasize privacy, sovereignty, and auditability in all code comments

## Acknowledgments

- **Bitcoin Core** - For the foundation of digital sovereignty
- **Nostr Protocol** - For decentralized identity infrastructure
- **Lightning Network** - For instant, low-fee Bitcoin payments
- **Fedimint** - For federation-based custody and privacy
- **Cashu** - For private eCash for Bitcoin
- **Citadel Academy** - For educational partnership and knowledge management
- **Bolt.new** - AI-powered platform that accelerated development
- **Noble Cryptography** - For robust cryptographic implementations
- **The Bitcoin Community** - For inspiration and continuous feedback

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2024 Satnam.pub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

## Support

### Getting Help

- **Documentation**: Comprehensive guides available in the `/docs` directory
- **GitHub Issues**: Report bugs and request features
- **Community**: Join our discussions on Nostr
- **Email**: support@satnam.pub

### Community Resources

- **Citadel Academy**: [https://citadel.academy](https://citadel.academy)
- **Nostr Protocol**: [https://nostr.com](https://nostr.com)

### Emergency Recovery

If you've lost access to your identity:

1. Try the automated recovery system first
2. Contact our support team with your public key
3. Review our [Recovery Documentation](docs/recovery-guide.md)
4. Join our support channel for real-time assistance

---

**Last Updated**: December 2024  
**Version**: 0.1.0  
**Maintainers**: Satnam.pub Team

---

_Built with ⚡ and 🧡 for Bitcoin sovereignty_
