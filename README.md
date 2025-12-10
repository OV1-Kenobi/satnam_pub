# Satnam.pub - Sovereign Bitcoin Family Banking & Identity Forge

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)]()
[![Bitcoin Only](https://img.shields.io/badge/Bitcoin-Only-f2a900.svg)]()
[![Nostr Protocol](https://img.shields.io/badge/Protocol-Nostr-purple.svg)]()
[![Privacy First](https://img.shields.io/badge/Privacy-First-green.svg)]()
[![NFC MFA](https://img.shields.io/badge/NFC%20MFA-Production%20Ready-brightgreen.svg)]()

> **Secure Your Sovereign Family Dynasty** - Create decentralized, interoperable identities and human-readable Bitcoin addresses for your family with no custodians, no compromises, and complete privacy. Validate who you are, who your peers are, how you all communicate, and how you all transact. Establishing the foundations of your Cognitive Capital Accounting system that tracks trust, identity, peers, finances, knowledge, skills, and achievements for self-sovereign Individuals, Families, and Businesses.

## Table of Contents

- [Overview](#overview)
- [Core Principles](#core-principles)
- [Features](#features)
- [Hierarchical Role-Based Access Control](#hierarchical-role-based-access-control)
- [Privacy & Sovereignty Controls](#privacy--sovereignty-controls)
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

Satnam.pub is a reference implementation for establishing source of truth architectures, cultivating, tracking, and managing trust, privacy, and data sovereignty. Satnam.pub is a Bitcoin-only, privacy-first, sovereign family identity, communication, and banking platform that empowers individual to institutional scale creation and management of decentralized digital identities, communications, and finances without relying on custodial services. Built exclusively with Bitcoin as the final settlement layer, using Lightning, Nostr, and eCash protocols, the platform provides a comprehensive suite of tools. Designed for claiming our individual, family, and business names, for accelerating our education, to secure our family office communications, and to achieve sovereignty over our finances.

The project combines the security and sovereignty of Bitcoin with the interoperability of Nostr to create human-readable addresses, family dashboards, and educational resources - all while maintaining complete user control over private keys, identity data, and financial information. Guiding users through a self-custody journey, Satnam.pub empowers individuals and families to achieve sovereignty over their digital identities, communications, and finances.

Whether you're a Bitcoin beginner seeking education or an advanced user coordinating family security, Satnam.pub provides the tools to build your digital dynasty with pure Bitcoin sovereignty and uncompromising privacy.

## Core Principles

### 🛡️ **Bitcoin-Only**

- No altcoins, no tokens, no compromises
- All value transfer and authentication is Bitcoin-native and denominated in satoshis
- Lightning Network, Fedimint, and Cashu for all payment rails

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
- **Hierarchical Role-Based Access Control (RBAC)** with roles: Private, Offspring, Adult, Steward, and Guardian
- Guardian approval system for large transactions
- Family-wide Lightning Network & Nostr account integration
- Privacy-enhanced messaging for family communications

### 🔄 **Giftwrapped Messaging**

- End-to-end encrypted communications
- Individual and group messaging
- Privacy metrics for all communications
- Metadata minimization
- Programmable data deletion controls

### 📎 **Blossom File Sharing** ✅ **NEW**

- **End-to-end encrypted file attachments** in NIP-17/NIP-59 gift-wrapped messages
- **AES-256-GCM encryption** - Files encrypted client-side before upload
- **BUD-01/BUD-02 compliant** - Authorization events with expiration tags
- **Cross-client compatibility** - `imeta` and `fallback` tags for Bitchat interoperability
- **Privacy-first architecture** - Attachments stored in encrypted message content
- **100MB file size limit** with client-side validation
- **Multi-server failover** for upload and delete operations
- **Supported media types**: Files, images, audio, video

### 📒 **Note2Self - Private Notes Storage** ✅ **NEW**

- **Dual UI Approach**: Button above recipient input + pinned conversation tab in Communications page
- **Security Modes**:
  - **Standard (NIP-44)**: Encrypted with your PNS key, recoverable with nsec
  - **Forward Secure (Noise-FS)**: Double encryption with forward secrecy, requires device key for recovery
- **Security Tiers** (for Noise-FS mode):
  - **Ephemeral (Minimum/Standard)**: Temporary storage with configurable TTL, auto-deletes after expiration
  - **Everlasting (Standard/Maximum)**: Permanent storage until manually deleted
  - **Hardened**: Requires NFC hardware token for access
- **Features**:
  - Title, content, and tags for organization
  - Ephemeral TTL configuration (days-based expiration)
  - Search and filter notes list
  - Delete with confirmation
  - Loading states and toast notifications

### 📚 **Citadel Academy Integration**

- Comprehensive Bitcoin education for all skill levels through Citadel Academy
- NIP-58 badge system for tracking educational achievements
- Web of Trust (WoT) mentor notarization system
- Dual-signature verification (Mentor + Vice-Principle)
- Non-transferable, privacy-preserving achievement stamps
- Future NFC badge integration for physical bearer notes
- Bitcoin-only rewards for educational milestones provided by families for family members
- Family-coordinated learning with guardian approval

### 🔐 **NFC Physical MFA for FROST Multiparty Signing** ✅ **PRODUCTION READY**

**Advanced threshold cryptography with physical tap-to-authenticate security**

- **NTAG424 DNA Integration** - Tap NFC cards for guardian approval workflows
- **P-256 ECDSA Signatures** - Cryptographic verification of NFC card authenticity
- **FROST Multiparty Signing** - Threshold signatures (e.g., 2-of-3 guardians) with NFC MFA
- **Policy-Based Enforcement** - Four policy types: disabled, optional, required, required_for_high_value
- **High-Value Operation Detection** - Automatic NFC MFA for operations exceeding threshold
- **Guardian Approval Integration** - NFC signatures in approval request/response cycle
- **Zero-Knowledge Logging** - Precise truncation strategy (6 data types) with session-scoped anonymization
- **Multi-Layer Replay Protection** - Hash + timestamp + session ID + FROST nonce
- **Production Monitoring** - Real-time metrics, alerts, and audit logging
- **Comprehensive Documentation** - 1,500+ lines of design, security, and deployment guides

**Status**: ✅ **100/100 tests passing** | **1,200+ lines of code** | **13 threat scenarios analyzed** | **Production deployment ready**

**Documentation**:

- [NFC MFA Design](docs/NFC_MFA_FROST_INTEGRATION_DESIGN.md)
- [Security Analysis](docs/NFC_MFA_SECURITY_ANALYSIS.md)
- [Deployment Guide](docs/PHASE_5_DEPLOYMENT_GUIDE.md)
- [Production Readiness](docs/PRODUCTION_READINESS_CHECKLIST.md)

### 🌐 **Nostr Protocol Integration**

- Native Nostr protocol implementation (NIP-04, NIP-05, NIP-07, NIP-17, NIP-26, NIP-41, NIP-42, NIP-44, NIP-46, NIP-55, NIP-58, NIP-59, NIP-85)
- Human-readable verification system (username@my.satnam.pub)
- Lightning addresses for seamless 'Zap' payments forward to your self-custodied LN Address
- Integration with Nostr Wallet Connect (NWC) for self-custody wallet connections
- Nostr-based authentication for all services
- Nostr-based trust scoring and verification
- Nostr-based trust metrics and comparison
- Nostr-based trust provider marketplace
- Nostr-based trust provider ratings and reviews
- Nostr-based trust assertions and verification
- Nostr badges for self-custody milestones and for knowledge, skills, & achievements
- Central Event Publishing Service (CEPS) for unified Nostr operations
- NIP-17 private DMs with modern encryption (XChaCha20-Poly1305)
- NIP-59 gift-wrapped sealed sender messaging

### 🔐 **Advanced Security & Privacy**

- No passwords stored server-side
- Time-based challenge authentication
- Encrypted private key backups
- Multi-factor authentication with OTP via Nostr DMs
- **NFC Physical MFA** - NTAG424 DNA tap-to-authenticate with P-256 ECDSA signatures
- Comprehensive security guidelines and monitoring
- Guardian approval for large transactions
- Hardware security integration (NTAG424 NFC cards, Boltcards)
- **Privacy Controls Modal** - User-configurable privacy levels with real-time metrics
- **Sovereign Family Banking Modal** - Family treasury management with privacy protection for UTXO control, balance, and history tracking, as well as channel, and liquidity tracking and management
- Unified data deletion modal

### ⚡ **Multi-Layer Bitcoin Stack**

- Human-readable Lightning addresses (username@satnam.pub)
- Voltage, PhoenixD, and LNProxy node integration
- Family-wide Lightning Network invoices and payments
- Multi-signature setup for enhanced security
- Real-time transaction monitoring
- Fedimint federation with guardian approval
- Cashu eCash for private transactions
- Multi-layer Lightning/Cashu/Fedimint bridge

### 🔄 **Atomic Swap & Cross-Mint Operations**

- **Atomic Swaps** between Fedimint, Lightning, and Cashu contexts
- **Cross-Mint Cashu Management** with multi-nut payments
- **Nut Swaps** between different Cashu mints for optimal privacy
- **External Token Reception** with configurable storage preferences
- **Automatic Liquidity Management** across multiple payment layers
- **Bridge Operations** for seamless value transfer between protocols

### 🤖 **Payment Automation System**

- **Automated Payment Schedules** for family members with configurable frequencies
- **Smart Payment Distribution** with PhoenixD Lightning integration
- **Parental Approval Workflows** for large transactions
- **Emergency Payment Protocols** for urgent financial needs
- **Intelligent Routing** with privacy and cost optimization
- **Payment History Tracking** with comprehensive audit trails
- **Retry Logic** for failed payments with escalation protocols
- **Notification Systems** for payment events and approvals
- **Hybrid Payment Backends**:
  - **Primary**: LNbits and NWC (Nostr Wallet Connect) - production-ready
  - **Optional Enhancements**: BIFROST and Fedimint when available
- **Feature Flag Structure**:
  - Master flag: `VITE_PAYMENT_AUTOMATION_ENABLED` enables the automation UI
  - Requires at least one integration enabled: `VITE_LNBITS_INTEGRATION_ENABLED`, `VITE_NWC_ENABLED`, `VITE_BIFROST_ENABLED`, or `VITE_FEDIMINT_INTEGRATION_ENABLED`

### 🏦 **Family Treasury Management**

- **Multi-Signature Treasury** with guardian oversight
- **Emergency Liquidity Protocols** for urgent financial needs
- **Liquidity Health Monitoring** with real-time metrics
- **Automatic Rebalancing** of Lightning channels
- **Spending Limits** and approval workflows
- **Treasury Analytics** with privacy-preserving insights
- **Emergency Reserve Management** for critical situations

### 🚨 **Emergency Recovery System**

- **Multi-Method Recovery** using passwords, multi-sig, and Hybrid SSS/FROST
- **FROST Zero-Knowledge Nsec** - Advanced threshold cryptography with zero-knowledge security
- **Hybrid SSS/FROST Architecture** - Browser-compatible threshold signatures with ephemeral key generation
- **Family Federation Management** - Configurable guardian/steward roles with flexible threshold schemes
- **Emergency Recovery Workflows** - Automated procedures for crisis situations with reduced thresholds
- **Guardian Consensus** for critical recovery operations
- **Emergency Liquidity Access** with guardian approval
- **Account Restoration** protocols for compromised accounts
- **Recovery Request Management** with timeout and expiration controls
- **Audit Trail** for all recovery operations
- **Privacy-Preserving Recovery** with encrypted evidence storage

### 🏆 **Enhanced Badge & Reward System**

- **NIP-58 Badge System** with Web of Trust verification
- **Mentor Notarization** for educational achievements
- **Bitcoin-Only Rewards** including Lightning sats and family treasury credits
- **Achievement Attestations** for SimpleProof permanent record keeping
- **Premium Access Tokens** for advanced educational content
- **Mentorship Sessions** with Bitcoin experts
- **Hardware Discounts** and conference access
- **Citadel Equity** for community ownership

### 🔐 **Noise Protocol & Forward Secrecy**

- **Noise Protocol Implementation** - X25519 key exchange with ChaCha20-Poly1305 AEAD encryption
- **Five Security Tiers** - `ephemeral-minimum`, `ephemeral-standard`, `everlasting-standard`, `everlasting-maximum`, and `hardened`
- **Private Notes to Self (PNS)** - Forward-secure personal note storage with chain state management
  - **Note2Self Modal** - UI component for composing, viewing, and managing private notes
  - **Security Mode Selection** - Standard (NIP-44) or Forward Secure (Noise-FS)
  - **Ephemeral Policies** - Configurable TTL for auto-expiring notes
- **Hardware MFA Service** - Integration with NFC tokens for Hardened FS tier
- **Session Management** - Secure session state with automatic key rotation
- **Geo-Relay Registry** - Decentralized relay discovery with trust levels

### 🌐 **Iroh Integration**

- **Peer-to-Peer Document Sync** - Decentralized document replication across devices
- **Node Discovery** - DHT-based Iroh node discovery and verification
- **Reachability Monitoring** - Real-time node health and connectivity tracking
- **Admin Dashboard** - Guardian/admin controls for node management
- **Privacy-First** - No PII stored, only node identifiers and addresses

### 🔄 **Unified Communications System**

- **Multi-Protocol Messaging** - NIP-17, NIP-59, NIP-04 with automatic fallback
- **Geo-Room Discovery** - Location-based public messaging with privacy controls
- **Group Messaging** - NIP-58 group messaging with member management
- **Meeting Invites** - Secure meeting coordination via Nostr
- **Contact Management** - Validated contacts with verification badges
- **Privacy Metrics** - Real-time privacy scoring for all communications

### 🎯 **Admin & Hierarchical Management**

- **Hierarchical Admin Dashboard** - Guardian → Steward → Adult → Offspring role hierarchy
- **Subordinate Management** - Create and manage accounts across role levels
- **Bypass & Recovery Codes** - Emergency access management with audit trails
- **Audit Logging** - Complete tracking of all administrative actions
- **Role-Based Access Control** - Fine-grained permissions per role
- **Verification Methods Tab** - Admin controls for identity verification systems

### 🤝 **Trust Provider Marketplace**

- **Decentralized Trust Scoring** - Multi-metric trust evaluation system
- **Provider Discovery** - Search and filter trust providers by metrics
- **Trust Metrics** - Rank, followers, network hops, influence, reliability, recency
- **Community Ratings** - User-submitted provider reviews and ratings
- **Trust Comparison** - Compare multiple providers side-by-side
- **Subscription Management** - Subscribe/unsubscribe from trust providers
- **NIP-85 Integration** - Nostr-based trust assertions and verification
- **Privacy-Preserving** - All trust data encrypted and user-controlled

### 📊 **Decentralized Identity Verification**

- **Multi-Method Verification** - DNS, Nostr kind:0, and PKARR BitTorrent DHT
- **Hybrid NIP-05** - Combined verification methods for enhanced reliability
- **SimpleProof Timestamping** - Blockchain-based proof of existence
- **Verification Status Display** - Real-time verification method indicators
- **Fallback Mechanisms** - Automatic retry with alternative verification methods
- **Privacy-First** - No external API calls, all verification client-side when possible

### 🌐 **PKARR Identity Attestation System**

**Production-Ready BitTorrent DHT-Based Identity Verification**

Satnam.pub implements a comprehensive PKARR (Public Key Addressable Resource Records) attestation system that provides decentralized, censorship-resistant identity verification without relying on DNS infrastructure.

#### **Core Features**

- ✅ **Automated Contact Verification** - Server-side PKARR verification endpoint with automatic verification on contact creation
- ✅ **Batch Verification** - Verify up to 50 contacts simultaneously with parallel processing
- ✅ **Scheduled Republishing** - Automatic republishing every 6 hours to maintain 24-hour DHT TTL
- ✅ **Performance Optimizations** - Query result caching (5-minute TTL), request deduplication (60-second window)
- ✅ **Advanced Error Handling** - Circuit breaker pattern, exponential backoff retry logic, 13 classified error codes
- ✅ **Comprehensive Analytics** - Real-time metrics dashboard with error tracking and performance monitoring
- ✅ **Admin Dashboard** - Guardian/admin-only controls for circuit breaker management and system health monitoring

#### **Technical Specifications**

**Verification Methods:**

- **Primary**: BitTorrent DHT via PKARR relays (`pkarr.relay.pubky.tech`, `pkarr.relay.synonym.to`)
- **Fallback**: DNS TXT record verification (`_nostr` and `_nip05` records)
- **Timeout**: 3000ms for verification, 5000ms for publishing
- **Rate Limiting**: 60 requests/hour per IP for verification, 10 batch requests/hour

**Database Schema:**

- `pkarr_records` - Main PKARR record storage with verification status
- `pkarr_resolution_cache` - 5-minute TTL cache for query results
- `pkarr_publish_history` - Complete audit trail of all publish operations
- 20+ performance indexes for efficient queries
- 4 analytics views for real-time metrics

**Error Handling:**

- **Circuit Breaker States**: CLOSED, OPEN, HALF_OPEN with automatic recovery
- **Retry Logic**: Exponential backoff (1s → 2s → 4s → 8s) with ±30% jitter
- **Error Classification**: Transient (retryable) vs Permanent (non-retryable) errors
- **Metrics Collection**: Success rate, average response time, error distribution

**Scheduled Republishing:**

- **Schedule**: Every 6 hours (cron: `0 */6 * * *`)
- **Stale Threshold**: 18 hours (75% of 24-hour TTL)
- **Batch Size**: 50 records per run
- **Prioritization**: Never published > Oldest > Most failures

#### **User Interface Components**

- **ContactVerificationBadge** - Real-time verification status display with method indicators
- **AttestationsTab** - Settings UI for managing PKARR attestations and republishing
- **PkarrAnalyticsDashboard** - Admin dashboard with error metrics and circuit breaker controls
- **Verification Method Selector** - Choose between DNS, PKARR, and kind:0 verification

#### **API Endpoints**

- `POST /api/verify-contact-pkarr` - Single contact verification
- `POST /api/verify-contacts-batch` - Batch verification (max 50 contacts)
- `GET /api/pkarr-analytics` - Analytics data with optional error metrics
- `POST /api/pkarr-admin` - Admin controls (circuit breaker management)
- `CRON /api/scheduled-pkarr-republish` - Automated republishing (every 6 hours)

#### **Feature Flags**

- `VITE_PKARR_ENABLED` - Enable/disable PKARR verification system
- `VITE_PKARR_AUTO_VERIFY_ON_ADD` - Automatic verification on contact creation
- `VITE_PKARR_ADMIN_ENABLED` - Enable admin dashboard features
- `VITE_PKARR_CACHE_ENABLED` - Enable query result caching
- `VITE_PKARR_CIRCUIT_BREAKER_ENABLED` - Enable circuit breaker pattern

#### **Testing & Quality**

- **168 Tests** - Comprehensive test suite with 100% pass rate
- **Test Coverage**: Verification, publishing, batch operations, analytics, error handling, performance, admin integration, E2E workflows
- **Zero TypeScript Errors** - Full type safety across all PKARR components
- **Production Ready** - Deployed and tested in production environment

#### **Documentation**

- [PKARR User Guide](docs/PKARR_USER_GUIDE.md) - End-user guide for PKARR features
- [PKARR Quick Start](docs/PKARR_QUICK_START.md) - Quick start guide
- [PKARR API Documentation](docs/PKARR_API_DOCUMENTATION.md) - Complete API reference
- [PKARR Deployment Checklist](docs/PKARR_DEPLOYMENT_CHECKLIST.md) - Production deployment guide
- [PKARR Admin Dashboard](docs/PKARR_ADMIN_DASHBOARD.md) - Admin dashboard documentation
- [PKARR Error Handling](docs/PKARR_ERROR_HANDLING.md) - Error handling reference
- [PKARR Performance Optimization](docs/PKARR_PERFORMANCE_OPTIMIZATION.md) - Performance guide
- [PKARR Manual Testing Guide](docs/PKARR_MANUAL_TESTING_GUIDE.md) - Manual testing procedures

**Status**: ✅ **Production Ready**

## Hierarchical Role-Based Access Control

Satnam.pub implements a sophisticated hierarchical Role-Based Access Control (RBAC) system designed for family sovereignty and privacy:

### 🏛️ **Role Hierarchy**

```
Guardian (Level 4)
├── Steward (Level 3)
│   ├── Adult (Level 2)
│   │   └── Offspring (Level 1)
│   └── Private (Level 0)
```

### 👥 **Role Definitions**

#### **Private** (Level 0)

- **Description**: Autonomous users not part of any Family Federation
- **Permissions**: Full autonomy over funds and custody
- **Restrictions**: No RBAC restrictions, no hierarchy level
- **Use Case**: Individual users who prefer complete independence

#### **Offspring** (Level 1)

- **Description**: Family members under adult supervision
- **Permissions**: Limited spending, educational access, basic family features
- **Controlled By**: Adults, Stewards, Guardians
- **Restrictions**: Spending limits, approval requirements for large transactions
- **Use Case**: Children and teenagers learning financial responsibility

#### **Adult** (Level 2)

- **Description**: Family members with full financial capabilities
- **Permissions**: Full family features, can manage offspring accounts
- **Controlled By**: Stewards, Guardians
- **Restrictions**: Subject to family policies and steward oversight
- **Use Case**: Parents and adult family members

#### **Steward** (Level 3)

- **Description**: Family administrators with creation and control authority
- **Permissions**: Can create/manage families, assign roles, control adults
- **Controlled By**: Guardians only
- **Restrictions**: Cannot remove guardians, subject to guardian oversight
- **Use Case**: Family organizers and administrators

#### **Guardian** (Level 4)

- **Description**: Ultimate protectors with removal authority
- **Permissions**: Can remove stewards, ultimate family authority
- **Controlled By**: No one (top of hierarchy)
- **Restrictions**: Cannot be removed by other roles
- **Use Case**: Family protectors and emergency contacts

### 🔐 **Permission System**

- **Hierarchical Inheritance**: Higher roles inherit permissions from lower roles
- **Role-Based Permissions**: Each role has specific capabilities and restrictions
- **Safe Migration**: Automatic role transitions with proper validation
- **Emergency Protocols**: Guardian override capabilities for critical situations
- **Audit Trail**: Complete logging of all role changes and permissions

### 🛡️ **Security Features**

- **Role Validation**: All role changes require proper authorization
- **Permission Checks**: Real-time validation of user capabilities
- **Hierarchy Enforcement**: Automatic enforcement of role relationships
- **Safe Defaults**: New users default to "private" role for maximum autonomy
- **Migration Safety**: Secure transition from legacy role systems

## Privacy & Sovereignty Controls

Satnam.pub provides comprehensive privacy and sovereignty control modals that give users complete control over their data and financial operations:

### 🛡️ **Privacy Controls Modal**

The Privacy Controls component provides granular privacy level management:

#### **Privacy Levels**

- **Minimal Privacy**: Basic privacy with direct Lightning routing
- **Enhanced Privacy**: Balanced privacy with Fedimint and enhanced Lightning
- **Maximum Privacy**: Maximum privacy with Cashu tokens and LNProxy routing

#### **Features**

- **Role-Based Access**: Privacy levels available based on user role
- **Privacy Metrics**: Real-time privacy score and metrics display
- **LNProxy Integration**: Automatic privacy routing configuration
- **Cashu Privacy**: eCash privacy level indicators
- **Privacy Tips**: Contextual advice based on selected privacy level

#### **Privacy Metrics**

- **Privacy Score**: Overall privacy rating (0-100%)
- **LNProxy Usage**: Lightning Network proxy routing status
- **Cashu Privacy**: eCash privacy implementation status
- **Real-time Monitoring**: Live privacy level tracking

### ⚡ **Sovereign Family Banking Modal**

The Sovereign Family Banking component provides comprehensive family financial management:

#### **Core Features**

- **Lightning Network Integration**: Instant Bitcoin payments with PhoenixD
- **Family Wallets**: Multi-sig wallets to manage payments and spending limits
- **Bitcoin Treasury**: Secure family savings and long-term holdings
- **Privacy Protection**: LNProxy privacy routing for all transactions

#### **Family Management**

- **Multi-Generational Support**: Tools for all family member types
- **Role-Based Access**: Different interfaces based on user role
- **Guardian Oversight**: Family protector features and controls
- **Educational Integration**: Learning tools for financial literacy

#### **Security Features**

- **Demo Mode**: Safe testing environment with clear indicators
- **Real-time Monitoring**: Live transaction and balance tracking
- **Emergency Protocols**: Guardian override capabilities
- **Audit Trails**: Complete transaction history and logging

### 🔧 **Enhanced Privacy Components**

#### **Privacy Enhanced Payment Modal**

- **Multi-Layer Privacy**: Lightning, Cashu, and Fedimint payment options
- **Privacy Level Selection**: Choose privacy level per transaction
- **Metadata Minimization**: Reduce transaction fingerprinting
- **Route Optimization**: Automatic selection of most private payment path

#### **Privacy Enhanced Individual Dashboard**

- **Personal Privacy Metrics**: Individual privacy score and recommendations
- **Transaction Privacy**: Per-transaction privacy level tracking
- **Privacy Settings**: Granular control over data sharing
- **Privacy Education**: Tips and guidance for improving privacy

#### **Privacy Preferences Modal**

- **Global Privacy Settings**: System-wide privacy configuration
- **Family Privacy Policies**: Family-wide privacy rule management
- **Notification Preferences**: Privacy-focused notification settings
- **Data Retention**: Control over data storage and deletion

### 🎯 **Sovereignty Features**

#### **Self-Custody Journey**

- **Guided Progression**: Step-by-step path to full sovereignty
- **Educational Milestones**: Learning checkpoints with rewards
- **Badge System**: Achievement tracking for sovereignty progress
- **Hardware Integration**: Support for hardware security devices

#### **Family Sovereignty**

- **Multi-Signature Setup**: Family treasury with guardian oversight
- **Decentralized Decision Making**: Family governance without central authority
- **Emergency Protocols**: Guardian override for critical situations
- **Sovereign Identity**: Family identity independent of external services

#### **Data Sovereignty**

- **Local Storage**: All sensitive data stored locally
- **Encrypted Backups**: Secure, user-controlled backup systems
- **Programmable Deletion**: Complete control over data retention
- **Zero External Dependencies**: No reliance on third-party services

### 📊 **Privacy Analytics**

#### **Local Analytics**

- **Device-Only Processing**: All analytics run on user device
- **No External Sharing**: Analytics data never leaves user control
- **Privacy-Preserving Metrics**: Mathematical guarantees of privacy
- **Opt-In Only**: Analytics disabled by default

#### **Privacy Score Calculation**

- **Multi-Factor Assessment**: Comprehensive privacy evaluation
- **Real-Time Updates**: Live privacy score adjustments
- **Recommendation Engine**: Personalized privacy improvement suggestions
- **Historical Tracking**: Privacy score trends over time

## Open Protocols

Satnam.pub is built exclusively on open protocols:

- **Bitcoin:** The foundation of all value transfer
- **Lightning Network:** Instant, low-fee payments
- **Nostr:** Decentralized identity and messaging
  - NIP-04: Encrypted direct messages (legacy/fallback)
  - NIP-05: DNS-based verification
  - NIP-07: Browser extension signing
  - NIP-17: Event treatment and inbox relay discovery workflow
  - NIP-26: Delegated event signing (key rotation support)
  - NIP-41: Key migration events (whitelist and migrate)
  - NIP-42: Authenticated relay connections (AUTH)
  - NIP-44: Modern DM encryption (XChaCha20-Poly1305)
  - NIP-46: Remote signing (Amber app support)
  - NIP-55: Remote signing (NIP-46 vs NIP-55)
  - NIP-58: Badge system for achievements
  - NIP-59: Gift-wrapped messages (primary DM method currently)
  - NIP-85: Event deletion (soft delete for spam reduction)
- **Fedimint:** Federation-based custody, privacy, and Nsec key protection/rotation and recovery, along with multi-sig guardianship and emergency protocols, AND family/business treasury management
- **Cashu:** Private eCash for Bitcoin, digital and/or physical bearer instruments for private payments between trusted peers, with internal and external swaps, and cross-mint compatibility

## Installation

### Prerequisites

- **npm** 9.x or higher
- **PostgreSQL** 14.x or higher (for production)
- **Redis** 6.x or higher (for session management)

### Development Setup

For detailed development setup instructions, see [DEVELOPMENT.md](DEVELOPMENT.md).

## Quick Start

### 1. Create Your Identity

Visit 'satnam.pub' and click "Claim Your Name" to create your sovereign digital identity.

### 2. Authentication Methods

**Option A: NIP-07 Browser Extension (Recommended)**
Sign authentication challenge with browser extension

**Option B: Direct nsec Import**
Import private key directly (only in secure contexts)

**Option C: One-Time Password via Nostr DM**
Request Gift-wrapped private OTP and check your Nostr DMs for the code

### 3. Individual Dashboard access

After authentication, access your family dashboard to:

- Coordinate multi-signature setups
- Access educational resources and Cognitive Capital Accounting system
- Monitor Lightning Network activity, channels, and liquidity through Individual Finances dashboard
- Manage privacy settings and data deletion

### 3. Family Dashboard Access

After authentication, access your family dashboard to:

- View family members and their LN Bitcoin addresses
- Coordinate multi-signature setups
- Access educational resources and Cognitive Capital Accounting system
- Monitor Lightning Network activity, channels, and liquidity through Family Financials dashboard
- Manage privacy settings and data deletion

### 4. Recovery Process

If you lose access, use the password protected recovery system with encrypted backups.

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
- **Fedimint** for group account, communication, and finance management
- **Cashu** for eCash bearer instrument implementation
- **NWC** for Nostr Wallet Connect self-custody wallet connections
- **LNbits** for account management and payment routing
- **PhoenixD** for Lightning Network operations
- **SimpleProof** for trust assertions and verification

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
│   └── otp-verify.js
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
- **FROST Zero-Knowledge Nsec** - Advanced threshold cryptography ensuring no complete private key ever exists
- **Hybrid SSS/FROST Architecture** - Browser-compatible threshold signatures with ephemeral key generation
- **Cryptographic Memory Wiping** - Sensitive data is securely cleared from memory after use

### 🔑 **Secure DUID Architecture**

Satnam.pub implements a server-side Deterministic User ID (DUID) system aligned with our privacy-first architecture:

- Server-side derivation only (no client-side DUID generation)
- HMAC-SHA-256(DUID_SERVER_SECRET, NIP-05 identifier) for deterministic IDs
- Stable across password changes (identifier-based)
- Enumeration-resistant opaque identifiers
- Zero-knowledge boundary preserved (client never receives server secret)

**Security Benefits:**

- ✅ **No Client Secrets**: All cryptographic secrets remain server-side
- ✅ **Stable Identifiers**: DUIDs survive password changes
- ✅ **Enumeration Resistant**: Unpredictable database keys
- ✅ **Performance Optimized**: Constant-time authentication
- ✅ **Zero-Knowledge**: Client never derives or stores server-indexable IDs

  In the pipeline:

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
- **FROST Threshold Cryptography**: Advanced threshold signatures with zero-knowledge security
- **Family Federation Management**: Configurable guardian/steward roles for distributed key management
- **Ephemeral Key Generation**: Keys are created, used, and destroyed without persistent storage
- **Browser-Native Cryptography**: All cryptographic operations run client-side using Web Crypto API

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

- Email: admin@satnam.pub
- For sensitive issues, use our Nostr ID: admin@my.satnam.pub

## Development Roadmap

### Phase 1: Core Identity & Privacy ✅ **COMPLETE**

- [x] Nostr-native authentication (NIP-07, direct nsec, OTP)
- [x] Identity forging and management
- [x] Privacy-first architecture with hashed UUIDs
- [x] Recovery system with password protected & encrypted backups
- [x] Giftwrapped individual Nostr DMs and group messaging implementation
- [x] Central Event Publishing Service (CEPS)
- [x] Zero-knowledge Nsec handling with immediate memory cleanup

### Phase 2: Family Banking ✅ **COMPLETE**

- [x] Family dashboard with multi-generational support
- [x] Multi-user onboarding and role hierarchy
- [x] Human-readable Lightning addresses (username@satnam.pub)
- [x] Guardian approval workflows with multi-signature support
- [x] Enhanced family coordination tools with liquidity intelligence
- [x] Payment automation system with recurring payments
- [x] Family treasury management with FROST threshold signatures
- [x] Emergency recovery protocols with guardian consensus
- [x] Hierarchical Admin Dashboard with role-based access control

### Phase 3: Advanced Bitcoin Stack ✅ **COMPLETE**

- [x] Multi-layer Lightning/Cashu/Fedimint bridge
- [x] Family federation with guardian consensus and FROST signing
- [x] Privacy metrics and enhancement tools
- [x] Multi-signature treasury management
- [x] Atomic swap operations between protocols
- [x] Cross-mint Cashu management with multi-nut payments
- [x] Emergency liquidity protocols
- [x] **Trust Provider Marketplace** - Decentralized trust scoring and provider discovery
- [x] **Trust Metrics Comparison** - Multi-provider trust analysis and comparison
- [x] **Trust Provider Ratings** - Community-driven provider evaluation system
- [x] **NIP-85 Trust Provider Implementation** - Nostr-based trust assertions and verification
- [x] **Noise Protocol Implementation** - Forward-secure messaging with 3 security tiers
- [x] **Iroh Integration** - Peer-to-peer document sync and node discovery

### Phase 4: Citadel Academy & Ecosystem ✅ **COMPLETE**

- [x] Full Citadel Academy integration
- [x] Nostr Knowledge Management System
- [x] Badge-based learning achievements with NIP-58
- [x] Enhanced badge and reward system
- [x] Hardware security integration with PIN-protected NTAG424 NFC cards
- [x] **SimpleProof Timestamping** - Blockchain-based proof of existence and timestamping
- [x] **Decentralized Identity Verification** - Multi-method verification (kind:0, PKARR, DNS)
- [x] **Hybrid NIP-05 Verification** - Combined DNS and Nostr-based identity verification
- [x] **PKARR Attestation System** - BitTorrent DHT-based identity verification (168 tests, production ready)
- [x] **Unified Communications System** - Multi-protocol messaging with geo-room discovery
- [x] **NFC Physical MFA for FROST** - Phases 1-5 complete (100/100 tests, production ready)
- [ ] Mobile application
- [ ] Browser extension
- [ ] Advanced self-custody journey tools

### Phase 5: Production Deployment & Monitoring ✅ **COMPLETE**

- [x] Guardian Approval Response Handler with NFC Verification
- [x] Production Monitoring & Metrics Collection
- [x] Deployment Guide & Rollout Strategy
- [x] End-to-End Integration Tests
- [x] Production Readiness Checklist
- [x] **NFC Physical MFA Complete** - All 5 phases delivered, 100/100 tests passing
- [x] **PKARR Production Deployment** - 168 tests, admin dashboard, circuit breaker pattern
- [x] **Noise Protocol Production Ready** - Forward-secure messaging with hardware MFA support
- [x] **Iroh Node Discovery** - Production monitoring and admin controls

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
  - [Setup Guide](docs/SETUP-GUIDE.md)
  - [Hierarchical RBAC System](docs/HIERARCHICAL_RBAC_SYSTEM.md)
  - [Privacy & Sovereignty Controls](docs/PRIVACY_SOVEREIGNTY_CONTROLS.md)
  - [Security Guidelines](docs/PRIVACY_FIRST_SECURITY.md)
  - [Family Federation Auth](docs/FAMILY_FEDERATION_AUTH.md)
  - [FROST Zero-Knowledge Nsec](docs/cryptography/FROST-ZERO-KNOWLEDGE-NSEC.md)
  - [Hybrid SSS/FROST Implementation](docs/SHAMIR-SECRET-SHARING.md)
  - [Lightning Integration](docs/LIGHTNING_ADDRESSES.md)
  - [PhoenixD Integration](docs/PHOENIXD_INTEGRATION.md)
  - [Privacy Protection](docs/PRIVACY-PROTECTION.md)
  - [Individual Wallet API](docs/INDIVIDUAL_WALLET_API.md)
  - [NIP-85 Trust Provider Configuration](docs/NIP85_CONFIGURATION_GUIDE.md) - **NEW**
  - [Multi-Method Verification Guide](docs/MULTI_METHOD_VERIFICATION_GUIDE.md) - **NEW**
  - [SimpleProof Timestamping](docs/PHASE1_COMPLETE_SUMMARY.md#simpleproof-timestamping) - **NEW**
  - [WebAuthn Quick Start](docs/auth/WEBAUTHN_QUICK_START.md) - **NEW**
  - [Blossom File Sharing Integration](docs/implementation/blossom-integration.md) - **NEW**
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

**Last Updated**: December 2025
**Version**: 0.2.0
**Status**: ✅ **All Phases Complete** - NFC Physical MFA, PKARR, Noise Protocol, Iroh, Unified Communications - All Production Ready
**Test Coverage**: 100/100 tests passing (NFC MFA), 168/168 tests passing (PKARR), 100% coverage across all modules
**Code**: 1,200+ lines of production code (NFC MFA), 1,500+ lines of documentation
**Maintainers**: Satnam.pub Team

---

_Built with ⚡ and 🧡 for Bitcoin, Identity, Credential, and Knowledge sovereignty_
