# Database-Backed Rate Limiting Documentation

## Overview

This document describes the database-backed rate limiting implementation for the Satnam.pub serverless functions. The system uses Supabase PostgreSQL to store and manage rate limit data, providing persistence and scalability across function invocations.

## Features

- **Persistent Storage**: Rate limits persist across serverless function cold starts
- **Privacy-First**: Uses hashed user identifiers to protect user privacy
- **Configurable**: Easy to adjust rate limits via environment variables
- **Atomic Operations**: Uses database stored procedures for thread-safe updates
- **Monitoring**: Comprehensive logging and statistics
- **Automatic Cleanup**: Built-in cleanup for expired records

## Database Schema

### Rate Limits Table

```sql
CREATE TABLE rate_limits (
    id BIGSERIAL PRIMARY KEY,
    hashed_user_id VARCHAR(64) NOT NULL UNIQUE,
    request_count INTEGER NOT NULL DEFAULT 0,
    reset_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Stored Procedure

The `check_and_update_rate_limit` function atomically:

1. Checks if user has exceeded rate limit
2. Updates request count if allowed
3. Resets counter if time window has expired
4. Returns detailed status information

## Environment Variables

Add these to your `.env` file or deployment environment:

```bash
# Peer Invitation Rate Limits
INVITE_RATE_LIMIT=5                    # Number of invites allowed
INVITE_RATE_WINDOW_HOURS=1             # Time window in hours

# User Registration Rate Limits
REGISTRATION_RATE_LIMIT=3              # Number of registrations allowed
REGISTRATION_RATE_WINDOW_HOURS=24      # Time window in hours

# General API Rate Limits
API_RATE_LIMIT=100                     # Number of API calls allowed
API_RATE_WINDOW_MINUTES=15             # Time window in minutes

# Database Configuration
PRIVACY_SALT=your_secure_salt_here     # Salt for hashing user identifiers
```

## Setup Instructions

### 1. Run Database Migration

Execute the migration SQL in your Supabase dashboard or via CLI:

```bash
# Apply the migration
npm run supabase:migrate

# Or manually run the SQL file
psql -h your-db-host -U your-user -d your-db -f migrations/20241201_create_rate_limiting_table.sql
```

### 2. Configure Environment Variables

Set the environment variables in your deployment platform (Netlify, Vercel, etc.) and local `.env` file.

### 3. Test the Implementation

```bash
# Test the rate limiting functionality
npm run test:api:endpoints

# Check rate limit statistics
npm run rate-limits:stats
```

## Usage Examples

### Basic Rate Limit Check

```typescript
import { checkRateLimit } from "./api/authenticated/generate-peer-invite";

const hashedUserId = generatePrivacyHash(sessionToken);
const allowed = await checkRateLimit(hashedUserId);

if (!allowed) {
  // Handle rate limit exceeded
  return res.status(429).json({
    error: "Rate limit exceeded",
  });
}
```

### Get Rate Limit Status

```typescript
import { getRateLimitStatus } from "./api/authenticated/generate-peer-invite";

const status = await getRateLimitStatus(hashedUserId);
console.log(
  `User has ${status.current_count}/${status.rate_limit} requests used`
);
```

## Maintenance

### Cleanup Expired Records

Run these commands periodically to maintain database performance:

```bash
# Show current statistics
npm run rate-limits:stats

# Clean up expired records
npm run rate-limits:cleanup

# Do both
npm run rate-limits:manage
```

### Monitoring

The system logs important events:

- Rate limit checks and results
- Database errors and recovery
- Cleanup operations and statistics

Example log entries:

```
INFO: Rate limit check completed {
  hashedUserId: "abc12345...",
  allowed: true,
  currentCount: 3,
  rateLimit: 5,
  resetTime: "2024-12-01T15:30:00Z"
}

WARN: Database error in rate limit check, allowing request
ERROR: RPC function error in rate limit check: connection timeout
```

## Error Handling

The system implements graceful error handling:

1. **Database Unavailable**: Allows requests but logs errors
2. **RPC Function Errors**: Allows requests but logs errors
3. **Timeout Errors**: Allows requests but logs errors
4. **Invalid Data**: Rejects requests with validation errors

This ensures service availability even when rate limiting fails.

## Performance Considerations

### Database Indexes

The migration creates optimized indexes:

```sql
CREATE INDEX idx_rate_limits_hashed_user_id ON rate_limits(hashed_user_id);
CREATE INDEX idx_rate_limits_reset_time ON rate_limits(reset_time);
```

### Connection Pooling

Supabase handles connection pooling automatically. For high-traffic applications, consider:

- Monitoring connection usage
- Implementing client-side connection limits
- Using read replicas for status checks

### Cleanup Strategy

- Run cleanup daily or weekly depending on traffic
- Monitor table size and performance
- Consider partitioning for very high-traffic applications

## Security Considerations

### Privacy Protection

- User identifiers are hashed with a secure salt
- No personally identifiable information is stored
- Logs use truncated hashes for debugging

### Access Control

- Row Level Security (RLS) enabled on the table
- Service role required for database operations
- Function-level security for RPC calls

### Rate Limit Bypass Prevention

- Hash-based user identification prevents simple bypassing
- Database-level constraints ensure data integrity
- Atomic operations prevent race conditions

## Troubleshooting

### Common Issues

1. **Migration Fails**

   - Check database permissions
   - Verify SQL syntax compatibility
   - Review connection settings

2. **Rate Limits Not Working**

   - Verify environment variables are set
   - Check database connection
   - Review function permissions

3. **Performance Issues**
   - Monitor database query performance
   - Check index usage
   - Consider cleanup frequency

### Debug Commands

```bash
# Test database connection
npm run supabase:test

# Check rate limit statistics
npm run rate-limits:stats

# Run API endpoint tests
npm run test:api:endpoints
```

## Migration from In-Memory

If migrating from the in-memory implementation:

1. Deploy the new code with database setup
2. Run the migration SQL
3. Set environment variables
4. Test thoroughly in staging
5. Monitor logs during rollout
6. Remove old in-memory code after verification

The new implementation is designed to be a drop-in replacement with the same API interface.
