# NIP-PNS (Private Note Storage) – Decision Brief

## What is NIP-PNS?

NIP-PNS is a proposed standard for storing **fully private notes** on the Nostr network. Notes are **encrypted on the user’s device** and stored on Nostr relays in a way that only the person who owns the key can read them, even though the data is synced across devices.

In plain terms, it is a **personal, encrypted notebook in the cloud** that is controlled by the user’s Nostr identity instead of a central company.

## Why Consider It?

- **User-owned private notebook**: Gives Satnam users a secure place for diaries, reflections, drafts, and checklists that follow them across devices.
- **Better privacy than typical “cloud notes”**: Notes are encrypted before they leave the browser; relays and servers see only scrambled data.
- **Strategic fit with identity**: Private notes are tied to the same Nostr identity Satnam already uses, avoiding new accounts or lock-in.
- **Standard-based, not proprietary**: Because it is a Nostr standard, other apps can read the same notes if the user chooses, reinforcing user sovereignty.
- **Flexible future use**: Paves the way for private annotations on family governance, recovery workflows, and educational content without exposing sensitive details.

## Alignment with Satnam

Satnam is already built around **privacy-first, user-controlled identities** and does most security work **in the browser**, not on centralized servers. NIP-PNS fits this model: it keeps private content encrypted on the client, relies on open standards, and does not require Satnam to store or see users’ personal notes.

In effect, NIP-PNS extends Satnam’s existing privacy model from messaging and identity into **personal data and settings**, without adding new centralized risks.

## Recommendation

**Recommendation: Proceed with a phased, feature-flagged integration of NIP-PNS.**

This keeps risk low while giving Satnam a clear path to offer users a portable, encrypted personal notebook that aligns with our core mission of sovereignty and privacy.

## Timeline & Phasing

1. **Phase 0 – Design & Risk Review (Short term)**  
   Finalize how NIP-PNS fits into Satnam’s existing architecture and document key risks and non-goals.

2. **Phase 1 – Core Capability (Short term)**  
   Add the basic ability to create, encrypt, store, and read back private notes in the client, hidden behind a feature flag and not yet exposed in the main UI.

3. **Phase 2 – Pilot User Experience (Medium term)**  
   Introduce an experimental “Private Notes” screen and simple note-taking flows for early adopters and internal testing.

4. **Phase 3 – Deeper Integration (Medium term)**  
   Carefully connect private notes to selected Satnam flows (for example, private annotations on family governance) where they clearly add value.

5. **Phase 4 – Hardening & Ecosystem Interop (Long term)**  
   Refine the experience, improve performance, and validate that Satnam works smoothly with other apps that adopt the NIP-PNS standard.

## Key Risks

- **Evolving standard**: NIP-PNS is still a draft; details may change, requiring updates and possible data migration.
- **Key loss or compromise**: Private notes are tied to the user’s cryptographic key; if a user loses or leaks that key, notes may be lost or exposed.
- **User misunderstanding**: Without clear guidance, users might assume “private notes” protect them from all threats (e.g., device malware), which they do not.

## Next Steps

1. **Approve or decline** this phased approach to NIP-PNS integration at the product level.
2. If approved, **green-light Phase 0–1** as a low-risk, behind-the-scenes initiative (design + core capability under feature flags).
3. **Schedule a follow-up review** after Phase 1 to assess early findings, refine the user story for a Private Notes feature, and decide on pilot scope.
4. **Monitor ecosystem adoption** of NIP-PNS to time broader rollout and interoperability messaging.

