/**
 * Credential Cleanup Monitor
 * 
 * Admin component for monitoring credential cleanup status
 * Shows cleanup statistics and manual trigger options
 */

import React, { useEffect, useState } from 'react';

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import('../../lib/supabase');
    supabaseClient = supabase;
  }
  return supabaseClient;
};

interface CleanupStats {
  totalCredentials: number;
  activeCredentials: number;
  expiredCredentials: number;
  revokedCredentials: number;
  lastCleanup?: string;
}

export const CredentialCleanupMonitor: React.FC = () => {
  const [stats, setStats] = useState<CleanupStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastManualCleanup, setLastManualCleanup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch cleanup statistics
  const fetchStats = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get credential statistics using lazy client
      const client = await getSupabaseClient();
      const { data: credentials, error: credentialsError } = await client
        .from('nostr_credential_status')
        .select('*');

      if (credentialsError) {
        throw new Error(`Failed to fetch credentials: ${credentialsError.message}`);
      }

      const now = new Date();
      const stats: CleanupStats = {
        totalCredentials: credentials?.length || 0,
        activeCredentials: credentials?.filter((c: any) => c.status === 'active').length || 0,
        expiredCredentials: credentials?.filter((c: any) => c.status === 'expired').length || 0,
        revokedCredentials: credentials?.filter((c: any) => c.status === 'revoked').length || 0,
      };

      setStats(stats);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch statistics');
      console.error('Failed to fetch cleanup stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Manual cleanup trigger
  const triggerManualCleanup = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const client = await getSupabaseClient();
      const { data, error } = await client.rpc('cleanup_expired_nostr_credentials');

      if (error) {
        throw new Error(`Cleanup failed: ${error.message}`);
      }

      setLastManualCleanup(new Date().toISOString());
      await fetchStats(); // Refresh stats after cleanup

      console.log('✅ Manual cleanup completed successfully');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Manual cleanup failed');
      console.error('❌ Manual cleanup failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch stats on component mount
  useEffect(() => {
    fetchStats();
  }, []);

  if (isLoading && !stats) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Credential Cleanup Monitor
        </h3>
        <button
          onClick={triggerManualCleanup}
          disabled={isLoading}
          className={`
            px-4 py-2 rounded-md text-sm font-medium
            ${isLoading
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
              : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
            }
            transition-colors duration-200
          `}
        >
          {isLoading ? (
            <div className="flex items-center space-x-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Cleaning...</span>
            </div>
          ) : (
            'Manual Cleanup'
          )}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <div className="flex items-start space-x-2">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-red-800 dark:text-red-200">
              <p className="font-medium">Error</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {stats.totalCredentials}
            </div>
            <div className="text-sm text-blue-800 dark:text-blue-200">
              Total Credentials
            </div>
          </div>

          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.activeCredentials}
            </div>
            <div className="text-sm text-green-800 dark:text-green-200">
              Active
            </div>
          </div>

          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {stats.expiredCredentials}
            </div>
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              Expired
            </div>
          </div>

          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {stats.revokedCredentials}
            </div>
            <div className="text-sm text-red-800 dark:text-red-200">
              Revoked
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">Automatic Cleanup</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Runs every 6 hours via Netlify Edge Function
            </p>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Next: ~6 hours
          </div>
        </div>

        {lastManualCleanup && (
          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100">Last Manual Cleanup</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {new Date(lastManualCleanup).toLocaleString()}
              </p>
            </div>
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Cleanup Information</h4>
        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <li>• Credentials expire after 24 hours</li>
          <li>• Automatic cleanup runs every 6 hours</li>
          <li>• Manual cleanup available for immediate action</li>
          <li>• Expired credentials are permanently deleted</li>
          <li>• Revoked credentials are also cleaned up</li>
        </ul>
      </div>
    </div>
  );
};

export default CredentialCleanupMonitor; 