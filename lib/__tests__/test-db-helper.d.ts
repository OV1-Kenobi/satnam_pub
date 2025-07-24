/**
 * Type declarations for lib/__tests__/test-db-helper.js
 * CRITICAL: Test database helper type definitions
 */

export interface TestDatabase {
  setup(): Promise<void>;
  teardown(): Promise<void>;
  clear(): Promise<void>;
  seed(data: any): Promise<void>;
}

export class TestDbHelper {
  static setup(): Promise<void>;
  static teardown(): Promise<void>;
  static clear(): Promise<void>;
  static seed(data: any): Promise<void>;
  static createMockData(): any;
  static resetDatabase(): Promise<void>;
}

export function createTestDatabase(): TestDatabase;
export function setupTestEnvironment(): Promise<void>;
export function cleanupTestEnvironment(): Promise<void>;
export function createMockData(): any;
export function resetDatabase(): Promise<void>;
