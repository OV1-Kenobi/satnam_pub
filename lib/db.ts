import { Pool } from "pg";
import { config } from "../config";

// Create a PostgreSQL connection pool
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
    console.log("Database connection successful");
  })
  .catch((err) => {
    console.error("Database connection error:", err);
    process.exit(1); // Exit if database connection fails
  });

export default {
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
  getClient: async () => {
    const client = await pool.connect();
    // Remember to call client.release() when done
    return client;
  },
  end: () => pool.end(), // Graceful shutdown method
};
