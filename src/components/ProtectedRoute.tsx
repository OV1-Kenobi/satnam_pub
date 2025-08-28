// Protected Route Component with Dual Authentication
// File: src/components/ProtectedRoute.tsx
// Supports both modal and redirect authentication approaches

import React, { useEffect, useState } from 'react';
import { FamilyFederationUser } from '../types/auth';
import { useAuth } from './auth/AuthProvider'; // FIXED: Use unified auth system
import SignInModal from './SignInModal';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  allowedRoles?: ('private' | 'offspring' | 'adult' | 'steward' | 'guardian')[];
  authMode?: 'modal' | 'redirect' | 'auto';
  fallback?: React.ReactNode;
  onAuthSuccess?: (user: FamilyFederationUser) => void;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true,
  allowedRoles = ['private', 'offspring', 'adult', 'steward', 'guardian'],
  authMode = 'auto',
  fallback,
  onAuthSuccess
}) => {
  // FIXED: Use unified auth system instead of family federation auth
  const auth = useAuth();
  const { authenticated: isAuthenticated, user: userAuth, loading: isLoading } = auth;
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  // Determine authentication mode based on context
  useEffect(() => {
    if (!requireAuth || isAuthenticated || isLoading) return;

    if (authMode === 'auto') {
      // Auto mode: Use modal for navigation-triggered access, redirect for direct URL access
      const isDirectAccess = !document.referrer ||
        new URL(document.referrer).origin !== window.location.origin;

      if (isDirectAccess) {
        setShouldRedirect(true);
      } else {
        setShowAuthModal(true);
      }
    } else if (authMode === 'modal') {
      setShowAuthModal(true);
    } else if (authMode === 'redirect') {
      setShouldRedirect(true);
    }
  }, [requireAuth, isAuthenticated, isLoading, authMode]);

  const handleAuthSuccess = (user: FamilyFederationUser) => {
    setShowAuthModal(false);
    if (onAuthSuccess) {
      onAuthSuccess(user);
    }
  };

  const handleModalClose = () => {
    setShowAuthModal(false);
    // Optionally navigate back or to a safe page
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 flex items-center justify-center">
        <div className="bg-purple-900 rounded-2xl p-8 border border-purple-300/20">
          <div className="flex items-center space-x-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-200"></div>
            <div>
              <h3 className="text-white font-semibold">Checking Authentication</h3>
              <p className="text-purple-200 text-sm">Verifying your Family Federation access...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Not authenticated - show redirect page
  if (requireAuth && !isAuthenticated && shouldRedirect) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 flex items-center justify-center p-4">
        <SignInModal
          isOpen={true}
          onClose={() => { }}
          onSignInSuccess={() => window.location.reload()}
          onCreateNew={() => { }}
          destination="family"
        />
      </div>
    );
  }

  // Not authenticated - show fallback or modal trigger
  if (requireAuth && !isAuthenticated) {
    return (
      <>
        {fallback || (
          <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 flex items-center justify-center p-4">
            <div className="bg-purple-900 rounded-2xl p-8 max-w-md w-full border border-purple-300/20 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl">🏰</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-4">Authentication Required</h2>
              <p className="text-purple-200 mb-6">
                You need to sign in with your Family Federation credentials to access this area.
              </p>
              <div className="bg-purple-800/30 border border-purple-500/50 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-3">
                  <span className="text-purple-300 text-lg">⚠️</span>
                  <div className="text-left">
                    <p className="text-purple-300 font-semibold text-sm">Family Federation Access</p>
                    <p className="text-purple-200 text-sm mt-1">
                      Only whitelisted family members can access Family Financials data.
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowAuthModal(true)}
                className="w-full bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
              >
                Sign In
              </button>
            </div>
          </div>
        )}

        <SignInModal
          isOpen={showAuthModal}
          onClose={handleModalClose}
          onSignInSuccess={() => {
            setShowAuthModal(false);
            if (onAuthSuccess) {
              // Note: SignInModal doesn't return user object, so we'll need to handle this differently
              window.location.reload();
            }
          }}
          onCreateNew={() => setShowAuthModal(false)}
          destination="family"
        />
      </>
    );
  }

  // Role-based access control
  if (isAuthenticated && userAuth && !allowedRoles.includes(userAuth.federationRole)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-purple-900 rounded-2xl p-8 max-w-md w-full border border-red-400/20 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">Access Denied</h2>
          <p className="text-purple-200 mb-4">
            Your role ({userAuth.federationRole}) doesn't have permission to access this area.
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
          </div>
        </div>
      </div>
    );
  }

  // Authenticated and authorized - render children
  return <>{children}</>;
};

export default ProtectedRoute;