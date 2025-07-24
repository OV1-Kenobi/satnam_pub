
/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = /** @type {Object} */ (import.meta);
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * @fileoverview Test setup utilities for integration tests
 * @description Provides test database client, cleanup functions, and test utilities
 */

import { createClient } from '@supabase/supabase-js';

// Test Supabase client configuration
const TEST_SUPABASE_URL = getEnvVar("VITE_SUPABASE_URL") || 'https://your-test-project.supabase.co';
const TEST_SUPABASE_ANON_KEY = getEnvVar("VITE_SUPABASE_ANON_KEY") || 'your-test-anon-key';

export const getTestSupabaseClient = () => {
  return createClient(TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY);
};

// Global test cleanup function
export const globalTestCleanup = async () => {
  const supabase = getTestSupabaseClient();
  
  // Clean up test data
  try {
    // Clean up test users
    await supabase
      .from('privacy_users')
      .delete()
      .neq('hashed_uuid', 'test-user-hash');
    
    // Clean up test family data
    await supabase
      .from('privacy_family_member_wallets')
      .delete()
      .neq('family_id', 'test-family-id');
    
    // Clean up test payment data
    await supabase
      .from('privacy_family_payment_requests')
      .delete()
      .neq('family_id', 'test-family-id');
    
    console.log('✅ Test cleanup completed');
  } catch (error) {
    console.error('❌ Test cleanup failed:', error);
  }
};

// Test data utilities
export const createTestUser = async (userData: {
  hashed_uuid: string;
  user_salt: string;
  created_at?: string;
}) => {
  const supabase = getTestSupabaseClient();
  
  const { data, error } = await supabase
    .from('privacy_users')
    .insert({
      hashed_uuid: userData.hashed_uuid,
      user_salt: userData.user_salt,
      created_at: userData.created_at || new Date().toISOString()
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const createTestFamilyMember = async (memberData: {
  family_id: string;
  member_hash: string;
  role: string;
  name_hash: string;
}) => {
  const supabase = getTestSupabaseClient();
  
  const { data, error } = await supabase
    .from('privacy_family_member_wallets')
    .insert({
      family_id: memberData.family_id,
      member_hash: memberData.member_hash,
      role: memberData.role,
      name_hash: memberData.name_hash,
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

// Test authentication utilities
export const createTestSession = async (userHash: string) => {
  const supabase = getTestSupabaseClient();
  
  // Set session for testing
  await supabase.auth.setSession({
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token'
  });
  
  // Set current user hash for RLS policies
  await supabase.rpc('set_current_user_hash', { user_hash: userHash });
  
  return { userHash };
};

// Test environment setup
export const setupTestEnvironment = async () => {
  // Ensure test database is ready
  const supabase = getTestSupabaseClient();
  
  try {
    // Test connection
    const { data, error } = await supabase
      .from('privacy_users')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Test database connection failed:', error);
      throw error;
    }
    
    console.log('✅ Test environment ready');
  } catch (error) {
    console.error('❌ Test environment setup failed:', error);
    throw error;
  }
};

// Cleanup after each test
export const cleanupAfterTest = async () => {
  await globalTestCleanup();
};

// Test data constants
export const TEST_USER_HASH = 'test-user-hash-123';
export const TEST_FAMILY_ID = 'test-family-id-123';
export const TEST_MEMBER_HASH = 'test-member-hash-123';
export const TEST_GUARDIAN_HASH = 'test-guardian-hash-123'; 