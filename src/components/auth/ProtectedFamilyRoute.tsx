// Protected Route for Family Federation Features
// File: src/components/auth/ProtectedFamilyRoute.tsx

import React, { useEffect } from 'react';
import { useFamilyFederationAuth } from '../../hooks/useFamilyFederationAuth';
import FamilyFederationSignIn from './FamilyFederationSignIn.tsx';

interface ProtectedFamilyRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
  requireWhitelist?: boolean;
  requireGuardianApproval?: boolean;
}

const ProtectedFamilyRoute: React.FC<ProtectedFamilyRouteProps> = ({
  children,
  requiredRole,
  requireWhitelist = true,
  requireGuardianApproval = false
}) => {
  const { isAuthenticated, userAuth, checkSession } = useFamilyFederationAuth();

  useEffect(() => {
    checkSession();
  }, []);

  // Show loading while checking authentication
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Redirect to auth if not authenticated
  if (!isAuthenticated || !userAuth) {
    return <FamilyFederationSignIn />;
  }

  // Check whitelist requirement
  if (requireWhitelist && !userAuth.isWhitelisted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg border border-red-200 p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-red-700 mb-4">Access Restricted</h1>
          <p className="text-gray-600 mb-4">
            Your account is not whitelisted for Family Federation access.
          </p>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-800 text-sm">
              <strong>Account Details:</strong><br />
              NIP-05: {userAuth.nip05 || 'Not provided'}<br />
              Role: {userAuth.federationRole || 'None'}<br />
              Whitelisted: {userAuth.isWhitelisted ? 'Yes' : 'No'}
            </p>
          </div>
          <p className="text-gray-500 text-sm">
            Please contact a family guardian to request access.
          </p>
        </div>
      </div>
    );
  }

  // Check guardian approval requirement
  if (requireGuardianApproval && !userAuth.guardianApproved) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg border border-yellow-200 p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">⏳</div>
          <h1 className="text-2xl font-bold text-yellow-700 mb-4">Pending Approval</h1>
          <p className="text-gray-600 mb-4">
            Your access is pending guardian approval.
          </p>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-yellow-800 text-sm">
              <strong>Account Status:</strong><br />
              Guardian Approved: {userAuth.guardianApproved ? 'Yes' : 'Pending'}<br />
              Voting Power: {userAuth.votingPower}
            </p>
          </div>
          <p className="text-gray-500 text-sm">
            A family guardian will review your access request.
          </p>
        </div>
      </div>
    );
  }

  // Check role requirement
  if (requiredRole && userAuth.federationRole !== requiredRole) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg border border-purple-200 p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-2xl font-bold text-purple-700 mb-4">Insufficient Permissions</h1>
          <p className="text-gray-600 mb-4">
            This feature requires the "{requiredRole}" role.
          </p>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
            <p className="text-purple-800 text-sm">
              <strong>Your Role:</strong> {userAuth.federationRole || 'None'}<br />
              <strong>Required Role:</strong> {requiredRole}
            </p>
          </div>
          <p className="text-gray-500 text-sm">
            Contact a family guardian to request role elevation.
          </p>
        </div>
      </div>
    );
  }

  // All checks passed, render the protected content
  return <>{children}</>;
};

export default ProtectedFamilyRoute;