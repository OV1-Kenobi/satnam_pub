/**
 * Federation Memberships Component
 * Displays user's current federation memberships with roles
 */

import { useState, useEffect } from 'react';
import { Users, Shield, Crown, User, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { SecureTokenManager } from '../../lib/auth/secure-token-manager';

interface Federation {
  id: string;
  federation_duid: string;
  federation_name: string;
  role: 'guardian' | 'steward' | 'adult' | 'offspring';
  joined_at: string;
  is_active: boolean;
  charter_status?: 'draft' | 'active' | 'amended';
}

const ROLE_ICONS = {
  guardian: Crown,
  steward: Shield,
  adult: User,
  offspring: Users
};

const ROLE_COLORS = {
  guardian: 'bg-purple-100 text-purple-800',
  steward: 'bg-blue-100 text-blue-800',
  adult: 'bg-green-100 text-green-800',
  offspring: 'bg-orange-100 text-orange-800'
};

export function FederationMemberships() {
  const [federations, setFederations] = useState<Federation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFederations = async () => {
      try {
        const token = SecureTokenManager.getAccessToken();
        if (!token) {
          setError('Authentication required');
          setLoading(false);
          return;
        }

        const response = await fetch('/api/family/my-federations', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch federations');
        }

        const data = await response.json();
        setFederations(data.federations || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load federations');
      } finally {
        setLoading(false);
      }
    };

    fetchFederations();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
        <span className="ml-2 text-gray-600">Loading federations...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
        <AlertCircle className="h-5 w-5 text-red-500" />
        <span className="text-red-700">{error}</span>
      </div>
    );
  }

  if (federations.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Users className="h-12 w-12 mx-auto mb-3 text-gray-400" />
        <p>You haven't joined any family federations yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <Users className="h-5 w-5" />
        My Federations ({federations.length})
      </h3>
      
      <div className="grid gap-4">
        {federations.map((fed) => {
          const RoleIcon = ROLE_ICONS[fed.role];
          return (
            <div key={fed.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <RoleIcon className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{fed.federation_name}</h4>
                    <p className="text-sm text-gray-500">
                      Joined {new Date(fed.joined_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${ROLE_COLORS[fed.role]}`}>
                    {fed.role}
                  </span>
                  {fed.is_active && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">Active</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FederationMemberships;

