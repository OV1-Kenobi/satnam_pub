/**
 * Lightning Setup Step Component
 * 
 * Enables participants to configure Lightning wallet during physical peer onboarding.
 * 
 * Features:
 * - Auto-provisioned LNbits wallet with Lightning Address (username@satnam.pub)
 * - External wallet connection via NWC (Nostr Wallet Connect)
 * - Scrub forwarding configuration for external self-custody
 * - Lightning Address validation
 * - Integration with OnboardingSessionContext
 * 
 * Security:
 * - NWC connection strings encrypted before storage (AES-256-GCM)
 * - Web Crypto API for all cryptographic operations
 * - Zero-knowledge principles (no plaintext secrets in logs)
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useOnboardingSession } from '../../../contexts/OnboardingSessionContext';
import { authenticatedFetch } from '../../../utils/secureSession';

// ============================================================================
// Types
// ============================================================================

type WalletSetupMode = 'auto' | 'external';

interface LightningSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  allowSkip?: boolean;
}

// ============================================================================
// Component
// ============================================================================

const LightningSetupStep: React.FC<LightningSetupStepProps> = ({
  onNext,
  onBack,
  allowSkip = true,
}) => {
  const { currentParticipant, updateParticipant, completeStep } = useOnboardingSession();

  // State
  const [setupMode, setSetupMode] = useState<WalletSetupMode>('auto');
  const [lightningAddress, setLightningAddress] = useState<string>('');
  const [nwcConnectionString, setNwcConnectionString] = useState<string>('');
  const [externalLightningAddress, setExternalLightningAddress] = useState<string>('');
  const [scrubEnabled, setScrubEnabled] = useState<boolean>(false);
  const [scrubPercent, setScrubPercent] = useState<number>(100);
  const [isProvisioning, setIsProvisioning] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Ref for setTimeout cleanup
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // ============================================================================
  // Lightning Address Generation
  // ============================================================================

  useEffect(() => {
    if (currentParticipant && setupMode === 'auto') {
      // Generate Lightning Address from display name or NIP-05
      const rawUsername = currentParticipant.displayName ||
        currentParticipant.nip05?.split('@')[0] ||
        currentParticipant.trueName;

      // Sanitize: lowercase, remove spaces, keep only valid characters
      const username = rawUsername
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9._-]/g, '');

      setLightningAddress(`${username}@satnam.pub`);
    }
  }, [currentParticipant, setupMode]);

  // ============================================================================
  // Validation
  // ============================================================================

  const validateNWCConnectionString = useCallback((nwc: string): boolean => {
    // NWC format: nostr+walletconnect://pubkey?relay=wss://...&secret=...
    // Parameters can be in any order and there may be multiple relays
    try {
      if (!nwc.startsWith('nostr+walletconnect://')) return false;

      const url = new URL(nwc.replace('nostr+walletconnect://', 'https://'));
      const pubkey = url.hostname;
      const relay = url.searchParams.get('relay');
      const secret = url.searchParams.get('secret');

      // Validate pubkey (64 hex chars)
      if (!/^[a-f0-9]{64}$/i.test(pubkey)) return false;
      // Require at least one relay starting with wss://
      if (!relay?.startsWith('wss://')) return false;
      // Require secret (64 hex chars)
      if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) return false;

      return true;
    } catch {
      return false;
    }
  }, []);

  const validateLightningAddress = useCallback((address: string): boolean => {
    // Format: username@domain.com
    const laRegex = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
    return laRegex.test(address);
  }, []);

  // ============================================================================
  // Auto-Provision LNbits Wallet
  // ============================================================================

  const provisionLNbitsWallet = useCallback(async () => {
    if (!currentParticipant) {
      setError('No participant data available');
      return;
    }

    // Validate external Lightning Address if Scrub forwarding is enabled
    if (scrubEnabled && !validateLightningAddress(externalLightningAddress)) {
      setError('Invalid external Lightning Address format');
      return;
    }

    setIsProvisioning(true);
    setError('');
    setSuccess('');

    try {
      const response = await authenticatedFetch(
        '/.netlify/functions/onboarding-lightning-setup',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            participantId: currentParticipant.participantId,
            setupMode: 'auto',
            lightningAddress,
            externalLightningAddress: scrubEnabled ? externalLightningAddress : undefined,
            scrubEnabled,
            scrubPercent: scrubEnabled ? scrubPercent : 100,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to provision Lightning wallet');
      }

      const data = await response.json();

      setSuccess(`Lightning wallet provisioned! Address: ${data.lightningAddress}`);

      // Update participant in context
      await updateParticipant(currentParticipant.participantId, {
        currentStep: 'keet',
      });

      // Mark step as complete (Lightning data stored in lightning_links table via API)
      await completeStep('lightning');

      // Proceed to next step after short delay
      timeoutRef.current = setTimeout(() => {
        onNext();
      }, 1500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setIsProvisioning(false);
    }
  }, [currentParticipant, lightningAddress, externalLightningAddress, scrubEnabled, scrubPercent, validateLightningAddress, updateParticipant, completeStep, onNext]);

  // ============================================================================
  // Connect External Wallet (NWC)
  // ============================================================================

  const connectExternalWallet = useCallback(async () => {
    if (!currentParticipant) {
      setError('No participant data available');
      return;
    }

    // Validate NWC connection string
    if (!validateNWCConnectionString(nwcConnectionString)) {
      setError('Invalid NWC connection string format. Expected: nostr+walletconnect://...');
      return;
    }

    // Validate external Lightning Address if Scrub forwarding is enabled
    if (scrubEnabled && !validateLightningAddress(externalLightningAddress)) {
      setError('Invalid external Lightning Address format');
      return;
    }

    setIsProvisioning(true);
    setError('');
    setSuccess('');

    try {
      const response = await authenticatedFetch(
        '/.netlify/functions/onboarding-lightning-setup',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            participantId: currentParticipant.participantId,
            setupMode: 'external',
            nwcConnectionString,
            externalLightningAddress: scrubEnabled ? externalLightningAddress : undefined,
            scrubEnabled,
            scrubPercent: scrubEnabled ? scrubPercent : 100,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to connect external wallet');
      }

      await response.json();

      setSuccess(`External wallet connected successfully!`);

      // Update participant in context
      await updateParticipant(currentParticipant.participantId, {
        currentStep: 'keet',
      });

      // Mark step as complete (Lightning data stored in lightning_links table via API)
      await completeStep('lightning');

      // Proceed to next step after short delay
      timeoutRef.current = setTimeout(() => {
        onNext();
      }, 1500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setIsProvisioning(false);
    }
  }, [currentParticipant, nwcConnectionString, externalLightningAddress, scrubEnabled, scrubPercent, validateNWCConnectionString, validateLightningAddress, updateParticipant, completeStep, onNext]);

  // ============================================================================
  // Skip Lightning Setup
  // ============================================================================

  const handleSkip = useCallback(async () => {
    if (!currentParticipant) return;

    try {
      await updateParticipant(currentParticipant.participantId, {
        currentStep: 'keet',
      });

      onNext();
    } catch (err) {
      setError('Failed to skip step');
    }
  }, [currentParticipant, updateParticipant, onNext]);

  // ============================================================================
  // Render
  // ============================================================================

  if (!currentParticipant) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">No participant data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Lightning Wallet Setup
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Configure your Lightning wallet to send and receive Bitcoin payments
        </p>
      </div>

      {/* Setup Mode Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Choose Wallet Setup Method
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Auto-Provision Option */}
          <button
            type="button"
            onClick={() => setSetupMode('auto')}
            className={`p-4 border-2 rounded-lg text-left transition-colors ${setupMode === 'auto'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-blue-300'
              }`}
          >
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${setupMode === 'auto' ? 'border-blue-500' : 'border-gray-300'
                  }`}>
                  {setupMode === 'auto' && (
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                  )}
                </div>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                  Auto-Provision Wallet
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  We'll create a Lightning wallet for you with a Lightning Address
                </p>
              </div>
            </div>
          </button>

          {/* External Wallet Option */}
          <button
            type="button"
            onClick={() => setSetupMode('external')}
            className={`p-4 border-2 rounded-lg text-left transition-colors ${setupMode === 'external'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-blue-300'
              }`}
          >
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${setupMode === 'external' ? 'border-blue-500' : 'border-gray-300'
                  }`}>
                  {setupMode === 'external' && (
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                  )}
                </div>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                  Connect External Wallet
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Use your own wallet via Nostr Wallet Connect (NWC)
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Auto-Provision Form */}
      {setupMode === 'auto' && (
        <div className="space-y-4">
          {/* Lightning Address Display */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Your Lightning Address
            </label>
            <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600">
              <p className="text-sm font-mono text-gray-900 dark:text-white">
                {lightningAddress}
              </p>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              This address will be used to receive Lightning payments
            </p>
          </div>

          {/* Scrub Forwarding Configuration */}
          <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                  Scrub Forwarding (Optional)
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Automatically forward payments to your external self-custody wallet
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScrubEnabled(!scrubEnabled)}
                role="switch"
                aria-checked={scrubEnabled}
                aria-label="Enable scrub forwarding"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${scrubEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${scrubEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                />
              </button>
            </div>

            {scrubEnabled && (
              <div className="space-y-3 pt-2">
                <div>
                  <label htmlFor="external-lightning-address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    External Lightning Address
                  </label>
                  <input
                    type="text"
                    id="external-lightning-address"
                    value={externalLightningAddress}
                    onChange={(e) => setExternalLightningAddress(e.target.value)}
                    placeholder="user@getalby.com"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label htmlFor="scrub-percent" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Forward Percentage: {scrubPercent}%
                  </label>
                  <input
                    type="range"
                    id="scrub-percent"
                    min="0"
                    max="100"
                    step="10"
                    value={scrubPercent}
                    onChange={(e) => setScrubPercent(Number(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {scrubPercent}% of incoming payments will be forwarded to your external wallet
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Provision Button */}
          <button
            type="button"
            onClick={provisionLNbitsWallet}
            disabled={isProvisioning}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isProvisioning ? 'Provisioning Wallet...' : 'Provision Lightning Wallet'}
          </button>
        </div>
      )}

      {/* External Wallet Form */}
      {setupMode === 'external' && (
        <div className="space-y-4">
          {/* NWC Connection String Input */}
          <div>
            <label htmlFor="nwc-connection-string" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              NWC Connection String
            </label>
            <textarea
              id="nwc-connection-string"
              value={nwcConnectionString}
              onChange={(e) => setNwcConnectionString(e.target.value)}
              placeholder="nostr+walletconnect://..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Get this from your wallet's NWC settings (Alby, Mutiny, etc.)
            </p>
          </div>

          {/* Scrub Forwarding for External Wallet */}
          <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                  Scrub Forwarding (Optional)
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Forward payments to a different Lightning Address
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScrubEnabled(!scrubEnabled)}
                role="switch"
                aria-checked={scrubEnabled}
                aria-label="Enable scrub forwarding"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${scrubEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${scrubEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                />
              </button>
            </div>

            {scrubEnabled && (
              <div className="pt-2">
                <label htmlFor="external-lightning-address-nwc" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  External Lightning Address
                </label>
                <input
                  type="text"
                  id="external-lightning-address-nwc"
                  value={externalLightningAddress}
                  onChange={(e) => setExternalLightningAddress(e.target.value)}
                  placeholder="user@getalby.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
          </div>

          {/* Connect Button */}
          <button
            type="button"
            onClick={connectExternalWallet}
            disabled={isProvisioning || !nwcConnectionString}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isProvisioning ? 'Connecting Wallet...' : 'Connect External Wallet'}
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={onBack}
          disabled={isProvisioning}
          className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Back
        </button>

        {allowSkip && (
          <button
            type="button"
            onClick={handleSkip}
            disabled={isProvisioning}
            className="px-6 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Skip for Now
          </button>
        )}
      </div>
    </div>
  );
};

export default LightningSetupStep;
