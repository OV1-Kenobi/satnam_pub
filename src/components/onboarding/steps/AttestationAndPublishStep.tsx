/**
 * AttestationAndPublishStep Component
 * 
 * Creates cryptographic attestations (OpenTimestamps + NIP-03) for newly onboarded participants
 * and publishes them to the Nostr network.
 * 
 * Features:
 * - OpenTimestamps commitment creation
 * - NIP-03 timestamped event publishing
 * - Family federation linking
 * - Referral entry creation
 * - Coordinator attestation event
 * 
 * @module AttestationAndPublishStep
 * @phase Phase 10: Attestation & Publishing
 */

import { AlertTriangle, Check, CheckCircle, Clock, Loader2, Shield, Users } from 'lucide-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import { useOnboardingSession } from '../../../contexts/OnboardingSessionContext';
import { createAttestation } from '../../../lib/attestation-manager';
import { updateAttestationStep, getAttestationState, initializeAttestationProgress } from '../../../services/attestation-manager';
import { fetchWithAuth } from '../../../lib/auth/fetch-with-auth';

// ============================================================================
// Types
// ============================================================================

interface AttestationAndPublishStepProps {
  onNext: () => void;
  onBack: () => void;
  allowSkip?: boolean;
}

type AttestationStepStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'skipped';

interface AttestationProgress {
  ots: AttestationStepStatus;
  nip03: AttestationStepStatus;
  federation: AttestationStepStatus;
  publish: AttestationStepStatus;
}

// ============================================================================
// Component
// ============================================================================

export const AttestationAndPublishStep: FC<AttestationAndPublishStepProps> = ({
  onNext,
  onBack,
  allowSkip = false,
}) => {
  const { currentParticipant, session, updateParticipant } = useOnboardingSession();

  // Attestation progress state
  const [progress, setProgress] = useState<AttestationProgress>({
    ots: 'pending',
    nip03: 'pending',
    federation: 'pending',
    publish: 'pending',
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [canRetry, setCanRetry] = useState(false);

  // Attestation result data
  const [otsProof, setOtsProof] = useState<string | null>(null);
  const [nip03EventId, setNip03EventId] = useState<string | null>(null);
  const [federationLinked, setFederationLinked] = useState(false);
  const [attestationPublished, setAttestationPublished] = useState(false);

  // ============================================================================
  // Attestation Functions
  // ============================================================================

  /**
   * Step 1: Create OpenTimestamps commitment
   * Returns both timestamp ID and OTS proof to avoid stale closure issues
   */
  const createOTSCommitment = useCallback(async (): Promise<{ timestampId: string | null; proof: string | null }> => {
    if (!currentParticipant?.npub || !currentParticipant?.nip05) {
      throw new Error('Missing participant identity data');
    }

    setProgress(prev => ({ ...prev, ots: 'in_progress' }));
    updateAttestationStep('simpleproof', 'in-progress');

    try {
      // Create commitment hash from participant's identity data
      const commitmentData = `${currentParticipant.npub}:${currentParticipant.nip05}`;

      // Call simpleproof-timestamp function
      const response = await fetch('/.netlify/functions/simpleproof-timestamp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: commitmentData,
          verification_id: currentParticipant.participantId,
          event_type: 'physical_peer_onboarding',
          metadata: {
            npub: currentParticipant.npub,
            nip05: currentParticipant.nip05,
            session_id: session?.sessionId,
          },
        }),
      });

      if (!response.ok) {
        // Defensive JSON parsing to handle non-JSON error responses
        let errorMessage = 'Failed to create OTS commitment';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Response body is not JSON (e.g., HTML error page)
          // Use default error message
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      setOtsProof(result.ots_proof);
      setProgress(prev => ({ ...prev, ots: 'success' }));
      updateAttestationStep('simpleproof', 'success', {
        timestampId: result.id,
        bitcoinBlock: result.bitcoin_block,
      });

      return { timestampId: result.id, proof: result.ots_proof };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'OTS commitment failed';
      setProgress(prev => ({ ...prev, ots: 'failed' }));
      updateAttestationStep('simpleproof', 'failure', { error: errorMessage });

      // Non-fatal - continue with NIP-03 only
      console.warn('OTS commitment failed (non-fatal):', errorMessage);
      return { timestampId: null, proof: null };
    }
  }, [currentParticipant, session]);

  /**
   * Step 2: Create and publish NIP-03 attestation event
   * Accepts otsProofValue as parameter to avoid stale closure issues
   */
  const createNIP03Attestation = useCallback(async (simpleproofTimestampId: string | null, otsProofValue: string | null): Promise<string | null> => {
    if (!currentParticipant?.npub || !currentParticipant?.nip05) {
      throw new Error('Missing participant identity data');
    }

    setProgress(prev => ({ ...prev, nip03: 'in_progress' }));
    updateAttestationStep('nip03', 'in-progress');

    try {
      // Create NIP-03 attestation via backend
      const response = await fetchWithAuth('/.netlify/functions/onboarding-create-nip03-attestation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: currentParticipant.participantId,
          npub: currentParticipant.npub,
          nip05: currentParticipant.nip05,
          simpleproofTimestampId,
          otsProof: otsProofValue || '',
          eventType: 'identity_creation',
          relayUrls: ['wss://relay.satnam.pub'],
        }),
      });

      if (!response.ok) {
        // Defensive JSON parsing to handle non-JSON error responses
        let errorMessage = 'Failed to create NIP-03 attestation';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Response body is not JSON (e.g., HTML error page)
          // Use default error message
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      setNip03EventId(result.nip03_event_id);
      setProgress(prev => ({ ...prev, nip03: 'success' }));
      updateAttestationStep('nip03', 'success', {
        eventId: result.nip03_event_id,
        relayCount: result.relay_count,
      });

      return result.nip03_event_id;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'NIP-03 attestation failed';
      setProgress(prev => ({ ...prev, nip03: 'failed' }));
      updateAttestationStep('nip03', 'failure', { error: errorMessage });
      throw err; // Fatal error - cannot proceed without NIP-03
    }
  }, [currentParticipant]);

  /**
   * Step 3: Link participant to family federation
   * Returns success status to avoid stale closure issues
   */
  const linkToFederation = useCallback(async (): Promise<boolean> => {
    if (!currentParticipant?.userId) {
      throw new Error('Missing participant user ID');
    }

    setProgress(prev => ({ ...prev, federation: 'in_progress' }));

    try {
      // Link to coordinator's family federation
      const response = await fetchWithAuth('/.netlify/functions/onboarding-link-federation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: currentParticipant.participantId,
          userId: currentParticipant.userId,
          federationId: currentParticipant.federationId || session?.coordinatorUserId,
          role: 'offspring', // Default role for onboarded participants
          sessionId: session?.sessionId,
        }),
      });

      if (!response.ok) {
        // Defensive JSON parsing to handle non-JSON error responses
        let errorMessage = 'Failed to link to federation';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Response body is not JSON (e.g., HTML error page)
          // Use default error message
        }
        throw new Error(errorMessage);
      }

      setFederationLinked(true);
      setProgress(prev => ({ ...prev, federation: 'success' }));
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Federation linking failed';
      setProgress(prev => ({ ...prev, federation: 'failed' }));

      // Non-fatal - participant can be linked later
      console.warn('Federation linking failed (non-fatal):', errorMessage);
      return false;
    }
  }, [currentParticipant, session]);

  /**
   * Step 4: Publish coordinator attestation event
   * Accepts eventId as parameter to avoid stale closure issues
   * Returns success status to avoid stale closure issues
   */
  const publishCoordinatorAttestation = useCallback(async (eventId: string | null): Promise<boolean> => {
    if (!currentParticipant?.npub || !session?.coordinatorUserId) {
      throw new Error('Missing coordinator or participant data');
    }

    setProgress(prev => ({ ...prev, publish: 'in_progress' }));

    try {
      // Publish coordinator attestation event
      const response = await fetchWithAuth('/.netlify/functions/onboarding-publish-coordinator-attestation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantNpub: currentParticipant.npub,
          participantNip05: currentParticipant.nip05,
          federationId: currentParticipant.federationId || session.coordinatorUserId,
          sessionId: session.sessionId,
          nip03EventId: eventId,
          metadata: {
            onboarding_method: 'physical_peer_onboarding',
            onboarding_timestamp: new Date().toISOString(),
            campaign_id: session.metadata?.campaignId,
            kiosk_id: session.metadata?.kioskId,
          },
        }),
      });

      if (!response.ok) {
        // Defensive JSON parsing to handle non-JSON error responses
        let errorMessage = 'Failed to publish coordinator attestation';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Response body is not JSON (e.g., HTML error page)
          // Use default error message
        }
        throw new Error(errorMessage);
      }

      setAttestationPublished(true);
      setProgress(prev => ({ ...prev, publish: 'success' }));
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Coordinator attestation failed';
      setProgress(prev => ({ ...prev, publish: 'failed' }));

      // Non-fatal - attestation can be published later
      console.warn('Coordinator attestation failed (non-fatal):', errorMessage);
      return false;
    }
  }, [currentParticipant, session]);

  /**
   * Main attestation orchestration - runs all steps in sequence
   * Uses local variables to track results and avoid stale closure issues
   */
  const runAttestationFlow = useCallback(async () => {
    setIsProcessing(true);
    setError(null);
    initializeAttestationProgress();

    // Track results locally to avoid stale closure issues
    let localOtsProof: string | null = null;
    let localFederationLinked = false;
    let localAttestationPublished = false;

    try {
      // Step 1: Create OTS commitment (non-fatal if fails)
      const { timestampId, proof } = await createOTSCommitment();
      localOtsProof = proof;

      // Step 2: Create NIP-03 attestation (fatal if fails)
      const eventId = await createNIP03Attestation(timestampId, proof);

      // Step 3: Link to federation (non-fatal if fails)
      localFederationLinked = await linkToFederation();

      // Step 4: Publish coordinator attestation (non-fatal if fails)
      localAttestationPublished = await publishCoordinatorAttestation(eventId);

      // Update participant with attestation data using local values
      await updateParticipant(currentParticipant!.participantId, {
        nip03_event_id: eventId || undefined,
        ots_proof: localOtsProof || undefined,
        federation_linked: localFederationLinked,
        attestation_published: localAttestationPublished,
        currentStep: 'attestation',
      });

      // All steps complete
      setIsProcessing(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Attestation flow failed';
      setError(errorMessage);
      setIsProcessing(false);
      setCanRetry(true);
    }
  }, [
    createOTSCommitment,
    createNIP03Attestation,
    linkToFederation,
    publishCoordinatorAttestation,
    currentParticipant,
    updateParticipant,
  ]);

  /**
   * Retry failed attestation steps
   */
  const handleRetry = useCallback(async () => {
    setRetryCount(prev => prev + 1);
    setCanRetry(false);
    await runAttestationFlow();
  }, [runAttestationFlow]);

  /**
   * Skip attestation (if allowed)
   */
  const handleSkip = useCallback(() => {
    setProgress({
      ots: 'skipped',
      nip03: 'skipped',
      federation: 'skipped',
      publish: 'skipped',
    });
    onNext();
  }, [onNext]);

  /**
   * Complete attestation and proceed
   */
  const handleComplete = useCallback(() => {
    if (progress.nip03 !== 'success') {
      setError('NIP-03 attestation must succeed before proceeding');
      return;
    }
    onNext();
  }, [progress, onNext]);

  // ============================================================================
  // Effects
  // ============================================================================

  // Auto-start attestation flow on mount
  useEffect(() => {
    if (!isProcessing && progress.ots === 'pending') {
      runAttestationFlow();
    }
  }, []);

  // ============================================================================
  // Render Helpers
  // ============================================================================

  const getStepIcon = (status: AttestationStepStatus) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'in_progress':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'skipped':
        return <Check className="h-5 w-5 text-gray-400" />;
      default:
        return <Clock className="h-5 w-5 text-gray-300" />;
    }
  };

  const getStepLabel = (status: AttestationStepStatus) => {
    switch (status) {
      case 'success':
        return 'Complete';
      case 'failed':
        return 'Failed';
      case 'in_progress':
        return 'Processing...';
      case 'skipped':
        return 'Skipped';
      default:
        return 'Pending';
    }
  };

  const isAllComplete = () => {
    return progress.nip03 === 'success' &&
      (progress.ots === 'success' || progress.ots === 'failed' || progress.ots === 'skipped') &&
      (progress.federation === 'success' || progress.federation === 'failed' || progress.federation === 'skipped') &&
      (progress.publish === 'success' || progress.publish === 'failed' || progress.publish === 'skipped');
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-purple-100 rounded-full">
            <Shield className="h-8 w-8 text-purple-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Attestation & Publishing
        </h2>
        <p className="text-gray-600">
          Creating cryptographic proofs and publishing to the Nostr network
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Attestation Error</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="space-y-4">
        {/* Step 1: OpenTimestamps */}
        <div className="flex items-center space-x-4 p-4 bg-white border border-gray-200 rounded-lg">
          {getStepIcon(progress.ots)}
          <div className="flex-1">
            <p className="font-medium text-gray-900">OpenTimestamps Commitment</p>
            <p className="text-sm text-gray-500">Bitcoin-anchored timestamp proof</p>
          </div>
          <span className="text-sm font-medium text-gray-600">
            {getStepLabel(progress.ots)}
          </span>
        </div>

        {/* Step 2: NIP-03 */}
        <div className="flex items-center space-x-4 p-4 bg-white border border-gray-200 rounded-lg">
          {getStepIcon(progress.nip03)}
          <div className="flex-1">
            <p className="font-medium text-gray-900">NIP-03 Attestation Event</p>
            <p className="text-sm text-gray-500">Nostr timestamped event (Kind:1040)</p>
          </div>
          <span className="text-sm font-medium text-gray-600">
            {getStepLabel(progress.nip03)}
          </span>
        </div>

        {/* Step 3: Federation Linking */}
        <div className="flex items-center space-x-4 p-4 bg-white border border-gray-200 rounded-lg">
          {getStepIcon(progress.federation)}
          <div className="flex-1">
            <p className="font-medium text-gray-900">Family Federation Linking</p>
            <p className="text-sm text-gray-500">Connect to coordinator's federation</p>
          </div>
          <span className="text-sm font-medium text-gray-600">
            {getStepLabel(progress.federation)}
          </span>
        </div>

        {/* Step 4: Coordinator Attestation */}
        <div className="flex items-center space-x-4 p-4 bg-white border border-gray-200 rounded-lg">
          {getStepIcon(progress.publish)}
          <div className="flex-1">
            <p className="font-medium text-gray-900">Coordinator Attestation</p>
            <p className="text-sm text-gray-500">Publish coordinator's attestation event</p>
          </div>
          <span className="text-sm font-medium text-gray-600">
            {getStepLabel(progress.publish)}
          </span>
        </div>
      </div>

      {/* Success Message */}
      {isAllComplete() && !error && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start space-x-3">
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">Attestation Complete!</p>
            <p className="text-sm text-green-700 mt-1">
              Your identity has been cryptographically attested and published to the Nostr network.
            </p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t">
        <button
          onClick={onBack}
          disabled={isProcessing}
          className="px-4 py-2 text-gray-700 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Back
        </button>

        <div className="flex items-center space-x-3">
          {/* Skip Button (if allowed and not complete) */}
          {allowSkip && !isAllComplete() && (
            <button
              onClick={handleSkip}
              disabled={isProcessing}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              Skip Attestation
            </button>
          )}

          {/* Retry Button (if failed and can retry) */}
          {canRetry && retryCount < 3 && (
            <button
              onClick={handleRetry}
              disabled={isProcessing}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50"
            >
              Retry ({3 - retryCount} attempts left)
            </button>
          )}

          {/* Complete Button */}
          <button
            onClick={handleComplete}
            disabled={!isAllComplete() || isProcessing}
            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-blue-600 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span>Complete</span>
                <CheckCircle className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AttestationAndPublishStep;
