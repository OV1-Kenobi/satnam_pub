/**
 * Enhanced Citadel Academy Reward System Component
 * Bitcoin-only reward redemption with comprehensive anti-gaming protection
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import {
  ArrowRight,
  Award,
  Bitcoin,
  Calendar,
  Check,
  Clock,
  Crown,
  Download,
  Eye,
  EyeOff,
  Gift,
  Shield,
  Star,
  Trophy,
  Users,
  X,
  Zap,
  AlertTriangle,
  Lock,
  Unlock,
  Target,
  TrendingUp
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  RewardConfig,
  RewardRedemption,
  RewardType,
  rewardSystem,
  AntiGamingValidation
} from '../../lib/citadel/reward-system';

interface EnhancedRewardSystemProps {
  studentPubkey: string;
  familyId?: string;
  isAdmin?: boolean;
  onRewardRedeemed?: (redemption: RewardRedemption) => void;
}

interface RewardCardProps {
  reward: RewardConfig;
  isAvailable: boolean;
  onRedeem: (rewardType: RewardType) => void;
  isRedeeming?: boolean;
  antiGamingValidation?: AntiGamingValidation;
}

interface RedemptionCardProps {
  redemption: RewardRedemption;
  onClick: (redemption: RewardRedemption) => void;
}

interface AntiGamingStatusProps {
  validation: AntiGamingValidation;
}

const EnhancedRewardSystem: React.FC<EnhancedRewardSystemProps> = ({ 
  studentPubkey, 
  familyId, 
  isAdmin = false,
  onRewardRedeemed
}) => {
  const [availableRewards, setAvailableRewards] = useState<RewardConfig[]>([]);
  const [redemptionHistory, setRedemptionHistory] = useState<RewardRedemption[]>([]);
  const [selectedRedemption, setSelectedRedemption] = useState<RewardRedemption | null>(null);
  const [currentView, setCurrentView] = useState<'available' | 'history' | 'pending' | 'anti-gaming'>('available');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeemingReward, setRedeemingReward] = useState<RewardType | null>(null);
  const [antiGamingValidations, setAntiGamingValidations] = useState<Map<string, AntiGamingValidation>>(new Map());

  useEffect(() => {
    loadRewardsData();
  }, [studentPubkey]);

  const loadRewardsData = async () => {
    try {
      setLoading(true);
      
      // Load available rewards with anti-gaming validation
      const availableRewards = await rewardSystem.getAvailableRewards(studentPubkey, familyId);
      setAvailableRewards(availableRewards);
      
      // Validate anti-gaming measures for each reward
      const validations = new Map<string, AntiGamingValidation>();
      for (const reward of availableRewards) {
        const validation = await rewardSystem['validateAntiGamingMeasures'](
          reward.anti_gaming_measures,
          studentPubkey,
          await rewardSystem.getStudentProgress(studentPubkey) || {
            student_pubkey: studentPubkey,
            completed_modules: [],
            achievements: [],
            total_study_time: 0,
            last_activity: new Date().toISOString(),
            level: 1,
            badges: [],
            course_progress: {},
            invitation_history: [],
            browser_fingerprints: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        );
        validations.set(reward.type, validation);
      }
      setAntiGamingValidations(validations);
      
      // Load redemption history
      const redemptions = await rewardSystem.getStudentRedemptions(studentPubkey);
      setRedemptionHistory(redemptions);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleRedeemReward = async (rewardType: RewardType) => {
    try {
      setRedeemingReward(rewardType);
      
      // Check anti-gaming validation
      const validation = antiGamingValidations.get(rewardType);
      if (validation && !validation.is_valid) {
        throw new Error(`Anti-gaming validation failed: ${validation.violations.join(', ')}`);
      }
      
      const redemption = await rewardSystem.redeemReward(studentPubkey, rewardType);
      
      if (redemption) {
        // Refresh data
        await loadRewardsData();
        
        // Notify parent component
        if (onRewardRedeemed) {
          onRewardRedeemed(redemption);
        }
        
        // Show success message
        alert('Reward redeemed successfully!');
      } else {
        throw new Error('Redemption failed');
      }
    } catch (error) {
      alert(`Failed to redeem reward: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRedeemingReward(null);
    }
  };

  const getRewardIcon = (type: RewardType) => {
    const icons = {
      'lightning-sats': Zap,
      'family-credits': Users,
      'course-credits': Target,
      'achievement-nft': Award,
      'premium-access': Star,
      'mentorship-time': Trophy,
      'hardware-discount': Shield,
      'conference-access': Crown,
      'citadel-equity': Bitcoin
    };
    return icons[type] || Gift;
  };

  const getRewardColor = (type: RewardType) => {
    const colors = {
      'lightning-sats': 'from-yellow-400 to-orange-500',
      'family-credits': 'from-purple-400 to-purple-600',
      'course-credits': 'from-blue-400 to-blue-600',
      'achievement-nft': 'from-blue-400 to-blue-600',
      'premium-access': 'from-green-400 to-green-600',
      'mentorship-time': 'from-red-400 to-red-600',
      'hardware-discount': 'from-gray-400 to-gray-600',
      'conference-access': 'from-orange-400 to-red-500',
      'citadel-equity': 'from-yellow-400 to-yellow-600'
    };
    return colors[type] || 'from-gray-400 to-gray-600';
  };

  const getStatusColor = (status: string) => {
    const colors = {
      'pending': 'text-yellow-400',
      'approved': 'text-green-400',
      'rejected': 'text-red-400',
      'processed': 'text-green-400',
      'expired': 'text-gray-400'
    };
    return colors[status] || 'text-gray-400';
  };

  const getStatusIcon = (status: string) => {
    const icons = {
      'pending': Clock,
      'approved': Check,
      'rejected': X,
      'processed': Check,
      'expired': Clock
    };
    return icons[status] || Clock;
  };

  const pendingRedemptions = redemptionHistory.filter(r => r.status === 'pending');
  const completedRedemptions = redemptionHistory.filter(r => r.status === 'processed' || r.status === 'approved');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
          <div className="flex items-center space-x-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
            <span className="text-white font-medium">Loading Enhanced Rewards...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600">
        <div className="bg-red-500/10 backdrop-blur-sm rounded-2xl p-8 border border-red-500/20">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Gift className="h-8 w-8 text-red-400" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Error Loading Rewards</h3>
            <p className="text-red-200 mb-4">{error}</p>
            <button
              onClick={loadRewardsData}
              className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-purple-900 rounded-2xl p-6 mb-8 border border-yellow-400/20">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Enhanced Bitcoin Rewards</h1>
              <p className="text-purple-200">Earn Bitcoin rewards with advanced anti-gaming protection</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="bg-white/10 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <Gift className="h-5 w-5 text-yellow-400" />
                  <span className="text-white font-medium">{availableRewards.length}</span>
                  <span className="text-purple-200 text-sm">available</span>
                </div>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <Trophy className="h-5 w-5 text-green-400" />
                  <span className="text-white font-medium">{completedRedemptions.length}</span>
                  <span className="text-purple-200 text-sm">earned</span>
                </div>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <Shield className="h-5 w-5 text-blue-400" />
                  <span className="text-white font-medium">Protected</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-8 border border-white/20">
          <div className="flex space-x-1">
            {[
              { key: 'available', label: 'Available', icon: Gift, count: availableRewards.length },
              { key: 'pending', label: 'Pending', icon: Clock, count: pendingRedemptions.length },
              { key: 'history', label: 'History', icon: Trophy, count: completedRedemptions.length },
              { key: 'anti-gaming', label: 'Security', icon: Shield, count: 0 }
            ].map(({ key, label, icon: Icon, count }) => (
              <button
                key={key}
                onClick={() => setCurrentView(key as any)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                  currentView === key
                    ? 'bg-yellow-400 text-purple-900 font-bold'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
                {count > 0 && (
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    currentView === key ? 'bg-purple-900 text-yellow-400' : 'bg-white/20 text-white'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content based on current view */}
        {currentView === 'available' && (
          <AvailableRewardsSection 
            rewards={availableRewards}
            onRedeem={handleRedeemReward}
            redeemingReward={redeemingReward}
            antiGamingValidations={antiGamingValidations}
          />
        )}
        
        {currentView === 'pending' && (
          <PendingRedemptionsSection 
            redemptions={pendingRedemptions}
            onSelect={setSelectedRedemption}
          />
        )}
        
        {currentView === 'history' && (
          <RedemptionHistorySection 
            redemptions={completedRedemptions}
            onSelect={setSelectedRedemption}
          />
        )}

        {currentView === 'anti-gaming' && (
          <AntiGamingSection 
            validations={Array.from(antiGamingValidations.values())}
          />
        )}

        {/* Redemption Detail Modal */}
        {selectedRedemption && (
          <RedemptionDetailModal 
            redemption={selectedRedemption}
            onClose={() => setSelectedRedemption(null)}
          />
        )}
      </div>
    </div>
  );
};

const AvailableRewardsSection: React.FC<{
  rewards: RewardConfig[];
  onRedeem: (rewardType: RewardType) => void;
  redeemingReward: RewardType | null;
  antiGamingValidations: Map<string, AntiGamingValidation>;
}> = ({ rewards, onRedeem, redeemingReward, antiGamingValidations }) => {
  if (rewards.length === 0) {
    return (
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 text-center">
        <div className="w-16 h-16 bg-gray-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Gift className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-white font-bold text-lg mb-2">No Rewards Available</h3>
        <p className="text-purple-200">Complete more educational achievements to unlock rewards</p>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
      <h2 className="text-2xl font-bold text-white mb-6">Available Rewards</h2>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rewards.map((reward) => (
          <RewardCard
            key={reward.type}
            reward={reward}
            isAvailable={true}
            onRedeem={onRedeem}
            isRedeeming={redeemingReward === reward.type}
            antiGamingValidation={antiGamingValidations.get(reward.type)}
          />
        ))}
      </div>
    </div>
  );
};

const AntiGamingSection: React.FC<{
  validations: AntiGamingValidation[];
}> = ({ validations }) => {
  const totalRiskScore = validations.reduce((sum, v) => sum + v.risk_score, 0);
  const averageRiskScore = validations.length > 0 ? totalRiskScore / validations.length : 0;
  const violations = validations.flatMap(v => v.violations);
  const uniqueViolations = [...new Set(violations)];

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
      <h2 className="text-2xl font-bold text-white mb-6">Anti-Gaming Security Status</h2>
      
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white/10 rounded-xl p-6 border border-white/20">
          <div className="flex items-center space-x-3 mb-4">
            <Shield className="h-8 w-8 text-blue-400" />
            <div>
              <h3 className="text-white font-bold">Security Score</h3>
              <p className="text-purple-200 text-sm">Overall protection level</p>
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white mb-2">
              {Math.round(100 - averageRiskScore)}%
            </div>
            <div className="w-full bg-gray-600 rounded-full h-2">
              <div 
                className="bg-blue-400 h-2 rounded-full transition-all duration-300"
                style={{ width: `${100 - averageRiskScore}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="bg-white/10 rounded-xl p-6 border border-white/20">
          <div className="flex items-center space-x-3 mb-4">
            <AlertTriangle className="h-8 w-8 text-yellow-400" />
            <div>
              <h3 className="text-white font-bold">Active Violations</h3>
              <p className="text-purple-200 text-sm">Security issues detected</p>
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white mb-2">
              {uniqueViolations.length}
            </div>
            <p className="text-purple-200 text-sm">
              {uniqueViolations.length === 0 ? 'All clear' : 'Review required'}
            </p>
          </div>
        </div>

        <div className="bg-white/10 rounded-xl p-6 border border-white/20">
          <div className="flex items-center space-x-3 mb-4">
            <TrendingUp className="h-8 w-8 text-green-400" />
            <div>
              <h3 className="text-white font-bold">Protection Active</h3>
              <p className="text-purple-200 text-sm">Anti-gaming measures</p>
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white mb-2">
              {validations.filter(v => v.is_valid).length}/{validations.length}
            </div>
            <p className="text-purple-200 text-sm">
              Rewards protected
            </p>
          </div>
        </div>
      </div>

      {uniqueViolations.length > 0 && (
        <div className="bg-yellow-500/10 rounded-xl p-6 border border-yellow-500/20">
          <h3 className="text-white font-bold mb-4">Security Violations Detected</h3>
          <div className="space-y-2">
            {uniqueViolations.map((violation, index) => (
              <div key={index} className="flex items-center space-x-2 text-yellow-200">
                <AlertTriangle className="h-4 w-4" />
                <span>{violation}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const RewardCard: React.FC<RewardCardProps> = ({ 
  reward, 
  isAvailable, 
  onRedeem, 
  isRedeeming = false,
  antiGamingValidation
}) => {
  const IconComponent = getRewardIcon(reward.type);
  const colorClass = getRewardColor(reward.type);
  const isBlocked = antiGamingValidation && !antiGamingValidation.is_valid;

  return (
    <div className={`bg-white/10 rounded-xl p-6 border transition-all duration-300 ${
      isBlocked 
        ? 'border-red-500/50 hover:border-red-400/70' 
        : 'border-white/20 hover:border-yellow-400/50'
    }`}>
      <div className="text-center">
        <div className={`w-16 h-16 bg-gradient-to-br ${colorClass} rounded-full flex items-center justify-center mx-auto mb-4`}>
          <IconComponent className="h-8 w-8 text-white" />
        </div>
        
        <h3 className="text-white font-bold text-lg mb-2">{reward.name}</h3>
        <p className="text-purple-200 text-sm mb-4">{reward.description}</p>
        
        <div className="space-y-2 mb-4">
          {reward.value > 0 && (
            <div className="flex items-center justify-center space-x-2">
              <Bitcoin className="h-4 w-4 text-yellow-400" />
              <span className="text-yellow-400 font-medium">
                {reward.type === 'lightning-sats' ? `${reward.value} sats` : 
                 reward.type === 'family-credits' ? `${reward.value} credits` : 
                 reward.type === 'course-credits' ? `${reward.value} course credits` :
                 `${reward.value} value`}
              </span>
            </div>
          )}
          
          <div className="flex items-center justify-center space-x-2 text-xs">
            <span className="px-2 py-1 bg-white/20 text-white rounded-full">
              {reward.privacy_level}
            </span>
            {reward.expiry_days && (
              <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded-full">
                {reward.expiry_days} days
              </span>
            )}
          </div>
        </div>
        
        {/* Anti-gaming status */}
        {antiGamingValidation && (
          <div className="mb-4">
            <AntiGamingStatus validation={antiGamingValidation} />
          </div>
        )}
        
        <div className="space-y-2 mb-4">
          <div className="text-xs text-purple-200">
            <div>Max redemptions: {reward.max_redemptions}</div>
            {reward.family_approval_required && (
              <div className="flex items-center justify-center space-x-1 mt-1">
                <Shield className="h-3 w-3" />
                <span>Guardian approval required</span>
              </div>
            )}
          </div>
        </div>
        
        {isAvailable && !isBlocked && (
          <button
            onClick={() => onRedeem(reward.type)}
            disabled={isRedeeming}
            className={`w-full py-3 px-4 rounded-lg font-bold transition-all duration-300 ${
              isRedeeming 
                ? 'bg-gray-500 text-gray-300 cursor-not-allowed' 
                : 'bg-yellow-400 hover:bg-yellow-500 text-purple-900 hover:scale-105'
            }`}
          >
            {isRedeeming ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-900"></div>
                <span>Redeeming...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-2">
                <Gift className="h-4 w-4" />
                <span>Redeem Reward</span>
              </div>
            )}
          </button>
        )}

        {isBlocked && (
          <div className="w-full py-3 px-4 rounded-lg bg-red-500/20 border border-red-500/50">
            <div className="flex items-center justify-center space-x-2 text-red-300">
              <Lock className="h-4 w-4" />
              <span>Security Blocked</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const AntiGamingStatus: React.FC<AntiGamingStatusProps> = ({ validation }) => {
  const riskLevel = validation.risk_score < 30 ? 'low' : validation.risk_score < 70 ? 'medium' : 'high';
  const riskColor = riskLevel === 'low' ? 'text-green-400' : riskLevel === 'medium' ? 'text-yellow-400' : 'text-red-400';
  const riskIcon = riskLevel === 'low' ? Shield : riskLevel === 'medium' ? AlertTriangle : X;

  return (
    <div className="text-xs">
      <div className={`flex items-center justify-center space-x-1 ${riskColor}`}>
        <riskIcon className="h-3 w-3" />
        <span className="capitalize">{riskLevel} risk</span>
      </div>
      {validation.violations.length > 0 && (
        <div className="text-red-300 text-xs mt-1">
          {validation.violations[0]}
        </div>
      )}
    </div>
  );
};

// Reuse existing components with minor updates
const PendingRedemptionsSection: React.FC<{
  redemptions: RewardRedemption[];
  onSelect: (redemption: RewardRedemption) => void;
}> = ({ redemptions, onSelect }) => {
  if (redemptions.length === 0) {
    return (
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 text-center">
        <div className="w-16 h-16 bg-yellow-400/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Clock className="h-8 w-8 text-yellow-400" />
        </div>
        <h3 className="text-white font-bold text-lg mb-2">No Pending Redemptions</h3>
        <p className="text-purple-200">Your reward redemptions will appear here while processing</p>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
      <h2 className="text-2xl font-bold text-white mb-6">Pending Redemptions</h2>
      
      <div className="space-y-4">
        {redemptions.map((redemption) => (
          <RedemptionCard
            key={redemption.id}
            redemption={redemption}
            onClick={onSelect}
          />
        ))}
      </div>
    </div>
  );
};

const RedemptionHistorySection: React.FC<{
  redemptions: RewardRedemption[];
  onSelect: (redemption: RewardRedemption) => void;
}> = ({ redemptions, onSelect }) => {
  if (redemptions.length === 0) {
    return (
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 text-center">
        <div className="w-16 h-16 bg-green-400/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trophy className="h-8 w-8 text-green-400" />
        </div>
        <h3 className="text-white font-bold text-lg mb-2">No Rewards Earned Yet</h3>
        <p className="text-purple-200">Your completed reward redemptions will appear here</p>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
      <h2 className="text-2xl font-bold text-white mb-6">Reward History</h2>
      
      <div className="space-y-4">
        {redemptions.map((redemption) => (
          <RedemptionCard
            key={redemption.id}
            redemption={redemption}
            onClick={onSelect}
          />
        ))}
      </div>
    </div>
  );
};

const RedemptionCard: React.FC<RedemptionCardProps> = ({ redemption, onClick }) => {
  const IconComponent = getRewardIcon(redemption.reward_type);
  const colorClass = getRewardColor(redemption.reward_type);
  const statusColor = getStatusColor(redemption.status);
  const StatusIcon = getStatusIcon(redemption.status);

  return (
    <div
      onClick={() => onClick(redemption)}
      className="bg-white/10 rounded-xl p-6 border border-white/20 hover:border-yellow-400/50 transition-all duration-300 cursor-pointer"
    >
      <div className="flex items-center space-x-4">
        <div className={`w-12 h-12 bg-gradient-to-br ${colorClass} rounded-full flex items-center justify-center`}>
          <IconComponent className="h-6 w-6 text-white" />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold">{redemption.reward_type.replace('-', ' ')}</h3>
            <div className={`flex items-center space-x-1 ${statusColor}`}>
              <StatusIcon className="h-4 w-4" />
              <span className="text-sm font-medium capitalize">{redemption.status}</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4 mt-2">
            {redemption.value > 0 && (
              <div className="flex items-center space-x-1">
                <Bitcoin className="h-3 w-3 text-yellow-400" />
                <span className="text-yellow-400 text-sm">{redemption.value}</span>
              </div>
            )}
            
            <div className="text-purple-200 text-sm">
              {new Date(redemption.created_at * 1000).toLocaleDateString()}
            </div>
            
            {redemption.expires_at && (
              <div className="text-orange-300 text-sm">
                Expires: {new Date(redemption.expires_at * 1000).toLocaleDateString()}
              </div>
            )}
          </div>
          
          {redemption.guardian_approval && (
            <div className="flex items-center space-x-1 mt-2">
              <Shield className="h-3 w-3 text-green-400" />
              <span className="text-green-400 text-xs">Guardian approved</span>
            </div>
          )}
        </div>
        
        <ArrowRight className="h-5 w-5 text-purple-300" />
      </div>
    </div>
  );
};

const RedemptionDetailModal: React.FC<{
  redemption: RewardRedemption;
  onClose: () => void;
}> = ({ redemption, onClose }) => {
  const IconComponent = getRewardIcon(redemption.reward_type);
  const colorClass = getRewardColor(redemption.reward_type);
  const statusColor = getStatusColor(redemption.status);
  const StatusIcon = getStatusIcon(redemption.status);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-purple-900 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-yellow-400/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Redemption Details</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-yellow-400 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <div className="text-center mb-6">
          <div className={`w-24 h-24 bg-gradient-to-br ${colorClass} rounded-full flex items-center justify-center mx-auto mb-4`}>
            <IconComponent className="h-12 w-12 text-white" />
          </div>
          <h3 className="text-white font-bold text-2xl mb-2 capitalize">
            {redemption.reward_type.replace('-', ' ')}
          </h3>
          <div className={`flex items-center justify-center space-x-2 ${statusColor}`}>
            <StatusIcon className="h-5 w-5" />
            <span className="text-lg font-medium capitalize">{redemption.status}</span>
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-purple-200 text-sm">Value</label>
              <div className="bg-white/10 rounded-lg p-3 mt-1">
                <div className="flex items-center space-x-2">
                  <Bitcoin className="h-4 w-4 text-yellow-400" />
                  <span className="text-white font-medium">{redemption.value}</span>
                </div>
              </div>
            </div>
            
            <div>
              <label className="text-purple-200 text-sm">Created</label>
              <div className="bg-white/10 rounded-lg p-3 mt-1">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-purple-300" />
                  <span className="text-white font-medium">
                    {new Date(redemption.created_at * 1000).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
            
            {redemption.processed_at && (
              <div>
                <label className="text-purple-200 text-sm">Processed</label>
                <div className="bg-white/10 rounded-lg p-3 mt-1">
                  <div className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-green-400" />
                    <span className="text-white font-medium">
                      {new Date(redemption.processed_at * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="space-y-4">
            {redemption.expires_at && (
              <div>
                <label className="text-purple-200 text-sm">Expires</label>
                <div className="bg-white/10 rounded-lg p-3 mt-1">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-orange-400" />
                    <span className="text-white font-medium">
                      {new Date(redemption.expires_at * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            <div>
              <label className="text-purple-200 text-sm">Privacy</label>
              <div className="bg-white/10 rounded-lg p-3 mt-1">
                <div className="flex items-center space-x-2">
                  {redemption.privacy_encrypted ? (
                    <EyeOff className="h-4 w-4 text-purple-300" />
                  ) : (
                    <Eye className="h-4 w-4 text-purple-300" />
                  )}
                  <span className="text-white font-medium">
                    {redemption.privacy_encrypted ? 'Encrypted' : 'Public'}
                  </span>
                </div>
              </div>
            </div>
            
            {redemption.guardian_approval && (
              <div>
                <label className="text-purple-200 text-sm">Guardian Approval</label>
                <div className="bg-white/10 rounded-lg p-3 mt-1">
                  <div className="flex items-center space-x-2">
                    <Shield className="h-4 w-4 text-green-400" />
                    <span className="text-white font-medium">Approved</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {redemption.redemption_proof && (
          <div className="mt-6">
            <label className="text-purple-200 text-sm">Redemption Proof</label>
            <div className="bg-white/10 rounded-lg p-4 mt-1">
              <div className="flex items-center justify-between">
                <code className="text-white text-sm font-mono break-all">
                  {redemption.redemption_proof}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(redemption.redemption_proof!)}
                  className="ml-2 p-2 bg-yellow-400 hover:bg-yellow-500 text-purple-900 rounded-lg transition-colors"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
        
        {redemption.reward_type === 'lightning-sats' && redemption.status === 'processed' && (
          <div className="mt-6 p-4 bg-yellow-400/10 rounded-lg border border-yellow-400/20">
            <div className="flex items-center space-x-2 mb-2">
              <Zap className="h-5 w-5 text-yellow-400" />
              <span className="text-yellow-400 font-bold">Lightning Payment</span>
            </div>
            <p className="text-purple-200 text-sm">
              Your Lightning payment has been processed successfully. 
              The sats should appear in your wallet shortly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedRewardSystem; 