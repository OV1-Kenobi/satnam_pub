# Phase 1: NIP-85 Detailed Task Breakdown

**Total Duration**: 2 weeks (10 working days)  
**Team Size**: 1-2 developers  
**Estimated Effort**: 80-100 hours

---

## Week 1: Foundation (Days 1-5)

### Day 1: Database Schema Design & Migration

**Task 1.1.1**: Create migration file `supabase/migrations/035_nip85_trust_provider.sql`

**Subtasks**:
- [ ] Design `trust_provider_preferences` table schema
- [ ] Design `nip85_assertions` table schema
- [ ] Design `trust_query_audit_log` table schema
- [ ] Create RLS policies for all tables
- [ ] Create indexes for performance
- [ ] Test migration idempotency
- [ ] Document schema rationale

**Acceptance Criteria**:
- ✅ Migration file is idempotent (safe to run multiple times)
- ✅ All RLS policies enforce user isolation
- ✅ Indexes created for common queries
- ✅ Migration runs successfully in test environment
- ✅ No breaking changes to existing tables

**Estimated Time**: 4 hours

---

### Day 2: NIP85PublishingService - Part 1

**Task 1.2.1**: Create `src/lib/trust/nip85-publishing.ts` skeleton

**Subtasks**:
- [ ] Define TypeScript interfaces (NIP85Assertion, etc.)
- [ ] Create class structure with constructor
- [ ] Implement rate limiting logic
- [ ] Implement metric filtering logic
- [ ] Add JSDoc comments

**Acceptance Criteria**:
- ✅ All interfaces properly typed
- ✅ Rate limiting uses Map-based in-memory store
- ✅ Metric filtering respects user preferences
- ✅ No TypeScript errors
- ✅ >80% code coverage

**Estimated Time**: 6 hours

---

### Day 3: NIP85PublishingService - Part 2

**Task 1.3.1**: Implement core publishing methods

**Subtasks**:
- [ ] Implement `publishUserAssertion()` method
- [ ] Implement `publishEventAssertion()` method
- [ ] Implement `publishAddressAssertion()` method
- [ ] Implement `publishProviderDeclaration()` method
- [ ] Integrate with CEPS for event publishing
- [ ] Add error handling and logging

**Acceptance Criteria**:
- ✅ All methods publish to wss://relay.satnam.pub
- ✅ CEPS integration working correctly
- ✅ Events include proper NIP-85 tags
- ✅ Relay hints included in all events
- ✅ Error handling for relay failures
- ✅ Unit tests passing (>80% coverage)

**Estimated Time**: 8 hours

---

### Day 4: NIP85PublishingService - Part 3

**Task 1.4.1**: Implement query and utility methods

**Subtasks**:
- [ ] Implement `fetchTrustedAssertions()` method
- [ ] Implement `getUserPreferences()` helper
- [ ] Implement `filterMetrics()` helper
- [ ] Implement `extractMetrics()` helper
- [ ] Add NIP-44 encryption support
- [ ] Add relay health monitoring

**Acceptance Criteria**:
- ✅ Assertions fetched from correct relays
- ✅ Metrics properly filtered based on preferences
- ✅ NIP-44 encryption working when enabled
- ✅ Relay health monitoring functional
- ✅ All unit tests passing

**Estimated Time**: 8 hours

---

### Day 5: Feature Flags & Environment Configuration

**Task 1.5.1**: Add feature flags to environment configuration

**Subtasks**:
- [ ] Add `VITE_TRUST_PROVIDER_ENABLED` to `env.client.ts`
- [ ] Add `VITE_TRUST_PUBLIC_API_ENABLED` to `env.client.ts`
- [ ] Add `VITE_TRUST_PROVIDER_RELAY` to `env.client.ts`
- [ ] Update `netlify.toml` with environment variables
- [ ] Add feature flag documentation
- [ ] Test feature flag gating

**Acceptance Criteria**:
- ✅ Feature flags default to false (safe defaults)
- ✅ Environment variables properly injected
- ✅ Feature flag gating working in code
- ✅ Documentation updated
- ✅ No TypeScript errors

**Estimated Time**: 4 hours

**Week 1 Total**: 30 hours

---

## Week 2: API & UI (Days 6-10)

### Day 6: Public API Endpoint - Part 1

**Task 2.1.1**: Create `netlify/functions_active/trust-query.ts`

**Subtasks**:
- [ ] Create handler function with proper types
- [ ] Implement npub/hex pubkey parsing
- [ ] Implement user lookup by npub
- [ ] Implement exposure preference checking
- [ ] Add CORS headers
- [ ] Add error handling

**Acceptance Criteria**:
- ✅ Endpoint accepts GET requests with npub parameter
- ✅ CORS headers properly set
- ✅ User lookup working correctly
- ✅ Exposure preferences enforced
- ✅ Error responses properly formatted
- ✅ No TypeScript errors

**Estimated Time**: 6 hours

---

### Day 6-7: Public API Endpoint - Part 2

**Task 2.2.1**: Complete trust-query endpoint with audit logging

**Subtasks**:
- [ ] Implement metric filtering based on preferences
- [ ] Implement audit logging
- [ ] Add rate limiting (100 requests/hour per IP)
- [ ] Add IP/UA hashing for privacy
- [ ] Implement relay hints in response
- [ ] Add comprehensive error handling
- [ ] Write integration tests

**Acceptance Criteria**:
- ✅ Metrics properly filtered
- ✅ Audit logging working
- ✅ Rate limiting enforced
- ✅ IP/UA hashed for privacy
- ✅ Response format matches spec
- ✅ Integration tests passing
- ✅ >80% code coverage

**Estimated Time**: 8 hours

---

### Day 7: Provider Config Endpoint

**Task 2.3.1**: Create `netlify/functions_active/trust-provider-config.ts`

**Subtasks**:
- [ ] Create handler function
- [ ] Return provider metadata
- [ ] Return supported metrics list
- [ ] Return relay URLs
- [ ] Add API documentation link
- [ ] Add CORS headers
- [ ] Write tests

**Acceptance Criteria**:
- ✅ Endpoint returns provider info
- ✅ Supported metrics documented
- ✅ Relay URLs included
- ✅ CORS headers set
- ✅ Tests passing

**Estimated Time**: 4 hours

---

### Day 8: User Settings UI Component

**Task 2.4.1**: Create `src/components/TrustProviderSettings.tsx`

**Subtasks**:
- [ ] Create component structure
- [ ] Implement exposure level selector
- [ ] Implement metric visibility toggles
- [ ] Implement whitelist management
- [ ] Implement encryption preference toggle
- [ ] Add load/save functionality
- [ ] Add success/error notifications
- [ ] Add accessibility features

**Acceptance Criteria**:
- ✅ All controls functional
- ✅ Load/save working correctly
- ✅ Notifications displaying properly
- ✅ Accessibility features present
- ✅ Component tests passing
- ✅ No TypeScript errors

**Estimated Time**: 8 hours

---

### Day 8-9: Settings Integration

**Task 2.5.1**: Integrate TrustProviderSettings into Settings page

**Subtasks**:
- [ ] Add "Trust Provider" section to Settings.tsx
- [ ] Add navigation link from user profile
- [ ] Add help text explaining privacy implications
- [ ] Add feature flag gating
- [ ] Test integration
- [ ] Update documentation

**Acceptance Criteria**:
- ✅ Settings section visible when feature enabled
- ✅ Navigation working correctly
- ✅ Help text clear and accurate
- ✅ Feature flag gating working
- ✅ Integration tests passing

**Estimated Time**: 4 hours

---

### Day 9: CEPS Integration & Publishing

**Task 2.6.1**: Extend CEPS with NIP-85 methods

**Subtasks**:
- [ ] Add `publishNIP85Assertion()` method to CEPS
- [ ] Add `publishProviderDeclaration()` method to CEPS
- [ ] Implement relay health monitoring
- [ ] Implement fallback relay support
- [ ] Add error handling and logging
- [ ] Write tests

**Acceptance Criteria**:
- ✅ Methods properly integrated into CEPS
- ✅ Relay health monitoring working
- ✅ Fallback relays functional
- ✅ Error handling comprehensive
- ✅ Tests passing
- ✅ No regressions in existing CEPS tests

**Estimated Time**: 6 hours

---

### Day 9-10: Background Publishing Job

**Task 2.7.1**: Implement background publishing job

**Subtasks**:
- [ ] Create scheduled job (daily at 2 AM UTC)
- [ ] Implement retry logic for failed publishes
- [ ] Add monitoring and alerting
- [ ] Add logging for all publishing events
- [ ] Test job execution
- [ ] Document job configuration

**Acceptance Criteria**:
- ✅ Job runs on schedule
- ✅ Retry logic working
- ✅ Monitoring/alerting configured
- ✅ Logging comprehensive
- ✅ Tests passing

**Estimated Time**: 6 hours

---

### Day 10: Testing & Documentation

**Task 2.8.1**: Comprehensive testing

**Subtasks**:
- [ ] Write unit tests for NIP85PublishingService
- [ ] Write integration tests for full flow
- [ ] Write security tests (no nsec exposure, etc.)
- [ ] Write API endpoint tests
- [ ] Write component tests
- [ ] Achieve >80% code coverage
- [ ] Run full test suite

**Acceptance Criteria**:
- ✅ All tests passing
- ✅ >80% code coverage
- ✅ No regressions in existing tests
- ✅ Security tests passing
- ✅ Performance acceptable

**Estimated Time**: 10 hours

---

### Day 10: Documentation

**Task 2.9.1**: Create comprehensive documentation

**Subtasks**:
- [ ] API documentation with examples
- [ ] User guide for trust provider settings
- [ ] Developer guide for third-party integration
- [ ] Security audit report
- [ ] Deployment guide
- [ ] Troubleshooting guide

**Acceptance Criteria**:
- ✅ All documentation complete
- ✅ Examples working correctly
- ✅ Security considerations documented
- ✅ Deployment steps clear

**Estimated Time**: 6 hours

**Week 2 Total**: 58 hours

---

## Summary

| Phase | Duration | Hours | Status |
|-------|----------|-------|--------|
| **Week 1: Foundation** | 5 days | 30 | Ready |
| **Week 2: API & UI** | 5 days | 58 | Ready |
| **Total** | **10 days** | **88 hours** | **Ready** |

---

## Dependencies & Prerequisites

### Required Knowledge
- ✅ TypeScript/React
- ✅ Supabase/PostgreSQL
- ✅ Netlify Functions
- ✅ Nostr protocol basics
- ✅ NIP-85 specification

### Required Access
- ✅ Supabase project
- ✅ Netlify deployment
- ✅ wss://relay.satnam.pub access
- ✅ Git repository

### Required Tools
- ✅ Node.js 18+
- ✅ npm/yarn
- ✅ TypeScript compiler
- ✅ Test runner (Vitest)

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| **Relay unavailable** | Medium | High | Fallback relays, health monitoring |
| **Privacy leakage** | Low | Critical | RLS policies, security tests, audit |
| **Performance issues** | Low | Medium | Caching, async publishing, monitoring |
| **Integration issues** | Medium | Medium | Early CEPS testing, integration tests |

---

## Success Metrics

✅ All tasks completed on time  
✅ >80% test coverage  
✅ Zero security vulnerabilities  
✅ All privacy controls enforced  
✅ API rate limiting working  
✅ Documentation complete  
✅ Zero regressions  


