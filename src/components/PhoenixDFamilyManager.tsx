import {
    Activity,
    AlertCircle,
    BarChart3,
    CheckCircle,
    Clock,
    Link,
    Loader2,
    RefreshCw,
    Settings,
    Unlink,
    Waves,
    Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { PhoenixDFamilyChannel } from '../../types/family';

interface PhoenixDFamilyManagerProps {
  familyId: string;
  onChannelAction?: (action: string, channelId: string) => void;
}

interface PhoenixDStatus {
  nodeId: string;
  connected: boolean;
  blockHeight: number;
  version: string;
  network: string;
  automatedLiquidity: {
    enabled: boolean;
    minChannelSize: number;
    maxChannelSize: number;
    targetLiquidity: number;
    lastLiquidityRequest: Date;
  };
  familyChannels: PhoenixDFamilyChannel[];
  liquidityHealth: {
    overall: string;
    inboundCapacity: number;
    outboundCapacity: number;
    utilizationRate: number;
    recommendations: string[];
  };
}

const PhoenixDFamilyManager: React.FC<PhoenixDFamilyManagerProps> = ({
  familyId,
  onChannelAction,
}) => {
  const [phoenixdStatus, setPhoenixdStatus] = useState<PhoenixDStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<PhoenixDFamilyChannel | null>(null);

  // Fetch PhoenixD status
  const fetchPhoenixdStatus = async () => {
    try {
      setError(null);
      const response = await fetch(`/api/family/lightning/phoenixd-status?familyId=${familyId}`);
      const result = await response.json();
      
      if (result.success) {
        setPhoenixdStatus(result.data);
      } else {
        setError(result.error || 'Failed to load PhoenixD status');
      }
    } catch (err) {
      setError('Network error loading PhoenixD status');
      console.error('PhoenixD status fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Refresh data
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPhoenixdStatus();
  };

  // Handle channel action
  const handleChannelAction = async (action: string, channelId: string) => {
    try {
      // In real implementation, this would call the appropriate API
      onChannelAction?.(action, channelId);
      await fetchPhoenixdStatus(); // Refresh data
    } catch (err) {
      setError(`Failed to ${action} channel`);
      console.error('Channel action error:', err);
    }
  };

  // Format numbers
  const formatSats = (sats: number): string => {
    return new Intl.NumberFormat().format(sats);
  };

  const formatTimeAgo = (date: Date) => {
    const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
    if (hours < 1) return "Just now";
    if (hours === 1) return "1 hour ago";
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400';
      case 'inactive': return 'text-red-400';
      case 'pending': return 'text-yellow-400';
      case 'closing': return 'text-orange-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4" />;
      case 'inactive': return <AlertCircle className="h-4 w-4" />;
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'closing': return <Unlink className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'excellent': return 'text-green-400';
      case 'good': return 'text-blue-400';
      case 'warning': return 'text-yellow-400';
      case 'critical': return 'text-red-400';
      default: return 'text-orange-400';
    }
  };

  useEffect(() => {
    fetchPhoenixdStatus();
    
    // Set up periodic refresh
    const interval = setInterval(fetchPhoenixdStatus, 60000); // 1 minute
    return () => clearInterval(interval);
  }, [familyId]);

  if (loading) {
    return (
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 text-orange-400 animate-spin" />
          <span className="ml-3 text-orange-200">Loading PhoenixD Status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-orange-900 rounded-2xl p-6 border border-red-400/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-6 w-6 text-red-400" />
            <h3 className="text-lg font-semibold text-white">PhoenixD Manager Error</h3>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 text-orange-400 hover:text-orange-300 transition-colors"
            disabled={refreshing}
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-red-300">{error}</p>
        <button
          onClick={handleRefresh}
          className="mt-4 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!phoenixdStatus) return null;

  return (
    <div className="space-y-6">
      {/* PhoenixD Status Header */}
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">PhoenixD Family Manager</h2>
              <p className="text-orange-300">Lightning liquidity & channel management</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-orange-400 hover:text-orange-300 transition-colors"
            >
              <Settings className="h-5 w-5" />
            </button>
            <button
              onClick={handleRefresh}
              className="p-2 text-orange-400 hover:text-orange-300 transition-colors"
              disabled={refreshing}
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Node Status */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-orange-300">Node Status</span>
              <div className={`flex items-center space-x-1 ${
                phoenixdStatus.connected ? 'text-green-400' : 'text-red-400'
              }`}>
                {phoenixdStatus.connected ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
              </div>
            </div>
            <div className="text-lg font-bold text-white">
              {phoenixdStatus.connected ? 'Connected' : 'Disconnected'}
            </div>
            <div className="text-sm text-orange-300">
              v{phoenixdStatus.version} • {phoenixdStatus.network}
            </div>
          </div>

          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-orange-300">Block Height</span>
              <Activity className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-lg font-bold text-white">
              {phoenixdStatus.blockHeight.toLocaleString()}
            </div>
            <div className="text-sm text-orange-300">
              Synced
            </div>
          </div>

          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-orange-300">Family Channels</span>
              <Link className="h-4 w-4 text-purple-400" />
            </div>
            <div className="text-lg font-bold text-white">
              {phoenixdStatus.familyChannels.length}
            </div>
            <div className="text-sm text-orange-300">
              Active channels
            </div>
          </div>

          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-orange-300">Auto Liquidity</span>
              <Waves className="h-4 w-4 text-cyan-400" />
            </div>
            <div className={`text-lg font-bold ${
              phoenixdStatus.automatedLiquidity.enabled ? 'text-green-400' : 'text-yellow-400'
            }`}>
              {phoenixdStatus.automatedLiquidity.enabled ? 'Enabled' : 'Disabled'}
            </div>
            <div className="text-sm text-orange-300">
              Target: {(phoenixdStatus.automatedLiquidity.targetLiquidity * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Liquidity Health */}
        <div className="bg-orange-800/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">Liquidity Health</h3>
            <div className={`flex items-center space-x-2 ${getHealthColor(phoenixdStatus.liquidityHealth.overall)}`}>
              <BarChart3 className="h-5 w-5" />
              <span className="capitalize">{phoenixdStatus.liquidityHealth.overall}</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-orange-300 text-sm">Inbound Capacity</div>
              <div className="text-white font-semibold">{formatSats(phoenixdStatus.liquidityHealth.inboundCapacity)} sats</div>
            </div>
            <div>
              <div className="text-orange-300 text-sm">Outbound Capacity</div>
              <div className="text-white font-semibold">{formatSats(phoenixdStatus.liquidityHealth.outboundCapacity)} sats</div>
            </div>
            <div>
              <div className="text-orange-300 text-sm">Utilization Rate</div>
              <div className="text-white font-semibold">{(phoenixdStatus.liquidityHealth.utilizationRate * 100).toFixed(1)}%</div>
            </div>
          </div>

          {/* Liquidity Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-orange-300 mb-1">
              <span>Liquidity Distribution</span>
              <span>{(phoenixdStatus.liquidityHealth.utilizationRate * 100).toFixed(1)}% utilized</span>
            </div>
            <div className="w-full bg-orange-800 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${phoenixdStatus.liquidityHealth.utilizationRate * 100}%` }}
              />
            </div>
          </div>

          {/* Recommendations */}
          {phoenixdStatus.liquidityHealth.recommendations.length > 0 && (
            <div>
              <div className="text-orange-300 text-sm mb-2">Recommendations:</div>
              <ul className="space-y-1">
                {phoenixdStatus.liquidityHealth.recommendations.map((rec, index) => (
                  <li key={index} className="text-orange-200 text-sm flex items-start space-x-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Family Channels */}
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <h3 className="text-lg font-semibold text-white mb-4">Family Lightning Channels</h3>
        <div className="space-y-4">
          {phoenixdStatus.familyChannels.map((channel) => (
            <div key={channel.channelId} className="bg-orange-800/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className={`flex items-center space-x-1 ${getStatusColor(channel.status)}`}>
                    {getStatusIcon(channel.status)}
                    <span className="font-semibold text-white">{channel.familyMember}</span>
                  </div>
                  <span className="text-sm text-orange-300 capitalize">({channel.status})</span>
                </div>
                <button
                  onClick={() => setSelectedChannel(channel)}
                  className="text-orange-400 hover:text-orange-300 text-sm"
                >
                  View Details
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                <div>
                  <div className="text-orange-300 text-sm">Capacity</div>
                  <div className="text-white font-semibold">{formatSats(channel.capacity)}</div>
                </div>
                <div>
                  <div className="text-orange-300 text-sm">Local Balance</div>
                  <div className="text-white font-semibold">{formatSats(channel.localBalance)}</div>
                </div>
                <div>
                  <div className="text-orange-300 text-sm">Remote Balance</div>
                  <div className="text-white font-semibold">{formatSats(channel.remoteBalance)}</div>
                </div>
                <div>
                  <div className="text-orange-300 text-sm">Last Activity</div>
                  <div className="text-white font-semibold">{formatTimeAgo(channel.lastActivity)}</div>
                </div>
              </div>

              {/* Channel Balance Bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-orange-300 mb-1">
                  <span>Local</span>
                  <span>Remote</span>
                </div>
                <div className="w-full bg-orange-800 rounded-full h-2 flex">
                  <div 
                    className="bg-gradient-to-r from-green-500 to-green-400 h-2 rounded-l-full"
                    style={{ width: `${(channel.localBalance / channel.capacity) * 100}%` }}
                  />
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-blue-400 h-2 rounded-r-full"
                    style={{ width: `${(channel.remoteBalance / channel.capacity) * 100}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {channel.automatedLiquidity && (
                    <span className="text-xs bg-cyan-600 text-white px-2 py-1 rounded">
                      Auto Liquidity
                    </span>
                  )}
                  <span className="text-xs text-orange-300">
                    ID: {channel.channelId.slice(0, 8)}...
                  </span>
                </div>
                
                <div className="flex space-x-2">
                  {channel.status === 'active' && (
                    <button
                      onClick={() => handleChannelAction('close', channel.channelId)}
                      className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors"
                    >
                      Close
                    </button>
                  )}
                  {channel.status === 'inactive' && (
                    <button
                      onClick={() => handleChannelAction('reopen', channel.channelId)}
                      className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Automated Liquidity Settings */}
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <h3 className="text-lg font-semibold text-white mb-4">Automated Liquidity Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <div className="text-orange-300 text-sm mb-1">Status</div>
              <div className={`text-lg font-semibold ${
                phoenixdStatus.automatedLiquidity.enabled ? 'text-green-400' : 'text-yellow-400'
              }`}>
                {phoenixdStatus.automatedLiquidity.enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>
            
            <div>
              <div className="text-orange-300 text-sm mb-1">Target Liquidity</div>
              <div className="text-white font-semibold">
                {(phoenixdStatus.automatedLiquidity.targetLiquidity * 100).toFixed(0)}%
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="text-orange-300 text-sm mb-1">Channel Size Range</div>
              <div className="text-white font-semibold">
                {formatSats(phoenixdStatus.automatedLiquidity.minChannelSize)} - {formatSats(phoenixdStatus.automatedLiquidity.maxChannelSize)} sats
              </div>
            </div>
            
            <div>
              <div className="text-orange-300 text-sm mb-1">Last Request</div>
              <div className="text-white font-semibold">
                {formatTimeAgo(phoenixdStatus.automatedLiquidity.lastLiquidityRequest)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Channel Details Modal */}
      {selectedChannel && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-orange-900 rounded-2xl p-6 max-w-lg w-full border border-orange-400/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Channel Details</h3>
              <button
                onClick={() => setSelectedChannel(null)}
                className="text-orange-400 hover:text-orange-300"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="text-orange-300 text-sm">Family Member</div>
                <div className="text-white font-semibold">{selectedChannel.familyMember}</div>
              </div>
              
              <div>
                <div className="text-orange-300 text-sm">Channel ID</div>
                <div className="text-white font-mono text-sm break-all">{selectedChannel.channelId}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-orange-300 text-sm">Status</div>
                  <div className={`font-semibold capitalize ${getStatusColor(selectedChannel.status)}`}>
                    {selectedChannel.status}
                  </div>
                </div>
                <div>
                  <div className="text-orange-300 text-sm">Auto Liquidity</div>
                  <div className={`font-semibold ${
                    selectedChannel.automatedLiquidity ? 'text-green-400' : 'text-gray-400'
                  }`}>
                    {selectedChannel.automatedLiquidity ? 'Enabled' : 'Disabled'}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-orange-300 text-sm">Capacity</div>
                  <div className="text-white font-semibold">{formatSats(selectedChannel.capacity)}</div>
                </div>
                <div>
                  <div className="text-orange-300 text-sm">Local</div>
                  <div className="text-white font-semibold">{formatSats(selectedChannel.localBalance)}</div>
                </div>
                <div>
                  <div className="text-orange-300 text-sm">Remote</div>
                  <div className="text-white font-semibold">{formatSats(selectedChannel.remoteBalance)}</div>
                </div>
              </div>
              
              <div>
                <div className="text-orange-300 text-sm">Last Activity</div>
                <div className="text-white">{formatTimeAgo(selectedChannel.lastActivity)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhoenixDFamilyManager;