# Enhanced Family Banking System - Integration Testing Guide

## Overview

The Enhanced Family Banking System includes comprehensive integration tests that can run with real Lightning Network services, Zeus LSP integration, and Supabase database. These are **not mock tests** - they perform actual operations when provided with real credentials.

## Test Structure

### Core System Tests

- **Enhanced Family Coordinator** (`src/lib/__tests__/enhanced-family-coordinator.test.ts`)
- **Allowance Automation System** (`src/lib/__tests__/allowance-automation.test.ts`)
- **Liquidity Intelligence System** (`src/lib/__tests__/liquidity-intelligence.test.ts`)
- **Enhanced Family APIs** (`api/__tests__/enhanced-family-apis.test.ts`)

## Environment Variables Required

### Essential Credentials (for real testing)

```bash
# Zeus LSP Integration
ZEUS_LSP_ENDPOINT="https://your-zeus-olympus-endpoint.com"
ZEUS_API_KEY="your-zeus-api-key"

# Lightning Network (Voltage/LNbits)
VOLTAGE_NODE_ID="your-voltage-node-id"
LNBITS_ADMIN_KEY="your-lnbits-admin-key"

# Supabase Database
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SUPABASE_ANON_KEY="your-anon-key"
```

### Optional Test-Specific Variables

```bash
# Test Family Configuration
TEST_FAMILY_ID="test-family-uuid"
TEST_PARENT_MEMBER_ID="test-parent-uuid"
TEST_CHILD_MEMBER_ID="test-child-uuid"

# Test Behavior Overrides
TEST_TIMEOUT="60000"  # Test timeout in milliseconds
TEST_DRY_RUN="false"  # Set to true for dry-run testing
```

## Running Tests

### 1. Enhanced Family Banking Tests

```bash
# Run all enhanced family tests
npm run test:enhanced-family

# Run with watch mode
npm run test:enhanced-family:watch

# Run with coverage
npm run test:enhanced-family:coverage

# Run specific test files
npx vitest src/lib/__tests__/enhanced-family-coordinator.test.ts
npx vitest src/lib/__tests__/allowance-automation.test.ts
npx vitest src/lib/__tests__/liquidity-intelligence.test.ts
npx vitest api/__tests__/enhanced-family-apis.test.ts
```

### 2. Individual Component Testing

```bash
# Test Enhanced Family Coordinator only
npx vitest src/lib/__tests__/enhanced-family-coordinator.test.ts

# Test Allowance Automation only
npx vitest src/lib/__tests__/allowance-automation.test.ts

# Test Liquidity Intelligence only
npx vitest src/lib/__tests__/liquidity-intelligence.test.ts

# Test API endpoints only
npx vitest api/__tests__/enhanced-family-apis.test.ts
```

### 3. Combined Testing with Zeus

```bash
# Run enhanced family tests + existing Zeus tests
npm run test:zeus:vitest && npm run test:enhanced-family
```

## Test Categories

### 1. Enhanced Family Coordinator Tests

#### Initialization & Configuration

- ✅ System initialization with real credentials
- ✅ Zeus LSP integration setup
- ✅ WebSocket server configuration
- ✅ Cron job registration
- ✅ Error handling for invalid credentials

#### Liquidity Management

- ✅ Real-time liquidity status monitoring
- ✅ Family liquidity metrics collection
- ✅ Liquidity threshold monitoring
- ✅ Emergency reserve management

#### Payment Routing

- ✅ Intelligent payment route generation
- ✅ Multi-layer routing optimization
- ✅ Zeus JIT liquidity integration
- ✅ Route performance analysis

#### Emergency Protocols

- ✅ Emergency liquidity provisioning
- ✅ Zeus JIT channel creation
- ✅ Emergency response automation
- ✅ Risk assessment and mitigation

### 2. Allowance Automation Tests

#### Schedule Management

- ✅ Create encrypted allowance schedules
- ✅ Update schedule configurations
- ✅ Schedule validation and sanitization
- ✅ Member permission management

#### Distribution Processing

- ✅ Automated allowance distribution
- ✅ Zeus JIT fallback mechanisms
- ✅ Retry logic with exponential backoff
- ✅ Multi-channel notification systems

#### Spending Controls

- ✅ Real-time spending limit enforcement
- ✅ Suspicious activity pattern detection
- ✅ Velocity-based risk scoring
- ✅ Geofencing and time-based restrictions

#### Analytics & Reporting

- ✅ Distribution success rate analysis
- ✅ Cost optimization recommendations
- ✅ Member spending pattern analysis
- ✅ System performance metrics

### 3. Liquidity Intelligence Tests

#### AI-Powered Forecasting

- ✅ LSTM/ARIMA/Random Forest models
- ✅ Daily/weekly/monthly predictions
- ✅ Confidence interval calculations
- ✅ Pattern recognition algorithms

#### Zeus LSP Optimization

- ✅ JIT liquidity optimization
- ✅ Capacity recommendation engine
- ✅ Fee optimization strategies
- ✅ Cost-benefit analysis

#### Risk Assessment

- ✅ Multi-factor risk scoring
- ✅ Early warning systems
- ✅ Scenario planning and simulation
- ✅ Mitigation strategy generation

#### Real-Time Monitoring

- ✅ Continuous liquidity monitoring
- ✅ Anomaly detection algorithms
- ✅ Alert escalation workflows
- ✅ Performance tracking

### 4. API Integration Tests

#### Enhanced Payment API

- ✅ Intelligent payment routing
- ✅ Approval workflow integration
- ✅ Risk assessment and scoring
- ✅ Zeus LSP fallback mechanisms

#### Liquidity Forecast API

- ✅ Comprehensive forecast generation
- ✅ Zeus-specific optimizations
- ✅ Confidence-based filtering
- ✅ Strategy prioritization

#### Allowance Schedule API

- ✅ CRUD operations with encryption
- ✅ Bulk processing capabilities
- ✅ Intelligence integration
- ✅ Performance optimization

#### Emergency Liquidity API

- ✅ Real-time emergency response
- ✅ Multi-source liquidity provision
- ✅ Protocol automation
- ✅ Historical analysis

## Test Execution Modes

### 1. Mock Mode (Default)

When no real credentials are provided:

- Uses mock data and simulated responses
- Tests system logic and error handling
- Safe for CI/CD environments
- No real Lightning Network operations

### 2. Integration Mode (With Real Credentials)

When real credentials are provided:

- Connects to actual Zeus LSP services
- Performs real Lightning Network operations
- Creates and manages real database records
- Tests end-to-end system functionality

### 3. Hybrid Mode

Some tests with real credentials, others with mocks:

- Allows selective testing of specific components
- Useful for debugging specific integrations
- Maintains test isolation

## Security Considerations

### 1. Credential Protection

- All sensitive data encrypted with unique salts
- Test credentials isolated from production
- Automatic cleanup of test data
- Privacy audit logging for all operations

### 2. Test Data Management

- Unique test family IDs for each test run
- Automatic cleanup in `afterAll` hooks
- No persistent test data in production databases
- Encrypted storage of all test records

### 3. Network Security

- All API calls use HTTPS/WSS protocols
- API key rotation testing
- Connection timeout handling
- Rate limiting compliance

## Performance Benchmarks

### Expected Response Times

- **Payment Processing**: < 30 seconds
- **Liquidity Forecasting**: < 35 seconds
- **Allowance Distribution**: < 45 seconds
- **Emergency Liquidity**: < 40 seconds

### Throughput Expectations

- **Concurrent API Requests**: 5+ simultaneous
- **Database Operations**: 100+ ops/second
- **WebSocket Connections**: 50+ concurrent
- **Cron Job Processing**: 1000+ schedules

## Debugging & Troubleshooting

### 1. Enable Verbose Logging

```bash
DEBUG=* npm run test:enhanced-family
```

### 2. Run Individual Test Suites

```bash
# Test specific functionality
npx vitest --run src/lib/__tests__/enhanced-family-coordinator.test.ts --reporter=verbose
```

### 3. Database State Inspection

```bash
# Check test data creation
npx vitest --run --reporter=verbose --bail
```

### 4. Network Connectivity Issues

```bash
# Test Zeus LSP connectivity
curl -H "Authorization: Bearer $ZEUS_API_KEY" $ZEUS_LSP_ENDPOINT/health

# Test Voltage/LNbits connectivity
curl -H "X-Api-Key: $LNBITS_ADMIN_KEY" $VOLTAGE_LNBITS_URL/api/v1/wallet
```

## Common Test Scenarios

### 1. Full System Integration Test

```bash
# Set all environment variables
export ZEUS_LSP_ENDPOINT="your-endpoint"
export ZEUS_API_KEY="your-key"
export VOLTAGE_NODE_ID="your-node-id"
export LNBITS_ADMIN_KEY="your-admin-key"

# Run complete test suite
npm run test:enhanced-family
```

### 2. Mock Testing Only

```bash
# Unset real credentials
unset ZEUS_LSP_ENDPOINT ZEUS_API_KEY VOLTAGE_NODE_ID LNBITS_ADMIN_KEY

# Run with mock data
npm run test:enhanced-family
```

### 3. Zeus LSP Focus Testing

```bash
# Set only Zeus credentials
export ZEUS_LSP_ENDPOINT="your-endpoint"
export ZEUS_API_KEY="your-key"

# Run Zeus-specific tests
npx vitest src/lib/__tests__/liquidity-intelligence.test.ts
```

## Test Data and Cleanup

### Automatic Cleanup

- All test data is automatically cleaned up in `afterAll` hooks
- Test families and members are deleted after each test run
- Encrypted schedules and transactions are purged
- No persistent test data remains in the database

### Manual Cleanup (if needed)

```sql
-- Clean up test families
DELETE FROM secure_families WHERE family_uuid LIKE 'test-family-%';

-- Clean up test members
DELETE FROM secure_family_members WHERE member_uuid LIKE 'test-parent-%' OR member_uuid LIKE 'test-child-%';

-- Clean up test schedules
DELETE FROM secure_allowance_schedules WHERE schedule_uuid LIKE 'test-schedule-%';
```

## Continuous Integration

### GitHub Actions Integration

```yaml
- name: Run Enhanced Family Tests
  run: |
    npm run test:enhanced-family
  env:
    ZEUS_LSP_ENDPOINT: ${{ secrets.ZEUS_LSP_ENDPOINT }}
    ZEUS_API_KEY: ${{ secrets.ZEUS_API_KEY }}
    VOLTAGE_NODE_ID: ${{ secrets.VOLTAGE_NODE_ID }}
    LNBITS_ADMIN_KEY: ${{ secrets.LNBITS_ADMIN_KEY }}
```

### Test Coverage Goals

- **Core System Coverage**: > 90%
- **API Endpoint Coverage**: > 85%
- **Error Handling Coverage**: > 95%
- **Integration Test Coverage**: > 80%

## Contributing

### Adding New Tests

1. Follow the existing test structure
2. Include both mock and real credential modes
3. Add proper cleanup in `afterAll` hooks
4. Document test scenarios and expected outcomes
5. Include performance benchmarks

### Test Naming Conventions

- Use descriptive test names
- Group related tests in `describe` blocks
- Use consistent naming for test data
- Include expected behavior in test descriptions

## Support

For issues with the enhanced family banking tests:

1. Check environment variable configuration
2. Verify network connectivity to Zeus LSP and Lightning services
3. Review test logs for specific error messages
4. Ensure database permissions are properly configured
5. Check that all required dependencies are installed

The tests are designed to be robust and informative, providing clear feedback on both successes and failures to help with debugging and system validation.
