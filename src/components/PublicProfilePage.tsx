/**
 * Public Profile Page Component
 * Phase 3: Public Profile URL System - UI Integration
 * Sub-Phase 3B: Profile Sharing UI
 *
 * Public-facing profile page that displays user profile based on visibility settings.
 * Respects privacy-first principles and verification levels.
 */

import {
  AlertCircle,
  CheckCircle,
  Globe,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  User,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import ProfileAPI from '../lib/api/profile-endpoints';
import { PublicProfile, VerificationMethods } from '../types/profile';

interface PublicProfilePageProps {
  username?: string;
  npub?: string;
  onBack?: () => void;
}

export const PublicProfilePage: React.FC<PublicProfilePageProps> = ({
  username,
  npub,
  onBack,
}) => {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, [username, npub]);

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);

    try {
      // Determine which identifier to use
      const identifier = username || npub;
      if (!identifier) {
        setError('No profile identifier provided');
        setLoading(false);
        return;
      }

      // Fetch profile data
      const response = await ProfileAPI.getPublicProfile(identifier);

      if (response.success && response.data) {
        setProfile(response.data);

        // Track profile view (fire-and-forget)
        ProfileAPI.trackProfileView(identifier).catch((err) => {
          console.warn('Failed to track profile view:', err);
        });
      } else {
        setError(response.error || 'Failed to load profile');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const getVerificationBadge = (verificationMethods?: VerificationMethods) => {
    if (!verificationMethods) return null;

    const { physical_mfa_verified, simpleproof_verified, kind0_verified } = verificationMethods;

    // Derive verification level (matches backend logic)
    let level: 'trusted' | 'verified' | 'basic' | 'unverified' = 'unverified';

    if (physical_mfa_verified && (simpleproof_verified || kind0_verified)) {
      level = 'trusted';
    } else if (physical_mfa_verified || (simpleproof_verified && kind0_verified)) {
      level = 'verified';
    } else if (physical_mfa_verified || simpleproof_verified || kind0_verified) {
      level = 'basic';
    }

    const badges = {
      trusted: {
        icon: <ShieldCheck size={20} className="text-yellow-400" />,
        label: 'Trusted',
        color: 'bg-yellow-900/30 border-yellow-500/50 text-yellow-300',
      },
      verified: {
        icon: <CheckCircle size={20} className="text-green-400" />,
        label: 'Verified',
        color: 'bg-green-900/30 border-green-500/50 text-green-300',
      },
      basic: {
        icon: <Shield size={20} className="text-blue-400" />,
        label: 'Basic Verification',
        color: 'bg-blue-900/30 border-blue-500/50 text-blue-300',
      },
      unverified: null,
    };

    const badge = badges[level];
    if (!badge) return null;

    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${badge.color} text-sm font-medium`}>
        {badge.icon}
        <span>{badge.label}</span>
      </div>
    );
  };

  // Loading State
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
          {/* Banner Skeleton */}
          <Skeleton height={200} baseColor="#1f2937" highlightColor="#374151" />

          {/* Profile Info Skeleton */}
          <div className="p-6">
            <div className="flex items-start gap-4 mb-6">
              <Skeleton circle width={100} height={100} baseColor="#1f2937" highlightColor="#374151" />
              <div className="flex-1">
                <Skeleton width={200} height={30} baseColor="#1f2937" highlightColor="#374151" className="mb-2" />
                <Skeleton width={150} height={20} baseColor="#1f2937" highlightColor="#374151" />
              </div>
            </div>
            <Skeleton count={3} baseColor="#1f2937" highlightColor="#374151" />
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    const isAccessDenied = error.toLowerCase().includes('access denied') ||
      error.toLowerCase().includes('not found') ||
      error.toLowerCase().includes('private');

    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-gray-900 border border-red-500/30 rounded-2xl p-8 text-center">
          {isAccessDenied ? (
            <>
              <Lock size={64} className="text-red-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
              <p className="text-gray-400 mb-4">
                This profile is private or you don't have permission to view it.
              </p>
            </>
          ) : (
            <>
              <AlertCircle size={64} className="text-red-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Error Loading Profile</h2>
              <p className="text-gray-400 mb-4">{error}</p>
            </>
          )}
          <button
            onClick={() => window.history.back()}
            className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // No Profile State
  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center">
          <User size={64} className="text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Profile Not Found</h2>
          <p className="text-gray-400">The requested profile does not exist.</p>
        </div>
      </div>
    );
  }

  // Profile Display
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
        {/* Profile Banner */}
        {profile.profile_banner_url && (
          <div
            className="h-48 bg-cover bg-center"
            style={{ backgroundImage: `url(${profile.profile_banner_url})` }}
          />
        )}
        {!profile.profile_banner_url && (
          <div className="h-48 bg-gradient-to-r from-purple-900 to-blue-900" />
        )}

        {/* Profile Content */}
        <div className="p-6">
          {/* Profile Header */}
          <div className="flex items-start gap-4 mb-6 -mt-16">
            {/* Profile Picture */}
            <div className="relative">
              {profile.picture ? (
                <img
                  src={profile.picture}
                  alt={profile.display_name || profile.username}
                  className="w-24 h-24 rounded-full border-4 border-gray-900 bg-gray-800"
                />
              ) : (
                <div className="w-24 h-24 rounded-full border-4 border-gray-900 bg-gray-800 flex items-center justify-center">
                  <User size={40} className="text-gray-400" />
                </div>
              )}
            </div>

            {/* Profile Info */}
            <div className="flex-1 mt-16">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-white">
                  {profile.display_name || profile.username}
                </h1>
                {getVerificationBadge(profile.verification_methods)}
              </div>
              <p className="text-gray-400 mb-1">@{profile.username}</p>
              {profile.nip05 && (
                <div className="flex items-center gap-2 text-sm text-purple-400">
                  <Mail size={16} />
                  <span>{profile.nip05}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bio */}
          {profile.bio && (
            <div className="mb-6">
              <p className="text-gray-300 whitespace-pre-wrap">{profile.bio}</p>
            </div>
          )}

          {/* Profile Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Website */}
            {profile.website && (
              <div className="flex items-center gap-2 text-gray-300">
                <Globe size={18} className="text-purple-400" />
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-purple-400 transition-colors"
                >
                  {profile.website}
                </a>
              </div>
            )}

            {/* Lightning Address */}
            {profile.lightning_address && (
              <div className="flex items-center gap-2 text-gray-300">
                <Zap size={18} className="text-yellow-400" />
                <span className="font-mono text-sm">{profile.lightning_address}</span>
              </div>
            )}
          </div>

          {/* Social Links */}
          {profile.social_links && Object.keys(profile.social_links).length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">Social Links</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(profile.social_links).map(([platform, url]) => (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
                  >
                    {platform}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Profile Stats */}
          {profile.analytics_enabled && (
            <div className="border-t border-gray-700 pt-4">
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-gray-400">Profile Views:</span>{' '}
                  <span className="text-white font-semibold">{profile.profile_views_count || 0}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PublicProfilePage;

