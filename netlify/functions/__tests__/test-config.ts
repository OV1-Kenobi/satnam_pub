// lib/__tests__/test-config.ts
// Re-export from centralized test setup to maintain backward compatibility
export {
  TEST_CONFIG,
  TEST_CONFIG as default,
  getTestSupabaseClient,
} from "./test-setup";
