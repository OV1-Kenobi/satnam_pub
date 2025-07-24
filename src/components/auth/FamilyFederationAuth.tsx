import { AlertTriangle, Shield } from "lucide-react";
import React from "react";
import { usePrivacyFirstAuth } from "../../hooks/usePrivacyFirstAuth";
import { FamilyFederationAuthContext, useInternalFamilyFederationAuth } from "../../lib";
import { AuthContextType, FamilyFederationUser, FederationRole } from "../../types/auth";

interface FamilyFederationAuthProviderProps {
  children: React.ReactNode;
}

const FamilyFederationAuthProvider: React.FC<FamilyFederationAuthProviderProps> = ({
  children
}) => {
  const privacyAuth = usePrivacyFirstAuth();

  // Convert privacy-first auth to legacy format for backward compatibility
  const isAuthenticated = privacyAuth.authenticated;
  const isLoading = privacyAuth.loading;
  const error = privacyAuth.error;
  const userAuth = privacyAuth.getLegacyUser(); // Converts to FamilyFederationUser format

  // Session management is now handled by privacy-first auth
  // ✅ NO LOGGING - Following Master Context privacy-first principles

  const login = (authData: FamilyFederationUser) => {
    // Legacy compatibility - now handled by privacy-first auth
    // ✅ NO LOGGING - Following Master Context privacy-first principles
  };

  const logout = async () => {
    await privacyAuth.logout();
  };

  const checkSession = async (): Promise<boolean> => {
    await privacyAuth.refreshSession();
    return privacyAuth.authenticated;
  };

  // OTP operations for compatibility with AuthContextType
  const sendOTP = async (npub: string, nip05?: string) => {
    // For privacy-first auth, we simulate OTP sending
    // In a real implementation, this would trigger OTP delivery via Nostr DM
    try {
      // Use the identifier (npub or nip05) for OTP generation
      const identifier = nip05 || npub;
      if (!identifier) {
        throw new Error("No identifier provided for OTP");
      }

      // The actual OTP sending would be handled by the backend
      // For now, we just prepare the identifier for later verification
      console.log(`OTP would be sent to: ${identifier}`);
    } catch (error) {
      throw new Error(`Failed to send OTP: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const verifyOTP = async (otpKey: string, otp: string) => {
    // Use the privacy-first auth OTP authentication
    try {
      const success = await privacyAuth.authenticateOTP(otpKey, otp);
      if (!success) {
        throw new Error("OTP verification failed");
      }
    } catch (error) {
      throw new Error(`OTP verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const clearError = () => {
    // Delegate to privacy-first auth implementation
    privacyAuth.clearError();
  };

  const contextValue: AuthContextType = {
    isAuthenticated,
    isLoading,
    userAuth,
    user: userAuth, // Alias for userAuth
    error,
    login,
    logout,
    checkSession,
    sendOTP,
    verifyOTP,
    clearError,
  };

  // Don't show loading screen for the entire app - let components handle their own loading states
  // This prevents blocking modals and other UI components
  // ✅ NO LOGGING - Following Master Context privacy-first principles

  return (
    <FamilyFederationAuthContext.Provider value={contextValue}>
      {children}
    </FamilyFederationAuthContext.Provider>
  );
};

interface FamilyFederationAuthWrapperProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  allowedRoles?: FederationRole[];
  fallback?: React.ReactNode;
}

const FamilyFederationAuthWrapper: React.FC<FamilyFederationAuthWrapperProps> = ({
  children,
  requireAuth = true,
  allowedRoles = ['adult', 'offspring', 'steward', 'guardian'],
  fallback,
}) => {
  const { isAuthenticated, userAuth, isLoading } = useInternalFamilyFederationAuth();

  // If authentication is not required, render children immediately without checks
  if (!requireAuth) {
    return <>{children}</>;
  }

  // Show loading screen only when authentication is required and currently loading
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

  // Check authentication
  if (!isAuthenticated) {
    return fallback || <AuthenticationRequired />;
  }

  // Check role permissions
  if (userAuth && !allowedRoles.includes(userAuth.federationRole)) {
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
  const { logout } = useInternalFamilyFederationAuth();

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

// ✅ Master Context Compliance: Only export React components from .tsx files
export {
  FamilyFederationAuthProvider,
  FamilyFederationAuthWrapper
};

// Default export for Fast Refresh compatibility
export default FamilyFederationAuthWrapper;
