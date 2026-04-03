# NIP-Triumvirate Kind Number Registry
**Version:** 1.0  
**Date:** 2026-03-19  
**Status:** Locked for Implementation

This document locks the Nostr event kind numbers used across NIP-SKL, NIP-SA, and NIP-AC as extracted from the canonical OpenAgents spec files (retrieved 2026-03-19).

**Source:** `github.com/OpenAgentsInc/openagents/tree/main/crates/nostr/nips/`

---

## NIP-SKL: Agent Skill Registry

| Kind  | Type | Description | Source |
|-------|------|-------------|--------|
| **33400** | Addressable (parameterized replaceable) | Skill Manifest | SKL.md §Kinds |
| **33401** | Regular | Skill Version Log | SKL.md §Kinds |
| **1985** | Regular (NIP-32) | Skill attestations / safety labels | SKL.md §Kinds (reused) |
| **5** | Regular (NIP-09) | Publisher-origin revocation | SKL.md §Kinds (reused) |
| **30402** | Addressable (NIP-99) | Optional listing surface | SKL.md §Kinds (reused) |
| **5390** | Regular (NIP-90) | Skill search request (optional profile) | SKL.md §Kinds (optional) |
| **6390** | Regular (NIP-90) | Skill search result (optional profile) | SKL.md §Kinds (optional) |
| **33410** | Ephemeral | Authentication Challenge (optional profile) | SKL.md §Kinds (optional) |
| **33411** | Ephemeral | Authentication Response (optional profile) | SKL.md §Kinds (optional) |

---

## NIP-SA: Sovereign Agents

| Kind  | Type | Description | Source |
|-------|------|-------------|--------|
| **39200** | Replaceable | Agent Profile | SA.md §Kinds |
| **39201** | Replaceable | Agent State | SA.md §Kinds |
| **39202** | Replaceable | Agent Schedule | SA.md §Kinds |
| **39203** | Replaceable | Agent Goals | SA.md §Kinds |
| **39210** | Ephemeral | Agent Tick Request | SA.md §Kinds |
| **39211** | Ephemeral | Agent Tick Result | SA.md §Kinds |
| **39212** | Regular | Guardian Approval Request | SA.md §Kinds |
| **39213** | Regular | Guardian Approval | SA.md §Kinds |
| **39220** | Addressable | Skill License | SA.md §Kinds |
| **39221** | Ephemeral | Skill Delivery | SA.md §Kinds |
| **39230** | Addressable | Agent Trajectory Session | SA.md §Kinds |
| **39231** | Regular | Agent Trajectory Event | SA.md §Kinds |
| **39260** | Regular | Agent Delegation | SA.md §Kinds |

---

## NIP-AC: Agent Credit

| Kind  | Type | Description | Source |
|-------|------|-------------|--------|
| **39240** | Regular | Credit Intent | AC.md §Kinds |
| **39241** | Regular | Credit Offer | AC.md §Kinds |
| **39242** | Addressable | Credit Envelope (OSCE) | AC.md §Kinds |
| **39243** | Ephemeral | Credit Spend Authorization | AC.md §Kinds |
| **39244** | Regular | Credit Settlement Receipt | AC.md §Kinds |
| **39245** | Regular | Credit Default Notice | AC.md §Kinds |
| **39246** | Regular | Credit Cancel Spend | AC.md §Kinds |

---

## Cross-NIP Kind Reuse

| Kind  | Primary NIP | Reused By | Purpose |
|-------|-------------|-----------|---------|
| **1985** | NIP-32 (Labels) | NIP-SKL, NIP-AC | Skill attestations, reputation signals |
| **5** | NIP-09 (Event Deletion) | NIP-SKL | Publisher-origin revocation |
| **30402** | NIP-99 (Classified Listings) | NIP-SKL | Optional skill listing surface |
| **5390/6390** | NIP-90 (Data Vending Machines) | NIP-SKL | Optional skill search profile |

---

## Kind Number Allocation Summary

**Total unique kinds:** 29  
**SKL-specific:** 2 (33400, 33401)  
**SA-specific:** 13 (39200-39203, 39210-39213, 39220-39221, 39230-39231, 39260)  
**AC-specific:** 7 (39240-39246)  
**Reused from existing NIPs:** 4 (1985, 5, 30402, 5390/6390)  
**Optional profile kinds:** 3 (33410, 33411, 5390/6390)

---

## Implementation Notes

1. **No kind number conflicts detected** across the three NIPs
2. **Range allocation:**
   - SKL uses 33400-33411 (skill registry range)
   - SA uses 39200-39260 (sovereign agent range)
   - AC uses 39240-39246 (agent credit range, overlaps with SA by design)
3. **Addressable vs Regular vs Ephemeral:**
   - Addressable events use `d` tag for stable identity (33400, 39220, 39230, 39242)
   - Ephemeral events are not stored long-term (39210, 39211, 39221, 39243, 33410, 33411)
   - Regular events are stored indefinitely (all others)
4. **Cross-NIP dependencies:**
   - NIP-AC references NIP-SKL skill manifests via `skill_scope_id`
   - NIP-SA references NIP-SKL manifests for skill licenses
   - NIP-AC references NIP-SA agent profiles for credit envelopes

---

## Verification Checklist

- [x] SKL.md retrieved from OpenAgents repo
- [x] SA.md retrieved from OpenAgents repo
- [x] AC.md retrieved from OpenAgents repo
- [x] All kind numbers extracted and cross-checked
- [x] No conflicts detected
- [x] Registry locked for implementation

**This registry is now the authoritative source for kind numbers during Satnam NIP-Triumvirate implementation.**

