# Phase 1: NIP-85 Quick Reference Guide

**Timeline**: 2 weeks | **Effort**: 88 hours | **Status**: READY

---

## 📋 At-a-Glance Summary

### What We're Building
Satnam.pub becomes a NIP-85 Trust Provider that:
- Publishes user trust scores to Nostr network
- Lets users control who sees their scores
- Provides public API for external clients
- Maintains zero-knowledge architecture

### Key Numbers
- **3 new database tables**
- **2 new API endpoints** (public)
- **2 new API endpoints** (authenticated)
- **1 new React component**
- **1 new service class** (NIP85PublishingService)
- **>80% test coverage required**

### Timeline
- **Week 1**: Database + Services (30 hours)
- **Week 2**: API + UI + Testing (58 hours)
- **Total**: 10 working days

---

## 🗄️ Database Tables (3 new)

### 1. trust_provider_preferences
```sql
user_id (FK)
exposure_level (enum: public/contacts/whitelist/private)
visible_metrics (JSONB array)
whitelisted_pubkeys (TEXT array)
encryption_enabled (boolean)
```

### 2. nip85_assertions
```sql
user_id (FK)
assertion_kind (30382/30383/30384)
subject_pubkey (TEXT)
metrics (JSONB)
event_id (TEXT, unique)
relay_urls (TEXT array)
```

### 3. trust_query_audit_log
```sql
queried_user_id (FK)
querier_pubkey (TEXT)
ip_hash (TEXT)
user_agent_hash (TEXT)
success (boolean)
metrics_returned (JSONB)
```

---

## 🔌 API Endpoints (4 total)

### Public (No Auth)
```
GET  /api/trust/query              - Query public trust scores
GET  /api/trust/provider-config    - Get provider info
```

### Authenticated (JWT)
```
GET  /api/trust/preferences        - Get user preferences
POST /api/trust/preferences        - Update preferences
POST /api/trust/publish            - Manually publish scores
```

---

## 📊 Metrics (7 types)

| Metric | Range | Description |
|--------|-------|-------------|
| rank | 0-100 | Composite trust rank |
| followers | 0-∞ | Number of followers |
| hops | 0-∞ | Network distance |
| influence | 0-100 | PageRank-style score |
| reliability | 0-100 | Action-based score |
| recency | 0-100 | Activity recency |
| composite | 0-100 | Weighted average |

---

## 🔐 Privacy Levels

| Level | Who Can See | Use Case |
|-------|------------|----------|
| **private** | Nobody | Default, opt-in required |
| **contacts** | Contact list only | Trusted circle |
| **whitelist** | Specific npubs | Selective sharing |
| **public** | Anyone | Full transparency |

---

## 📁 Files to Create/Modify

### New Files (7)
```
supabase/migrations/035_nip85_trust_provider.sql
src/lib/trust/nip85-publishing.ts
netlify/functions_active/trust-query.ts
netlify/functions_active/trust-provider-config.ts
src/components/TrustProviderSettings.tsx
tests/trust/nip85-publishing.test.ts
tests/integration/trust-provider-flow.test.ts
```

### Modified Files (3)
```
src/config/env.client.ts                    (add feature flags)
lib/central_event_publishing_service.ts     (add NIP-85 methods)
src/pages/Settings.tsx                      (add settings section)
```

---

## 🎯 Daily Breakdown

### Day 1: Database
- Create migration file
- Define 3 table schemas
- Add RLS policies
- Create indexes

### Day 2-3: NIP85PublishingService
- Create service class
- Implement publishing methods
- Add metric filtering
- Add encryption support

### Day 4: Utilities & Config
- Add helper methods
- Implement rate limiting
- Add feature flags
- Update environment config

### Day 5: CEPS Integration
- Extend CEPS with NIP-85 methods
- Add relay health monitoring
- Implement fallback relays

### Day 6-7: API Endpoints
- Create trust-query endpoint
- Create provider-config endpoint
- Add rate limiting
- Add audit logging

### Day 8: UI Component
- Create TrustProviderSettings component
- Implement all controls
- Add load/save functionality

### Day 9: Integration
- Integrate into Settings page
- Add navigation links
- Extend CEPS methods
- Implement background job

### Day 10: Testing & Docs
- Write comprehensive tests
- Create API documentation
- Create user guide
- Security audit

---

## 🔒 Security Checklist

- [ ] No nsec exposure in assertions
- [ ] RLS policies enforce isolation
- [ ] Rate limiting on all endpoints
- [ ] IP/UA hashing for privacy
- [ ] Signature verification for events
- [ ] Audit logging for all queries
- [ ] NIP-44 encryption when enabled
- [ ] No PII in logs

---

## 📊 Rate Limits

| Operation | Limit | Window |
|-----------|-------|--------|
| Query API | 100 | 1 hour per IP |
| Update preferences | 10 | 1 hour per user |
| Publish manually | 10 | 1 hour per user |
| Publish assertion | 100 | 1 hour per user |

---

## ✅ Success Criteria

- [ ] >80% test coverage
- [ ] All tests passing
- [ ] Zero security vulnerabilities
- [ ] API response time <500ms
- [ ] Privacy controls enforced
- [ ] Rate limiting working
- [ ] Documentation complete
- [ ] Zero regressions

---

## 🚀 Deployment Steps

1. **Prepare**
   - Create feature branch
   - Set up development environment
   - Review CEPS integration points

2. **Implement**
   - Follow daily breakdown
   - Commit changes daily
   - Run tests after each task

3. **Test**
   - Unit tests (>80% coverage)
   - Integration tests
   - Security tests
   - Performance tests

4. **Review**
   - Code review
   - Security audit
   - Documentation review

5. **Deploy**
   - Staged rollout
   - Monitor metrics
   - Gather feedback

---

## 🔗 Key Integration Points

### CEPS Integration
```typescript
// Publish NIP-85 event
await CEPS.publishEvent({
  kind: 30382,
  tags: [...],
  content: ""
});

// Fetch assertions
const events = await CEPS.list([...], relays);
```

### Database Integration
```typescript
// Get user preferences
const prefs = await supabase
  .from("trust_provider_preferences")
  .select("*")
  .eq("user_id", userId);

// Store assertion
await supabase
  .from("nip85_assertions")
  .upsert({...});
```

### Feature Flag Integration
```typescript
if (clientConfig.flags.trustProviderEnabled) {
  // Show trust provider UI
}
```

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| PHASE1_NIP85_TRUST_PROVIDER_IMPLEMENTATION_PLAN.md | High-level roadmap |
| PHASE1_NIP85_TECHNICAL_SPECIFICATIONS.md | Implementation details |
| PHASE1_NIP85_DETAILED_TASK_BREAKDOWN.md | Task-by-task guide |
| PHASE1_NIP85_API_SPECIFICATIONS.md | API reference |
| PHASE1_NIP85_IMPLEMENTATION_SUMMARY.md | Executive summary |
| PHASE1_NIP85_QUICK_REFERENCE.md | This file |

---

## 🆘 Common Issues & Solutions

### Issue: Relay unavailable
**Solution**: Implement fallback relays, health monitoring

### Issue: Privacy leakage
**Solution**: RLS policies, audit logging, security tests

### Issue: Performance degradation
**Solution**: Caching, async publishing, monitoring

### Issue: API abuse
**Solution**: Rate limiting, IP blocking, monitoring

---

## 📞 Quick Links

- **Nostr Protocol**: https://github.com/nostr-protocol/nips
- **NIP-85 Spec**: https://github.com/vitorpamplona/nips/blob/user-summaries/85.md
- **Satnam.pub Repo**: https://github.com/OV1-Kenobi/satnam_pub
- **CEPS Documentation**: See lib/central_event_publishing_service.ts

---

## 🎯 Key Decisions

1. **Primary Relay**: wss://relay.satnam.pub
2. **Default Privacy**: Private (opt-in model)
3. **Encryption**: NIP-44 (XChaCha20-Poly1305)
4. **Rate Limiting**: 100 requests/hour per IP
5. **Test Coverage**: >80% required
6. **Feature Flags**: Disabled by default

---

## 📈 Metrics to Track

- API response time
- Query volume
- Error rates
- User adoption
- Privacy preference distribution
- Relay uptime
- Test coverage
- Security incidents

---

## 🎉 Phase 1 Completion Criteria

✅ All 10 tasks completed  
✅ >80% test coverage  
✅ Zero security vulnerabilities  
✅ All privacy controls enforced  
✅ API rate limiting working  
✅ Documentation complete  
✅ Zero regressions  
✅ Ready for Phase 2  

---

**Quick Start**: Begin with Day 1 database migration, then follow daily breakdown.

**Questions?** See detailed documentation files or contact team lead.


