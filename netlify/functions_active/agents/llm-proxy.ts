/**
 * Netlify Function wrapper (Phase 5 hardening)
 *
 * Netlify deploys functions from netlify/functions_active (see netlify.toml).
 * The implementation lives in netlify/functions/agent-llm-proxy.ts.
 *
 * This wrapper ensures the endpoint name is `agents-llm-proxy`, which is mapped
 * from /api/agents/llm-proxy via netlify.toml redirects.
 */

export { handler } from "../../functions/agent-llm-proxy.ts";
