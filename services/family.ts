import { familyConfig } from "../config";
import { db } from "../lib";

interface Family {
  id: string;
  name: string;
  description?: string;
  adminId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FamilyMember {
  id: string;
  familyId: string;
  userId: string;
  role: "admin" | "member";
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new family
 */
export async function createFamily(
  name: string,
  adminId: string,
  description?: string
): Promise<Family> {
  // Start a transaction
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Insert family record
    const familyResult = await client.query(
      `INSERT INTO families (name, description, admin_id, created_at, updated_at) 
       VALUES ($1, $2, $3, NOW(), NOW()) 
       RETURNING id, name, description, admin_id as "adminId", created_at as "createdAt", updated_at as "updatedAt"`,
      [name, description, adminId]
    );

    const family = familyResult.rows[0];

    // Add admin as a family member with admin role
    await client.query(
      `INSERT INTO family_members (family_id, user_id, role, created_at, updated_at) 
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [family.id, adminId, "admin"]
    );

    await client.query("COMMIT");

    return family;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get family by ID
 */
export async function getFamilyById(id: string): Promise<Family | null> {
  const result = await db.query(
    'SELECT id, name, description, admin_id as "adminId", created_at as "createdAt", updated_at as "updatedAt" FROM families WHERE id = $1',
    [id]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Get all families administered by a user
 */
export async function getFamiliesByAdminId(adminId: string): Promise<Family[]> {
  const result = await db.query(
    'SELECT id, name, description, admin_id as "adminId", created_at as "createdAt", updated_at as "updatedAt" FROM families WHERE admin_id = $1',
    [adminId]
  );

  return result.rows;
}

/**
 * Get all families a user is a member of
 */
export async function getFamiliesByMemberId(userId: string): Promise<Family[]> {
  const result = await db.query(
    `SELECT f.id, f.name, f.description, f.admin_id as "adminId", f.created_at as "createdAt", f.updated_at as "updatedAt" 
     FROM families f
     JOIN family_members fm ON f.id = fm.family_id
     WHERE fm.user_id = $1`,
    [userId]
  );

  return result.rows;
}

/**
 * Update a family
 */
export async function updateFamily(
  id: string,
  data: { name?: string; description?: string }
): Promise<Family> {
  const { name, description } = data;

  // Build update query
  let updateQuery = "UPDATE families SET updated_at = NOW()";
  const queryParams: (string | null)[] = [];
  let paramIndex = 1;

  if (name) {
    updateQuery += `, name = $${paramIndex}`;
    queryParams.push(name);
    paramIndex++;
  }

  if (description !== undefined) {
    updateQuery += `, description = $${paramIndex}`;
    queryParams.push(description);
    paramIndex++;
  }

  updateQuery += ` WHERE id = $${paramIndex} RETURNING id, name, description, admin_id as "adminId", created_at as "createdAt", updated_at as "updatedAt"`;
  queryParams.push(id);

  // Execute update
  const result = await db.query(updateQuery, queryParams);

  if (result.rows.length === 0) {
    throw new Error("Family not found");
  }

  return result.rows[0];
}

/**
 * Delete a family
 */
export async function deleteFamily(id: string): Promise<void> {
  // Start a transaction
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Delete family members
    await client.query("DELETE FROM family_members WHERE family_id = $1", [id]);

    // Delete family
    const result = await client.query("DELETE FROM families WHERE id = $1", [
      id,
    ]);

    if (result.rowCount === 0) {
      throw new Error("Family not found");
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Add a member to a family
 */
export async function addFamilyMember(
  familyId: string,
  userId: string,
  role: "admin" | "member" = "member"
): Promise<FamilyMember> {
  // Check if user is already a member
  const existingMember = await db.query(
    "SELECT * FROM family_members WHERE family_id = $1 AND user_id = $2",
    [familyId, userId]
  );

  if (existingMember.rows.length > 0) {
    throw new Error("User is already a member of this family");
  }

  // Add member
  const result = await db.query(
    `INSERT INTO family_members (family_id, user_id, role, created_at, updated_at) 
     VALUES ($1, $2, $3, NOW(), NOW()) 
     RETURNING id, family_id as "familyId", user_id as "userId", role, created_at as "createdAt", updated_at as "updatedAt"`,
    [familyId, userId, role]
  );

  return result.rows[0];
}

/**
 * Remove a member from a family
 */
export async function removeFamilyMember(
  familyId: string,
  userId: string
): Promise<void> {
  // Check if user is the admin
  const family = await getFamilyById(familyId);

  if (!family) {
    throw new Error("Family not found");
  }

  if (family.adminId === userId) {
    throw new Error(
      "Cannot remove the family admin. Transfer admin role first or delete the family."
    );
  }

  // Remove member
  const result = await db.query(
    "DELETE FROM family_members WHERE family_id = $1 AND user_id = $2",
    [familyId, userId]
  );

  if (result.rowCount === 0) {
    throw new Error("User is not a member of this family");
  }
}

/**
 * Get all members of a family
 */
export async function getFamilyMembers(
  familyId: string
): Promise<FamilyMember[]> {
  const result = await db.query(
    `SELECT id, family_id as "familyId", user_id as "userId", role, created_at as "createdAt", updated_at as "updatedAt" 
     FROM family_members 
     WHERE family_id = $1`,
    [familyId]
  );

  return result.rows;
}

/**
 * Update a family member's role
 */
export async function updateFamilyMemberRole(
  familyId: string,
  userId: string,
  role: "admin" | "member"
): Promise<FamilyMember> {
  const result = await db.query(
    `UPDATE family_members 
     SET role = $1, updated_at = NOW() 
     WHERE family_id = $2 AND user_id = $3 
     RETURNING id, family_id as "familyId", user_id as "userId", role, created_at as "createdAt", updated_at as "updatedAt"`,
    [role, familyId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error("Family member not found");
  }

  return result.rows[0];
}

/**
 * Transfer family admin role to another member
 */
export async function transferFamilyAdmin(
  familyId: string,
  newAdminId: string
): Promise<Family> {
  // Start a transaction
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Check if new admin is a member
    const memberResult = await client.query(
      "SELECT * FROM family_members WHERE family_id = $1 AND user_id = $2",
      [familyId, newAdminId]
    );

    if (memberResult.rows.length === 0) {
      throw new Error("New admin must be a family member");
    }

    // Update family admin
    const familyResult = await client.query(
      `UPDATE families 
       SET admin_id = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING id, name, description, admin_id as "adminId", created_at as "createdAt", updated_at as "updatedAt"`,
      [newAdminId, familyId]
    );

    if (familyResult.rows.length === 0) {
      throw new Error("Family not found");
    }

    // Update member roles
    await client.query(
      "UPDATE family_members SET role = $1 WHERE family_id = $2 AND user_id = $3",
      ["admin", familyId, newAdminId]
    );

    // Demote previous admin
    await client.query(
      "UPDATE family_members SET role = $1 WHERE family_id = $2 AND user_id != $3 AND role = 'admin'",
      ["member", familyId, newAdminId]
    );

    await client.query("COMMIT");

    return familyResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if a user identifier represents a family member
 * This function uses database verification to determine if the identifier
 * belongs to a family member for internal transfer eligibility
 */
export async function isFamilyMember(identifier: string): Promise<boolean> {
  try {
    // Validate input
    if (!identifier || typeof identifier !== "string") {
      return false;
    }

    // Check if identifier matches family domain pattern
    if (identifier.includes(`@${familyConfig.domain}`)) {
      // Still verify in database even if domain matches
      const member = await getFamilyMemberByIdentifier(identifier);
      return member !== null;
    }

    // Check if identifier is a short username (likely internal)
    // But exclude email addresses from other domains
    if (
      identifier.length <= familyConfig.usernameMaxLength &&
      !identifier.includes("@")
    ) {
      // Query database to verify family member status
      const member = await getFamilyMemberByIdentifier(identifier);
      return member !== null;
    }

    return false;
  } catch (error) {
    console.error("Error checking family member status:", error);
    // Fail closed - if we can't verify, assume not a family member
    return false;
  }
}

/**
 * Get family member by identifier (username or email)
 * This is a helper function for more detailed family member validation
 */
export async function getFamilyMemberByIdentifier(
  identifier: string
): Promise<FamilyMember | null> {
  try {
    const result = await db.query(
      `SELECT fm.id, fm.family_id as "familyId", fm.user_id as "userId", fm.role, 
              fm.created_at as "createdAt", fm.updated_at as "updatedAt"
       FROM family_members fm 
       JOIN users u ON fm.user_id = u.id 
       WHERE u.username = $1 OR u.email = $1`,
      [identifier]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error("Error getting family member by identifier:", error);
    return null;
  }
}
