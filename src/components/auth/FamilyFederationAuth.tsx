import { AlertTriangle, Shield } from "lucide-react";
import React, { createContext, useContext } from "react";
import { usePrivacyFirstAuth } from "../../hooks/usePrivacyFirstAuth";
import { AuthContextType, FamilyFederationUser } from "../../types/auth";

// Create authentication context
export const AuthContext = createContext<AuthContextType | null>(null);

// Internal hook for components in this file
const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within FamilyFederationAuthProvider");
  }
  return context;
};

interface FamilyFederationAuthProviderProps {
  children: React.ReactNode;
}

export const FamilyFederationAuthProvider: React.FC<FamilyFederationAuthProviderProps> = ({ 
  children 
}) => {
  const privacyAuth = usePrivacyFirstAuth();
  
  // Convert privacy-first auth to legacy format for backward compatibility
  const isAuthenticated = privacyAuth.authenticated;
  const isLoading = privacyAuth.loading;
  const error = privacyAuth.error;
  const userAuth = privacyAuth.getLegacyUser(); // Converts to FamilyFederationUser format

  // Session management is now handled by privacy-first auth
  console.log('FamilyFederationAuth: Using privacy-first authentication system');
  console.log('Authentication state:', { isAuthenticated, isLoading, hasUser: !!userAuth });

  const login = (authData: FamilyFederationUser) => {
    // Legacy compatibility - now handled by privacy-first auth
    console.log('Legacy login called, redirecting to privacy-first auth:', authData);
  };

  const logout = async () => {
    await privacyAuth.logout();
  };

  const checkSession = async (): Promise<boolean> => {
    await privacyAuth.refreshSession();
    return privacyAuth.authenticated;
  };

  const contextValue: AuthContextType = {
    isAuthenticated,
    isLoading,
    userAuth,
    error,
    login,
    logout,
    checkSession,
  };

  // Don't show loading screen for the entire app - let components handle their own loading states
  // This prevents blocking modals and other UI components
  if (isLoading) {
    console.log('FamilyFederationAuth: Still loading, but not blocking UI');
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

interface FamilyFederationAuthWrapperProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  allowedRoles?: ('adult' | 'child' | 'guardian')[];
  fallback?: React.ReactNode;
}

export const FamilyFederationAuthWrapper: React.FC<FamilyFederationAuthWrapperProps> = ({
  children,
  requireAuth = true,
  allowedRoles = ['adult', 'child', 'guardian'],
  fallback,
}) => {
  const { isAuthenticated, userAuth, isLoading } = useAuthContext();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 flex items-center justify-center">
        <div className="bg-purple-900 rounded-2xl p-8 border border-yellow-400/20">
          <div className="flex items-center space-x-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
            <div>
              <h3 className="text-white font-semibold">Loading</h3>
              <p className="text-purple-200 text-sm">Please wait...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) {
    return fallback || <AuthenticationRequired />;
  }

  if (isAuthenticated && userAuth && !allowedRoles.includes(userAuth.federationRole)) {
    return <AccessDenied userRole={userAuth.federationRole} allowedRoles={allowedRoles} />;
  }

  return <>{children}</>;
};

const AuthenticationRequired: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-purple-900 rounded-2xl p-8 max-w-md w-full border border-yellow-400/20 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <Shield className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">Authentication Required</h2>
        <p className="text-purple-200 mb-6">
          You need to sign in with your Family Federation credentials to access this area.
        </p>
        <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-left">
              <p className="text-yellow-400 font-semibold text-sm">Family Federation Access</p>
              <p className="text-yellow-200 text-sm mt-1">
                Only whitelisted family members can access Family Financials data.
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
        >
          Sign In
        </button>
      </div>
    </div>
  );
};

interface AccessDeniedProps {
  userRole: string;
  allowedRoles: string[];
}

const AccessDenied: React.FC<AccessDeniedProps> = ({ userRole, allowedRoles }) => {
  const { logout } = useAuthContext();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-purple-900 rounded-2xl p-8 max-w-md w-full border border-red-400/20 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">Access Denied</h2>
        <p className="text-purple-200 mb-4">
          Your role ({userRole}) doesn't have permission to access this area.
        </p>
        <p className="text-purple-300 text-sm mb-6">
          Required roles: {allowedRoles.join(', ')}
        </p>
        <div className="space-y-3">
          <button
            onClick={() => window.history.back()}
            className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
          >
            Go Back
          </button>
          <button
            onClick={logout}
            className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

// Export useAuth hook for external components (required for Fast Refresh)
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within FamilyFederationAuthProvider");
  }
  return context;
};

export default FamilyFederationAuthWrapper;