# Satnam.pub - Sovereign Bitcoin Identity Forge

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)]()
[![Bitcoin Only](https://img.shields.io/badge/Bitcoin-Only-f2a900.svg)]()
[![Nostr Protocol](https://img.shields.io/badge/Protocol-Nostr-purple.svg)]()

> **Forge Your True Name** - Create decentralized, interoperable identities and human-readable Bitcoin addresses for your family with no custodians and no compromises.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Security](#security)
- [API Documentation](#api-documentation)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)

## Overview

Satnam.pub is a sovereign Bitcoin identity platform that empowers families and individuals to create and manage decentralized digital identities without relying on custodial services. Built on Bitcoin and the Nostr protocols, the platform provides a comprehensive suite of tools for identity forging, education, family coordination, and account recovery.

The project combines the security and sovereignty of Bitcoin with the interoperability of Nostr to create human-readable addresses, family dashboards, and educational resources - all while maintaining complete user control over private keys and identity data.

Whether you're a Bitcoin beginner seeking education or an advanced user coordinating family security, Satnam.pub provides the tools to build your digital dynasty with pure Bitcoin sovereignty.

## Features

### 🔨 **Identity Forge**

- Create sovereign digital identities with no custodians
- Generate human-readable reusable social media & wallet accounts
- Customizable usernames and family names
- Secure recovery system with encrypted backups
- Multi-factor authentication with OTP via Nostr DMs
- Seamless integration with Nostr ecosystem w/curated Nostr client apps
- Nostr-native authentication NWC/OTP using cryptographic signatures
- Secure private key management and backup systems

### 👨‍👩‍👧‍👦 **Family Coordination**

- Family dashboard for coordinated Nostr account, LN Bitcoin, & eCash management
- Multi-generational onboarding and education
- Shared security practices and recovery protocols
- Family-wide Lightning Network & Nostr account integration

### 📚 **Bitcoin Education Platform Integration**

- Comprehensive Bitcoin education for all skill levels
- Interactive learning modules and tutorials
- Security best practices and hands-on exercises
- Integration with Citadel Academy Nostr-based educational resources

### 🌐 **Nostr Ecosystem Integration**

- Native Nostr protocol implementation
- NIP-05 verification system (username@satnam.pub)
- Lightning addresses for seamless 'Zap'payments
- Cross-platform identity portability

### 🔐 **Advanced Security**

- No passwords stored server-side
- Time-based challenge authentication
- Encrypted private key backups
- Multi-factor authentication with OTP via Nostr DMs
- Comprehensive security guidelines and monitoring

### ⚡ **Lightning Network Support**

- Lightning address provisioning
- Voltage, BTCPayserver, and LN Bits integration
- Family-wide Lightning Network invoices and payments
- Multi-signature setup for enhanced security
- Real-time transaction monitoring

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
   cp .env.development .env.local
   ```

3. **Start servers**

   ```bash
   # Terminal 1 - Backend
   npm run server:dev

   # Terminal 2 - Frontend
   npm run dev
   ```

4. **Access application**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:8000

### Production Deployment

1. **Build the application**

   ```bash
   npm run build
   ```

2. **Start production server**
   ```bash
   npm run server
   ```

### Testing

The project uses Vitest for fast, reliable testing with TypeScript support.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- zeus-lsp-client.test.ts

# Run tests with UI
npm run test:ui
```

**Test Structure:**

- Unit tests: `**/*.test.ts`
- Integration tests: `**/__tests__/**/*.test.ts`
- Component tests: `**/*.test.tsx`

**Zeus LSP Testing:**
The Zeus LSP client includes mock implementations for testing without real LSP connections.

```typescript
import { LSPClient } from "./lib/zeus-lsp-client";

// Create mock client for testing
const mockClient = LSPClient.createMock();
```

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

**Option A: Nostr Wallet Connect (Recommended)**

```typescript
// Sign authentication challenge
const challenge = await getAuthChallenge(npub);
const signature = await signChallenge(challenge, privateKey);
const token = await authenticate(npub, signature);
```

**Option B: One-Time Password via Nostr DM**

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

### Frontend Stack

- **React 18** with TypeScript
- **Vite** for development and building
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Built with Bolt.new** - AI-powered full-stack web development platform

### Backend Stack

- **Node.js** with Express.js
- **TypeScript** for type safety
- **PostgreSQL** for data persistence
- **Redis** for session management
- **JWT** for authentication tokens

### Bitcoin & Nostr Integration

- **nostr-tools** for Nostr protocol implementation
- **@noble/secp256k1** for cryptographic operations
- **bech32** for address encoding
- **bolt11** for Lightning invoice parsing

### Project Structure

```
src/
├── components/          # React components
│   ├── EducationPlatform.tsx
│   ├── FamilyDashboard.tsx
│   ├── IdentityForge.tsx
│   └── SignInModal.tsx
├── services/           # Business logic
│   ├── auth.ts
│   ├── identity.ts
│   └── lightning.ts
├── utils/              # Utility functions
│   ├── crypto.ts
│   └── validation.ts
├── types/              # TypeScript definitions
└── App.tsx             # Main application component

api/
├── endpoints/          # API route handlers
│   ├── auth.ts
│   ├── family.ts
│   └── user.ts
└── index.ts

lib/
├── nostr.ts           # Nostr protocol implementation
├── secure-storage.ts  # Encrypted storage utilities
└── supabase.ts        # Database configuration

database/
└── migrations/        # Database schema migrations
```

## Security

### 🔐 **Security Model**

Satnam.pub implements a zero-knowledge security model where:

- No passwords are stored on the server
- All authentication uses cryptographic signatures
- Private keys remain under user control
- Recovery systems use encrypted backups

### 🛡️ **Security Features**

- **HTTPS Enforcement**: All connections use TLS encryption
- **Input Validation**: Comprehensive validation using Zod schemas
- **Rate Limiting**: Protection against brute force attacks
- **Session Management**: Secure JWT tokens with automatic expiration
- **CSP Headers**: Content Security Policy for XSS prevention

### ⚠️ **Security Guidelines**

Please review our comprehensive [Security Guidelines](SECURITY_GUIDELINES.md) before using the platform. Key points:

- Never enter your private key on HTTP websites
- Use incognito/private browsing mode
- Avoid public WiFi for sensitive operations
- Consider using Nostr browser extensions
- Always verify you're on the correct domain

### 🚨 **Security Reporting**

If you discover a security vulnerability, please report it to our security team immediately:

- Email: ov1_kenobi@mailfence.com
- For sensitive issues, use our Nostr ID: ov1@satnam.pub [Coming Soon, once deployed]

## API Documentation

### Authentication Endpoints

#### Get Authentication Challenge

```http
GET /api/auth/challenge/:npub
```

Response:

```json
{
  "challenge": "auth_challenge_1234567890",
  "expires_at": "2024-01-01T12:00:00Z"
}
```

#### Authenticate with Signature

```http
POST /api/auth/authenticate
Content-Type: application/json

{
  "npub": "npub1...",
  "signature": "signature_hex",
  "challenge": "auth_challenge_1234567890"
}
```

#### Request OTP

```http
POST /api/auth/otp-request
Content-Type: application/json

{
  "npub": "npub1..."
}
```

### Identity Management

#### Create Identity

```http
POST /api/identity/create
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "username": "satoshi",
  "family_name": "nakamoto",
  "recovery_password": "secure_password"
}
```

#### Recover Identity

```http
POST /api/identity/recover
Content-Type: application/json

{
  "username": "satoshi",
  "recovery_password": "secure_password",
  "encrypted_backup": "encrypted_data"
}
```

For complete API documentation, see our [API Reference](docs/api-reference.md).

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

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Roadmap

### Phase 1: Core Identity System ✅

- [x] Nostr-native authentication
- [x] Identity forging and management
- [x] Basic security implementation
- [x] Recovery system

### Phase 2: Family Features 🚧

- [x] Family dashboard
- [x] Multi-user onboarding
- [ ] Enhanced family coordination tools
- [ ] Shared security protocols

### Phase 3: Lightning Integration ⏳

- [ ] Lightning address provisioning
- [ ] NWC wallet integration
- [ ] Family payment coordination
- [ ] Multi-signature support

### Phase 4: Advanced Features ⏳

- [ ] Mobile application
- [ ] Hardware wallet integration
- [ ] Advanced privacy features
- [ ] Citadel Academy integration

## Changelog

### v0.1.0 (Current)

- Initial release with core identity forging
- Nostr authentication implementation
- Basic family dashboard
- Security guidelines and documentation
- Recovery system implementation

For detailed changes, see [CHANGELOG.md](CHANGELOG.md).

## Acknowledgments

- **Bitcoin Core** - For the foundation of digital sovereignty
- **Nostr Protocol** - For decentralized identity infrastructure
- **Bolt.new** - AI-powered platform that accelerated frontend development
- **Citadel Academy** - For educational partnership and resources
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
