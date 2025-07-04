/**
 * Citadel Academy Badge System Component
 * Displays badges, achievements, and educational progress
 */

import {
    Award,
    Bitcoin,
    BookOpen,
    ChevronRight,
    Clock,
    Crown,
    Eye,
    Filter,
    Home,
    Lock,
    Shield,
    Star,
    Target,
    TrendingUp,
    Trophy,
    Users,
    X
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
    AchievementLevel,
    BadgeAward,
    BadgeCategory,
    BadgeDefinition,
    EducationSubject,
    StudentDashboardData
} from '../../types/education';

interface BadgeSystemProps {
  studentPubkey: string;
  familyId?: string;
  isAdmin?: boolean;
}

interface BadgeCardProps {
  badge: BadgeDefinition;
  award?: BadgeAward;
  isEarned: boolean;
  isAvailable: boolean;
  onClick: (badge: BadgeDefinition) => void;
}

interface AchievementCardProps {
  achievement: BadgeAward;
  badge: BadgeDefinition;
  onClick: (achievement: BadgeAward) => void;
}

const BadgeSystem: React.FC<BadgeSystemProps> = ({ 
  studentPubkey, 
  familyId, 
  isAdmin = false 
}) => {
  const [dashboardData, setDashboardData] = useState<StudentDashboardData | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<BadgeDefinition | null>(null);
  const [selectedAchievement, setSelectedAchievement] = useState<BadgeAward | null>(null);
  const [currentView, setCurrentView] = useState<'overview' | 'badges' | 'achievements' | 'progress'>('overview');
  const [filterCategory, setFilterCategory] = useState<BadgeCategory | 'all'>('all');
  const [filterSubject, setFilterSubject] = useState<EducationSubject | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, [studentPubkey]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/citadel/badges?action=student-progress&studentPubkey=${studentPubkey}`);
      
      if (!response.ok) {
        throw new Error('Failed to load dashboard data');
      }

      const result = await response.json();
      if (result.success) {
        setDashboardData(result.data);
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const getBadgeIcon = (category: BadgeCategory) => {
    const icons = {
      knowledge: BookOpen,
      practical: Target,
      security: Shield,
      leadership: Crown,
      sovereignty: Bitcoin,
      family: Users,
      community: Home
    };
    return icons[category] || Award;
  };

  const getLevelColor = (level: AchievementLevel) => {
    const colors = {
      initiate: 'from-gray-400 to-gray-600',
      apprentice: 'from-blue-400 to-blue-600',
      journeyman: 'from-green-400 to-green-600',
      craftsman: 'from-yellow-400 to-yellow-600',
      master: 'from-purple-400 to-purple-600',
      guardian: 'from-orange-400 to-orange-600',
      sage: 'from-red-400 to-red-600'
    };
    return colors[level] || 'from-gray-400 to-gray-600';
  };

  const getBadgeProgress = (subject: EducationSubject) => {
    if (!dashboardData) return 0;
    const subjectProgress = dashboardData.progress.subjects_progress.find(
      sp => sp.subject === subject
    );
    return subjectProgress ? (subjectProgress.badges_earned / subjectProgress.badges_available) * 100 : 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
          <div className="flex items-center space-x-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
            <span className="text-white font-medium">Loading Badge System...</span>
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
              <Award className="h-8 w-8 text-red-400" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Error Loading Badge System</h3>
            <p className="text-red-200 mb-4">{error}</p>
            <button
              onClick={loadDashboardData}
              className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-400/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Award className="h-8 w-8 text-yellow-400" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">No Progress Found</h3>
            <p className="text-purple-200 mb-4">Start your educational journey to earn badges</p>
            <button
              onClick={() => setCurrentView('badges')}
              className="bg-yellow-400 hover:bg-yellow-500 text-purple-900 font-bold py-2 px-4 rounded-lg transition-colors"
            >
              View Available Badges
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
              <h1 className="text-3xl font-bold text-white mb-2">Citadel Academy Badges</h1>
              <p className="text-purple-200">Track your Bitcoin mastery journey</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="bg-white/10 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <Crown className="h-5 w-5 text-yellow-400" />
                  <span className="text-white font-medium">{dashboardData.progress.current_level}</span>
                </div>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <Award className="h-5 w-5 text-yellow-400" />
                  <span className="text-white font-medium">{dashboardData.achievements_summary.total_badges}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-8 border border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex space-x-1">
              {[
                { key: 'overview', label: 'Overview', icon: TrendingUp },
                { key: 'badges', label: 'Badges', icon: Award },
                { key: 'achievements', label: 'Achievements', icon: Trophy },
                { key: 'progress', label: 'Progress', icon: Target }
              ].map(({ key, label, icon: Icon }) => (
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
                </button>
              ))}
            </div>
            
            {/* Filters */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-white" />
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value as BadgeCategory | 'all')}
                  className="bg-white/10 text-white border border-white/20 rounded-lg px-3 py-1 text-sm"
                >
                  <option value="all">All Categories</option>
                  <option value="knowledge">Knowledge</option>
                  <option value="practical">Practical</option>
                  <option value="security">Security</option>
                  <option value="leadership">Leadership</option>
                  <option value="sovereignty">Sovereignty</option>
                  <option value="family">Family</option>
                  <option value="community">Community</option>
                </select>
              </div>
              <div className="flex items-center space-x-2">
                <select
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value as EducationSubject | 'all')}
                  className="bg-white/10 text-white border border-white/20 rounded-lg px-3 py-1 text-sm"
                >
                  <option value="all">All Subjects</option>
                  <option value="bitcoin-fundamentals">Bitcoin Fundamentals</option>
                  <option value="lightning-network">Lightning Network</option>
                  <option value="privacy-sovereignty">Privacy & Sovereignty</option>
                  <option value="self-custody">Self Custody</option>
                  <option value="family-treasury">Family Treasury</option>
                  <option value="nostr-identity">Nostr Identity</option>
                  <option value="security-ops">Security Operations</option>
                  <option value="citadel-building">Citadel Building</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Content based on current view */}
        {currentView === 'overview' && (
          <OverviewSection 
            dashboardData={dashboardData} 
            onViewChange={setCurrentView}
          />
        )}
        
        {currentView === 'badges' && (
          <BadgesSection 
            dashboardData={dashboardData}
            filterCategory={filterCategory}
            filterSubject={filterSubject}
            onBadgeSelect={setSelectedBadge}
          />
        )}
        
        {currentView === 'achievements' && (
          <AchievementsSection 
            dashboardData={dashboardData}
            onAchievementSelect={setSelectedAchievement}
          />
        )}
        
        {currentView === 'progress' && (
          <ProgressSection 
            dashboardData={dashboardData}
          />
        )}

        {/* Badge Detail Modal */}
        {selectedBadge && (
          <BadgeDetailModal 
            badge={selectedBadge}
            onClose={() => setSelectedBadge(null)}
          />
        )}

        {/* Achievement Detail Modal */}
        {selectedAchievement && (
          <AchievementDetailModal 
            achievement={selectedAchievement}
            onClose={() => setSelectedAchievement(null)}
          />
        )}
      </div>
    </div>
  );
};

const OverviewSection: React.FC<{
  dashboardData: StudentDashboardData;
  onViewChange: (view: 'overview' | 'badges' | 'achievements' | 'progress') => void;
}> = ({ dashboardData, onViewChange }) => {
  const { progress, achievements_summary } = dashboardData;

  return (
    <div className="space-y-8">
      {/* Achievement Summary Cards */}
      <div className="grid md:grid-cols-4 gap-6">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
              <Award className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">Total Badges</h3>
              <p className="text-3xl font-bold text-yellow-400">{achievements_summary.total_badges}</p>
            </div>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">Learning Streak</h3>
              <p className="text-3xl font-bold text-orange-400">{achievements_summary.streak_info.current_streak}</p>
              <p className="text-purple-200 text-sm">days</p>
            </div>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center">
              <Crown className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">Current Level</h3>
              <p className="text-xl font-bold text-purple-400 capitalize">{progress.current_level}</p>
            </div>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center">
              <Clock className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">Study Hours</h3>
              <p className="text-3xl font-bold text-green-400">{progress.total_study_hours.toFixed(1)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Achievements */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Recent Achievements</h2>
          <button
            onClick={() => onViewChange('achievements')}
            className="text-yellow-400 hover:text-yellow-300 flex items-center space-x-2"
          >
            <span>View All</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {achievements_summary.recent_achievements.map((achievement) => (
            <div
              key={achievement.id}
              className="bg-white/10 rounded-xl p-4 border border-white/20 hover:border-yellow-400/50 transition-all duration-300"
            >
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                  <Trophy className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold">{achievement.badge_id}</h3>
                  <p className="text-purple-200 text-sm">
                    {new Date(achievement.awarded_at * 1000).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Next Milestones */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Next Milestones</h2>
          <button
            onClick={() => onViewChange('badges')}
            className="text-yellow-400 hover:text-yellow-300 flex items-center space-x-2"
          >
            <span>View All Badges</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {achievements_summary.next_milestones.map((badge) => (
            <div
              key={badge.id}
              className="bg-white/10 rounded-xl p-4 border border-white/20 hover:border-yellow-400/50 transition-all duration-300"
            >
              <div className="flex items-center space-x-3">
                <div className={`w-12 h-12 bg-gradient-to-br from-gray-400 to-gray-600 rounded-full flex items-center justify-center`}>
                  <Award className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold">{badge.name}</h3>
                  <p className="text-purple-200 text-sm">{badge.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const BadgesSection: React.FC<{
  dashboardData: StudentDashboardData;
  filterCategory: BadgeCategory | 'all';
  filterSubject: EducationSubject | 'all';
  onBadgeSelect: (badge: BadgeDefinition) => void;
}> = ({ dashboardData, filterCategory, filterSubject, onBadgeSelect }) => {
  const { available_badges, progress } = dashboardData;
  const earnedBadgeIds = new Set(progress.badges_earned.map(b => b.badge_id));

  // Filter badges
  const filteredBadges = available_badges.filter(badge => {
    if (filterCategory !== 'all' && badge.category !== filterCategory) return false;
    if (filterSubject !== 'all' && badge.subject !== filterSubject) return false;
    return true;
  });

  // Separate earned and available badges
  const earnedBadges = filteredBadges.filter(badge => earnedBadgeIds.has(badge.id));
  const availableBadges = filteredBadges.filter(badge => !earnedBadgeIds.has(badge.id));

  return (
    <div className="space-y-8">
      {/* Earned Badges */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
        <h2 className="text-2xl font-bold text-white mb-6">Earned Badges ({earnedBadges.length})</h2>
        
        <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-6">
          {earnedBadges.map((badge) => {
            const award = progress.badges_earned.find(b => b.badge_id === badge.id);
            return (
              <BadgeCard
                key={badge.id}
                badge={badge}
                award={award}
                isEarned={true}
                isAvailable={false}
                onClick={onBadgeSelect}
              />
            );
          })}
        </div>
      </div>

      {/* Available Badges */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
        <h2 className="text-2xl font-bold text-white mb-6">Available Badges ({availableBadges.length})</h2>
        
        <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-6">
          {availableBadges.map((badge) => (
            <BadgeCard
              key={badge.id}
              badge={badge}
              isEarned={false}
              isAvailable={true}
              onClick={onBadgeSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const BadgeCard: React.FC<BadgeCardProps> = ({ 
  badge, 
  award, 
  isEarned, 
  isAvailable, 
  onClick 
}) => {
  const getBadgeIcon = (category: BadgeCategory) => {
    const icons = {
      knowledge: BookOpen,
      practical: Target,
      security: Shield,
      leadership: Crown,
      sovereignty: Bitcoin,
      family: Users,
      community: Home
    };
    return icons[category] || Award;
  };

  const getLevelColor = (level: AchievementLevel) => {
    const colors = {
      initiate: 'from-gray-400 to-gray-600',
      apprentice: 'from-blue-400 to-blue-600',
      journeyman: 'from-green-400 to-green-600',
      craftsman: 'from-yellow-400 to-yellow-600',
      master: 'from-purple-400 to-purple-600',
      guardian: 'from-orange-400 to-orange-600',
      sage: 'from-red-400 to-red-600'
    };
    return colors[level] || 'from-gray-400 to-gray-600';
  };

  const IconComponent = getBadgeIcon(badge.category);
  const levelColor = getLevelColor(badge.level);

  return (
    <div
      onClick={() => onClick(badge)}
      className={`bg-white/10 rounded-xl p-6 border transition-all duration-300 cursor-pointer ${
        isEarned 
          ? 'border-yellow-400/50 hover:border-yellow-400' 
          : isAvailable 
            ? 'border-white/20 hover:border-white/40' 
            : 'border-gray-500/20 opacity-50'
      }`}
    >
      <div className="text-center">
        <div className={`w-16 h-16 bg-gradient-to-br ${levelColor} rounded-full flex items-center justify-center mx-auto mb-4 ${
          isEarned ? 'ring-4 ring-yellow-400/50' : ''
        }`}>
          <IconComponent className="h-8 w-8 text-white" />
        </div>
        
        <h3 className="text-white font-bold text-lg mb-2">{badge.name}</h3>
        <p className="text-purple-200 text-sm mb-3">{badge.description}</p>
        
        <div className="flex items-center justify-center space-x-2 mb-3">
          <span className={`px-2 py-1 text-xs rounded-full ${
            isEarned ? 'bg-yellow-400/20 text-yellow-400' : 'bg-white/20 text-white'
          }`}>
            {badge.category}
          </span>
          <span className="px-2 py-1 text-xs rounded-full bg-white/20 text-white">
            {badge.level}
          </span>
        </div>
        
        <div className="flex items-center justify-center space-x-2 text-xs text-purple-200">
          <span>{badge.subject.replace('-', ' ')}</span>
          {badge.privacy_level !== 'public' && (
            <div className="flex items-center space-x-1">
              {badge.privacy_level === 'private' ? (
                <Lock className="h-3 w-3" />
              ) : (
                <Users className="h-3 w-3" />
              )}
            </div>
          )}
        </div>
        
        {isEarned && award && (
          <div className="mt-3 pt-3 border-t border-white/20">
            <div className="flex items-center justify-center space-x-2">
              <Trophy className="h-4 w-4 text-yellow-400" />
              <span className="text-xs text-yellow-400">
                {new Date(award.awarded_at * 1000).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const AchievementsSection: React.FC<{
  dashboardData: StudentDashboardData;
  onAchievementSelect: (achievement: BadgeAward) => void;
}> = ({ dashboardData, onAchievementSelect }) => {
  const { progress } = dashboardData;

  return (
    <div className="space-y-8">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
        <h2 className="text-2xl font-bold text-white mb-6">Your Achievements</h2>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {progress.badges_earned.map((achievement) => (
            <AchievementCard
              key={achievement.id}
              achievement={achievement}
              badge={null} // Would need to look up badge definition
              onClick={onAchievementSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const AchievementCard: React.FC<AchievementCardProps> = ({ 
  achievement, 
  badge, 
  onClick 
}) => {
  return (
    <div
      onClick={() => onClick(achievement)}
      className="bg-white/10 rounded-xl p-6 border border-yellow-400/50 hover:border-yellow-400 transition-all duration-300 cursor-pointer"
    >
      <div className="flex items-center space-x-4">
        <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
          <Trophy className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-white font-bold">{achievement.badge_id}</h3>
          <p className="text-purple-200 text-sm">
            {new Date(achievement.awarded_at * 1000).toLocaleDateString()}
          </p>
          <div className="flex items-center space-x-2 mt-2">
            {achievement.privacy_encrypted && (
              <div className="flex items-center space-x-1">
                <Lock className="h-3 w-3 text-purple-300" />
                <span className="text-xs text-purple-300">Private</span>
              </div>
            )}
            <span className="text-xs text-green-400">Verified</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProgressSection: React.FC<{
  dashboardData: StudentDashboardData;
}> = ({ dashboardData }) => {
  const { progress } = dashboardData;

  return (
    <div className="space-y-8">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
        <h2 className="text-2xl font-bold text-white mb-6">Subject Progress</h2>
        
        <div className="space-y-6">
          {progress.subjects_progress.map((subjectProgress) => (
            <div
              key={subjectProgress.subject}
              className="bg-white/10 rounded-xl p-6 border border-white/20"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-white font-bold text-lg capitalize">
                    {subjectProgress.subject.replace('-', ' ')}
                  </h3>
                  <p className="text-purple-200 text-sm">
                    Level: {subjectProgress.level} | 
                    Proficiency: {subjectProgress.proficiency_score}%
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-yellow-400 font-bold">
                    {subjectProgress.badges_earned}/{subjectProgress.badges_available}
                  </div>
                  <div className="text-purple-200 text-sm">badges</div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-purple-200">Lessons</span>
                    <span className="text-white">
                      {subjectProgress.lessons_completed}/{subjectProgress.lessons_total}
                    </span>
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full transition-all duration-500"
                      style={{ 
                        width: `${(subjectProgress.lessons_completed / subjectProgress.lessons_total) * 100}%` 
                      }}
                    />
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-purple-200">Badges</span>
                    <span className="text-white">
                      {subjectProgress.badges_earned}/{subjectProgress.badges_available}
                    </span>
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-yellow-400 to-orange-500 h-2 rounded-full transition-all duration-500"
                      style={{ 
                        width: `${(subjectProgress.badges_earned / subjectProgress.badges_available) * 100}%` 
                      }}
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/20">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-4 w-4 text-green-400" />
                  <span className="text-sm text-green-400">
                    {subjectProgress.current_streak} day streak
                  </span>
                </div>
                <div className="text-sm text-purple-200">
                  Last activity: {
                    subjectProgress.last_activity > 0 
                      ? new Date(subjectProgress.last_activity * 1000).toLocaleDateString()
                      : 'Never'
                  }
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const BadgeDetailModal: React.FC<{
  badge: BadgeDefinition;
  onClose: () => void;
}> = ({ badge, onClose }) => {
  const getBadgeIcon = (category: BadgeCategory) => {
    const icons = {
      knowledge: BookOpen,
      practical: Target,
      security: Shield,
      leadership: Crown,
      sovereignty: Bitcoin,
      family: Users,
      community: Home
    };
    return icons[category] || Award;
  };

  const getLevelColor = (level: AchievementLevel) => {
    const colors = {
      initiate: 'from-gray-400 to-gray-600',
      apprentice: 'from-blue-400 to-blue-600',
      journeyman: 'from-green-400 to-green-600',
      craftsman: 'from-yellow-400 to-yellow-600',
      master: 'from-purple-400 to-purple-600',
      guardian: 'from-orange-400 to-orange-600',
      sage: 'from-red-400 to-red-600'
    };
    return colors[level] || 'from-gray-400 to-gray-600';
  };

  const IconComponent = getBadgeIcon(badge.category);
  const levelColor = getLevelColor(badge.level);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-purple-900 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-yellow-400/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Badge Details</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-yellow-400 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <div className="text-center mb-6">
          <div className={`w-24 h-24 bg-gradient-to-br ${levelColor} rounded-full flex items-center justify-center mx-auto mb-4`}>
            <IconComponent className="h-12 w-12 text-white" />
          </div>
          <h3 className="text-white font-bold text-2xl mb-2">{badge.name}</h3>
          <p className="text-purple-200 text-lg">{badge.description}</p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-purple-200 text-sm">Category</label>
              <div className="bg-white/10 rounded-lg p-3 mt-1">
                <span className="text-white font-medium capitalize">{badge.category}</span>
              </div>
            </div>
            
            <div>
              <label className="text-purple-200 text-sm">Subject</label>
              <div className="bg-white/10 rounded-lg p-3 mt-1">
                <span className="text-white font-medium capitalize">
                  {badge.subject.replace('-', ' ')}
                </span>
              </div>
            </div>
            
            <div>
              <label className="text-purple-200 text-sm">Level</label>
              <div className="bg-white/10 rounded-lg p-3 mt-1">
                <span className="text-white font-medium capitalize">{badge.level}</span>
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-purple-200 text-sm">Privacy Level</label>
              <div className="bg-white/10 rounded-lg p-3 mt-1">
                <div className="flex items-center space-x-2">
                  {badge.privacy_level === 'private' ? (
                    <Lock className="h-4 w-4 text-purple-300" />
                  ) : badge.privacy_level === 'family' ? (
                    <Users className="h-4 w-4 text-purple-300" />
                  ) : (
                    <Eye className="h-4 w-4 text-purple-300" />
                  )}
                  <span className="text-white font-medium capitalize">
                    {badge.privacy_level}
                  </span>
                </div>
              </div>
            </div>
            
            <div>
              <label className="text-purple-200 text-sm">Prerequisites</label>
              <div className="bg-white/10 rounded-lg p-3 mt-1">
                {badge.prerequisites.length > 0 ? (
                  <div className="space-y-1">
                    {badge.prerequisites.map((prereq, index) => (
                      <div key={index} className="text-white text-sm">
                        • {prereq}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-purple-200">None</span>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6">
          <label className="text-purple-200 text-sm">Earning Criteria</label>
          <div className="bg-white/10 rounded-lg p-4 mt-1">
            <div className="space-y-3">
              {badge.criteria.completion_requirements.lessons_completed && (
                <div className="flex items-center space-x-2">
                  <BookOpen className="h-4 w-4 text-blue-400" />
                  <span className="text-white">
                    Complete {badge.criteria.completion_requirements.lessons_completed} lessons
                  </span>
                </div>
              )}
              
              {badge.criteria.completion_requirements.quizzes_passed && (
                <div className="flex items-center space-x-2">
                  <Target className="h-4 w-4 text-green-400" />
                  <span className="text-white">
                    Pass {badge.criteria.completion_requirements.quizzes_passed} quizzes
                  </span>
                </div>
              )}
              
              {badge.criteria.completion_requirements.minimum_score && (
                <div className="flex items-center space-x-2">
                  <Star className="h-4 w-4 text-yellow-400" />
                  <span className="text-white">
                    Achieve {badge.criteria.completion_requirements.minimum_score}% minimum score
                  </span>
                </div>
              )}
              
              {badge.criteria.time_requirements?.minimum_study_hours && (
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-purple-400" />
                  <span className="text-white">
                    Study for {badge.criteria.time_requirements.minimum_study_hours} hours
                  </span>
                </div>
              )}
              
              {badge.criteria.verification_requirements?.guardian_approval_required && (
                <div className="flex items-center space-x-2">
                  <Shield className="h-4 w-4 text-orange-400" />
                  <span className="text-white">Guardian approval required</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AchievementDetailModal: React.FC<{
  achievement: BadgeAward;
  onClose: () => void;
}> = ({ achievement, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-purple-900 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-yellow-400/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Achievement Details</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-yellow-400 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <div className="text-center mb-6">
          <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trophy className="h-12 w-12 text-white" />
          </div>
          <h3 className="text-white font-bold text-2xl mb-2">{achievement.badge_id}</h3>
          <p className="text-purple-200">
            Earned on {new Date(achievement.awarded_at * 1000).toLocaleDateString()}
          </p>
        </div>
        
        <div className="space-y-6">
          <div>
            <label className="text-purple-200 text-sm">Status</label>
            <div className="bg-white/10 rounded-lg p-3 mt-1">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full" />
                <span className="text-white font-medium capitalize">
                  {achievement.verification_status}
                </span>
              </div>
            </div>
          </div>
          
          <div>
            <label className="text-purple-200 text-sm">Privacy</label>
            <div className="bg-white/10 rounded-lg p-3 mt-1">
              <div className="flex items-center space-x-2">
                {achievement.privacy_encrypted ? (
                  <Lock className="h-4 w-4 text-purple-300" />
                ) : (
                  <Eye className="h-4 w-4 text-purple-300" />
                )}
                <span className="text-white font-medium">
                  {achievement.privacy_encrypted ? 'Private' : 'Public'}
                </span>
              </div>
            </div>
          </div>
          
          <div>
            <label className="text-purple-200 text-sm">Evidence Summary</label>
            <div className="bg-white/10 rounded-lg p-4 mt-1">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-purple-200">Lessons Completed</span>
                  <span className="text-white">{achievement.evidence.lessons_completed.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-purple-200">Quizzes Passed</span>
                  <span className="text-white">{achievement.evidence.quiz_scores.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-purple-200">Practical Work</span>
                  <span className="text-white">{achievement.evidence.practical_work.length}</span>
                </div>
                {achievement.evidence.guardian_approvals.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-purple-200">Guardian Approvals</span>
                    <span className="text-white">{achievement.evidence.guardian_approvals.length}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BadgeSystem;