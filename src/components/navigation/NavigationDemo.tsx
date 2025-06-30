// Navigation System Demo Component
// File: src/components/navigation/NavigationDemo.tsx
// Demonstrates the complete navigation system integration

import { ArrowLeft, Play, Settings, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import DashboardRouter from './DashboardRouter';

interface NavigationDemoProps {
  onBack?: () => void;
}

// Navigation Demo Component
export function NavigationDemo({ onBack }: NavigationDemoProps) {
  const [showRouter, setShowRouter] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'parent' | 'child' | 'guardian'>('parent');
  const [selectedDashboard, setSelectedDashboard] = useState<'family' | 'individual' | 'enhanced'>('individual');

  if (showRouter) {
    return <DashboardRouter initialDashboard={selectedDashboard} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-white rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard Navigation System</h1>
              <p className="text-gray-600 mt-1">Complete navigation for Satnam.pub family banking</p>
            </div>
          </div>
          <div className="text-4xl">🧭</div>
        </div>

        {/* Navigation System Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Role-Based Access</h3>
                <p className="text-sm text-gray-600">Smart dashboard visibility</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• Parent: All dashboards</li>
              <li>• Guardian: Family + Individual</li>
              <li>• Child: Individual only</li>
            </ul>
          </div>

          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center">
                <Wallet className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Three Dashboards</h3>
                <p className="text-sm text-gray-600">Connected experiences</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• Individual Finances</li>
              <li>• Family Financials</li>
              <li>• Enhanced Treasury</li>
            </ul>
          </div>

          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center">
                <Settings className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Quick Actions</h3>
                <p className="text-sm text-gray-600">Context-aware shortcuts</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• Send Payments</li>
              <li>• Request Allowance</li>
              <li>• Guardian Approvals</li>
            </ul>
          </div>
        </div>

        {/* Demo Configuration */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Demo Configuration</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select User Role
              </label>
              <div className="space-y-2">
                {['parent', 'guardian', 'child'].map((role) => (
                  <label key={role} className="flex items-center space-x-3">
                    <input
                      type="radio"
                      name="role"
                      value={role}
                      checked={selectedRole === role}
                      onChange={(e) => setSelectedRole(e.target.value as 'parent' | 'child' | 'guardian')}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm capitalize">{role}</span>
                    <span className="text-xs text-gray-500">
                      {role === 'parent' && '(All access)'}
                      {role === 'guardian' && '(Family + Individual)'}
                      {role === 'child' && '(Individual only)'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Dashboard Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Initial Dashboard
              </label>
              <div className="space-y-2">
                {['individual', 'family', 'enhanced'].map((dashboard) => (
                  <label key={dashboard} className="flex items-center space-x-3">
                    <input
                      type="radio"
                      name="dashboard"
                      value={dashboard}
                      checked={selectedDashboard === dashboard}
                      onChange={(e) => setSelectedDashboard(e.target.value as 'family' | 'individual' | 'enhanced')}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm capitalize">{dashboard}</span>
                    <span className="text-xs text-gray-500">
                      {dashboard === 'individual' && '(Personal wallet)'}
                      {dashboard === 'family' && '(Family overview)'}
                      {dashboard === 'enhanced' && '(Advanced features)'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Launch Button */}
        <div className="text-center">
          <button
            onClick={() => setShowRouter(true)}
            className="inline-flex items-center space-x-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white px-8 py-4 rounded-xl font-semibold hover:from-purple-700 hover:to-purple-800 transition-all duration-300 shadow-lg hover:shadow-xl"
          >
            <Play className="h-5 w-5" />
            <span>Launch Dashboard Navigation</span>
          </button>
          <p className="text-sm text-gray-600 mt-3">
            Experience the complete navigation system with role-based access controls
          </p>
        </div>
      </div>
    </div>
  );
}

export default NavigationDemo;