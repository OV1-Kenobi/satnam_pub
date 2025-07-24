/**
 * Citadel Academy Badge System Component
 * NIP-58 badges with WoT mentor notarization and cognitive capital tracking
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import {
  Award,
  BookOpen,
  CheckCircle,
  Clock,
  Crown,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  Shield,
  Star,
  Trophy,
  Users,
  Zap,
  Target,
  TrendingUp,
  Bookmark,
  Calendar,
  ChevronRight,
  Filter,
  Search,
  SortAsc,
  SortDesc,
  Unlock,
  Verified,
  AlertTriangle,
  Info
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  BadgeDefinition,
  BadgeAward,
  StudentDashboardData,
  AchievementLevel,
  BadgeCategory,
  EducationSubject,
  PrivacyLevel,
  VerificationLevel,
  badgeSystem,
  BadgeAwardRequest
} from '../../lib/citadel/badge-system.js';

interface BadgeSystemProps {
  studentPubkey: string;
  familyId?: string;
  isAdmin?: boolean;
  onBadgeAwarded?: (badge: BadgeAward) => void;
}

interface BadgeCardProps {
  badge: BadgeDefinition;
  isEarned: boolean;
  isAvailable: boolean;
  onAward: (badgeId: string) => void;
  isAwarding?: boolean;
}

interface BadgeAwardCardProps {
  award: BadgeAward;
  onClick: (award: BadgeAward) => void;
}

interface AchievementProgressProps {
  level: AchievementLevel;
  progress: number;
  total: number;
}

// Helper functions for badge system
const getAchievementLevelColor = (level: AchievementLevel) => {
  const colors = {
    initiate: 'from-gray-400 to-gray-600',
    apprentice: 'from-blue-400 to-blue-600',
    journeyman: 'from-green-400 to-green-600',
    craftsman: 'from-purple-400 to-purple-600',
    master: 'from-orange-400 to-orange-600',
    guardian: 'from-red-400 to-red-600',
    sage: 'from-yellow-400 to-yellow-600'
  };
  return colors[level] || 'from-gray-400 to-gray-600';
};

const getBadgeCategoryColor = (category: BadgeCategory) => {
  const colors = {
    knowledge: 'from-blue-400 to-blue-600',
    practical: 'from-green-400 to-green-600',
    security: 'from-red-400 to-red-600',
    leadership: 'from-purple-400 to-purple-600',
    sovereignty: 'from-yellow-400 to-yellow-600',
    family: 'from-pink-400 to-pink-600',
    community: 'from-indigo-400 to-indigo-600'
  };
  return colors[category] || 'from-gray-400 to-gray-600';
};

const getBadgeCategoryIcon = (category: BadgeCategory) => {
  const icons = {
    knowledge: BookOpen,
    practical: Target,
    security: Shield,
    leadership: Crown,
    sovereignty: Unlock,
    family: Users,
    community: Star
  };
  return icons[category] || Award;
};

const getEducationSubjectIcon = (subject: EducationSubject) => {
  const icons = {
    'bitcoin-fundamentals': Zap,
    'lightning-network': Zap,
    'privacy-sovereignty': Shield,
    'self-custody': Lock,
    'family-treasury': Users,
    'nostr-identity': Bookmark,
    'security-ops': Shield,
    'citadel-building': Crown
  };
  return icons[subject] || BookOpen;
};

const getPrivacyLevelIcon = (level: PrivacyLevel) => {
  return level === 'private' ? EyeOff : level === 'family' ? Users : Eye;
};

const getVerificationLevelColor = (level: VerificationLevel) => {
  const colors = {
    basic: 'text-green-400',
    intermediate: 'text-yellow-400',
    advanced: 'text-red-400'
  };
  return colors[level] || 'text-gray-400';
};

// Helper function to get level weight for sorting
function getLevelWeight(level: AchievementLevel): number {
  const weights = {
    initiate: 1,
    apprentice: 2,
    journeyman: 3,
    craftsman: 4,
    master: 5,
    guardian: 6,
    sage: 7
  };
  return weights[level] || 0;
}

const BadgeSystem: React.FC<BadgeSystemProps> = ({ 
  studentPubkey, 
  familyId, 
  isAdmin = false,
  onBadgeAwarded
}) => {
  const [dashboardData, setDashboardData] = useState<StudentDashboardData | null>(null);
  const [currentView, setCurrentView] = useState<'badges' | 'achievements' | 'mentors' | 'progress'>('badges');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [awardingBadge, setAwardingBadge] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<BadgeCategory | 'all'>('all');
  const [filterSubject, setFilterSubject] = useState<EducationSubject | 'all'>('all');
  const [filterLevel, setFilterLevel] = useState<AchievementLevel | 'all'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'level' | 'category' | 'subject'>('level');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    loadDashboardData();
  }, [studentPubkey, familyId]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const data = await badgeSystem.getStudentDashboard(studentPubkey, familyId);
      setDashboardData(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleAwardBadge = async (badgeId: string) => {
    try {
      setAwardingBadge(badgeId);
      
      // Create award request
      const request: BadgeAwardRequest = {
        badgeId,
        recipientPubkey: studentPubkey,
        evidence: {
          lessons_completed: ['lesson_1', 'lesson_2'], // Would come from actual progress
          quiz_scores: [
            { quiz_id: 'quiz_1', score: 85, max_score: 100 }
          ],
          practical_work: ['exercise_1']
        },
        privacyLevel: 'family'
      };

      const award = await badgeSystem.awardBadge(request);
      
      if (award) {
        // Refresh data
        await loadDashboardData();
        
        // Notify parent component
        if (onBadgeAwarded) {
          onBadgeAwarded(award);
        }
        
        alert('Badge awarded successfully!');
      } else {
        throw new Error('Failed to award badge');
      }
    } catch (error) {
      alert(`Failed to award badge: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setAwardingBadge(null);
    }
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
        <div className="bg-gray-500/10 backdrop-blur-sm rounded-2xl p-8 border border-gray-500/20">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Award className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">No Badge Data Found</h3>
            <p className="text-purple-200">Start your educational journey to earn badges</p>
          </div>
        </div>
      </div>
    );
  }

  const { progress, available_badges, achievements_summary } = dashboardData;
  const earnedBadgeIds = progress.badges_earned.map(b => b.badge_id);

  // Filter and sort badges
  let filteredBadges = available_badges.filter(badge => {
    if (filterCategory !== 'all' && badge.category !== filterCategory) return false;
    if (filterSubject !== 'all' && badge.subject !== filterSubject) return false;
    if (filterLevel !== 'all' && badge.level !== filterLevel) return false;
    return true;
  });

  // Sort badges
  filteredBadges.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'level':
        comparison = getLevelWeight(a.level) - getLevelWeight(b.level);
        break;
      case 'category':
        comparison = a.category.localeCompare(b.category);
        break;
      case 'subject':
        comparison = a.subject.localeCompare(b.subject);
        break;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-purple-900 rounded-2xl p-6 mb-8 border border-yellow-400/20">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Cognitive Capital Badges</h1>
              <p className="text-purple-200">Track your educational achievements with NIP-58 badges</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="bg-white/10 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <Award className="h-5 w-5 text-yellow-400" />
                  <span className="text-white font-medium">{achievements_summary.total_badges}</span>
                  <span className="text-purple-200 text-sm">earned</span>
                </div>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <Trophy className="h-5 w-5 text-green-400" />
                  <span className="text-white font-medium">{available_badges.length}</span>
                  <span className="text-purple-200 text-sm">available</span>
                </div>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <Verified className="h-5 w-5 text-blue-400" />
                  <span className="text-white font-medium">{achievements_summary.wot_verified_badges}</span>
                  <span className="text-purple-200 text-sm">verified</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-8 border border-white/20">
          <div className="flex space-x-1">
            {[
              { key: 'badges', label: 'Badges', icon: Award, count: available_badges.length },
              { key: 'achievements', label: 'Achievements', icon: Trophy, count: achievements_summary.total_badges },
              { key: 'mentors', label: 'Mentors', icon: Users, count: achievements_summary.mentor_relationships.length },
              { key: 'progress', label: 'Progress', icon: TrendingUp, count: 0 }
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

        {/* Filters and Sort */}
        {currentView === 'badges' && (
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-8 border border-white/20">
            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <label className="text-purple-200 text-sm font-medium">Category</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value as BadgeCategory | 'all')}
                  className="w-full mt-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-yellow-400"
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
              
              <div>
                <label className="text-purple-200 text-sm font-medium">Subject</label>
                <select
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value as EducationSubject | 'all')}
                  className="w-full mt-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-yellow-400"
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
              
              <div>
                <label className="text-purple-200 text-sm font-medium">Level</label>
                <select
                  value={filterLevel}
                  onChange={(e) => setFilterLevel(e.target.value as AchievementLevel | 'all')}
                  className="w-full mt-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-yellow-400"
                >
                  <option value="all">All Levels</option>
                  <option value="initiate">Initiate</option>
                  <option value="apprentice">Apprentice</option>
                  <option value="journeyman">Journeyman</option>
                  <option value="craftsman">Craftsman</option>
                  <option value="master">Master</option>
                  <option value="guardian">Guardian</option>
                  <option value="sage">Sage</option>
                </select>
              </div>
              
              <div>
                <label className="text-purple-200 text-sm font-medium">Sort By</label>
                <div className="flex mt-1">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-l-lg text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value="level">Level</option>
                    <option value="name">Name</option>
                    <option value="category">Category</option>
                    <option value="subject">Subject</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="px-3 py-2 bg-white/10 border border-l-0 border-white/20 rounded-r-lg text-white hover:bg-white/20 transition-colors"
                  >
                    {sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content based on current view */}
        {currentView === 'badges' && (
          <BadgesSection 
            badges={filteredBadges}
            earnedBadgeIds={earnedBadgeIds}
            onAward={handleAwardBadge}
            awardingBadge={awardingBadge}
          />
        )}
        
        {currentView === 'achievements' && (
          <AchievementsSection 
            achievements={progress.badges_earned}
            summary={achievements_summary}
          />
        )}
        
        {currentView === 'mentors' && (
          <MentorsSection 
            mentorRelationships={achievements_summary.mentor_relationships}
            mentorInteractions={dashboardData.mentor_interactions}
          />
        )}
        
        {currentView === 'progress' && (
          <ProgressSection 
            progress={progress}
            summary={achievements_summary}
          />
        )}
      </div>
    </div>
  );
};

const BadgesSection: React.FC<{
  badges: BadgeDefinition[];
  earnedBadgeIds: string[];
  onAward: (badgeId: string) => void;
  awardingBadge: string | null;
}> = ({ badges, earnedBadgeIds, onAward, awardingBadge }) => {
  if (badges.length === 0) {
    return (
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 text-center">
        <div className="w-16 h-16 bg-gray-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Award className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-white font-bold text-lg mb-2">No Badges Available</h3>
        <p className="text-purple-200">Complete more educational requirements to unlock badges</p>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
      <h2 className="text-2xl font-bold text-white mb-6">Available Badges</h2>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {badges.map((badge) => (
          <BadgeCard
            key={badge.id}
            badge={badge}
            isEarned={earnedBadgeIds.includes(badge.badge_id)}
            isAvailable={true}
            onAward={onAward}
            isAwarding={awardingBadge === badge.badge_id}
          />
        ))}
      </div>
    </div>
  );
};

const BadgeCard: React.FC<BadgeCardProps> = ({ 
  badge, 
  isEarned, 
  isAvailable, 
  onAward, 
  isAwarding = false 
}) => {
  const CategoryIcon = getBadgeCategoryIcon(badge.category);
  const SubjectIcon = getEducationSubjectIcon(badge.subject);
  const PrivacyIcon = getPrivacyLevelIcon(badge.privacy_level);
  const categoryColor = getBadgeCategoryColor(badge.category);
  const levelColor = getAchievementLevelColor(badge.level);

  return (
    <div className={`bg-white/10 rounded-xl p-6 border transition-all duration-300 ${
      isEarned 
        ? 'border-green-500/50 bg-green-500/10' 
        : 'border-white/20 hover:border-yellow-400/50'
    }`}>
      <div className="text-center">
        <div className="flex items-center justify-center space-x-2 mb-4">
          <div className={`w-12 h-12 bg-gradient-to-br ${categoryColor} rounded-full flex items-center justify-center`}>
            <CategoryIcon className="h-6 w-6 text-white" />
          </div>
          {isEarned && (
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-white" />
            </div>
          )}
        </div>
        
        <h3 className="text-white font-bold text-lg mb-2">{badge.name}</h3>
        <p className="text-purple-200 text-sm mb-4">{badge.description}</p>
        
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-center space-x-2">
            <div className={`px-2 py-1 bg-gradient-to-r ${levelColor} rounded-full text-white text-xs font-medium`}>
              {badge.level}
            </div>
            <div className="flex items-center space-x-1 text-xs">
              <SubjectIcon className="h-3 w-3 text-purple-300" />
              <span className="text-purple-200">{badge.subject.replace('-', ' ')}</span>
            </div>
          </div>
          
          <div className="flex items-center justify-center space-x-2 text-xs">
            <div className="flex items-center space-x-1">
              <PrivacyIcon className="h-3 w-3 text-purple-300" />
              <span className="text-purple-200">{badge.privacy_level}</span>
            </div>
            {badge.wot_required && (
              <div className="flex items-center space-x-1">
                <Verified className="h-3 w-3 text-blue-400" />
                <span className="text-blue-400">WoT</span>
              </div>
            )}
          </div>
        </div>
        
        {!isEarned && isAvailable && (
          <button
            onClick={() => onAward(badge.badge_id)}
            disabled={isAwarding}
            className={`w-full py-3 px-4 rounded-lg font-bold transition-all duration-300 ${
              isAwarding 
                ? 'bg-gray-500 text-gray-300 cursor-not-allowed' 
                : 'bg-yellow-400 hover:bg-yellow-500 text-purple-900 hover:scale-105'
            }`}
          >
            {isAwarding ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-900"></div>
                <span>Awarding...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-2">
                <Award className="h-4 w-4" />
                <span>Award Badge</span>
              </div>
            )}
          </button>
        )}

        {isEarned && (
          <div className="w-full py-3 px-4 rounded-lg bg-green-500/20 border border-green-500/50">
            <div className="flex items-center justify-center space-x-2 text-green-400">
              <CheckCircle className="h-4 w-4" />
              <span>Badge Earned</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const AchievementsSection: React.FC<{
  achievements: BadgeAward[];
  summary: any;
}> = ({ achievements, summary }) => {
  if (achievements.length === 0) {
    return (
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 text-center">
        <div className="w-16 h-16 bg-gray-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trophy className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-white font-bold text-lg mb-2">No Achievements Yet</h3>
        <p className="text-purple-200">Start earning badges to see your achievements here</p>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
      <h2 className="text-2xl font-bold text-white mb-6">Your Achievements</h2>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {achievements.map((award) => (
          <BadgeAwardCard
            key={award.id}
            award={award}
            onClick={() => console.log('Badge award clicked:', award)}
          />
        ))}
      </div>
    </div>
  );
};

const BadgeAwardCard: React.FC<BadgeAwardCardProps> = ({ award, onClick }) => {
  return (
    <div
      onClick={() => onClick(award)}
      className="bg-white/10 rounded-xl p-6 border border-white/20 hover:border-yellow-400/50 transition-all duration-300 cursor-pointer"
    >
      <div className="text-center">
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Award className="h-8 w-8 text-green-400" />
        </div>
        
        <h3 className="text-white font-bold text-lg mb-2">Badge Awarded</h3>
        <p className="text-purple-200 text-sm mb-4">ID: {award.badge_id}</p>
        
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-center space-x-2">
            <Calendar className="h-4 w-4 text-purple-300" />
            <span className="text-white text-sm">
              {new Date(award.awarded_at * 1000).toLocaleDateString()}
            </span>
          </div>
          
          <div className="flex items-center justify-center space-x-2">
            <div className={`px-2 py-1 rounded-full text-xs font-medium ${
              award.verification_status === 'verified' 
                ? 'bg-green-500/20 text-green-400' 
                : award.verification_status === 'pending'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              {award.verification_status}
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-center space-x-2">
          <ChevronRight className="h-4 w-4 text-purple-300" />
          <span className="text-purple-200 text-sm">View Details</span>
        </div>
      </div>
    </div>
  );
};

const MentorsSection: React.FC<{
  mentorRelationships: any[];
  mentorInteractions: any[];
}> = ({ mentorRelationships, mentorInteractions }) => {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
      <h2 className="text-2xl font-bold text-white mb-6">Mentor Relationships</h2>
      
      {mentorRelationships.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-gray-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-white font-bold text-lg mb-2">No Mentor Relationships</h3>
          <p className="text-purple-200">Connect with mentors to enhance your learning journey</p>
        </div>
      ) : (
        <div className="space-y-4">
          {mentorRelationships.map((relationship, index) => (
            <div key={index} className="bg-white/10 rounded-xl p-4 border border-white/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-bold">{relationship.mentor_nip05}</h3>
                  <p className="text-purple-200 text-sm">
                    {relationship.verifications_count} verifications
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-yellow-400 text-sm">
                    {relationship.competency_areas.join(', ')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ProgressSection: React.FC<{
  progress: any;
  summary: any;
}> = ({ progress, summary }) => {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
      <h2 className="text-2xl font-bold text-white mb-6">Learning Progress</h2>
      
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="bg-white/10 rounded-xl p-4 border border-white/20">
            <h3 className="text-white font-bold mb-2">Current Level</h3>
            <div className="text-2xl font-bold text-yellow-400 capitalize">
              {progress.current_level}
            </div>
          </div>
          
          <div className="bg-white/10 rounded-xl p-4 border border-white/20">
            <h3 className="text-white font-bold mb-2">Study Streak</h3>
            <div className="text-2xl font-bold text-green-400">
              {progress.learning_streak_days} days
            </div>
          </div>
          
          <div className="bg-white/10 rounded-xl p-4 border border-white/20">
            <h3 className="text-white font-bold mb-2">Total Study Hours</h3>
            <div className="text-2xl font-bold text-blue-400">
              {progress.total_study_hours}
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="bg-white/10 rounded-xl p-4 border border-white/20">
            <h3 className="text-white font-bold mb-2">Badges Earned</h3>
            <div className="text-2xl font-bold text-purple-400">
              {progress.badges_earned_count}
            </div>
          </div>
          
          <div className="bg-white/10 rounded-xl p-4 border border-white/20">
            <h3 className="text-white font-bold mb-2">WoT Verified</h3>
            <div className="text-2xl font-bold text-blue-400">
              {summary.wot_verified_badges}
            </div>
          </div>
          
          <div className="bg-white/10 rounded-xl p-4 border border-white/20">
            <h3 className="text-white font-bold mb-2">Institutional Cosigned</h3>
            <div className="text-2xl font-bold text-red-400">
              {summary.institutional_cosigned_badges}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BadgeSystem;