/**
 * Centralized environment facade
 * - Re-export clientConfig for browser usage
 * - Provide a safe getter for serverConfig that avoids bundling in browser
 */

export { clientConfig } from "./env.client";

// getServerConfig: returns null in browser; the actual server config should be
// imported directly within Netlify Functions using process.env for correctness.
// This helper is mainly for Node-side scripts/tests within the repo.
export const getServerConfig = () => {
  if (typeof window !== "undefined") return null;
  // Using require here to avoid static ESM linkage in bundlers for browser
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { serverConfig } = require("./env.server");
  return serverConfig;
};

