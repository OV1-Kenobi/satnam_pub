/**
 * ENHANCED LIQUIDITY INTELLIGENCE DASHBOARD
 * 
 * Advanced liquidity management with forecasting, recommendations, and analytics
 * Replaces basic PhoenixDFamilyManager liquidity monitoring
 */

import {
    Activity,
    AlertCircle,
    BarChart3,
    Brain,
    CheckCircle,
    DollarSign,
    Loader2,
    RefreshCw,
    Settings,
    Target,
    TrendingUp,
    Zap,
    AlertTriangle
} from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { PhoenixDFamilyChannel } from '../../types/family';
import { LiquidityForecast, LiquidityIntelligenceSystem, LiquidityMetrics, OptimizationStrategy } from '../lib/liquidity-intelligence.js';

interface EnhancedLiquidityDashboardProps {
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
    targetInbound: number;
    targetOutbound: number;
    rebalanceThreshold: number;
  };
  liquidityHealth: {
    overall: 'excellent' | 'good' | 'warning' | 'critical';
    inboundCapacity: number;
    outboundCapacity: number;
    utilizationRate: number;
    recommendations: string[];
  };
  channels: PhoenixDFamilyChannel[];
}

export default function EnhancedLiquidityDashboard({ 
  familyId, 
  onChannelAction 
}: EnhancedLiquidityDashboardProps) {
  const [phoenixdStatus, setPhoenixdStatus] = useState<PhoenixDStatus | null>(null);
  const [liquidityMetrics, setLiquidityMetrics] = useState<LiquidityMetrics | null>(null);
  const [liquidityForecast, setLiquidityForecast] = useState<LiquidityForecast | null>(null);
  const [optimizationStrategies, setOptimizationStrategies] = useState<OptimizationStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'forecast' | 'optimization' | 'analytics'>('overview');
  
  // Initialize Liquidity Intelligence System
  const [liquiditySystem] = useState(() => new LiquidityIntelligenceSystem());

  const loadLiquidityIntelligence = useCallback(async () => {
    try {
      setLoading(true);
      
      // Load all liquidity intelligence data concurrently
      const [status, metrics, forecast, strategies] = await Promise.all([
        loadPhoenixDStatus(),
        liquiditySystem.getLiquidityMetrics(familyId),
        liquiditySystem.generateLiquidityForecast(familyId, 'daily'),
        liquiditySystem.getLiquidityMetrics(familyId).then(metrics => 
          liquiditySystem.generateLiquidityForecast(familyId, 'weekly').then(forecast =>
            liquiditySystem.generateOptimizationStrategies(familyId, metrics, forecast)
          )
        )
      ]);

      setPhoenixdStatus(status);
      setLiquidityMetrics(metrics);
      setLiquidityForecast(forecast);
      setOptimizationStrategies(strategies);
    } catch (error) {
      console.error('Failed to load liquidity intelligence:', error);
    } finally {
      setLoading(false);
    }
  }, [familyId, liquiditySystem]);

  useEffect(() => {
    loadLiquidityIntelligence();
    const interval = setInterval(loadLiquidityIntelligence, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [loadLiquidityIntelligence]);

  const loadPhoenixDStatus = async (): Promise<PhoenixDStatus> => {
    // Mock enhanced PhoenixD status - integrate with actual API
    return {
      nodeId: '03a1b2c3d4e5f6...',
      connected: true,
      blockHeight: 865432,
      version: '0.3.3',
      network: 'mainnet',
      automatedLiquidity: {
        enabled: true,
        targetInbound: 5000000,
        targetOutbound: 3000000,
        rebalanceThreshold: 0.2
      },
      liquidityHealth: {
        overall: 'good',
        inboundCapacity: 4200000,
        outboundCapacity: 2800000,
        utilizationRate: 0.68,
        recommendations: [
          'Consider opening new inbound channel',
          'Rebalance channel #1 within 24h'
        ]
      },
      channels: [
        {
          channelId: 'channel_001',
          familyMember: 'member_001',
          capacity: 5000000,
          localBalance: 2800000,
          remoteBalance: 2200000,
          status: 'active',
          automatedLiquidity: true,
          lastActivity: new Date()
        }
      ]
    };
  };

  const formatSats = (sats: number): string => {
    if (sats >= 100000000) return `${(sats / 100000000).toFixed(2)} BTC`;
    if (sats >= 1000000) return `${(sats / 1000000).toFixed(1)}M`;
    if (sats >= 1000) return `${(sats / 1000).toFixed(0)}K`;
    return sats.toString();
  };

  const getHealthColor = (health: string): string => {
    switch (health) {
      case 'excellent': return 'text-green-400';
      case 'good': return 'text-blue-400';
      case 'warning': return 'text-yellow-400';
      case 'critical': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getHealthBgColor = (health: string): string => {
    switch (health) {
      case 'excellent': return 'bg-green-500/20 border-green-500/30';
      case 'good': return 'bg-blue-500/20 border-blue-500/30';
      case 'warning': return 'bg-yellow-500/20 border-yellow-500/30';
      case 'critical': return 'bg-red-500/20 border-red-500/30';
      default: return 'bg-gray-500/20 border-gray-500/30';
    }
  };

  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* PhoenixD Status */}
      <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <Zap className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">PhoenixD Status</h3>
              <p className="text-orange-300">Lightning liquidity & channel management</p>
            </div>
          </div>
          <button
            onClick={loadLiquidityIntelligence}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-2 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-400' : 'text-gray-300'}`} />
            <span className="text-gray-300">Refresh</span>
          </button>
        </div>

        {phoenixdStatus && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Connection Status */}
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${phoenixdStatus.connected ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                {phoenixdStatus.connected ? (
                  <CheckCircle className="h-4 w-4 text-green-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-400" />
                )}
              </div>
              <div>
                <div className="text-white font-semibold">
                  {phoenixdStatus.connected ? 'Connected' : 'Disconnected'}
                </div>
                <div className="text-gray-400 text-sm">Block: {phoenixdStatus.blockHeight.toLocaleString()}</div>
              </div>
            </div>

            {/* Liquidity Health */}
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${getHealthBgColor(phoenixdStatus.liquidityHealth.overall)}`}>
                <Activity className={`h-4 w-4 ${getHealthColor(phoenixdStatus.liquidityHealth.overall)}`} />
              </div>
              <div>
                <div className={`font-semibold capitalize ${getHealthColor(phoenixdStatus.liquidityHealth.overall)}`}>
                  {phoenixdStatus.liquidityHealth.overall}
                </div>
                <div className="text-gray-400 text-sm">Liquidity Health</div>
              </div>
            </div>

            {/* Version Info */}
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Settings className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <div className="text-white font-semibold">v{phoenixdStatus.version}</div>
                <div className="text-gray-400 text-sm">{phoenixdStatus.network}</div>
              </div>
            </div>
          </div>
        )}

        {/* Recommendations */}
        {phoenixdStatus?.liquidityHealth?.recommendations && 
         Array.isArray(phoenixdStatus.liquidityHealth.recommendations) && 
         phoenixdStatus.liquidityHealth.recommendations.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Recommendations</h4>
            <div className="space-y-2">
              {phoenixdStatus.liquidityHealth.recommendations.map((rec, index) => (
                <div key={index} className="flex items-center space-x-2 text-sm text-gray-400">
                  <AlertTriangle className="h-3 w-3 text-yellow-400" />
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Real-time Metrics */}
      {liquidityMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <BarChart3 className="h-4 w-4 text-blue-400" />
              <span className="text-gray-300 text-sm">Utilization</span>
            </div>
            <div className="text-2xl font-bold text-white">
              {(liquidityMetrics.utilization.current * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-400">
              Trend: {liquidityMetrics.utilization.trend}
            </div>
          </div>

          <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Target className="h-4 w-4 text-green-400" />
              <span className="text-gray-300 text-sm">Success Rate</span>
            </div>
            <div className="text-2xl font-bold text-white">
              {(liquidityMetrics.efficiency.routingSuccessRate * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-400">
              Routing efficiency
            </div>
          </div>

          <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <DollarSign className="h-4 w-4 text-yellow-400" />
              <span className="text-gray-300 text-sm">Cost/TX</span>
            </div>
            <div className="text-2xl font-bold text-white">
              {formatSats(liquidityMetrics.efficiency.costPerTransaction)}
            </div>
            <div className="text-xs text-gray-400">
              Average cost
            </div>
          </div>

          <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp className="h-4 w-4 text-purple-400" />
              <span className="text-gray-300 text-sm">Growth</span>
            </div>
            <div className="text-2xl font-bold text-white">
              {(liquidityMetrics.growth.liquidityGrowthRate * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-400">
              Monthly growth
            </div>
          </div>
        </div>
      )}

      {/* Quick Recommendations */}
      {phoenixdStatus?.liquidityHealth.recommendations.length > 0 && (
        <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
          <h4 className="text-lg font-medium text-white mb-4 flex items-center space-x-2">
            <Brain className="h-5 w-5 text-purple-400" />
            <span>AI Recommendations</span>
          </h4>
          <div className="space-y-2">
            {phoenixdStatus.liquidityHealth.recommendations.map((rec, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-gray-700/30 rounded-lg">
                <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <span className="text-gray-300">{rec}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderForecastTab = () => (
    <div className="space-y-6">
      {liquidityForecast && (
        <>
          {/* Forecast Summary */}
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
            <h4 className="text-lg font-medium text-white mb-4">
              Liquidity Forecast - Next {liquidityForecast.forecastHorizon} Days
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-700/30 rounded-lg">
                <div className="text-2xl font-bold text-green-400">
                  +{formatSats(liquidityForecast.predictions.expectedInflow)}
                </div>
                <div className="text-gray-400">Expected Inflow</div>
              </div>
              <div className="text-center p-4 bg-gray-700/30 rounded-lg">
                <div className="text-2xl font-bold text-red-400">
                  -{formatSats(liquidityForecast.predictions.expectedOutflow)}
                </div>
                <div className="text-gray-400">Expected Outflow</div>
              </div>
              <div className="text-center p-4 bg-gray-700/30 rounded-lg">
                <div className="text-2xl font-bold text-blue-400">
                  {formatSats(Math.abs(liquidityForecast.predictions.netFlow))}
                </div>
                <div className="text-gray-400">Net Flow</div>
              </div>
            </div>
          </div>

          {/* Risk Factors */}
          {liquidityForecast.riskFactors.length > 0 && (
            <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
              <h4 className="text-lg font-medium text-white mb-4">Risk Assessment</h4>
              <div className="space-y-3">
                {liquidityForecast.riskFactors.map((risk, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 bg-gray-700/30 rounded-lg">
                    <AlertCircle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                      risk.impact === 'critical' ? 'text-red-400' :
                      risk.impact === 'high' ? 'text-orange-400' :
                      risk.impact === 'medium' ? 'text-yellow-400' : 'text-blue-400'
                    }`} />
                    <div className="flex-1">
                      <div className="text-white font-medium">{risk.factor}</div>
                      <div className="text-gray-400 text-sm">{risk.description}</div>
                      <div className="text-gray-500 text-xs mt-1">
                        Probability: {(risk.probability * 100).toFixed(0)}% | 
                        Impact: {risk.impact}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderOptimizationTab = () => (
    <div className="space-y-6">
      {optimizationStrategies.map((strategy, index) => (
        <div key={index} className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h4 className="text-lg font-medium text-white">{strategy.name}</h4>
              <p className="text-gray-400">{strategy.description}</p>
            </div>
            <div className="text-right">
              <div className="text-green-400 font-bold">
                +{formatSats(strategy.netBenefit)}
              </div>
              <div className="text-gray-400 text-sm">Net Benefit</div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-gray-700/30 rounded-lg">
              <div className="font-semibold text-white">{formatSats(strategy.totalCost)}</div>
              <div className="text-gray-400 text-sm">Total Cost</div>
            </div>
            <div className="text-center p-3 bg-gray-700/30 rounded-lg">
              <div className="font-semibold text-white">{strategy.implementationTime}h</div>
              <div className="text-gray-400 text-sm">Time to Implement</div>
            </div>
            <div className="text-center p-3 bg-gray-700/30 rounded-lg">
              <div className="font-semibold text-white">{(strategy.successProbability * 100).toFixed(0)}%</div>
              <div className="text-gray-400 text-sm">Success Rate</div>
            </div>
            <div className="text-center p-3 bg-gray-700/30 rounded-lg">
              <div className="font-semibold text-white">Priority {strategy.priority}</div>
              <div className="text-gray-400 text-sm">Implementation Order</div>
            </div>
          </div>

          <div className="space-y-2">
            {strategy.actions.map((action, actionIndex) => (
              <div key={actionIndex} className="flex items-center space-x-3 p-3 bg-gray-700/20 rounded-lg">
                <div className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 text-sm font-medium">
                  {action.step}
                </div>
                <div className="flex-1">
                  <div className="text-white">{action.action}</div>
                  <div className="text-gray-400 text-sm">
                    Cost: {formatSats(action.estimatedCost)} | 
                    Benefit: {formatSats(action.estimatedBenefit)} | 
                    Risk: {action.riskLevel}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (loading && !phoenixdStatus) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center space-x-3">
          <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          <span className="text-gray-300">Loading liquidity intelligence...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Tabs */}
      <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
        <h2 className="text-2xl font-bold text-white mb-4 flex items-center space-x-3">
          <Brain className="h-6 w-6 text-purple-400" />
          <span>Liquidity Intelligence</span>
        </h2>
        
        <div className="flex space-x-4 border-b border-gray-700/50">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'forecast', label: 'Forecast', icon: TrendingUp },
            { id: 'optimization', label: 'Optimization', icon: Target },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-purple-400 text-purple-400'
                  : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'forecast' && renderForecastTab()}
      {activeTab === 'optimization' && renderOptimizationTab()}
      {activeTab === 'analytics' && (
        <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
          <h4 className="text-lg font-medium text-white mb-4">Advanced Analytics</h4>
          <p className="text-gray-400">Advanced analytics dashboard coming soon...</p>
        </div>
      )}
    </div>
  );
}