# NIP-85 Trust Provider Deployment Guide

## Pre-Deployment Checklist

### Database Migration
- [ ] Run migration: `supabase/migrations/035_nip85_trust_provider.sql`
- [ ] Verify tables created:
  - `trust_provider_preferences`
  - `nip85_assertions`
  - `trust_query_audit_log`
- [ ] Verify RLS policies enabled
- [ ] Verify indexes created
- [ ] Test database connectivity

### Code Deployment
- [ ] Build passes: `npm run build`
- [ ] No TypeScript errors
- [ ] All tests passing: `npm run test:run`
- [ ] Code review completed
- [ ] Staging deployment successful

### Environment Configuration
- [ ] `.env` file updated with NIP-85 variables
- [ ] All required variables set
- [ ] Feature flags configured for deployment scenario
- [ ] Relay URLs verified and accessible
- [ ] Cache TTL tuned for expected load

---

## Step-by-Step Deployment

### 1. Database Migration (Production)

```bash
# Connect to Supabase SQL editor
# Copy and paste contents of: supabase/migrations/035_nip85_trust_provider.sql
# Execute the migration

# Verify migration success
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('trust_provider_preferences', 'nip85_assertions', 'trust_query_audit_log');
```

### 2. Environment Variables Setup

```bash
# Add to production .env file
VITE_NIP85_TRUST_PROVIDER_ENABLED=true
VITE_NIP85_PUBLISHING_ENABLED=false  # Start with read-only
VITE_NIP85_QUERY_ENABLED=true
VITE_NIP85_CACHE_ENABLED=true
VITE_NIP85_CACHE_TTL_MS=600000
VITE_NIP85_AUDIT_LOGGING_ENABLED=true
VITE_NIP85_DEFAULT_EXPOSURE_LEVEL=private
VITE_NIP85_PRIMARY_RELAY=wss://relay.satnam.pub
```

### 3. Build & Deploy

```bash
# Build application
npm run build

# Deploy to production
# (Use your deployment process: Netlify, Docker, etc.)

# Verify deployment
# Check browser console for errors
# Verify feature flags loaded correctly
```

### 4. Testing Verification

#### Functional Tests
```bash
# Run test suite
npm run test:run -- tests/trust/nip85-publishing.test.ts

# Expected: All 37 tests passing
```

#### Integration Tests
```bash
# Test query functionality
# 1. Open browser console
# 2. Navigate to user profile
# 3. Verify trust scores load without errors
# 4. Check network tab for relay queries
```

#### Audit Log Verification
```sql
-- Check audit logs are being recorded
SELECT COUNT(*) FROM trust_query_audit_log;

-- Verify recent queries
SELECT * FROM trust_query_audit_log 
ORDER BY created_at DESC 
LIMIT 10;
```

---

## Monitoring & Maintenance

### Daily Checks
- [ ] Monitor error logs for NIP-85 errors
- [ ] Check relay connectivity
- [ ] Verify cache hit rates
- [ ] Monitor database performance

### Weekly Checks
- [ ] Review audit logs for anomalies
- [ ] Check cache TTL effectiveness
- [ ] Monitor relay response times
- [ ] Verify all feature flags working

### Monthly Checks
- [ ] Analyze usage patterns
- [ ] Review performance metrics
- [ ] Update documentation if needed
- [ ] Plan feature enhancements

---

## Rollback Procedures

### If Issues Occur

#### Option 1: Disable Feature (Immediate)
```bash
# Set in .env
VITE_NIP85_TRUST_PROVIDER_ENABLED=false

# Redeploy
npm run build
# Deploy to production
```

#### Option 2: Disable Publishing Only
```bash
# Set in .env
VITE_NIP85_PUBLISHING_ENABLED=false

# Keep querying enabled for read-only access
VITE_NIP85_QUERY_ENABLED=true
```

#### Option 3: Rollback Database
```sql
-- If migration caused issues, rollback:
DROP TABLE IF EXISTS trust_query_audit_log;
DROP TABLE IF EXISTS nip85_assertions;
DROP TABLE IF EXISTS trust_provider_preferences;
```

---

## Performance Optimization

### Cache Tuning
- Monitor cache hit rates in logs
- Adjust `VITE_NIP85_CACHE_TTL_MS` based on usage patterns
- Higher TTL = better performance, slightly stale data
- Lower TTL = fresher data, more relay queries

### Relay Optimization
- Use multiple relays for redundancy
- Monitor relay response times
- Consider relay failover strategy
- Test relay connectivity regularly

### Database Optimization
- Monitor query performance
- Verify indexes are being used
- Check for slow queries in audit logs
- Consider archiving old audit logs

---

## Feature Rollout Strategy

### Phase 1: Read-Only (Week 1)
```env
VITE_NIP85_PUBLISHING_ENABLED=false
VITE_NIP85_QUERY_ENABLED=true
```
- Users can view trust scores
- No publishing capability
- Gather feedback and metrics

### Phase 2: Publishing (Week 2+)
```env
VITE_NIP85_PUBLISHING_ENABLED=true
VITE_NIP85_QUERY_ENABLED=true
```
- Enable publishing for trusted users
- Monitor for issues
- Gather usage metrics

### Phase 3: Full Rollout (Week 3+)
- Enable for all users
- Monitor performance
- Optimize based on metrics

---

## Support & Troubleshooting

### Common Issues

**Issue**: Feature not working
- Check `VITE_NIP85_TRUST_PROVIDER_ENABLED=true`
- Check specific feature flag
- Check browser console for errors

**Issue**: Slow performance
- Increase cache TTL
- Check relay connectivity
- Monitor database performance

**Issue**: Audit logs not recording
- Check `VITE_NIP85_AUDIT_LOGGING_ENABLED=true`
- Verify database permissions
- Check for database errors

### Support Contacts
- Technical: [Your support email]
- Database: [Your DBA contact]
- Relay: [Relay operator contact]

---

## Success Criteria

- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] Database migration successful
- [ ] Feature flags working correctly
- [ ] Audit logs recording
- [ ] Cache functioning
- [ ] Relay connectivity verified
- [ ] Performance acceptable
- [ ] No error logs
- [ ] User feedback positive

