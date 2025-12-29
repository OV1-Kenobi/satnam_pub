# Phase 2 Implementation Plan: Supabase Singleton Pattern

## 1. Context & Goals
- Multiple Supabase client instances are causing GoTrueClient warnings and undefined behavior.
- Enforce a strict singleton pattern for Supabase in the browser app, aligned with the existing architecture rules:
  - All database calls should go through a single database manager.
  - The database manager should rely on a single Supabase client instance.
- Keep a separate, server-side Supabase client for Netlify Functions.
- Preserve all existing functionality, configuration, and environment-variable patterns.

## 2. Constraints & Non-Goals
- Do **not** change behavior of auth flows, RLS policies, or database schema.
- Do **not** introduce new dependencies.
- Respect existing environment variable patterns:
  - Browser/client code: use the Vite-driven `process.env` pattern via the existing helpers.
  - Netlify Functions: access env via `process.env` or the existing `netlify/functions` env helper.
- Preserve TypeScript strictness (no `any`) and existing privacy-first architecture.

## 3. High-Level Approach
1. **Audit usage** of `@supabase/supabase-js` and `createClient()` across the repo.
2. **Standardize the browser Supabase singleton** in `src/lib/supabase.ts` (or the existing central module).
3. **Refactor all browser-side call sites** to use the singleton instead of local `createClient()` calls.
4. **Handle special environments**: Netlify Functions, tests, and any migration/utility scripts.
5. **Validate** via build, tests, and manual auth-flow checks to ensure no duplicate clients or regressions.

## 4. Detailed Step-by-Step Plan

### 4.1 Audit Existing Supabase Usage
1. Run a global search for Supabase client creation, for example:
   - Search patterns: `createClient(`, `from "@supabase/supabase-js"`, `from '@supabase/supabase-js'`.
2. Build a simple list (in this file or a scratch doc) of all locations, capturing for each:
   - File path
   - Environment: browser, Netlify Function, test, script/migration
   - Pattern: direct `createClient()`, imported client, or wrapper
3. Categorize findings:
   - **Browser app modules** (React components, hooks, client utilities).
   - **Netlify Functions** (server-side only).
   - **Tests** (unit/integration, mocks, helpers).
   - **One-off scripts/migrations** (if any).

### 4.2 Centralize Browser Supabase Client in `src/lib/supabase.ts`
1. Open `src/lib/supabase.ts` (or the current central Supabase file) and review its implementation.
2. Ensure it:
   - Imports `createClient` from `@supabase/supabase-js` once.
   - Uses the correct typed `Database` (if defined in `types/` or similar).
   - Reads environment variables via the approved helper (not `import.meta.env` at module scope).
   - Configures auth persistence and PKCE flow according to current expectations.
3. Refine the file to clearly expose a single browser client instance, e.g.:
   - Exported `supabase` instance.
   - Optional helper(s) that wrap common patterns, but no additional clients.
4. Add clear JSDoc to the module and exported client:
   - Explain that **this is the only browser Supabase client** and must be imported everywhere.
   - Note the architectural rule that all DB access should go through the single database manager that uses this client.

### 4.3 Ensure Database Manager Uses the Singleton
1. Identify the central database manager module (e.g., in `src/lib/` or `src/services/`).
2. Verify that it imports the singleton `supabase` from `src/lib/supabase` and does **not** call `createClient()` itself.
3. If the manager currently creates its own client:
   - Plan a focused refactor (in a later approved step) to inject or import the singleton instead.
   - Confirm with the existing code which methods are public API and ensure behavior remains unchanged.

### 4.4 Refactor Browser Call Sites to Use the Singleton
For each browser-side file that currently creates or imports its own Supabase client:
1. Replace direct `createClient()` usage:
   - Remove `createClient` imports from `@supabase/supabase-js`.
   - Import the singleton: `import { supabase } from "../lib/supabase";` (adjust relative path as needed).
2. Update code to call methods on the shared `supabase` instance.
3. Confirm no file still imports `@supabase/supabase-js` directly for client creation (type-only imports are fine).
4. For any file that previously customized Supabase config (e.g., different URL/key):
   - Document the use case.
   - Decide whether it should instead use the main project client, or whether a truly separate project/client is required.
   - If a separate client is truly necessary, call this out for explicit approval before implementation.

### 4.5 Handle Special Cases

#### 4.5.1 Netlify Functions
1. Keep a dedicated server-side Supabase client module, e.g. `netlify/functions_active/supabase.js`:
   - Pure ESM (`export const handler = ...` in functions, normal `import` syntax).
   - Uses `process.env` for Supabase URL/keys via the existing Netlify env helper where appropriate.
2. Audit all Netlify Functions for `createClient()` calls:
   - Replace any direct `createClient()` usage with imports from `netlify/functions_active/supabase.js`.
   - Ensure no CommonJS patterns remain in `netlify/functions_active/`.
3. Verify that server-side behavior (RLS, service role usage, etc.) is unchanged.

#### 4.5.2 Tests
1. Search test files for Supabase imports and `createClient()` usage.
2. Decide per test category:
   - **Unit tests**: prefer mocking the `supabase` singleton module rather than creating real clients.
   - **Integration/e2e tests**: import the singleton (browser) or the Netlify/server client as appropriate.
3. Update test helpers to:
   - Import from `src/lib/supabase` (or the server client) instead of `@supabase/supabase-js` directly.
   - Provide clear mock factories if needed (e.g., `jest.mock("../lib/supabase")`).

#### 4.5.3 Scripts and Migrations
1. Identify any scripts or migration tools that use Supabase directly.
2. For each:
   - Confirm if it must remain independent (e.g., runs in Node with different credentials).
   - If independence is required, document this as an intentional exception.
   - Otherwise, align it with the server-side Netlify-style client or browser singleton as appropriate.

### 4.6 Validation & Regression Checks
1. **Static checks**:
   - Re-run TypeScript build / Vite build to ensure no missing imports or type errors.
   - Optionally, add a temporary code search check in CI (or a manual audit step) to ensure there are no remaining `createClient(` calls outside the designated modules.
2. **Runtime checks (browser)**:
   - Exercise auth flows (sign up, sign in, sign out, session restore, token refresh).
   - Watch the console for GoTrueClient warnings; confirm they no longer appear.
   - Verify that only one Supabase auth client is active (e.g., via logs or behavior).
3. **Runtime checks (Netlify Functions)**:
   - Hit key endpoints that depend on Supabase (CRUD, auth-related functions, etc.).
   - Confirm expected behavior and absence of new errors related to Supabase.
4. **Tests**:
   - Run relevant unit/integration test suites that touch Supabase.
   - Fix any tests broken solely due to mocking/import changes.

### 4.7 Documentation & Guardrails
1. In `src/lib/supabase.ts`, expand JSDoc to clearly state:
   - This module owns the **only** browser Supabase client.
   - New code should import from here (or from the database manager) rather than creating new clients.
2. Optionally (subject to approval before implementation):
   - Add an ESLint rule or simple lint script to forbid `createClient(` usage outside approved files.
   - Document the singleton pattern and rationale in a short architecture or README section.

## 5. Approval & Execution
- **Current status:** This file is a planning document only; no code changes have been made yet.
- **Next step:** After you review and approve this plan, we can:
  1. Execute the audit (Section 4.1).
  2. Implement the centralized singleton refinements (Section 4.2 and 4.3).
  3. Refactor call sites and special cases (Sections 4.4 and 4.5).
  4. Run validation steps (Section 4.6) and finalize documentation (Section 4.7).

