/**
 * Netlify Function wrapper (Phase 5 hardening)
 *
 * Netlify deploys functions from netlify/functions_active (see netlify.toml).
 * The implementation lives in netlify/functions/agents/performance-report.ts.
 *
 * This wrapper ensures the endpoint name is `agents-performance-report`, which is
 * mapped from /api/agents/performance-report via netlify.toml redirects.
 */

export { handler } from "../../functions/agents/performance-report.ts";
