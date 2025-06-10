import { db } from "../lib";
import { lightning } from "../lib";
import { config } from "../config";

interface LightningAddress {
  id: string;
  username: string;
  userId: string;
  pubkey?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new Lightning address
 */
export async function createLightningAddress(
  username: string,
  userId: string,
  pubkey?: string,
): Promise<LightningAddress> {
  // Validate the username
  if (!username.match(/^[a-zA-Z0-9_-]+$/)) {
    throw new Error(
      "Invalid username format. Use only letters, numbers, underscores, and hyphens.",
    );
  }

  // Check if username is already taken
  const existingAddress = await db.query(
    "SELECT * FROM lightning_addresses WHERE username = $1",
    [username],
  );

  if (existingAddress.rows.length > 0) {
    throw new Error("Lightning address username already taken");
  }

  // Insert new address
  const result = await db.query(
    `INSERT INTO lightning_addresses (username, user_id, pubkey, created_at, updated_at) 
     VALUES ($1, $2, $3, NOW(), NOW()) 
     RETURNING id, username, user_id as "userId", pubkey, created_at as "createdAt", updated_at as "updatedAt"`,
    [username, userId, pubkey ?? null],
  );

  return result.rows[0];
}

/**
 * Get Lightning address by username
 */
export async function getLightningAddressByUsername(
  username: string,
): Promise<LightningAddress | null> {
  const result = await db.query(
    'SELECT id, username, user_id as "userId", pubkey, created_at as "createdAt", updated_at as "updatedAt" FROM lightning_addresses WHERE username = $1',
    [username],
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Get all Lightning addresses for a user
 */
export async function getLightningAddressesByUserId(
  userId: string,
): Promise<LightningAddress[]> {
  const result = await db.query(
    'SELECT id, username, user_id as "userId", pubkey, created_at as "createdAt", updated_at as "updatedAt" FROM lightning_addresses WHERE user_id = $1',
    [userId],
  );

  return result.rows;
}

/**
 * Update a Lightning address
 */
export async function updateLightningAddress(
  id: string,
  data: { pubkey?: string },
): Promise<LightningAddress> {
  const { pubkey } = data;

  // Build update query
  let updateQuery = "UPDATE lightning_addresses SET updated_at = NOW()";
  const queryParams: (string | null)[] = [];
  let paramIndex = 1;

  if (pubkey !== undefined) {
    updateQuery += `, pubkey = $${paramIndex}`;
    queryParams.push(pubkey);
    paramIndex++;
  }

  updateQuery += ` WHERE id = $${paramIndex} RETURNING id, username, user_id as "userId", pubkey, created_at as "createdAt", updated_at as "updatedAt"`;
  queryParams.push(id);

  // Execute update
  const result = await db.query(updateQuery, queryParams);

  if (result.rows.length === 0) {
    throw new Error("Lightning address not found");
  }

  return result.rows[0];
}

/**
 * Delete a Lightning address
 */
export async function deleteLightningAddress(id: string): Promise<void> {
  const result = await db.query(
    "DELETE FROM lightning_addresses WHERE id = $1",
    [id],
  );

  if (result.rowCount === 0) {
    throw new Error("Lightning address not found");
  }
}

/**
 * Format a full Lightning address
 */
export function formatLightningAddress(username: string): string {
  return lightning.generateLightningAddress(username);
}

/**
 * Validate a Lightning address
 */
export function validateLightningAddress(address: string): boolean {
  return lightning.validateLightningAddress(address);
}
