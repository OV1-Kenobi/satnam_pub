# Enhanced Pubky Client

This module provides a complete implementation of the Pubky protocol for decentralized domain management. It includes full PKARR support, homeserver communication, pubky:// URL resolution, Ed25519 keypair management, and integration with the existing domain sovereignty system.

## Features

### PUBKY CORE FEATURES
- Full PKARR (Public Key Addressable Resource Records) support
- Pubky homeserver communication for key-based routing
- pubky:// URL resolution and content publishing
- Ed25519 keypair management with cryptographic signatures
- PKARR relay network integration for distributed DNS

### ADVANCED FEATURES
- Pubky domain registration with cryptographic ownership proof
- Content addressing and retrieval via pubky:// URLs
- Peer-to-peer content routing through Pubky network
- Integration with existing domain sovereignty scoring
- Backup and recovery for Pubky domains and content

### SECURITY IMPLEMENTATION
- Ed25519 keypair generation and management
- Cryptographic domain ownership verification
- Secure homeserver communication protocols
- Content integrity verification and authentication
- Key rotation and recovery procedures

### INTEGRATION POINTS
- Connection with existing family federation system
- Integration with PostgreSQL for metadata storage
- Support for migration from traditional DNS to Pubky domains
- Family domain sharing and inheritance

## Usage

### Basic Setup

```typescript
import { EnhancedPubkyClient } from '../lib/pubky-enhanced-client';

// Create a client instance
const client = new EnhancedPubkyClient({
  homeserver_url: 'https://homeserver.pubky.org',
  pkarr_relays: [
    'https://pkarr.relay.pubky.tech',
    'https://pkarr.relay.synonym.to'
  ],
  debug: true
});
```

### Generate a Keypair

```typescript
// Generate a new Ed25519 keypair
const keypair = await client.generatePubkyKeypair();
console.log(`Pubky URL: ${keypair.pubky_url}`);
```

### Register a Domain

```typescript
// Define domain records
const domainRecords = [
  {
    name: '@',
    type: 'TXT',
    value: 'pubky-verification=true',
    ttl: 3600
  },
  {
    name: '_pubky',
    type: 'TXT',
    value: 'v=pubky1',
    ttl: 3600
  }
];

// Register the domain
const registration = await client.registerPubkyDomain(keypair, domainRecords);
console.log(`Domain registered: ${registration.pubky_url}`);
console.log(`Sovereignty score: ${registration.sovereignty_score}`);
```

### Publish Content

```typescript
// Create content
const content = {
  title: 'Hello Pubky',
  content: 'This is a test document published to a Pubky URL',
  timestamp: new Date().toISOString()
};

// Publish to a path
const publishResult = await client.publishContent(
  keypair,
  '/hello',
  content,
  'application/json'
);

console.log(`Content published: ${publishResult.pubky_url}`);
```

### Resolve Content

```typescript
// Resolve content from a Pubky URL
const resolvedContent = await client.resolvePubkyUrl(`${keypair.pubky_url}/hello`);

if (resolvedContent) {
  console.log(`Title: ${resolvedContent.content.title}`);
  console.log(`Timestamp: ${resolvedContent.content.timestamp}`);
}
```

### Migrate Traditional Domain to Pubky

```typescript
// Generate guardian keypairs
const guardianKeypairs = [
  await client.generatePubkyKeypair(),
  await client.generatePubkyKeypair(),
  await client.generatePubkyKeypair()
];

// Migrate a traditional domain to Pubky
const migration = await client.migrateFamilyDomainToPubky(
  'example.com',
  'family-123',
  guardianKeypairs
);

console.log(`Family domain migrated: ${migration.pubky_url}`);
console.log(`Sovereignty improvement: ${migration.sovereignty_score_improvement}`);
```

### Create Domain Backup

```typescript
// Create domain data backup with guardians
const backupUrls = await client.createDomainBackup(
  keypair,
  domainData,
  guardianKeypairs
);

console.log(`Created ${backupUrls.length} backup copies with guardians`);
```

### Verify Domain Ownership

```typescript
// Verify domain ownership cryptographically
const isOwner = await client.verifyDomainOwnership(
  keypair.pubky_url,
  keypair.private_key
);

console.log(`Domain ownership verified: ${isOwner}`);
```

## Integration with Existing PubkyClient

The enhanced client is integrated with the existing `PubkyClient` class, which now uses the enhanced implementation internally while maintaining backward compatibility with existing code.

```typescript
import { PubkyClient } from '../services/domain/PubkyClient';

// Create a client instance
const client = new PubkyClient();

// Generate a keypair (uses enhanced implementation internally)
const keypair = await client.generateKeypair();
```

## Testing

The enhanced client includes comprehensive tests in `tests/pubky-enhanced-client.test.ts`. Run the tests with:

```bash
npm test -- -t "Enhanced Pubky Client"
```

## Example

See `examples/pubky-example.ts` for a complete example of using the enhanced Pubky client.