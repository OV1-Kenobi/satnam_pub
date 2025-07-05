# Emergency Recovery System Documentation

## Overview

The Emergency Recovery System provides secure, guardian-consensus-based recovery mechanisms for lost private keys, eCash tokens, emergency liquidity, and account restoration. The system follows privacy-first principles and requires multi-party consensus for all recovery operations.

## Architecture

### Core Components

1. **Emergency Recovery Modal** (`src/components/EmergencyRecoveryModal.tsx`)
   - Production-ready UI for end-users
   - Multi-step recovery workflow
   - Real-time guardian approval tracking

2. **Emergency Recovery Page** (`src/components/EmergencyRecoveryPage.tsx`)
   - Dedicated page for recovery operations
   - Authentication integration
   - User context management

3. **API Endpoint** (`api/emergency-recovery.ts`)
   - Netlify Function for backend operations
   - Guardian consensus management
   - Recovery execution logic

4. **Database Schema** (`migrations/007_emergency_recovery_system.sql`)
   - Comprehensive table structure
   - Row-level security policies
   - Audit logging system

### Recovery Types

1. **Private Key Recovery (nsec_recovery)**
   - Shamir Secret Sharing reconstruction
   - New key pair generation
   - Guardian consensus required

2. **eCash Recovery (ecash_recovery)**
   - Proof reconstruction from backups
   - Token recovery and transfer
   - Multi-mint support

3. **Emergency Liquidity (emergency_liquidity)**
   - Family treasury access
   - Lightning/eCash transfer
   - Guardian approval workflow

4. **Account Restoration (account_restoration)**
   - Account access recovery
   - Authentication reset
   - Data restoration

## User Interface Integration

### Main Navigation
The Emergency Recovery system is accessible from:
- Landing page "Recovery Help" button
- Family Dashboard header
- Individual Finances Dashboard header

### Authentication Protection
All recovery operations are protected by:
- `FamilyFederationAuthWrapper` with appropriate role restrictions
- User context validation
- Guardian permission checks

### Modal Workflow
1. **Request Step**: User fills recovery request details
2. **Approval Step**: Real-time guardian consensus tracking
3. **Execution Step**: Recovery execution with guardian approval
4. **Complete Step**: Success confirmation and next steps

## API Endpoints

### Base URL
```
/.netlify/functions/emergency-recovery
```

### Authentication
All endpoints require Bearer token authentication:
```
Authorization: Bearer <auth_token>
```

### Endpoints

#### 1. Initiate Recovery
```http
POST /.netlify/functions/emergency-recovery
```

**Request Body:**
```json
{
  "action": "initiate_recovery",
  "userId": "user123",
  "userNpub": "npub1...",
  "userRole": "adult",
  "requestType": "nsec_recovery",
  "reason": "lost_key",
  "urgency": "high",
  "description": "Lost private key during device failure",
  "recoveryMethod": "guardian_consensus"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "requestId": "uuid",
    "requiredApprovals": 2,
    "guardians": 3
  }
}
```

#### 2. Get Recovery Status
```http
POST /.netlify/functions/emergency-recovery
```

**Request Body:**
```json
{
  "action": "get_status",
  "userId": "user123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "activeRequests": [{
      "id": "uuid",
      "status": "pending",
      "current_approvals": 1,
      "required_approvals": 2,
      "guardian_approvals": [...],
      "created_at": "2024-01-01T00:00:00Z",
      "expires_at": "2024-01-02T00:00:00Z"
    }]
  }
}
```

#### 3. Execute Recovery
```http
POST /.netlify/functions/emergency-recovery
```

**Request Body:**
```json
{
  "action": "execute_recovery",
  "recoveryRequestId": "uuid",
  "executorNpub": "npub1...",
  "executorRole": "guardian"
}
```

#### 4. Get Guardians
```http
POST /.netlify/functions/emergency-recovery
```

**Request Body:**
```json
{
  "action": "get_guardians",
  "familyId": "family123"
}
```

#### 5. Approve/Reject Recovery
```http
POST /.netlify/functions/emergency-recovery
```

**Request Body:**
```json
{
  "action": "approve_recovery",
  "recoveryRequestId": "uuid",
  "guardianNpub": "npub1...",
  "approval": "approved"
}
```

## Database Schema

### Tables

#### emergency_recovery_requests
Primary table for recovery requests.

```sql
CREATE TABLE emergency_recovery_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    user_npub VARCHAR(255) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    family_id VARCHAR(255),
    request_type VARCHAR(50) NOT NULL,
    reason VARCHAR(50) NOT NULL,
    urgency VARCHAR(20) NOT NULL,
    description TEXT NOT NULL,
    requested_amount BIGINT,
    recovery_method VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    required_approvals INTEGER NOT NULL DEFAULT 1,
    current_approvals INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE,
    executor_npub VARCHAR(255),
    executor_role VARCHAR(50),
    recovery_result JSONB,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

#### emergency_recovery_approvals
Guardian approval records.

```sql
CREATE TABLE emergency_recovery_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recovery_request_id UUID NOT NULL REFERENCES emergency_recovery_requests(id),
    guardian_npub VARCHAR(255) NOT NULL,
    guardian_role VARCHAR(50) NOT NULL,
    approval VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

#### emergency_recovery_logs
Audit trail for all recovery operations.

```sql
CREATE TABLE emergency_recovery_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recovery_request_id UUID REFERENCES emergency_recovery_requests(id),
    action VARCHAR(100) NOT NULL,
    actor_npub VARCHAR(255) NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    details TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

### Security Policies

#### Row-Level Security (RLS)
All tables have RLS enabled with appropriate policies:

- Users can only view their own recovery requests
- Guardians can view family recovery requests
- System operations are restricted to authenticated system users

#### Guardian Consensus
- 75% of active guardians must approve for recovery
- Requests expire after 24 hours
- All approvals are logged and auditable

## Security Considerations

### Privacy Protection
- No sensitive data stored in plain text
- All recovery data encrypted at rest
- Guardian approvals use public keys only
- Audit logs exclude sensitive information

### Access Control
- Role-based access control (RBAC)
- Guardian consensus requirements
- Time-limited recovery sessions
- IP address logging for security

### Recovery Methods

#### Shamir Secret Sharing
- Private keys split into multiple shares
- Threshold-based reconstruction
- Guardian-held shares for recovery

#### Multi-Signature
- Multi-party signature requirements
- Guardian key participation
- Time-locked recovery options

#### Password Recovery
- Secure password reset mechanisms
- Guardian verification required
- Rate limiting and cooldown periods

## Testing

### Test Script
Run the comprehensive test suite:

```bash
npm run test:emergency-recovery
```

### Test Coverage
- Database schema validation
- Guardian management
- Recovery request lifecycle
- Approval workflows
- Recovery execution
- Audit logging
- Cleanup procedures

### Manual Testing
1. Create recovery request as different user roles
2. Test guardian approval workflow
3. Verify recovery execution
4. Check audit log entries
5. Test expiration handling

## Integration Points

### Frontend Integration
- Family Dashboard: Recovery button in header
- Individual Finances: Recovery button in header
- Landing Page: Recovery Help navigation
- Authentication: Role-based access control

### Backend Integration
- Supabase: Database operations and RLS
- Netlify Functions: API endpoints
- Nostr: Guardian notifications (future)
- PhoenixD: Lightning operations (future)

### External Services
- Voltage: Lightning node operations
- LNbits: Payment processing
- Fedimint: Guardian consensus

## Monitoring and Alerts

### Audit Logging
- All recovery operations logged
- Guardian approval tracking
- System access monitoring
- Security event recording

### Health Checks
- Database connectivity
- API endpoint availability
- Guardian online status
- Recovery request expiration

### Alerts
- Failed recovery attempts
- Guardian consensus delays
- System errors
- Security violations

## Future Enhancements

### Planned Features
1. **Nostr Integration**
   - NIP-59 Gift Wrapped notifications
   - Guardian status updates
   - Recovery request broadcasting

2. **Hardware Security**
   - NFC badge integration
   - Hardware wallet support
   - Physical guardian verification

3. **Advanced Recovery**
   - Cross-protocol recovery
   - Atomic swap recovery
   - Multi-mint coordination

4. **Automation**
   - Scheduled backup verification
   - Automatic guardian rotation
   - Recovery request optimization

### Security Improvements
1. **Zero-Knowledge Proofs**
   - Privacy-preserving verification
   - Guardian identity proofs
   - Recovery method validation

2. **Advanced Encryption**
   - Post-quantum cryptography
   - Homomorphic encryption
   - Secure multi-party computation

## Support and Troubleshooting

### Common Issues
1. **Guardian Offline**: System waits for guardian availability
2. **Consensus Failure**: Request expires, user can retry
3. **Network Issues**: Automatic retry with exponential backoff
4. **Authentication Errors**: Clear error messages and guidance

### Recovery Procedures
1. **System Failure**: Database backup and restoration
2. **Guardian Loss**: Emergency guardian replacement
3. **Key Compromise**: Immediate key rotation
4. **Data Corruption**: Backup verification and repair

### Contact Information
- Technical Support: support@satnam.pub
- Security Issues: security@satnam.pub
- Documentation: docs.satnam.pub

---

*This documentation is part of the Satnam.pub sovereign family banking platform. For more information, visit https://satnam.pub* 