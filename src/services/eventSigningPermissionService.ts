/**
 * Event Signing Permission Service
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Privacy-first permission checking with role hierarchy
 * - Zero-knowledge architecture (no key material exposure)
 * - Role-based access control: private < offspring < adult < steward < guardian
 * - Integration with FROST session management
 *
 * This service handles:
 * - Permission checking (canSign, getEffectivePermissions)
 * - Role permission configuration (Guardian/Steward only)
 * - Member override management
 * - Time-based permission windows
 * - Cross-federation delegation checking
 * - Alliance permission inheritance
 */

import { createClient } from "@supabase/supabase-js";
import type {
  AlliancePermissionsResult,
  ConfigureRolePermissionsRequest,
  CreateDelegationRequest,
  DelegationCheckResult,
  EffectivePermission,
  EventSigningPermission,
  FederationPermissionDelegation,
  FederationRole,
  MemberSigningOverride,
  PermissionCategory,
  PermissionCheckResult,
  PermissionTimeWindow,
  ServiceResult,
  SetMemberOverrideRequest,
  SetTimeWindowRequest,
  TimeWindowCheckResult,
} from "../types/permissions";
import { ROLE_HIERARCHY } from "../types/permissions";

// Lazy-initialized Supabase client to prevent module-level throws
let supabaseInstance: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!supabaseInstance) {
    const supabaseUrl =
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Missing Supabase configuration for EventSigningPermissionService"
      );
    }
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseInstance;
}

// UUID validation regex to prevent query injection
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Calculate the next midnight UTC reset time
 */
function getNextMidnightUtc(): Date {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0
    )
  );
  return tomorrow;
}

/**
 * Database row to TypeScript interface mappers
 */
function mapDbPermissionToInterface(
  row: Record<string, unknown>
): EventSigningPermission {
  return {
    id: row.id as string,
    federationId: row.federation_id as string,
    role: row.role as FederationRole,
    eventType: row.event_type as string,
    nostrKind: row.nostr_kind as number | undefined,
    permissionCategory: row.permission_category as PermissionCategory,
    canSign: row.can_sign as boolean,
    requiresApproval: row.requires_approval as boolean,
    approvalThreshold: row.approval_threshold as number,
    approvedByRoles: row.approved_by_roles as FederationRole[],
    maxDailyCount: row.max_daily_count as number | undefined,
    contentRestrictions: (row.content_restrictions as unknown[]) || [],
    allowedTags: (row.allowed_tags as string[]) || [],
    canDelegate: row.can_delegate as boolean,
    delegatableToRoles: (row.delegatable_to_roles as FederationRole[]) || [],
    createdBy: row.created_by as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  } as EventSigningPermission;
}

function mapDbOverrideToInterface(
  row: Record<string, unknown>
): MemberSigningOverride {
  return {
    id: row.id as string,
    federationId: row.federation_id as string,
    memberDuid: row.member_duid as string,
    eventType: row.event_type as string,
    canSign: row.can_sign as boolean | undefined,
    requiresApproval: row.requires_approval as boolean | undefined,
    maxDailyCount: row.max_daily_count as number | undefined,
    customApprovedByRoles: row.custom_approved_by_roles as
      | FederationRole[]
      | undefined,
    validFrom: new Date(row.valid_from as string),
    validUntil: row.valid_until
      ? new Date(row.valid_until as string)
      : undefined,
    grantedBy: row.granted_by as string,
    grantReason: row.grant_reason as string | undefined,
    revokedBy: row.revoked_by as string | undefined,
    revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : undefined,
    revokeReason: row.revoke_reason as string | undefined,
    createdAt: new Date(row.created_at as string),
  };
}

function mapDbTimeWindowToInterface(
  row: Record<string, unknown>
): PermissionTimeWindow {
  return {
    id: row.id as string,
    permissionId: row.permission_id as string | undefined,
    overrideId: row.override_id as string | undefined,
    windowType: row.window_type as
      | "scheduled"
      | "temporary_elevation"
      | "cooldown",
    daysOfWeek: row.days_of_week as number[],
    startTime: row.start_time as string | undefined,
    endTime: row.end_time as string | undefined,
    timezone: row.timezone as string,
    elevationStart: row.elevation_start
      ? new Date(row.elevation_start as string)
      : undefined,
    elevationEnd: row.elevation_end
      ? new Date(row.elevation_end as string)
      : undefined,
    elevatedPermissions: row.elevated_permissions as
      | Partial<EventSigningPermission>
      | undefined,
    cooldownMinutes: row.cooldown_minutes as number | undefined,
    lastUsedAt: row.last_used_at
      ? new Date(row.last_used_at as string)
      : undefined,
    description: row.description as string | undefined,
    createdBy: row.created_by as string,
    createdAt: new Date(row.created_at as string),
  };
}

function mapDbDelegationToInterface(
  row: Record<string, unknown>
): FederationPermissionDelegation {
  return {
    id: row.id as string,
    sourceFederationId: row.source_federation_id as string,
    sourceRole: row.source_role as "steward" | "guardian",
    targetFederationId: row.target_federation_id as string | undefined,
    targetMemberDuid: row.target_member_duid as string | undefined,
    delegatedEventTypes: row.delegated_event_types as string[],
    canSubDelegate: (row.can_sub_delegate as boolean) ?? false,
    maxDailyUses: row.max_daily_uses as number | undefined,
    currentDailyUses: (row.current_daily_uses as number) ?? 0,
    usesResetAt: new Date(row.uses_reset_at as string),
    requiresSourceApproval: (row.requires_source_approval as boolean) ?? true,
    validFrom: new Date(row.valid_from as string),
    validUntil: row.valid_until
      ? new Date(row.valid_until as string)
      : undefined,
    revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : undefined,
    revokeReason: row.revoke_reason as string | undefined,
    createdBy: row.created_by as string,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Event Signing Permission Service
 *
 * All methods are static for ease of use without instantiation.
 */
export class EventSigningPermissionService {
  // ============================================================================
  // CORE PERMISSION CHECKING
  // ============================================================================

  /**
   * Check if a member can sign a specific event type
   *
   * Resolution order:
   * 1. Check for active member override
   * 2. Fall back to role-based permission
   * 3. Check daily usage limits
   * 4. Return detailed permission result
   */
  static async canSign(
    federationId: string,
    memberDuid: string,
    eventType: string,
    nostrKind?: number
  ): Promise<PermissionCheckResult> {
    try {
      // Step 1: Get member's role
      const role = await this.getMemberRole(federationId, memberDuid);
      if (!role) {
        return {
          allowed: false,
          requiresApproval: false,
          reason: "Member not found in federation",
        };
      }

      // Step 2: Check for active member override
      const override = await this.getActiveOverride(
        federationId,
        memberDuid,
        eventType
      );

      if (override) {
        // Override exists - use override settings
        const dailyUsage = await this.getDailyUsageCount(
          federationId,
          memberDuid,
          eventType
        );

        if (override.maxDailyCount && dailyUsage >= override.maxDailyCount) {
          return {
            allowed: false,
            requiresApproval: false,
            reason: `Daily limit reached (${dailyUsage}/${override.maxDailyCount})`,
            overrideId: override.id,
            dailyUsageRemaining: 0,
          };
        }

        if (override.canSign === false) {
          return {
            allowed: false,
            requiresApproval: false,
            reason: "Permission explicitly denied by override",
            overrideId: override.id,
          };
        }

        return {
          allowed: override.canSign ?? true,
          requiresApproval: override.requiresApproval ?? false,
          approvedByRoles: override.customApprovedByRoles,
          overrideId: override.id,
          dailyUsageRemaining: override.maxDailyCount
            ? override.maxDailyCount - dailyUsage
            : undefined,
        };
      }

      // Step 3: Get role-based permission
      const permission = await this.getRolePermission(
        federationId,
        role,
        eventType,
        nostrKind
      );

      if (!permission) {
        return {
          allowed: false,
          requiresApproval: false,
          reason: `No permission configured for ${role} to sign ${eventType}`,
        };
      }

      // Step 4: Check daily usage limit
      const dailyUsage = await this.getDailyUsageCount(
        federationId,
        memberDuid,
        eventType
      );

      if (permission.maxDailyCount && dailyUsage >= permission.maxDailyCount) {
        return {
          allowed: false,
          requiresApproval: false,
          reason: `Daily limit reached (${dailyUsage}/${permission.maxDailyCount})`,
          permissionId: permission.id,
          dailyUsageRemaining: 0,
        };
      }

      return {
        allowed: permission.canSign,
        requiresApproval: permission.requiresApproval,
        approvalThreshold: permission.approvalThreshold,
        approvedByRoles: permission.approvedByRoles,
        permissionId: permission.id,
        dailyUsageRemaining: permission.maxDailyCount
          ? permission.maxDailyCount - dailyUsage
          : undefined,
      };
    } catch (error) {
      console.error("[EventSigningPermissionService] canSign error:", error);
      return {
        allowed: false,
        requiresApproval: false,
        reason:
          error instanceof Error ? error.message : "Permission check failed",
      };
    }
  }

  /**
   * Get effective permissions for a member (role + overrides combined)
   */
  static async getEffectivePermissions(
    federationId: string,
    memberDuid: string
  ): Promise<EffectivePermission[]> {
    try {
      const role = await this.getMemberRole(federationId, memberDuid);
      if (!role) {
        return [];
      }

      // Get all role permissions
      const { data: rolePerms, error: roleError } = await getSupabase()
        .from("event_signing_permissions")
        .select("*")
        .eq("federation_id", federationId)
        .eq("role", role);

      if (roleError) {
        console.error(
          "[EventSigningPermissionService] Role perms error:",
          roleError
        );
        return [];
      }

      // Get all active overrides for this member
      const now = new Date().toISOString();
      const { data: overrides, error: overrideError } = await getSupabase()
        .from("member_signing_overrides")
        .select("*")
        .eq("federation_id", federationId)
        .eq("member_duid", memberDuid)
        .lte("valid_from", now)
        .is("revoked_at", null)
        .or(`valid_until.is.null,valid_until.gt.${now}`);

      if (overrideError) {
        console.error(
          "[EventSigningPermissionService] Override error:",
          overrideError
        );
      }

      // Build effective permissions map
      const effectiveMap = new Map<string, EffectivePermission>();

      // First, add all role permissions
      for (const row of rolePerms || []) {
        const perm = mapDbPermissionToInterface(row);
        const dailyUsage = await this.getDailyUsageCount(
          federationId,
          memberDuid,
          perm.eventType
        );

        effectiveMap.set(perm.eventType, {
          eventType: perm.eventType,
          nostrKind: perm.nostrKind,
          permissionCategory: perm.permissionCategory,
          canSign: perm.canSign,
          requiresApproval: perm.requiresApproval,
          approvalThreshold: perm.approvalThreshold,
          approvedByRoles: perm.approvedByRoles,
          maxDailyCount: perm.maxDailyCount,
          dailyUsageCount: dailyUsage,
          source: "role",
          sourceId: perm.id,
        });
      }

      // Then, apply overrides (they supersede role permissions)
      for (const row of overrides || []) {
        const override = mapDbOverrideToInterface(row);
        const existing = effectiveMap.get(override.eventType);
        const dailyUsage = await this.getDailyUsageCount(
          federationId,
          memberDuid,
          override.eventType
        );

        if (existing) {
          // Merge override with existing role permission
          effectiveMap.set(override.eventType, {
            ...existing,
            canSign: override.canSign ?? existing.canSign,
            requiresApproval:
              override.requiresApproval ?? existing.requiresApproval,
            maxDailyCount: override.maxDailyCount ?? existing.maxDailyCount,
            approvedByRoles:
              override.customApprovedByRoles ?? existing.approvedByRoles,
            dailyUsageCount: dailyUsage,
            source: "override",
            sourceId: override.id,
          });
        } else {
          // Override without base role permission
          effectiveMap.set(override.eventType, {
            eventType: override.eventType,
            permissionCategory: "content_posting", // Default category
            canSign: override.canSign ?? false,
            requiresApproval: override.requiresApproval ?? true,
            approvalThreshold: 1,
            approvedByRoles: override.customApprovedByRoles ?? ["guardian"],
            maxDailyCount: override.maxDailyCount,
            dailyUsageCount: dailyUsage,
            source: "override",
            sourceId: override.id,
          });
        }
      }

      return Array.from(effectiveMap.values());
    } catch (error) {
      console.error(
        "[EventSigningPermissionService] getEffectivePermissions error:",
        error
      );
      return [];
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Get a member's role in a federation
   */
  private static async getMemberRole(
    federationId: string,
    memberDuid: string
  ): Promise<FederationRole | null> {
    const { data, error } = await getSupabase()
      .from("family_members")
      .select("role")
      .eq("federation_duid", federationId)
      .eq("user_duid", memberDuid)
      .single();

    if (error || !data) {
      return null;
    }
    return data.role as FederationRole;
  }

  /**
   * Get active override for a member/event type
   */
  private static async getActiveOverride(
    federationId: string,
    memberDuid: string,
    eventType: string
  ): Promise<MemberSigningOverride | null> {
    const now = new Date().toISOString();
    const { data, error } = await getSupabase()
      .from("member_signing_overrides")
      .select("*")
      .eq("federation_id", federationId)
      .eq("member_duid", memberDuid)
      .eq("event_type", eventType)
      .lte("valid_from", now)
      .is("revoked_at", null)
      .or(`valid_until.is.null,valid_until.gt.${now}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }
    return mapDbOverrideToInterface(data);
  }

  /**
   * Get role-based permission for event type
   */
  private static async getRolePermission(
    federationId: string,
    role: FederationRole,
    eventType: string,
    nostrKind?: number
  ): Promise<EventSigningPermission | null> {
    let query = getSupabase()
      .from("event_signing_permissions")
      .select("*")
      .eq("federation_id", federationId)
      .eq("role", role)
      .eq("event_type", eventType);

    if (nostrKind !== undefined) {
      query = query.eq("nostr_kind", nostrKind);
    }

    const { data, error } = await query.limit(1).single();

    if (error || !data) {
      return null;
    }
    return mapDbPermissionToInterface(data);
  }

  /**
   * Get daily usage count for event type
   */
  private static async getDailyUsageCount(
    federationId: string,
    memberDuid: string,
    eventType: string
  ): Promise<number> {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );

    const { count, error } = await getSupabase()
      .from("signing_audit_log")
      .select("*", { count: "exact", head: true })
      .eq("federation_id", federationId)
      .eq("member_duid", memberDuid)
      .eq("event_type", eventType)
      .eq("status", "signed")
      .gte("requested_at", todayStart.toISOString());

    if (error) {
      console.error(
        "[EventSigningPermissionService] getDailyUsageCount error:",
        error
      );
      return 0;
    }
    return count || 0;
  }

  /**
   * Get all configured role permissions and active member overrides for a
   * federation. Used by the federation-wide permissions API and UI.
   */
  static async getFederationPermissionsConfig(federationId: string): Promise<
    ServiceResult<{
      rolePermissions: EventSigningPermission[];
      memberOverrides: MemberSigningOverride[];
    }>
  > {
    try {
      const { data: permissionRows, error: permissionsError } =
        await getSupabase()
          .from("event_signing_permissions")
          .select("*")
          .eq("federation_id", federationId);

      if (permissionsError) {
        return {
          success: false,
          error: `Failed to load role permissions: ${permissionsError.message}`,
          errorCode: "DB_ERROR",
        };
      }

      const { data: overrideRows, error: overridesError } = await getSupabase()
        .from("member_signing_overrides")
        .select("*")
        .eq("federation_id", federationId)
        // Only return active overrides for configuration UI
        .is("revoked_at", null);

      if (overridesError) {
        return {
          success: false,
          error: `Failed to load member overrides: ${overridesError.message}`,
          errorCode: "DB_ERROR",
        };
      }

      const rolePermissions = (permissionRows || []).map((row) =>
        mapDbPermissionToInterface(row)
      );
      const memberOverrides = (overrideRows || []).map((row) =>
        mapDbOverrideToInterface(row)
      );

      return {
        success: true,
        data: {
          rolePermissions,
          memberOverrides,
        },
      };
    } catch (error) {
      console.error(
        "[EventSigningPermissionService] getFederationPermissionsConfig error:",
        error
      );
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load federation permissions",
        errorCode: "UNKNOWN_ERROR",
      };
    }
  }

  // ============================================================================
  // PERMISSION CONFIGURATION (Guardian/Steward only)
  // ============================================================================

  /**
   * Configure permissions for a role
   * Only Guardians can configure any role
   * Stewards can only configure offspring/adult roles
   */
  static async configureRolePermissions(
    request: ConfigureRolePermissionsRequest,
    configurerDuid: string
  ): Promise<ServiceResult> {
    try {
      // Verify configurer has permission
      const configurerRole = await this.getMemberRole(
        request.federationId,
        configurerDuid
      );

      if (!configurerRole) {
        return {
          success: false,
          error: "Configurer not found in federation",
          errorCode: "CONFIGURER_NOT_FOUND",
        };
      }

      // Role hierarchy check
      const configurerLevel = ROLE_HIERARCHY[configurerRole];
      const targetLevel = ROLE_HIERARCHY[request.targetRole];

      // Guardian can configure any role, Steward can only configure lower roles
      if (configurerRole === "guardian") {
        // Guardian can configure all roles
      } else if (configurerRole === "steward") {
        if (targetLevel >= configurerLevel) {
          return {
            success: false,
            error: "Stewards can only configure offspring and adult roles",
            errorCode: "INSUFFICIENT_PERMISSION",
          };
        }
      } else {
        return {
          success: false,
          error: "Only guardians and stewards can configure permissions",
          errorCode: "INSUFFICIENT_PERMISSION",
        };
      }

      // Upsert permissions
      const upsertData = request.permissions.map((perm) => ({
        federation_id: request.federationId,
        role: request.targetRole,
        event_type: perm.eventType,
        nostr_kind: perm.nostrKind,
        permission_category: perm.permissionCategory,
        can_sign: perm.canSign ?? false,
        requires_approval: perm.requiresApproval ?? true,
        approval_threshold: perm.approvalThreshold ?? 1,
        approved_by_roles: perm.approvedByRoles ?? ["guardian"],
        max_daily_count: perm.maxDailyCount,
        can_delegate: perm.canDelegate ?? false,
        created_by: configurerDuid,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await getSupabase()
        .from("event_signing_permissions")
        .upsert(upsertData, {
          onConflict: "federation_id,role,event_type",
        });

      if (error) {
        return {
          success: false,
          error: `Failed to configure permissions: ${error.message}`,
          errorCode: "DB_ERROR",
        };
      }

      return { success: true };
    } catch (error) {
      console.error(
        "[EventSigningPermissionService] configureRolePermissions error:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Configuration failed",
        errorCode: "UNKNOWN_ERROR",
      };
    }
  }

  /**
   * Grant member-specific permission override
   */
  static async setMemberOverride(
    request: SetMemberOverrideRequest,
    granterDuid: string
  ): Promise<ServiceResult<{ overrideId: string }>> {
    try {
      // Verify granter has permission
      const granterRole = await this.getMemberRole(
        request.federationId,
        granterDuid
      );
      const targetRole = await this.getMemberRole(
        request.federationId,
        request.memberDuid
      );

      if (!granterRole) {
        return {
          success: false,
          error: "Granter not found in federation",
          errorCode: "GRANTER_NOT_FOUND",
        };
      }

      if (!targetRole) {
        return {
          success: false,
          error: "Target member not found in federation",
          errorCode: "MEMBER_NOT_FOUND",
        };
      }

      // Check hierarchy: granter must be higher than target
      const granterLevel = ROLE_HIERARCHY[granterRole];
      const targetLevel = ROLE_HIERARCHY[targetRole];

      if (granterLevel <= targetLevel) {
        return {
          success: false,
          error: "Cannot grant override to member of equal or higher role",
          errorCode: "INSUFFICIENT_PERMISSION",
        };
      }

      // Adults can only grant overrides to offspring
      if (granterRole === "adult" && targetRole !== "offspring") {
        return {
          success: false,
          error: "Adults can only manage offspring permissions",
          errorCode: "INSUFFICIENT_PERMISSION",
        };
      }

      // Insert override
      const { data, error } = await getSupabase()
        .from("member_signing_overrides")
        .insert({
          federation_id: request.federationId,
          member_duid: request.memberDuid,
          event_type: request.eventType,
          can_sign: request.canSign,
          requires_approval: request.requiresApproval,
          max_daily_count: request.maxDailyCount,
          valid_from: new Date().toISOString(),
          valid_until: request.validUntil?.toISOString(),
          granted_by: granterDuid,
          grant_reason: request.grantReason,
        })
        .select("id")
        .single();

      if (error) {
        return {
          success: false,
          error: `Failed to set override: ${error.message}`,
          errorCode: "DB_ERROR",
        };
      }

      return {
        success: true,
        data: { overrideId: data.id as string },
      };
    } catch (error) {
      console.error(
        "[EventSigningPermissionService] setMemberOverride error:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Override failed",
        errorCode: "UNKNOWN_ERROR",
      };
    }
  }

  /**
   * Revoke a specific member override by its ID. Used by the control board
   * when managing overrides individually.
   */
  static async revokeMemberOverrideById(
    federationId: string,
    revokerDuid: string,
    overrideId: string,
    revokeReason?: string
  ): Promise<ServiceResult> {
    try {
      // Verify revoker belongs to federation and has Guardian/Steward role
      const revokerRole = await this.getMemberRole(federationId, revokerDuid);

      if (!revokerRole) {
        return {
          success: false,
          error: "Revoker not found in federation",
          errorCode: "MEMBER_NOT_FOUND",
        };
      }

      if (revokerRole !== "guardian" && revokerRole !== "steward") {
        return {
          success: false,
          error: "Only guardians and stewards can revoke overrides by id",
          errorCode: "INSUFFICIENT_PERMISSION",
        };
      }

      const { data, error } = await getSupabase()
        .from("member_signing_overrides")
        .update({
          revoked_by: revokerDuid,
          revoked_at: new Date().toISOString(),
          revoke_reason: revokeReason,
        })
        .eq("id", overrideId)
        .eq("federation_id", federationId)
        .is("revoked_at", null)
        .select("id");

      if (error) {
        return {
          success: false,
          error: `Failed to revoke override: ${error.message}`,
          errorCode: "DB_ERROR",
        };
      }

      if (!data || data.length === 0) {
        return {
          success: false,
          error: "Override not found or already revoked",
          errorCode: "NOT_FOUND",
        };
      }

      return { success: true };
    } catch (error) {
      console.error(
        "[EventSigningPermissionService] revokeMemberOverrideById error:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Revoke failed",
        errorCode: "UNKNOWN_ERROR",
      };
    }
  }

  /**
   * Revoke member permission override
   */
  static async revokeMemberOverride(
    federationId: string,
    revokerDuid: string,
    memberDuid: string,
    eventType: string,
    revokeReason?: string
  ): Promise<ServiceResult> {
    try {
      // Verify revoker has permission (same rules as granting)
      const revokerRole = await this.getMemberRole(federationId, revokerDuid);
      const targetRole = await this.getMemberRole(federationId, memberDuid);

      if (!revokerRole || !targetRole) {
        return {
          success: false,
          error: "Revoker or target not found",
          errorCode: "MEMBER_NOT_FOUND",
        };
      }

      if (ROLE_HIERARCHY[revokerRole] <= ROLE_HIERARCHY[targetRole]) {
        return {
          success: false,
          error: "Cannot revoke override from member of equal or higher role",
          errorCode: "INSUFFICIENT_PERMISSION",
        };
      }

      const { data, error } = await getSupabase()
        .from("member_signing_overrides")
        .update({
          revoked_by: revokerDuid,
          revoked_at: new Date().toISOString(),
          revoke_reason: revokeReason,
        })
        .eq("federation_id", federationId)
        .eq("member_duid", memberDuid)
        .eq("event_type", eventType)
        .is("revoked_at", null)
        .select("id");

      if (error) {
        return {
          success: false,
          error: `Failed to revoke override: ${error.message}`,
          errorCode: "DB_ERROR",
        };
      }

      if (!data || data.length === 0) {
        return {
          success: false,
          error: "Override not found or already revoked",
          errorCode: "NOT_FOUND",
        };
      }

      return { success: true };
    } catch (error) {
      console.error(
        "[EventSigningPermissionService] revokeMemberOverride error:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Revoke failed",
        errorCode: "UNKNOWN_ERROR",
      };
    }
  }

  // ============================================================================
  // TIME-BASED PERMISSION CHECKING
  // ============================================================================

  /**
   * Check if current time is within permission window
   */
  static async isWithinTimeWindow(
    permissionId?: string,
    overrideId?: string
  ): Promise<TimeWindowCheckResult> {
    try {
      if (!permissionId && !overrideId) {
        return { allowed: true }; // No time restrictions if no ID provided
      }

      // Get time windows for this permission/override
      let query = getSupabase().from("permission_time_windows").select("*");

      // Use OR logic when both IDs are provided (window belongs to either)
      if (permissionId && overrideId) {
        query = query.or(
          `permission_id.eq.${permissionId},override_id.eq.${overrideId}`
        );
      } else if (permissionId) {
        query = query.eq("permission_id", permissionId);
      } else if (overrideId) {
        query = query.eq("override_id", overrideId);
      }

      const { data: windows, error } = await query;

      if (error || !windows || windows.length === 0) {
        return { allowed: true }; // No time windows configured
      }

      const now = new Date();
      const currentDay = now.getDay(); // 0-6, Sunday is 0
      const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS

      for (const row of windows) {
        const window = mapDbTimeWindowToInterface(row);

        switch (window.windowType) {
          case "scheduled":
            // Check if current day/time is within scheduled window
            if (window.daysOfWeek.includes(currentDay)) {
              if (window.startTime && window.endTime) {
                if (
                  currentTime >= window.startTime &&
                  currentTime <= window.endTime
                ) {
                  return { allowed: true, currentWindow: window };
                }
              } else {
                // Day matches, no time restriction
                return { allowed: true, currentWindow: window };
              }
            }
            break;

          case "temporary_elevation":
            // Check if within elevation period
            if (window.elevationStart && window.elevationEnd) {
              if (now >= window.elevationStart && now <= window.elevationEnd) {
                return { allowed: true, currentWindow: window };
              }
            }
            break;

          case "cooldown":
            // Check if cooldown has passed since last use
            if (window.cooldownMinutes && window.lastUsedAt) {
              const cooldownEnd = new Date(
                window.lastUsedAt.getTime() + window.cooldownMinutes * 60 * 1000
              );
              if (now < cooldownEnd) {
                const remainingSeconds = Math.ceil(
                  (cooldownEnd.getTime() - now.getTime()) / 1000
                );
                return {
                  allowed: false,
                  reason: `Cooldown period: ${remainingSeconds}s remaining`,
                  cooldownRemaining: remainingSeconds,
                };
              }
            }
            return { allowed: true, currentWindow: window };
        }
      }

      // If we have scheduled windows but none matched, find next window
      const scheduledWindows = windows.filter(
        (w) => w.window_type === "scheduled"
      );
      if (scheduledWindows.length > 0) {
        return {
          allowed: false,
          reason: "Outside scheduled signing hours",
          // TODO: Calculate nextWindowStart based on schedule
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error(
        "[EventSigningPermissionService] isWithinTimeWindow error:",
        error
      );
      return {
        allowed: false,
        reason: "Failed to check time window",
      };
    }
  }

  /**
   * Configure time-based permission window
   * Only Guardians and Stewards can configure time windows
   */
  static async setTimeWindow(
    configurerDuid: string,
    request: SetTimeWindowRequest
  ): Promise<ServiceResult<{ windowId: string }>> {
    try {
      // Verify we have a permission or override to attach to
      if (!request.permissionId && !request.overrideId) {
        return {
          success: false,
          error: "Must specify permissionId or overrideId",
          errorCode: "MISSING_TARGET",
        };
      }

      // Authorization check: verify configurer has Guardian/Steward role
      const configurerRole = await this.getMemberRole(
        request.federationId,
        configurerDuid
      );

      if (!configurerRole) {
        return {
          success: false,
          error: "Configurer not found in federation",
          errorCode: "CONFIGURER_NOT_FOUND",
        };
      }

      if (configurerRole !== "guardian" && configurerRole !== "steward") {
        return {
          success: false,
          error: "Only guardians and stewards can configure time windows",
          errorCode: "INSUFFICIENT_PERMISSION",
        };
      }

      const { data, error } = await getSupabase()
        .from("permission_time_windows")
        .insert({
          permission_id: request.permissionId,
          override_id: request.overrideId,
          window_type: request.windowType,
          days_of_week: request.daysOfWeek || [],
          start_time: request.startTime,
          end_time: request.endTime,
          timezone: request.timezone || "UTC",
          elevation_start: request.elevationStart?.toISOString(),
          elevation_end: request.elevationEnd?.toISOString(),
          elevated_permissions: request.elevatedPermissions,
          cooldown_minutes: request.cooldownMinutes,
          description: request.description,
          created_by: configurerDuid,
        })
        .select("id")
        .single();

      if (error) {
        return {
          success: false,
          error: `Failed to set time window: ${error.message}`,
          errorCode: "DB_ERROR",
        };
      }

      return {
        success: true,
        data: { windowId: data.id as string },
      };
    } catch (error) {
      console.error(
        "[EventSigningPermissionService] setTimeWindow error:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Time window failed",
        errorCode: "UNKNOWN_ERROR",
      };
    }
  }

  // ============================================================================
  // CROSS-FEDERATION DELEGATION
  // ============================================================================

  /**
   * Check for cross-federation delegated permissions
   */
  static async checkDelegatedPermission(
    sourceFederationId: string,
    targetFederationId: string,
    memberDuid: string,
    eventType: string
  ): Promise<DelegationCheckResult> {
    try {
      // Validate UUIDs to prevent query injection via string interpolation
      if (!isValidUuid(targetFederationId) || !isValidUuid(memberDuid)) {
        return { allowed: false, requiresSourceApproval: false };
      }

      const now = new Date().toISOString();

      // Find active delegation
      const { data: delegation, error } = await getSupabase()
        .from("federation_permission_delegations")
        .select("*")
        .eq("source_federation_id", sourceFederationId)
        .or(
          `target_federation_id.eq.${targetFederationId},target_member_duid.eq.${memberDuid}`
        )
        .contains("delegated_event_types", [eventType])
        .lte("valid_from", now)
        .is("revoked_at", null)
        .or(`valid_until.is.null,valid_until.gt.${now}`)
        .limit(1)
        .single();

      if (error || !delegation) {
        return {
          allowed: false,
          requiresSourceApproval: false,
        };
      }

      // Type assertion for delegation row from Supabase
      const del = delegation as {
        id: string;
        max_daily_uses: number | null;
        current_daily_uses: number;
        requires_source_approval: boolean;
        valid_until: string | null;
      };

      // Check daily usage limit
      if (del.max_daily_uses !== null) {
        if (del.current_daily_uses >= del.max_daily_uses) {
          return {
            allowed: false,
            delegationId: del.id,
            requiresSourceApproval: del.requires_source_approval,
            remainingDailyUses: 0,
          };
        }
      }

      return {
        allowed: true,
        delegationId: del.id,
        requiresSourceApproval: del.requires_source_approval,
        remainingDailyUses:
          del.max_daily_uses !== null
            ? del.max_daily_uses - del.current_daily_uses
            : undefined,
        validUntil: del.valid_until ? new Date(del.valid_until) : undefined,
      };
    } catch (error) {
      console.error(
        "[EventSigningPermissionService] checkDelegatedPermission error:",
        error
      );
      return {
        allowed: false,
        requiresSourceApproval: false,
      };
    }
  }

  /**
   * Create cross-federation permission delegation
   * Only guardians can create delegations
   */
  static async createDelegation(
    sourceFederationId: string,
    granterDuid: string,
    request: CreateDelegationRequest
  ): Promise<ServiceResult<{ delegationId: string }>> {
    try {
      // Verify granter is a guardian
      const granterRole = await this.getMemberRole(
        sourceFederationId,
        granterDuid
      );

      if (granterRole !== "guardian") {
        return {
          success: false,
          error: "Only guardians can create cross-federation delegations",
          errorCode: "INSUFFICIENT_PERMISSION",
        };
      }

      const { data, error } = await getSupabase()
        .from("federation_permission_delegations")
        .insert({
          source_federation_id: sourceFederationId,
          source_role: "guardian",
          target_federation_id: request.targetFederationId,
          target_member_duid: request.targetMemberDuid,
          delegated_event_types: request.delegatedEventTypes,
          can_sub_delegate: request.canSubDelegate ?? false,
          max_daily_uses: request.maxDailyUses,
          current_daily_uses: 0,
          // Align reset time with midnight UTC for consistency with getDailyUsageCount
          uses_reset_at: getNextMidnightUtc().toISOString(),
          requires_source_approval: request.requiresSourceApproval ?? true,
          valid_from: new Date().toISOString(),
          valid_until: request.validUntil?.toISOString(),
          created_by: granterDuid,
        })
        .select("id")
        .single();

      if (error) {
        return {
          success: false,
          error: `Failed to create delegation: ${error.message}`,
          errorCode: "DB_ERROR",
        };
      }

      return {
        success: true,
        data: { delegationId: data.id as string },
      };
    } catch (error) {
      console.error(
        "[EventSigningPermissionService] createDelegation error:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Delegation failed",
        errorCode: "UNKNOWN_ERROR",
      };
    }
  }

  /**
   * Get a single delegation by id, including usage statistics
   */
  static async getDelegationById(
    delegationId: string
  ): Promise<ServiceResult<FederationPermissionDelegation>> {
    try {
      const { data, error } = await getSupabase()
        .from("federation_permission_delegations")
        .select("*")
        .eq("id", delegationId)
        .single();

      if (error || !data) {
        return {
          success: false,
          error: error
            ? `Failed to load delegation: ${error.message}`
            : "Delegation not found",
          errorCode: error ? "DB_ERROR" : "NOT_FOUND",
        };
      }

      return {
        success: true,
        data: mapDbDelegationToInterface(data as Record<string, unknown>),
      };
    } catch (error) {
      console.error(
        "[EventSigningPermissionService] getDelegationById error:",
        error
      );
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to load delegation",
        errorCode: "UNKNOWN_ERROR",
      };
    }
  }

  // ============================================================================
  // ALLIANCE PERMISSIONS
  // ============================================================================

  /**
   * Get alliance permissions for a federation
   */
  static async getAlliancePermissions(
    federationId: string
  ): Promise<AlliancePermissionsResult> {
    try {
      // Find alliances this federation is part of
      const { data: alliances, error: allianceError } = await getSupabase()
        .from("federation_alliances")
        .select("*")
        .contains("member_federations", [federationId])
        .eq("status", "active");

      if (allianceError || !alliances || alliances.length === 0) {
        return {
          alliances: [],
          inheritedPermissions: [],
        };
      }

      // Define the alliance row type for proper typing
      type AllianceRow = {
        id: string;
        alliance_name: string;
        shared_categories: PermissionCategory[];
        member_federations: string[];
        inherits_permissions_from?: string;
      };

      const result: AlliancePermissionsResult = {
        alliances: (alliances as AllianceRow[]).map((a) => ({
          allianceId: a.id,
          allianceName: a.alliance_name,
          sharedCategories: a.shared_categories,
          memberFederations: a.member_federations,
        })),
        inheritedPermissions: [],
      };

      // Get inherited permissions from alliance source federations
      for (const alliance of alliances as AllianceRow[]) {
        if (
          alliance.inherits_permissions_from &&
          alliance.inherits_permissions_from !== federationId
        ) {
          const { data: perms } = await getSupabase()
            .from("event_signing_permissions")
            .select("*")
            .eq("federation_id", alliance.inherits_permissions_from)
            .in("permission_category", alliance.shared_categories);

          if (perms) {
            result.inheritedPermissions.push(
              ...perms.map((row) =>
                mapDbPermissionToInterface(row as Record<string, unknown>)
              )
            );
          }
        }
      }

      return result;
    } catch (error) {
      console.error(
        "[EventSigningPermissionService] getAlliancePermissions error:",
        error
      );
      return {
        alliances: [],
        inheritedPermissions: [],
      };
    }
  }
}
