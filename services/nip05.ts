import { db } from "../lib";

interface Nip05Record {
  id: string;
  name: string;
  pubkey: string;
  user_duid?: string;
  pubkey_duid?: string;
  domain: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Create a new NIP-05 verification record
 */
export async function createNip05Record(
  name: string,
  pubkey: string,
  userDuid?: string,
  domain: string = "satnam.pub"
): Promise<Nip05Record> {
  try {
    const client = await db.getClient();
    const { data, error } = await client
      .from("nip05_records")
      .insert({
        name,
        pubkey,
        user_duid: userDuid,
        domain,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === "23505") {
        throw new Error("NIP-05 name already taken");
      }
      throw error;
    }

    return data as Nip05Record;
  } catch (err) {
    if (err instanceof Error && err.message === "NIP-05 name already taken") {
      throw err;
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
  const client = await db.getClient();
  const { data, error } = await client
    .from("nip05_records")
    .select("*")
    .eq("name", name)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Nip05Record;
}

/**
 * Get NIP-05 verification record by DUID (Privacy-First)
 */
export async function getNip05RecordByDuid(
  userDuid: string
): Promise<Nip05Record | null> {
  const client = await db.getClient();
  const { data, error } = await client
    .from("nip05_records")
    .select("*")
    .eq("user_duid", userDuid)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Nip05Record;
}

/**
 * Get all NIP-05 verification records for a domain (Privacy-First)
 */
export async function getNip05RecordsByDomain(
  domain: string = "satnam.pub"
): Promise<Nip05Record[]> {
  const client = await db.getClient();
  const { data, error } = await client
    .from("nip05_records")
    .select("*")
    .eq("domain", domain)
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  return (data || []) as Nip05Record[];
}

/**
 * Update a NIP-05 verification record
 */
export async function updateNip05Record(
  id: string,
  updateData: { name?: string; pubkey?: string }
): Promise<Nip05Record> {
  try {
    const client = await db.getClient();
    const { data, error } = await client
      .from("nip05_records")
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === "23505") {
        throw new Error("NIP-05 name already taken");
      }
      throw error;
    }

    if (!data) {
      throw new Error("NIP-05 record not found");
    }

    return data as Nip05Record;
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error("Failed to update NIP-05 record");
  }
}

/**
 * Delete a NIP-05 verification record
 */
export async function deleteNip05Record(id: string): Promise<void> {
  const client = await db.getClient();
  const { error, count } = await client
    .from("nip05_records")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }

  if (count === 0) {
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
  const client = await db.getClient();
  const { data, error } = await client
    .from("nip05_records")
    .select("name, pubkey")
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  const names: Record<string, string> = {};

  for (const record of data || []) {
    if (record.name && record.pubkey) {
      names[record.name] = record.pubkey;
    }
  }

  return { names };
}
