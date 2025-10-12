/**
 * NIP-05/Password Authentication Component
 *
 * Secure authentication using NIP-05 identifier and password
 * - Domain whitelist enforcement (satnam.pub, citadel.academy)
 * - Privacy-first architecture with hashed UUIDs
 * - Secure password handling with immediate cleanup
 * - Rate limiting and account lockout protection
 */


import {
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Key,
  RefreshCw,
  Shield,
  User,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { recoverySessionBridge } from '../../lib/auth/recovery-session-bridge';
import type { UserIdentity } from '../../lib/auth/user-identities-auth';
import { useAuth } from './AuthProvider';

import { config } from "../../../config";
import { resolvePlatformLightningDomain } from '../../config/domain.client';




interface NIP05PasswordAuthProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (destination?: 'individual' | 'family') => void;
  destination?: 'individual' | 'family';
  title?: string;
  purpose?: string;
}

export function NIP05PasswordAuth({
  isOpen,
  onClose,
  onAuthSuccess,
  destination = 'family',
  title = 'NIP-05/Password Authentication',
  purpose = 'Sign in with your NIP-05 identifier and password'
}: NIP05PasswordAuthProps) {
  const auth = useAuth();

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [nip05, setNip05] = useState("");
  const [password, setPassword] = useState(""); // current password
  const [showPassword, setShowPassword] = useState(false);
  // Change password states
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  const mountedRef = useRef(true);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  const handleClose = () => {
    // Clear sensitive data
    setPassword("");
    setNip05("");
    setNewPassword("");
    setConfirmNewPassword("");
    setShowChangePassword(false);
    setError(null);
    setSuccess(null);
    setIsLoading(false);
    setIsChanging(false);
    onClose();
  };

  const handleAuthSuccess = () => {
    setSuccess('NIP-05/Password authentication successful! Maximum privacy protection active.');

    closeTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return;
      onAuthSuccess(destination);
      handleClose();
    }, 1500);
  };

  // Validate NIP-05 format and domain
  const validateNIP05 = (nip05: string): { valid: boolean; error?: string } => {
    const nip05Regex = /^([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;

    if (!nip05Regex.test(nip05)) {
      return { valid: false, error: 'Invalid NIP-05 format. Use format: user@domain.com' };
    }

    const [, domain] = nip05.split('@');
    const whitelistedDomains = config.nip05?.allowedDomains;

    if (!whitelistedDomains?.includes(domain)) {
      return { valid: false, error: 'Domain not whitelisted. Use satnam.pub or citadel.academy' };
    }

    return { valid: true };
  };

  // Handle NIP-05/Password Authentication
  const handleNIP05PasswordAuth = async () => {
    if (!nip05.trim() || !password.trim()) {
      setError('Please enter both NIP-05 identifier and password');
      return;
    }

    // Validate NIP-05 format and domain
    const validation = validateNIP05(nip05.trim());
    if (!validation.valid) {
      setError(validation.error || 'Invalid NIP-05 identifier');
      return;
    }

    // Validate password length
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use the unified authentication system
      const success = await auth.authenticateNIP05Password(nip05.trim(), password);

      if (!mountedRef.current) return;
      if (success) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('✅ Authentication successful');
        }

        // Note: SecureNsecManager session creation is now handled automatically
        // by the unified auth system's post-auth hook. No need for redundant calls here.
        console.log('🔐 NIP05PasswordAuth: Session creation delegated to unified auth system');

        handleAuthSuccess();
      } else {
        setError('Authentication failed. Please check your credentials.');
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Authentication error:', error);
      }
      setError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      if (!mountedRef.current) return;
      setIsLoading(false);
      // Clear password immediately after attempt
      setPassword("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading && !isChanging && !showChangePassword) {
      handleNIP05PasswordAuth();
    }
  };

  // Change password flow
  const handleChangePassword = async () => {
    if (!nip05.trim() || !password.trim()) {
      setError('Please enter your NIP-05 and current password');
      return;
    }
    const validation = validateNIP05(nip05.trim());
    if (!validation.valid) {
      setError(validation.error || 'Invalid NIP-05 identifier');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match');
      return;
    }

    setIsChanging(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nip05: nip05.trim(), currentPassword: password, newPassword }),
      });
      const json = await res.json().catch(() => null) as any;
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Password change failed (${res.status})`);
      }

      // Try to create recovery session immediately using returned user data
      try {
        const user = json?.data?.user as UserIdentity | undefined;
        if (user && (user as any).encrypted_nsec && user.user_salt) {
          const session = await recoverySessionBridge.createRecoverySessionFromUser(user, { duration: 15 * 60 * 1000 });
          if (!session.success) {
            console.warn('NSEC session after password change failed:', session.error);
          }
        }
      } catch (sessErr) {
        console.warn('Session init after password change threw:', sessErr);
      }

      setSuccess('Password changed successfully. You are now signed in.');
      // Navigate after short delay
      closeTimerRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
        onAuthSuccess(destination);
        handleClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed');
    } finally {
      setIsChanging(false);
      // Clear sensitive fields
      setPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-purple-900/95 to-purple-800/95 backdrop-blur-md rounded-2xl border border-purple-500/30 shadow-2xl w-full max-w-md">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center">
                <Key className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{title}</h2>
                <p className="text-purple-200 text-sm">{purpose}</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="text-purple-300 hover:text-white transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-4 bg-green-500/20 border border-green-500/50 rounded-lg flex items-center space-x-3">
              <CheckCircle className="h-5 w-5 text-green-400" />
              <p className="text-green-300 text-sm">{success}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center space-x-3">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* NIP-05/Password Form */}
          <div className="space-y-4">
            <form onSubmit={(e) => { e.preventDefault(); handleNIP05PasswordAuth(); }}>

              {/* NIP-05 Input */}
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-2">
                  NIP-05 Identifier
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-purple-400" />
                  <input
                    type="text"
                    value={nip05}
                    onChange={(e) => setNip05(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`user@${resolvePlatformLightningDomain()}`}
                    disabled={isLoading}
                    className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
                  />
                </div>
                <p className="text-purple-300 text-xs mt-1">
                  Only my.satnam.pub and whitelisted domains are supported
                </p>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-purple-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter your password"
                    disabled={isLoading}
                    className="w-full pl-10 pr-12 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-400 hover:text-purple-300"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <p className="text-purple-300 text-xs mt-1">
                  Minimum 8 characters required
                </p>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={isLoading || !nip05.trim() || !password.trim()}
                className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <Shield className="h-5 w-5" />
                    <span>Sign In</span>
                  </>


                )}
              </button>


            </form>

            {/* Change Password toggle */}
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setShowChangePassword((v) => !v)}
                className="text-purple-200 hover:text-white text-sm underline"
                disabled={isLoading}
              >
                {showChangePassword ? 'Hide Change Password' : 'Change Password'}
              </button>
            </div>

            {/* Change Password form */}
            {showChangePassword && (
              <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); handleChangePassword(); }}>
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-2">New Password</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-purple-400" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      disabled={isChanging}
                      className="w-full pl-10 pr-12 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-400 hover:text-purple-300"
                    >
                      {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-2">Confirm New Password</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-purple-400" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      disabled={isChanging}
                      className="w-full pl-10 pr-12 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isChanging || !nip05.trim() || !password.trim() || !newPassword.trim() || newPassword !== confirmNewPassword}
                  className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isChanging ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    <>
                      <Shield className="h-5 w-5" />
                      <span>Change Password</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Privacy Guarantee */}
          <div className="mt-6 p-4 bg-purple-800/30 border border-purple-500/50 rounded-lg">
            <div className="flex items-start space-x-3">
              <Shield className="h-5 w-5 text-purple-300 mt-0.5" />
              <div>
                <h4 className="font-semibold text-purple-300 mb-2">Maximum Privacy Guarantee</h4>
                <ul className="text-purple-200 text-sm space-y-1">
                  <li>• Your NIP-05 and password are never stored in plaintext</li>
                  <li>• Only cryptographically secure hashed UUIDs are stored</li>
                  <li>• Domain whitelist enforced for security</li>
                  <li>• Rate limiting and account lockout protection</li>
                  <li>• Perfect Forward Secrecy enabled</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div >
  );
}

export default NIP05PasswordAuth;
