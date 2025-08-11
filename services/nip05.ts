import { db } from "../lib";

interface Nip05Record {
  id: string;
  name: string;
  pubkey: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new NIP-05 verification record
 */
export async function createNip05Record(
  name: string,
  pubkey: string,
  userId: string
): Promise<Nip05Record> {
  try {
    // Insert new record directly, relying on DB uniqueness constraint
    const result = await db.query(
      `INSERT INTO nip05_records (name, pubkey, user_id, created_at, updated_at) 
       VALUES ($1, $2, $3, NOW(), NOW()) 
       RETURNING id, name, pubkey, user_id as "userId", created_at as "createdAt", updated_at as "updatedAt"`,
      [name, pubkey, userId]
    );

    return result.rows[0];
  } catch (err) {
    // Handle unique constraint violation (PostgreSQL error code 23505)
    if (err instanceof Error && "code" in err && err.code === "23505") {
      throw new Error("NIP-05 name already taken");
    }
    throw err;
  }
}

/**
 * Get NIP-05 verification record by name (Privacy-First)
 */
export async function getNip05RecordByName(
  name: string
): Promise<Nip05Record | null> {
  const result = await db.query(
    'SELECT id, name, pubkey, name_duid, pubkey_duid, domain, is_active, created_at as "createdAt", updated_at as "updatedAt" FROM nip05_records WHERE name = $1 AND is_active = true',
    [name]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Get NIP-05 verification record by DUID (Privacy-First)
 */
export async function getNip05RecordByDuid(
  nameDuid: string
): Promise<Nip05Record | null> {
  const result = await db.query(
    'SELECT id, name, pubkey, name_duid, pubkey_duid, domain, is_active, created_at as "createdAt", updated_at as "updatedAt" FROM nip05_records WHERE name_duid = $1 AND is_active = true',
    [nameDuid]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Get all NIP-05 verification records for a domain (Privacy-First)
 */
export async function getNip05RecordsByDomain(
  domain: string = "satnam.pub"
): Promise<Nip05Record[]> {
  const result = await db.query(
    'SELECT id, name, pubkey, name_duid, pubkey_duid, domain, is_active, created_at as "createdAt", updated_at as "updatedAt" FROM nip05_records WHERE domain = $1 AND is_active = true',
    [domain]
  );

  return result.rows;
}

/**
 * Update a NIP-05 verification record
 */
export async function updateNip05Record(
  id: string,
  data: { name?: string; pubkey?: string }
): Promise<Nip05Record> {
  const { name, pubkey } = data;

  // Build update query
  let updateQuery = "UPDATE nip05_records SET updated_at = NOW()";
  const queryParams: string[] = [];
  let paramIndex = 1;

  if (name) {
    updateQuery += `, name = $${paramIndex}`;
    queryParams.push(name);
    paramIndex++;
  }

  if (pubkey) {
    updateQuery += `, pubkey = $${paramIndex}`;
    queryParams.push(pubkey);
    paramIndex++;
  }

  updateQuery += ` WHERE id = $${paramIndex} RETURNING id, name, pubkey, user_id as "userId", created_at as "createdAt", updated_at as "updatedAt"`;
  queryParams.push(id);

  try {
    // Execute update, relying on DB uniqueness constraint
    const result = await db.query(updateQuery, queryParams);

    if (result.rows.length === 0) {
      throw new Error("NIP-05 record not found");
    }

    return result.rows[0];
  } catch (err) {
    // Handle unique constraint violation (PostgreSQL error code 23505)
    if (err instanceof Error && "code" in err && err.code === "23505") {
      throw new Error("NIP-05 name already taken");
    }
    throw err;
  }
}

/**
 * Delete a NIP-05 verification record
 */
export async function deleteNip05Record(id: string): Promise<void> {
  const result = await db.query("DELETE FROM nip05_records WHERE id = $1", [
    id,
  ]);

  if (result.rowCount === 0) {
    throw new Error("NIP-05 record not found");
  }
}

/**
 * Generate NIP-05 verification JSON for the domain (Privacy-First)
 * This is the JSON that will be served at /.well-known/nostr.json
 */
export async function generateNip05Json(): Promise<{
  names: Record<string, string>;
}> {
  const result = await db.query(
    "SELECT name, pubkey FROM nip05_records WHERE is_active = true",
    []
  );

  const names: Record<string, string> = {};

  for (const record of result.rows) {
    names[record.name] = record.pubkey;
  }

  return {
    names,
  };
}
