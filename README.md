# Satnam.pub - Sovereign Family Banking and Identity Forge Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)]()
[![Bitcoin Only](https://img.shields.io/badge/Bitcoin-Only-f2a900.svg)]()
[![Nostr Protocol](https://img.shields.io/badge/Protocol-Nostr-purple.svg)]()
[![Lightning Network](https://img.shields.io/badge/Lightning-Network-brightgreen.svg)]()
[![Fedimint](https://img.shields.io/badge/Fedimint-Federation-orange.svg)]()
[![Cashu](https://img.shields.io/badge/Cashu-eCash-pink.svg)]()

> **Forge Your Sovereign Financial Future** - The most advanced Bitcoin-only family banking platform combining Lightning Network, Fedimint federations, Cashu eCash, and Nostr communications for complete financial sovereignty.

## Table of Contents

- [Project Overview](#project-overview)
- [Key Features](#key-features)
  - [Human-Readable Lightning Addresses](#human-readable-lightning-addresses)
  - [Giftwrapped Communications](#giftwrapped-communications)
  - [Nostr Protocol Integration](#nostr-protocol-integration)
  - [Fedimint to Lightning to Cashu Bridge](#fedimint-to-lightning-to-cashu-bridge)
  - [Bearer Instruments](#bearer-instruments)
  - [Authentication Options](#authentication-options)
  - [Lightning Network Infrastructure](#lightning-network-infrastructure)
- [Technical Architecture](#technical-architecture)
- [Authentication and Security](#authentication-and-security)
- [Bearer Instruments and Value Transfer](#bearer-instruments-and-value-transfer)
- [Development Roadmap](#development-roadmap)
- [Getting Started](#getting-started)
- [Contributing Guidelines](#contributing-guidelines)
- [License and Legal Information](#license-and-legal-information)

## Project Overview

Satnam.pub is the world's most sophisticated Bitcoin-only sovereign family banking platform, designed to empower families with complete financial independence through cutting-edge Bitcoin technologies. Our platform seamlessly integrates Lightning Network payments, Fedimint federation management, Cashu eCash privacy, and Nostr communications into a unified family banking experience.

### Mission Statement

To provide families with the tools necessary for complete financial sovereignty, combining the security of Bitcoin with the privacy of Cashu eCash, the efficiency of Lightning Network, and the resilience of Fedimint federations, all unified through Nostr's decentralized communication protocol.

### Core Principles

- **Bitcoin-Only Architecture**: No altcoins, no tokens, pure Bitcoin technology stack
- **Privacy-First Design**: Maximum privacy through multiple layers of protection
- **Family-Centric Approach**: Designed specifically for multi-generational family banking
- **Sovereign Identity**: Complete control over identity and financial data
- **Enterprise-Grade Security**: Production-ready infrastructure for serious financial operations

## Key Features

### Human-Readable Lightning Addresses

Our platform provides comprehensive Lightning Address infrastructure for seamless Bitcoin payments:

#### Lightning Address Resolution

- **Reusable Payment Identifiers**: `username@satnam.pub` format for easy payments
- **Cross-Platform Compatibility**: Works with all Lightning wallets and applications
- **Family Banking Integration**: Shared family treasury with individual member addresses
- **Enterprise Lightning Infrastructure**: Built on Voltage, Phoenix, and Breez technologies

#### NIP-05 Identity Verification

```typescript
// Example NIP-05 verification
{
  "names": {
    "satoshi": "npub1...",
    "nakamoto_family": "npub1..."
  },
  "relays": {
    "npub1...": ["wss://relay.satnam.pub", "wss://nos.lol"]
  }
}
```

#### Domain Validation System

- Cryptographic proof of identity ownership
- DNS-based verification for maximum compatibility
- Integration with existing Nostr ecosystem
- Seamless wallet discovery and connection

### Giftwrapped Communications

Advanced privacy-first messaging system implementing the latest Nostr encryption standards:

#### NIP-59 Gift Wrapped Messaging

- **Maximum Privacy**: Triple-layer encryption for sensitive communications
- **Forward Secrecy**: Each message uses unique encryption keys
- **Metadata Protection**: Complete obscuration of sender, recipient, and timing
- **Plausible Deniability**: No proof of message content or participation

#### Communication Channels

```typescript
// Individual encrypted messaging
interface IndividualMessage {
  type: "gift_wrapped";
  privacy_level: "maximum";
  encryption: "nip-59";
  forward_secrecy: true;
}

// Family group messaging
interface FamilyGroupMessage {
  type: "family_group";
  guardian_oversight: boolean;
  privacy_level: "high";
  members: FamilyMember[];
}

// Business peer messaging
interface PeerGroupMessage {
  type: "peer_group";
  business_context: true;
  trust_level: "verified";
  encryption: "nip-17" | "nip-59";
}
```

#### Privacy-First Contact Management

- **Three-Tier Privacy System**: Giftwrapped, encrypted, and minimal privacy levels
- **Trust Level Management**: Dynamic trust scoring for contacts
- **Guardian Oversight**: Parental controls for family member communications
- **Contact Verification**: Cryptographic verification of contact identities

### Nostr Protocol Integration

Comprehensive implementation of Nostr Improvement Proposals (NIPs) for maximum ecosystem compatibility:

#### Core NIP Implementations

- **NIP-04**: Encrypted Direct Messages (fallback compatibility)
- **NIP-05**: Mapping Nostr keys to DNS-based internet identifiers
- **NIP-07**: Browser extension support for key management
- **NIP-17**: Private Direct Messages with enhanced privacy
- **NIP-28**: Public Chat foundation for group messaging
- **NIP-29**: Relay-based Groups for advanced group management
- **NIP-59**: Gift Wrap for maximum privacy messaging

#### Advanced Nostr Features

```javascript
// NIP-07 Browser Extension Integration
window.nostr = {
  getPublicKey: async () => string,
  signEvent: async (event) => event,
  encrypt: async (pubkey, plaintext) => ciphertext,
  decrypt: async (pubkey, ciphertext) => plaintext,
};

// NIP-05 Identity Resolution
const identity = await resolveNip05("satoshi@satnam.pub");
// Returns: { pubkey: 'npub1...', relays: ['wss://...'] }
```

### Fedimint to Lightning to Cashu Bridge

Revolutionary multi-protocol bridge architecture enabling seamless value transfer:

#### Fedimint Federation Management

- **Guardian Consensus**: Multi-signature approval workflows for family treasuries
- **Federation Discovery**: Automatic discovery and connection to trusted federations
- **Consensus Mechanisms**: Byzantine fault-tolerant consensus for transaction approval
- **Guardian Roles**: Customizable roles for family members (parent, guardian, member)

#### Lightning Network Integration

```typescript
interface LightningBridge {
  // Convert Fedimint to Lightning
  fedimintToLightning: (amount: number, invoice: string) => Promise<Payment>;

  // Convert Lightning to Cashu
  lightningToCashu: (payment: Payment) => Promise<CashuToken>;

  // Direct Fedimint to Cashu
  fedimintToCashu: (
    federationId: string,
    amount: number
  ) => Promise<CashuToken>;
}
```

#### Cashu eCash Integration

- **Privacy-Preserving Transfers**: Anonymous value transfer using blind signatures
- **Denomination Optimization**: Automatic nut swapping for optimal privacy
- **Multi-Nut Transactions**: Complex multi-input, multi-output transactions
- **Mint Management**: Support for multiple Cashu mints with automatic failover

### Bearer Instruments

Three distinct forms of Cashu bearer instruments for different use cases:

#### QR Code Bearer Instruments

```typescript
interface QRBearerInstrument {
  type: "qr_code";
  cashu_token: string;
  amount: number;
  denomination: number[];
  mint_url: string;
  created_at: number;
  expires_at?: number;
}
```

#### NFC Bearer Instruments

- **Tap-to-Transfer**: Physical NFC devices for instant value transfer
- **NTAG424 DNA Support**: Hardware-secured NFC authentication
- **Offline Capability**: Works without internet connection
- **Physical Security**: Tamper-evident hardware integration

#### Gift Wrapped DM Bearer Instruments

```typescript
interface GiftWrappedBearerInstrument {
  type: "gift_wrapped_dm";
  cashu_token: string; // Encrypted within gift wrap
  recipient: string; // Obfuscated
  privacy_level: "maximum";
  forward_secrecy: true;
}
```

### Authentication Options

Three secure authentication methods to accommodate different user preferences:

#### NIP-07 Browser Extension

```javascript
// MetaMask-style Nostr key management
const pubkey = await window.nostr.getPublicKey();
const signature = await window.nostr.signEvent(authEvent);
```

#### NWC (Nostr Wallet Connect)

- **Advanced User Integration**: Connect existing Lightning wallets to Nostr accounts
- **Wallet Compatibility**: Support for major Lightning wallet implementations
- **Secure Connections**: Encrypted communication between wallet and platform
- **Permission Management**: Granular permission control for wallet operations

#### OTP Invitation System

```typescript
interface OTPAuthentication {
  type: "otp_invitation";
  secure_onboarding: true;
  new_user_friendly: true;
  recovery_options: string[];
  family_invitation: boolean;
}
```

### Lightning Network Infrastructure

Four-layer Lightning Network architecture for maximum reliability and privacy:

#### Layer 1: Voltage (Enterprise Hosting)

- **Enterprise-Grade Nodes**: Professional Lightning node hosting
- **High Availability**: 99.9% uptime guarantee
- **Managed Liquidity**: Professional liquidity management
- **Security Compliance**: Enterprise security standards

#### Layer 2: Phoenix (Automated Liquidity)

- **Automatic Channel Management**: Self-managing Lightning channels
- **Liquidity Optimization**: Intelligent routing and channel balancing
- **Mobile Integration**: Seamless mobile Lightning experience
- **Submarine Swaps**: Automatic on-chain to Lightning conversion

#### Layer 3: Proxy Node (Privacy Routing)

```typescript
interface PrivacyProxy {
  transaction_obfuscation: boolean;
  route_anonymization: boolean;
  timing_randomization: boolean;
  metadata_stripping: boolean;
}
```

#### Layer 4: Breez (Mobile SDK)

- **Mobile Lightning SDK**: Complete mobile Lightning integration
- **Self-Custodial**: Non-custodial mobile Lightning experience
- **Developer Tools**: Rich SDK for mobile application development
- **Cross-Platform**: iOS and Android compatibility

## Technical Architecture

### Frontend Stack

- **React 18** with TypeScript for type-safe component development
- **Vite** for fast development and optimized builds
- **Tailwind CSS** for responsive, utility-first styling
- **Lucide React** for consistent iconography
- **Nostr-Tools** for Nostr protocol implementation
- **WebLN** for Lightning Network browser integration

### Backend Stack

- **Node.js** with Express.js for robust server architecture
- **TypeScript** throughout for compile-time safety
- **PostgreSQL** for relational data with privacy-first schema design
- **Redis** for high-performance session and cache management
- **JWT** with Nostr signature verification for authentication

### Bitcoin & Lightning Integration

```typescript
// Core technology integrations
import { NostrRelay } from "nostr-relays";
import { LightningClient } from "@voltage/client";
import { CashuMint } from "@cashu/cashu-ts";
import { FedimintClient } from "@fedimint/fedimint-client";

interface TechnicalStack {
  nostr: NostrRelay[];
  lightning: LightningClient;
  cashu: CashuMint[];
  fedimint: FedimintClient;
}
```

### Security Architecture

- **Zero-Knowledge Design**: No sensitive data stored on servers
- **End-to-End Encryption**: All communications encrypted
- **Cryptographic Authentication**: Signature-based authentication only
- **Hardware Security Module**: Integration with HSM for key management
- **Multi-Factor Authentication**: Hardware tokens and biometric support

## Authentication and Security

### Privacy-First Authentication

Our authentication system implements multiple layers of security without compromising privacy:

#### Cryptographic Authentication

```typescript
interface AuthenticationFlow {
  challenge_generation: () => string;
  signature_verification: (
    pubkey: string,
    signature: string,
    challenge: string
  ) => boolean;
  session_creation: (pubkey: string) => JWT;
  privacy_preservation: boolean;
}
```

#### Multi-Factor Security

- **Hardware Tokens**: FIDO2/WebAuthn support for hardware authentication
- **Biometric Integration**: Touch ID, Face ID, and fingerprint authentication
- **NFC Authentication**: Physical NFC devices for additional security layer
- **Time-Based Challenges**: Cryptographic challenges with expiration

### Privacy Features

#### Three-Tier Privacy System

1. **Maximum Privacy (Giftwrapped)**: NIP-59 with triple encryption
2. **High Privacy (Encrypted)**: NIP-17 with forward secrecy
3. **Standard Privacy (Minimal)**: NIP-04 for compatibility

#### Metadata Protection

- **Timing Obfuscation**: Randomized message timing
- **Size Padding**: Message size normalization
- **Route Anonymization**: Multi-hop routing for Lightning payments
- **IP Protection**: Tor integration for network-level privacy

## Bearer Instruments and Value Transfer

### Cashu eCash Implementation

Our Cashu implementation provides the highest level of privacy for Bitcoin transactions:

#### Token Management

```typescript
interface CashuToken {
  mint: string;
  proofs: Proof[];
  amount: number;
  memo?: string;
}

interface Proof {
  id: string;
  amount: number;
  secret: string;
  C: string; // Commitment
}
```

#### Multi-Mint Support

- **Mint Discovery**: Automatic discovery of trusted Cashu mints
- **Failover Support**: Automatic failover between mints
- **Cross-Mint Swaps**: Seamless token exchange between different mints
- **Reputation System**: Community-driven mint reputation scoring

### Value Transfer Mechanisms

#### Lightning to Cashu Flow

```mermaid
graph LR
    A[Lightning Invoice] --> B[Phoenix Node]
    B --> C[Voltage Infrastructure]
    C --> D[Cashu Mint]
    D --> E[eCash Tokens]
    E --> F[Bearer Instrument]
```

#### Fedimint Integration

- **Guardian Consensus**: Multi-signature approval for large transactions
- **Federation Management**: Easy setup and management of family federations
- **Consensus Monitoring**: Real-time monitoring of federation health
- **Emergency Procedures**: Predefined emergency protocols for federation issues

## Development Roadmap

### Phase 1: Hardware Security Integration (Q2 2024)

#### NTAG424 DNA NFC Integration

- **Physical Authentication**: Secure NFC devices for transaction signing
- **Tamper Detection**: Hardware-level tamper detection and response
- **Offline Capability**: NFC transactions without internet connectivity
- **Family Distribution**: NFC devices for each family member

#### Hardware Wallet Support

```typescript
interface HardwareWalletIntegration {
  coldcard: {
    psbt_signing: boolean;
    multisig_coordination: boolean;
    air_gapped_operation: boolean;
  };
  tapsigner: {
    nfc_authentication: boolean;
    mobile_integration: boolean;
    backup_recovery: boolean;
  };
}
```

#### Multi-Factor Authentication Enhancement

- **Hardware Token Integration**: FIDO2 security keys
- **Biometric Authentication**: Platform-native biometric integration
- **Physical Device Verification**: NFC and USB device authentication
- **Emergency Access Codes**: Secure recovery mechanisms

### Phase 2: Production Infrastructure Migration (Q3 2024)

#### Fedimint Production Deployment

- **Live Federation Setup**: Migration from demo to production federations
- **Guardian Onboarding**: Production-ready guardian consensus mechanisms
- **High Availability**: Enterprise-grade uptime and reliability
- **Disaster Recovery**: Comprehensive backup and recovery procedures

#### Lightning Network Production

```typescript
interface ProductionLightning {
  mainnet_operations: boolean;
  enterprise_nodes: VoltageNode[];
  liquidity_management: {
    automated_rebalancing: boolean;
    channel_optimization: boolean;
    fee_optimization: boolean;
  };
  monitoring: {
    real_time_alerts: boolean;
    performance_metrics: boolean;
    uptime_tracking: boolean;
  };
}
```

#### Production-Grade Treasury Management

- **Automated Compliance**: Regulatory compliance automation
- **Risk Management**: Real-time risk assessment and mitigation
- **Audit Trails**: Complete transaction history and audit capabilities
- **Reporting Systems**: Comprehensive financial reporting tools

### Phase 3: Advanced Family Banking Features (Q4 2024)

#### Automated Allowance Systems

```typescript
interface AllowanceAutomation {
  recurring_payments: {
    schedule: "daily" | "weekly" | "monthly";
    amount: number;
    recipient: string;
    conditions: AllowanceCondition[];
  };
  spending_controls: {
    daily_limits: number;
    merchant_restrictions: string[];
    geographic_limits: GeoRestriction[];
    approval_requirements: ApprovalRule[];
  };
}
```

#### Advanced Financial Analytics

- **Spending Pattern Analysis**: AI-powered spending insights
- **Budget Optimization**: Automated budget recommendations
- **Investment Tracking**: Portfolio performance monitoring
- **Tax Reporting**: Automated tax document generation

#### Emergency Fund Management

- **Multi-Signature Emergency Access**: Emergency fund access protocols
- **Automated Emergency Detection**: AI-powered emergency detection
- **Recovery Protocols**: Comprehensive account recovery procedures
- **Family Emergency Coordination**: Multi-family emergency response

### Phase 4: Ecosystem Expansion (Q1 2025)

#### Multi-Federation Support

```typescript
interface EcosystemExpansion {
  federation_network: {
    cross_federation_transfers: boolean;
    federation_discovery: boolean;
    reputation_system: boolean;
    interoperability: boolean;
  };
  cashu_mint_network: {
    multi_mint_support: boolean;
    automatic_failover: boolean;
    cross_mint_swaps: boolean;
    mint_reputation: boolean;
  };
}
```

#### Enhanced Privacy Infrastructure

- **Multi-Hop Lightning Routing**: Enhanced privacy through multiple routing nodes
- **Tor Integration**: Built-in Tor support for network-level privacy
- **VPN Integration**: Seamless VPN integration for enhanced security
- **Anonymous Account Creation**: Zero-knowledge account creation

## Getting Started

### Prerequisites

Before installing Satnam.pub, ensure you have the following prerequisites:

- **Node.js** 20.x or higher
- **npm** 9.x or higher
- **PostgreSQL** 15.x or higher
- **Redis** 7.x or higher
- **Git** for version control

### Development Environment Setup

#### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/satnamdev/satnam-recovery.git
cd satnam-recovery

# Install dependencies
npm install

# Install additional Bitcoin dependencies
npm install @cashu/cashu-ts @fedimint/fedimint-client nostr-tools
```

#### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env.local

# Configure your environment variables
# Edit .env.local with your specific configuration
```

Example `.env.local` configuration:

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/satnam_dev
REDIS_URL=redis://localhost:6379

# Bitcoin Network Configuration
BITCOIN_NETWORK=testnet
LIGHTNING_NETWORK_ENDPOINT=your_voltage_endpoint

# Nostr Configuration
NOSTR_RELAYS="wss://relay.satnam.pub,wss://nos.lol"
DOMAIN=satnam.pub

# Security Configuration
JWT_SECRET=your_jwt_secret_here
ENCRYPTION_KEY=your_encryption_key_here
```

#### 3. Database Setup

```bash
# Run database migrations
npm run migrate

# Seed development data (optional)
npm run seed:dev
```

#### 4. Start Development Servers

```bash
# Terminal 1 - Backend API
npm run server:dev

# Terminal 2 - Frontend Development Server
npm run dev

# Terminal 3 - Background Services (Redis, etc.)
npm run services:start
```

#### 5. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

### Production Deployment

#### Docker Deployment

```bash
# Build production images
docker build -t satnam-frontend .
docker build -t satnam-backend ./api

# Deploy with Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

#### Manual Production Setup

```bash
# Build production assets
npm run build

# Start production server
NODE_ENV=production npm run server:prod
```

### Testing

#### Comprehensive Test Suite

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit           # Unit tests
npm run test:integration    # Integration tests
npm run test:e2e           # End-to-end tests

# Run tests with coverage
npm run test:coverage

# Run Bitcoin protocol tests
npm run test:bitcoin

# Run Nostr protocol tests
npm run test:nostr
```

#### Security Testing

```bash
# Run security audit
npm run security:audit

# Run cryptographic tests
npm run test:crypto

# Run privacy compliance tests
npm run test:privacy
```

## Contributing Guidelines

We welcome contributions from the Bitcoin community! Please follow these guidelines:

### Development Standards

#### Code Quality Requirements

- **TypeScript**: All new code must be written in TypeScript
- **Testing**: Minimum 90% test coverage for new features
- **Security**: All code must pass security audits
- **Documentation**: Comprehensive documentation for all features

#### Bitcoin Development Standards

```typescript
// Example: Proper Bitcoin address validation
function validateBitcoinAddress(address: string): boolean {
  // Implement comprehensive validation
  // Support for Legacy, SegWit, and Taproot addresses
  // Proper network validation (mainnet/testnet)
  return validateAddress(address);
}
```

### Contribution Process

#### 1. Fork and Branch

```bash
git clone https://github.com/yourusername/satnam-recovery.git
cd satnam-recovery
git checkout -b feature/amazing-bitcoin-feature
```

#### 2. Development Guidelines

- Follow existing code patterns and conventions
- Write comprehensive tests for all new functionality
- Update documentation for any API changes
- Ensure all security checks pass

#### 3. Pull Request Process

- Create detailed pull request descriptions
- Include test results and security audit reports
- Request review from core maintainers
- Address all feedback before merging

### Community Standards

#### Code of Conduct

We follow the Bitcoin Core Code of Conduct:

- Be respectful and inclusive
- Focus on technical merit
- Avoid personal attacks or discrimination
- Maintain professional communication

#### Security-First Development

- Never commit private keys or sensitive data
- Use secure coding practices throughout
- Regular security audits and code reviews
- Immediate disclosure of security vulnerabilities

## License and Legal Information

### MIT License

```
MIT License

Copyright (c) 2024 Satnam.pub Development Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Legal Disclaimers

#### Financial Services Disclaimer

Satnam.pub is a self-custodial Bitcoin platform. Users maintain complete control over their private keys and funds. We do not provide financial advice or act as a financial institution.

#### Regulatory Compliance

Users are responsible for complying with local regulations regarding Bitcoin usage, financial reporting, and tax obligations in their jurisdiction.

#### Privacy Notice

We implement privacy-by-design principles. No personal data is stored without explicit user consent, and all communications are encrypted by default.

### Security Contact

For security-related issues:

- **Email**: security@satnam.pub
- **Nostr**: security@satnam.pub (NIP-05 verified)
- **GPG Key**: Available on keybase.io/satnamdev

### Community Support

- **Documentation**: https://docs.satnam.pub
- **Community Forum**: https://community.satnam.pub
- **Developer Chat**: Lightning-based chat rooms available
- **Technical Support**: Nostr-based support channels

---

**Built with ❤️ for Bitcoin sovereignty and family financial independence.**

_Last updated: December 2024_
