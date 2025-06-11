# Pubky Integration

This document describes the integration of Pubky into our domain management system.

## Overview

Pubky is a decentralized domain system that uses public key cryptography to provide user sovereignty and censorship resistance. Our integration allows users to:

1. Register and manage Pubky domains
2. Track domain sovereignty scores
3. Migrate between traditional DNS and Pubky
4. Receive real-time updates via WebSockets

## Database Schema

The Pubky integration adds several new tables to the database:

- `pubky_domains`: Stores Pubky domain registrations and their associated keys
- `pubky_keypairs`: Stores family keypairs for Pubky domain management
- `domain_migrations`: Tracks migrations between domain providers (e.g., traditional DNS to Pubky)
- `pkarr_records`: Tracks PKARR records published to relays
- `sovereignty_scores`: Stores domain sovereignty scores and their calculation breakdown

It also enhances existing tables with Pubky-related columns:

- `users`: Added `pubky_url`, `pubky_public_key`, and `pubky_private_key_encrypted` columns
- `families`: Added `pubky_url`, `pubky_public_key`, `pubky_homeserver_url`, `pubky_relay_url`, and `pubky_enabled` columns
- `domain_records`: Added `sovereignty_score`, `pubky_enabled`, `pubky_homeserver_url`, and `pubky_relay_url` columns
- `federation_guardians`: Added `pubky_backup_status`, `pubky_backup_url`, and `pubky_backup_last_updated` columns

## Real-Time Features

The integration includes several real-time features:

- PostgreSQL triggers for LISTEN/NOTIFY on Pubky events
- WebSocket subscription management for Pubky URL updates
- Real-time sovereignty score calculations
- Guardian notification triggers for domain changes

## Services

### PubkyClient

The `PubkyClient` class provides methods for interacting with Pubky homeservers and PKARR relays:

- `generateKeypair()`: Generate a new Pubky keypair
- `signup()`: Sign up with a Pubky homeserver
- `signin()`: Sign in to a Pubky homeserver
- `putData()`: Put data to a Pubky URL
- `getData()`: Get data from a Pubky URL
- `createPubkyUrl()`: Create a Pubky URL for a domain

### PubkySovereigntyService

The `PubkySovereigntyService` class provides methods for managing Pubky domains and sovereignty scores:

- `createPubkyDomain()`: Create a new Pubky domain
- `calculateSovereigntyScore()`: Calculate sovereignty score for a domain
- `createDomainMigration()`: Create a domain migration
- `createFamilyKeypair()`: Create a family keypair
- `enablePubkyForFamily()`: Enable Pubky for a family

### PubkyWebSocketHandler

The `PubkyWebSocketHandler` class handles WebSocket connections for Pubky events:

- Real-time updates for Pubky domain changes
- Real-time updates for PKARR record changes
- Real-time updates for sovereignty score changes
- Real-time updates for domain migration changes

## Sovereignty Scores

Sovereignty scores are calculated based on several factors:

- **Provider Independence**: How independent the domain is from centralized providers
- **Key Ownership**: Whether the user owns the cryptographic keys for the domain
- **Censorship Resistance**: How resistant the domain is to censorship
- **Privacy**: How much privacy the domain provides
- **Portability**: How easily the domain can be moved between providers

Scores range from 0 to 100, with higher scores indicating greater sovereignty.

## Getting Started

To set up the Pubky integration:

1. Run the database migrations:
   ```
   node scripts/run_pubky_migrations.js
   ```

2. Start the Pubky WebSocket server:
   ```
   node scripts/start_pubky_websocket.js
   ```

3. Enable Pubky for a family:
   ```typescript
   const pubkySovereigntyService = new PubkySovereigntyService();
   await pubkySovereigntyService.enablePubkyForFamily('family-id');
   ```

4. Register a Pubky domain:
   ```typescript
   const domainService = new DomainService();
   await domainService.registerPubkyDomain('example.pubky', 'family-id');
   ```

## WebSocket API

The Pubky WebSocket API allows clients to subscribe to real-time updates:

- Connect to the WebSocket server with a JWT token:
  ```
  ws://localhost:3002?token=your-jwt-token
  ```

- Subscribe to Pubky domain events:
  ```json
  {
    "type": "subscribe",
    "data": {
      "pubkyDomainId": "domain-id"
    }
  }
  ```

- Subscribe to sovereignty score events:
  ```json
  {
    "type": "subscribe",
    "data": {
      "sovereigntyScoreDomainId": "domain-id"
    }
  }
  ```

- Subscribe to Pubky URL events:
  ```json
  {
    "type": "subscribe",
    "data": {
      "pubkyUrl": "pubky://public-key"
    }
  }
  ```

## References

- [Pubky Documentation](https://docs.pubky.org/)
- [PKARR Protocol](https://docs.pubky.org/Explore/Pubky-Core/Pkarr/0.Introduction)
- [Pubky Homeservers](https://docs.pubky.org/Explore/Pubky-Core/Homeservers)