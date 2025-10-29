# Phase 0 Task 0.1: Database Migration Deployment Guide

**Status:** ✅ READY TO DEPLOY  
**File:** `database/migrations/042_rate_limiting_infrastructure.sql`  
**Duration:** 5-10 minutes

---

## 🎯 **OBJECTIVE**

Deploy rate limiting infrastructure to Supabase database to support the enhanced-rate-limiter.ts utility used by all 15 hardened CRITICAL functions.

---

## 📋 **DEPLOYMENT STEPS**

### **Step 1: Open Supabase SQL Editor** (1 minute)

1. Navigate to https://supabase.com/dashboard
2. Select your Satnam.pub project
3. Click "SQL Editor" in the left sidebar
4. Click "New Query" button

---

### **Step 2: Copy Migration SQL** (1 minute)

1. Open `database/migrations/042_rate_limiting_infrastructure.sql` in your code editor
2. Select all content (Ctrl+A / Cmd+A)
3. Copy to clipboard (Ctrl+C / Cmd+C)

---

### **Step 3: Execute Migration** (1 minute)

1. Paste SQL into Supabase SQL editor (Ctrl+V / Cmd+V)
2. Click "Run" button (or press Ctrl+Enter / Cmd+Enter)
3. Wait for execution to complete (should take 2-5 seconds)
4. Verify "Success. No rows returned" message appears

---

### **Step 4: Verify Tables Created** (2 minutes)

Run this query in SQL editor:

```sql
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name IN ('rate_limits', 'rate_limit_events')
ORDER BY table_name;
```

**Expected Result:**
```
table_name          | table_type
--------------------|------------
rate_limit_events   | BASE TABLE
rate_limits         | BASE TABLE
```

✅ **Success:** 2 rows returned

---

### **Step 5: Verify Indexes Created** (2 minutes)

Run this query in SQL editor:

```sql
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public'
  AND tablename IN ('rate_limits', 'rate_limit_events')
ORDER BY tablename, indexname;
```

**Expected Result:**
```
indexname                           | tablename
------------------------------------|-------------------
idx_rate_limits_cleanup             | rate_limits
idx_rate_limits_lookup              | rate_limits
rate_limits_pkey                    | rate_limits
idx_rate_limit_events_endpoint      | rate_limit_events
idx_rate_limit_events_recent        | rate_limit_events
idx_rate_limit_events_type          | rate_limit_events
rate_limit_events_pkey              | rate_limit_events
```

✅ **Success:** 7 rows returned (4 custom indexes + 3 primary key indexes)

---

### **Step 6: Verify Functions Created** (2 minutes)

Run this query in SQL editor:

```sql
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public'
  AND routine_name IN ('cleanup_expired_rate_limits', 'log_rate_limit_event', 'get_rate_limit_stats')
ORDER BY routine_name;
```

**Expected Result:**
```
routine_name                  | routine_type
------------------------------|-------------
cleanup_expired_rate_limits   | FUNCTION
get_rate_limit_stats          | FUNCTION
log_rate_limit_event          | FUNCTION
```

✅ **Success:** 3 rows returned

---

### **Step 7: Test Cleanup Function** (1 minute)

Run this query in SQL editor:

```sql
SELECT cleanup_expired_rate_limits();
```

**Expected Result:**
```
deleted_count
-------------
0
```

✅ **Success:** Returns 0 (no expired records yet, which is expected)

---

### **Step 8: Test Logging Function** (1 minute)

Run this query in SQL editor:

```sql
SELECT log_rate_limit_event(
    'test:127.0.0.1', 
    'test-endpoint', 
    'hit', 
    '127.0.0.1'::INET, 
    NULL, 
    'Test event from deployment verification'
);
```

**Expected Result:**
```
log_rate_limit_event
------------------------------------
a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

✅ **Success:** Returns a UUID (event ID)

---

### **Step 9: Test Stats Function** (1 minute)

Run this query in SQL editor:

```sql
SELECT * FROM get_rate_limit_stats(24);
```

**Expected Result:**
```
endpoint       | total_hits | total_bypasses | unique_clients | last_event
---------------|------------|----------------|----------------|-------------------------
test-endpoint  | 1          | 0              | 1              | 2025-10-29 12:34:56+00
```

✅ **Success:** Returns 1 row with the test event we just created

---

### **Step 10: Verify RLS Policies** (1 minute)

Run this query in SQL editor:

```sql
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('rate_limits', 'rate_limit_events')
ORDER BY tablename, policyname;
```

**Expected Result:**
```
tablename          | policyname                              | permissive | roles          | cmd
-------------------|-----------------------------------------|------------|----------------|-----
rate_limit_events  | rate_limit_events_service_full_access   | PERMISSIVE | {service_role} | ALL
rate_limits        | rate_limits_service_full_access         | PERMISSIVE | {service_role} | ALL
```

✅ **Success:** 2 rows returned (RLS policies for service role)

---

## ✅ **DEPLOYMENT VERIFICATION CHECKLIST**

- [ ] Migration executed without errors
- [ ] 2 tables created (rate_limits, rate_limit_events)
- [ ] 7 indexes created (4 custom + 3 primary keys)
- [ ] 3 functions created (cleanup, log_event, get_stats)
- [ ] Cleanup function returns 0
- [ ] Logging function returns UUID
- [ ] Stats function returns test event
- [ ] RLS policies created for service role

**When all checkboxes are checked:**
✅ **Phase 0 Task 0.1 is COMPLETE**

---

## 🧹 **CLEANUP TEST DATA** (Optional)

After verification, you can clean up the test event:

```sql
DELETE FROM public.rate_limit_events 
WHERE endpoint = 'test-endpoint';
```

---

## 🚨 **TROUBLESHOOTING**

### **Error: "relation already exists"**

**Cause:** Migration was already executed previously.

**Solution:** This is safe to ignore. The migration uses `IF NOT EXISTS` clauses, so it won't create duplicates.

---

### **Error: "permission denied"**

**Cause:** Insufficient database permissions.

**Solution:** Ensure you're logged in as the database owner or have superuser privileges. Contact your Supabase admin if needed.

---

### **Error: "function already exists"**

**Cause:** Functions were created in a previous migration attempt.

**Solution:** This is safe. The migration uses `CREATE OR REPLACE FUNCTION`, so it will update existing functions.

---

## 📚 **NEXT STEPS**

After successful deployment:

1. ✅ Mark Phase 0 Task 0.1 as COMPLETE
2. 🚀 Proceed to harden 11 HIGH-priority functions
3. 📊 Monitor rate_limit_events table for security insights

---

## 🔄 **ROLLBACK PROCEDURE** (If Needed)

If you need to rollback this migration, execute the rollback SQL at the end of `042_rate_limiting_infrastructure.sql`:

```sql
DROP POLICY IF EXISTS rate_limit_events_service_full_access ON public.rate_limit_events;
DROP POLICY IF EXISTS rate_limits_service_full_access ON public.rate_limits;
DROP FUNCTION IF EXISTS get_rate_limit_stats(INTEGER);
DROP FUNCTION IF EXISTS log_rate_limit_event(VARCHAR, VARCHAR, VARCHAR, INET, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS cleanup_expired_rate_limits();
DROP INDEX IF EXISTS idx_rate_limit_events_type;
DROP INDEX IF EXISTS idx_rate_limit_events_endpoint;
DROP INDEX IF EXISTS idx_rate_limit_events_recent;
DROP INDEX IF EXISTS idx_rate_limits_cleanup;
DROP INDEX IF EXISTS idx_rate_limits_lookup;
DROP TABLE IF EXISTS public.rate_limit_events;
DROP TABLE IF EXISTS public.rate_limits;
```

---

**Ready to deploy? Follow the steps above and check off each verification step.**

