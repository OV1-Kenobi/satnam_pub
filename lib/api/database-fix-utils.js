/**
 * Database Pattern Fix Utilities
 * MASTER CONTEXT COMPLIANCE: Browser-only serverless architecture with privacy-first principles
 * Converted from TypeScript to JavaScript with comprehensive JSDoc
 */

/**
 * Environment variable getter with browser compatibility
 * @param {string} key - Environment variable key
 * @param {string} [defaultValue] - Default value if not found
 * @returns {string} Environment variable value
 */
function getEnvVar(key, defaultValue = '') {
  // Primary: import.meta.env for Vite/browser environments
  if (typeof window !== 'undefined' && window.import && window.import.meta && window.import.meta.env) {
    return window.import.meta.env[key] || defaultValue;
  }
  // Secondary: process.env for Node.js environments
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue;
  }
  return defaultValue;
}

/**
 * @typedef {import('@supabase/supabase-js').SupabaseClient} SupabaseClient
 */

/**
 * @typedef {Object} DatabaseResult
 * @property {boolean} success - Whether the operation was successful
 * @property {any} [data] - Result data if successful
 * @property {string} [error] - Error message if failed
 * @property {number} [count] - Number of affected rows
 */

/**
 * @typedef {Object} QueryOptions
 * @property {string} [select] - Columns to select
 * @property {Object} [filters] - Filter conditions
 * @property {string} [orderBy] - Order by column
 * @property {boolean} [ascending] - Sort order
 * @property {number} [limit] - Limit number of results
 * @property {number} [offset] - Offset for pagination
 */

/**
 * Standard helper to get Supabase client
 * This replaces all `db.query()` patterns with proper Supabase calls
 * Uses the singleton client from src/lib/supabase.js
 * @returns {Promise<SupabaseClient>} Supabase client instance
 */
export async function getSupabaseClient() {
  // Use the singleton client instead of creating a new one
  const { supabase } = await import("../../src/lib/supabase.js");
  return supabase;
}

/**
 * Generate a privacy-preserving hash using Web Crypto API
 * @param {string} data - Data to hash
 * @param {string} [salt] - Optional salt
 * @returns {Promise<string>} Hashed data
 */
async function generatePrivacyHash(data, salt = '') {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const dataToHash = encoder.encode(data + salt);
    const hash = await crypto.subtle.digest('SHA-256', dataToHash);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Fallback for environments without Web Crypto API
    let hash = 0;
    const str = data + salt;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Common database operation patterns that replace db.query()
 */
export const dbPatterns = {
  /**
   * INSERT operation
   * Replaces: db.query('INSERT INTO table (col1, col2) VALUES ($1, $2)', [val1, val2])
   * With: client.from('table').insert({ col1: val1, col2: val2 })
   * @param {SupabaseClient} client - Supabase client
   * @param {string} table - Table name
   * @param {Object|Object[]} data - Data to insert
   * @returns {Promise<DatabaseResult>} Insert result
   */
  insert: async (client, table, data) => {
    try {
      const { data: result, error } = await client
        .from(table)
        .insert(data)
        .select();

      if (error) {
        console.error(`Insert error in ${table}:`, error);
        return { success: false, error: error.message };
      }

      return { success: true, data: result };
    } catch (error) {
      console.error(`Insert exception in ${table}:`, error);
      return { success: false, error: error.message };
    }
  },

  /**
   * SELECT operation
   * Replaces: db.query('SELECT * FROM table WHERE col = $1', [value])
   * With: client.from('table').select('*').eq('col', value)
   * @param {SupabaseClient} client - Supabase client
   * @param {string} table - Table name
   * @param {QueryOptions} [options] - Query options
   * @returns {Promise<DatabaseResult>} Select result
   */
  select: async (client, table, options = {}) => {
    try {
      let query = client.from(table).select(options.select || '*');

      // Apply filters
      if (options.filters) {
        for (const [column, value] of Object.entries(options.filters)) {
          if (Array.isArray(value)) {
            query = query.in(column, value);
          } else if (value === null) {
            query = query.is(column, null);
          } else {
            query = query.eq(column, value);
          }
        }
      }

      // Apply ordering
      if (options.orderBy) {
        query = query.order(options.orderBy, { ascending: options.ascending !== false });
      }

      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error(`Select error in ${table}:`, error);
        return { success: false, error: error.message };
      }

      return { success: true, data, count };
    } catch (error) {
      console.error(`Select exception in ${table}:`, error);
      return { success: false, error: error.message };
    }
  },

  /**
   * UPDATE operation
   * Replaces: db.query('UPDATE table SET col1 = $1 WHERE col2 = $2', [val1, val2])
   * With: client.from('table').update({ col1: val1 }).eq('col2', val2)
   * @param {SupabaseClient} client - Supabase client
   * @param {string} table - Table name
   * @param {Object} updates - Data to update
   * @param {Object} filters - Filter conditions
   * @returns {Promise<DatabaseResult>} Update result
   */
  update: async (client, table, updates, filters) => {
    try {
      let query = client.from(table).update(updates);

      // Apply filters
      for (const [column, value] of Object.entries(filters)) {
        if (Array.isArray(value)) {
          query = query.in(column, value);
        } else if (value === null) {
          query = query.is(column, null);
        } else {
          query = query.eq(column, value);
        }
      }

      const { data, error } = await query.select();

      if (error) {
        console.error(`Update error in ${table}:`, error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error(`Update exception in ${table}:`, error);
      return { success: false, error: error.message };
    }
  },

  /**
   * DELETE operation
   * Replaces: db.query('DELETE FROM table WHERE col = $1', [value])
   * With: client.from('table').delete().eq('col', value)
   * @param {SupabaseClient} client - Supabase client
   * @param {string} table - Table name
   * @param {Object} filters - Filter conditions
   * @returns {Promise<DatabaseResult>} Delete result
   */
  delete: async (client, table, filters) => {
    try {
      let query = client.from(table).delete();

      // Apply filters
      for (const [column, value] of Object.entries(filters)) {
        if (Array.isArray(value)) {
          query = query.in(column, value);
        } else if (value === null) {
          query = query.is(column, null);
        } else {
          query = query.eq(column, value);
        }
      }

      const { data, error } = await query.select();

      if (error) {
        console.error(`Delete error in ${table}:`, error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error(`Delete exception in ${table}:`, error);
      return { success: false, error: error.message };
    }
  },

  /**
   * UPSERT operation
   * Replaces complex INSERT ... ON CONFLICT patterns
   * With: client.from('table').upsert(data)
   * @param {SupabaseClient} client - Supabase client
   * @param {string} table - Table name
   * @param {Object|Object[]} data - Data to upsert
   * @param {Object} [options] - Upsert options
   * @returns {Promise<DatabaseResult>} Upsert result
   */
  upsert: async (client, table, data, options = {}) => {
    try {
      const { data: result, error } = await client
        .from(table)
        .upsert(data, options)
        .select();

      if (error) {
        console.error(`Upsert error in ${table}:`, error);
        return { success: false, error: error.message };
      }

      return { success: true, data: result };
    } catch (error) {
      console.error(`Upsert exception in ${table}:`, error);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Privacy-first database utilities
 */
export const privacyDbUtils = {
  /**
   * Create privacy-safe user record with hashed identifiers
   * @param {SupabaseClient} client - Supabase client
   * @param {Object} userData - User data to store
   * @returns {Promise<DatabaseResult>} Creation result
   */
  createPrivacyUser: async (client, userData) => {
    try {
      // Generate privacy-safe hashed user ID
      const hashedUserId = await generatePrivacyHash(
        userData.identifier + Date.now()
      );

      const privacyUserData = {
        hashed_user_id: hashedUserId,
        ...userData,
        created_at: new Date().toISOString()
      };

      return await dbPatterns.insert(client, 'user_identities', privacyUserData);
    } catch (error) {
      console.error('Error creating privacy user:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Query user by privacy-safe identifier
   * @param {SupabaseClient} client - Supabase client
   * @param {string} identifier - User identifier to hash and query
   * @returns {Promise<DatabaseResult>} Query result
   */
  queryPrivacyUser: async (client, identifier) => {
    try {
      // Hash the identifier for privacy-safe querying
      const hashedId = await generatePrivacyHash(identifier);
      
      return await dbPatterns.select(client, 'user_identities', {
        filters: { hashed_user_id: hashedId }
      });
    } catch (error) {
      console.error('Error querying privacy user:', error);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Migration utilities for database pattern fixes
 */
export const migrationUtils = {
  /**
   * Migrate from raw SQL queries to Supabase patterns
   * @param {string} tableName - Table to migrate
   * @param {Function} migrationFn - Migration function
   * @returns {Promise<DatabaseResult>} Migration result
   */
  migrateTable: async (tableName, migrationFn) => {
    try {
      const client = await getSupabaseClient();
      const result = await migrationFn(client, dbPatterns);
      
      console.log(`Migration completed for table: ${tableName}`);
      return { success: true, data: result };
    } catch (error) {
      console.error(`Migration failed for table ${tableName}:`, error);
      return { success: false, error: error.message };
    }
  }
};

// Export utility functions
export { generatePrivacyHash };
