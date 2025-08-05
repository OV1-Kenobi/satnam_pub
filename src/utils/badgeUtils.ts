/**
 * Badge System Utility Functions
 * Shared utilities for badge rendering, colors, and icons
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import {
  Award,
  BookOpen,
  Crown,
  Eye,
  EyeOff,
  Lock,
  Shield,
  Star,
  Target,
  Unlock,
  Users,
  Zap,
  Bookmark
} from 'lucide-react';
import type { 
  AchievementLevel, 
  BadgeCategory, 
  EducationSubject, 
  PrivacyLevel, 
  VerificationLevel 
} from '../lib/citadel/badge-system.js';

/**
 * Get gradient color classes for achievement levels
 */
export const getAchievementLevelColor = (level: AchievementLevel): string => {
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

/**
 * Get gradient color classes for badge categories
 */
export const getBadgeCategoryColor = (category: BadgeCategory): string => {
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

/**
 * Get icon component for badge categories
 */
export const getBadgeCategoryIcon = (category: BadgeCategory) => {
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

/**
 * Get icon component for education subjects
 */
export const getEducationSubjectIcon = (subject: EducationSubject) => {
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

/**
 * Get icon component for privacy levels
 */
export const getPrivacyLevelIcon = (level: PrivacyLevel) => {
  return level === 'private' ? EyeOff : level === 'family' ? Users : Eye;
};

/**
 * Get text color classes for verification levels
 */
export const getVerificationLevelColor = (level: VerificationLevel): string => {
  const colors = {
    basic: 'text-green-400',
    intermediate: 'text-yellow-400',
    advanced: 'text-red-400'
  };
  return colors[level] || 'text-gray-400';
};

/**
 * Get numeric weight for achievement levels (for sorting)
 */
export const getLevelWeight = (level: AchievementLevel): number => {
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
};

/**
 * Legacy alias for getAchievementLevelColor (for backward compatibility)
 */
export const getLevelColor = getAchievementLevelColor;

/**
 * Legacy alias for getBadgeCategoryIcon (for backward compatibility)
 */
export const getBadgeIcon = getBadgeCategoryIcon;
