# PhoenixD LSP Integration for Satnam Family Banking

This document covers the complete PhoenixD Lightning Service Provider integration that replaces Zeus Olympus for self-custodial, zero-configuration family banking.

## Overview

PhoenixD provides automated liquidity management, lightweight binaries, and seamless Lightning Network integration perfect for family banking needs. Our integration includes:

- **Self-custodial**: Families maintain full control of their Lightning funds
- **Zero-configuration**: Automated channel management and liquidity
- **Privacy-enhanced**: Integration with LNProxy for payment privacy
- **Family-optimized**: Role-based limits and automated allowances

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Family Web    │    │   PhoenixD      │    │   Lightning     │
│   Interface     │◄──►│   Integration   │◄──►│   Network       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Privacy       │
                       │   Layer         │
                       │   (LNProxy)     │
                       └─────────────────┘
```

## Components

### 1. PhoenixdClient (`src/lib/phoenixd-client.ts`)

Core client for PhoenixD daemon communication:

```typescript
const phoenixdClient = new PhoenixdClient();

// Get node status
const nodeInfo = await phoenixdClient.getNodeInfo();

// Create privacy-enhanced invoice
const invoice = await phoenixdClient.createFamilyInvoice(
  "alice",
  50000,
  "Weekly allowance",
);

// Pay Lightning invoice
const payment = await phoenixdClient.payInvoice(invoice.serialized);
```

**Key Features:**

- HTTP API integration with PhoenixD daemon
- Automated liquidity management
- Privacy-enhanced invoice creation
- Family member specific configurations

### 2. FamilyPhoenixdManager (`src/lib/family-phoenixd-manager.ts`)

Family banking automation layer:

```typescript
const familyManager = new FamilyPhoenixdManager();

// Setup channel for family member
const channel = await familyManager.setupFamilyMemberChannel(familyMember);

// Process allowance liquidity
const result = await familyManager.processAllowanceLiquidity(familyMember);

// Handle emergency liquidity
const emergency = await familyManager.handleEmergencyLiquidity({
  familyMember: "alice",
  requiredAmount: 25000,
  urgency: "high",
  reason: "Emergency school payment",
});
```

**Key Features:**

- Automated channel opening
- Just-in-time liquidity for allowances
- Emergency liquidity protocols
- Role-based channel sizing

### 3. API Endpoints

#### `/api/phoenixd/status`

Get PhoenixD node status and health information.

```bash
GET /api/phoenixd/status
```

Response:

```json
{
  "status": "healthy",
  "nodeInfo": {
    "nodeId": "02a1b2c3...",
    "alias": "SatnamFamily",
    "blockHeight": 820000,
    "version": "v0.3.2",
    "network": "mainnet"
  },
  "balance": {
    "balanceSat": 250000,
    "feeCreditSat": 10000,
    "totalSat": 260000
  },
  "familyBanking": {
    "enabled": true,
    "privacyEnabled": true,
    "ready": true
  }
}
```

#### `/api/phoenixd/family-channels`

Manage family member channels.

```bash
# Get channel status
GET /api/phoenixd/family-channels?username=alice

# Setup new channel
POST /api/phoenixd/family-channels
{
  "username": "alice",
  "initialLiquidity": 100000,
  "allowanceConfig": {
    "enabled": true,
    "amount": 10000,
    "frequency": "weekly"
  }
}
```

#### `/api/phoenixd/liquidity`

Handle liquidity management.

```bash
# Get liquidity status
GET /api/phoenixd/liquidity?username=alice

# Request emergency liquidity
POST /api/phoenixd/liquidity
{
  "username": "alice",
  "type": "emergency",
  "amount": 25000,
  "urgency": "high",
  "reason": "School payment needed"
}
```

#### `/api/phoenixd/payments`

Process family payments.

```bash
# Create invoice
POST /api/phoenixd/payments?action=create-invoice
{
  "username": "alice",
  "amountSat": 10000,
  "description": "Weekly allowance",
  "allowancePayment": true
}

# Pay invoice
POST /api/phoenixd/payments?action=pay-invoice
{
  "username": "bob",
  "invoice": "lnbc100n1...",
  "maxFees": 1000
}
```

## Database Schema

### PhoenixD Channel Tracking

```sql
-- Add to family_members table
ALTER TABLE family_members
ADD COLUMN phoenixd_channel_id TEXT,
ADD COLUMN phoenixd_setup_date TIMESTAMP;
```

### Liquidity Events Logging

```sql
CREATE TABLE phoenixd_liquidity_events (
  id UUID PRIMARY KEY,
  family_member_id UUID REFERENCES family_members(id),
  channel_id TEXT NOT NULL,
  amount_sat BIGINT NOT NULL,
  trigger_type TEXT NOT NULL, -- 'allowance', 'emergency', 'manual'
  status TEXT NOT NULL,       -- 'pending', 'completed', 'failed'
  fees_sat BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Automated Allowance Configuration

```sql
CREATE TABLE automated_allowance_config (
  id UUID PRIMARY KEY,
  family_member_id UUID REFERENCES family_members(id),
  enabled BOOLEAN DEFAULT false,
  amount_sat BIGINT NOT NULL,
  frequency TEXT NOT NULL,    -- 'daily', 'weekly', 'monthly'
  next_payment TIMESTAMP NOT NULL,
  auto_topup BOOLEAN DEFAULT true,
  emergency_threshold_sat BIGINT DEFAULT 10000
);
```

## Environment Configuration

Add to your `.env` file:

```bash
# PhoenixD daemon connection
PHOENIXD_HOST=http://127.0.0.1:9740
PHOENIXD_API_TOKEN=your_phoenixd_api_token
PHOENIXD_USERNAME=phoenix

# Family banking configuration
FAMILY_PHOENIXD_ENABLED=true
PHOENIXD_MIN_CHANNEL_SIZE=50000

# Liquidity management
FAMILY_EMERGENCY_THRESHOLD=10000
FAMILY_MAX_EMERGENCY=100000
FAMILY_ALLOWANCE_PREP_DAYS=2

# Channel size defaults by role
PHOENIXD_PARENT_CHANNEL_SIZE=200000
PHOENIXD_TEEN_CHANNEL_SIZE=100000
PHOENIXD_CHILD_CHANNEL_SIZE=50000
```

## Setup Instructions

### 1. Install PhoenixD

```bash
# Download PhoenixD binary for your platform
# https://github.com/ACINQ/phoenix/releases

# Start PhoenixD daemon
./phoenixd --data-dir ./phoenix-data
```

### 2. Install Dependencies

```bash
npm install phoenix-server-js
```

### 3. Run Database Migration

```bash
npm run migrate:phoenixd
```

### 4. Health Check

```bash
# Basic health check
npm run health:phoenixd

# Verbose health check
npm run health:phoenixd:verbose
```

### 5. Setup Family Channels

```typescript
// Setup channel for family member
const response = await fetch("/api/phoenixd/family-channels", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: "alice",
    initialLiquidity: 100000,
    allowanceConfig: {
      enabled: true,
      amount: 10000,
      frequency: "weekly",
    },
  }),
});
```

## Family Banking Features

### Role-Based Channel Sizing

- **Parent**: 200,000 sats default channel
- **Teen**: 100,000 sats default channel
- **Child**: 50,000 sats default channel

### Automated Allowances

- Just-in-time liquidity preparation
- Configurable frequency (daily/weekly/monthly)
- Automatic top-up when needed
- Emergency threshold monitoring

### Emergency Liquidity

- Urgency levels: low, medium, high, critical
- Configurable maximum emergency amounts
- Audit trail for all emergency requests
- Family member role-based limits

### Privacy Enhancement

- LNProxy integration for payment privacy
- Optional privacy for all family payments
- Configurable privacy fees
- Fallback to direct payments if privacy fails

## Monitoring and Analytics

### Liquidity Events Dashboard

Track all liquidity operations:

- Allowance preparations
- Emergency funding
- Manual top-ups
- Fee analysis

### Family Spending Insights

- Daily/weekly/monthly spending patterns
- Channel utilization metrics
- Liquidity efficiency analysis
- Cost optimization recommendations

## Security Considerations

### Access Controls

- API endpoints require family member authentication
- Channel operations limited by role permissions
- Emergency liquidity requires approval workflows
- Audit logging for all operations

### Privacy Protection

- Optional payment privacy via LNProxy
- Channel management privacy
- Family member anonymity options
- Configurable privacy preferences

## Troubleshooting

### Common Issues

1. **PhoenixD Connection Failed**

   - Check PhoenixD daemon is running
   - Verify API token configuration
   - Confirm network connectivity

2. **Insufficient Liquidity**

   - Check PhoenixD balance
   - Verify channel capacity
   - Consider emergency liquidity request

3. **Privacy Service Unavailable**
   - Payments will work without privacy
   - Check LNProxy connectivity
   - Consider direct payment fallback

### Health Check Commands

```bash
# Full system health check
npm run health:phoenixd:verbose

# PhoenixD specific checks
npm run health:phoenixd

# Database migration status
npm run migrate:phoenixd
```

## Migration from Zeus Olympus

The PhoenixD integration is designed as a drop-in replacement for Zeus Olympus:

1. **API Compatibility**: Existing Lightning address callbacks work seamlessly
2. **Enhanced Features**: Automated liquidity management and family banking
3. **Privacy Improvement**: Better privacy integration with LNProxy
4. **Self-Custodial**: No reliance on third-party custody solutions

### Migration Steps

1. Install PhoenixD and configure environment variables
2. Run database migration to add PhoenixD tables
3. Update Lightning address callback to use PhoenixD client
4. Setup family member channels via API
5. Configure automated allowances as needed

## API Reference

See individual API endpoint files for detailed documentation:

- `api/phoenixd/status.ts` - Node status and health
- `api/phoenixd/family-channels.ts` - Channel management
- `api/phoenixd/liquidity.ts` - Liquidity operations
- `api/phoenixd/payments.ts` - Payment processing

## Support

For PhoenixD integration support:

1. Check the health check output for specific issues
2. Review PhoenixD daemon logs
3. Verify environment configuration
4. Test API endpoints individually
5. Check database migration status

The PhoenixD integration provides a robust, self-custodial foundation for Satnam family banking with automated liquidity management and privacy enhancement.
