# Nostr & Lightning Control Board

A comprehensive dashboard for managing Nostr and Lightning Network operations for families, built with privacy-first architecture.

## Overview

The Control Board is a unified interface that integrates all Nostr and Lightning Network functionality into a single, easy-to-use dashboard. It provides real-time monitoring, management capabilities, and privacy-enhanced operations for family Bitcoin and Nostr coordination.

## Features

### 🎯 Dashboard Overview

- **System Status**: Real-time monitoring of Nostr relays and Lightning nodes
- **Lightning Treasury**: Family balance management and transaction tracking
- **Privacy Metrics**: Comprehensive privacy usage analytics
- **Family Members**: Member management with role-based permissions
- **Recent Activity**: Combined view of Lightning and Nostr activity

### ⚡ Lightning Network Management

- **Node Monitoring**: Track Lightning node status, channels, and capacity
- **Lightning Addresses**: Manage family Lightning addresses (@satnam.pub)
- **Transaction History**: Complete transaction tracking with privacy indicators
- **Payment Processing**: Send/receive payments with optional privacy enhancement

### 🔗 Nostr Protocol Integration

- **Relay Management**: Add, monitor, and manage Nostr relay connections
- **Event Coordination**: Family event signing and coordination
- **Message Tracking**: Monitor Nostr activity across family members
- **Encrypted Communications**: Privacy-enhanced Nostr messaging

### 🛡️ Privacy-First Architecture

- **Privacy Modes**: Standard, Enhanced, and Stealth privacy levels
- **LNProxy Integration**: Privacy-enhanced Lightning payments
- **Tor Routing**: Optional Tor support for maximum privacy
- **Event Encryption**: Encrypted Nostr event coordination
- **Relay Rotation**: Automatic relay switching for privacy

### 👨‍👩‍👧‍👦 Family Coordination

- **Role-Based Access**: Parent, child, and guardian permission levels
- **Spending Limits**: Configurable daily/transaction limits
- **Activity Monitoring**: Track family member activity and status
- **Federated Signing**: Multi-signature coordination for family events

## Architecture

### Components

```
src/components/NostrLightningControlBoard.tsx
├── Overview Tab (Dashboard summary)
├── Nostr Tab (Relay and event management)
├── Lightning Tab (Node and payment management)
├── Family Tab (Member management)
├── Privacy Tab (Privacy settings and metrics)
└── Settings Tab (System configuration)
```

### Services

```
services/control-board.ts
├── ControlBoardService (Main service class)
├── getControlBoardStats() (Aggregate statistics)
├── Lightning Management (Payments, nodes, addresses)
├── Nostr Management (Relays, events, coordination)
├── Family Management (Members, permissions, limits)
├── Privacy Management (Settings, metrics, operations)
└── Health Monitoring (System status checks)
```

**Import Path**: `services/control-board.ts` (from project root)

### Database Schema

See [Database Schema](#database-schema-1) section below for complete table definitions and privacy-enhanced security features.

## Installation & Setup

### 1. Run Database Migration

```bash
# Run the control board schema migration
npm run migrate:control-board

# Verify migration was successful
npm run migrate:control-board -- verify

# Insert sample data for testing
npm run migrate:control-board -- migrate --sample-data
```

### 2. Environment Configuration

Ensure these environment variables are set:

```env
# Supabase (Database)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Lightning Network
VITE_VOLTAGE_LNBITS_URL=your_lnbits_url
VITE_VOLTAGE_ADMIN_KEY=your_admin_key

# Privacy (Optional)
VITE_ENABLE_LNPROXY=true
VITE_TOR_PROXY_URL=socks5://127.0.0.1:9050
```

### 3. Import and Use

```tsx
import { NostrLightningControlBoard } from "./components";
// Import from services index (exports from services/control-board.ts)
import { ControlBoardService } from "./services";

// Or import directly from the service file
// import { ControlBoardService } from "./services/control-board";

// Use the component
function App() {
  return (
    <NostrLightningControlBoard
      familyId="your_family_id"
      currentUserId="current_user_id"
      onBack={() => console.log("Back clicked")}
    />
  );
}

// Use the service
const controlBoard = new ControlBoardService("family_id");
const stats = await controlBoard.getControlBoardStats();
```

## Usage Examples

### Basic Dashboard Usage

```tsx
import React from "react";
import { NostrLightningControlBoard } from "./components";

export function FamilyApp() {
  const handleBack = () => {
    // Navigate back to main app
    window.history.back();
  };

  return (
    <NostrLightningControlBoard
      familyId="nakamoto_family_001"
      currentUserId="user_123"
      onBack={handleBack}
    />
  );
}
```

### Service Integration

```typescript
// Import from services index (recommended)
import { ControlBoardService } from "./services";

// Or import directly from the service file
// import { ControlBoardService } from "./services/control-board";

// Initialize service
const service = new ControlBoardService("family_id");

// Get dashboard statistics
const stats = await service.getControlBoardStats();
console.log("Lightning balance:", stats.lightning.totalBalance);
console.log("Privacy rate:", stats.privacy.privacyRate);

// Send Lightning payment
await service.sendLightningPayment({
  from: "dad@satnam.pub",
  to: "daughter@satnam.pub",
  amount: 25000,
  description: "Weekly allowance",
  enablePrivacy: true,
});

// Add Nostr relay
await service.addNostrRelay("wss://relay.example.com", {
  readAccess: true,
  writeAccess: true,
});

// Update privacy settings
await service.updatePrivacySettings({
  mode: "enhanced",
  enableLnproxy: true,
  maxPrivacyFeePercent: 3,
});
```

### Custom Privacy Configuration

```typescript
// Get current privacy settings
const privacySettings = await service.getPrivacySettings();

// Update privacy mode
await service.updatePrivacySettings({
  mode: "stealth",
  enableLnproxy: true,
  enableTorRouting: true,
  enableEventEncryption: true,
  relayRotation: true,
  autoPrivacyFees: true,
  maxPrivacyFeePercent: 5,
});
```

## Testing

### Running Tests

```bash
# Run all Control Board tests
npm run test:backend:vitest -- --grep "control-board"

# Run component tests
npm test -- NostrLightningControlBoard

# Run service tests
npm run test:backend:vitest -- control-board-service.test.ts

# Run with coverage
npm run test:coverage
```

### Test Structure

```typescript
// Component tests
describe("NostrLightningControlBoard", () => {
  it("should render overview tab by default");
  it("should switch between tabs");
  it("should display family member information");
  it("should handle privacy mode toggling");
});

// Service tests
describe("ControlBoardService", () => {
  it("should fetch control board statistics");
  it("should send Lightning payments");
  it("should manage Nostr relays");
  it("should update privacy settings");
});
```

## Privacy Features

### Privacy Modes

1. **Standard Mode**

   - Basic Lightning payments
   - Standard Nostr relay usage
   - No additional privacy fees

2. **Enhanced Mode**

   - LNProxy-enhanced payments
   - Relay rotation
   - Encrypted family coordination
   - ~2-3% privacy fees

3. **Stealth Mode**
   - Tor routing for all connections
   - Maximum event encryption
   - Advanced relay strategies
   - ~3-5% privacy fees

### Privacy Metrics Tracking

The system tracks comprehensive privacy metrics:

- **Privacy Rate**: Percentage of transactions using privacy features
- **Average Privacy Fee**: Cost of privacy-enhanced operations
- **Relay Distribution**: Usage across different Nostr relays
- **Encrypted Events**: Count of encrypted family coordination events

## API Reference

### ControlBoardService Methods

#### `getControlBoardStats(): Promise<ControlBoardStats>`

Returns comprehensive dashboard statistics.

#### `sendLightningPayment(params): Promise<PaymentResult>`

Sends a Lightning payment with optional privacy enhancement.

#### `getRecentTransactions(limit?: number): Promise<Transaction[]>`

Retrieves recent Lightning transactions.

#### `addNostrRelay(url: string, options?): Promise<void>`

Adds a new Nostr relay connection.

#### `updatePrivacySettings(settings): Promise<void>`

Updates family privacy configuration.

#### `healthCheck(): Promise<HealthStatus>`

Performs system health check across all services.

## Database Schema

### Overview

The Control Board uses a privacy-first database architecture with encrypted sensitive data and comprehensive audit trails:

```sql
-- Core tables
transactions            -- Lightning transaction tracking with privacy indicators
nostr_relays           -- Nostr relay management with connection status
nostr_events           -- Nostr event coordination with encryption metadata
lightning_nodes        -- Lightning node management with health monitoring
family_privacy_settings -- Privacy configuration with encrypted preferences
privacy_operations_log  -- Privacy audit log with encrypted operation details

-- Analytics views
control_board_overview -- Dashboard statistics with privacy metrics
privacy_metrics       -- Privacy usage analytics and fee tracking
recent_activity       -- Combined activity feed with privacy indicators
```

### Detailed Table Definitions

#### Core Tables

```sql
-- Lightning transactions with privacy-first design
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) NOT NULL,
  type VARCHAR(20) CHECK (type IN ('sent', 'received', 'internal')) NOT NULL,
  amount BIGINT NOT NULL, -- Amount in satoshis
  from_address VARCHAR(255), -- Encrypted Lightning address
  to_address VARCHAR(255),   -- Encrypted Lightning address
  privacy_enabled BOOLEAN DEFAULT false,
  privacy_fee DECIMAL(10,2) DEFAULT 0.00, -- Privacy fee in satoshis
  lnproxy_used BOOLEAN DEFAULT false,     -- LNProxy privacy enhancement
  tor_routed BOOLEAN DEFAULT false,       -- Tor routing indicator
  encrypted_memo TEXT,                    -- Encrypted transaction memo
  payment_hash VARCHAR(64),               -- Lightning payment hash
  preimage VARCHAR(64),                   -- Payment preimage (encrypted)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Nostr relay management with privacy features
CREATE TABLE nostr_relays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) NOT NULL,
  url VARCHAR(500) NOT NULL,              -- Support for .onion URLs
  status VARCHAR(20) DEFAULT 'disconnected',
  read_access BOOLEAN DEFAULT true,
  write_access BOOLEAN DEFAULT true,
  is_tor_relay BOOLEAN DEFAULT false,     -- Tor hidden service indicator
  connection_quality INTEGER DEFAULT 0,   -- Connection quality score (0-100)
  message_count INTEGER DEFAULT 0,
  last_connected_at TIMESTAMP WITH TIME ZONE,
  encrypted_auth_token TEXT,              -- Encrypted relay auth token
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Nostr event coordination with encryption
CREATE TABLE nostr_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) NOT NULL,
  event_id VARCHAR(64) NOT NULL,          -- Nostr event ID
  kind INTEGER NOT NULL,                  -- Nostr event kind
  pubkey VARCHAR(64) NOT NULL,            -- Author public key
  encrypted_content TEXT,                 -- Encrypted event content
  is_encrypted BOOLEAN DEFAULT false,     -- Encryption indicator
  relay_urls TEXT[],                      -- Relays where event was published
  signature VARCHAR(128),                 -- Event signature
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lightning node management
CREATE TABLE lightning_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) NOT NULL,
  node_pubkey VARCHAR(66) NOT NULL,       -- Lightning node public key
  alias VARCHAR(255),                     -- Node alias
  node_type VARCHAR(20) DEFAULT 'lnd',    -- Node implementation type
  encrypted_credentials TEXT NOT NULL,    -- Encrypted node credentials
  is_tor_node BOOLEAN DEFAULT false,      -- Tor-only node indicator
  status VARCHAR(20) DEFAULT 'offline',
  balance_msat BIGINT DEFAULT 0,          -- Node balance in millisatoshis
  channel_count INTEGER DEFAULT 0,
  last_health_check TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Privacy settings with encrypted preferences
CREATE TABLE family_privacy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) UNIQUE NOT NULL,
  mode VARCHAR(20) DEFAULT 'standard' CHECK (mode IN ('standard', 'enhanced', 'stealth')),
  enable_lnproxy BOOLEAN DEFAULT false,
  enable_tor_routing BOOLEAN DEFAULT false,
  enable_event_encryption BOOLEAN DEFAULT true,
  relay_rotation BOOLEAN DEFAULT false,
  auto_privacy_fees BOOLEAN DEFAULT false,
  max_privacy_fee_percent DECIMAL(5,2) DEFAULT 5.0,
  encrypted_tor_config TEXT,              -- Encrypted Tor configuration
  encrypted_relay_preferences TEXT,       -- Encrypted relay selection preferences
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Privacy operations audit log
CREATE TABLE privacy_operations_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) NOT NULL,
  operation_type VARCHAR(50) NOT NULL,    -- e.g., 'lnproxy_payment', 'tor_relay_switch'
  encrypted_details TEXT,                 -- Encrypted operation details
  privacy_level VARCHAR(20),              -- standard/enhanced/stealth
  fee_paid_sats DECIMAL(10,2) DEFAULT 0,  -- Privacy fee paid
  success BOOLEAN DEFAULT true,
  error_message TEXT,                     -- Encrypted error details
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Analytics Views

```sql
-- Dashboard overview with privacy metrics
CREATE VIEW control_board_overview AS
SELECT
  f.id as family_id,
  COUNT(DISTINCT ln.id) as lightning_nodes_count,
  COUNT(DISTINCT nr.id) as nostr_relays_count,
  COUNT(DISTINCT CASE WHEN t.created_at > NOW() - INTERVAL '24 hours' THEN t.id END) as recent_transactions_24h,
  COALESCE(SUM(CASE WHEN t.type = 'received' THEN t.amount ELSE 0 END), 0) as total_received_sats,
  COALESCE(SUM(CASE WHEN t.type = 'sent' THEN t.amount ELSE 0 END), 0) as total_sent_sats,
  ROUND(
    COALESCE(
      (COUNT(CASE WHEN t.privacy_enabled THEN 1 END)::FLOAT / NULLIF(COUNT(t.id), 0)) * 100,
      0
    ), 2
  ) as privacy_rate_percent
FROM families f
LEFT JOIN lightning_nodes ln ON f.id = ln.family_id
LEFT JOIN nostr_relays nr ON f.id = nr.family_id
LEFT JOIN transactions t ON f.id = t.family_id
GROUP BY f.id;

-- Privacy metrics analysis
CREATE VIEW privacy_metrics AS
SELECT
  family_id,
  COUNT(*) as total_operations,
  COUNT(CASE WHEN privacy_enabled THEN 1 END) as privacy_operations,
  ROUND(AVG(privacy_fee), 2) as avg_privacy_fee_sats,
  COUNT(CASE WHEN lnproxy_used THEN 1 END) as lnproxy_usage_count,
  COUNT(CASE WHEN tor_routed THEN 1 END) as tor_routing_count,
  DATE_TRUNC('day', created_at) as date
FROM transactions
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY family_id, DATE_TRUNC('day', created_at)
ORDER BY date DESC;

-- Recent activity feed with privacy indicators
CREATE VIEW recent_activity AS
SELECT
  'transaction' as activity_type,
  t.id as activity_id,
  t.family_id,
  t.amount,
  t.privacy_enabled,
  t.created_at,
  CASE
    WHEN t.privacy_enabled THEN '🛡️ Private'
    ELSE '📤 Standard'
  END as privacy_status
FROM transactions t
UNION ALL
SELECT
  'nostr_event' as activity_type,
  ne.id as activity_id,
  ne.family_id,
  NULL as amount,
  ne.is_encrypted as privacy_enabled,
  ne.created_at,
  CASE
    WHEN ne.is_encrypted THEN '🔒 Encrypted'
    ELSE '📝 Standard'
  END as privacy_status
FROM nostr_events ne
ORDER BY created_at DESC
LIMIT 100;
```

#### Security Features

- **Row Level Security (RLS)**: All tables enforce family-based data isolation
- **Encrypted Sensitive Data**: Credentials, memos, and personal data are encrypted at rest
- **Audit Trails**: Comprehensive logging of all privacy operations
- **Privacy Indicators**: Clear marking of privacy-enhanced vs. standard operations
- **Tor Support**: Native support for .onion URLs and Tor routing indicators

## Security Considerations

### Authentication & Authorization

- Row Level Security (RLS) on all tables
- Family-based data isolation
- Role-based permission checking

### Privacy Protection

- Encrypted API keys in database
- No sensitive data in client-side storage
- Optional Tor routing for anonymity

### Audit Logging

- Comprehensive privacy operation logging
- Transaction audit trails
- System access monitoring

## Troubleshooting

### Common Issues

1. **Migration Fails**

   ```bash
   # Verify database connection
   npm run supabase:test

   # Run migration with verbose output
   npm run migrate:control-board -- migrate --verbose
   ```

2. **Component Not Rendering**

   ```bash
   # Check for missing UI component dependencies
   npm ls @radix-ui/react-slot lucide-react

   # Verify component export
   npm run build
   ```

3. **Service Errors**

   ```bash
   # Test service functionality
   npm run test:backend:vitest -- control-board-service.test.ts

   # Check environment variables
   echo $VITE_SUPABASE_URL
   ```

### Performance Optimization

- Database indexes on frequently queried columns
- Lazy loading of transaction history
- Optimized React rendering with useMemo/useCallback
- Efficient WebSocket connections for real-time updates

## Roadmap

### Planned Features

- [ ] WebSocket real-time updates
- [ ] Mobile-responsive design improvements
- [ ] Advanced analytics and reporting
- [ ] Multi-language support
- [ ] Enhanced Tor integration
- [ ] Advanced relay selection algorithms
- [ ] Integration with hardware wallets
- [ ] Automated privacy optimization

### Contributing

1. Follow existing code patterns and testing standards
2. Ensure all new features include comprehensive tests
3. Update documentation for any API changes
4. Test privacy features thoroughly
5. Consider mobile and accessibility requirements

For questions or contributions, see the main project README.md for contact information.
