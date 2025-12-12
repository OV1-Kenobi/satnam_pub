/**
 * Family Federation Invitation Display Component
 * 
 * Displays invitation details for acceptance flow.
 * Used on the /invite/{token} route for both new and existing users.
 * 
 * MASTER CONTEXT COMPLIANCE:
 * ✅ TypeScript React component per browser-only architecture
 * ✅ Privacy-first with minimal data exposure
 * ✅ Supports both authenticated and unauthenticated users
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Shield,
  Clock,
  AlertCircle,
  CheckCircle,
  Loader2,
  ExternalLink,
  UserPlus,
  Lock
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { SecureTokenManager } from '../../lib/auth/secure-token-manager';
import { storeEncryptedInvitationToken, recoverEncryptedInvitationToken, clearInvitationToken } from '../../lib/crypto/invitation-token-storage';
import SignInModal from '../SignInModal';

type MasterContextRole = 'guardian' | 'steward' | 'adult' | 'offspring';

interface InvitationDisplayProps {
  token: string;
  onAccepted?: (federationDuid: string) => void;
  onCreateAccount?: () => void;
  /** Called when user successfully signs in - navigates to dashboard */
  onSignInSuccess?: () => void;
}

interface InvitationDetails {
  valid: boolean;
  error?: string;
  locked?: boolean;           // Phase 3: Too many failed safeword attempts
  locked_until?: string;      // Phase 3: Lockout expiration
  invitation?: {
    federation_name: string;
    invited_role: MasterContextRole;
    role_description: string;
    personal_message?: string;
    expires_at: string;
    role_guide_url: string;
    targeted: boolean;
    federation_duid: string;
    require_safeword?: boolean; // Phase 3: Whether safeword is required
  };
}

const ROLE_ICONS: Record<MasterContextRole, typeof Shield> = {
  guardian: Shield,
  steward: Users,
  adult: UserPlus,
  offspring: Users
};

const ROLE_COLORS: Record<MasterContextRole, string> = {
  guardian: 'from-purple-600 to-indigo-600',
  steward: 'from-blue-600 to-cyan-600',
  adult: 'from-green-600 to-emerald-600',
  offspring: 'from-orange-500 to-amber-500'
};

export function InvitationDisplay({
  token,
  onAccepted,
  onCreateAccount,
  onSignInSuccess
}: InvitationDisplayProps) {
  const { authenticated: isAuthenticated } = useAuth();
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  // Phase 3: Safeword state
  const [safeword, setSafeword] = useState('');
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  // Sign-in modal state for invitation flow
  const [showSignInModal, setShowSignInModal] = useState(false);

  // Store invitation token before triggering sign-in
  const handleSignInClick = async () => {
    try {
      await storeEncryptedInvitationToken(token);
      console.log('📦 Invitation token stored, opening sign-in modal');
      setShowSignInModal(true);
    } catch (error) {
      console.error('Failed to store invitation token:', error);
      // Still open sign-in modal even if storage fails
      setShowSignInModal(true);
    }
  };

  // Handle successful sign-in - clear stored token since we're already on the invite page
  const handleSignInSuccess = () => {
    clearInvitationToken();
    setShowSignInModal(false);
    onSignInSuccess?.();
    // Component will re-render with isAuthenticated=true, showing the accept button
  };

  // Recover stored invitation token on mount (for users who signed in from another page)
  useEffect(() => {
    const recoverToken = async () => {
      if (!isAuthenticated) return;

      try {
        const storedToken = await recoverEncryptedInvitationToken();
        if (storedToken && storedToken === token) {
          // Token matches - clear it since user is on the correct invite page
          clearInvitationToken();
          console.log('📦 Recovered matching invitation token, user can now accept');
        }
      } catch (error) {
        console.warn('Failed to recover invitation token:', error);
      }
    };

    recoverToken();
  }, [isAuthenticated, token]);

  // Fetch invitation details
  useEffect(() => {
    const fetchInvitation = async () => {
      try {
        const response = await fetch(`/api/family/invitations/validate?token=${encodeURIComponent(token)}`);
        const data = await response.json();
        setInvitation(data);
      } catch {
        setInvitation({ valid: false, error: 'Failed to load invitation' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvitation();
  }, [token]);

  // Accept invitation
  const acceptInvitation = useCallback(async () => {
    if (!invitation?.valid || !invitation.invitation || !isAuthenticated) return;

    // Phase 3: Validate safeword if required
    const requiresSafeword = invitation.invitation.require_safeword === true;
    if (requiresSafeword && !safeword.trim()) {
      setAcceptError('Please enter the security passphrase');
      return;
    }

    setIsAccepting(true);
    setAcceptError(null);

    try {
      const authToken = SecureTokenManager.getAccessToken();
      if (!authToken) {
        throw new Error('Authentication required');
      }

      const response = await fetch('/api/family/invitations/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          token,
          // Phase 3: Include safeword if required
          ...(requiresSafeword && { safeword: safeword.trim() })
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // Phase 3: Handle safeword-specific errors
        if (data.remaining_attempts !== undefined) {
          setRemainingAttempts(data.remaining_attempts);
        }
        throw new Error(data.error || 'Failed to accept invitation');
      }

      setAccepted(true);
      onAccepted?.(invitation.invitation!.federation_duid);

    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setIsAccepting(false);
    }
  }, [invitation, isAuthenticated, token, safeword, onAccepted]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="h-12 w-12 text-purple-400 animate-spin mb-4" />
        <p className="text-purple-200">Loading invitation...</p>
      </div>
    );
  }

  // Phase 3: Locked invitation (too many failed safeword attempts)
  if (invitation?.locked) {
    const lockedUntil = invitation.locked_until ? new Date(invitation.locked_until) : null;
    return (
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-amber-500/30 text-center max-w-md mx-auto">
        <Lock className="h-16 w-16 text-amber-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Invitation Locked</h2>
        <p className="text-amber-200 mb-4">
          Too many incorrect passphrase attempts. This invitation has been temporarily locked.
        </p>
        {lockedUntil && (
          <p className="text-amber-300 text-sm mb-6">
            Try again after: {lockedUntil.toLocaleString()}
          </p>
        )}
        <a
          href="/"
          className="inline-block bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors"
        >
          Go to Home
        </a>
      </div>
    );
  }

  // Invalid/expired invitation
  if (!invitation?.valid) {
    return (
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-red-500/30 text-center max-w-md mx-auto">
        <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Invalid Invitation</h2>
        <p className="text-red-200 mb-6">{invitation?.error || 'This invitation is no longer valid.'}</p>
        <a
          href="/"
          className="inline-block bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors"
        >
          Go to Home
        </a>
      </div>
    );
  }

  const { invitation: inv } = invitation;
  const RoleIcon = ROLE_ICONS[inv!.invited_role];
  const expiresAt = new Date(inv!.expires_at);
  const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  // Accepted state
  if (accepted) {
    return (
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-green-500/30 text-center max-w-md mx-auto">
        <CheckCircle className="h-16 w-16 text-green-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Welcome to the Family!</h2>
        <p className="text-green-200 mb-6">
          You've successfully joined <strong>{inv!.federation_name}</strong> as a {inv!.invited_role}.
        </p>
        <a
          href="/dashboard"
          className="inline-block bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-6 py-3 rounded-lg transition-colors"
        >
          Go to Dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r ${ROLE_COLORS[inv!.invited_role]} mb-4`}>
          <RoleIcon className="h-10 w-10 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">You're Invited!</h2>
        <p className="text-purple-200">
          Join <strong className="text-white">{inv!.federation_name}</strong>
        </p>
      </div>

      {/* Role Info */}
      <div className="bg-white/5 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold bg-gradient-to-r ${ROLE_COLORS[inv!.invited_role]} text-white capitalize`}>
            {inv!.invited_role}
          </span>
          <span className="text-purple-300 text-sm">Role</span>
        </div>
        <p className="text-purple-200 text-sm">{inv!.role_description}</p>
      </div>

      {/* Personal Message */}
      {inv!.personal_message && (
        <div className="bg-purple-500/10 border border-purple-400/30 rounded-xl p-4 mb-6">
          <p className="text-purple-200 italic">"{inv!.personal_message}"</p>
        </div>
      )}

      {/* Expiration */}
      <div className="flex items-center gap-2 text-sm text-purple-300 mb-6">
        <Clock className="h-4 w-4" />
        <span>Expires in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</span>
      </div>

      {/* Phase 3: Safeword Input */}
      {inv!.require_safeword && isAuthenticated && (
        <div className="mb-6">
          <label className="flex items-center gap-2 text-purple-200 text-sm mb-2">
            <Shield className="h-4 w-4 text-amber-400" />
            Security Passphrase Required
          </label>
          <input
            type="text"
            value={safeword}
            onChange={(e) => {
              setSafeword(e.target.value);
              setAcceptError(null);
            }}
            placeholder="Enter the passphrase shared by the inviter"
            className={`w-full bg-white/10 border rounded-lg px-4 py-3 text-white placeholder-purple-300/50 ${acceptError ? 'border-red-400' : 'border-white/20'
              }`}
          />
          <p className="text-amber-300 text-xs mt-2">
            The person who invited you should have shared this passphrase verbally (phone call, in-person).
          </p>
          {remainingAttempts !== null && remainingAttempts > 0 && (
            <p className="text-amber-400 text-xs mt-1">
              ⚠️ {remainingAttempts} attempt{remainingAttempts !== 1 ? 's' : ''} remaining before lockout
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {acceptError && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-400/30 rounded-lg p-4 mb-6">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <p className="text-red-200 text-sm">{acceptError}</p>
        </div>
      )}

      {/* Actions */}
      {isAuthenticated ? (
        <button
          onClick={acceptInvitation}
          disabled={isAccepting}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all"
        >
          {isAccepting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Joining...
            </>
          ) : (
            <>
              <CheckCircle className="h-5 w-5" />
              Accept Invitation
            </>
          )}
        </button>
      ) : (
        <div className="space-y-4">
          <button
            onClick={() => onCreateAccount?.()}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-4 rounded-xl transition-all"
          >
            <UserPlus className="h-5 w-5" />
            Create Account & Join
          </button>
          <p className="text-center text-purple-300 text-sm">
            Already have an account?{' '}
            <button
              onClick={handleSignInClick}
              className="text-purple-400 hover:text-purple-300 underline bg-transparent border-none cursor-pointer"
            >
              Sign in
            </button>
          </p>
        </div>
      )}

      {/* Role Guide Link */}
      <div className="mt-6 text-center">
        <a
          href={inv!.role_guide_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm"
        >
          Learn about the {inv!.invited_role} role
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Sign In Modal */}
      <SignInModal
        isOpen={showSignInModal}
        onClose={() => setShowSignInModal(false)}
        onSignInSuccess={handleSignInSuccess}
        onCreateNew={() => {
          setShowSignInModal(false);
          onCreateAccount?.();
        }}
      />
    </div>
  );
}

export default InvitationDisplay;

