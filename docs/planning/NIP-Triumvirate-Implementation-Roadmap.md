# NIP-AC / NIP-SA / NIP-SKL Triumvirate: Granular Implementation Roadmap
**Version:** 3.0 | **Date:** 2026-03-03 | **Target Demo:** April 3, 2026
**Repo:** github.com/OV1-Kenobi/satnam_pub
**OS:** Windows (all commands are PowerShell-compatible unless marked `[bash/VPS]`)

---

## Strategic Context

This document is the canonical instruction set for AI coding agents working on the Satnam client.
Three NIPs must reach canonical directory status before the demo:

| NIP | Name | Event Kinds | Status |
|-----|------|-------------|--------|
| NIP-SKL | Skill Manifest & Registry | 33400, 33401, 1985 | Draft in OpenAgents repo v3 (2026-02-26) |
| NIP-SA | Sovereign Agents | 39200–39203, 39210–39211, 39220–39221, 39230–39231, 39212–39213 | Draft in OpenAgents repo |
| NIP-AC | Agent Credit | 39240–39245 | Draft in OpenAgents repo |

**Acceptance bar (de facto, nostr-protocol/nips):**
1. ≥2 independent client implementations (OpenAgents + Satnam = 2 ✓ once built)
2. ≥1 relay implementation (StrFry write policy = 1 ✓ once configured)
3. Draft PR open in canonical repo with spec text
4. No kind-number conflicts with existing NIPs
5. Positive signal from established Nostr authors

> **AGENT RULE:** Never skip a VERIFY step. Never run a destructive command without the listed rollback.
> Every file operation ends with `ls -la` or PowerShell equivalent. Every git operation includes
> `git log --oneline -5` before and after.

---

## Repository State Verification (Run First, Every Session)

```powershell
# BEFORE any work — confirm clean state
git log main --oneline -5
git status
git diff --name-only
```

**Expected:** clean working tree. If dirty, stash or commit before proceeding.

```powershell
# Confirm existing NIP-related files
ls src/lib/nip-skl 2>$null; if ($?) { "nip-skl exists" } else { "nip-skl not yet created" }
ls src/lib/nip-sa  2>$null; if ($?) { "nip-sa exists" }  else { "nip-sa not yet created" }
ls src/lib/nip-ac  2>$null; if ($?) { "nip-ac exists" }  else { "nip-ac not yet created" }
```

---

## Phase 0 — Pre-Flight: Spec Verification (Day 1, ~2 hours)

> **Do not write any event-publishing code until these steps pass.**
> Kind-number errors are hard to undo once events are on relays.

### Step 0.1 — Pull the Actual Spec Files from OpenAgents

```powershell
# VERIFY spec files exist at these paths in the OpenAgents repo
# Ask Christopher or check: github.com/OpenAgentsInc/openagents/tree/main/crates/nostr/nips/
# Files needed: SKL.md, SA.md, AC.md
# Save local copies to: docs/specs/SKL.md, docs/specs/SA.md, docs/specs/AC.md

mkdir docs\specs -Force
# Paste file contents manually or clone the repo:
# git clone https://github.com/OpenAgentsInc/openagents.git oa-reference
# copy oa-reference\crates
ostr
ips\*.md docs\specsls docs\specs```

**VERIFY:** All three .md files are present and non-empty.
**ROLLBACK:** Nothing to undo — read-only step.

### Step 0.2 — Extract and Lock Kind Numbers

Open each spec file and record the exact kind numbers in a local reference:

```powershell
# Create a kinds reference file — fill in from actual specs
@"
# Kind Number Registry — LOCKED from spec files
# Last verified: $(Get-Date -Format 'yyyy-MM-dd')

## NIP-SKL
# 33400  Skill Manifest (addressable/replaceable)
# 33401  Skill Version Log (append-only)
# 1985   Trust Attestation (NIP-32 label)
# 5390   NIP-90 Skill Search Request (optional profile)
# 6390   NIP-90 Skill Search Result (optional profile)

## NIP-SA
# 39200  Agent Profile (replaceable)
# 39201  Agent State (replaceable)
# 39202  Agent Schedule (replaceable)
# 39203  Agent Goals (replaceable)
# 39210  Agent Tick Request (ephemeral)
# 39211  Agent Tick Result (ephemeral)
# 39220  Skill License (addressable)
# 39221  Skill Delivery (ephemeral)
# 39212  Guardian Approval Request (regular)
# 39213  Guardian Approval (ephemeral)
# 39230  Agent Trajectory Session (addressable)
# 39231  Agent Trajectory Event (regular)

## NIP-AC
# 39240  Credit Intent (regular)
# 39241  Credit Offer (regular)
# 39242  Credit Envelope (addressable)
# 39243  Credit Spend Authorization (ephemeral)
# 39244  Credit Settlement Receipt (regular)
# 39245  Credit Default Notice (regular)
"@ | Out-File docs\specs\KIND-REGISTRY.md -Encoding utf8
```

**VERIFY:** Cross-check every number above against the actual spec files before proceeding.

### Step 0.3 — Create Feature Branch

```powershell
# BEFORE branch creation
git log main --oneline -5
git status

git checkout -b nip-triumvirate-impl
git log nip-triumvirate-impl --oneline -3

# VERIFY
git branch --show-current
# Expected: nip-triumvirate-impl
```

**ROLLBACK:** `git checkout main` returns to main at any point.

---

## Phase 1 — NIP-SKL Core Libraries (Week 1: March 3–7)

### Step 1.1 — Create Directory Structure

```powershell
# BEFORE
git log --oneline -3

mkdir src\lib
ip-skl -Force
mkdir src\lib
ip-sa  -Force
mkdir src\lib
ip-ac  -Force

# VERIFY
ls src\lib# Expected: nip-skl, nip-sa, nip-ac directories present
```

### Step 1.2 — `src/lib/nip-skl/manifest.ts` (kind 33400)

> Publishes a skill manifest. The `manifestHash` is SHA-256 of the exact SKILL.md bytes
> (UTF-8, LF line endings, no BOM). This hash is the root of trust — it MUST match the
> bytes the agent receives at runtime.

```typescript
// src/lib/nip-skl/manifest.ts
import { finalizeEvent, getPublicKey } from 'nostr-tools';
import { createHash } from 'crypto';

export interface SkillManifestInput {
  slug: string;           // d-tag, stable — e.g. 'perplexity-search'
  name: string;
  version: string;        // semver — e.g. '1.0.0'
  description: string;
  capabilities: string[]; // ALLOWLIST — e.g. ['http:outbound']
  skillPayloadBytes: Buffer; // actual SKILL.md bytes for hash
  validUntilUnix: number;
  skillNsec: Uint8Array;  // skill's own keypair, NOT guardian key
}

export function buildSkillManifest(input: SkillManifestInput) {
  // SPEC: UTF-8, LF line endings, no BOM
  const normalized = Buffer.from(
    input.skillPayloadBytes.toString('utf8').replace(/
/g, '
').replace(//g, '
'),
    'utf8'
  );
  const manifestHash = createHash('sha256').update(normalized).digest('hex');
  const skillPubkey = getPublicKey(input.skillNsec);
  const skillScopeId = `33400:${skillPubkey}:${input.slug}:${input.version}`;

  const event = {
    kind: 33400,
    pubkey: skillPubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', input.slug],
      ['name', input.name],
      ['version', input.version],
      ['description', input.description],
      ...input.capabilities.map(cap => ['capability', cap]),
      ['manifesthash', manifestHash],
      ['expiry', String(input.validUntilUnix)],
      ['skillscopeid', skillScopeId],
      ['t', 'agent-skill'],
    ],
    content: `Initial publication of ${input.name} v${input.version}`,
  };

  return { event: finalizeEvent(event, input.skillNsec), manifestHash, skillScopeId };
}
```

```powershell
# VERIFY after writing file
ls src\lib
ip-skl\manifest.ts
# Compute hash to cross-check manually
$bytes = [System.IO.File]::ReadAllBytes("path	o\your-skill.md")
$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-","").ToLower()
Write-Host "Manual SHA-256: $hash"
# Must match what buildSkillManifest produces
```

**ROLLBACK:** `git checkout src/lib/nip-skl/manifest.ts` restores prior state.

### Step 1.3 — `src/lib/nip-skl/version-log.ts` (kind 33401)

> Append-only log. Published alongside every manifest update. Never replaced.

```typescript
// src/lib/nip-skl/version-log.ts
import { finalizeEvent, getPublicKey } from 'nostr-tools';

type ChangeType = 'added' | 'changed' | 'fixed' | 'deprecated' | 'security';

export function buildVersionLogEntry(
  slug: string,
  version: string,
  prevVersion: string,
  manifestEventId: string,
  manifestHash: string,
  changeType: ChangeType,
  changeNote: string,
  skillNsec: Uint8Array,
) {
  const event = {
    kind: 33401,
    pubkey: getPublicKey(skillNsec),
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', slug],
      ['version', version],
      ['prevversion', prevVersion],
      ['manifestevent', manifestEventId],
      ['manifesthash', manifestHash],
      ['changetype', changeType],
    ],
    content: changeNote,
  };
  return finalizeEvent(event, skillNsec);
}
```

```powershell
ls src\lib
ip-sklersion-log.ts
# VERIFY: kind is 33401, d tag matches slug, prevversion tag present
```

### Step 1.4 — `src/lib/nip-skl/attestation.ts` (kind 1985, NIP-32)

> Guardian pubkey attests that a skill manifest has been reviewed.

```typescript
// src/lib/nip-skl/attestation.ts
import { finalizeEvent, getPublicKey } from 'nostr-tools';

type SkillSecurityLabel =
  | 'audit-passed' | 'scan-clean' | 'capabilities-verified' | 'delivery-hash-verified'
  | 'malicious-confirmed' | 'prompt-injection' | 'credential-exfil' | 'capability-violation';

export function buildSkillAttestation(
  skillPubkey: string,
  skillSlug: string,
  manifestEventId: string,
  label: SkillSecurityLabel,
  guardianNsec: Uint8Array,
) {
  const skillAddress = `33400:${skillPubkey}:${skillSlug}`;
  const event = {
    kind: 1985,
    pubkey: getPublicKey(guardianNsec),
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['L', 'skill-security'],
      ['l', label, 'skill-security'],
      ['a', skillAddress],
      ['e', manifestEventId],
      ['p', skillPubkey],
    ],
    content: `Federation attestation: ${label}`,
  };
  return finalizeEvent(event, guardianNsec);
}
```

### Step 1.5 — `src/lib/nip-skl/runtime-gate.ts`

> **CRITICAL SAFETY FILE.** Agents MUST NOT execute a skill unless this gate passes.
> Spec is explicit: runtimes MUST verify payload hash equality before loading a skill.

```typescript
// src/lib/nip-skl/runtime-gate.ts
import { SimplePool } from 'nostr-tools';
import { createHash } from 'crypto';

const RELAY = 'wss://relay.satnam.pub';

export async function verifySkillBeforeLoad(
  skillPubkey: string,
  skillSlug: string,
  receivedPayloadBytes: Buffer,
): Promise<{ safe: boolean; reason: string; skillScopeId?: string }> {
  const pool = new SimplePool();

  const manifests = await pool.querySync(RELAY, { kinds: [33400], authors: [skillPubkey], '#d': [skillSlug] });
  pool.close(RELAY);

  if (manifests.length === 0) return { safe: false, reason: 'No kind:33400 manifest found on relay' };

  const manifest = manifests.sort((a, b) => b.created_at - a.created_at)[0];

  const expiryTag = manifest.tags.find(t => t[0] === 'expiry');
  const expiry = expiryTag ? parseInt(expiryTag[1]) : 0;
  if (expiry < Math.floor(Date.now() / 1000))
    return { safe: false, reason: `Manifest expired at ${new Date(expiry * 1000).toISOString()}` };

  // SPEC: UTF-8, no BOM, LF line endings
  const normalized = Buffer.from(
    receivedPayloadBytes.toString('utf8').replace(/
/g, '
').replace(//g, '
'),
    'utf8'
  );
  const computedHash = createHash('sha256').update(normalized).digest('hex');
  const declaredHash = manifest.tags.find(t => t[0] === 'manifesthash')?.[1];

  if (computedHash !== declaredHash)
    return { safe: false, reason: `Hash mismatch! Declared: ${declaredHash}, Computed: ${computedHash}. DO NOT LOAD.` };

  const skillScopeId = manifest.tags.find(t => t[0] === 'skillscopeid')?.[1];
  return { safe: true, reason: 'Manifest verified: hash match, not expired', skillScopeId };
}
```

```powershell
# VERIFY runtime gate works — run three test cases:
# 1. Tampered payload  -> should return safe: false
# 2. Correct payload   -> should return safe: true
# 3. Expired manifest  -> should return safe: false
# NEVER bypass this check in production
```

### Step 1.6 — `src/lib/nip-skl/ac-interop.ts`

> Builds the canonical NIP-AC scope string from a NIP-SKL manifest.

```typescript
// src/lib/nip-skl/ac-interop.ts
// Canonical format per NIP-SKL spec section 9.2
export function buildACSkillScope(skillScopeId: string, constraintsHash: string): string {
  return `skill:${skillScopeId}:${constraintsHash}`;
  // Output example: skill:33400:abc123pubkey:perplexity-search:1.0.0:def456hash
}
```

### Step 1.7 — StrFry Write Policy (kind 33400 + 33401)

```bash
# [bash/VPS] BEFORE modifying policy — backup
cp /etc/strfry/policy.sh /etc/strfry/policy.sh.bak.$(date +%Y%m%d)

# VERIFY backup exists
ls -la /etc/strfry/policy.sh.bak.*

# Add ONLY spec-confirmed SKL kinds to ACCEPTED_KINDS array:
# 33400  Skill Manifest
# 33401  Skill Version Log
# 1985   NIP-32 attestations (likely already present)
# 5390 / 6390  Optional NIP-90 skill search (add only when implementing that profile)

# ACCEPTED_KINDS=(0 1 3 4 5 6 7 1984 1985 5390 6390 9735 10002 30023 30078 30402 33400 33401)

# Test with dummy event AFTER editing
echo '{"event":{"kind":33400},"id":"test"}' | /etc/strfry/policy.sh
# Expected output: {"action":"accept",...}
```

**ROLLBACK:**
```bash
cp /etc/strfry/policy.sh.bak.YYYYMMDD /etc/strfry/policy.sh
sudo systemctl restart strfry
```

### Step 1.8 — Week 1 Git Checkpoint

```powershell
git log nip-triumvirate-impl --oneline -5
git diff --name-only
git add src\lib
ip-sklgit add docs\specsgit commit -m "feat: NIP-SKL core library — manifest, version-log, attestation, runtime-gate, ac-interop"
git log --oneline -3
# VERIFY: commit appears with correct message
```

---

## Phase 2 — NIP-SA Agent Profile Integration (Week 2: March 8–14)

### Step 2.1 — `src/lib/nip-sa/profile.ts` (kind 39200)

> Agent profile event. This is the machine-readable policy document NIP-SA runners read
> to enforce Cashu sweep thresholds, mint limits, and spending budgets.

```typescript
// src/lib/nip-sa/profile.ts
import { finalizeEvent, getPublicKey } from 'nostr-tools';

export interface AgentProfileConfig {
  lud16: string;
  primaryMintUrl: string;
  secondaryMintUrl?: string;
  federationId?: string;
  skillScopeId: string;          // from NIP-SKL manifest's skillscopeid tag
  sweepMaxSats: number;          // sweep triggers at or above this
  sweepMinSats: number;          // sweep target — leave at least this
  mintMaxSats: number;
  mintMinSats: number;
  budgetPerTickSats: number;
  agentNsec: Uint8Array;
}

export function buildAgentProfile(config: AgentProfileConfig) {
  const event = {
    kind: 39200,
    pubkey: getPublicKey(config.agentNsec),
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['lud16', config.lud16],
      ['cashumint', config.primaryMintUrl],
      ...(config.secondaryMintUrl ? [['cashumint', config.secondaryMintUrl]] : []),
      ...(config.federationId ? [['federation', config.federationId]] : []),
      ['cashu-policy', 'sweep', String(config.sweepMaxSats), String(config.sweepMinSats), config.lud16, config.primaryMintUrl],
      ['cashu-limit', config.primaryMintUrl, String(config.mintMinSats), String(config.mintMaxSats)],
      ['budget', String(config.budgetPerTickSats), 'cashu', config.primaryMintUrl],
      ['a', `33400:${config.skillScopeId}`],
    ],
    content: '',
  };
  return finalizeEvent(event, config.agentNsec);
}
```

```powershell
# VERIFY all required tags present before any relay publish
# Check: lud16, cashumint, cashu-policy, cashu-limit, budget, a
ls src\lib
ip-sa\profile.ts
```

### Step 2.2 — `src/lib/cashu/mint-selector.ts`

> NUT-06 capability check. Must run before publishing kind 39200 with mint URLs.

```typescript
// src/lib/cashu/mint-selector.ts
export interface MintCapabilities {
  url: string;
  supportsNUT11: boolean;   // P2PK
  supportsNUT14: boolean;   // HTLC
  supportsNUT17: boolean;   // optional
  online: boolean;
}

const CURATED_MINTS = [
  'https://mint.minibits.cash/Bitcoin',
  'https://mint.calle.io',
  'https://legend.lnbits.com/cashu/api/v1/REPLACE_WITH_ID',
  'https://21mint.me',
];

export async function checkMintCapabilities(mintUrl: string): Promise<MintCapabilities> {
  try {
    const res = await fetch(`${mintUrl}/v1/info`);
    const info = await res.json();
    const nuts: string[] = Object.keys(info.nuts || {});
    return {
      url: mintUrl,
      supportsNUT11: nuts.includes('11'),
      supportsNUT14: nuts.includes('14'),
      supportsNUT17: nuts.includes('17'),
      online: true,
    };
  } catch {
    return { url: mintUrl, supportsNUT11: false, supportsNUT14: false, supportsNUT17: false, online: false };
  }
}

export async function checkAllMints(): Promise<MintCapabilities[]> {
  return Promise.all(CURATED_MINTS.map(checkMintCapabilities));
}
```

```powershell
# VERIFY against a live mint before publishing any kind 39200
npx ts-node -e "
const { checkMintCapabilities } = require('./src/lib/cashu/mint-selector');
checkMintCapabilities('https://mint.minibits.cash/Bitcoin').then(r => console.log(r));
"
# Expected: { supportsNUT11: true, supportsNUT14: true, online: true }
```

### Step 2.3 — `src/lib/cashu/sweep-policy.ts`

> NUT-05 melt. Runs inside the NIP-SA tick loop (kind 39210) on every agent wake cycle.

```typescript
// src/lib/cashu/sweep-policy.ts
import { CashuWallet } from '@cashu/cashu-ts';

export interface SweepPolicy {
  mintUrl: string;
  maxThresholdSats: number;
  minThresholdSats: number;
  sweepToLud16: string;
}

export interface SweepResult {
  triggered: boolean;
  sweptSats?: number;
  newBalance?: number;
  error?: string;
}

export async function checkAndSweep(wallet: CashuWallet, policy: SweepPolicy): Promise<SweepResult> {
  const proofs = await wallet.getProofs();
  const currentSats = proofs.reduce((sum, p) => sum + p.amount, 0);

  if (currentSats < policy.maxThresholdSats) return { triggered: false };

  const sweptSats = currentSats - policy.minThresholdSats;
  if (sweptSats <= 0) return { triggered: false, error: 'Sweep amount is zero — check min/max thresholds' };

  // Fetch LNURL-pay invoice
  const [user, domain] = policy.sweepToLud16.split('@');
  const lnurlRes = await fetch(`https://${domain}/.well-known/lnurlp/${user}`);
  const lnurlData = await lnurlRes.json();
  const invoiceRes = await fetch(`${lnurlData.callback}?amount=${sweptSats * 1000}`);
  const invoiceData = await invoiceRes.json();
  const invoice = invoiceData.pr;

  if (!invoice) throw new Error('Failed to fetch Lightning invoice for sweep');

  const meltQuote = await wallet.createMeltQuote(invoice);
  const meltResult = await wallet.meltTokens(meltQuote, proofs);

  if (!meltResult.isPaid) return { triggered: true, error: 'Melt sweep payment failed — invoice unpaid' };

  return { triggered: true, sweptSats, newBalance: policy.minThresholdSats - meltQuote.fee_reserve };
}
```

```powershell
# VERIFY with mock wallet at balance above and below threshold before connecting to real mint
ls src\lib\cashu\sweep-policy.ts
```

### Step 2.4 — Update StrFry Policy for NIP-SA Kinds

```bash
# [bash/VPS] BEFORE modifying — backup
cp /etc/strfry/policy.sh /etc/strfry/policy.sh.bak.$(date +%Y%m%d)

# Add NIP-SA kinds:
# 39200, 39201, 39202, 39203 (replaceable agent events)
# 39210, 39211 (ephemeral tick request/result)
# 39212, 39213 (guardian approval — regular/ephemeral)
# 39220, 39221 (skill license/delivery)
# 39230, 39231 (trajectory session/event)

# ACCEPTED_KINDS=(... 39200 39201 39202 39203 39210 39211 39212 39213 39220 39221 39230 39231)

# Test
echo '{"event":{"kind":39200},"id":"test"}' | /etc/strfry/policy.sh
# Expected: {"action":"accept",...}
```

### Step 2.5 — `.well-known` Endpoints

```powershell
# api.satnam.pub — three endpoints to update/create:

# 1. .well-known/nostr.json — add sovereignAIskl entry
# Add to existing JSON: "names": { "sovereignAIskl": "SKILL_PUBKEY_HEX" }
# VERIFY:
# curl https://ai.satnam.pub/.well-known/nostr.json?name=sovereignAIskl
# Expected: {"names":{"sovereignAIskl":"<pubkey>"},"relays":{...}}

# 2. .well-known/lnurlp/sovereignai — confirm LNbits endpoint is live
# VERIFY:
# curl https://satnam.pub/.well-known/lnurlp/sovereignai
# Expected: {"tag":"payRequest",...}

# 3. .well-known/agent.json — NEW Satnam-pioneered endpoint
# Returns: { "cashumint": [...], "federationId": "...", "nuts": ["11","14"], "relay": "wss://..." }
# VERIFY:
# curl https://ai.satnam.pub/.well-known/agent.json?name=sovereignAIskl
# Expected: JSON with cashumint array and nut support surface
```

### Step 2.6 — Week 2 Git Checkpoint

```powershell
git log nip-triumvirate-impl --oneline -5
git diff --name-only
git add src\lib
ip-sagit add src\lib\cashugit commit -m "feat: NIP-SA agent profile, mint-selector, sweep-policy, well-known endpoints"
git log --oneline -3
```

---

## Phase 3 — NIP-AC Credit Envelope Integration (Week 3: March 15–21)

### Step 3.1 — `src/lib/nip-ac/envelope.ts` (kind 39242)

```typescript
// src/lib/nip-ac/envelope.ts
import { finalizeEvent, getPublicKey } from 'nostr-tools';

export interface CreditEnvelopeInput {
  envelopeId: string;         // stable d-tag
  agentPubkey: string;
  issuerNsec: Uint8Array;
  providerPubkey: string;
  skillScopeId: string;       // from NIP-SKL manifest
  manifestEventId: string;    // version pin
  maxSats: number;
  expiryUnix: number;
  spendRail: 'lightning' | 'cashu' | 'fedimint';
  mintUrl?: string;           // required if spendRail === 'cashu'
  federationId?: string;      // required if spendRail === 'fedimint'
  repayRail?: string;
}

export function buildCreditEnvelope(input: CreditEnvelopeInput) {
  const issuerPubkey = getPublicKey(input.issuerNsec);
  const event = {
    kind: 39242,
    pubkey: issuerPubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', input.envelopeId],
      ['p', input.agentPubkey],
      ['issuer', issuerPubkey],
      ['provider', input.providerPubkey],
      ['scope', 'skill', `skill:${input.skillScopeId}:constraintshash`],
      ['a', `33400:${input.skillScopeId}`],
      ['e', input.manifestEventId],  // version pin
      ['max', String(input.maxSats)],
      ['exp', String(input.expiryUnix)],
      ['spendrail', input.spendRail, input.mintUrl || input.federationId || ''],
      ['status', 'accepted'],
    ],
    content: '',
  };
  return finalizeEvent(event, input.issuerNsec);
}
```

### Step 3.2 — `src/lib/nip-ac/spend-auth.ts` (kind 39243)

```typescript
// src/lib/nip-ac/spend-auth.ts
import { finalizeEvent, getPublicKey } from 'nostr-tools';

export function buildSpendAuthorization(
  envelopeId: string,
  issuerPubkey: string,
  scopeType: 'nip90' | 'skill' | 'l402',
  scopeId: string,
  spendSats: number,
  maxSats: number,
  expiryUnix: number,
  agentNsec: Uint8Array,
) {
  const event = {
    kind: 39243,
    pubkey: getPublicKey(agentNsec),
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['p', issuerPubkey],
      ['credit', envelopeId],
      ['scope', scopeType, scopeId],
      ['max', String(maxSats)],
      ['exp', String(expiryUnix)],
    ],
    content: JSON.stringify({ schema: 1, spend_sats: spendSats }),
  };
  return finalizeEvent(event, agentNsec);
}
```

### Step 3.3 — SKL Safety Label Revocation Subscription

> Issuers SHOULD subscribe to kind 1985 events for skills they have issued envelopes against.
> On receipt of a negative label, revoke the envelope.

```typescript
// src/lib/nip-ac/revocation-watcher.ts
import { SimplePool } from 'nostr-tools';

const RELAY = 'wss://relay.satnam.pub';

const NEGATIVE_LABELS = ['malicious-confirmed', 'prompt-injection', 'credential-exfil', 'capability-violation'];

export async function watchForRevocationTriggers(
  skillAddresses: string[],   // ['33400:pubkey:slug']
  onRevocation: (label: string, eventId: string) => void,
) {
  const pool = new SimplePool();
  pool.subscribeMany(
    [RELAY],
    [{ kinds: [1985], '#a': skillAddresses }],
    {
      onevent(event) {
        const label = event.tags.find(t => t[0] === 'l' && t[2] === 'skill-security')?.[1];
        if (label && NEGATIVE_LABELS.includes(label)) {
          onRevocation(label, event.id);
        }
      },
    }
  );
}
```

### Step 3.4 — Update StrFry Policy for NIP-AC Kinds

```bash
# [bash/VPS]
cp /etc/strfry/policy.sh /etc/strfry/policy.sh.bak.$(date +%Y%m%d)

# Add NIP-AC kinds: 39240 39241 39242 39243 39244 39245
# ACCEPTED_KINDS=(... 39240 39241 39242 39243 39244 39245)

echo '{"event":{"kind":39242},"id":"test"}' | /etc/strfry/policy.sh
# Expected: {"action":"accept",...}
```

### Step 3.5 — Week 3 Git Checkpoint

```powershell
git log nip-triumvirate-impl --oneline -5
git add src\lib
ip-acgit commit -m "feat: NIP-AC credit envelope, spend-auth, revocation watcher"
git log --oneline -3
```

---

## Phase 4 — NIP-SKL Skill License and Delivery (Week 3, parallel)

### Step 4.1 — `src/lib/nip-sa/license.ts` (kind 39220 + 39221)

```typescript
// src/lib/nip-sa/license.ts
import { finalizeEvent, getPublicKey, nip44 } from 'nostr-tools';

export function buildSkillLicense(
  agentPubkey: string,
  skillSlug: string,
  skillScopeId: string,       // from kind 33400 skillscopeid tag
  manifestEventId: string,
  paymentRail: 'cashu' | 'lightning',
  paymentProof: string,       // cashu token string or bolt11 preimage
  validUntilUnix: number,
  providerNsec: Uint8Array,
) {
  const event = {
    kind: 39220,
    pubkey: getPublicKey(providerNsec),
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', `${skillSlug}:${agentPubkey}`],
      ['p', agentPubkey],
      ['a', `33400:${skillScopeId}`],
      ['e', manifestEventId],            // version pin
      ['paymentrail', paymentRail],
      ['paymentproof', paymentProof],
      ['licensedat', String(Math.floor(Date.now() / 1000))],
      ['expiresat', String(validUntilUnix)],
    ],
    content: '',
  };
  return finalizeEvent(event, providerNsec);
}

export function buildSkillDelivery(
  agentPubkey: string,
  licenseEventId: string,
  skillPayload: string,        // NIP-44 encrypted to agentPubkey
  providerNsec: Uint8Array,
) {
  // VERIFY: licenseEventId references a valid kind 39220 event
  const event = {
    kind: 39221,
    pubkey: getPublicKey(providerNsec),
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['p', agentPubkey],
      ['e', licenseEventId],
    ],
    content: skillPayload, // Must be NIP-44 encrypted to agent pubkey
  };
  return finalizeEvent(event, providerNsec);
}
```

```powershell
# VERIFY
# 1. License event references correct 'a' tag (kind 33400 skill address)
# 2. Delivery event content is NIP-44 encrypted to agent pubkey (not plaintext)
ls src\lib
ip-sa\license.ts
```

---

## Phase 5 — NostrHub Submission and Canonical PR (Week 4: March 22–28)

### Step 5.1 — Submit NIP-SKL to NostrHub

> Gets NIP-SKL discoverable immediately — no canonical committee approval required.

```
1. Navigate to: https://nostrhub.io/submit-custom-nip
2. Paste the full contents of docs/specs/SKL.md
3. Sign with your npub (OV1-Kenobi npub)
4. Note the returned nostrnaddr1... URL — this is your public NIP-SKL listing
5. Add to demo materials immediately
```

**VERIFY:** Query confirms NIP-SKL is discoverable:
```json
["REQ", "skills", {"kinds": [33400], "#t": ["agent-skill"], "limit": 5}]
```

### Step 5.2 — Open Canonical PR in nostr-protocol/nips

```bash
# [bash] Step 1: Fork nostr-protocol/nips
# Go to: https://github.com/nostr-protocol/nips
# Click Fork > Create fork

# Step 2: Clone your fork
git clone https://github.com/YOUR_USERNAME/nips.git nostr-nips-fork
cd nostr-nips-fork

# VERIFY
git log --oneline -3
git remote -v
# Expected: origin points to your fork

# Step 3: Create branch
git checkout -b nip-skl-skill-manifest
git log nip-skl-skill-manifest --oneline -3

# Step 4: Copy spec file
cp path/to/docs/specs/SKL.md ./SKL.md
ls -la SKL.md

# Step 5: Commit
git add SKL.md
git commit -m "NIP-SKL: Skill Manifest and Registry for Autonomous Agents

- kind:33400 Skill Manifest (addressable)
- kind:33401 Skill Version Log (append-only)
- kind:1985  Trust Attestation (NIP-32 label)
- Relay-native discovery via 't: agent-skill' tag
- Mandatory manifesthash verification before skill load
- NIP-AC scope integration via skillscopeid tag

Reference implementation: https://github.com/OV1-Kenobi/satnam_pub
Second client: OpenAgentsInc/openagents (co-author: Christopher David)"

git log --oneline -3

# Step 6: Push and open PR
git push origin nip-skl-skill-manifest
# Then open PR at: https://github.com/nostr-protocol/nips/compare
```

**ROLLBACK:** `git reset HEAD~1` to undo commit before push.

### Step 5.3 — Open NIP-SA PR in OpenAgentsInc/openagents

```bash
# [bash] Fork OpenAgentsInc/openagents (request collaborator access from Christopher first)
# VERIFY fork exists: https://github.com/YOUR_USERNAME/openagents

git clone https://github.com/YOUR_USERNAME/openagents.git oa-fork
cd oa-fork
git checkout -b feat/sa-cashu-fedimint-guardian-profiles

# VERIFY no kind conflicts with existing SA kinds table
grep -n "39212\|39213" crates/nostr/nips/SA.md
# Expected: not found — confirms kinds 39212/39213 are free

# Edit spec file
nano crates/nostr/nips/SA.md
# Add: cashumint, federation, cashu-policy, cashu-limit, paymentrail/paymentproof tags
# Add: kind 39212 Guardian Approval Request, kind 39213 Guardian Approval
# Add: SA-Cashu, SA-Fedimint, SA-Guardian profile sections

git add crates/nostr/nips/SA.md
git commit -m "feat(NIP-SA): SA-Cashu, SA-Fedimint, SA-Guardian profiles

- Add cashumint + federation tags to kind:39200 agent profile
- Add paymentrail/paymentproof to kind:39220 skill license
- Add denominated budget rail to kind:39210 tick request
- Add kind:39212 Guardian Approval Request (regular)
- Add kind:39213 Guardian Approval (ephemeral)
- Connect kind:39211 tick results to NIP-AC settlement receipts

Co-authored-by: Christopher David <npub:openagents>"

git log --oneline -3
git push origin feat/sa-cashu-fedimint-guardian-profiles
# Open PR against main (or branch Christopher specifies)
```

### Step 5.4 — Open NIP-AC PR in OpenAgentsInc/openagents

```bash
# [bash] In the same oa-fork directory
git checkout main
git checkout -b feat/ac-cashu-spend-skl-revocation-guardian

# VERIFY no conflicts
grep -n "spendrail" crates/nostr/nips/AC.md
# Expected: not found (we are adding this tag)

nano crates/nostr/nips/AC.md
# Add: spendrail tag to kind:39240 and kind:39242
# Add: explicit Fedimint repay form in kind:39244
# Add: SKL safety label revocation trigger section
# Add: Guardian approval gate integration from NIP-SA

git add crates/nostr/nips/AC.md
git commit -m "feat(NIP-AC): Cashu spending rail, SKL revocation trigger, Guardian gate

- Add spendrail tag to kind:39240 Credit Intent and kind:39242 Credit Envelope
- Add explicit Fedimint repay form to kind:39244 Settlement Receipt
- Add SKL safety label revocation trigger in Security Considerations
- Add Guardian-gated envelope integration (guardian, guardianthreshold tags)
- Add Fedimint canonical scope hash to Appendix A

Companion PR: feat/sa-cashu-fedimint-guardian-profiles"

git log --oneline -3
git push origin feat/ac-cashu-spend-skl-revocation-guardian
# Note to Christopher: review companion NIP-SA and NIP-AC PRs together
```

### Step 5.5 — Register DVM Kinds (NIP-90)

```
1. Navigate to: https://github.com/nostr-protocol/data-vending-machines
2. Open PR adding NIP-SKL optional DVM kinds:
   - kind 5390: Skill Search Request
   - kind 6390: Skill Search Result
3. Reference the NIP-SKL canonical PR in the PR description
```

---

## Phase 6 — Two-Client Testing (Week 4, parallel with Phase 5)

### Step 6.1 — Generate Test Keypairs

```powershell
# NEVER use real funds or real nsec for testing
npx ts-node -e "
const { generateSecretKey, getPublicKey } = require('nostr-tools');
const skA = generateSecretKey();
const skB = generateSecretKey();
console.log('CLIENT_A_NSEC=' + Buffer.from(skA).toString('hex'));
console.log('CLIENT_A_NPUB=' + getPublicKey(skA));
console.log('CLIENT_B_NSEC=' + Buffer.from(skB).toString('hex'));
console.log('CLIENT_B_NPUB=' + getPublicKey(skB));
"
# Save output to .env.test
# VERIFY .gitignore excludes .env.test
Select-String ".env.test" .gitignore
```

### Step 6.2 — NIP-SKL Test Suite (15 tests minimum before PR)

> **Minimum bar:** All tests pass before contacting Nostr maintainers.

| Test | Condition | Adversarial |
|------|-----------|-------------|
| SKL-1 | kind:33400 published and queryable from relay | — |
| SKL-2 | kind:33401 version log appended on update | — |
| SKL-3 | kind:1985 attestation published, queryable by `#a` | — |
| SKL-4 | `verifySkillBeforeLoad` returns `safe: true` for correct payload | — |
| SKL-5 | `verifySkillBeforeLoad` returns `safe: false` for tampered payload | Tamper one byte |
| SKL-6 | `verifySkillBeforeLoad` returns `safe: false` for expired manifest | Set expiry to past |
| SKL-7 | Relay rejects kind:33400 from pubkey not in write policy | — |
| SA-1 | kind:39200 published with all required tags | — |
| SA-2 | `checkAndSweep` triggers at maxThreshold | — |
| SA-3 | `checkAndSweep` does NOT trigger below maxThreshold | — |
| SA-4 | `checkAndSweep` sweep fails gracefully if LNURL unreachable | Kill LNURL endpoint |
| AC-1 | kind:39242 envelope published, queryable by `#d` | — |
| AC-2 | kind:39243 spend auth references valid envelope | — |
| AC-3 | Revocation watcher fires on negative kind:1985 label | Publish negative label |
| AC-4 | Agent cannot spend above envelope `max` tag | Attempt overspend |

```powershell
# Run test suite
npx jest src/lib/nip-skl/ src/lib/nip-sa/ src/lib/nip-ac/ --verbose
# Expected: 15/15 PASS before any PR is submitted
```

---

## Phase 7 — Demo Preparation and Security Audit (March 29 – April 3)

### Step 7.1 — Security Checklist (run before demo)

```powershell
# Gate 1: Static secret scanning — MUST PASS
# No nsec, seed, or proof strings in repo, logs, fixtures, or snapshots
Select-String -r "nsec1|secretkey|[0-9a-f]{64}" src\ -Recurse -l
# Expected: no matches (excluding .env.test which is gitignored)

# Gate 2: Log scrubbing — confirm no payment headers logged
Select-String -r "x-cashu|x-nostr-pubkey|cashuA" src\ -Recurse -l
# Expected: only in test files, never in logger/middleware code
```

### Step 7.2 — Relay Health Check

```bash
# [bash/VPS] Confirm all three NIP kind ranges accepted by relay
for kind in 33400 33401 1985 39200 39210 39220 39240 39242 39243; do
  result=$(echo "{"event":{"kind":$kind},"id":"test"}" | /etc/strfry/policy.sh)
  echo "kind $kind: $result"
done
# Expected: all return {"action":"accept",...}
```

### Step 7.3 — Demo Script Dry Run

```
1. Guardian issues kind:33400 Skill Manifest for 'email-autopilot'
   VERIFY: queryable on relay, manifestHash matches SKILL.md

2. Guardian publishes kind:1985 attestation: 'audit-passed'
   VERIFY: queryable by #a tag

3. Agent queries relay, finds manifest, runs verifySkillBeforeLoad
   VERIFY: returns { safe: true }

4. Guardian issues kind:39242 Credit Envelope (spendrail: cashu)
   VERIFY: agent pubkey, skillScopeId, maxSats, expiry all correct

5. Agent publishes kind:39243 Spend Authorization
   VERIFY: references correct envelopeId, within maxSats

6. Settlement: kind:39244 Credit Settlement Receipt published
   VERIFY: repay rail, outcome artifact, status: settled

7. Email sent with cashuA... token, wallet.cashu.me link in body
   VERIFY: recipient opens link, token redeems in browser wallet
```

### Step 7.4 — Final Git Checkpoint and Tag

```powershell
git log nip-triumvirate-impl --oneline -10
git diff --name-only

# Confirm all test pass
npx jest --passWithNoTests

# Tag the demo-ready commit
git tag -a v1.0.0-demo -m "NIP-SKL/SA/AC triumvirate demo — April 3, 2026"
git log --oneline -5

# VERIFY tag exists
git tag --list "v1.0.0-demo"
```

---

## Fiat Onramp Reference (for Email Autopilot UI)

> Static UI card — no code integration required. Link to these services from the
> campaign setup screen with the note: "Buy sats → withdraw via Lightning to fund campaigns."

| Service | LN Withdrawal | KYC Level | Notes |
|---------|--------------|-----------|-------|
| [Strike](https://strike.me) | ✅ | Moderate | US-focused, fast |
| [CashApp](https://cash.app) | ✅ | Light | Widest reach |
| [River](https://river.com) | ✅ | Moderate | Bitcoin-only, best rates |

---

## File Map: Deliverables Checklist

```
src/lib/nip-skl/
  ├── manifest.ts          # kind 33400 — Skill Manifest publisher
  ├── version-log.ts       # kind 33401 — Append-only version log
  ├── attestation.ts       # kind 1985  — Guardian trust attestation
  ├── runtime-gate.ts      # verifySkillBeforeLoad — CRITICAL SAFETY
  └── ac-interop.ts        # buildACSkillScope — SKL→AC scope string

src/lib/nip-sa/
  ├── profile.ts           # kind 39200 — Agent profile with wallet policy
  └── license.ts           # kind 39220/39221 — Skill license + delivery

src/lib/nip-ac/
  ├── envelope.ts          # kind 39242 — Credit Envelope
  ├── spend-auth.ts        # kind 39243 — Spend Authorization
  └── revocation-watcher.ts# kind 1985 subscription — SKL safety revocation

src/lib/cashu/
  ├── mint-selector.ts     # NUT-06 capability check
  └── sweep-policy.ts      # NUT-05 melt / auto-sweep

docs/specs/
  ├── SKL.md               # NIP-SKL spec (from OpenAgents repo)
  ├── SA.md                # NIP-SA spec (from OpenAgents repo)
  ├── AC.md                # NIP-AC spec (from OpenAgents repo)
  └── KIND-REGISTRY.md     # Locked kind number reference
```

---

## PR Submission Order (Do Not Reorder)

1. `nip-skl-skill-manifest` → `nostr-protocol/nips` (establishes authorship timestamp)
2. `feat/sa-cashu-fedimint-guardian-profiles` → `OpenAgentsInc/openagents`
3. `feat/ac-cashu-spend-skl-revocation-guardian` → `OpenAgentsInc/openagents`
4. DVM kind registration → `nostr-protocol/data-vending-machines`
5. Demo recording with live relay events → publish as Nostr kind:30023 long-form article

> **Authorship note:** The commit hash on step 1 is your timestamp of authorship.
> Every subsequent PR, integration, and implementation points back to that commit.
