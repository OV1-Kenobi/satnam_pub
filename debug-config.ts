// Debug script to check config resolution
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

console.log("=== Environment Variables ===");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "NOT SET");
console.log("DATABASE_URL value:", process.env.DATABASE_URL);

// Test URL parsing
if (process.env.DATABASE_URL) {
  try {
    const parsed = new URL(process.env.DATABASE_URL);
    console.log("\n=== Parsed DATABASE_URL ===");
    console.log("Host:", parsed.hostname);
    console.log("Port:", parsed.port);
    console.log("Database:", parsed.pathname.slice(1));
    console.log("User:", parsed.username);
    console.log("Password:", parsed.password ? "SET" : "NOT SET");
    console.log("SSL needed:", parsed.hostname.includes("supabase.co"));
  } catch (error) {
    console.error("Failed to parse DATABASE_URL:", error.message);
  }
}

// Test config import
try {
  const { config } = await import("./config/index.js");
  console.log("\n=== Config Resolution ===");
  console.log("Database config:", {
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password ? "SET" : "NOT SET",
    ssl: config.database.ssl,
  });
} catch (error) {
  console.error("Failed to import config:", error.message);

  // Try importing the root config.ts
  try {
    const { config } = await import("./config.js");
    console.log("\n=== Root Config Resolution ===");
    console.log("Database config:", {
      host: config.database.host,
      port: config.database.port,
      name: config.database.name,
      user: config.database.user,
      password: config.database.password ? "SET" : "NOT SET",
      ssl: config.database.ssl,
    });
  } catch (error2) {
    console.error("Failed to import root config:", error2.message);
  }
}
