# Family Federation Authentication System

## Overview

The Family Federation Authentication system provides secure, Nostr-native authentication for family financial management. It combines **Nostr Wallet Connect (NWC)** and **One-Time Password (OTP)** authentication methods with a **Family Federation Whitelist** to ensure only authorized family members can access sensitive financial data.

## 🔐 Security Features

### Privacy & Encryption Integrity

- ✅ **Existing encryption protocols preserved** - All existing Argon2id + AES-256-GCM encryption remains intact
- ✅ **Secure session management** - Base64URL tokens with 64+ character length
- ✅ **No sensitive data exposure** - Tokens don't contain readable patterns (nsec, npub, passwords)
- ✅ **Input sanitization** - XSS and injection protection on all inputs
- ✅ **Error message sanitization** - No internal details exposed in error responses

### Authentication Methods

#### 1. Nostr Wallet Connect (NWC)

- **Fast & Secure**: Direct wallet-based authentication
- **Compatible**: Works with Alby, Mutiny, and other NWC-enabled wallets
- **Verification**: Validates NWC connection and extracts user identity
- **Whitelist Check**: Automatically verifies Family Federation membership

#### 2. One-Time Password (OTP)

- **Accessible**: Works with any Nostr client supporting DMs
- **Secure**: 6-digit codes with expiration and attempt limits
- **Fallback**: Alternative when NWC isn't available
- **Demo Mode**: Includes demo OTP for testing (removed in production)

## 🏠 Family Federation Whitelist

### Roles & Permissions

- **Parent**: Full access, voting power 2, can manage family finances
- **Guardian**: Administrative access, can manage whitelist entries
- **Child**: Limited access, voting power 1, view-only for most operations

### Whitelist Management

- **Add Members**: Guardians can add new family members
- **Remove Members**: Soft deletion (deactivation) for audit trail
- **Role Assignment**: Flexible role-based access control
- **Expiration**: Optional time-based access expiration

## 📡 API Endpoints

### Authentication Endpoints

#### Check Federation Whitelist

```http
POST /api/auth/federation-whitelist
Content-Type: application/json

{
  "nip05": "user@family.com"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "whitelisted": true,
    "federationRole": "parent",
    "guardianApproved": true,
    "votingPower": 2,
    "federationId": "fed_nakamoto_family_2024"
  }
}
```

#### NWC Sign In

```http
POST /api/auth/nwc-signin
Content-Type: application/json

{
  "nwcUrl": "nostr+walletconnect://pubkey@relay.com?secret=xxx&relay=wss://relay.com"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "sessionToken": "secure-session-token",
    "userAuth": {
      "npub": "npub1...",
      "nip05": "user@family.com",
      "federationRole": "parent",
      "authMethod": "nwc",
      "isWhitelisted": true
    }
  }
}
```

#### OTP Initiation

```http
POST /api/auth/otp/initiate
Content-Type: application/json

{
  "npub": "npub1..."
}
```

#### OTP Verification

```http
POST /api/auth/otp/verify
Content-Type: application/json

{
  "otpKey": "session-key",
  "otp": "123456"
}
```

#### Session Validation

```http
POST /api/auth/validate-session
Content-Type: application/json

{
  "sessionToken": "session-token"
}
```

### Whitelist Management (Guardian Only)

#### Get Whitelist

```http
GET /api/auth/federation-whitelist
```

#### Add to Whitelist

```http
POST /api/auth/federation-whitelist/add
Content-Type: application/json

{
  "nip05": "newmember@family.com",
  "familyRole": "child",
  "votingPower": 1,
  "emergencyContacts": ["parent@family.com"]
}
```

#### Remove from Whitelist

```http
DELETE /api/auth/federation-whitelist/user@family.com
```

## 🗄️ Database Schema

### Family Federation Whitelist

```sql
CREATE TABLE family_federation_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nip05_address TEXT UNIQUE NOT NULL,
  federation_id TEXT NOT NULL DEFAULT 'fed_nakamoto_family_2024',
  family_role TEXT CHECK (family_role IN ('parent', 'child', 'guardian')) NOT NULL,
  guardian_approved BOOLEAN DEFAULT false,
  voting_power INTEGER DEFAULT 1,
  emergency_contacts TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true
);
```

### Authentication Sessions

```sql
CREATE TABLE family_auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npub TEXT NOT NULL,
  nip05_address TEXT NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  auth_method TEXT CHECK (auth_method IN ('nwc', 'otp')) NOT NULL,
  federation_role TEXT,
  is_whitelisted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
  is_active BOOLEAN DEFAULT true
);
```

## 🎨 React Components

### FamilyFederationAuthProvider

Provides authentication context throughout the application:

```tsx
import { FamilyFederationAuthProvider } from "./components/auth/FamilyFederationAuth";

function App() {
  return (
    <FamilyFederationAuthProvider>
      <YourApp />
    </FamilyFederationAuthProvider>
  );
}
```

### AuthProtectedRoute

Protects routes with role-based access:

```tsx
import AuthProtectedRoute from "./components/auth/AuthProtectedRoute";

function FamilyFinancials() {
  return (
    <AuthProtectedRoute
      allowedRoles={["parent", "guardian"]}
      title="Family Treasury"
    >
      <TreasuryDashboard />
    </AuthProtectedRoute>
  );
}
```

### NWCOTPSignIn

Complete authentication modal:

```tsx
import NWCOTPSignIn from "./components/auth/NWCOTPSignIn";

function LoginPage() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div>
      <button onClick={() => setShowAuth(true)}>Sign In</button>
      <NWCOTPSignIn isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </div>
  );
}
```

## 🔧 Configuration

### Environment Variables

```env
# Supabase Configuration
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Argon2 Configuration (Optional)
ARGON2_MEMORY_COST=16  # 2^16 = 64MB (safe default)
ARGON2_TIME_COST=3     # 3 iterations
ARGON2_PARALLELISM=1   # Single thread

# API Configuration
NODE_ENV=production
PORT=3001
```

### Default Family Members

The system includes pre-configured family members:

```typescript
const defaultFamily = [
  { nip05: "satoshi@satnam.pub", role: "parent", votingPower: 2 },
  { nip05: "hal@satnam.pub", role: "parent", votingPower: 2 },
  { nip05: "alice@satnam.pub", role: "child", votingPower: 1 },
  { nip05: "bob@satnam.pub", role: "child", votingPower: 1 },
  { nip05: "nick@satnam.pub", role: "guardian", votingPower: 1 },
];
```

## 🚀 Deployment

### Database Migration

```bash
# Run the migration
npm run migrate

# Or manually execute
psql -d your_database -f migrations/011_family_federation_auth.sql
```

### Server Setup

```bash
# Install dependencies
npm install

# Start the API server
npm run server

# Or with development mode
npm run server:dev
```

### Security Verification

```bash
# Run privacy/encryption verification
npx tsx scripts/verify-auth-privacy.ts
```

## 🧪 Testing

### Manual Testing Flow

1. **NWC Authentication**:

   - Get NWC URL from compatible wallet
   - Use `/api/auth/nwc-signin` endpoint
   - Verify session creation and whitelist check

2. **OTP Authentication**:

   - Initiate OTP with `/api/auth/otp/initiate`
   - Check Nostr DMs for code (or use demo code)
   - Verify with `/api/auth/otp/verify`

3. **Session Management**:
   - Validate session with `/api/auth/validate-session`
   - Test session expiration
   - Logout with `/api/auth/logout`

### Automated Tests

```bash
# Run privacy verification
npm run test:auth-privacy

# Run full test suite
npm test
```

## 🛡️ Security Considerations

### Production Checklist

#### Core Security

- [ ] Remove demo OTP codes
- [ ] Configure proper CORS origins
- [ ] Set up rate limiting
- [ ] Enable HTTPS only
- [ ] Configure secure session storage
- [ ] Set up monitoring and logging
- [ ] Regular security audits

#### Database Security

- [ ] Enable database connection encryption (SSL/TLS)
- [ ] Configure database firewall rules
- [ ] Set up database access logging
- [ ] Implement database connection pooling with limits
- [ ] Enable database backup encryption
- [ ] Configure read-only replicas for reporting

#### Network & Infrastructure Security

- [ ] Configure CSP (Content Security Policy) headers
- [ ] Set up intrusion detection system (IDS)
- [ ] Enable DDoS protection
- [ ] Configure secure reverse proxy (nginx/Apache)
- [ ] Set up VPN access for administrative tasks
- [ ] Implement network segmentation

#### Authentication & Authorization

- [ ] Enforce strong password policies for admin accounts
- [ ] Implement multi-factor authentication for admin access
- [ ] Set up privileged access management (PAM)
- [ ] Configure session timeout policies
- [ ] Implement account lockout mechanisms
- [ ] Set up OAuth/OIDC for third-party integrations

#### Monitoring & Logging

- [ ] Implement audit logging for all auth events
- [ ] Set up real-time security monitoring
- [ ] Configure log aggregation and analysis
- [ ] Set up alerting for suspicious activities
- [ ] Implement security incident response procedures
- [ ] Configure log retention policies

#### Backup & Recovery

- [ ] Configure backup and disaster recovery
- [ ] Test backup restoration procedures
- [ ] Set up automated backup verification
- [ ] Implement point-in-time recovery
- [ ] Configure cross-region backup replication
- [ ] Document recovery time objectives (RTO)

#### Vulnerability Management

- [ ] Set up automated security scanning
- [ ] Configure dependency vulnerability scanning
- [ ] Implement container security scanning
- [ ] Set up penetration testing schedule
- [ ] Configure security patch management
- [ ] Implement security code review processes

#### Compliance & Governance

- [ ] Document security policies and procedures
- [ ] Implement data retention policies
- [ ] Set up compliance monitoring
- [ ] Configure privacy controls (GDPR/CCPA)
- [ ] Implement security training programs
- [ ] Set up third-party security assessments

#### Operational Security

- [ ] Configure secure CI/CD pipelines
- [ ] Implement secrets management system
- [ ] Set up environment isolation
- [ ] Configure secure configuration management
- [ ] Implement change management processes
- [ ] Set up security metrics and KPIs

### Rate Limiting

- **General API**: 100 requests per 15 minutes
- **Authentication**: 10 attempts per 15 minutes
- **Session validation**: No limit (cached)

### Error Handling

- No sensitive data in error messages
- Consistent error format across all endpoints
- Proper HTTP status codes
- Security headers included

## 📚 Integration Examples

### Using with Existing Components

```tsx
import { useAuth } from "./components/auth/FamilyFederationAuth";

function FamilyDashboard() {
  const { userAuth, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <div>Please sign in</div>;
  }

  return (
    <div>
      <h1>Welcome, {userAuth.nip05}</h1>
      <p>Role: {userAuth.federationRole}</p>
      <p>Voting Power: {userAuth.votingPower}</p>
    </div>
  );
}
```

### API Integration

```typescript
// Check if user is whitelisted
async function checkUserAccess(nip05: string) {
  try {
    const response = await fetch("/api/auth/federation-whitelist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nip05 }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.data?.whitelisted || false;
  } catch (error) {
    console.error("Failed to check user access:", error);
    return false;
  }
}
```

## 🔄 Migration from Existing Auth

If you have existing authentication, follow these steps:

1. **Backup existing data**
2. **Run database migration**
3. **Update API routes** to use new endpoints
4. **Replace auth components** with Family Federation components
5. **Test thoroughly** with existing users
6. **Gradual rollout** with fallback options

## 📞 Support

For issues or questions:

- Check the verification script output
- Review error logs for specific issues
- Ensure all environment variables are set
- Verify database migration completed successfully

---

**Note**: This system is designed to work alongside existing privacy and encryption protocols without modification. All existing secure storage, key management, and encryption functions remain unchanged.
