/**
 * FeatureGate Component
 * Progressive feature disclosure based on trust scores
 * Shows locked features with requirements or renders children if available
 */

import { createClient } from '@supabase/supabase-js';
import React, { useEffect, useState } from 'react';
import { FeatureGateService, FeatureRequirements } from '../lib/trust/feature-gates';

interface FeatureGateProps {
  featureName: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  currentUserId: string;
}

export function FeatureGate({
  featureName,
  children,
  fallback,
  currentUserId
}: FeatureGateProps) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [requirements, setRequirements] = useState<FeatureRequirements | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        setLoading(true);

        // Initialize Supabase client
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey) as ReturnType<typeof createClient>;

        const featureGateService = new FeatureGateService(supabase);

        const available = await featureGateService.isFeatureAvailable(
          currentUserId,
          featureName
        );
        setIsAvailable(available);

        if (!available) {
          const locked = await featureGateService.getLockedFeatures(currentUserId);
          const feature = locked.find(f => f.featureName === featureName);
          setRequirements(feature?.requirements || null);
        }
      } catch (error) {
        console.error('Error checking feature access:', error);
        setIsAvailable(false);
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
    // FIX: Added currentUserId to dependency array to refetch when user changes
  }, [featureName, currentUserId]);

  if (loading) {
    return (
      <div className="p-4 border border-gray-300 rounded bg-gray-50">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (isAvailable) return <>{children}</>;

  return fallback || (
    <div className="p-4 border border-yellow-300 rounded bg-yellow-50">
      <h3 className="font-bold text-yellow-900">Feature Locked</h3>
      <p className="text-yellow-800 mt-2">You need to reach the following milestones:</p>
      <ul className="mt-2 space-y-1 text-yellow-800">
        {requirements && (
          <>
            <li className="flex justify-between">
              <span>Trust Score:</span>
              <span>{requirements.trustScore.current}/{requirements.trustScore.required}</span>
            </li>
            <li className="flex justify-between">
              <span>PoP Score:</span>
              <span>{requirements.popScore.current}/{requirements.popScore.required}</span>
            </li>
            <li className="flex justify-between">
              <span>UP Score:</span>
              <span>{requirements.upScore.current}/{requirements.upScore.required}</span>
            </li>
          </>
        )}
      </ul>
      <p className="text-sm text-yellow-700 mt-3">
        Complete actions to increase your scores and unlock this feature.
      </p>
    </div>
  );
}

