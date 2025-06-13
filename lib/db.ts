import { Pool, PoolClient } from "pg";
import { config } from "../config";
import * as fs from "fs";
import * as path from "path";

/**
 * PostgreSQL connection pool configuration
 * Manages database connections with appropriate timeouts and SSL settings
 */
const pool = new Pool({
  connectionString: config.database.url,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  ssl: config.database.ssl
    ? {
        rejectUnauthorized: process.env.NODE_ENV === "production",
        ca: process.env.DATABASE_CA_CERT,
      }
    : undefined,
});

// Test the database connection
pool
  .query("SELECT NOW()")
  .then(() => {
    // Connection successful - database is ready
  })
  .catch((err) => {
    console.error("Database connection error:", err);
    process.exit(1); // Exit if database connection fails - critical for application
  });

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
          [file],
        );

        if (rows.length === 0) {
          console.log(`Running migration: ${file}`);
          const migrationSql = fs.readFileSync(
            path.join(migrationsDir, file),
            "utf8",
          );

          await client.query("BEGIN");
          try {
            await client.query(migrationSql);
            await client.query(
              "INSERT INTO migrations (filename) VALUES ($1)",
              [file],
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
        "SELECT filename FROM migrations ORDER BY executed_at",
      );
      return rows.map((row) => row.filename);
    } catch (error) {
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
        ],
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
        [username],
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
      }>,
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
        [id, ...values],
      );
      return result.rows[0];
    },
  },

  /**
   * Family operations
   */
  families: {
    /**
     * Create a new family
     */
    create: async (family: {
      family_name: string;
      domain?: string;
      relay_url?: string;
      federation_id?: string;
    }) => {
      const result = await pool.query(
        `
        INSERT INTO families (family_name, domain, relay_url, federation_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
        [
          family.family_name,
          family.domain,
          family.relay_url,
          family.federation_id,
        ],
      );
      return result.rows[0];
    },

    /**
     * Get family by ID
     */
    getById: async (id: string) => {
      const result = await pool.query("SELECT * FROM families WHERE id = $1", [
        id,
      ]);
      return result.rows[0];
    },

    /**
     * Get family members
     */
    getMembers: async (familyId: string) => {
      const result = await pool.query(
        `
        SELECT p.* FROM profiles p
        WHERE p.family_id = $1
        ORDER BY p.created_at
      `,
        [familyId],
      );
      return result.rows;
    },
  },

  /**
   * Lightning address operations
   */
  lightningAddresses: {
    /**
     * Create lightning address
     */
    create: async (data: {
      user_id: string;
      address: string;
      btcpay_store_id?: string;
      voltage_node_id?: string;
      active?: boolean;
    }) => {
      const result = await pool.query(
        `
        INSERT INTO lightning_addresses (user_id, address, btcpay_store_id, voltage_node_id, active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
        [
          data.user_id,
          data.address,
          data.btcpay_store_id,
          data.voltage_node_id,
          data.active ?? true,
        ],
      );
      return result.rows[0];
    },

    /**
     * Get lightning addresses for user
     */
    getByUserId: async (userId: string) => {
      const result = await pool.query(
        "SELECT * FROM lightning_addresses WHERE user_id = $1 ORDER BY created_at",
        [userId],
      );
      return result.rows;
    },

    /**
     * Get active lightning address for user
     */
    getActiveByUserId: async (userId: string) => {
      const result = await pool.query(
        "SELECT * FROM lightning_addresses WHERE user_id = $1 AND active = true LIMIT 1",
        [userId],
      );
      return result.rows[0];
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
        ],
      );
      return result.rows[0];
    },

    /**
     * Get backups for user
     */
    getByUserId: async (userId: string) => {
      const result = await pool.query(
        "SELECT * FROM nostr_backups WHERE user_id = $1 ORDER BY created_at DESC",
        [userId],
      );
      return result.rows;
    },

    /**
     * Get latest backup for user
     */
    getLatestByUserId: async (userId: string) => {
      const result = await pool.query(
        "SELECT * FROM nostr_backups WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
        [userId],
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
    params?: (string | number | boolean | null)[],
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
    callback: (client: PoolClient) => Promise<T>,
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
