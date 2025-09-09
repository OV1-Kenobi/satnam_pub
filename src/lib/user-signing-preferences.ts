/**
 * User Signing Preferences Service
 *
 * Manages user preferences for message signing methods to provide
 * seamless UX without unexpected browser extension prompts.
 * Integrates with HybridMessageSigning to respect user choices.
 */

import { SecureTokenManager } from "./auth/secure-token-manager";
import { supabase } from "./supabase";

export type SigningMethod = "session" | "nip07" | "nfc";

export interface UserSigningPreferences {
  id: string;
  userDuid: string;

  // Method preferences
  preferredMethod: SigningMethod;
  fallbackMethod?: SigningMethod;

  // UX preferences
  autoFallback: boolean;
  showSecurityWarnings: boolean;
  rememberChoice: boolean;

  // Session preferences
  sessionDurationMinutes: number;
  maxOperationsPerSession: number;

  // NIP-07 preferences
  nip07AutoApprove: boolean;

  // NFC preferences (future)
  nfcPinTimeoutSeconds: number;
  nfcRequireConfirmation: boolean;

  // Session lifetime behavior
  sessionLifetimeMode?: "browser_session" | "timed";

  // New derived controls (mapped onto sessionLifetimeMode/sessionDurationMinutes)
  enableSessionTimeout?: boolean; // default false
  customSessionTimeoutMinutes?: number; // default 15

  // Metadata
  createdAt: string;
  updatedAt: string;
  lastUsedMethod?: SigningMethod;
  lastUsedAt?: string;
}

export interface SigningMethodInfo {
  id: SigningMethod;
  name: string;
  description: string;
  securityLevel: "maximum" | "high" | "medium";
  convenience: "high" | "medium" | "low";
  available: boolean;
  requiresSetup: boolean;
  setupInstructions?: string;
}

export class UserSigningPreferencesService {
  private static instance: UserSigningPreferencesService | null = null;
  private cachedPreferences: UserSigningPreferences | null = null;

  private constructor() {}

  static getInstance(): UserSigningPreferencesService {
    if (!UserSigningPreferencesService.instance) {
      UserSigningPreferencesService.instance =
        new UserSigningPreferencesService();
    }
    return UserSigningPreferencesService.instance;
  }

  /**
   * Get user's signing preferences
   */
  async getUserPreferences(): Promise<UserSigningPreferences | null> {
    try {
      const token = SecureTokenManager.getAccessToken();
      if (!token) {
        console.log(
          "🔐 UserSigningPreferences: No auth token, cannot load preferences"
        );
        return null;
      }

      // Use cached preferences if available and recent
      if (this.cachedPreferences) {
        const cacheAge =
          Date.now() - new Date(this.cachedPreferences.updatedAt).getTime();
        if (cacheAge < 5 * 60 * 1000) {
          // 5 minutes cache
          return this.cachedPreferences;
        }
      }

      // Get hashedId from token to filter by owner_hash
      const tokenPayload = SecureTokenManager.parseTokenPayload(token);
      if (!tokenPayload?.hashedId) {
        console.log("🔐 UserSigningPreferences: No hashedId in token");
        return null;
      }

      // Set RLS context variable for the query
      try {
        await supabase.rpc("set_app_config", {
          setting_name: "app.current_user_hash",
          setting_value: tokenPayload.hashedId,
          is_local: true,
        });
      } catch (contextError) {
        console.log(
          "🔐 UserSigningPreferences: Could not set RLS context:",
          contextError
        );
      }

      const { data, error } = await supabase
        .from("user_signing_preferences")
        .select("*")
        .eq("owner_hash", tokenPayload.hashedId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No rows returned
          console.log(
            "🔐 UserSigningPreferences: No preferences found, creating defaults"
          );
          return await this.createDefaultPreferences();
        }
        throw error;
      }

      const preferences: UserSigningPreferences = {
        id: data.id,
        userDuid: data.owner_hash, // Updated to match new schema
        preferredMethod: data.preferred_method,
        fallbackMethod: data.fallback_method,
        autoFallback: data.auto_fallback,
        showSecurityWarnings: data.show_security_warnings,
        rememberChoice: data.remember_choice,
        sessionDurationMinutes: data.session_duration_minutes,
        maxOperationsPerSession: data.max_operations_per_session,
        nip07AutoApprove: data.nip07_auto_approve,
        nfcPinTimeoutSeconds: data.nfc_pin_timeout_seconds,
        nfcRequireConfirmation: data.nfc_require_confirmation,
        sessionLifetimeMode: data.session_lifetime_mode ?? undefined,
        // Derived controls
        enableSessionTimeout:
          (data.session_lifetime_mode ?? undefined) === "timed",
        customSessionTimeoutMinutes: data.session_duration_minutes ?? 15,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        lastUsedMethod: data.last_used_method,
        lastUsedAt: data.last_used_at,
      };

      this.cachedPreferences = preferences;
      return preferences;
    } catch (error) {
      console.error(
        "🔐 UserSigningPreferences: Error loading preferences:",
        error
      );
      return null;
    }
  }

  /**
   * Update user's signing preferences
   */
  async updatePreferences(
    updates: Partial<UserSigningPreferences>
  ): Promise<boolean> {
    try {
      const sessionLifetimeModeToSend =
        typeof updates.enableSessionTimeout === "boolean"
          ? updates.enableSessionTimeout
            ? "timed"
            : "browser_session"
          : updates.sessionLifetimeMode;

      const sessionDurationToSend =
        updates.customSessionTimeoutMinutes ?? updates.sessionDurationMinutes;

      const { error } = await supabase
        .from("user_signing_preferences")
        .update({
          preferred_method: updates.preferredMethod,
          fallback_method: updates.fallbackMethod,
          auto_fallback: updates.autoFallback,
          show_security_warnings: updates.showSecurityWarnings,
          remember_choice: updates.rememberChoice,
          session_duration_minutes: sessionDurationToSend,
          max_operations_per_session: updates.maxOperationsPerSession,
          nip07_auto_approve: updates.nip07AutoApprove,
          nfc_pin_timeout_seconds: updates.nfcPinTimeoutSeconds,
          nfc_require_confirmation: updates.nfcRequireConfirmation,
          session_lifetime_mode: sessionLifetimeModeToSend,
        })
        .eq("owner_hash", updates.userDuid || this.cachedPreferences?.userDuid); // Updated to match new schema

      if (error) throw error;

      // Clear cache to force reload
      this.cachedPreferences = null;
      console.log(
        "🔐 UserSigningPreferences: Preferences updated successfully"
      );
      return true;
    } catch (error) {
      console.error(
        "🔐 UserSigningPreferences: Error updating preferences:",
        error
      );
      return false;
    }
  }

  /**
   * Record successful use of a signing method
   */
  async recordMethodUsage(method: SigningMethod): Promise<void> {
    try {
      // Get current hashedId from token for owner_hash lookup
      const token = SecureTokenManager.getAccessToken();
      if (!token) {
        console.error(
          "🔐 UserSigningPreferences: No token available for method usage recording"
        );
        return;
      }

      const tokenPayload = SecureTokenManager.parseTokenPayload(token);
      if (!tokenPayload?.hashedId) {
        console.error(
          "🔐 UserSigningPreferences: No hashedId in token for method usage recording"
        );
        return;
      }

      await supabase
        .from("user_signing_preferences")
        .update({
          last_used_method: method,
          last_used_at: new Date().toISOString(),
        })
        .eq("owner_hash", tokenPayload.hashedId); // Use hashedId from token

      console.log("🔐 UserSigningPreferences: Recorded method usage:", method);
    } catch (error) {
      console.error(
        "🔐 UserSigningPreferences: Error recording method usage:",
        error
      );
    }
  }

  /**
   * Get available signing methods with current status
   */
  async getAvailableSigningMethods(): Promise<SigningMethodInfo[]> {
    const methods: SigningMethodInfo[] = [
      {
        id: "session",
        name: "Secure Session",
        description: "Temporary key storage for convenient signing",
        securityLevel: "high",
        convenience: "high",
        available: false, // Will be updated by availability check
        requiresSetup: true,
        setupInstructions:
          "Sign in to create a secure session for message signing",
      },
      {
        id: "nip07",
        name: "NIP-07 Browser Extension",
        description: "Zero-knowledge signing with browser extension",
        securityLevel: "maximum",
        convenience: "medium",
        available: typeof window !== "undefined" && !!window.nostr,
        requiresSetup: !window.nostr,
        setupInstructions:
          "Install a NIP-07 compatible browser extension like Alby or nos2x",
      },
      {
        id: "nfc",
        name: "NFC Physical MFA",
        description:
          "Hardware-based signing with physical device (most secure)",
        securityLevel: "maximum",
        convenience: "low",
        available: false, // Coming soon
        requiresSetup: true,
        setupInstructions:
          "NFC Physical MFA will be available in a future update",
      },
    ];

    return methods;
  }

  /**
   * Create default preferences for new users
   */
  private async createDefaultPreferences(): Promise<UserSigningPreferences | null> {
    try {
      // Get session hashedId to use as owner_hash (matches new schema)
      const token = SecureTokenManager.getAccessToken();
      if (!token) {
        throw new Error("No authentication token available");
      }

      // Parse token to get hashedId
      const tokenPayload = SecureTokenManager.parseTokenPayload(token);
      if (!tokenPayload?.hashedId) {
        throw new Error("No hashedId available in token");
      }

      const defaultPrefs = {
        owner_hash: tokenPayload.hashedId, // Updated to match new schema
        preferred_method: "session" as SigningMethod,
        fallback_method: "nip07" as SigningMethod,
        auto_fallback: true,
        show_security_warnings: true,
        remember_choice: true,
        session_duration_minutes: 15,
        max_operations_per_session: 50,
        nip07_auto_approve: false,
        nfc_pin_timeout_seconds: 30,
        nfc_require_confirmation: true,
        session_lifetime_mode: "browser_session" as const,
      };

      // Use RLS-friendly RPC to perform INSERT/UPSERT within the same transaction
      const { data, error } = await supabase.rpc(
        "upsert_user_signing_preferences",
        {
          p_owner_hash: defaultPrefs.owner_hash,
          p_preferred_method: defaultPrefs.preferred_method,
          p_fallback_method: defaultPrefs.fallback_method,
          p_auto_fallback: defaultPrefs.auto_fallback,
          p_show_security_warnings: defaultPrefs.show_security_warnings,
          p_remember_choice: defaultPrefs.remember_choice,
          p_session_duration_minutes: defaultPrefs.session_duration_minutes,
          p_max_operations_per_session: defaultPrefs.max_operations_per_session,
          p_nip07_auto_approve: defaultPrefs.nip07_auto_approve,
          p_nfc_pin_timeout_seconds: defaultPrefs.nfc_pin_timeout_seconds,
          p_nfc_require_confirmation: defaultPrefs.nfc_require_confirmation,
          p_session_lifetime_mode: defaultPrefs.session_lifetime_mode,
        }
      );

      if (error) throw error;

      console.log(
        "🔐 UserSigningPreferences: Created/Updated default preferences via RPC"
      );
      return this.mapDatabaseToPreferences(data);
    } catch (error) {
      console.error(
        "🔐 UserSigningPreferences: Error creating default preferences:",
        error
      );
      return null;
    }
  }

  /**
   * Map database row to preferences object
   */
  private mapDatabaseToPreferences(data: any): UserSigningPreferences {
    return {
      id: data.id,
      userDuid: data.owner_hash, // Updated to match new schema
      preferredMethod: data.preferred_method,
      fallbackMethod: data.fallback_method,
      autoFallback: data.auto_fallback,
      showSecurityWarnings: data.show_security_warnings,
      rememberChoice: data.remember_choice,
      sessionDurationMinutes: data.session_duration_minutes,
      maxOperationsPerSession: data.max_operations_per_session,
      nip07AutoApprove: data.nip07_auto_approve,
      nfcPinTimeoutSeconds: data.nfc_pin_timeout_seconds,
      nfcRequireConfirmation: data.nfc_require_confirmation,
      sessionLifetimeMode: data.session_lifetime_mode ?? undefined,
      // Derived controls
      enableSessionTimeout:
        (data.session_lifetime_mode ?? undefined) === "timed",
      customSessionTimeoutMinutes: data.session_duration_minutes ?? 15,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      lastUsedMethod: data.last_used_method,
      lastUsedAt: data.last_used_at,
    };
  }

  /**
   * Clear cached preferences (useful after updates)
   */
  clearCache(): void {
    this.cachedPreferences = null;
  }
}

// Global instance
export const userSigningPreferences =
  UserSigningPreferencesService.getInstance();
