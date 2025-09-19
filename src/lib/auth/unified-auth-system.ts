/**
 * Unified Authentication System
 *
 * Consolidates usePrivacyFirstAuth and user-identities-auth into a single,
 * comprehensive authentication system with route protection and session management.
 *
 * Features:
 * - Privacy-first architecture with hashed UUIDs
 * - Multiple authentication methods (NIP-05/Password, NIP-07, OTP)
 * - Protected route guards for sensitive areas
 * - Active session validation and token management
 * - Account status verification
 * - Seamless integration with Identity Forge and Nostrich Signin
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClientSessionVault,
  hasVaultRecord,
  setNFCPolicy,
} from "./client-session-vault";
import { fetchWithAuth } from "./fetch-with-auth";
import { awaitNFC } from "./nfc-auth-bridge";
import { nsecSessionBridge } from "./nsec-session-bridge";
import { recoverySessionBridge } from "./recovery-session-bridge";
import SecureTokenManager from "./secure-token-manager";
import { AuthResult, UserIdentity } from "./user-identities-auth";

const USE_VAULT =
  (import.meta.env.VITE_USE_CLIENT_SESSION_VAULT ?? "true") === "true";

// Local helper to read vault auto-prompt preference (opt-in)
function shouldAutoPromptVault(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const raw = localStorage.getItem("satnam.vault.config");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return !!parsed?.autoPrompt;
  } catch {
    return false;
  }
}

// Protected areas that require authentication
export const PROTECTED_AREAS = {
  COMMUNICATIONS: "/communications",
  FAMILY_FINANCE: "/family/finance",
  INDIVIDUAL_FINANCE: "/finance",
  PRIVACY_SETTINGS: "/privacy",
  USER_SOVEREIGNTY: "/sovereignty",
  LN_NODE_MANAGEMENT: "/lightning",
  N424_FEATURES: "/n424",
  NFC_AUTH: "/nfc-auth",
  PROFILE_SETTINGS: "/profile",
  FAMILY_FOUNDRY: "/family/foundry",
  PEER_INVITATIONS: "/invitations",
} as const;

export type ProtectedArea =
  (typeof PROTECTED_AREAS)[keyof typeof PROTECTED_AREAS];

// Authentication state interface
export interface UnifiedAuthState {
  user: UserIdentity | null;
  sessionToken: string | null;
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  accountActive: boolean;
  sessionValid: boolean;
  lastValidated: number | null;
}

// Authentication actions interface
export interface UnifiedAuthActions {
  // Primary authentication methods
  authenticateNIP05Password: (
    nip05: string,
    password: string
  ) => Promise<boolean>;
  authenticateNIP07: (
    challenge: string,
    signature: string,
    pubkey: string
  ) => Promise<boolean>;
  // Physical MFA (NFC) unlock/signing readiness
  authenticateNFC: () => Promise<boolean>;

  // Session management
  validateSession: () => Promise<boolean>;
  refreshSession: () => Promise<boolean>;
  logout: () => Promise<void>;

  // Route protection
  canAccessProtectedArea: (area: ProtectedArea) => boolean;
  requireAuthentication: (area: ProtectedArea) => Promise<boolean>;

  // Account management
  checkAccountStatus: () => Promise<boolean>;

  // Error handling
  clearError: () => void;

  // Expose internal handler for post-registration flows
  handleAuthSuccess: (result: AuthResult) => Promise<boolean>;
}

// Session validation interval (5 minutes)
const SESSION_VALIDATION_INTERVAL = 5 * 60 * 1000;

// User data storage in sessionStorage (safe for page reload, cleared on tab close)
const SESSION_STORAGE_KEYS = {
  USER: "satnam_user_data",
  LAST_VALIDATED: "satnam_last_validated",
} as const;

/**
 * Unified Authentication Hook
 * Replaces usePrivacyFirstAuth with comprehensive functionality
 */
export function useUnifiedAuth(): UnifiedAuthState & UnifiedAuthActions {
  // CRITICAL FIX: Track initialization to prevent state conflicts
  const initializationRef = useRef({
    hasInitialized: false,
    isInitializing: false,
  });
  // CRITICAL FIX: Track authenticated state synchronously to avoid race conditions
  const authenticatedRef = useRef(false);

  // Deduplicate session-user fallback fetches to avoid 429s
  const sessionUserFetchRef = useRef<{
    done: boolean;
    inFlight: boolean;
    retries: number;
  }>({
    done: false,
    inFlight: false,
    retries: 0,
  });

  const [state, setState] = useState<UnifiedAuthState>({
    user: null,
    sessionToken: null,
    authenticated: false,
    loading: true, // Start with loading to check existing session
    error: null,
    accountActive: false,
    sessionValid: false,
    lastValidated: null,
  });
  // Removed vault initialization from app startup - vault should only be called on user action

  /**
   * Clear stored session data
   */
  const clearStoredSession = useCallback(async () => {
    await SecureTokenManager.logout();
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.USER);
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.LAST_VALIDATED);
  }, []);

  /**
   * Load and validate stored session on mount
   */
  const initializeAuth = useCallback(async () => {
    console.log("🔄 Initializing authentication state...");

    // CRITICAL FIX: Prevent multiple initializations and state conflicts
    if (
      initializationRef.current.hasInitialized ||
      initializationRef.current.isInitializing
    ) {
      console.log(
        "✅ Auth already initialized or in progress, skipping to prevent state reset"
      );
      return;
    }

    // CRITICAL FIX: Synchronous guard to avoid race with async state
    if (authenticatedRef.current) {
      console.log(
        "✅ User already authenticated (ref), skipping initialization"
      );
      initializationRef.current.hasInitialized = true;
      return;
    }

    // CRITICAL FIX: Don't reset state if user is already authenticated
    if (state.authenticated && state.user && state.sessionToken) {
      console.log(
        "✅ User already authenticated, skipping initialization to prevent state reset"
      );
      initializationRef.current.hasInitialized = true;
      authenticatedRef.current = true;
      return;
    }

    initializationRef.current.isInitializing = true;

    try {
      const accessToken = SecureTokenManager.getAccessToken();
      console.log("🔍 Auth initialization check:", { hasToken: !!accessToken });

      if (accessToken) {
        const tokenPayload = SecureTokenManager.parseTokenPayload(accessToken);
        console.log("🔍 Token payload parsed:", {
          hasPayload: !!tokenPayload,
          exp: tokenPayload?.exp
            ? new Date(tokenPayload.exp * 1000).toISOString()
            : "none",
        });

        if (tokenPayload) {
          // Check if token is expired
          const now = Date.now() / 1000;
          if (tokenPayload.exp > now) {
            // Token is valid, check for stored user data
            const storedUser = sessionStorage.getItem(
              SESSION_STORAGE_KEYS.USER
            );

            if (storedUser) {
              try {
                const user = JSON.parse(storedUser) as UserIdentity;
                const lastValidated = sessionStorage.getItem(
                  SESSION_STORAGE_KEYS.LAST_VALIDATED
                );

                // Check if session needs revalidation (older than 5 minutes)
                const lastValidatedTime = lastValidated
                  ? parseInt(lastValidated, 10)
                  : 0;
                const timeSinceValidation = Date.now() - lastValidatedTime;

                if (timeSinceValidation > SESSION_VALIDATION_INTERVAL) {
                  // Revalidate session
                  const isValid = await validateSession();
                  if (!isValid) {
                    await clearStoredSession();
                    setState((prev) => ({ ...prev, loading: false }));
                    return;
                  }
                }

                console.log(
                  "✅ Valid session found, restoring authentication state:",
                  {
                    userId: user.id?.substring(0, 20) + "...",
                    authenticated: true,
                    accountActive: user.is_active,
                  }
                );

                setState((prev) => ({
                  ...prev,
                  user,
                  sessionToken: accessToken,
                  authenticated: true,
                  accountActive: user.is_active,
                  sessionValid: true,
                  lastValidated: lastValidatedTime,
                  loading: false,
                  error: null,
                }));
                authenticatedRef.current = true;
              } catch (parseError) {
                console.error("Failed to parse stored user data:", parseError);
                await clearStoredSession();
                setState((prev) => ({ ...prev, loading: false }));
              }
            } else {
              // No stored user data - token exists but user info missing
              // This can happen if sessionStorage was cleared but refresh cookie remains
              await SecureTokenManager.logout();
              setState((prev) => ({ ...prev, loading: false }));
            }
          } else {
            // Token exists but is expired - attempt refresh via silentRefresh
            const refreshedToken = await SecureTokenManager.silentRefresh();
            if (!refreshedToken) {
              await clearStoredSession();
              setState((prev) => ({
                ...prev,
                user: null,
                sessionToken: null,
                authenticated: false,
                accountActive: false,
                sessionValid: false,
                lastValidated: null,
                loading: false,
                error: null,
              }));
            }
          }
        } else {
          // Invalid token format
          await SecureTokenManager.logout();
          setState((prev) => ({ ...prev, loading: false }));
        }
      } else {
        // No access token in memory — avoid calling check-refresh on public/landing pages
        // Gate refresh attempts to either (a) previously stored user exists, or (b) current route is protected
        const currentPath =
          typeof window !== "undefined" ? window.location.pathname : "";
        const protectedPaths = Object.values(PROTECTED_AREAS) as string[];
        const isProtectedPath = protectedPaths.some(
          (p) => currentPath === p || currentPath.startsWith(p + "/")
        );
        const hasStoredUser = !!sessionStorage.getItem(
          SESSION_STORAGE_KEYS.USER
        );

        if (!hasStoredUser && !isProtectedPath) {
          // Unauthenticated visitor on public route — do not ping check-refresh
          setState((prev) => ({
            ...prev,
            loading: false,
            authenticated: false,
          }));
          return;
        }

        // Only now check if refresh cookie exists (server will confirm). This may 401 if no cookie; that's expected on protected routes.
        const hasRefresh = await SecureTokenManager.checkRefreshAvailable();
        console.debug(
          "ℹ️ Auth init: gated refresh check; refresh cookie available:",
          hasRefresh,
          { currentPath, isProtectedPath, hasStoredUser }
        );

        if (hasRefresh) {
          const refreshedToken = await SecureTokenManager.silentRefresh();
          if (refreshedToken) {
            const isValid = await validateSession();
            // Ensure loading is cleared regardless of validation result
            setState((prev) => ({ ...prev, loading: false }));
            if (isValid) {
              // Successfully restored session; stop further initialization work
              return;
            }
          }
        }

        // Fallback: no refresh cookie or refresh failed — remain unauthenticated
        setState((prev) => ({ ...prev, loading: false, authenticated: false }));
      }
    } catch (error) {
      console.error("❌ Failed to initialize auth state:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        authenticated: false,
        error: "Failed to initialize authentication",
      }));
    } finally {
      // CRITICAL FIX: Mark initialization as complete
      initializationRef.current.isInitializing = false;
      initializationRef.current.hasInitialized = true;
      console.log("✅ Auth initialization completed");
    }
  }, []); // CRITICAL FIX: Remove dependencies to prevent re-initialization

  /**
   * Handle successful authentication result
   */
  const handleAuthSuccess = useCallback(
    async (result: AuthResult): Promise<boolean> => {
      console.log("🔐 handleAuthSuccess called with:", {
        success: result.success,
        hasUser: !!result.user,
        hasToken: !!result.sessionToken,
        userId: result.user?.id?.substring(0, 20) + "...",
      });

      if (result.success && result.user && result.sessionToken) {
        const now = Date.now();

        // Parse token to get expiry information
        const tokenPayload = SecureTokenManager.parseTokenPayload(
          result.sessionToken
        );
        if (!tokenPayload) {
          console.error(
            "❌ Invalid token format received in handleAuthSuccess"
          );
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "Invalid token format received",
          }));
          authenticatedRef.current = false;
          return false;
        }

        // Store access token securely (in memory)
        SecureTokenManager.setAccessToken(
          result.sessionToken,
          tokenPayload.exp * 1000
        );

        // Normalize/augment user data with hashedId from token payload
        const userToStore = {
          ...(result.user || {}),
          hashedId: tokenPayload.hashedId,
          is_active: result.user ? result.user.is_active !== false : true,
        } as UserIdentity;

        // Store user data in sessionStorage (survives page reload, cleared on tab close)
        sessionStorage.setItem(
          SESSION_STORAGE_KEYS.USER,
          JSON.stringify(userToStore)
        );
        sessionStorage.setItem(
          SESSION_STORAGE_KEYS.LAST_VALIDATED,
          now.toString()
        );

        // CRITICAL FIX: Update state synchronously to prevent race conditions
        setState((prev) => ({
          ...prev,
          user: userToStore,
          sessionToken: result.sessionToken as string,
          authenticated: true,
          accountActive: !!userToStore.is_active,
          sessionValid: true,
          lastValidated: now,
          loading: false,
          error: null,
        }));
        authenticatedRef.current = true;

        console.log("✅ Authentication state updated successfully:", {
          authenticated: true,
          userId: result.user.id?.substring(0, 20) + "...",
          accountActive: !!result.user.is_active,
          tokenExpiry: new Date(tokenPayload.exp * 1000).toISOString(),
        });

        // Post-auth: automatically create SecureNsecManager session if encrypted nsec is available
        try {
          const u = result.user as unknown as {
            id?: string;
            encrypted_nsec?: string;
            user_salt?: string;
            encrypted_nsec_iv?: string;
            npub?: string;
            nip05?: string;
            username?: string;
          };

          console.log("🔐 Post-auth: COMPREHENSIVE credential check", {
            // Basic user info
            userId: u?.id?.substring(0, 8) || "MISSING",
            nip05: u?.nip05 || "MISSING",
            username: u?.username || "MISSING",

            // Critical encrypted credentials
            hasEncryptedNsec: !!u?.encrypted_nsec,
            hasUserSalt: !!u?.user_salt,
            hasEncryptedNsecIv: !!u?.encrypted_nsec_iv,
            hasNpub: !!u?.npub,

            // Field lengths for debugging
            userSaltLength: u?.user_salt?.length || 0,
            encryptedNsecLength: u?.encrypted_nsec?.length || 0,
            encryptedNsecIvLength: u?.encrypted_nsec_iv?.length || 0,
            npubLength: u?.npub?.length || 0,

            // Complete object structure
            availableUserFields: Object.keys(u || {}),
            completeResultStructure: Object.keys(result || {}),
          });

          // CRITICAL: Log the complete result.user object structure (sanitized)
          const userAny = result.user as any;
          console.log("🔐 Post-auth: Complete result.user object:", {
            ...result.user,
            encrypted_nsec: userAny.encrypted_nsec
              ? `${userAny.encrypted_nsec.substring(0, 8)}...`
              : "MISSING",
            user_salt: userAny.user_salt
              ? `${userAny.user_salt.substring(0, 8)}...`
              : "MISSING",
            npub: userAny.npub
              ? `${userAny.npub.substring(0, 8)}...`
              : "MISSING",
          });

          if (u && u.encrypted_nsec && u.user_salt) {
            console.log(
              "🔐 Post-auth: creating SecureNsecManager session directly from signin response"
            );

            // ClientSessionVault (feature-flagged): prefer local vault session
            if (USE_VAULT) {
              try {
                // AuthProvider installs passphrase provider when user has enabled it.
                // No action here to avoid overriding the UI-backed provider.

                await ClientSessionVault.bootstrapFromSignin(
                  u.encrypted_nsec,
                  u.user_salt,
                  u.npub
                );
                // First try silent, no-prompt unlock to populate device vault by default
                let unlocked = await ClientSessionVault.unlock({
                  interactive: false,
                }).catch(() => false);
                // If opted-in to prompts, allow interactive methods as a follow-up
                if (!unlocked) {
                  const allowPromptPostAuth = shouldAutoPromptVault();
                  if (allowPromptPostAuth) {
                    unlocked = await ClientSessionVault.unlock({
                      interactive: true,
                    }).catch(() => false);
                  }
                }
                if (unlocked) {
                  const nsecHex = await ClientSessionVault.getNsecHex();
                  if (nsecHex) {
                    await nsecSessionBridge.initializeAfterAuth(nsecHex, {
                      browserLifetime: true,
                      maxOperations: 50,
                    });
                    console.log(
                      "🔐 Post-auth: SecureNsecManager session created (vault)"
                    );
                    sessionUserFetchRef.current.done = true;
                    return true;
                  }
                }
              } catch (e) {
                console.warn(
                  "Vault direct init failed; falling back to session bridge",
                  e instanceof Error ? e.message : String(e)
                );
              }
            }

            try {
              const session =
                await recoverySessionBridge.createRecoverySessionFromUser(
                  u as any,
                  { duration: 15 * 60 * 1000 }
                );

              console.log(
                "🔐 Post-auth: RecoverySessionBridge result:",
                session
              );

              if (!session?.success) {
                console.error(
                  "🔐 Post-auth: NSEC session creation failed:",
                  session?.error
                );
                console.error("🔐 Post-auth: Full session result:", session);
              } else {
                console.log(
                  "🔐 Post-auth: SecureNsecManager session created successfully"
                );
                console.log(
                  "🔐 Post-auth: SecureNsecManager session created (direct)"
                );
                console.log("🔐 Post-auth: Session ID:", session.sessionId);
                console.log(
                  "🔐 Post-auth: Session expires at:",
                  session.expiresAt
                );
                console.log("🔐 Post-auth: Environment:", process.env.NODE_ENV);
                console.log(
                  "🔐 Post-auth: User agent:",
                  navigator.userAgent.substring(0, 50)
                );

                // Mark fallback as done to prevent duplicate calls
                sessionUserFetchRef.current.done = true;
              }
            } catch (sessionError) {
              console.error(
                "🔐 Post-auth: Exception during session creation:",
                sessionError
              );
              console.error(
                "🔐 Post-auth: Session error stack:",
                sessionError instanceof Error ? sessionError.stack : "No stack"
              );
            }
          } else {
            // Fallback: fetch session-user to retrieve encrypted credentials, then create session
            // Deduplicate and add light backoff to avoid 429 rate limits
            if (
              sessionUserFetchRef.current.done ||
              sessionUserFetchRef.current.inFlight
            ) {
              if (process.env.NODE_ENV !== "production") {
                console.debug("Post-auth: session-user fetch skipped (dedup)");
              }
            } else {
              sessionUserFetchRef.current.inFlight = true;
              try {
                const fetchOnce = () =>
                  fetchWithAuth("/api/auth/session-user", {
                    method: "GET",
                    credentials: "include",
                  });

                let res = await fetchOnce();
                if (
                  res.status === 429 &&
                  sessionUserFetchRef.current.retries < 2
                ) {
                  sessionUserFetchRef.current.retries += 1;
                  const backoff = Math.min(
                    500 * 2 ** sessionUserFetchRef.current.retries,
                    3000
                  );
                  await new Promise((r) => setTimeout(r, backoff));
                  res = await fetchOnce();
                }

                if (res.ok) {
                  const payload = await res.json();
                  const su = payload?.data?.user as
                    | { encrypted_nsec?: string; user_salt?: string }
                    | undefined;
                  if (su?.encrypted_nsec && su?.user_salt) {
                    let created = false;
                    if (USE_VAULT) {
                      try {
                        // AuthProvider installs passphrase provider when user has enabled it.
                        // No action here to avoid overriding the UI-backed provider.

                        await ClientSessionVault.bootstrapFromSignin(
                          su.encrypted_nsec,
                          su.user_salt,
                          (su as any).npub
                        );
                        // First attempt silent, no-prompt unlock for default device vault
                        let unlocked = await ClientSessionVault.unlock({
                          interactive: false,
                        }).catch(() => false);
                        if (!unlocked) {
                          const allowPromptFallback = shouldAutoPromptVault();
                          if (allowPromptFallback) {
                            unlocked = await ClientSessionVault.unlock({
                              interactive: true,
                            }).catch(() => false);
                          }
                        }
                        if (unlocked) {
                          const nsecHex = await ClientSessionVault.getNsecHex();
                          if (nsecHex) {
                            await nsecSessionBridge.initializeAfterAuth(
                              nsecHex,
                              {
                                browserLifetime: true,
                                maxOperations: 50,
                              }
                            );
                            console.log(
                              "🔐 Post-auth (fallback): SecureNsecManager session created (vault)"
                            );
                            sessionUserFetchRef.current.done = true;
                            created = true;
                          }
                        }
                      } catch (e) {
                        console.debug(
                          "Vault fallback init failed; attempting RecoverySessionBridge",
                          e instanceof Error ? e.message : String(e)
                        );
                      }
                    }
                    if (!created) {
                      const session =
                        await recoverySessionBridge.createRecoverySessionFromUser(
                          su as any,
                          { duration: 15 * 60 * 1000 }
                        );
                      if (!session?.success) {
                        console.warn(
                          "NSEC session (fallback) creation failed:",
                          session?.error
                        );
                      } else {
                        console.log(
                          "🔐 Post-auth (fallback): SecureNsecManager session created"
                        );
                        sessionUserFetchRef.current.done = true;
                      }
                    }
                  } else {
                    console.debug(
                      "Post-auth: no encrypted credentials available from session-user"
                    );
                  }
                } else {
                  console.debug(
                    "Post-auth: session-user request failed",
                    res.status
                  );
                }
              } catch (e2) {
                console.debug(
                  "Post-auth: session-user fetch error",
                  e2 instanceof Error ? e2.message : String(e2)
                );
              } finally {
                sessionUserFetchRef.current.inFlight = false;
              }
            }
          }
        } catch (e) {
          console.warn(
            "Post-auth session hook error:",
            e instanceof Error ? e.message : "Unknown error"
          );
        }

        return true;
      } else {
        console.error(
          "❌ Authentication failed in handleAuthSuccess:",
          result.error
        );
        setState((prev) => ({
          ...prev,
          loading: false,
          error: result.error || "Authentication failed",
        }));
        authenticatedRef.current = false;
        return false;
      }
    },
    []
  );

  /**
   * Logout user and clear all session data
   */
  const logout = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      // Call logout endpoint to clear HttpOnly refresh cookie
      await SecureTokenManager.logout();
    } catch (error) {
      // Continue with local cleanup even if server logout fails
      console.error("Server logout failed:", error);
    }

    // Clear access token from memory
    SecureTokenManager.clearAccessToken();

    // Clear user data from sessionStorage
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.USER);
    sessionStorage.removeItem(SESSION_STORAGE_KEYS.LAST_VALIDATED);

    // Note: HttpOnly refresh cookie is cleared by the logout endpoint
  }, []);

  /**
   * Authenticate with NIP-05 and password
   */
  const authenticateNIP05Password = useCallback(
    async (nip05: string, password: string): Promise<boolean> => {
      console.log("🔐 AUTH TRACE: authenticateNIP05Password called", {
        nip05Preview: nip05?.slice(0, 16) + "…",
      });

      // Reset session-user fetch state for new authentication
      sessionUserFetchRef.current = {
        done: false,
        inFlight: false,
        retries: 0,
      };

      try {
        if (process.env.NODE_ENV !== "production") {
          console.trace("🔐 AUTH TRACE: authenticateNIP05Password call stack");
        }
        setState((prev) => ({ ...prev, loading: true, error: null }));

        // Call server endpoint for NIP-05/password authentication
        const response = await fetchWithAuth("/api/auth/signin", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nip05,
            password,
            authMethod: "nip05-password",
          }),
        });
        console.log("🔐 AUTH TRACE: /api/auth/signin response status", {
          ok: response.ok,
          status: response.status,
        });

        if (!response.ok) {
          setState((prev) => ({ ...prev, loading: false }));
          return false;
        }

        const raw = await response.json();
        console.log("🔐 AUTH TRACE: /api/auth/signin response json", raw);
        const token = raw?.data?.sessionToken;
        const userResp = raw?.data?.user;
        const normalized: AuthResult = token
          ? {
              success: !!raw.success,
              user: userResp
                ? {
                    id: userResp.id,
                    user_salt: userResp.user_salt || "",
                    password_hash: "",
                    password_salt: "",
                    failed_attempts: 0,
                    role: (userResp.role as any) || "private",
                    is_active: userResp.is_active !== false,
                    authMethod: "nip05-password",
                    // Include encrypted credentials for SecureNsecManager session creation
                    encrypted_nsec: userResp.encrypted_nsec || undefined,
                    encrypted_nsec_iv: userResp.encrypted_nsec_iv || undefined,
                    npub: userResp.npub || undefined,
                    username: userResp.username || undefined,
                  }
                : undefined,
              sessionToken: token,
            }
          : raw;
        return handleAuthSuccess(normalized);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "NIP-05/Password authentication failed",
        }));
        return false;
      }
    },
    [handleAuthSuccess]
  );

  /**
   * Authenticate with NIP-07 browser extension (no password)
   */
  const authenticateNIP07 = useCallback(
    async (
      challenge: string,
      signature: string,
      pubkey: string
    ): Promise<boolean> => {
      // Reset session-user fetch state for new authentication
      sessionUserFetchRef.current = {
        done: false,
        inFlight: false,
        retries: 0,
      };

      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        // Call server NIP-07 signin endpoint
        const response = await fetchWithAuth("/api/auth/nip07-signin", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challenge, signature, pubkey }),
        });

        if (!response.ok) {
          setState((prev) => ({ ...prev, loading: false }));
          return false;
        }

        const raw = await response.json();
        const token = raw?.data?.sessionToken;
        const userResp = raw?.data?.user;
        const normalized: AuthResult = token
          ? {
              success: !!raw.success,
              user: userResp
                ? {
                    id: userResp.id,
                    user_salt: "",
                    password_hash: "",
                    password_salt: "",
                    failed_attempts: 0,
                    role: (userResp.role as any) || "private",
                    is_active: userResp.is_active !== false,
                    authMethod: "nip07",
                  }
                : undefined,
              sessionToken: token,
            }
          : raw;
        return handleAuthSuccess(normalized);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "NIP-07 authentication failed",
        }));
        return false;
      }
    },
    [handleAuthSuccess]
  );

  /**
   * Authenticate via Physical MFA (NFC) to unlock vault and enable signing
   * Client-side only; does not modify platform authentication state
   */
  const authenticateNFC = useCallback(async (): Promise<boolean> => {
    // Reset fetch state for any dependent flows
    sessionUserFetchRef.current = { done: false, inFlight: false, retries: 0 };
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const NFC_ENABLED =
        (import.meta.env.VITE_ENABLE_NFC_MFA ?? "false") === "true";
      const NFC_SUPPORTED =
        typeof window !== "undefined" && "NDEFReader" in window;
      if (!NFC_ENABLED || !NFC_SUPPORTED) {
        setState((prev) => ({ ...prev, loading: false }));
        return false;
      }

      // Ensure vault is gated by NFC per unlock with 120s freshness window
      setNFCPolicy({
        policy: "nfc",
        awaitNfcAuth: awaitNFC,
        config: { pinTimeoutMs: 120000, confirmationMode: "per_unlock" },
      });

      const okNfc = await awaitNFC();
      if (!okNfc) {
        setState((prev) => ({ ...prev, loading: false }));
        return false;
      }

      // AuthProvider will install the passphrase provider for PBKDF2 when enabled by the user.
      // Do not install any stub provider here.

      let unlocked = await ClientSessionVault.unlock().catch(() => false);
      if (!unlocked && (await hasVaultRecord())) {
        unlocked = await ClientSessionVault.unlock().catch(() => false);
      }
      if (unlocked) {
        const nsecHex = await ClientSessionVault.getNsecHex();
        if (nsecHex) {
          await nsecSessionBridge.initializeAfterAuth(nsecHex, {
            browserLifetime: true,
            maxOperations: 50,
          });
          setState((prev) => ({ ...prev, loading: false }));
          return true;
        }
      }

      setState((prev) => ({ ...prev, loading: false }));
      return false;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error:
          error instanceof Error ? error.message : "NFC authentication failed",
      }));
      return false;
    }
  }, []);

  /**
   * Validate current session
   */
  const validateSession = useCallback(async (): Promise<boolean> => {
    try {
      const accessToken = SecureTokenManager.getAccessToken();
      if (!accessToken) {
        return false;
      }

      const tokenPayload = SecureTokenManager.parseTokenPayload(accessToken);
      if (!tokenPayload) {
        await logout();
        return false;
      }

      // Get stored user data and validate it matches the token
      const storedUser = sessionStorage.getItem(SESSION_STORAGE_KEYS.USER);
      if (!storedUser) {
        await logout();
        return false;
      }

      try {
        const user = JSON.parse(storedUser) as UserIdentity;

        // Validate user matches token
        if (user.hashedId !== tokenPayload.hashedId) {
          await logout();
          return false;
        }

        const now = Date.now();
        sessionStorage.setItem(
          SESSION_STORAGE_KEYS.LAST_VALIDATED,
          now.toString()
        );

        setState((prev) => ({
          ...prev,
          user,
          sessionToken: accessToken,
          accountActive: user.is_active,
          sessionValid: true,
          lastValidated: now,
          error: null,
        }));

        return true;
      } catch (parseError) {
        console.error("Failed to parse stored user data:", parseError);
        await logout();
        return false;
      }
    } catch (error) {
      console.error("Session validation failed:", error);
      setState((prev) => ({
        ...prev,
        sessionValid: false,
        error: "Session validation failed",
      }));
      return false;
    }
  }, [logout]);

  /**
   * Refresh authentication session
   */
  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const refreshedToken = await SecureTokenManager.silentRefresh();

      if (refreshedToken) {
        // Validate the refreshed session
        const isValid = await validateSession();
        setState((prev) => ({ ...prev, loading: false }));
        return isValid;
      } else {
        // Refresh failed - logout user
        await logout();
        return false;
      }
    } catch (error) {
      console.error("Session refresh failed:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "Session refresh failed",
      }));
      return false;
    }
  }, [validateSession, logout]);

  /**
   * Check if user can access a protected area
   */
  const canAccessProtectedArea = useCallback(
    (_area: ProtectedArea): boolean => {
      return (
        state.authenticated &&
        state.accountActive &&
        state.sessionValid &&
        state.user !== null
      );
    },
    [state.authenticated, state.accountActive, state.sessionValid, state.user]
  );

  /**
   * Require authentication for a protected area
   */
  const requireAuthentication = useCallback(
    async (area: ProtectedArea): Promise<boolean> => {
      if (canAccessProtectedArea(area)) {
        return true;
      }

      // If not authenticated, check if we can refresh session
      if (state.user && !state.sessionValid) {
        return await refreshSession();
      }

      return false;
    },
    [canAccessProtectedArea, state.user, state.sessionValid, refreshSession]
  );

  /**
   * Check account status
   */
  const checkAccountStatus = useCallback(async (): Promise<boolean> => {
    if (!state.user) {
      return false;
    }

    try {
      // Validate session which also checks account status
      return await validateSession();
    } catch (error) {
      console.error("Account status check failed:", error);
      return false;
    }
  }, [state.user, validateSession]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // Initialize authentication state lazily: only when actually needed
  useEffect(() => {
    try {
      const token = SecureTokenManager.getAccessToken();
      const currentPath =
        typeof window !== "undefined" ? window.location.pathname : "";
      const protectedPaths = Object.values(PROTECTED_AREAS) as string[];
      const isProtectedPath = protectedPaths.some(
        (p) => currentPath === p || currentPath.startsWith(p + "/")
      );
      const hasStoredUser = !!sessionStorage.getItem(SESSION_STORAGE_KEYS.USER);

      if (token || hasStoredUser || isProtectedPath) {
        console.log(
          "🔄 Auth system mounting - initializing authentication state"
        );
        void initializeAuth();
      } else {
        console.debug("⏸️ Auth init skipped on public route with no session");
      }
    } catch (e) {
      console.warn(
        "Auth init gating failed; proceeding without initialization",
        e instanceof Error ? e.message : String(e)
      );
    }
  }, []);
  // Load NFC gating preference on mount and configure vault policy accordingly
  useEffect(() => {
    const NFC_ENABLED =
      (import.meta.env.VITE_ENABLE_NFC_MFA ?? "false") === "true";
    if (!NFC_ENABLED) return;
    (async () => {
      try {
        const res = await fetchWithAuth("/api/nfc-unified/preferences", {
          method: "GET",
        });
        if (!res?.ok) return;
        const j = await res.json().catch(() => ({}));
        const prefs = j?.data?.preferences || {};
        const requireNfc = !!prefs.require_nfc_for_unlock;
        if (requireNfc) {
          const sec =
            typeof prefs.nfc_pin_timeout_seconds === "number"
              ? prefs.nfc_pin_timeout_seconds
              : 120;
          const confirm = !!prefs.nfc_require_confirmation;
          setNFCPolicy({
            policy: "nfc",
            awaitNfcAuth: awaitNFC,
            config: {
              pinTimeoutMs: Math.max(30, sec) * 1000,
              confirmationMode: confirm ? "per_operation" : "per_unlock",
            },
          });
        } else {
          setNFCPolicy({ policy: "none" });
        }
      } catch {
        // Ignore; leave policy as-is
      }
    })();
  }, []);

  return {
    // State
    ...state,

    // Actions
    authenticateNIP05Password,
    authenticateNIP07,
    authenticateNFC,
    validateSession,
    refreshSession,
    logout,
    canAccessProtectedArea,
    requireAuthentication,
    checkAccountStatus,
    clearError,

    // Expose internal handler for post-registration flows
    // Note: not part of UnifiedAuthActions type yet; accessed via context
    handleAuthSuccess,
  };
}
