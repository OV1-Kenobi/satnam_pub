import { Pool } from "pg";
import { config } from "../config";

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
      // Log and rethrow to allow handling at the application level
      throw error;
    }
  },

  /**
   * Get a dedicated database client from the pool
   * @returns Database client (must call client.release() when done)
   */
  getClient: async () => {
    const client = await pool.connect();
    return client;
  },

  /**
   * Gracefully shut down the connection pool
   * Should be called when the application terminates
   */
  end: () => pool.end(),
};
