/**
 * Secure Peer Invitation Modal with Multiple Authentication Methods
 * 
 * Supports:
 * 1. NIP-07 browser extension signing (preferred)
 * 2. Password-based nsec decryption (fallback)
 * 3. Temporary nsec from Identity Forge (new users)
 * 4. Batch invitation creation for Family Foundry
 */

import { AlertTriangle, Copy, Key, Mail, Shield, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { secureNsecManager } from '../lib/secure-nsec-manager';

interface SecurePeerInvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionInfo: {
    sessionToken?: string;
    user?: {
      npub: string;
      nip05?: string;
      authMethod: string;
      federationRole: string;
    };
  };
  // For post-registration users with retained nsec
  temporaryNsec?: string;
  // Post-registration retention session ID
  retentionSessionId?: string;
  // For batch invitations (Family Foundry)
  batchMode?: boolean;
  familyMembers?: Array<{
    id: string;
    name: string;
    npub: string;
    role: 'guardian' | 'steward' | 'adult' | 'offspring';
  }>;
  onComplete?: (results: InvitationResult[]) => void;
}

interface InvitationConfig {
  personalMessage: string;
  courseCredits: number;
  expiryDays: number;
  recipientNostrPubkey: string;
  sendAsGiftWrappedDM: boolean;
}

interface InvitationResult {
  success: boolean;
  recipientId?: string;
  inviteUrl?: string;
  qrCodeImage?: string;
  error?: string;
  signingMethod: 'nip07' | 'NIP05/password' | 'temporary_nsec';
}

export function SecurePeerInvitationModal({
  isOpen,
  onClose,
  sessionInfo,
  temporaryNsec,
  retentionSessionId,
  batchMode = false,
  familyMembers = [],
  onComplete
}: SecurePeerInvitationModalProps) {
  const [signingMethod, setSigningMethod] = useState<'auto' | 'nip07' | 'NIP05/password'>('auto');
  const [userPassword, setUserPassword] = useState('');
  const [userNip05, setUserNip05] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [inviteConfig, setInviteConfig] = useState<InvitationConfig>({
    personalMessage: '',
    courseCredits: 1,
    expiryDays: 30,
    recipientNostrPubkey: '',
    sendAsGiftWrappedDM: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<InvitationResult[]>([]);
  const [currentStep, setCurrentStep] = useState<'config' | 'auth' | 'signing' | 'results'>('config');

  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
      }
      // Clear retention session on unmount if it exists
      if (retentionSessionId) {
        secureNsecManager.clearTemporarySession();
      }
    };
  }, [retentionSessionId]);

  // Validate session info
  if (!sessionInfo?.sessionToken || !sessionInfo?.user) {
    console.error('SecurePeerInvitationModal: Invalid session info provided');
    return null;
  }

  // Validate NIP-05 format and domain (same pattern as NIP05PasswordAuth)
  const validateNIP05 = (nip05: string): { valid: boolean; error?: string } => {
    const nip05Regex = /^([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;

    if (!nip05Regex.test(nip05)) {
      return { valid: false, error: 'Invalid NIP-05 format. Use format: user@domain.com' };
    }

    const [, domain] = nip05.split('@');
    const whitelistedDomains = ['satnam.pub', 'citadel.academy'];

    if (!whitelistedDomains.includes(domain)) {
      return { valid: false, error: 'Domain not whitelisted. Use satnam.pub or citadel.academy' };
    }

    return { valid: true };
  };

  // Check if NIP-07 is available (same pattern as SignInModal)
  const isNIP07Available = (): boolean => {
    return !!(
      typeof window !== "undefined" &&
      window.nostr &&
      typeof window.nostr.signEvent === "function" &&
      typeof window.nostr.getPublicKey === "function"
    );
  };

  // Determine the best signing method
  const determineBestSigningMethod = (): 'nip07' | 'NIP05/password' | 'temporary_nsec' => {
    // Priority 1: Post-registration retained nsec or temporary nsec from Identity Forge
    if (temporaryNsec || retentionSessionId) {
      return 'temporary_nsec';
    }

    // Priority 2: NIP-07 if available and user prefers it
    if (isNIP07Available() && sessionInfo.user?.authMethod === 'nip07') {
      return 'nip07';
    }

    // Priority 3: Password-based decryption (NIP-05/password fallback)
    return 'NIP05/password';
  };

  // Sign invitation using NIP-07 (same pattern as SignInModal)
  const signWithNIP07 = async (inviteData: any): Promise<any> => {
    if (!window.nostr) {
      throw new Error('NIP-07 extension not available');
    }

    // Get public key with timeout (same pattern as SignInModal)
    const getPublicKeyPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Extension response timeout - please try again'));
      }, 10000); // 10 second timeout

      window.nostr!.getPublicKey()
        .then((key: string) => {
          clearTimeout(timeout);
          resolve(key);
        })
        .catch((error: any) => {
          clearTimeout(timeout);
          reject(error);
        });
    });

    const pubkey = await getPublicKeyPromise;

    const event = {
      kind: 4, // Direct message
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', inviteData.recipientPubkey]],
      content: inviteData.giftWrappedContent,
      pubkey
    };

    // Sign with timeout (same pattern as SignInModal)
    const signEventPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Signing timeout - please try again'));
      }, 30000); // 30 second timeout

      window.nostr!.signEvent(event)
        .then((signedEvent: any) => {
          clearTimeout(timeout);
          resolve(signedEvent);
        })
        .catch(() => {
          clearTimeout(timeout);
          reject(new Error('Signing cancelled. Please sign the invitation to continue.'));
        });
    });

    return await signEventPromise;
  };

  // Create invitation with secure signing
  const createSecureInvitation = async (config: InvitationConfig): Promise<InvitationResult> => {
    try {
      const bestMethod = determineBestSigningMethod();

      // Prepare signing options
      let actualTemporaryNsec = null;
      if (bestMethod === 'temporary_nsec') {
        if (retentionSessionId) {
          // Get nsec from post-registration retention session
          actualTemporaryNsec = secureNsecManager.getTemporaryNsec(retentionSessionId);
          if (!actualTemporaryNsec) {
            throw new Error('Post-registration nsec session expired or invalid');
          }
        } else if (temporaryNsec && temporaryNsec !== 'available') {
          // Direct temporary nsec (legacy Identity Forge flow)
          actualTemporaryNsec = temporaryNsec;
        } else {
          throw new Error('No temporary nsec available for signing');
        }
      }

      // Validate NIP-05/password credentials if using that method
      if (bestMethod === 'NIP05/password') {
        if (!userNip05.trim() || !userPassword.trim()) {
          throw new Error('Please enter both NIP-05 identifier and password');
        }

        // Validate NIP-05 format and domain (same pattern as NIP05PasswordAuth)
        const validation = validateNIP05(userNip05.trim());
        if (!validation.valid) {
          throw new Error(validation.error || 'Invalid NIP-05 identifier');
        }

        // Validate password length (same pattern as NIP05PasswordAuth)
        if (userPassword.length < 8) {
          throw new Error('Password must be at least 8 characters long');
        }
      }

      const signingOptions = {
        preferNIP07: bestMethod === 'nip07',
        userPassword: bestMethod === 'NIP05/password' ? userPassword : null,
        userNip05: bestMethod === 'NIP05/password' ? userNip05.trim() : null,
        temporaryNsec: actualTemporaryNsec
      };

      // For NIP-07, use client-side signing
      if (bestMethod === 'nip07') {
        // Create the invitation content
        const inviteContent = {
          personalMessage: config.personalMessage,
          courseCredits: config.courseCredits,
          expiryDays: config.expiryDays,
          recipientPubkey: config.recipientNostrPubkey,
          giftWrappedContent: `🎓 You've been invited to join Satnam.pub!\n\n${config.personalMessage}\n\nYou'll receive ${config.courseCredits} course credits upon signup.`
        };

        const signedEvent = await signWithNIP07(inviteContent);

        // Send the signed event to the server for processing
        const response = await fetch('/api/authenticated/process-signed-invitation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionInfo.sessionToken!}`
          },
          body: JSON.stringify({
            signedEvent,
            inviteConfig: config
          })
        });

        const result = await response.json();
        return {
          success: result.success,
          inviteUrl: result.inviteUrl,
          qrCodeImage: result.qrCodeImage,
          signingMethod: 'nip07',
          error: result.error
        };
      } else {
        // Use server-side signing with proper authentication
        const response = await fetch('/api/authenticated/generate-peer-invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionInfo.sessionToken!}`
          },
          body: JSON.stringify({
            ...config,
            signingOptions
          })
        });

        const result = await response.json();
        return {
          success: result.success,
          inviteUrl: result.inviteUrl,
          qrCodeImage: result.qrCodeImage,
          signingMethod: bestMethod,
          error: result.error
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        signingMethod: determineBestSigningMethod()
      };
    }
  };

  // Handle single invitation
  const handleSingleInvitation = async () => {
    setLoading(true);
    setError(null);
    setCurrentStep('signing');

    try {
      const result = await createSecureInvitation(inviteConfig);
      setResults([result]);
      setCurrentStep('results');

      if (onComplete) {
        onComplete([result]);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create invitation');
      setCurrentStep('config');
    } finally {
      setLoading(false);
    }
  };

  // Handle batch invitations for Family Foundry
  const handleBatchInvitations = async () => {
    setLoading(true);
    setError(null);
    setCurrentStep('signing');

    try {
      const batchResults: InvitationResult[] = [];

      for (const member of familyMembers) {
        const memberConfig = {
          ...inviteConfig,
          recipientNostrPubkey: member.npub,
          personalMessage: `You've been invited to join our family federation as a ${member.role}! ${inviteConfig.personalMessage}`
        };

        const result = await createSecureInvitation(memberConfig);
        result.recipientId = member.id;
        batchResults.push(result);
      }

      setResults(batchResults);
      setCurrentStep('results');

      if (onComplete) {
        onComplete(batchResults);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create batch invitations');
      setCurrentStep('config');
    } finally {
      setLoading(false);
    }
  };

  // Handle authentication method selection
  const handleAuthMethodChange = (method: 'nip07' | 'NIP05/password') => {
    setSigningMethod(method);
    setShowPasswordInput(method === 'NIP05/password');
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-purple-900/95 to-blue-900/95 rounded-2xl border border-white/20 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center">
                {batchMode ? <Users className="h-5 w-5 text-white" /> : <Mail className="h-5 w-5 text-white" />}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {batchMode ? 'Family Federation Invitations' : 'Secure Peer Invitation'}
                </h2>
                <p className="text-purple-200 text-sm">
                  {temporaryNsec ? 'Using temporary key from Identity Forge' :
                    isNIP07Available() ? 'NIP-07 extension available' : 'Password-based signing'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Security Notice */}
          {(temporaryNsec || retentionSessionId) && (
            <div className="bg-orange-500/10 rounded-lg p-4 border border-orange-400/30 mb-6">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="h-5 w-5 text-orange-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-orange-300 mb-1">
                    {retentionSessionId ? 'Post-Registration Key Session' : 'Temporary Key Session'}
                  </h4>
                  <p className="text-sm text-orange-200">
                    {retentionSessionId
                      ? 'Using nsec retained from registration completion. This key will be cleared from memory after invitation creation.'
                      : 'Using temporary nsec from Identity Forge. This key will be cleared from memory after invitation creation.'
                    }
                    Create multiple invitations now if needed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Content based on current step */}
          {currentStep === 'config' && (
            <div className="space-y-6">
              {/* Invitation Configuration */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-2">
                    Personal Message
                  </label>
                  <textarea
                    value={inviteConfig.personalMessage}
                    onChange={(e) => setInviteConfig(prev => ({ ...prev, personalMessage: e.target.value }))}
                    placeholder="Add a personal message to your invitation..."
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                    rows={3}
                    maxLength={500}
                  />
                </div>

                {!batchMode && (
                  <div>
                    <label className="block text-sm font-medium text-purple-200 mb-2">
                      Recipient Nostr Public Key
                    </label>
                    <input
                      type="text"
                      value={inviteConfig.recipientNostrPubkey}
                      onChange={(e) => setInviteConfig(prev => ({ ...prev, recipientNostrPubkey: e.target.value }))}
                      placeholder="npub1... or hex public key"
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono text-sm"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-purple-200 mb-2">
                      Course Credits
                    </label>
                    <select
                      value={inviteConfig.courseCredits}
                      onChange={(e) => setInviteConfig(prev => ({ ...prev, courseCredits: parseInt(e.target.value) }))}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    >
                      {[1, 2, 3, 4, 5].map(credits => (
                        <option key={credits} value={credits} className="bg-purple-900">
                          {credits} credit{credits > 1 ? 's' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-purple-200 mb-2">
                      Expires In
                    </label>
                    <select
                      value={inviteConfig.expiryDays}
                      onChange={(e) => setInviteConfig(prev => ({ ...prev, expiryDays: parseInt(e.target.value) }))}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    >
                      {[7, 14, 30, 60, 90].map(days => (
                        <option key={days} value={days} className="bg-purple-900">
                          {days} days
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Authentication Method Selection */}
              {!temporaryNsec && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Signing Method</h3>

                  <div className="grid grid-cols-1 gap-3">
                    {isNIP07Available() && (
                      <button
                        onClick={() => handleAuthMethodChange('nip07')}
                        className={`p-4 rounded-lg border-2 transition-all ${signingMethod === 'nip07'
                          ? 'border-emerald-500 bg-emerald-500/20'
                          : 'border-white/20 bg-white/5 hover:bg-white/10'
                          }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Key className="h-5 w-5 text-emerald-400" />
                          <div className="text-left">
                            <div className="font-medium text-white">NIP-07 Browser Extension</div>
                            <div className="text-sm text-purple-200">Most secure - uses your browser extension</div>
                          </div>
                        </div>
                      </button>
                    )}

                    <button
                      onClick={() => handleAuthMethodChange('NIP05/password')}
                      className={`p-4 rounded-lg border-2 transition-all ${signingMethod === 'NIP05/password'
                        ? 'border-blue-500 bg-blue-500/20'
                        : 'border-white/20 bg-white/5 hover:bg-white/10'
                        }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Shield className="h-5 w-5 text-blue-400" />
                        <div className="text-left">
                          <div className="font-medium text-white">Password Decryption</div>
                          <div className="text-sm text-purple-200">Decrypt your stored nsec with password</div>
                        </div>
                      </div>
                    </button>
                  </div>

                  {showPasswordInput && (
                    <div className="space-y-4">
                      {/* NIP-05 Input (same pattern as NIP05PasswordAuth) */}
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-2">
                          NIP-05 Identifier
                        </label>
                        <input
                          type="text"
                          value={userNip05}
                          onChange={(e) => setUserNip05(e.target.value)}
                          placeholder="user@satnam.pub"
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-purple-300 text-xs mt-1">
                          Your NIP-05 identifier (e.g., user@satnam.pub)
                        </p>
                      </div>

                      {/* Password Input */}
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-2">
                          Your Password
                        </label>
                        <input
                          type="password"
                          value={userPassword}
                          onChange={(e) => setUserPassword(e.target.value)}
                          placeholder="Enter your account password"
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-purple-300 text-xs mt-1">
                          Password used to decrypt your stored nsec for invitation signing
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  className="flex-1 bg-white/10 text-white py-3 px-4 rounded-lg hover:bg-white/20 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={batchMode ? handleBatchInvitations : handleSingleInvitation}
                  disabled={loading || (!batchMode && !inviteConfig.recipientNostrPubkey) || (showPasswordInput && (!userNip05.trim() || !userPassword.trim()))}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-medium transition-all duration-300"
                >
                  {loading ? 'Creating...' : batchMode ? `Create ${familyMembers.length} Invitations` : 'Create Invitation'}
                </button>
              </div>
            </div>
          )}

          {/* Loading State */}
          {currentStep === 'signing' && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
              <p className="text-white font-medium">
                {batchMode ? 'Creating batch invitations...' : 'Creating secure invitation...'}
              </p>
              <p className="text-purple-200 text-sm mt-2">
                {temporaryNsec ? 'Using temporary key' :
                  signingMethod === 'nip07' ? 'Signing with NIP-07 extension' : 'Decrypting with NIP-05/password'}
              </p>
            </div>
          )}

          {/* Results */}
          {currentStep === 'results' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white">
                {batchMode ? 'Invitation Results' : 'Invitation Created'}
              </h3>

              {results.map((result, index) => (
                <div key={index} className={`p-4 rounded-lg border ${result.success
                  ? 'border-emerald-500/50 bg-emerald-500/10'
                  : 'border-red-500/50 bg-red-500/10'
                  }`}>
                  {result.success ? (
                    <div className="space-y-3">
                      {result.recipientId && (
                        <p className="text-emerald-300 font-medium">
                          Invitation for {familyMembers.find(m => m.id === result.recipientId)?.name}
                        </p>
                      )}

                      {result.qrCodeImage && (
                        <div className="flex justify-center">
                          <img src={result.qrCodeImage} alt="Invitation QR Code" className="w-32 h-32" />
                        </div>
                      )}

                      {result.inviteUrl && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={result.inviteUrl}
                            readOnly
                            className="flex-1 bg-white/10 border border-white/20 rounded px-3 py-2 text-white text-sm font-mono"
                          />
                          <button
                            onClick={() => navigator.clipboard.writeText(result.inviteUrl!)}
                            className="p-2 bg-emerald-500 hover:bg-emerald-600 rounded text-white transition-colors"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      )}

                      <p className="text-emerald-200 text-sm">
                        Signed with: {result.signingMethod === 'nip07' ? 'NIP-07 Extension' :
                          result.signingMethod === 'temporary_nsec' ? 'Temporary Key' : 'NIP-05/Password Decryption'}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-red-300 font-medium">Failed to create invitation</p>
                      <p className="text-red-200 text-sm mt-1">{result.error}</p>
                    </div>
                  )}
                </div>
              ))}

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setCurrentStep('config');
                    setResults([]);
                  }}
                  className="flex-1 bg-white/10 text-white py-3 px-4 rounded-lg hover:bg-white/20 transition-colors duration-200"
                >
                  Create Another
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white py-3 px-4 rounded-lg font-medium transition-all duration-300"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SecurePeerInvitationModal;
