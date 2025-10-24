# Public Profile URL Feature - Quick Reference Guide

**Status:** Proposal Ready for Approval  
**Effort:** 7-11 days total (3 phases)  
**Priority:** HIGH

---

## One-Page Summary

### The Problem
Satnam.pub users cannot share their profile with others. There's no public profile URL feature, limiting social discovery and peer-to-peer networking.

### The Solution
Implement shareable profile URLs with privacy-first controls:
- `https://satnam.pub/profile/alice` - Public profile by username
- `https://satnam.pub/profile/npub1a1fc5...` - Public profile by npub
- Privacy controls: public, contacts-only, or private
- Zero-knowledge architecture (no nsec exposure)

### Why It Matters
1. **Social Discovery** - Users can find and connect with each other
2. **Competitive Feature** - Nosta.me has this; Satnam.pub doesn't
3. **Lightning Integration** - Direct payment from profile
4. **Privacy-First** - Better controls than competitors
5. **Master Context** - Role-based customization

---

## Implementation Roadmap

### Phase 1: Core URLs (Days 1-2)
**Deliverables:**
- [ ] `PublicProfilePage.tsx` component
- [ ] `/profile/{username}` route
- [ ] Profile visibility toggle in Settings
- [ ] RLS policies for access control
- [ ] Profile API endpoints
- [ ] Unit tests

**Database:**
```sql
ALTER TABLE user_identities ADD COLUMN (
  profile_visibility VARCHAR(20) DEFAULT 'private',
  profile_banner_url TEXT,
  profile_theme JSONB DEFAULT '{}',
  social_links JSONB DEFAULT '{}',
  is_discoverable BOOLEAN DEFAULT false
);
```

**API Endpoints:**
- `GET /api/profile/{username}`
- `GET /api/profile/npub/{npub}`
- `PATCH /api/profile/visibility`

### Phase 2: Discovery (Days 3-4)
**Deliverables:**
- [ ] Profile search endpoint
- [ ] Search UI component
- [ ] Privacy filters
- [ ] Rate limiting
- [ ] Integration tests

**API Endpoints:**
- `GET /api/search/profiles?q={query}`

### Phase 3: Customization (Day 5)
**Deliverables:**
- [ ] Banner image support
- [ ] Profile theme customization
- [ ] Social links support
- [ ] Verification badges
- [ ] Optional analytics
- [ ] E2E tests

---

## Privacy & Security Checklist

- ✅ Never expose nsec or encrypted credentials
- ✅ Default profile visibility: PRIVATE
- ✅ User controls profile discoverability
- ✅ RLS policies enforce access control
- ✅ Hash viewer identity for analytics
- ✅ Rate limit search to prevent enumeration
- ✅ Support Master Context roles
- ✅ Integrate with existing NIP-05 verification
- ✅ Support Lightning address display
- ✅ Optional profile analytics (user can disable)

---

## Feature Comparison

| Feature | Nosta.me | Satnam.pub (Current) | Satnam.pub (Proposed) |
|---------|----------|----------------------|----------------------|
| Shareable URLs | ✅ | ❌ | ✅ |
| Public Profiles | ✅ | ❌ | ✅ |
| Privacy Controls | ❌ | ✅ | ✅ |
| Profile Search | ✅ | ❌ | ✅ |
| Messaging | ❌ | ✅ | ✅ |
| Lightning Integration | ❌ | ✅ | ✅ |
| Family Banking | ❌ | ✅ | ✅ |
| Master Context | ❌ | ✅ | ✅ |
| Zero-Knowledge | ❌ | ✅ | ✅ |

---

## Success Criteria

- ✅ Users can share profile URLs
- ✅ Public profiles display correctly
- ✅ Privacy settings are respected
- ✅ No nsec/encrypted data exposed
- ✅ Search works with privacy filters
- ✅ All tests pass (unit, integration, E2E)
- ✅ Performance: <200ms profile load time
- ✅ Mobile responsive design
- ✅ Accessibility: WCAG 2.1 AA compliant

---

## Approval Checklist

**AWAITING USER APPROVAL:**

- [ ] Approve overall approach
- [ ] Confirm URL scheme preference
- [ ] Approve database schema changes
- [ ] Confirm privacy settings defaults
- [ ] Approve implementation timeline
- [ ] Authorize feature flag names
- [ ] Confirm rollout strategy

---

## Questions for User

1. **Should profiles be public or private by default?**
   - Recommendation: Private (opt-in public)

2. **Should we implement profile search?**
   - Recommendation: Yes, with privacy filters

3. **Should we track profile views?**
   - Recommendation: Yes, with hashed viewer identity

4. **Timeline preference?**
   - Aggressive: 1 week (all phases)
   - Measured: 3 weeks (phased rollout)

5. **Which customization features are most important?**
   - Banner images
   - Social links
   - Verification badges
   - Theme customization

---

## Files to Review

1. **`NOSTA_ME_COMPARATIVE_ANALYSIS.md`**
   - Full feature comparison
   - Nosta.me UI/UX patterns
   - Gap analysis

2. **`PUBLIC_PROFILE_URL_IMPLEMENTATION_PROPOSAL.md`**
   - Technical architecture
   - Database schema
   - API specifications
   - RLS policies
   - Implementation phases

3. **`NOSTA_ME_ANALYSIS_SUMMARY.md`**
   - Executive summary
   - Key findings
   - Recommended implementation

---

## Competitive Advantages

If implemented, Satnam.pub would have:

1. **Better Privacy** - Nosta.me has no visibility controls
2. **Family Integration** - Unique family banking + profiles
3. **Lightning Payments** - Direct payment from profile
4. **Master Context** - Role-based customization
5. **Zero-Knowledge** - Privacy-first by design
6. **Advanced Messaging** - NIP-17/59 integration
7. **Trust System** - NIP-85 trust scoring

---

## Next Steps

1. ✅ Review all analysis documents
2. ✅ Answer the questions above
3. ✅ Approve implementation strategy
4. ✅ Authorize database schema changes
5. ⏳ Proceed with Phase 1 implementation

---

**Status:** Ready for Review & Approval  
**Approval Required:** User confirmation before implementation begins  
**Estimated Timeline:** 7-11 days after approval

---

## Contact & Questions

For questions about this analysis or implementation proposal, please review the detailed documentation:

- **Comparative Analysis:** `docs/NOSTA_ME_COMPARATIVE_ANALYSIS.md`
- **Technical Proposal:** `docs/PUBLIC_PROFILE_URL_IMPLEMENTATION_PROPOSAL.md`
- **Executive Summary:** `docs/NOSTA_ME_ANALYSIS_SUMMARY.md`

All documents are ready for review and awaiting user approval.

