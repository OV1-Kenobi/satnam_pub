/**
 * @fileoverview PhoenixD Node Status Component Usage Examples
 * @description Examples showing how to integrate the PhoenixDNodeStatus component
 * into different parts of the Satnam.pub family banking platform
 */

import React from 'react';
import PhoenixDNodeStatus from '../src/components/PhoenixDNodeStatus';

/**
 * Example 1: Basic Usage
 * Default configuration with 30-second refresh and full details
 */
export const BasicPhoenixDStatus: React.FC = () => {
  return (
    <div className="p-6 bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">PhoenixD Node Status - Basic</h1>
        <PhoenixDNodeStatus />
      </div>
    </div>
  );
};

/**
 * Example 2: Fast Refresh Configuration
 * 10-second refresh interval for real-time monitoring
 */
export const FastRefreshPhoenixDStatus: React.FC = () => {
  return (
    <div className="p-6 bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">PhoenixD Node Status - Fast Refresh</h1>
        <PhoenixDNodeStatus refreshInterval={10000} showDetails={true} />
      </div>
    </div>
  );
};

/**
 * Example 3: Compact View
 * Hide detailed information for dashboard widgets
 */
export const CompactPhoenixDStatus: React.FC = () => {
  return (
    <div className="p-6 bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 min-h-screen">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">PhoenixD Node Status - Compact</h1>
        <PhoenixDNodeStatus refreshInterval={60000} showDetails={false} />
      </div>
    </div>
  );
};

/**
 * Example 4: Dashboard Integration
 * How to integrate into a family dashboard layout
 */
export const DashboardIntegration: React.FC = () => {
  return (
    <div className="p-6 bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Family Banking Dashboard</h1>
        
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Column - Node Status */}
          <div>
            <PhoenixDNodeStatus refreshInterval={30000} showDetails={true} />
          </div>
          
          {/* Right Column - Other Components */}
          <div className="space-y-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <h2 className="text-xl font-bold text-white mb-4">Family Balance</h2>
              <div className="text-3xl font-bold text-orange-400">2,550,000 sats</div>
              <p className="text-purple-200">Total family treasury</p>
            </div>
            
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <h2 className="text-xl font-bold text-white mb-4">Recent Activity</h2>
              <p className="text-purple-200">Last transaction: 2 hours ago</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Example 5: Mobile-Optimized View
 * Responsive design for mobile devices
 */
export const MobilePhoenixDStatus: React.FC = () => {
  return (
    <div className="p-4 bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 min-h-screen">
      <div className="max-w-sm mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Node Status</h1>
        <PhoenixDNodeStatus refreshInterval={45000} showDetails={false} />
      </div>
    </div>
  );
};

/**
 * Example 6: Admin Panel Integration
 * Detailed monitoring for administrators
 */
export const AdminPanelPhoenixDStatus: React.FC = () => {
  return (
    <div className="p-6 bg-gradient-to-br from-gray-800 to-gray-900 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Admin Panel - Node Monitoring</h1>
        
        <div className="grid gap-6">
          {/* Main Status Display */}
          <PhoenixDNodeStatus refreshInterval={15000} showDetails={true} />
          
          {/* Additional Admin Tools */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <h3 className="text-white font-semibold mb-2">System Alerts</h3>
              <div className="text-green-400 text-sm">All systems operational</div>
            </div>
            
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <h3 className="text-white font-semibold mb-2">Performance</h3>
              <div className="text-orange-400 text-sm">45ms avg latency</div>
            </div>
            
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <h3 className="text-white font-semibold mb-2">Uptime</h3>
              <div className="text-green-400 text-sm">99.9% (32 days)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Example 7: Error Handling Demo
 * Shows how the component handles various error states
 */
export const ErrorHandlingDemo: React.FC = () => {
  const [simulateError, setSimulateError] = React.useState(false);
  
  // Mock fetch to simulate errors
  React.useEffect(() => {
    if (simulateError) {
      const originalFetch = global.fetch;
      global.fetch = () => Promise.reject(new Error('Simulated network error'));
      
      return () => {
        global.fetch = originalFetch;
      };
    }
  }, [simulateError]);
  
  return (
    <div className="p-6 bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Error Handling Demo</h1>
        
        <div className="mb-6">
          <button
            onClick={() => setSimulateError(!simulateError)}
            className={`px-4 py-2 rounded-lg font-semibold transition-all duration-300 ${
              simulateError
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {simulateError ? 'Restore Connection' : 'Simulate Error'}
          </button>
        </div>
        
        <PhoenixDNodeStatus refreshInterval={20000} showDetails={true} />
      </div>
    </div>
  );
};

// Export all examples for easy importing
export default {
  BasicPhoenixDStatus,
  FastRefreshPhoenixDStatus,
  CompactPhoenixDStatus,
  DashboardIntegration,
  MobilePhoenixDStatus,
  AdminPanelPhoenixDStatus,
  ErrorHandlingDemo,
};