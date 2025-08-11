import { db } from "../lib";

interface FamilyFederation {
  id: string;
  federationName: string;
  domain?: string;
  relayUrl?: string;
  federationDuid: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface FamilyMember {
  id: string;
  familyFederationId: string;
  userDuid: string;
  familyRole: "offspring" | "adult" | "steward" | "guardian";
  spendingApprovalRequired: boolean;
  votingPower: number;
  joinedAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new family federation
 */
export async function createFamilyFederation(
  federationName: string,
  guardianUserDuid: string,
  domain?: string,
  relayUrl?: string
): Promise<FamilyFederation> {
  // Start a transaction
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Generate federation DUID
    const federationDuid = `fed_${crypto.randomUUID()}`;

    // Insert family federation record
    const federationResult = await client.query(
      `INSERT INTO family_federations (federation_name, domain, relay_url, federation_duid, is_active, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, true, NOW(), NOW()) 
       RETURNING id, federation_name as "federationName", domain, relay_url as "relayUrl", 
                 federation_duid as "federationDuid", is_active as "isActive", 
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [federationName, domain || "satnam.pub", relayUrl, federationDuid]
    );

    const federation = federationResult.rows[0];

    // Add guardian as the first family member with guardian role
    await client.query(
      `INSERT INTO family_members (family_federation_id, user_duid, family_role, 
                                   spending_approval_required, voting_power, joined_at, 
                                   is_active, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, NOW(), true, NOW(), NOW())`,
      [federation.id, guardianUserDuid, "guardian", false, 10]
    );

    await client.query("COMMIT");

    return federation;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get family federation by ID
 */
export async function getFamilyFederationById(
  id: string
): Promise<FamilyFederation | null> {
  const result = await db.query(
    `SELECT id, federation_name as "federationName", domain, relay_url as "relayUrl", 
            federation_duid as "federationDuid", is_active as "isActive", 
            created_at as "createdAt", updated_at as "updatedAt" 
     FROM family_federations WHERE id = $1`,
    [id]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Get family federation by DUID
 */
export async function getFamilyFederationByDuid(
  federationDuid: string
): Promise<FamilyFederation | null> {
  const result = await db.query(
    `SELECT id, federation_name as "federationName", domain, relay_url as "relayUrl", 
            federation_duid as "federationDuid", is_active as "isActive", 
            created_at as "createdAt", updated_at as "updatedAt" 
     FROM family_federations WHERE federation_duid = $1`,
    [federationDuid]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Get all family federations a user is a guardian/steward of
 */
export async function getFamilyFederationsByGuardian(
  userDuid: string
): Promise<FamilyFederation[]> {
  const result = await db.query(
    `SELECT ff.id, ff.federation_name as "federationName", ff.domain, ff.relay_url as "relayUrl", 
            ff.federation_duid as "federationDuid", ff.is_active as "isActive", 
            ff.created_at as "createdAt", ff.updated_at as "updatedAt"
     FROM family_federations ff
     JOIN family_members fm ON ff.id = fm.family_federation_id
     WHERE fm.user_duid = $1 AND fm.family_role IN ('guardian', 'steward')`,
    [userDuid]
  );

  return result.rows;
}

/**
 * Get all family federations a user is a member of
 */
export async function getFamilyFederationsByMember(
  userDuid: string
): Promise<FamilyFederation[]> {
  const result = await db.query(
    `SELECT ff.id, ff.federation_name as "federationName", ff.domain, ff.relay_url as "relayUrl", 
            ff.federation_duid as "federationDuid", ff.is_active as "isActive", 
            ff.created_at as "createdAt", ff.updated_at as "updatedAt"
     FROM family_federations ff
     JOIN family_members fm ON ff.id = fm.family_federation_id
     WHERE fm.user_duid = $1 AND fm.is_active = true`,
    [userDuid]
  );

  return result.rows;
}

/**
 * Update a family federation
 */
export async function updateFamilyFederation(
  id: string,
  data: { federationName?: string; domain?: string; relayUrl?: string }
): Promise<FamilyFederation> {
  const { federationName, domain, relayUrl } = data;

  // Build update query
  let updateQuery = "UPDATE family_federations SET updated_at = NOW()";
  const queryParams: (string | null)[] = [];
  let paramIndex = 1;

  if (federationName) {
    updateQuery += `, federation_name = $${paramIndex}`;
    queryParams.push(federationName);
    paramIndex++;
  }

  if (domain !== undefined) {
    updateQuery += `, domain = $${paramIndex}`;
    queryParams.push(domain);
    paramIndex++;
  }

  if (relayUrl !== undefined) {
    updateQuery += `, relay_url = $${paramIndex}`;
    queryParams.push(relayUrl);
    paramIndex++;
  }

  updateQuery += ` WHERE id = $${paramIndex} RETURNING id, federation_name as "federationName", domain, relay_url as "relayUrl", federation_duid as "federationDuid", is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"`;
  queryParams.push(id);

  // Execute update
  const result = await db.query(updateQuery, queryParams);

  if (result.rows.length === 0) {
    throw new Error("Family federation not found");
  }

  return result.rows[0];
}

/**
 * Delete a family federation
 */
export async function deleteFamilyFederation(id: string): Promise<void> {
  // Start a transaction
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Delete family members (CASCADE should handle this)
    await client.query(
      "DELETE FROM family_members WHERE family_federation_id = $1",
      [id]
    );

    // Delete family federation
    const result = await client.query(
      "DELETE FROM family_federations WHERE id = $1",
      [id]
    );

    if (result.rowCount === 0) {
      throw new Error("Family federation not found");
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
 * Add a member to a family federation
 */
export async function addFamilyMember(
  familyFederationId: string,
  userDuid: string,
  familyRole: "offspring" | "adult" | "steward" | "guardian" = "offspring",
  spendingApprovalRequired: boolean = true,
  votingPower: number = 1
): Promise<FamilyMember> {
  // Check if user is already a member
  const existingMember = await db.query(
    "SELECT * FROM family_members WHERE family_federation_id = $1 AND user_duid = $2",
    [familyFederationId, userDuid]
  );

  if (existingMember.rows.length > 0) {
    throw new Error("User is already a member of this family federation");
  }

  // Add member
  const result = await db.query(
    `INSERT INTO family_members (family_federation_id, user_duid, family_role, 
                                 spending_approval_required, voting_power, joined_at, 
                                 is_active, created_at, updated_at) 
     VALUES ($1, $2, $3, $4, $5, NOW(), true, NOW(), NOW()) 
     RETURNING id, family_federation_id as "familyFederationId", user_duid as "userDuid", 
               family_role as "familyRole", spending_approval_required as "spendingApprovalRequired", 
               voting_power as "votingPower", joined_at as "joinedAt", is_active as "isActive", 
               created_at as "createdAt", updated_at as "updatedAt"`,
    [
      familyFederationId,
      userDuid,
      familyRole,
      spendingApprovalRequired,
      votingPower,
    ]
  );

  return result.rows[0];
}

/**
 * Remove a member from a family federation
 */
export async function removeFamilyMember(
  familyFederationId: string,
  userDuid: string
): Promise<void> {
  // Check if user is the last guardian
  const guardianCount = await db.query(
    "SELECT COUNT(*) as count FROM family_members WHERE family_federation_id = $1 AND family_role = 'guardian' AND is_active = true",
    [familyFederationId]
  );

  const member = await db.query(
    "SELECT family_role FROM family_members WHERE family_federation_id = $1 AND user_duid = $2",
    [familyFederationId, userDuid]
  );

  if (
    member.rows.length > 0 &&
    member.rows[0].family_role === "guardian" &&
    guardianCount.rows[0].count <= 1
  ) {
    throw new Error(
      "Cannot remove the last guardian. Add another guardian first or delete the federation."
    );
  }

  // Remove member (set inactive instead of deleting for audit trail)
  const result = await db.query(
    "UPDATE family_members SET is_active = false, updated_at = NOW() WHERE family_federation_id = $1 AND user_duid = $2",
    [familyFederationId, userDuid]
  );

  if (result.rowCount === 0) {
    throw new Error("User is not a member of this family federation");
  }
}

/**
 * Get all members of a family federation
 */
export async function getFamilyMembers(
  familyFederationId: string
): Promise<FamilyMember[]> {
  const result = await db.query(
    `SELECT id, family_federation_id as "familyFederationId", user_duid as "userDuid", 
            family_role as "familyRole", spending_approval_required as "spendingApprovalRequired",
            voting_power as "votingPower", joined_at as "joinedAt", is_active as "isActive",
            created_at as "createdAt", updated_at as "updatedAt" 
     FROM family_members 
     WHERE family_federation_id = $1 AND is_active = true`,
    [familyFederationId]
  );

  return result.rows;
}

/**
 * Update a family member's role and permissions
 */
export async function updateFamilyMemberRole(
  familyFederationId: string,
  userDuid: string,
  familyRole: "offspring" | "adult" | "steward" | "guardian",
  spendingApprovalRequired?: boolean,
  votingPower?: number
): Promise<FamilyMember> {
  let updateQuery = `UPDATE family_members SET family_role = $1, updated_at = NOW()`;
  const queryParams: any[] = [familyRole];
  let paramIndex = 2;

  if (spendingApprovalRequired !== undefined) {
    updateQuery += `, spending_approval_required = $${paramIndex}`;
    queryParams.push(spendingApprovalRequired);
    paramIndex++;
  }

  if (votingPower !== undefined) {
    updateQuery += `, voting_power = $${paramIndex}`;
    queryParams.push(votingPower);
    paramIndex++;
  }

  updateQuery += ` WHERE family_federation_id = $${paramIndex} AND user_duid = $${
    paramIndex + 1
  } 
                   RETURNING id, family_federation_id as "familyFederationId", user_duid as "userDuid", 
                             family_role as "familyRole", spending_approval_required as "spendingApprovalRequired",
                             voting_power as "votingPower", joined_at as "joinedAt", is_active as "isActive",
                             created_at as "createdAt", updated_at as "updatedAt"`;
  queryParams.push(familyFederationId, userDuid);

  const result = await db.query(updateQuery, queryParams);

  if (result.rows.length === 0) {
    throw new Error("Family member not found");
  }

  return result.rows[0];
}

/**
 * Transfer guardian role to another member (promote to guardian)
 */
export async function promoteToGuardian(
  familyFederationId: string,
  userDuid: string
): Promise<FamilyMember> {
  // Start a transaction
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Check if user is a member
    const memberResult = await client.query(
      "SELECT * FROM family_members WHERE family_federation_id = $1 AND user_duid = $2 AND is_active = true",
      [familyFederationId, userDuid]
    );

    if (memberResult.rows.length === 0) {
      throw new Error("User must be an active family member");
    }

    // Promote member to guardian role
    const updateResult = await client.query(
      `UPDATE family_members 
       SET family_role = 'guardian', voting_power = 10, spending_approval_required = false, updated_at = NOW() 
       WHERE family_federation_id = $1 AND user_duid = $2 
       RETURNING id, family_federation_id as "familyFederationId", user_duid as "userDuid", 
                 family_role as "familyRole", spending_approval_required as "spendingApprovalRequired",
                 voting_power as "votingPower", joined_at as "joinedAt", is_active as "isActive",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [familyFederationId, userDuid]
    );

    if (updateResult.rows.length === 0) {
      throw new Error("Failed to promote member to guardian");
    }

    await client.query("COMMIT");

    return updateResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if a user DUID represents a family member
 * This function uses database verification to determine if the DUID
 * belongs to a family member for internal transfer eligibility
 */
export async function isFamilyMember(userDuid: string): Promise<boolean> {
  try {
    // Validate input
    if (!userDuid || typeof userDuid !== "string") {
      return false;
    }

    // Query database to verify family member status using DUID
    const member = await getFamilyMemberByUserDuid(userDuid);
    return member !== null;
  } catch (error) {
    console.error("Error checking family member status:", error);
    // Fail closed - if we can't verify, assume not a family member
    return false;
  }
}

/**
 * Get family member by user DUID
 * This is a helper function for family member validation using privacy-first identifiers
 */
export async function getFamilyMemberByUserDuid(
  userDuid: string
): Promise<FamilyMember | null> {
  try {
    const result = await db.query(
      `SELECT id, family_federation_id as "familyFederationId", user_duid as "userDuid", 
              family_role as "familyRole", spending_approval_required as "spendingApprovalRequired",
              voting_power as "votingPower", joined_at as "joinedAt", is_active as "isActive",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM family_members 
       WHERE user_duid = $1 AND is_active = true`,
      [userDuid]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error("Error getting family member by user DUID:", error);
    return null;
  }
}

/**
 * Get family members with specific role
 */
export async function getFamilyMembersByRole(
  familyFederationId: string,
  familyRole: "offspring" | "adult" | "steward" | "guardian"
): Promise<FamilyMember[]> {
  try {
    const result = await db.query(
      `SELECT id, family_federation_id as "familyFederationId", user_duid as "userDuid", 
              family_role as "familyRole", spending_approval_required as "spendingApprovalRequired",
              voting_power as "votingPower", joined_at as "joinedAt", is_active as "isActive",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM family_members 
       WHERE family_federation_id = $1 AND family_role = $2 AND is_active = true
       ORDER BY voting_power DESC, joined_at ASC`,
      [familyFederationId, familyRole]
    );

    return result.rows;
  } catch (error) {
    console.error("Error getting family members by role:", error);
    return [];
  }
}
