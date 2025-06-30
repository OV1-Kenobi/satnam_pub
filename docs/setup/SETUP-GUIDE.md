# Satnam Recovery Setup Guide

## Quick Start

### 1. Test Your Configuration

Before running any migrations, test that your environment variables are set up correctly:

```bash
npm run test:config
```

This will show you:

- ✅ Which environment variables are found
- ❌ Which ones are missing
- 🔧 Partial previews of your configuration (without exposing secrets)

### 2. Expected Output

**Success output:**

```
🔧 Configuration Test
========================================

📋 Direct Environment Variables:
   SUPABASE_URL: ✅ Set
   SUPABASE_SERVICE_ROLE_KEY: ✅ Set

📦 Config File Import:
   Config loaded: ✅ Success
   Supabase URL from config: ✅ Found
   Service Key from config: ✅ Found

🎯 Final Resolution (Migration Script View):
   Resolved URL: ✅ Found
   Resolved Service Key: ✅ Found

🎉 SUCCESS: All required Supabase configuration found!
   The migration script should work properly.
```

**Failure output:**

```
❌ FAILURE: Missing required Supabase configuration!

💡 Solutions:
   1. Check your .env file in the project root
   2. Verify environment variable names are correct
   3. Make sure .env file is not in .gitignore exclusions
   4. Try setting variables directly in your shell
```

### 3. Fix Missing Configuration

If the test fails, here are the steps to fix it:

#### Option A: Create/Update .env File

1. Copy the example file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Supabase credentials:

   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ0eXAiOiJKV1Q...your-service-role-key
   PRIVACY_MASTER_KEY=your-strong-random-key-32-chars-minimum
   ```

3. Test again:
   ```bash
   npm run test:config
   ```

#### Option B: Set Environment Variables Directly

**Windows (PowerShell):**

```powershell
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
npm run test:config
```

**macOS/Linux (Bash):**

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
npm run test:config
```

### 4. Run Migrations

Once your configuration test passes, run the SSS migration:

```bash
npm run migrate:sss
```

### 5. Expected Migration Output

**Success:**

```
🔐 SHAMIR SECRET SHARING (SSS) MIGRATION
==================================================

🔧 Supabase Configuration Check:
   URL: ✅ Found
   Service Key: ✅ Found

📄 Found X SQL statements to execute
⚡ Executing statement 1/X...
✅ Statement 1 executed successfully
...

📊 Migration Summary:
   ✅ Successful: X
   ❌ Failed: 0
   📝 Total: X

🎉 SSS Migration completed successfully!
```

### 6. Verify Setup

Run a health check to make sure everything is working:

```bash
npm run migrate:sss -- --health
```

## Troubleshooting

### Problem: "Missing Supabase configuration"

**Cause:** Environment variables not loaded properly

**Solutions:**

1. Run `npm run test:config` to diagnose
2. Check that `.env` file exists in project root
3. Verify variable names are spelled correctly
4. Make sure there are no extra spaces in `.env` file
5. Try setting variables directly in your shell

### Problem: "Config loaded: ❌ Failed"

**Cause:** Config file import issue

**Solution:** This is usually not a problem - the system falls back to environment variables automatically.

### Problem: Salt uniqueness check fails

**Cause:** Critical security issue - salt reuse detected

**Solution:** This should never happen. If it does:

1. Stop using the system immediately
2. Check for bugs in the encryption code
3. Regenerate all encrypted data
4. Contact security team

### Problem: Migration fails with SQL errors

**Cause:** Database permission or syntax issues

**Solutions:**

1. Verify your service role key has the correct permissions
2. Check if tables already exist: `npm run migrate:sss -- --health`
3. Review the SQL in the migration file for syntax errors
4. Check Supabase logs for detailed error messages

## Environment Variables Reference

### Required Variables

| Variable                    | Purpose                             | Example                      |
| --------------------------- | ----------------------------------- | ---------------------------- |
| `SUPABASE_URL`              | Your Supabase project URL           | `https://abc123.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (full permissions) | `eyJ0eXAiOiJKV1Q...`         |

### Optional Variables

| Variable             | Purpose               | Default            |
| -------------------- | --------------------- | ------------------ |
| `PRIVACY_MASTER_KEY` | Master encryption key | Dev key (insecure) |
| `ENABLE_SSS`         | Enable SSS features   | `true`             |
| `DEBUG_LOGGING`      | Enable debug output   | `false`            |

### Alternative Names

The system supports multiple naming conventions:

- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY`

## Security Checklist

Before going to production:

- [ ] Strong `PRIVACY_MASTER_KEY` set (32+ characters)
- [ ] Environment variables not committed to git
- [ ] Service role key kept secure
- [ ] Regular backups configured
- [ ] SSL/TLS enabled for all connections
- [ ] Monitor for unauthorized access
- [ ] Set up proper logging and alerting

## Next Steps

After successful setup:

1. **Initialize a family:** Use `/api/family/initialize-sss`
2. **Create events:** Use `/api/sss-federated/create-event`
3. **Test guardian workflow:** Get approvals and shares
4. **Set up notifications:** Configure guardian alerts
5. **Configure monitoring:** Set up health checks

---

## Need Help?

- Run diagnostic: `npm run test:config`
- Check health: `npm run migrate:sss -- --health`
- View examples: `npm run migrate:sss -- --examples`
- Review documentation: `docs/SHAMIR-SECRET-SHARING.md`
