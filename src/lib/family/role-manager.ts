/**
 * @fileoverview Role Management Service for Family Federations
 * @description Implements hierarchical RBAC: Guardian > Steward > Adult > Offspring
 */

import { FederationRole, RolePermissions, RoleHierarchy } from '../../types/auth';

// Role hierarchy definitions
export const ROLE_HIERARCHY: Record<FederationRole, RoleHierarchy> = {
  private: {
    role: 'private',
    permissions: {
      can_view_own_balance: true,
      can_make_small_payments: true,
      can_manage_own_funds: true,
      can_set_own_spending_limits: true,
      can_manage_own_custody: true,
      no_rbac_restrictions: true,
    },
    can_promote_to: [],
    can_demote_from: [],
    can_remove: false,
    daily_spending_limit: 0, // No limit - user sets their own
    requires_approval_for: [], // No approvals needed
  },
  offspring: {
    role: 'offspring',
    permissions: {
      can_view_own_balance: true,
      can_make_small_payments: true,
      can_view_family_events: true,
    },
    can_promote_to: [],
    can_demote_from: [],
    can_remove: false,
    daily_spending_limit: 10000,
    requires_approval_for: ['large_payments', 'role_changes', 'federation_settings'],
  },
  adult: {
    role: 'adult',
    permissions: {
      can_view_family_balances: true,
      can_approve_offspring_payments: true,
      can_create_offspring: true,
      can_manage_offspring: true,
      can_view_family_events: true,
    },
    can_promote_to: ['offspring'],
    can_demote_from: ['offspring'],
    can_remove: false,
    daily_spending_limit: 100000,
    requires_approval_for: ['large_payments', 'role_changes', 'federation_settings'],
  },
  steward: {
    role: 'steward',
    permissions: {
      can_view_all_balances: true,
      can_approve_adult_payments: true,
      can_create_adults: true,
      can_manage_adults: true,
      can_manage_offspring: true,
      can_view_federation_settings: true,
      can_propose_changes: true,
    },
    can_promote_to: ['offspring', 'adult'],
    can_demote_from: ['offspring', 'adult'],
    can_remove: false,
    daily_spending_limit: 500000,
    requires_approval_for: ['federation_settings', 'guardian_actions'],
  },
  guardian: {
    role: 'guardian',
    permissions: {
      can_view_all_balances: true,
      can_approve_all_payments: true,
      can_create_any_role: true,
      can_manage_all_roles: true,
      can_remove_stewards: true,
      can_manage_federation: true,
      can_emergency_override: true,
    },
    can_promote_to: ['offspring', 'adult', 'steward'],
    can_demote_from: ['offspring', 'adult', 'steward'],
    can_remove: true,
    daily_spending_limit: 1000000,
    requires_approval_for: [],
  },
};

export class RoleManager {
  /**
   * Check if a role can promote another role
   */
  static canPromoteRole(promoterRole: FederationRole, targetRole: FederationRole): boolean {
    const hierarchy = ROLE_HIERARCHY[promoterRole];
    return hierarchy.can_promote_to.includes(targetRole);
  }

  /**
   * Check if a role can demote another role
   */
  static canDemoteRole(demoterRole: FederationRole, targetRole: FederationRole): boolean {
    const hierarchy = ROLE_HIERARCHY[demoterRole];
    return hierarchy.can_demote_from.includes(targetRole);
  }

  /**
   * Check if a role can remove another role
   */
  static canRemoveRole(removerRole: FederationRole, targetRole: FederationRole): boolean {
    if (removerRole !== 'guardian') return false;
    return targetRole === 'steward';
  }

  /**
   * Get the permissions for a specific role
   */
  static getRolePermissions(role: FederationRole): RolePermissions {
    return ROLE_HIERARCHY[role].permissions;
  }

  /**
   * Check if a role has a specific permission
   */
  static hasPermission(role: FederationRole, permission: keyof RolePermissions): boolean {
    const permissions = this.getRolePermissions(role);
    return permissions[permission] === true;
  }

  /**
   * Get the daily spending limit for a role
   */
  static getDailySpendingLimit(role: FederationRole): number {
    return ROLE_HIERARCHY[role].daily_spending_limit;
  }

  /**
   * Check if an action requires approval for a role
   */
  static requiresApproval(role: FederationRole, action: string): boolean {
    const hierarchy = ROLE_HIERARCHY[role];
    return hierarchy.requires_approval_for.includes(action);
  }

  /**
   * Get the hierarchy level of a role (higher number = more authority)
   * Private users have level 0 (no RBAC restrictions)
   */
  static getHierarchyLevel(role: FederationRole): number {
    const levels: Record<FederationRole, number> = {
      private: 0, // Private users have no RBAC restrictions
      offspring: 1,
      adult: 2,
      steward: 3,
      guardian: 4,
    };
    return levels[role];
  }

  /**
   * Check if one role has authority over another
   * Private users have no authority over others and no one has authority over them
   */
  static hasAuthorityOver(controllerRole: FederationRole, targetRole: FederationRole): boolean {
    // Private users are outside the RBAC system
    if (controllerRole === 'private' || targetRole === 'private') {
      return false;
    }
    return this.getHierarchyLevel(controllerRole) > this.getHierarchyLevel(targetRole);
  }

  /**
   * Validate a role transition
   */
  static validateRoleTransition(
    fromRole: FederationRole,
    toRole: FederationRole,
    promoterRole: FederationRole
  ): { valid: boolean; reason?: string } {
    // Check if promoter has authority to make this change
    if (!this.hasAuthorityOver(promoterRole, fromRole)) {
      return {
        valid: false,
        reason: `${promoterRole} does not have authority over ${fromRole}`,
      };
    }

    // Check if promoter can promote to target role
    if (!this.canPromoteRole(promoterRole, toRole)) {
      return {
        valid: false,
        reason: `${promoterRole} cannot promote to ${toRole}`,
      };
    }

    // Check hierarchy constraints
    const fromLevel = this.getHierarchyLevel(fromRole);
    const toLevel = this.getHierarchyLevel(toRole);
    const promoterLevel = this.getHierarchyLevel(promoterRole);

    // Can't promote beyond promoter's own level
    if (toLevel >= promoterLevel) {
      return {
        valid: false,
        reason: `Cannot promote to role equal to or higher than ${promoterRole}`,
      };
    }

    return { valid: true };
  }

  /**
   * Get all roles that can be managed by a given role
   */
  static getManageableRoles(managerRole: FederationRole): FederationRole[] {
    const manageable: FederationRole[] = [];
    
    Object.keys(ROLE_HIERARCHY).forEach((role) => {
      const roleKey = role as FederationRole;
      if (this.hasAuthorityOver(managerRole, roleKey)) {
        manageable.push(roleKey);
      }
    });

    return manageable;
  }

  /**
   * Get the approval requirements for a role
   */
  static getApprovalRequirements(role: FederationRole): string[] {
    return ROLE_HIERARCHY[role].requires_approval_for;
  }

  /**
   * Check if a role can create another role
   */
  static canCreateRole(creatorRole: FederationRole, targetRole: FederationRole): boolean {
    const permissions = this.getRolePermissions(creatorRole);
    
    switch (targetRole) {
      case 'offspring':
        return permissions.can_create_offspring === true;
      case 'adult':
        return permissions.can_create_adults === true;
      case 'steward':
      case 'guardian':
        return permissions.can_create_any_role === true;
      default:
        return false;
    }
  }

  /**
   * Get the minimum role required to approve a specific action
   */
  static getMinimumApprovalRole(action: string): FederationRole {
    const actionRequirements: Record<string, FederationRole> = {
      'large_payments': 'adult',
      'role_changes': 'steward',
      'federation_settings': 'guardian',
      'guardian_actions': 'guardian',
    };

    return actionRequirements[action] || 'guardian';
  }
} 