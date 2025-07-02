/**
 * Privacy Dashboard Indicators
 * Shows privacy status and metrics across the family banking dashboard
 */

import { Activity, AlertTriangle, ChevronRight, Eye, EyeOff, Shield, TrendingUp } from "lucide-react";
import React, { useEffect, useState } from "react";
import { PrivacyEnhancedApiService } from "../../services/privacyEnhancedApi";
import { PrivacyLevel } from "../../types/privacy";

interface PrivacyMetrics {
  overall_privacy_score: number;
  giftwrapped_percentage: number;
  encrypted_percentage: number;
  minimal_percentage: number;
  total_transactions: number;
  privacy_routing_success: number;
  guardian_approvals_pending: number;
  privacy_trend: 'up' | 'down' | 'stable';
}

interface PrivacyDashboardIndicatorsProps {
  familyId: string;
  userId?: string;
  showDetailedMetrics?: boolean;
  onPrivacySettingsClick?: () => void;
}

export const PrivacyDashboardIndicators: React.FC<PrivacyDashboardIndicatorsProps> = ({
  familyId,
  userId,
  showDetailedMetrics = false,
  onPrivacySettingsClick,
}) => {
  const [metrics, setMetrics] = useState<PrivacyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPrivacyLevel, setCurrentPrivacyLevel] = useState<PrivacyLevel>(PrivacyLevel.GIFTWRAPPED);
  
  const apiService = new PrivacyEnhancedApiService();

  useEffect(() => {
    loadPrivacyMetrics();
  }, [familyId, userId]);

  const loadPrivacyMetrics = async () => {
    try {
      setLoading(true);
      
      // Mock privacy metrics - in real implementation, this would call the API
      const mockMetrics: PrivacyMetrics = {
        overall_privacy_score: 85,
        giftwrapped_percentage: 60,
        encrypted_percentage: 30,
        minimal_percentage: 10,
        total_transactions: 147,
        privacy_routing_success: 96,
        guardian_approvals_pending: 2,
        privacy_trend: 'up'
      };
      
      setMetrics(mockMetrics);
      
      // Get current user's privacy preference
      const recommendation = apiService.getPrivacyRecommendation(50000);
      setCurrentPrivacyLevel(recommendation);
      
    } catch (error) {
      console.error('Failed to load privacy metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPrivacyScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400 bg-green-500/20';
    if (score >= 60) return 'text-yellow-400 bg-yellow-500/20';
    return 'text-red-400 bg-red-500/20';
  };

  const getPrivacyLevelColor = (level: PrivacyLevel) => {
    switch (level) {
      case PrivacyLevel.GIFTWRAPPED:
        return 'text-green-400 bg-green-500/20 border-green-500/30';
      case PrivacyLevel.ENCRYPTED:
        return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
      case PrivacyLevel.MINIMAL:
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      default:
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  if (loading) {
    return (
      <div className="bg-white/10 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-white/20 rounded w-1/2 mb-2"></div>
        <div className="h-8 bg-white/20 rounded w-full"></div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
        <div className="flex items-center space-x-2">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <span className="text-red-200">Failed to load privacy metrics</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Privacy Score */}
      <div className="bg-white/10 rounded-lg p-4 border border-white/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-purple-400" />
            <h3 className="text-white font-semibold">Privacy Score</h3>
          </div>
          <div className="flex items-center space-x-2">
            {metrics.privacy_trend === 'up' ? (
              <TrendingUp className="h-4 w-4 text-green-400" />
            ) : (
              <Activity className="h-4 w-4 text-gray-400" />
            )}
            <span className={`text-sm px-2 py-1 rounded-full ${getPrivacyScoreColor(metrics.overall_privacy_score)}`}>
              {metrics.overall_privacy_score}%
            </span>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-purple-200">Family Privacy Health</span>
            <span className="text-white">{metrics.privacy_routing_success}% Success Rate</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-purple-500 to-green-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${metrics.overall_privacy_score}%` }}
            />
          </div>
          <p className="text-xs text-purple-300">
            Based on {metrics.total_transactions} transactions this month
          </p>
        </div>
      </div>

      {/* Current Privacy Level */}
      <div className={`rounded-lg p-4 border ${getPrivacyLevelColor(currentPrivacyLevel)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-current/20 flex items-center justify-center">
              {currentPrivacyLevel === PrivacyLevel.GIFTWRAPPED && <EyeOff className="h-4 w-4" />}
              {currentPrivacyLevel === PrivacyLevel.ENCRYPTED && <Shield className="h-4 w-4" />}
              {currentPrivacyLevel === PrivacyLevel.MINIMAL && <Eye className="h-4 w-4" />}
            </div>
            <div>
              <div className="font-semibold capitalize">{currentPrivacyLevel}</div>
              <div className="text-sm opacity-80">Current Privacy Level</div>
            </div>
          </div>
          {onPrivacySettingsClick && (
            <button
              onClick={onPrivacySettingsClick}
              className="text-current hover:opacity-80 transition-opacity"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Guardian Approvals */}
      {metrics.guardian_approvals_pending > 0 && (
        <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            <div>
              <div className="text-yellow-200 font-semibold">
                {metrics.guardian_approvals_pending} Guardian Approval{metrics.guardian_approvals_pending > 1 ? 's' : ''} Pending
              </div>
              <div className="text-yellow-300 text-sm">
                High-privacy transactions awaiting guardian approval
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Metrics */}
      {showDetailedMetrics && (
        <div className="bg-white/10 rounded-lg p-4 border border-white/20">
          <h4 className="text-white font-semibold mb-3">Privacy Distribution</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-purple-200">Giftwrapped</span>
              </div>
              <span className="text-white">{metrics.giftwrapped_percentage}%</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-purple-200">Encrypted</span>
              </div>
              <span className="text-white">{metrics.encrypted_percentage}%</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <span className="text-purple-200">Minimal</span>
              </div>
              <span className="text-white">{metrics.minimal_percentage}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivacyDashboardIndicators;