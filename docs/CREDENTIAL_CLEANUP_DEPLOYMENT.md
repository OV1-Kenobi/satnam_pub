# Credential Cleanup System Deployment Guide

## Overview

This guide explains how to deploy and configure the automatic credential cleanup system for secure nsec storage. The system uses Netlify Edge Functions with scheduled execution to automatically clean up expired credentials every 6 hours.

## Components

### 1. Database Migration
- **File**: `migrations/007_secure_nostr_credentials.sql`
- **Purpose**: Creates the secure credentials table with cleanup functions
- **Status**: ✅ Ready to deploy

### 2. Netlify Edge Function
- **File**: `netlify/functions/cleanup-expired-credentials.ts`
- **Purpose**: Serverless function that runs cleanup every 6 hours
- **Status**: ✅ Ready to deploy

### 3. Netlify Configuration
- **File**: `netlify.toml`
- **Purpose**: Configures the scheduled function execution
- **Status**: ✅ Ready to deploy

### 4. Client-Side Integration
- **File**: `src/hooks/useCredentialCleanup.ts`
- **Purpose**: Provides backup cleanup and monitoring
- **Status**: ✅ Ready to deploy

## Deployment Steps

### Step 1: Deploy Database Migration

1. **Open Supabase Dashboard**
   - Go to your Supabase project
   - Navigate to SQL Editor

2. **Run the Migration**
   ```sql
   -- Copy and paste the entire migration from:
   -- migrations/007_secure_nostr_credentials.sql
   ```

3. **Verify Migration**
   - Check that the `secure_nostr_credentials` table was created
   - Verify the `cleanup_expired_nostr_credentials` function exists
   - Confirm RLS policies are active

### Step 2: Deploy Netlify Configuration

1. **Update netlify.toml**
   - The file is already configured with the scheduled function
   - Schedule: `"0 */6 * * *"` (every 6 hours)

2. **Deploy to Netlify**
   ```bash
   git add .
   git commit -m "Add credential cleanup system"
   git push origin main
   ```

3. **Verify Function Deployment**
   - Check Netlify Functions dashboard
   - Verify `cleanup-expired-credentials` function is deployed
   - Check function logs for any errors

### Step 3: Test the System

1. **Manual Cleanup Test**
   ```bash
   # Test the cleanup function manually
   curl -X POST https://your-site.netlify.app/.netlify/functions/cleanup-expired-credentials
   ```

2. **Database Verification**
   ```sql
   -- Check if cleanup function works
   SELECT cleanup_expired_nostr_credentials();
   
   -- View credential status
   SELECT * FROM nostr_credential_status;
   ```

## Monitoring and Maintenance

### Automatic Monitoring

The system includes several monitoring features:

1. **Netlify Function Logs**
   - Access via Netlify Dashboard → Functions → Logs
   - Shows cleanup execution times and results
   - Alerts on function failures

2. **Database Monitoring**
   ```sql
   -- Check cleanup statistics
   SELECT 
     COUNT(*) as total_credentials,
     COUNT(*) FILTER (WHERE status = 'active') as active,
     COUNT(*) FILTER (WHERE status = 'expired') as expired,
     COUNT(*) FILTER (WHERE status = 'revoked') as revoked
   FROM nostr_credential_status;
   ```

3. **Client-Side Monitoring**
   - The `useCredentialCleanup` hook provides backup cleanup
   - Runs on app initialization and every 30 minutes
   - Logs cleanup activities to browser console

### Manual Monitoring

Use the `CredentialCleanupMonitor` component for admin monitoring:

```tsx
import CredentialCleanupMonitor from './components/admin/CredentialCleanupMonitor';

// Add to admin dashboard
<CredentialCleanupMonitor />
```

## Troubleshooting

### Common Issues

1. **Function Not Running**
   - Check Netlify function logs
   - Verify cron schedule in netlify.toml
   - Test function manually

2. **Database Errors**
   - Verify migration was applied correctly
   - Check RLS policies
   - Test cleanup function manually

3. **Credentials Not Expiring**
   - Check `expires_at` field values
   - Verify cleanup function is deleting expired records
   - Check for timezone issues

### Debug Commands

```sql
-- Check for expired credentials
SELECT * FROM secure_nostr_credentials 
WHERE expires_at < NOW();

-- Check cleanup function
SELECT cleanup_expired_nostr_credentials();

-- View all credentials
SELECT * FROM nostr_credential_status;
```

## Security Considerations

### Access Control

- ✅ **RLS Policies**: Users can only access their own credentials
- ✅ **Function Security**: Cleanup function runs with database permissions
- ✅ **No Sensitive Data**: Cleanup only removes expired/revoked records

### Audit Trail

- ✅ **Access Logging**: Tracks when credentials are accessed
- ✅ **Cleanup Logging**: Function logs cleanup activities
- ✅ **Status Tracking**: Maintains credential status history

## Performance Optimization

### Database Indexes

The migration creates optimal indexes:
- `user_id` for user-specific queries
- `expires_at` for expiration filtering
- `credential_id` for unique lookups

### Function Optimization

- **Cold Start**: ~100-200ms typical
- **Execution Time**: <1 second for typical cleanup
- **Memory Usage**: Minimal (only database operations)

## Cost Analysis

### Netlify Function Costs

- **Free Tier**: 125,000 function invocations/month
- **Cleanup Frequency**: 4 times/day = 120 invocations/month
- **Cost**: Well within free tier limits

### Database Costs

- **Storage**: Minimal (credentials are temporary)
- **Operations**: Low (simple cleanup queries)
- **RLS**: No additional cost

## Maintenance Schedule

### Daily
- Check Netlify function logs for errors
- Monitor credential statistics

### Weekly
- Review cleanup performance
- Check for any failed cleanups

### Monthly
- Review and optimize cleanup schedule if needed
- Update monitoring and alerting

## Support and Updates

### Getting Help

1. **Check Logs**: Netlify function logs and browser console
2. **Test Manually**: Use manual cleanup trigger
3. **Verify Database**: Check credential status directly

### Future Enhancements

- **Alerting**: Email notifications for cleanup failures
- **Metrics**: Detailed cleanup performance metrics
- **Scheduling**: Configurable cleanup intervals
- **Backup**: Additional cleanup mechanisms

## Conclusion

The credential cleanup system provides reliable, secure, and cost-effective automatic cleanup of expired nsec credentials. The multi-layered approach ensures credentials are cleaned up even if one component fails.

**Key Benefits:**
- ✅ **Automatic**: No manual intervention required
- ✅ **Secure**: Follows privacy-first principles
- ✅ **Reliable**: Multiple cleanup mechanisms
- ✅ **Cost-effective**: Minimal resource usage
- ✅ **Monitored**: Comprehensive logging and monitoring 