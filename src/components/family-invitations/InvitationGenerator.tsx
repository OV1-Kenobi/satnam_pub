/**
 * Family Federation Invitation Generator Component
 * 
 * Generates shareable invitation links with QR codes for family federation members.
 * Supports role-specific invitations with optional NIP-17 DM targeting.
 * 
 * MASTER CONTEXT COMPLIANCE:
 * ✅ TypeScript React component per browser-only architecture
 * ✅ Uses SecureTokenManager for JWT authentication
 * ✅ Privacy-first with zero-knowledge patterns
 * ✅ Integrates with existing QR code generation utility
 */

import { useState, useCallback } from 'react';
import {
  UserPlus,
  Copy,
  Check,
  QrCode,
  Send,
  AlertCircle,
  Loader2,
  RefreshCw,
  Shield,
  ShieldOff
} from 'lucide-react';
import { generateQRCodeDataURL } from '../../utils/qr-code-browser';
import { SecureTokenManager } from '../../lib/auth/secure-token-manager';
import { nip05Utils } from '../../lib/nip05-verification';
import { usePrivacyFirstMessaging } from '../../hooks/usePrivacyFirstMessaging';
import { central_event_publishing_service as CEPS } from '../../../lib/central_event_publishing_service';

// Master Context role hierarchy
type MasterContextRole = 'guardian' | 'steward' | 'adult' | 'offspring';

interface InvitationGeneratorProps {
  federationDuid: string;
  federationName: string;
  onInvitationGenerated?: (invitation: GeneratedInvitation) => void;
  onClose?: () => void;
}

export interface GeneratedInvitation {
  id: string;
  token: string;
  url: string;
  qrCodeDataUrl: string;
  role: MasterContextRole;
  expiresAt: string;
  targeted: boolean;
}

const ROLE_DESCRIPTIONS: Record<MasterContextRole, string> = {
  guardian: 'Full oversight and approval authority for federation governance',
  steward: 'Day-to-day management with spending and messaging approval',
  adult: 'Standard member access with personal wallet sovereignty',
  offspring: 'Guided access with educational features and spending limits'
};

const ROLE_COLORS: Record<MasterContextRole, string> = {
  guardian: 'from-purple-600 to-indigo-600',
  steward: 'from-blue-600 to-cyan-600',
  adult: 'from-green-600 to-emerald-600',
  offspring: 'from-orange-500 to-amber-500'
};

export function InvitationGenerator({
  federationDuid,
  federationName,
  onInvitationGenerated,
  onClose
}: InvitationGeneratorProps) {
  const messaging = usePrivacyFirstMessaging();
  const [selectedRole, setSelectedRole] = useState<MasterContextRole>('adult');
  const [personalMessage, setPersonalMessage] = useState('');
  const [targetNpub, setTargetNpub] = useState('');
  const [resolvedTargetNpub, setResolvedTargetNpub] = useState<string | null>(null);
  const [resolvedTargetNip05, setResolvedTargetNip05] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedInvitation, setGeneratedInvitation] = useState<GeneratedInvitation | null>(null);
  const [copied, setCopied] = useState(false);

  // Phase 3: Safeword security feature
  const [requireSafeword, setRequireSafeword] = useState(true);
  const [safeword, setSafeword] = useState('');
  const [safewordError, setSafewordError] = useState<string | null>(null);
  const [generatedSafeword, setGeneratedSafeword] = useState<string | null>(null);
  const [safewordCopied, setSafewordCopied] = useState(false);
  const [isSendingDm, setIsSendingDm] = useState(false);
  const [dmStatus, setDmStatus] = useState<string | null>(null);

  const generateInvitation = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setSafewordError(null);

    // Validate safeword if required
    if (requireSafeword) {
      if (!safeword || safeword.length < 8) {
        setSafewordError('Security passphrase must be at least 8 characters');
        setIsGenerating(false);
        return;
      }
    }

    try {
      // Resolve target identifier (npub or NIP-05) to npub if provided
      let inviteeNpub: string | undefined;
      let resolvedNpub: string | null = null;
      let resolvedNip05: string | null = null;
      const trimmedTarget = targetNpub.trim();

      if (trimmedTarget) {
        if (trimmedTarget.startsWith('npub1')) {
          inviteeNpub = trimmedTarget;
          resolvedNpub = trimmedTarget;
        } else if (trimmedTarget.includes('@')) {
          // Validate NIP-05 format before attempting resolution
          if (!nip05Utils.validateFormat(trimmedTarget)) {
            setError('Invalid NIP-05 identifier. Use username@domain (e.g., alice@my.satnam.pub)');
            setIsGenerating(false);
            return;
          }

          try {
            const verification = await nip05Utils.verify(trimmedTarget);
            if (!verification.verified || !verification.pubkey) {
              setError(verification.error || 'NIP-05 could not be verified for this identifier');
              setIsGenerating(false);
              return;
            }
            const npub = CEPS.encodeNpub(verification.pubkey);
            inviteeNpub = npub;
            resolvedNpub = npub;
            resolvedNip05 = trimmedTarget.toLowerCase();
          } catch (resolveErr) {
            setError(
              resolveErr instanceof Error
                ? resolveErr.message
                : 'Failed to resolve NIP-05 identifier. Please try again.'
            );
            setIsGenerating(false);
            return;
          }
        } else {
          setError('Invalid recipient format. Use npub1… or username@domain.');
          setIsGenerating(false);
          return;
        }
      }

      const token = SecureTokenManager.getAccessToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch('/api/family/invitations/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          federation_duid: federationDuid,
          invited_role: selectedRole,
          personal_message: personalMessage || undefined,
          invitee_npub: inviteeNpub,
          // Phase 3: Safeword parameters
          safeword: requireSafeword ? safeword : undefined,
          requireSafeword: requireSafeword
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate invitation');
      }

      // Generate QR code for the invitation URL
      const qrCodeDataUrl = await generateQRCodeDataURL(data.invitation.url, {
        size: 256,
        errorCorrectionLevel: 'M'
      });

      const invitation: GeneratedInvitation = {
        id: data.invitation.id,
        token: data.invitation.token,
        url: data.invitation.url,
        qrCodeDataUrl,
        role: selectedRole,
        expiresAt: data.invitation.expires_at,
        targeted: !!targetNpub
      };

      setGeneratedInvitation(invitation);
      setResolvedTargetNpub(resolvedNpub);
      setResolvedTargetNip05(resolvedNip05);

      // Store safeword for display (so founder can share it verbally)
      // Clear original input for security
      if (requireSafeword && data.safeword_reminder?.safeword) {
        setGeneratedSafeword(data.safeword_reminder.safeword);
      }
      setSafeword(''); // Clear from state after successful generation

      onInvitationGenerated?.(invitation);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invitation');
    } finally {
      setIsGenerating(false);
    }
  }, [federationDuid, selectedRole, personalMessage, targetNpub, requireSafeword, safeword, onInvitationGenerated]);

  const copyToClipboard = useCallback(async () => {
    if (!generatedInvitation) return;

    try {
      await navigator.clipboard.writeText(generatedInvitation.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, [generatedInvitation]);

  const copySafeword = useCallback(async () => {
    if (!generatedSafeword) return;

    try {
      await navigator.clipboard.writeText(generatedSafeword);
      setSafewordCopied(true);
      setTimeout(() => setSafewordCopied(false), 2000);
    } catch {
      setError('Failed to copy safeword to clipboard');
    }
  }, [generatedSafeword]);

  const resetForm = useCallback(() => {
    setGeneratedInvitation(null);
    setPersonalMessage('');
    setTargetNpub('');
    setResolvedTargetNpub(null);
    setResolvedTargetNip05(null);
    setError(null);
    setSafeword('');
    setSafewordError(null);
    setGeneratedSafeword(null);
    setRequireSafeword(true);
    setIsSendingDm(false);
    setDmStatus(null);
  }, []);

  const sendInvitationViaDm = useCallback(async () => {
    if (!generatedInvitation || !resolvedTargetNpub) {
      setError('No target recipient available for Nostr DM. Add a npub or NIP-05 before generating the invitation.');
      return;
    }

    setError(null);
    setDmStatus(null);
    setIsSendingDm(true);

    try {
      const lines: string[] = [];
      lines.push("I'm inviting you to join my family federation on Satnam.");
      lines.push('');
      lines.push(`Invitation link: ${generatedInvitation.url}`);
      if (generatedSafeword) {
        lines.push('Security passphrase: I will share this separately (phone or in-person). You will need it when accepting the invitation.');
      }
      lines.push('');
      lines.push(`Federation: ${federationName}`);
      lines.push(`Role: ${selectedRole}`);

      const content = lines.join('\n');

      const ok = await messaging.sendDirectMessage(resolvedTargetNpub, content, 'gift-wrap');
      if (!ok) {
        setError('Failed to send Nostr DM. Please try again or share the link manually.');
      } else {
        setDmStatus('Invitation sent via Nostr DM');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to send Nostr DM. Please try again.'
      );
    } finally {
      setIsSendingDm(false);
    }
  }, [generatedInvitation, resolvedTargetNpub, generatedSafeword, federationName, selectedRole, messaging]);

  // Show generated invitation
  if (generatedInvitation) {
    return (
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 border border-white/10">
        <div className="text-center mb-6">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r ${ROLE_COLORS[selectedRole]} mb-4`}>
            <Check className="h-8 w-8 text-white" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Invitation Created!</h3>
          <p className="text-purple-200 text-sm">
            Share this invitation with your new {selectedRole}
          </p>
        </div>

        {/* QR Code */}
        <div className="flex justify-center mb-6">
          <div className="bg-white p-4 rounded-xl">
            <img
              src={generatedInvitation.qrCodeDataUrl}
              alt="Invitation QR Code"
              className="w-48 h-48"
            />
          </div>
        </div>

        {/* Invitation URL */}
        <div className="mb-6">
          <label className="block text-purple-200 text-sm mb-2">Invitation Link</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={generatedInvitation.url}
              readOnly
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white text-sm"
            />
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* One-click Nostr DM delivery (only when a resolved target exists) */}
        {resolvedTargetNpub && (
          <div className="mb-6">
            <button
              onClick={sendInvitationViaDm}
              disabled={isSendingDm}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg transition-colors"
            >
              {isSendingDm ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending via Nostr DM...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send via Nostr DM
                </>
              )}
            </button>
            {resolvedTargetNip05 && (
              <p className="text-emerald-200 text-xs mt-2">
                Sending to {resolvedTargetNip05} ({resolvedTargetNpub.slice(0, 12)}…)
              </p>
            )}
            {!resolvedTargetNip05 && (
              <p className="text-emerald-200 text-xs mt-2">
                Sending to {resolvedTargetNpub.slice(0, 12)}…
              </p>
            )}
            {dmStatus && (
              <p className="text-emerald-300 text-xs mt-2">{dmStatus}</p>
            )}
          </div>
        )}

        {/* Safeword Display (Phase 3) */}
        {generatedSafeword && (
          <div className="bg-amber-500/10 border border-amber-400/30 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-amber-200 font-semibold mb-2">Security Passphrase</h4>
                <p className="text-amber-300 text-sm mb-3">
                  Share this passphrase verbally with your invitee (phone call, in-person).
                  They will need to enter it when accepting the invitation.
                </p>
                <div className="flex gap-2">
                  <code className="flex-1 bg-black/30 border border-amber-400/20 rounded-lg px-4 py-2 text-amber-100 font-mono text-lg">
                    {generatedSafeword}
                  </code>
                  <button
                    onClick={copySafeword}
                    className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    {safewordCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {safewordCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-amber-400 text-xs mt-2">
                  ⚠️ This passphrase will not be shown again. Note it down securely.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Expiration info */}
        <div className="bg-blue-500/10 border border-blue-400/30 rounded-lg p-4 mb-6">
          <p className="text-blue-200 text-sm">
            <strong>Expires:</strong> {new Date(generatedInvitation.expiresAt).toLocaleDateString()}
            {' '}({new Date(generatedInvitation.expiresAt).toLocaleTimeString()})
          </p>
          <p className="text-blue-300 text-xs mt-1">
            Invitations are valid for 7 days. You can generate a new one if it expires.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={resetForm}
            className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white py-3 rounded-lg transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Create Another
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white py-3 rounded-lg transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    );
  }

  // Show invitation form
  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 border border-white/10">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-purple-600/20 rounded-xl">
          <UserPlus className="h-6 w-6 text-purple-400" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">Invite Family Member</h3>
          <p className="text-purple-200 text-sm">to {federationName}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-400/30 rounded-lg p-4 mb-6">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <p className="text-red-200 text-sm">{error}</p>
        </div>
      )}

      {/* Role Selection */}
      <div className="mb-6">
        <label className="block text-purple-200 text-sm mb-3">Select Role</label>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(ROLE_DESCRIPTIONS) as MasterContextRole[]).map((role) => (
            <button
              key={role}
              onClick={() => setSelectedRole(role)}
              className={`p-4 rounded-xl border-2 transition-all text-left ${selectedRole === role
                ? `border-purple-500 bg-gradient-to-r ${ROLE_COLORS[role]} bg-opacity-20`
                : 'border-white/10 bg-white/5 hover:border-white/30'
                }`}
            >
              <span className="block text-white font-semibold capitalize mb-1">{role}</span>
              <span className="block text-purple-200 text-xs">{ROLE_DESCRIPTIONS[role]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Personal Message (Optional) */}
      <div className="mb-6">
        <label className="block text-purple-200 text-sm mb-2">
          Personal Message <span className="text-purple-400">(optional)</span>
        </label>
        <textarea
          value={personalMessage}
          onChange={(e) => setPersonalMessage(e.target.value)}
          placeholder="Add a personal welcome message..."
          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-purple-300/50 resize-none"
          rows={3}
        />
      </div>

      {/* Target npub or NIP-05 (Optional) */}
      <div className="mb-6">
        <label className="block text-purple-200 text-sm mb-2">
          Target (npub or NIP-05) <span className="text-purple-400">(optional - for NIP-17 DM)</span>
        </label>
        <input
          type="text"
          value={targetNpub}
          onChange={(e) => setTargetNpub(e.target.value)}
          placeholder="npub1... or username@my.satnam.pub"
          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-purple-300/50"
        />
        <p className="text-purple-300 text-xs mt-1">
          If provided, only this user can accept the invitation
        </p>
      </div>

      {/* Security Passphrase (Safeword) - Phase 3 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <label className="flex items-center gap-2 text-purple-200 text-sm">
            {requireSafeword ? (
              <Shield className="h-4 w-4 text-amber-400" />
            ) : (
              <ShieldOff className="h-4 w-4 text-gray-400" />
            )}
            Require Security Passphrase
          </label>
          <button
            type="button"
            onClick={() => setRequireSafeword(!requireSafeword)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${requireSafeword ? 'bg-amber-600' : 'bg-gray-600'
              }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${requireSafeword ? 'translate-x-6' : 'translate-x-1'
                }`}
            />
          </button>
        </div>

        {requireSafeword && (
          <>
            <input
              type="text"
              value={safeword}
              onChange={(e) => {
                setSafeword(e.target.value);
                setSafewordError(null);
              }}
              placeholder="e.g., purple-elephant-sunrise"
              className={`w-full bg-white/10 border rounded-lg px-4 py-3 text-white placeholder-purple-300/50 ${safewordError ? 'border-red-400' : 'border-white/20'
                }`}
            />
            {safewordError && (
              <p className="text-red-400 text-xs mt-1">{safewordError}</p>
            )}
            <p className="text-amber-300 text-xs mt-2">
              For extra security, create a verbal passphrase to share with your invitee through a
              separate channel (phone call, in-person). They will need to enter this when accepting
              the invitation. Minimum 8 characters.
            </p>
          </>
        )}

        {!requireSafeword && (
          <p className="text-gray-400 text-xs">
            ⚠️ Without a passphrase, anyone with the invitation link can join your federation.
          </p>
        )}
      </div>

      {/* Generate Button */}
      <button
        onClick={generateInvitation}
        disabled={isGenerating}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <QrCode className="h-5 w-5" />
            Generate Invitation
          </>
        )}
      </button>
    </div>
  );
}

export default InvitationGenerator;

