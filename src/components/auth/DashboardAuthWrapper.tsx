// Dashboard Authentication Wrapper for Satnam.pub
// File: src/components/auth/DashboardAuthWrapper.tsx
// Provides comprehensive authentication protection for all dashboard components

import { AlertTriangle, ArrowLeft, Shield, User } from 'lucide-react';
import React, { useState } from 'react';
import SignInModal from '../SignInModal';
import { useAuth } from './FamilyFederationAuth';

interface DashboardAuthWrapperProps {
  children: React.ReactNode;
  requiredRole?: 'parent' | 'child' | 'guardian';
  dashboardType: 'family' | 'individual' | 'enhanced';
}

interface AccessDeniedMessageProps {
  requiredRole: string;
  userRole?: string;
}

interface DashboardHeaderProps {
  user: any;
  dashboardType: string;
}

// Access Denied Message Component
const AccessDeniedMessage: React.FC<AccessDeniedMessageProps> = ({ requiredRole, userRole }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-400 via-red-500 to-red-600 flex items-center justify-center p-4">
      <div className="bg-red-900 rounded-2xl p-8 max-w-md w-full border border-red-300/20 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-red-800 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="h-8 w-8 text-red-200" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">Access Denied</h2>
        <p className="text-red-200 mb-4">
          Your role ({userRole || 'unknown'}) doesn't have permission to access this dashboard.
        </p>
        <p className="text-red-300 text-sm mb-6">
          Required role: {requiredRole}
        </p>
        <div className="bg-red-800/30 border border-red-500/50 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <Shield className="h-5 w-5 text-red-300 mt-0.5" />
            <div className="text-left">
              <p className="text-red-300 font-semibold text-sm">Privacy Protection Active</p>
              <p className="text-red-200 text-sm mt-1">
                Family Federation role-based access control prevents unauthorized access.
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => window.history.back()}
          className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Go Back</span>
        </button>
      </div>
    </div>
  );
};

// Dashboard Header Component
const DashboardHeader: React.FC<DashboardHeaderProps> = ({ user, dashboardType }) => {
  const getDashboardTitle = () => {
    switch (dashboardType) {
      case 'family': return 'Family Financials Dashboard';
      case 'individual': return 'Individual Finances Dashboard';
      case 'enhanced': return 'Enhanced Family Dashboard';
      default: return 'Dashboard';
    }
  };

  const getDashboardIcon = () => {
    switch (dashboardType) {
      case 'family': return '🏰';
      case 'individual': return '👤';
      case 'enhanced': return '⚡';
      default: return '📊';
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center">
            <span className="text-lg">{getDashboardIcon()}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{getDashboardTitle()}</h1>
            <p className="text-sm text-gray-600">Privacy-protected family banking</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{user?.username || 'Family Member'}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.federationRole || 'member'}</p>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center">
            <User className="h-4 w-4 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Dashboard Authentication Wrapper
export function DashboardAuthWrapper({ children, requiredRole, dashboardType }: DashboardAuthWrapperProps) {
  const { isAuthenticated, userAuth, isLoading } = useAuth();
  const [showSignIn, setShowSignIn] = useState(!isAuthenticated);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 flex items-center justify-center">
        <div className="bg-purple-900 rounded-2xl p-8 border border-purple-300/20">
          <div className="flex items-center space-x-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-200"></div>
            <div>
              <h3 className="text-white font-semibold">Authenticating</h3>
              <p className="text-purple-200 text-sm">Verifying Family Federation access...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check authentication
  if (!isAuthenticated) {
    return (
      <SignInModal
        isOpen={showSignIn}
        onClose={() => setShowSignIn(false)}
        onSignInSuccess={(destination) => {
          setShowSignIn(false);
          window.location.reload();
        }}
        onCreateNew={() => setShowSignIn(false)}
        destination={dashboardType === 'individual' ? 'individual' : 'family'}
      />
    );
  }

  // Check role-based access
  if (requiredRole && userAuth?.federationRole !== requiredRole) {
    return <AccessDeniedMessage requiredRole={requiredRole} userRole={userAuth?.federationRole} />;
  }

  return (
    <div className="authenticated-dashboard">
      <DashboardHeader user={userAuth} dashboardType={dashboardType} />
      {children}
    </div>
  );
}

export default DashboardAuthWrapper;