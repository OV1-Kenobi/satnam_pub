# Domain Management Service

This document describes the comprehensive domain management service that abstracts domain providers and provides a unified API for domain operations.

## Overview

The Domain Management Service provides a unified interface for managing domains across different providers, including traditional DNS providers (Namecheap, Cloudflare) and decentralized providers (Pubky, Handshake, ENS). It supports domain registration, verification, DNS record management, NIP-05 configuration, Lightning address configuration, domain transfers, and family domain federation.

## Architecture

The service follows a modular architecture with the following components:

1. **Domain Service**: The main service that provides a unified interface for domain operations.
2. **Domain Providers**: Implementations for different domain providers (Traditional, Pubky, etc.).
3. **Domain Provider Factory**: Creates domain provider instances based on the provider type.
4. **WebSocket Service**: Provides real-time updates for domain operations.
5. **GraphQL Schema**: Defines the GraphQL API for complex domain queries.
6. **REST API**: Provides RESTful endpoints for domain operations.

## Database Schema

The service uses the following database tables:

### domain_records

This table stores information about domains:

```sql
CREATE TABLE domain_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id),
  domain_name VARCHAR(255) NOT NULL,
  domain_type VARCHAR(20) NOT NULL, -- 'traditional', 'pubky', 'handshake', 'ens'
  pubky_public_key TEXT,
  dns_records JSONB, -- Flexible DNS record storage
  signed_zone_data TEXT, -- Cryptographically signed zone
  sovereignty_score INTEGER,
  sovereignty_details JSONB,
  provider_config JSONB,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### domain_members

This table stores information about domain members:

```sql
CREATE TABLE domain_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_record_id UUID REFERENCES domain_records(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  role VARCHAR(20) NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member'
  permissions JSONB DEFAULT '[]'::jsonb, -- Array of permission strings
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(domain_record_id, user_id)
);
```

### domain_verifications

This table stores information about domain verifications:

```sql
CREATE TABLE domain_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_record_id UUID REFERENCES domain_records(id),
  verification_type VARCHAR(50), -- 'txt_record', 'pubky_signature', 'dns_challenge'
  verification_data TEXT,
  verified_at TIMESTAMP,
  expires_at TIMESTAMP
);
```

### domain_transfer_requests

This table stores information about domain transfer requests:

```sql
CREATE TABLE domain_transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_record_id UUID REFERENCES domain_records(id) ON DELETE CASCADE,
  source_provider VARCHAR(50) NOT NULL,
  target_provider VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'cancelled'
  transfer_data JSONB, -- Provider-specific transfer data
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### domain_inheritance

This table stores information about domain inheritance:

```sql
CREATE TABLE domain_inheritance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_record_id UUID REFERENCES domain_records(id) ON DELETE CASCADE,
  heir_user_id UUID REFERENCES users(id),
  activation_conditions JSONB, -- Conditions for inheritance activation
  activated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(domain_record_id)
);
```

### domain_federation

This table stores information about domain federation:

```sql
CREATE TABLE domain_federation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id),
  domain_record_id UUID REFERENCES domain_records(id) ON DELETE CASCADE,
  federation_data JSONB, -- Federation configuration and metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(domain_record_id)
);
```

### domain_audit_log

This table stores information about domain operations:

```sql
CREATE TABLE domain_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_record_id UUID REFERENCES domain_records(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete', 'transfer', etc.
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Domain Providers

The service supports the following domain providers:

### Traditional DNS Provider

This provider handles domain operations for traditional DNS providers like Namecheap, Cloudflare, etc. It has a lower sovereignty score (around 30) because domains can be taken away by the provider or government.

### Pubky DNS Provider

This provider handles domain operations for the Pubky decentralized DNS system. It has a higher sovereignty score (around 85) because domains are cryptographically owned and cannot be taken away.

### Future Providers

The service is designed to be extensible, with placeholders for future providers like Handshake and ENS.

## Domain Operations

The service supports the following domain operations:

### Domain Registration and Verification

- Register a new domain with a provider
- Verify domain ownership
- Get verification instructions

### DNS Record Management

- Add DNS records
- Update DNS records
- Delete DNS records
- Get DNS records

### NIP-05 and Lightning Address Configuration

- Configure NIP-05 for a domain
- Configure Lightning address for a domain

### Domain Transfer

- Initiate domain transfer to another provider
- Complete domain transfer

### Domain Sovereignty

- Calculate domain sovereignty score
- Get sovereignty details

### Multi-Member Domain Management

- Add domain members
- Update domain members
- Remove domain members
- Transfer domain ownership

### Family Domain Federation

- Federate domains across a family
- Get federation details

### Domain Inheritance

- Set up domain inheritance
- Activate domain inheritance

## API

The service provides both REST and GraphQL APIs for domain operations.

### REST API

The REST API provides the following endpoints:

- `GET /api/domains/family/:familyId`: Get all domains for a family
- `GET /api/domains/:id`: Get a domain by ID
- `GET /api/domains/check/:domainName`: Check domain availability
- `POST /api/domains/register`: Register a new domain
- `POST /api/domains/:id/verify`: Verify domain ownership
- `GET /api/domains/:id/verification-instructions`: Get verification instructions
- `GET /api/domains/:id/dns-records`: Get DNS records
- `POST /api/domains/:id/dns-records`: Add a DNS record
- `PUT /api/domains/:id/dns-records/:recordId`: Update a DNS record
- `DELETE /api/domains/:id/dns-records/:recordId`: Delete a DNS record
- `POST /api/domains/:id/nip05`: Configure NIP-05
- `POST /api/domains/:id/lightning`: Configure Lightning address
- `GET /api/domains/:id/sovereignty-score`: Calculate domain sovereignty score
- `POST /api/domains/:id/transfer`: Initiate domain transfer
- `POST /api/domains/transfers/:transferId/complete`: Complete domain transfer
- `POST /api/domains/:id/members`: Add a domain member
- `GET /api/domains/:id/members`: Get domain members
- `PUT /api/domains/:id/members/:userId`: Update a domain member
- `DELETE /api/domains/:id/members/:userId`: Remove a domain member
- `POST /api/domains/:id/transfer-ownership`: Transfer domain ownership
- `POST /api/domains/:id/inheritance`: Set up domain inheritance
- `POST /api/domains/family/:familyId/federate`: Federate family domains

### GraphQL API

The GraphQL API provides a more flexible interface for complex domain queries. See the GraphQL schema for details.

### WebSocket API

The WebSocket API provides real-time updates for domain operations. Clients can subscribe to domain events by domain ID or family ID.

## Implementation

To apply the database migration:

```bash
node scripts/apply_domain_management_migration.js
```

## Security Considerations

- Domain operations are protected by authentication and authorization
- Domain members have specific roles and permissions
- Domain transfers require verification
- Domain inheritance is protected by activation conditions

## Future Enhancements

- Add support for more domain providers (Handshake, ENS, etc.)
- Implement domain escrow for secure transfers
- Add domain marketplace functionality
- Implement domain reputation scoring
- Add domain privacy protection
- Implement domain monitoring and alerts