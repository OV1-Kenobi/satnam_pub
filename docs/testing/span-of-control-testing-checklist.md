# Span of Control Enforcement - Testing Checklist

## Overview

This checklist verifies the complete span of control enforcement system including database migrations, API endpoints, UI components, and runtime services.

## Database Testing

### ✅ Heartbeat RPC creates/updates agent_operational_state records

- [ ] Test `agent_heartbeat()` RPC function successfully creates new records
- [ ] Test `agent_heartbeat()` RPC function updates existing records
- [ ] Verify all required fields are populated correctly
- [ ] Test heartbeat with various load percentages (0%, 50%, 100%)
- [ ] Test heartbeat with different task counts (0, 1, max_concurrent_tasks)
- [ ] Verify RLS policies prevent unauthorized access to operational state

### ✅ Agent health dashboard shows real-time status updates

- [ ] Test `agent_health_summary` view returns correct data
- [ ] Verify status calculation logic (available/busy/overloaded/offline)
- [ ] Test real-time updates when heartbeat data changes
- [ ] Verify dashboard updates every 10 seconds as expected
- [ ] Test display of load percentages, task counts, and budget info

### ✅ Span of control check blocks agent creation at limit

- [ ] Test `check_span_of_control()` RPC function returns correct limits
- [ ] Test agent creation is blocked when at capacity
- [ ] Verify error message includes current count and limit
- [ ] Test creation succeeds when under capacity
- [ ] Test creation succeeds when at exact capacity limit

### ✅ Span meter shows correct capacity visualization

- [ ] Test `human_oversight_load` view returns correct data
- [ ] Verify progress bar colors change based on capacity (green/yellow/orange/red)
- [ ] Test display of remaining agent slots
- [ ] Test display of active task counts
- [ ] Verify helpful suggestions appear when at capacity

### ✅ Stale agents (no heartbeat >5min) marked as offline

- [ ] Test `mark_stale_agents()` function correctly identifies stale agents
- [ ] Verify agents without heartbeat for >5 minutes are marked as offline
- [ ] Test that `accepts_new_tasks` is set to FALSE for stale agents
- [ ] Verify pause_reason is set appropriately
- [ ] Test heartbeat failure count increments correctly

### ✅ RLS policies prevent unauthorized access to operational state

- [ ] Test agents can only read their own operational state
- [ ] Test humans can read state of agents they created
- [ ] Test service role has full access
- [ ] Test authenticated users cannot access other users' data
- [ ] Test anonymous users cannot access operational state data

## API Testing

### ✅ Agent creation endpoint includes span of control check

- [ ] Test span check is called before fee processing
- [ ] Test 403 error returned when span exceeded
- [ ] Verify error response includes helpful hints
- [ ] Test creation proceeds when span check passes
- [ ] Test integration with existing fee processing flow

### ✅ Update span of control limit function works correctly

- [ ] Test `update_span_of_control_limit()` function validates limits (1-50)
- [ ] Test users can only update their own limits
- [ ] Test service role can update any user's limit
- [ ] Test validation rejects invalid limits (<1 or >50)
- [ ] Test limit changes are reflected in real-time views

## UI Testing

### ✅ AgentHealthDashboard component

- [ ] Test component renders without errors
- [ ] Test data fetching works correctly
- [ ] Test status colors and emojis display properly
- [ ] Test auto-refresh functionality (every 10 seconds)
- [ ] Test loading state display
- [ ] Test empty state when no agents exist

### ✅ SpanOfControlMeter component

- [ ] Test component renders without errors
- [ ] Test data fetching works correctly
- [ ] Test progress bar visualization with different percentages
- [ ] Test capacity warnings display correctly
- [ ] Test helpful suggestions appear when at capacity
- [ ] Test graceful handling for users with no agents

### ✅ AgentsDashboard component

- [ ] Test component combines both sub-components correctly
- [ ] Test layout and spacing work as expected
- [ ] Test integration with existing agent management features

## Runtime Testing

### ✅ AgentHeartbeatService integration

- [ ] Test heartbeat service starts successfully
- [ ] Test heartbeat data is sent correctly to Supabase
- [ ] Test periodic heartbeat (every 60 seconds)
- [ ] Test graceful shutdown on SIGTERM/SIGINT
- [ ] Test error handling for failed heartbeats
- [ ] Test concurrent heartbeat prevention

### ✅ Agent runtime initialization example

- [ ] Test example script runs without errors
- [ ] Test mock agent data generation works correctly
- [ ] Test heartbeat integration with agent data
- [ ] Test graceful shutdown procedures
- [ ] Test command-line argument handling

## Integration Testing

### ✅ End-to-end agent creation flow

- [ ] Test complete flow from dashboard to creation
- [ ] Test span of control check integration
- [ ] Test heartbeat initialization after creation
- [ ] Test dashboard updates after agent creation
- [ ] Test error handling at each step

### ✅ Multi-agent management scenario

- [ ] Test creating multiple agents under same human
- [ ] Test span of control limits enforced correctly
- [ ] Test dashboard shows correct aggregate data
- [ ] Test individual agent health displays correctly
- [ ] Test capacity warnings update in real-time

## Performance Testing

### ✅ Database performance

- [ ] Test heartbeat RPC performance under load
- [ ] Test agent health summary view query performance
- [ ] Test human oversight load view query performance
- [ ] Test RLS policy enforcement overhead

### ✅ API performance

- [ ] Test agent creation endpoint response time
- [ ] Test span of control check performance
- [ ] Test heartbeat update performance

### ✅ UI performance

- [ ] Test dashboard rendering performance
- [ ] Test real-time update performance
- [ ] Test component re-render optimization

## Security Testing

### ✅ Access control

- [ ] Test unauthorized access attempts to operational data
- [ ] Test cross-user data access prevention
- [ ] Test service role privilege escalation
- [ ] Test authentication bypass attempts

### ✅ Input validation

- [ ] Test invalid heartbeat data handling
- [ ] Test malicious agent ID injection attempts
- [ ] Test SQL injection prevention in RPC calls
- [ ] Test limit manipulation attempts

## Error Handling Testing

### ✅ Graceful failure modes

- [ ] Test database connection failures
- [ ] Test Supabase authentication failures
- [ ] Test network timeout handling
- [ ] Test partial data recovery scenarios

### ✅ User experience

- [ ] Test clear error messages for users
- [ ] Test helpful hints for resolving issues
- [ ] Test loading states during failures
- [ ] Test recovery from temporary failures

## Deployment Testing

### ✅ Migration testing

- [ ] Test migration applies cleanly to fresh database
- [ ] Test migration is idempotent (can be run multiple times)
- [ ] Test migration doesn't break existing functionality
- [ ] Test rollback procedures if needed

### ✅ Environment testing

- [ ] Test functionality in development environment
- [ ] Test functionality in staging environment
- [ ] Test functionality in production environment
- [ ] Test environment-specific configurations

## Documentation Testing

### ✅ Code documentation

- [ ] Test all functions have proper JSDoc comments
- [ ] Test examples are accurate and complete
- [ ] Test API documentation is comprehensive
- [ ] Test integration guides are clear

### ✅ User documentation

- [ ] Test user-facing messages are clear
- [ ] Test error messages are helpful
- [ ] Test tooltips and help text are accurate
- [ ] Test onboarding guidance is complete

## Completion Criteria

All tests must pass before considering the span of control enforcement system complete. Focus particularly on:

1. **Security**: All access controls working correctly
2. **Reliability**: Heartbeat system never loses data
3. **Performance**: Real-time updates responsive
4. **User Experience**: Clear feedback and helpful error messages
5. **Integration**: Seamless integration with existing systems

## Test Environment Setup

- Database: PostgreSQL (matching production schema)
- Supabase: Local development instance
- Frontend: Development build with all features enabled
- Agent Runtime: Node.js environment with heartbeat service

## Reporting

Document all test results, including:

- Pass/fail status for each test case
- Performance metrics
- Security audit findings
- User experience feedback
- Integration issues discovered
