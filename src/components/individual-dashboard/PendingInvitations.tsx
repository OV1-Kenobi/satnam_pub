/**
 * Pending Invitations Component
 * Shows received invitations with accept/decline actions
 */

import { useState, useEffect } from 'react';
import { Inbox, CheckCircle, XCircle, Loader2, AlertCircle, Clock } from 'lucide-react';
import { SecureTokenManager } from '../../lib/auth/secure-token-manager';

interface Invitation {
  id: string;
  token: string;
  federation_name: string;
  invited_role: 'guardian' | 'steward' | 'adult' | 'offspring';
  personal_message?: string;
  expires_at: string;
  inviter_name?: string;
}

const ROLE_COLORS = {
  guardian: 'bg-purple-100 text-purple-800 border-purple-300',
  steward: 'bg-blue-100 text-blue-800 border-blue-300',
  adult: 'bg-green-100 text-green-800 border-green-300',
  offspring: 'bg-orange-100 text-orange-800 border-orange-300'
};

export function PendingInvitations() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const fetchInvitations = async () => {
    try {
      const token = SecureTokenManager.getAccessToken();
      if (!token) {
        setError('Authentication required');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/family/invitations/list-received', {
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

  useEffect(() => { fetchInvitations(); }, []);

  const handleAccept = async (invToken: string) => {
    setAcceptingId(invToken);
    try {
      const authToken = SecureTokenManager.getAccessToken();
      const response = await fetch('/api/family/invitations/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ token: invToken })
      });

      if (!response.ok) throw new Error('Failed to accept invitation');

      // Refresh list
      await fetchInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept');
    } finally {
      setAcceptingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading invitations...</span>
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
        <Inbox className="h-12 w-12 mx-auto mb-3 text-gray-400" />
        <p>No pending invitations</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <Inbox className="h-5 w-5" />
        Pending Invitations ({invitations.length})
      </h3>
      
      <div className="space-y-3">
        {invitations.map((inv) => {
          const daysRemaining = Math.ceil((new Date(inv.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return (
            <div key={inv.id} className={`border rounded-lg p-4 ${ROLE_COLORS[inv.invited_role]}`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">{inv.federation_name}</h4>
                <span className="text-xs capitalize font-semibold">{inv.invited_role}</span>
              </div>
              {inv.personal_message && (
                <p className="text-sm italic mb-2">"{inv.personal_message}"</p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Expires in {daysRemaining} days
                </span>
                <button
                  onClick={() => handleAccept(inv.token)}
                  disabled={acceptingId === inv.token}
                  className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                >
                  {acceptingId === inv.token ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Accept
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PendingInvitations;

