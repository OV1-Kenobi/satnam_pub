/**
 * @fileoverview Role Management API for Family Federations
 * @description Handles hierarchical RBAC: Guardian > Steward > Adult > Offspring
 */

import { Request, Response } from "express";
import { supabase } from "../../lib/supabase-server";
import { FederationRole } from "../../src/types/auth";

// Role hierarchy validation
const ROLE_HIERARCHY: Record<FederationRole, number> = {
  private: 0, // Private users have no RBAC restrictions
  offspring: 1,
  adult: 2,
  steward: 3,
  guardian: 4,
};

interface RoleChangeRequest {
  targetUserId: string;
  newRole: FederationRole;
  reason?: string;
}

interface RolePermissionRequest {
  action: string;
  targetRole?: FederationRole;
}

/**
 * Promote or demote a user's role
 * POST /api/family/role-management/change-role
 */
export async function changeUserRole(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Verify session and get current user
    const { data: session, error: authError } = await supabase.auth.getUser();
    if (authError || !session?.user) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    const { targetUserId, newRole, reason }: RoleChangeRequest = req.body;

    if (!targetUserId || !newRole) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: targetUserId, newRole",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    // Get current user's role
    const { data: currentUser } = await supabase
      .from("profiles")
      .select("federation_role, federation_id")
      .eq("id", session.user.id)
      .single();

    if (!currentUser) {
      res.status(404).json({
        success: false,
        error: "Current user profile not found",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    const currentRole = currentUser.federation_role as FederationRole;

    // Get target user's current role
    const { data: targetUser } = await supabase
      .from("profiles")
      .select("federation_role, federation_id")
      .eq("id", targetUserId)
      .single();

    if (!targetUser) {
      res.status(404).json({
        success: false,
        error: "Target user not found",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    const targetCurrentRole = targetUser.federation_role as FederationRole;

    // Validate role change permissions
    const validation = validateRoleChange(
      currentRole,
      targetCurrentRole,
      newRole
    );

    if (!validation.valid) {
      res.status(403).json({
        success: false,
        error: validation.reason,
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    // Check if users are in the same federation
    if (currentUser.federation_id !== targetUser.federation_id) {
      res.status(403).json({
        success: false,
        error: "Users must be in the same federation for role changes",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    // Update target user's role
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        federation_role: newRole,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetUserId);

    if (updateError) {
      console.error("Role update error:", updateError);
      res.status(500).json({
        success: false,
        error: "Failed to update user role",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    // Log role change in role_hierarchy table
    const { error: logError } = await supabase
      .from("role_hierarchy")
      .insert({
        federation_hash: currentUser.federation_id,
        member_hash: targetUserId,
        current_role: newRole,
        previous_role: targetCurrentRole,
        promoted_by: session.user.id,
        reason: reason || "Role change by authorized user",
        effective_at: new Date().toISOString(),
      });

    if (logError) {
      console.error("Role change logging error:", logError);
      // Don't fail the request, just log the error
    }

    res.status(200).json({
      success: true,
      data: {
        targetUserId,
        previousRole: targetCurrentRole,
        newRole,
        changedBy: session.user.id,
        reason,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error("Role change error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during role change",
      meta: { timestamp: new Date().toISOString() },
    });
  }
}

/**
 * Check if current user has permission for a specific action
 * POST /api/family/role-management/check-permission
 */
export async function checkPermission(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Verify session and get current user
    const { data: session, error: authError } = await supabase.auth.getUser();
    if (authError || !session?.user) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    const { action, targetRole }: RolePermissionRequest = req.body;

    if (!action) {
      res.status(400).json({
        success: false,
        error: "Missing required field: action",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    // Get current user's role
    const { data: currentUser } = await supabase
      .from("profiles")
      .select("federation_role")
      .eq("id", session.user.id)
      .single();

    if (!currentUser) {
      res.status(404).json({
        success: false,
        error: "User profile not found",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    const currentRole = currentUser.federation_role as FederationRole;

    // Check permission based on role and action
    const hasPermission = checkRolePermission(currentRole, action, targetRole);

    res.status(200).json({
      success: true,
      data: {
        hasPermission,
        userRole: currentRole,
        action,
        targetRole,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error("Permission check error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during permission check",
      meta: { timestamp: new Date().toISOString() },
    });
  }
}

/**
 * Get role hierarchy information
 * GET /api/family/role-management/hierarchy
 */
export async function getRoleHierarchy(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Verify session
    const { data: session, error: authError } = await supabase.auth.getUser();
    if (authError || !session?.user) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    // Get current user's role
    const { data: currentUser } = await supabase
      .from("profiles")
      .select("federation_role")
      .eq("id", session.user.id)
      .single();

    if (!currentUser) {
      res.status(404).json({
        success: false,
        error: "User profile not found",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    const currentRole = currentUser.federation_role as FederationRole;

    // Get manageable roles for current user
    const manageableRoles = getManageableRoles(currentRole);

    res.status(200).json({
      success: true,
      data: {
        currentRole,
        hierarchy: ROLE_HIERARCHY,
        manageableRoles,
        rolePermissions: getRolePermissions(currentRole),
      },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error("Role hierarchy error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      meta: { timestamp: new Date().toISOString() },
    });
  }
}

/**
 * Remove a user from the federation (Guardians only)
 * POST /api/family/role-management/remove-user
 */
export async function removeUserFromFederation(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Verify session and get current user
    const { data: session, error: authError } = await supabase.auth.getUser();
    if (authError || !session?.user) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    const { targetUserId, reason }: { targetUserId: string; reason?: string } =
      req.body;

    if (!targetUserId) {
      res.status(400).json({
        success: false,
        error: "Missing required field: targetUserId",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    // Get current user's role
    const { data: currentUser } = await supabase
      .from("profiles")
      .select("federation_role, federation_id")
      .eq("id", session.user.id)
      .single();

    if (!currentUser) {
      res.status(404).json({
        success: false,
        error: "Current user profile not found",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    const currentRole = currentUser.federation_role as FederationRole;

    // Only guardians can remove users
    if (currentRole !== "guardian") {
      res.status(403).json({
        success: false,
        error: "Only guardians can remove users from the federation",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    // Get target user's information
    const { data: targetUser } = await supabase
      .from("profiles")
      .select("federation_role, federation_id")
      .eq("id", targetUserId)
      .single();

    if (!targetUser) {
      res.status(404).json({
        success: false,
        error: "Target user not found",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    // Check if users are in the same federation
    if (currentUser.federation_id !== targetUser.federation_id) {
      res.status(403).json({
        success: false,
        error: "Users must be in the same federation",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    // Remove user from federation (set federation_id to null)
    const { error: removeError } = await supabase
      .from("profiles")
      .update({
        federation_id: null,
        federation_role: "offspring", // Reset to default role
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetUserId);

    if (removeError) {
      console.error("User removal error:", removeError);
      res.status(500).json({
        success: false,
        error: "Failed to remove user from federation",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    // Log removal in role_hierarchy table
    const { error: logError } = await supabase
      .from("role_hierarchy")
      .insert({
        federation_hash: currentUser.federation_id,
        member_hash: targetUserId,
        current_role: "offspring",
        previous_role: targetUser.federation_role,
        demoted_by: session.user.id,
        reason: reason || "Removed from federation by guardian",
        effective_at: new Date().toISOString(),
      });

    if (logError) {
      console.error("Removal logging error:", logError);
      // Don't fail the request, just log the error
    }

    res.status(200).json({
      success: true,
      data: {
        targetUserId,
        removedBy: session.user.id,
        reason,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error("User removal error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during user removal",
      meta: { timestamp: new Date().toISOString() },
    });
  }
}

// Helper functions

function validateRoleChange(
  currentRole: FederationRole,
  targetCurrentRole: FederationRole,
  newRole: FederationRole
): { valid: boolean; reason?: string } {
  // Check hierarchy levels
  const currentLevel = ROLE_HIERARCHY[currentRole];
  const targetLevel = ROLE_HIERARCHY[targetCurrentRole];
  const newLevel = ROLE_HIERARCHY[newRole];

  // Can't change roles of users at same or higher level
  if (targetLevel >= currentLevel) {
    return {
      valid: false,
      reason: `Cannot change role of user with same or higher authority`,
    };
  }

  // Can't promote to same or higher level than current user
  if (newLevel >= currentLevel) {
    return {
      valid: false,
      reason: `Cannot promote to role with same or higher authority`,
    };
  }

  // Role-specific validation
  switch (currentRole) {
    case "guardian":
      // Guardians can change any role
      return { valid: true };
    case "steward":
      // Stewards can only change offspring and adult roles
      if (targetCurrentRole === "guardian" || newRole === "guardian") {
        return {
          valid: false,
          reason: "Stewards cannot manage guardian roles",
        };
      }
      return { valid: true };
    case "adult":
      // Adults can only manage offspring roles
      if (targetCurrentRole !== "offspring" || newRole !== "offspring") {
        return {
          valid: false,
          reason: "Adults can only manage offspring roles",
        };
      }
      return { valid: true };
    case "offspring":
      // Offspring cannot change any roles
      return {
        valid: false,
        reason: "Offspring cannot change user roles",
      };
    default:
      return { valid: false, reason: "Invalid role" };
  }
}

function checkRolePermission(
  userRole: FederationRole,
  action: string,
  targetRole?: FederationRole
): boolean {
  const rolePermissions = getRolePermissions(userRole);

  switch (action) {
    case "view_own_balance":
      return rolePermissions.can_view_own_balance === true;
    case "view_family_balances":
      return rolePermissions.can_view_family_balances === true;
    case "view_all_balances":
      return rolePermissions.can_view_all_balances === true;
    case "make_small_payments":
      return rolePermissions.can_make_small_payments === true;
    case "approve_offspring_payments":
      return rolePermissions.can_approve_offspring_payments === true;
    case "approve_adult_payments":
      return rolePermissions.can_approve_adult_payments === true;
    case "approve_all_payments":
      return rolePermissions.can_approve_all_payments === true;
    case "create_offspring":
      return rolePermissions.can_create_offspring === true;
    case "create_adults":
      return rolePermissions.can_create_adults === true;
    case "create_any_role":
      return rolePermissions.can_create_any_role === true;
    case "manage_offspring":
      return rolePermissions.can_manage_offspring === true;
    case "manage_adults":
      return rolePermissions.can_manage_adults === true;
    case "manage_all_roles":
      return rolePermissions.can_manage_all_roles === true;
    case "remove_stewards":
      return rolePermissions.can_remove_stewards === true;
    case "view_family_events":
      return rolePermissions.can_view_family_events === true;
    case "view_federation_settings":
      return rolePermissions.can_view_federation_settings === true;
    case "propose_changes":
      return rolePermissions.can_propose_changes === true;
    case "manage_federation":
      return rolePermissions.can_manage_federation === true;
    case "emergency_override":
      return rolePermissions.can_emergency_override === true;
    default:
      return false;
  }
}

function getManageableRoles(userRole: FederationRole): FederationRole[] {
  const manageable: FederationRole[] = [];
  
  Object.keys(ROLE_HIERARCHY).forEach((role) => {
    const roleKey = role as FederationRole;
    if (ROLE_HIERARCHY[userRole] > ROLE_HIERARCHY[roleKey]) {
      manageable.push(roleKey);
    }
  });

  return manageable;
}

function getRolePermissions(role: FederationRole) {
  const permissions: Record<FederationRole, any> = {
    private: {
      can_view_own_balance: true,
      can_make_small_payments: true,
      can_manage_own_funds: true,
      can_set_own_spending_limits: true,
      can_manage_own_custody: true,
      no_rbac_restrictions: true,
    },
    offspring: {
      can_view_own_balance: true,
      can_make_small_payments: true,
      can_view_family_events: true,
    },
    adult: {
      can_view_family_balances: true,
      can_approve_offspring_payments: true,
      can_create_offspring: true,
      can_manage_offspring: true,
      can_view_family_events: true,
    },
    steward: {
      can_view_all_balances: true,
      can_approve_adult_payments: true,
      can_create_adults: true,
      can_manage_adults: true,
      can_manage_offspring: true,
      can_view_federation_settings: true,
      can_propose_changes: true,
    },
    guardian: {
      can_view_all_balances: true,
      can_approve_all_payments: true,
      can_create_any_role: true,
      can_manage_all_roles: true,
      can_remove_stewards: true,
      can_manage_federation: true,
      can_emergency_override: true,
    },
  };

  return permissions[role] || {};
} 