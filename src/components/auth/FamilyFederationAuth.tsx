import { AlertTriangle, Shield } from "lucide-react";
import React, { createContext, useContext, useEffect, useState } from "react";
import { AuthContextType, FamilyFederationUser } from "../../types/auth";
import { getSessionInfo, secureLogout } from "../../utils/secureSession";

// Create authentication context
const AuthContext = createContext<AuthContextType | null>(null);

// Custom hook to use auth context
export const useAuth = () => {
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userAuth, setUserAuth] = useState<FamilyFederationUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      // Use secure session info from HttpOnly cookies
      const sessionInfo = await getSessionInfo();
      
      if (!sessionInfo.isAuthenticated || !sessionInfo.user) {
        setIsLoading(false);
        return;
      }

      // Convert session info to FamilyFederationUser format
      const userAuth: FamilyFederationUser = {
        npub: sessionInfo.user.npub,
        nip05: sessionInfo.user.nip05,
        federationRole: sessionInfo.user.federationRole,
        authMethod: sessionInfo.user.authMethod,
        isWhitelisted: sessionInfo.user.isWhitelisted,
        votingPower: sessionInfo.user.votingPower,
        guardianApproved: sessionInfo.user.guardianApproved,
        sessionToken: '', // Not needed with HttpOnly cookies
      };

      setUserAuth(userAuth);
      setIsAuthenticated(true);
      setIsLoading(false);
    } catch (error) {
      console.error("Session check error:", error);
      setIsLoading(false);
    }
  };

  const login = (authData: FamilyFederationUser) => {
    // With HttpOnly cookies, the session is managed server-side
    // We just need to update the client state
    setUserAuth(authData);
    setIsAuthenticated(true);
    setError(null);
    // No need to store tokens in localStorage - they're in HttpOnly cookies
  };

  const logout = async () => {
    try {
      // Use secure logout that clears HttpOnly cookies
      await secureLogout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Clear client state
      setUserAuth(null);
      setIsAuthenticated(false);
      setError(null);
    }
  };

  const checkSession = async (): Promise<boolean> => {
    try {
      const sessionInfo = await getSessionInfo();
      return sessionInfo.isAuthenticated;
    } catch (error) {
      console.error("Session check error:", error);
      return false;
    }
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 flex items-center justify-center">
        <div className="bg-purple-900 rounded-2xl p-8 border border-yellow-400/20">
          <div className="flex items-center space-x-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
            <div>
              <h3 className="text-white font-semibold">Checking Authentication</h3>
              <p className="text-purple-200 text-sm">Verifying your Family Federation access...</p>
            </div>
          </div>
        </div>
      </div>
    );
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
  allowedRoles?: ('parent' | 'child' | 'guardian')[];
  fallback?: React.ReactNode;
}

export const FamilyFederationAuthWrapper: React.FC<FamilyFederationAuthWrapperProps> = ({
  children,
  requireAuth = true,
  allowedRoles = ['parent', 'child', 'guardian'],
  fallback,
}) => {
  const { isAuthenticated, userAuth, isLoading } = useAuth();

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
  const { logout } = useAuth();

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

export default FamilyFederationAuthWrapper;