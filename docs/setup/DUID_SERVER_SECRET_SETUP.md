# 🔐 DUID Server Secret Configuration

## Overview
The DUID Server Secret is a critical security component for Phase 2 of the secure DUID architecture. This secret enables server-side HMAC indexing that prevents enumeration attacks while maintaining O(1) lookup performance.

## Security Requirements

### **Secret Generation**
```bash
# Generate a cryptographically secure 64-character secret
openssl rand -hex 32

# Alternative using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Alternative using Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### **Environment Variable Setup**

#### **Local Development (.env)**
```bash
# Add to your .env file (never commit this file)
DUID_SERVER_SECRET=your_64_character_hex_secret_here
```

#### **Netlify Production**
1. Go to Netlify Dashboard → Site Settings → Environment Variables
2. Add new variable:
   - **Key**: `DUID_SERVER_SECRET`
   - **Value**: Your 64-character hex secret
   - **Scopes**: Functions (required for Netlify Functions access)

#### **Supabase Edge Functions (if used)**
1. Go to Supabase Dashboard → Settings → Edge Functions
2. Add environment variable:
   - **Name**: `DUID_SERVER_SECRET`
   - **Value**: Your 64-character hex secret

## Security Validation

### **Automatic Validation**
The DUID system automatically validates the server secret on initialization:

```javascript
// Validates secret exists and meets security requirements
function getServerSecret() {
  const secret = process.env.DUID_SERVER_SECRET;
  
  if (!secret) {
    throw new Error('DUID_SERVER_SECRET environment variable is required');
  }
  
  if (secret.length < 32) {
    throw new Error('DUID_SERVER_SECRET must be at least 32 characters');
  }
  
  return secret;
}
```

### **Manual Testing**
Test your configuration:

```bash
# Test in Netlify Functions environment
curl -X POST https://your-site.netlify.app/.netlify/functions/register-identity \
  -H "Content-Type: application/json" \
  -d '{"test": "duid_secret_validation"}'

# Check logs for initialization success:
# "✅ DUID security system initialized successfully"
```

## Security Best Practices

### **Secret Management**
- ✅ **Generate unique secrets** for each environment (dev, staging, prod)
- ✅ **Use cryptographically secure random generation**
- ✅ **Never commit secrets to version control**
- ✅ **Rotate secrets periodically** (quarterly recommended)
- ✅ **Use environment-specific secrets** (different for dev/prod)

### **Access Control**
- ✅ **Limit access** to environment variable configuration
- ✅ **Audit secret access** through platform logs
- ✅ **Use least-privilege principles** for team access
- ✅ **Monitor for unauthorized access attempts**

### **Backup and Recovery**
- ✅ **Securely backup secrets** in encrypted password manager
- ✅ **Document recovery procedures** for secret rotation
- ✅ **Test secret rotation** in staging environment first
- ✅ **Have rollback plan** for failed rotations

## Architecture Impact

### **DUID Generation Flow**
```
Client Side:
npub → SHA-256("DUIDv1" + npub) → duid_public

Server Side:
duid_public → HMAC-SHA-256(server_secret, duid_public) → duid_index

Database:
duid_index used as primary key for all operations
```

### **Security Benefits**
- 🛡️ **Prevents enumeration attacks** - attackers can't predict database keys
- 🔒 **Server-side secret control** - no client-side cryptographic exposure
- ⚡ **Maintains O(1) performance** - direct database key lookup
- 🔄 **Enables secret rotation** - can update indexing without data migration

## Troubleshooting

### **Common Issues**

#### **"DUID_SERVER_SECRET environment variable is required"**
- **Cause**: Environment variable not set
- **Solution**: Add `DUID_SERVER_SECRET` to your environment configuration

#### **"DUID_SERVER_SECRET must be at least 32 characters"**
- **Cause**: Secret too short for security requirements
- **Solution**: Generate a new 64-character hex secret

#### **"DUID security system initialization failed"**
- **Cause**: Secret validation failed during module load
- **Solution**: Check secret format and environment variable configuration

### **Validation Commands**
```bash
# Check secret length
echo $DUID_SERVER_SECRET | wc -c

# Validate hex format
echo $DUID_SERVER_SECRET | grep -E '^[a-f0-9]{64}$'

# Test in Node.js environment
node -e "console.log('Secret length:', process.env.DUID_SERVER_SECRET?.length || 0)"
```

## Migration Considerations

### **Existing Users**
- ✅ **No user migration required** - this is greenfield implementation
- ✅ **No backward compatibility needed** - caught before deployment
- ✅ **Clean implementation** from the start

### **Future Secret Rotation**
When rotating secrets in the future:
1. Generate new secret
2. Update environment variables
3. Restart all functions/services
4. Verify new DUID generation works
5. Monitor for any authentication issues

## Monitoring and Auditing

### **Security Audit Logs**
The system automatically logs security events:
```javascript
auditDUIDOperation('REGISTRATION_DUID_GENERATION', {
  npubPrefix: npub.substring(0, 10) + '...',
  indexPrefix: duid_index.substring(0, 10) + '...',
  username: userData.username
});
```

### **Key Metrics to Monitor**
- DUID generation success rate
- Authentication lookup performance
- Secret validation failures
- Unauthorized access attempts

## Support

### **Security Questions**
For security-related questions about DUID implementation:
1. Check this documentation first
2. Review security audit logs
3. Test in staging environment
4. Contact security team if needed

### **Emergency Procedures**
If secret compromise is suspected:
1. Immediately rotate the secret
2. Review access logs
3. Monitor for unusual authentication patterns
4. Document incident for security review

---

**⚠️ CRITICAL**: The DUID_SERVER_SECRET is essential for secure authentication. Never expose this secret to client-side code or commit it to version control.
