# Production Setup Guide - Lightning Backend

## ⚠️ CRITICAL SAFETY NOTICE

This guide is for setting up Lightning Network integration with **REAL FUNDS**. Follow all steps carefully and test thoroughly before going live.

## Prerequisites

### 1. Lightning Infrastructure

- [ ] **Voltage Node** - Set up and fully synced
- [ ] **LNBits Instance** - Deployed and connected to your node
- [ ] **Admin API Key** - Generated with appropriate permissions
- [ ] **Backup Strategy** - Node and wallet backups configured

### 2. Database Infrastructure

- [ ] **Supabase Project** - Production instance (not development)
- [ ] **Service Role Key** - With appropriate RLS policies
- [ ] **Database Backups** - Automated backup configured
- [ ] **SSL/TLS** - Force SSL connections enabled

### 3. Security Requirements

- [ ] **Environment Variables** - Stored securely (not in code)
- [ ] **API Keys** - Rotated regularly, never logged
- [ ] **Network Security** - Firewall and VPN configured
- [ ] **Monitoring** - Error tracking and alerting set up

## Environment Variables Setup

Create a secure `.env.production` file:

```bash
# Lightning Infrastructure - PRODUCTION VALUES
VOLTAGE_NODE_ID=your_actual_voltage_node_id
VOLTAGE_API_KEY=your_actual_voltage_api_key
VOLTAGE_LNBITS_URL=https://your-actual-lnbits-instance.com
VOLTAGE_LNBITS_ADMIN_KEY=your_actual_lnbits_admin_key

# Database - PRODUCTION VALUES
SUPABASE_URL=https://your-actual-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_actual_service_role_key

# Security
NODE_ENV=production
ENABLE_CORS=false
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=900000

# Monitoring
LOG_LEVEL=info
ENABLE_METRICS=true
ALERT_WEBHOOK_URL=your_monitoring_webhook
```

## Testing Protocol

### Phase 1: Backend Unit Tests

```bash
# Run comprehensive backend tests
npm run test:backend

# Should show all tests PASSING before proceeding
```

### Phase 2: Lightning Health Check

```bash
# Basic health check
npm run health:lightning

# Detailed health check
npm run health:lightning:verbose

# Should show "healthy" status before proceeding
```

### Phase 3: Integration Testing

```bash
# Run with small test amounts first
npm run test:integration

# Test with actual API endpoints
curl -X GET https://your-api.com/health/lightning
```

### Phase 4: Load Testing

```bash
# Test concurrent operations
# Test payment queue limits
# Test error recovery
```

## Production Deployment Checklist

### Before Deployment

- [ ] All tests passing ✅
- [ ] Health checks green ✅
- [ ] Security audit complete ✅
- [ ] Backup procedures tested ✅
- [ ] Monitoring configured ✅
- [ ] Emergency procedures documented ✅

### During Deployment

- [ ] Deploy to staging first
- [ ] Run smoke tests
- [ ] Gradual rollout with monitoring
- [ ] Ready to rollback if needed

### After Deployment

- [ ] Monitor for 24 hours minimum
- [ ] Test all critical paths
- [ ] Verify payment flows
- [ ] Check error rates and response times

## Monitoring Commands

```bash
# Continuous health monitoring (run in production)
watch -n 30 'npm run health:lightning'

# Check backend status
npm run test:backend

# Validate all systems
npm run test:integration
```

## Emergency Procedures

### If Lightning Node Goes Down

1. **IMMEDIATELY** disable payment processing
2. Check node status and logs
3. Failover to backup node if available
4. Notify users of temporary service disruption
5. **DO NOT** restart payments until health checks pass

### If Payments Start Failing

1. **IMMEDIATELY** pause all payment operations
2. Check API rate limits and quotas
3. Verify wallet balances and connectivity
4. Run full backend test suite
5. Only resume after identifying and fixing root cause

### If Database Issues Occur

1. Check Supabase status page
2. Verify connection limits and performance
3. Check for any schema changes needed
4. Test with read-only operations first

## Security Best Practices

### API Keys

- Never log API keys or secrets
- Rotate keys regularly (monthly minimum)
- Use different keys for different environments
- Store in secure key management system

### Network Security

- Use HTTPS/TLS everywhere
- Implement rate limiting
- Use VPN for admin access
- Monitor for unusual activity

### Data Protection

- Encrypt sensitive data at rest
- Use parameterized queries (prevent SQL injection)
- Implement proper authentication and authorization
- Regular security audits

## Performance Monitoring

### Key Metrics to Monitor

- Lightning node uptime and sync status
- Payment success/failure rates
- API response times
- Database connection pool usage
- Error rates and types

### Alerting Thresholds

- Payment failure rate > 1%
- API response time > 2 seconds
- Node offline for > 1 minute
- Database errors > 0.1%

## Testing in Production (Safely)

### Start Small

1. Enable for single family member first
2. Use small amounts (< 1000 sats)
3. Monitor closely for 48 hours
4. Gradually increase limits

### Canary Releases

1. Deploy to subset of users
2. Monitor key metrics
3. Rollback immediately if issues
4. Full rollout only after validation

## Support and Recovery

### Documentation

- All procedures documented
- Emergency contact information available
- Rollback procedures tested
- Recovery time objectives defined

### Team Training

- All team members know emergency procedures
- Regular incident response drills
- Clear escalation procedures
- 24/7 monitoring coverage for critical periods

---

## ⚠️ FINAL WARNING

**Lightning Network transactions are IRREVERSIBLE**. Once a payment is sent, it cannot be undone. Test thoroughly, monitor constantly, and never deploy changes without comprehensive testing.

**Only proceed to production when:**

- All tests pass consistently
- Health checks are green
- Security audit is complete
- Team is trained and ready
- Monitoring and alerting is configured
- Emergency procedures are documented and tested
