/**
 * Admin Authentication Guard Component
 * @module AdminAuthGuard
 */

import { AlertTriangle, Loader2, Lock } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

export type AdminRole = "platform" | "federation";

export interface AdminContext {
  userDuid: string;
  adminType: AdminRole;
  federationId: string | null;
  permissions: string[];
}

export interface AdminAuthGuardProps {
  children: React.ReactNode;
  requiredRole?: AdminRole | AdminRole[];
  federationId?: string;
  fallback?: React.ReactNode;
  onUnauthorized?: () => void;
  showLoadingState?: boolean;
}

interface AdminAuthState {
  loading: boolean;
  authorized: boolean;
  adminContext: AdminContext | null;
  error: string | null;
}

export const AdminAuthContext = React.createContext<AdminContext | null>(null);

export function useAdminContext(): AdminContext | null {
  return React.useContext(AdminAuthContext);
}

export function useRequiredAdminContext(): AdminContext {
  const context = React.useContext(AdminAuthContext);
  if (!context) throw new Error("useRequiredAdminContext must be used within AdminAuthGuard");
  return context;
}

export const AdminAuthGuard: React.FC<AdminAuthGuardProps> = ({
  children, requiredRole, federationId, fallback, onUnauthorized, showLoadingState = true,
}) => {
  const { user, sessionToken, authenticated } = useAuth();
  const [authState, setAuthState] = useState<AdminAuthState>({
    loading: true, authorized: false, adminContext: null, error: null,
  });

  const verifyAdminAuth = useCallback(async () => {
    if (!authenticated || !sessionToken) {
      setAuthState({ loading: false, authorized: false, adminContext: null, error: "Not authenticated" });
      return;
    }
    try {
      const response = await fetch("/api/admin/dashboard", {
        method: "GET",
        headers: { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Admin verification failed");
      }
      const data = await response.json();
      const adminContext: AdminContext = {
        userDuid: data.userDuid || user?.id || "",
        adminType: data.adminType || "federation",
        federationId: data.federationId || null,
        permissions: data.permissions || [],
      };
      let isAuthorized = true;
      if (requiredRole) {
        const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
        isAuthorized = roles.includes(adminContext.adminType);
      }
      if (isAuthorized && federationId && adminContext.adminType === "federation") {
        isAuthorized = adminContext.federationId === federationId;
      }
      setAuthState({ loading: false, authorized: isAuthorized, adminContext, error: isAuthorized ? null : "Insufficient permissions" });
      if (!isAuthorized && onUnauthorized) onUnauthorized();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authorization failed";
      setAuthState({ loading: false, authorized: false, adminContext: null, error: message });
      if (onUnauthorized) onUnauthorized();
    }
  }, [authenticated, sessionToken, user, requiredRole, federationId, onUnauthorized]);

  useEffect(() => { verifyAdminAuth(); }, [verifyAdminAuth]);

  if (authState.loading && showLoadingState) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-purple-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!authState.authorized) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">{authState.error || "You do not have permission to access this area."}</p>
          <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
            <AlertTriangle className="h-4 w-4" /><span>Admin credentials required</span>
          </div>
          <button onClick={() => (window.location.href = "/")} className="mt-6 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
            Return Home
          </button>
        </div>
      </div>
    );
  }

  return <AdminAuthContext.Provider value={authState.adminContext}>{children}</AdminAuthContext.Provider>;
};

export function hasPermission(context: AdminContext | null, permission: string): boolean {
  if (!context) return false;
  if (context.adminType === "platform") return true;
  return context.permissions.includes(permission);
}

export function canManageFederationAccounts(context: AdminContext | null, targetFederationId: string | null): boolean {
  if (!context) return false;
  if (context.adminType === "platform") return true;
  return context.federationId === targetFederationId;
}

export default AdminAuthGuard;
