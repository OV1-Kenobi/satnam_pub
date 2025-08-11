/**
 * Family Federation API Endpoints - Privacy-First
 * Handles family federation operations with hashed data storage
 */

import type { Handler, HandlerContext, HandlerEvent } from "@netlify/functions";
import { db } from "../db";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

/**
 * Family Federation API Handler
 */
export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  // Handle CORS preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  try {
    const { path, httpMethod } = event;
    const pathSegments = path.split("/").filter(Boolean);

    // Remove 'api' from path segments if present
    const apiIndex = pathSegments.indexOf("api");
    if (apiIndex !== -1) {
      pathSegments.splice(0, apiIndex + 1);
    }

    // Routes: /family-federations/{id}/members, /family-federations/{id}, etc.
    if (pathSegments[0] === "family-federations") {
      if (pathSegments.length === 1) {
        // /family-federations - List or Create
        if (httpMethod === "GET") {
          return await listFamilyFederations(event);
        } else if (httpMethod === "POST") {
          return await createFamilyFederation(event);
        }
      } else if (pathSegments.length === 2) {
        // /family-federations/{duid}
        const federationDuid = pathSegments[1];
        if (httpMethod === "GET") {
          return await getFamilyFederation(federationDuid);
        }
      } else if (pathSegments.length === 3) {
        // /family-federations/{duid}/members
        const federationDuid = pathSegments[1];
        const subResource = pathSegments[2];

        if (subResource === "members" && httpMethod === "GET") {
          return await getFamilyFederationMembers(federationDuid, event);
        } else if (
          subResource === "pending-approvals" &&
          httpMethod === "GET"
        ) {
          return await getPendingSpendingApprovals(federationDuid);
        }
      } else if (pathSegments.length === 4) {
        // /family-federations/{duid}/permissions/{user_duid}
        const federationDuid = pathSegments[1];
        const subResource = pathSegments[2];
        const userDuid = pathSegments[3];

        if (subResource === "permissions" && httpMethod === "GET") {
          return await checkFamilyPermissions(federationDuid, userDuid);
        }
      }
    }

    // Route: /users/{user_duid}/family-federations
    if (
      pathSegments[0] === "users" &&
      pathSegments[2] === "family-federations"
    ) {
      const userDuid = pathSegments[1];
      if (httpMethod === "GET") {
        return await getUserFamilyFederations(userDuid);
      }
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Not found" }),
    };
  } catch (error) {
    console.error("Family federation API error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};

/**
 * List family federations
 */
async function listFamilyFederations(event: HandlerEvent) {
  // This would typically be filtered by user permissions
  // For now, return empty array as federations are private
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify([]),
  };
}

/**
 * Create a new family federation
 */
async function createFamilyFederation(event: HandlerEvent) {
  if (!event.body) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Request body required" }),
    };
  }

  const { federation_name, domain, relay_url, federation_duid } = JSON.parse(
    event.body
  );

  if (!federation_name || !federation_duid) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "federation_name and federation_duid are required",
      }),
    };
  }

  try {
    const federation = await db.models.familyFederations.create({
      federation_name,
      domain,
      relay_url,
      federation_duid,
    });

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify(federation),
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Failed to create family federation" }),
    };
  }
}

/**
 * Get family federation by DUID
 */
async function getFamilyFederation(federationDuid: string) {
  try {
    const federation = await db.models.familyFederations.getByDuid(
      federationDuid
    );

    if (!federation) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Family federation not found" }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(federation),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Failed to fetch family federation" }),
    };
  }
}

/**
 * Get family federation members
 */
async function getFamilyFederationMembers(
  federationId: string,
  event: HandlerEvent
) {
  try {
    const queryParams = new URLSearchParams(event.queryStringParameters || {});
    const role = queryParams.get("role");

    let members;
    if (role) {
      members = await db.models.familyFederations.getMembersByRole(
        federationId,
        role
      );
    } else {
      members = await db.models.familyFederations.getMembers(federationId);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(members),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Failed to fetch family members" }),
    };
  }
}

/**
 * Check family permissions for a user
 */
async function checkFamilyPermissions(federationId: string, userDuid: string) {
  try {
    // Query family_members table to get user's role and permissions
    const result = await db.query(
      `
      SELECT 
        family_role,
        voting_power,
        spending_approval_required,
        CASE 
          WHEN family_role IN ('steward', 'guardian') THEN true
          ELSE false
        END as can_approve_spending
      FROM family_members 
      WHERE family_federation_id = $1 AND user_duid = $2 AND is_active = true
      `,
      [federationId, userDuid]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "User not found in family federation" }),
      };
    }

    const member = result.rows[0];

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        familyRole: member.family_role,
        votingPower: member.voting_power,
        canApproveSpending: member.can_approve_spending,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Failed to check family permissions" }),
    };
  }
}

/**
 * Get family federations for a user
 */
async function getUserFamilyFederations(userDuid: string) {
  try {
    const result = await db.query(
      `
      SELECT ff.*, fm.family_role, fm.voting_power
      FROM family_federations ff
      JOIN family_members fm ON ff.id = fm.family_federation_id
      WHERE fm.user_duid = $1 AND fm.is_active = true AND ff.is_active = true
      ORDER BY ff.created_at
      `,
      [userDuid]
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result.rows),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Failed to fetch user family federations",
      }),
    };
  }
}

/**
 * Get pending spending approvals for family federation
 */
async function getPendingSpendingApprovals(federationId: string) {
  try {
    // This would typically query a spending_approvals table
    // For now, return mock data showing the structure
    const mockApprovals = [
      {
        id: "approval_1",
        userDuid: "user_duid_123",
        amount: 25000,
        recipient: "merchant@example.com",
        description: "Weekly allowance distribution",
        paymentMethod: "lightning",
        requiredApprovals: 2,
        currentApprovals: 1,
        createdAt: new Date().toISOString(),
      },
    ];

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(mockApprovals),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Failed to fetch pending approvals" }),
    };
  }
}
