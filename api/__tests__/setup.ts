import { vi } from "vitest";

// Mock environment variables
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-key";
process.env.LIGHTNING_NODE_URL = "http://localhost:10009";
process.env.PHOENIXD_URL = "http://localhost:9740";
process.env.FEDIMINT_GATEWAY_URL = "http://localhost:8080";

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
};

// Mock fetch for API calls
global.fetch = vi.fn();

// Mock setTimeout and setInterval for async operations
vi.stubGlobal(
  "setTimeout",
  vi.fn((fn) => fn())
);
vi.stubGlobal("setInterval", vi.fn());
vi.stubGlobal("clearInterval", vi.fn());
