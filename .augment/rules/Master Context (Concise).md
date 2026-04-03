---
type: "agent_requested"
description: "Concise Master Context for agents in this repo. Covers agent workflow, architecture, env/build invariants, security, and privacy constraints. See also: .augment/rules/Master Rule Set.md (authoritative)."
---

## Agent Workflow (Default)

- You are an agent assisting a human. Default to **plan mode** for any non‑trivial task (≥3 steps or any architectural decision).
- If progress becomes confused or error‑prone, stop, re‑plan, then continue — never blindly push forward.
- Apply plan mode to verification steps, not just implementation.
- Write a short spec up front to remove ambiguity before acting.

## Sub‑Agent Roles (Manual Orchestration)

- Sub‑agent rule files live under `.augment/rules/`; load the relevant file when opening a focused sub‑task conversation.
- Each sub‑agent has a narrow mandate (research/review only, or implementation only — not both).
- One clear task per sub‑agent; do not mix concerns across roles.
- Available roles: Vite/TDZ Build Reviewer · Netlify Security Reviewer · Privacy & DB Reviewer · Nostr/Auth Protocol Reviewer.

## Self‑Improvement Loop

- After any correction from the user: add the pattern to tasks/lessons.md
- Convert lessons to concrete rules that prevent the mistake
- Revisit recent lessons at session start and iterate until error rate drops

## Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask: “Would a staff engineer approve this?”
- Run tests, check logs, and demonstrate correctness

## Demand Elegance (Balanced)

- For non‑trivial changes: pause and ask “is there a more elegant way?”
- If a fix feels hacky, implement the elegant version, knowing what you now know
- Skip this step for tiny, obvious fixes—don’t over‑engineer
- Challenge your own work before presenting it

## Autonomous Bug Fixing

- Given a bug report, just fix it—don’t wait for hand‑holding
- Point at logs, errors, failing tests; then resolve them
- Avoid context switching for the user; close the loop
- Proactively fix failing CI tests in scope

## Task Management (Minimal Process)

1. Plan First → write a checklist to tasks/todo.md
2. Verify Plan → quick check‑in before implementation
3. Track Progress → mark items complete as you go
4. Explain Changes → brief summary at each step
5. Document Results → add review notes in tasks/todo.md
6. Capture Lessons → update tasks/lessons.md after corrections

## Core Principles

- Simplicity First: prefer the simplest change with minimal code
- No Laziness: find root causes—no band‑aids
- Minimal Impact: touch only what’s necessary; avoid introducing bugs

---

## Architecture & Structure (Repo‑Specific)

- Browser app: components are TypeScript (.ts/.tsx); API routes in /api are JavaScript (.js)
- Netlify Functions: keep TypeScript (.ts) in netlify/functions and ESM exports in netlify/functions_active/
  - Pure ESM only in functions_active/: use import syntax, no require/commonjs
  - Export handlers as: `export const handler = async (event, context) => { … }`
  - Use process.env in all Netlify Functions (never import.meta.env)
  - For Node built‑ins in functions, prefer ESM specifiers (e.g., `node:crypto`)
- Types: keep pure type files in /types as .ts; no “any” or undefined types
- Role types; 'human'|'agent'
- Role hierarchy is standardized: humans - 'private'|'offspring'|'adult'|'steward'|'guardian', agents -'adult_agent'|'offspring_agent'
- Control‑board service must not check for an 'admin' role
- All DB calls go through a single database manager; do not open ad‑hoc connections
- Supabase client is a singleton; never create multiples across the app
- Browser‑only code must use Web Crypto and browser‑compatible utilities (avoid Node crypto/util); prefer cached dynamic imports when needed
- Do not create duplicate files like _-new/_-updated; modify in place unless explicitly asked
- Any constant or variable containing JSX must be declared inside component functions (not module scope)
- **Central services (CEPS and similar) must stay thin coordinators:**
  - Never let them become god objects combining signing, session management, adapter selection, and publishing.
  - Signers/adapters sign directly via `secureNsecManager`; CEPS coordinates — it does not own all signing paths.
  - Always include recursion/re‑entry depth guards; test them (`tests/infinite-recursion-fix.test.ts` is the reference).
  - Dependency arrow: UI → services → lib; `lib/*` must never import React components or feature modules.
  - Registration flows must not require a fully initialized CEPS; defer attestations (e.g. NIP‑03) to post‑registration.

## Environment Variables (Critical Pattern)

- Vite injects env via define → a concrete `process.env` object
  - In vite.config.js, use a helper to include ALL `VITE_*` keys plus NODE_ENV and NOSTR_RELAYS
  - Example: `define: { 'process.env': JSON.stringify(getAllViteEnvVars()) }`
- In `src/config/env.client.ts`, read via `getEnvVar(key)` which accesses `process.env`
- Top‑level rule: NEVER use `import.meta.env` at module scope; only inside functions/components
- Netlify Functions ALWAYS use `process.env` (never import.meta.env)

## Authentication & Security (Essentials)

- Auth tokens are JWTs (no cookies). Hashing via PBKDF2/SHA‑512; salts from Vault in production
- Primary sign‑in is NIP‑07; NIP‑05/password is secondary; do NOT support raw nsec sign‑in
- OTP/TOTP: RFC 6238, HMAC‑SHA‑256, 120‑second window, ±1 tolerance; Web Crypto only; encrypt secrets at rest; constant‑time compare; replay protection and rate limiting
- Zero‑knowledge nsec handling: immediate TextEncoder → ArrayBuffer; never store nsec in state/localStorage
- Prefer audited @scure libraries over custom crypto; verify imports/exports; TS strict catch: `error instanceof Error ? error.message : 'Unknown error'`

## Database & Privacy (Authoritative)

- Use the privacy‑first schema only: user_identities replaces profiles; family_federations (federation_duid) and family_members.user_duid
- IDs are hashed UUIDs with per‑user salts; generate encrypted SHA‑256 UUIDs for contacts via Web Crypto
- Migrations: prefer a single idempotent SQL file with comments and RLS policies; run in Supabase SQL editor
- RLS: users have full CRUD on their own rows across key tables using auth.uid(); anon is INSERT‑only for registration; service role is for DDL only
- Avoid heavy polyfills; keep browser‑serverless footprint minimal

## UI & Build Preferences

- Optimize by reducing chunk sizes (don’t just raise limits)
- Onboarding: consolidate steps; defer security confirmations until after credential backup; maintain zero‑knowledge patterns
- **Bundling invariants (do not change without TDZ impact analysis):**
  - All `@supabase/*` packages in a single `supabase-vendor` chunk — never split them.
  - `axios` aliased to browser build; isolated in its own `axios-vendor` chunk.
  - Existing manual chunk groups (`platform-components`, `ui-utils-components`, crypto/vendor chunks) are architectural.

## Coding Discipline & Tooling

- Suggestions vs Actions: clearly label suggestions; implement only with approval
- Ask for confirmation before any change beyond explicit request
- Avoid assumptions; review interacting files/types before edits
- Use package managers for deps (npm/pnpm/yarn/pip/etc.), not manual file edits
- When asked to verify, actually run linters/tests/builds; treat success as exit code 0 with clean logs; iterate minimally to green
