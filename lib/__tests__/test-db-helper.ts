// lib/__tests__/test-db-helper.ts
import { supabase } from "../supabase";
import { TEST_CONFIG } from "./test-setup";

// Use the main supabase client for tests since database is functional
export const testSupabase = supabase;

export class TestDbHelper {
  static testUserIds: string[] = [];

  /**
   * Create a test user with encrypted nsec
   */
  static async createTestUser(
    userId: string,
    encryptedNsec: string
  ): Promise<void> {
    const { error } = await testSupabase.from("encrypted_keys").insert({
      user_id: userId,
      encrypted_nsec: encryptedNsec,
      salt: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to create test user: ${error.message}`);
    }

    this.testUserIds.push(userId);
  }

  /**
   * Clean up test data
   */
  static async cleanupTestData(): Promise<void> {
    if (!TEST_CONFIG.CLEANUP_AFTER_TESTS) return;

    // Clean up test users
    if (this.testUserIds.length > 0) {
      const { error } = await testSupabase
        .from("encrypted_keys")
        .delete()
        .in("user_id", this.testUserIds);

      if (error) {
        console.error("Failed to cleanup test data:", error);
      }
    }

    // Clean up any remaining test data (users with test prefix)
    await testSupabase
      .from("encrypted_keys")
      .delete()
      .like("user_id", "test-user-%");

    this.testUserIds = [];
  }

  /**
   * Get test user data
   */
  static async getTestUser(userId: string): Promise<any> {
    const { data, error } = await testSupabase
      .from("encrypted_keys")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      throw new Error(`Failed to get test user: ${error.message}`);
    }

    return data;
  }

  /**
   * Check if database connection is working
   */
  static async checkConnection(): Promise<boolean> {
    try {
      const { data, error } = await testSupabase
        .from("encrypted_keys")
        .select("count(*)")
        .limit(1);

      return !error;
    } catch (error) {
      console.error("Database connection test failed:", error);
      return false;
    }
  }

  /**
   * Generate unique test user ID
   */
  static generateTestUserId(): string {
    return `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
