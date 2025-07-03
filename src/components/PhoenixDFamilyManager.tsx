/**
 * PHOENIXD FAMILY MANAGER
 * 
 * Replaced with Enhanced Liquidity Dashboard
 * This wrapper maintains API compatibility while providing superior features
 */

import React from 'react';
import EnhancedLiquidityDashboard from './EnhancedLiquidityDashboard';

interface PhoenixDFamilyManagerProps {
  familyId: string;
  onChannelAction?: (action: string, channelId: string) => void;
}

export default function PhoenixDFamilyManager({ 
  familyId, 
  onChannelAction 
}: PhoenixDFamilyManagerProps) {
  // Replace basic liquidity monitoring with enhanced intelligence dashboard
  return (
    <EnhancedLiquidityDashboard 
      familyId={familyId} 
      onChannelAction={onChannelAction}
    />
  );
}
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