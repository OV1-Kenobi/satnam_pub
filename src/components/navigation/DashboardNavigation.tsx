// Dashboard Navigation System for Satnam.pub
// File: src/components/navigation/DashboardNavigation.tsx
// Provides comprehensive navigation between dashboard components

import { Bell, Settings, User, Zap } from 'lucide-react';
import { useState } from 'react';

interface DashboardNavigationProps {
  currentDashboard: 'family' | 'individual' | 'enhanced';
  userRole: 'parent' | 'child' | 'guardian';
  onDashboardChange: (dashboard: string) => void;
}

interface QuickActionsProps {
  userRole: 'parent' | 'child' | 'guardian';
  currentDashboard: 'family' | 'individual' | 'enhanced';
}

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  action: () => void;
  requiresApproval?: boolean;
  availableOn: string[];
  roles?: string[];
}

// Role-Based Dashboard Access
function getAvailableDashboards(userRole: string) {
  const dashboards = [
    { 
      id: 'individual', 
      label: 'Personal Wallet', 
      icon: '👤', 
      roles: ['parent', 'child', 'guardian'] 
    },
    { 
      id: 'family', 
      label: 'Family Financials', 
      icon: '👨‍👩‍👧‍👦', 
      roles: ['parent', 'guardian'] 
    },
    { 
      id: 'enhanced', 
      label: 'Advanced Treasury', 
      icon: '🏛️', 
      roles: ['parent'] 
    }
  ];

  return dashboards.filter(dashboard => dashboard.roles.includes(userRole));
}

// Quick Actions Component
export function QuickActions({ userRole, currentDashboard }: QuickActionsProps) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAllowanceModal, setShowAllowanceModal] = useState(false);
  const [showGuardianPanel, setShowGuardianPanel] = useState(false);

  const openPaymentModal = () => setShowPaymentModal(true);
  const openAllowanceModal = () => setShowAllowanceModal(true);
  const openGuardianPanel = () => setShowGuardianPanel(true);

  const quickActions: QuickAction[] = [
    { 
      id: 'send-payment', 
      label: 'Send Payment', 
      icon: '⚡', 
      action: openPaymentModal,
      availableOn: ['individual', 'family', 'enhanced'] 
    },
    { 
      id: 'request-allowance', 
      label: 'Request Allowance', 
      icon: '🙋', 
      action: openAllowanceModal,
      availableOn: ['individual'], 
      roles: ['child'] 
    },
    { 
      id: 'guardian-approval', 
      label: 'Guardian Actions', 
      icon: '🛡️', 
      action: openGuardianPanel,
      availableOn: ['family', 'enhanced'], 
      roles: ['parent', 'guardian'] 
    }
  ];

  const availableActions = quickActions.filter(action => 
    action.availableOn.includes(currentDashboard) && 
    (!action.roles || action.roles.includes(userRole))
  );

  return (
    <div className="flex space-x-3">
      {availableActions.map(action => (
        <button
          key={action.id}
          onClick={action.action}
          className="flex items-center space-x-2 px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
        >
          <span>{action.icon}</span>
          <span className="text-sm">{action.label}</span>
        </button>
      ))}
      
      {/* User Profile Quick Access */}
      <div className="flex items-center space-x-2 ml-4">
        <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <Bell className="h-4 w-4" />
        </button>
        <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <Settings className="h-4 w-4" />
        </button>
        <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center">
          <User className="h-4 w-4 text-white" />
        </div>
      </div>
    </div>
  );
}

// Main Dashboard Navigation Component
export function DashboardNavigation({ currentDashboard, userRole, onDashboardChange }: DashboardNavigationProps) {
  const availableDashboards = getAvailableDashboards(userRole);

  return (
    <nav className="dashboard-navigation bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
      <div className="flex items-center justify-between">
        {/* Dashboard Navigation Tabs */}
        <div className="flex space-x-6">
          {availableDashboards.map(dashboard => (
            <button
              key={dashboard.id}
              onClick={() => onDashboardChange(dashboard.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                currentDashboard === dashboard.id 
                  ? 'bg-orange-500 text-white shadow-lg' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className="text-lg">{dashboard.icon}</span>
                <span>{dashboard.label}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Quick Actions */}
        <QuickActions userRole={userRole} currentDashboard={currentDashboard} />
      </div>

      {/* Role-based Navigation Hint */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Logged in as: <span className="font-medium capitalize">{userRole}</span></span>
          <div className="flex items-center space-x-2">
            <Zap className="h-3 w-3 text-orange-500" />
            <span>Privacy-first family banking</span>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default DashboardNavigation;