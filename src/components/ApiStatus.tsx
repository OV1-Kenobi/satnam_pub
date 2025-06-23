import { AlertCircle, CheckCircle, Loader2, RefreshCw } from 'lucide-react';
import { useApiHealth } from '../hooks/useApiHealth';

interface ApiStatusProps {
  className?: string;
  showDetails?: boolean;
}

export default function ApiStatus({ className = '', showDetails = false }: ApiStatusProps) {
  const { isOnline, isLoading, error, lastChecked, refetch } = useApiHealth();

  const getStatusColor = () => {
    if (isLoading) return 'text-yellow-500';
    if (isOnline) return 'text-green-500';
    return 'text-red-500';
  };

  const getStatusIcon = () => {
    if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
    if (isOnline) return <CheckCircle className="h-4 w-4" />;
    return <AlertCircle className="h-4 w-4" />;
  };

  const getStatusText = () => {
    if (isLoading) return 'Checking...';
    if (isOnline) return 'API Online';
    return 'API Offline';
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`flex items-center space-x-1 ${getStatusColor()}`}>
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
      </div>
      
      <button
        onClick={refetch}
        disabled={isLoading}
        className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
        title="Refresh API status"
      >
        <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
      </button>

      {showDetails && (
        <div className="text-xs text-white/70">
          {lastChecked && (
            <span>Last checked: {lastChecked.toLocaleTimeString()}</span>
          )}
          {error && (
            <div className="text-red-400 mt-1">
              Error: {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}