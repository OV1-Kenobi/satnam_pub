// Dashboard Router for Satnam.pub Platform
// File: src/components/navigation/DashboardRouter.tsx
// Main router that manages dashboard switching and authentication

import { useEffect, useState } from 'react';
import { useAuth } from '../auth/FamilyFederationAuth';
import DashboardNavigation from './DashboardNavigation';

// Import existing dashboard components
import EnhancedFamilyDashboard from '../EnhancedFamilyDashboard';
import FamilyFinancialsDashboard from '../FamilyFinancialsDashboard';
import IndividualFinancesDashboard from '../IndividualFinancesDashboard';

interface DashboardRouterProps {
  initialDashboard?: 'family' | 'individual' | 'enhanced';
}

// Get default dashboard based on user role
function getDefaultDashboard(userRole: string): 'family' | 'individual' | 'enhanced' {
  switch (userRole) {
    case 'parent':
      return 'enhanced'; // Parents get advanced features by default
    case 'guardian':
      return 'family'; // Guardians get family overview
    case 'child':
      return 'individual'; // Children get personal wallet
    default:
      return 'individual';
  }
}

// Dashboard Router Component
export function DashboardRouter({ initialDashboard }: DashboardRouterProps = {}) {
  const { userAuth, isAuthenticated, isLoading } = useAuth();
  const [currentDashboard, setCurrentDashboard] = useState<'family' | 'individual' | 'enhanced'>('individual');

  // Set default dashboard based on user role when authenticated
  useEffect(() => {
    if (isAuthenticated && userAuth?.federationRole) {
      const defaultDashboard = initialDashboard || getDefaultDashboard(userAuth.federationRole);
      setCurrentDashboard(defaultDashboard);
    }
  }, [isAuthenticated, userAuth, initialDashboard]);

  // Loading state during authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 flex items-center justify-center">
        <div className="bg-purple-900 rounded-2xl p-8 border border-purple-300/20 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-200 mx-auto mb-4"></div>
          <h3 className="text-white font-semibold text-lg mb-2">Loading Dashboard</h3>
          <p className="text-purple-200 text-sm">Preparing your family banking experience...</p>
        </div>
      </div>
    );
  }

  // Authentication check is handled by individual dashboard components via DashboardAuthWrapper
  // This router focuses on navigation between authenticated dashboards

  const renderDashboard = () => {
    const commonProps = {
      onBack: () => setCurrentDashboard('individual') // Fallback navigation
    };

    switch (currentDashboard) {
      case 'family':
        return (
          <FamilyFinancialsDashboard 
            familyData={{
              familyId: userAuth?.familyId || 'default_family',
              familyName: userAuth?.familyName || 'Your Family'
            }}
            {...commonProps}
          />
        );
      
      case 'individual':
        return (
          <IndividualFinancesDashboard 
            memberId={userAuth?.memberId || 'default_member'}
            memberData={{
              username: userAuth?.username || 'User',
              role: userAuth?.federationRole || 'child',
              lightningAddress: userAuth?.lightningAddress || '',
              spendingLimits: userAuth?.spendingLimits
            }}
            {...commonProps}
          />
        );
      
      case 'enhanced':
        return (
          <EnhancedFamilyDashboard 
            {...commonProps}
          />
        );
      
      default:
        return (
          <IndividualFinancesDashboard 
            memberId={userAuth?.memberId || 'default_member'}
            memberData={{
              username: userAuth?.username || 'User',
              role: userAuth?.federationRole || 'child',
              lightningAddress: userAuth?.lightningAddress || ''
            }}
            {...commonProps}
          />
        );
    }
  };

  const handleDashboardChange = (dashboard: string) => {
    setCurrentDashboard(dashboard as 'family' | 'individual' | 'enhanced');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Dashboard Navigation Header */}
      {isAuthenticated && userAuth?.federationRole && (
        <DashboardNavigation
          currentDashboard={currentDashboard}
          userRole={userAuth.federationRole}
          onDashboardChange={handleDashboardChange}
        />
      )}
      
      {/* Main Dashboard Content */}
      <main className="container mx-auto px-6 py-8">
        {renderDashboard()}
      </main>
      
      {/* Footer with Platform Info */}
      <footer className="bg-white border-t border-gray-200 px-6 py-4 mt-8">
        <div className="container mx-auto">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center space-x-4">
              <span>🏰 Satnam.pub</span>
              <span>•</span>
              <span>Privacy-first family banking</span>
              <span>•</span>
              <span>Lightning ⚡ + Cashu 🥜</span>
            </div>
            <div className="flex items-center space-x-4">
              <span>Dashboard: {currentDashboard}</span>
              <span>•</span>
              <span>Role: {userAuth?.federationRole || 'guest'}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default DashboardRouter;