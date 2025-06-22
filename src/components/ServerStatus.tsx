/**
 * @fileoverview Server Status Component
 * @description Shows the connection status to the backend server
 */

import { AlertCircle, CheckCircle, Loader, RefreshCw } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { checkServerHealth } from '../lib/api';

interface ServerStatusProps {
  className?: string;
  showDetails?: boolean;
}

export const ServerStatus: React.FC<ServerStatusProps> = ({ 
  className = '', 
  showDetails = false 
}) => {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const checkStatus = async () => {
    setIsRefreshing(true);
    try {
      const isHealthy = await checkServerHealth();
      setStatus(isHealthy ? 'online' : 'offline');
      setLastCheck(new Date());
    } catch {
      setStatus('offline');
      setLastCheck(new Date());
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    checkStatus();
    
    // Check status every 30 seconds
    const interval = setInterval(checkStatus, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = () => {
    if (isRefreshing) {
      return <Loader className="h-4 w-4 animate-spin" />;
    }
    
    switch (status) {
      case 'checking':
        return <Loader className="h-4 w-4 animate-spin" />;
      case 'online':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'offline':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'checking':
        return 'Checking...';
      case 'online':
        return 'Server Online';
      case 'offline':
        return 'Server Offline';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'checking':
        return 'text-yellow-600';
      case 'online':
        return 'text-green-600';
      case 'offline':
        return 'text-red-600';
    }
  };

  if (!showDetails) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        {getStatusIcon()}
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border p-4 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <span className={`font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
        </div>
        <button
          onClick={checkStatus}
          disabled={isRefreshing}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          title="Refresh status"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      {lastCheck && (
        <p className="text-xs text-gray-500">
          Last checked: {lastCheck.toLocaleTimeString()}
        </p>
      )}
      
      {status === 'offline' && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700 font-medium">Backend Server Unavailable</p>
          <p className="text-xs text-red-600 mt-1">
            Make sure the backend server is running on port 8000:
          </p>
          <code className="text-xs bg-red-100 px-2 py-1 rounded mt-1 block">
            npm run server:dev
          </code>
        </div>
      )}
      
      {status === 'online' && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-700 font-medium">All Systems Operational</p>
          <p className="text-xs text-green-600 mt-1">
            Backend API is responding normally
          </p>
        </div>
      )}
    </div>
  );
};

export default ServerStatus;