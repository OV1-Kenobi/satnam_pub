/**
 * Sent Invitations Component
 * Shows invitations created by guardians/stewards with status
 */

import { useState, useEffect } from 'react';
import { Send, Copy, CheckCircle, Clock, XCircle, Loader2, AlertCircle, Eye } from 'lucide-react';
import { SecureTokenManager } from '../../lib/auth/secure-token-manager';

interface SentInvitation {
  id: string;
  token: string;
  federation_name: string;
  invited_role: 'guardian' | 'steward' | 'adult' | 'offspring';
  status: 'pending' | 'viewed' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  created_at: string;
  view_count: number;
  invite_url: string;
}

const STATUS_STYLES = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Clock },
  viewed: { bg: 'bg-blue-100', text: 'text-blue-800', icon: Eye },
  accepted: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
  expired: { bg: 'bg-gray-100', text: 'text-gray-600', icon: XCircle },
  revoked: { bg: 'bg-red-100', text: 'text-red-800', icon: XCircle }
};

export function SentInvitations() {
  const [invitations, setInvitations] = useState<SentInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvitations = async () => {
      try {
        const token = SecureTokenManager.getAccessToken();
        if (!token) {
          setError('Authentication required');
          setLoading(false);
          return;
        }

        const response = await fetch('/api/family/invitations/list-sent', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to fetch invitations');

        const data = await response.json();
        setInvitations(data.invitations || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load invitations');
      } finally {
        setLoading(false);
      }
    };

    fetchInvitations();
  }, []);

  const copyInviteLink = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      console.error('Failed to copy');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
        <span className="ml-2 text-gray-600">Loading sent invitations...</span>
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

  if (invitations.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Send className="h-12 w-12 mx-auto mb-3 text-gray-400" />
        <p>You haven't sent any invitations yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <Send className="h-5 w-5" />
        Sent Invitations ({invitations.length})
      </h3>
      
      <div className="space-y-3">
        {invitations.map((inv) => {
          const StatusIcon = STATUS_STYLES[inv.status].icon;
          return (
            <div key={inv.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="font-medium text-gray-900">{inv.federation_name}</h4>
                  <p className="text-sm text-gray-500 capitalize">Role: {inv.invited_role}</p>
                </div>
                <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[inv.status].bg} ${STATUS_STYLES[inv.status].text}`}>
                  <StatusIcon className="h-3 w-3" />
                  {inv.status}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Views: {inv.view_count} | Created: {new Date(inv.created_at).toLocaleDateString()}</span>
                {inv.status === 'pending' && (
                  <button
                    onClick={() => copyInviteLink(inv.invite_url, inv.id)}
                    className="flex items-center gap-1 text-purple-600 hover:text-purple-800"
                  >
                    {copiedId === inv.id ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiedId === inv.id ? 'Copied!' : 'Copy Link'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SentInvitations;

