import { getEnvVar } from "./utils/env.js";

import * as fs from "fs";
import * as path from "path";
import { Pool, PoolClient } from "pg";
import { config } from "../config";
import { supabase } from "./supabase";

/**
 * PostgreSQL connection pool configuration
 * Manages database connections with appropriate timeouts and SSL settings
 * For Supabase deployment, this uses the Supabase PostgreSQL connection
 */
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
  statement_timeout: 30000, // 30 second statement timeout
  query_timeout: 30000, // 30 second query timeout
  ssl: config.database.ssl
    ? {
        rejectUnauthorized: false, // Supabase uses valid certificates but this helps with connection issues
        ca: getEnvVar("DATABASE_CA_CERT"),
      }
    : undefined,
});

// Test the database connection - prefer Supabase client for deployment
async function testDatabaseConnection() {
  try {
    // First try Supabase client (preferred for deployment)
    if (config.supabase.url && config.supabase.anonKey) {
      console.log("🔍 Testing Supabase connection...");
      console.log("Supabase URL:", config.supabase.url ? "SET" : "NOT SET");
      console.log(
        "Supabase Anon Key:",
        config.supabase.anonKey ? "SET" : "NOT SET"
      );

      const { error } = await supabase
        .from("profiles")
        .select("count", { count: "exact", head: true });

      if (!error) {
        console.log("✅ Supabase database connection established");
        return;
      } else {
        console.warn("⚠️  Supabase connection test failed:", error.message);
        console.warn("Trying direct PostgreSQL connection...");
      }
    } else {
      console.warn(
        "⚠️  Supabase credentials not available, trying PostgreSQL..."
      );
    }

    // Fallback to direct PostgreSQL connection
    console.log("🔍 Testing PostgreSQL connection...");
    console.log("Database config:", {
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      ssl: config.database.ssl,
    });

    await pool.query("SELECT NOW()");
    console.log("✅ PostgreSQL database connection established");
  } catch (err) {
    console.error("Database connection error:", err);
    if (getEnvVar("NODE_ENV") === "production") {
      console.error(
        "❌ Database connection failed in production - this is critical"
      );
      // Don't exit in production, let the app start but log the error
      console.error("⚠️  Some database features may not work properly");
    } else {
      console.warn(
        "⚠️  Running in development mode without database - some features may not work"
      );
    }
  }
}

// Initialize database connection test
testDatabaseConnection();

/**
 * Database migration utilities
 */
const migrations = {
  /**
   * Run all pending migrations
   * @returns Promise<void>
   */
  runMigrations: async (): Promise<void> => {
    const client = await pool.connect();
    try {
      // Create migrations table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) UNIQUE NOT NULL,
          executed_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Get migrations directory
      const migrationsDir = path.join(__dirname, "migrations");

      if (!fs.existsSync(migrationsDir)) {
        console.log("No migrations directory found");
        return;
      }

      const migrationFiles = fs
        .readdirSync(migrationsDir)
        .filter((file) => file.endsWith(".sql"))
        .sort();

      for (const file of migrationFiles) {
        const { rows } = await client.query(
          "SELECT filename FROM migrations WHERE filename = $1",
          [file]
        );

        if (rows.length === 0) {
          console.log(`Running migration: ${file}`);
          const migrationSql = fs.readFileSync(
            path.join(migrationsDir, file),
            "utf8"
          );

          await client.query("BEGIN");
          try {
            await client.query(migrationSql);
            await client.query(
              "INSERT INTO migrations (filename) VALUES ($1)",
              [file]
            );
            await client.query("COMMIT");
            console.log(`✓ Migration ${file} completed`);
          } catch (error) {
            await client.query("ROLLBACK");
            throw new Error(`Migration ${file} failed: ${error}`);
          }
        }
      }
    } finally {
      client.release();
    }
  },

  /**
   * Get list of executed migrations
   * @returns Promise<string[]>
   */
  getExecutedMigrations: async (): Promise<string[]> => {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        "SELECT filename FROM migrations ORDER BY executed_at"
      );
      return rows.map((row) => row.filename);
    } catch {
      // If migrations table doesn't exist, return empty array
      return [];
    } finally {
      client.release();
    }
  },
};

/**
 * Database models for identity forge schema
 */
const models = {
  /**
   * Profile operations
   */
  profiles: {
    /**
     * Create a new profile
     */
    create: async (profile: {
      id: string;
      username: string;
      npub: string;
      nip05?: string;
      lightning_address?: string;
      family_id?: string;
    }) => {
      const result = await pool.query(
        `
        INSERT INTO profiles (id, username, npub, nip05, lightning_address, family_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
        [
          profile.id,
          profile.username,
          profile.npub,
          profile.nip05,
          profile.lightning_address,
          profile.family_id,
        ]
      );
      return result.rows[0];
    },

    /**
     * Get profile by ID
     */
    getById: async (id: string) => {
      const result = await pool.query("SELECT * FROM profiles WHERE id = $1", [
        id,
      ]);
      return result.rows[0];
    },

    /**
     * Get profile by username
     */
    getByUsername: async (username: string) => {
      const result = await pool.query(
        "SELECT * FROM profiles WHERE username = $1",
        [username]
      );
      return result.rows[0];
    },

    /**
     * Update profile
     */
    update: async (
      id: string,
      updates: Partial<{
        username: string;
        npub: string;
        nip05: string;
        lightning_address: string;
        family_id: string;
      }>
    ) => {
      const fields = Object.keys(updates);
      const values = Object.values(updates);
      const setClause = fields
        .map((field, index) => `${field} = $${index + 2}`)
        .join(", ");

      const result = await pool.query(
        `
        UPDATE profiles SET ${setClause}
        WHERE id = $1
        RETURNING *
      `,
        [id, ...values]
      );
      return result.rows[0];
    },
  },

  /**
   * User Identity operations (Privacy-First)
   */
  userIdentities: {
    /**
     * Create a new user identity
     */
    create: async (userData: {
      id: string; // DUID
      user_salt: string;
      hashed_username: string;
      hashed_npub: string;
      password_hash: string;
      password_salt: string;
      role?: string;
      family_federation_id?: string;
    }) => {
      const result = await pool.query(
        `
        INSERT INTO user_identities (
          id, user_salt, hashed_username, hashed_npub, 
          password_hash, password_salt, role, family_federation_id,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *
      `,
        [
          userData.id,
          userData.user_salt,
          userData.hashed_username,
          userData.hashed_npub,
          userData.password_hash,
          userData.password_salt,
          userData.role || "private",
          userData.family_federation_id,
        ]
      );
      return result.rows[0];
    },

    /**
     * Get user identity by DUID
     */
    getByDuid: async (userDuid: string) => {
      const result = await pool.query(
        "SELECT * FROM user_identities WHERE id = $1 AND is_active = true",
        [userDuid]
      );
      return result.rows[0];
    },

    /**
     * Get user identity by hashed npub
     */
    getByHashedNpub: async (hashedNpub: string) => {
      const result = await pool.query(
        "SELECT * FROM user_identities WHERE hashed_npub = $1 AND is_active = true",
        [hashedNpub]
      );
      return result.rows[0];
    },
  },

  /**
   * Family Federation operations (Privacy-First)
   */
  familyFederations: {
    /**
     * Create a new family federation
     */
    create: async (federation: {
      federation_name: string;
      domain?: string;
      relay_url?: string;
      federation_duid: string;
    }) => {
      const result = await pool.query(
        `
        INSERT INTO family_federations (federation_name, domain, relay_url, federation_duid)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
        [
          federation.federation_name,
          federation.domain || "satnam.pub",
          federation.relay_url,
          federation.federation_duid,
        ]
      );
      return result.rows[0];
    },

    /**
     * Get family federation by ID
     */
    getById: async (id: string) => {
      const result = await pool.query(
        "SELECT * FROM family_federations WHERE id = $1",
        [id]
      );
      return result.rows[0];
    },

    /**
     * Get family federation by DUID
     */
    getByDuid: async (federationDuid: string) => {
      const result = await pool.query(
        "SELECT * FROM family_federations WHERE federation_duid = $1",
        [federationDuid]
      );
      return result.rows[0];
    },

    /**
     * Get family federation members (Privacy-First)
     */
    getMembers: async (familyFederationId: string) => {
      const result = await pool.query(
        `
        SELECT fm.*, ui.hashed_username, ui.role as user_role
        FROM family_members fm
        JOIN user_identities ui ON fm.user_duid = ui.id
        WHERE fm.family_federation_id = $1 AND fm.is_active = true
        ORDER BY fm.created_at
      `,
        [familyFederationId]
      );
      return result.rows;
    },

    /**
     * Get members by role for voting calculations
     */
    getMembersByRole: async (familyFederationId: string, role: string) => {
      const result = await pool.query(
        `
        SELECT fm.*
        FROM family_members fm
        WHERE fm.family_federation_id = $1 
          AND fm.family_role = $2 
          AND fm.is_active = true
        ORDER BY fm.voting_power DESC
      `,
        [familyFederationId, role]
      );
      return result.rows;
    },
  },

  /**
   * Lightning address operations (Privacy-First - stored in user_identities)
   */
  lightningAddresses: {
    /**
     * Update hashed lightning address in user identity
     */
    updateHashedAddress: async (data: {
      user_duid: string;
      hashed_lightning_address: string;
      encrypted_config?: object;
    }) => {
      // Update privacy settings with Lightning config
      const privacyUpdate = data.encrypted_config
        ? { lightning_config: data.encrypted_config }
        : {};

      const result = await pool.query(
        `
        UPDATE user_identities 
        SET hashed_lightning_address = $2, 
            privacy_settings = privacy_settings || $3::jsonb,
            updated_at = NOW()
        WHERE id = $1 AND is_active = true
        RETURNING id, hashed_lightning_address, privacy_settings
      `,
        [
          data.user_duid,
          data.hashed_lightning_address,
          JSON.stringify(privacyUpdate),
        ]
      );
      return result.rows[0];
    },

    /**
     * Get hashed lightning address for user by DUID
     */
    getByUserDuid: async (userDuid: string) => {
      const result = await pool.query(
        "SELECT id, hashed_lightning_address, privacy_settings FROM user_identities WHERE id = $1 AND is_active = true AND hashed_lightning_address IS NOT NULL",
        [userDuid]
      );
      return result.rows[0];
    },

    /**
     * Get Lightning configuration from privacy settings
     */
    getLightningConfig: async (userDuid: string) => {
      const result = await pool.query(
        "SELECT privacy_settings->'lightning_config' as lightning_config FROM user_identities WHERE id = $1 AND is_active = true",
        [userDuid]
      );
      return result.rows[0]?.lightning_config || null;
    },
  },

  /**
   * Nostr backup operations
   */
  nostrBackups: {
    /**
     * Create backup reference
     */
    create: async (data: {
      user_id: string;
      event_id: string;
      relay_url?: string;
      backup_hash?: string;
    }) => {
      const result = await pool.query(
        `
        INSERT INTO nostr_backups (user_id, event_id, relay_url, backup_hash)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
        [
          data.user_id,
          data.event_id,
          data.relay_url || "wss://relay.citadel.academy",
          data.backup_hash,
        ]
      );
      return result.rows[0];
    },

    /**
     * Get backups for user
     */
    getByUserId: async (userId: string) => {
      const result = await pool.query(
        "SELECT * FROM nostr_backups WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
      );
      return result.rows;
    },

    /**
     * Get latest backup for user
     */
    getLatestByUserId: async (userId: string) => {
      const result = await pool.query(
        "SELECT * FROM nostr_backups WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
        [userId]
      );
      return result.rows[0];
    },
  },

  /**
   * Course Credits and Educational Invitations operations
   * These are EDUCATIONAL COURSE CREDITS, not monetary credits
   *
   * PRIVACY-FIRST PROTOCOLS:
   * - Uses only hashed user IDs (NO pubkeys/npubs stored)
   * - All operations use privacy-safe identifiers
   * - Sensitive data encrypted with user keys only
   */
  courseCredits: {
    /**
     * Get user's course credits balance (privacy-safe)
     */
    getUserCredits: async (hashedUserId: string) => {
      const result = await pool.query(
        "SELECT hashed_user_id, total_credits, last_updated FROM authenticated_user_credits WHERE hashed_user_id = $1",
        [hashedUserId]
      );
      return result.rows[0];
    },

    /**
     * Award course credits to user
     */
    awardCredits: async (hashedUserId: string, creditsToAdd: number) => {
      const result = await pool.query(
        `
        INSERT INTO authenticated_user_credits (hashed_user_id, total_credits)
        VALUES ($1, $2)
        ON CONFLICT (hashed_user_id) 
        DO UPDATE SET 
          total_credits = authenticated_user_credits.total_credits + $2,
          last_updated = NOW()
        RETURNING *
      `,
        [hashedUserId, creditsToAdd]
      );
      return result.rows[0];
    },

    /**
     * Get user's educational referral statistics
     */
    getUserReferralStats: async (hashedUserId: string) => {
      const result = await pool.query(
        `
        SELECT 
          COUNT(*) as total_referrals,
          SUM(CASE WHEN api.used = true THEN 1 ELSE 0 END) as completed_referrals,
          SUM(CASE WHEN api.used = false AND api.expires_at > NOW() THEN 1 ELSE 0 END) as pending_referrals,
          SUM(CASE WHEN api.used = true THEN re.credits_amount ELSE 0 END) as total_course_credits_earned,
          SUM(CASE WHEN api.used = false AND api.expires_at > NOW() THEN api.course_credits ELSE 0 END) as pending_course_credits
        FROM authenticated_peer_invitations api
        LEFT JOIN authenticated_referral_events re ON api.invite_token = re.invite_token
        WHERE api.hashed_inviter_id = $1
      `,
        [hashedUserId]
      );
      return result.rows[0];
    },

    /**
     * Get user's course credit activity history
     */
    getUserCreditHistory: async (hashedUserId: string) => {
      const result = await pool.query(
        `
        SELECT 
          re.id,
          re.credits_amount,
          re.event_type,
          re.metadata,
          re.created_at,
          api.invitation_data,
          CASE 
            WHEN re.event_type = 'authenticated_referral' THEN 'earned'
            WHEN re.event_type = 'bonus_award' THEN 'bonus'
            ELSE 'other'
          END as activity_type,
          CASE 
            WHEN re.event_type = 'authenticated_referral' THEN 'Referral completed - Friend joined'
            WHEN re.event_type = 'bonus_award' THEN 'Bonus award'
            ELSE 'Course activity'
          END as description
        FROM authenticated_referral_events re
        LEFT JOIN authenticated_peer_invitations api ON re.invite_token = api.invite_token
        WHERE re.hashed_inviter_id = $1 OR re.hashed_invitee_id = $1
        ORDER BY re.created_at DESC
        LIMIT 50
      `,
        [hashedUserId]
      );
      return result.rows;
    },
  },

  /**
   * Educational Invitations operations
   */
  educationalInvitations: {
    /**
     * Create new educational invitation
     */
    create: async (data: {
      inviteToken: string;
      hashedInviteId: string;
      hashedInviterId: string;
      invitationData: any;
      courseCredits: number;
      expiresAt: Date;
    }) => {
      const result = await pool.query(
        `
        INSERT INTO authenticated_peer_invitations 
        (invite_token, hashed_invite_id, hashed_inviter_id, invitation_data, course_credits, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
        [
          data.inviteToken,
          data.hashedInviteId,
          data.hashedInviterId,
          data.invitationData,
          data.courseCredits,
          data.expiresAt,
        ]
      );
      return result.rows[0];
    },

    /**
     * Get invitation by token
     */
    getByToken: async (inviteToken: string) => {
      const result = await pool.query(
        "SELECT * FROM authenticated_peer_invitations WHERE invite_token = $1",
        [inviteToken]
      );
      return result.rows[0];
    },

    /**
     * Mark invitation as used and award course credits
     */
    markAsUsed: async (inviteToken: string, hashedUsedById: string) => {
      const result = await pool.query(
        `
        UPDATE authenticated_peer_invitations 
        SET used = true, hashed_used_by_id = $2, used_at = NOW()
        WHERE invite_token = $1 AND used = false AND expires_at > NOW()
        RETURNING *
      `,
        [inviteToken, hashedUsedById]
      );
      return result.rows[0];
    },
  },
};

/**
 * Database interface with error handling
 */
export default {
  /**
   * Execute a parameterized SQL query
   * @param text SQL query text
   * @param params Query parameters (strings, numbers, booleans, or null)
   * @returns Query result
   */
  query: async (
    text: string,
    params?: (string | number | boolean | null)[]
  ) => {
    try {
      return await pool.query(text, params);
    } catch (error) {
      console.error("Database query error:", error);
      throw error;
    }
  },

  /**
   * Get a dedicated database client from the pool
   * @returns Database client (must call client.release() when done)
   */
  getClient: async (): Promise<PoolClient> => {
    const client = await pool.connect();
    return client;
  },

  /**
   * Transaction helper
   * @param callback Function to execute within transaction
   * @returns Promise with callback result
   */
  transaction: async <T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Gracefully shut down the connection pool
   * Should be called when the application terminates
   */
  end: () => pool.end(),

  // Export migration utilities
  migrations,

  // Export database models
  models,
};
