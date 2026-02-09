/**
 * Physical Peer Onboarding Modal
 * @description Main orchestrator component for high-volume physical peer onboarding
 * 
 * Features:
 * - Wizard-style step navigation (intake → identity → password → NFC → Lightning → Keet → backup → attestation → complete)
 * - Single participant and batch mode support
 * - Progress indicators and session controls
 * - Integration with OnboardingSessionContext
 * - Zero-knowledge security principles
 * 
 * Similar structure to SecurePeerInvitationModal.tsx
 */

import { AlertCircle, CheckCircle, Loader2, Pause, Play, Users, User, X, ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useOnboardingSession } from '../../contexts/OnboardingSessionContext';
import type { OnboardingMode, OnboardingStep, PasswordValidationResult } from '../../types/onboarding';

// ============================================================================
// Lazy-Loaded Step Components (Performance Optimization - Phase 11)
// ============================================================================

// Phase 4 Step Components - Lazy loaded
const ParticipantIntakeStep = lazy(() => import('./steps/ParticipantIntakeStep'));
const PasswordSetupStep = lazy(() => import('./steps/PasswordSetupStep'));
const NostrIdentityStep = lazy(() => import('./steps/NostrIdentityStep'));

// Phase 5 Step Components - Lazy loaded
const NostrMigrationOTPStep = lazy(() => import('./steps/NostrMigrationOTPStep'));
const NFCCardRegistrationStep = lazy(() => import('./steps/NFCCardRegistrationStep').then(module => ({ default: module.NFCCardRegistrationStep })));

// Phase 6 Step Components - Lazy loaded
const LightningSetupStep = lazy(() => import('./steps/LightningSetupStep'));

// Phase 8 Step Components - Lazy loaded
const KeetIdentityStep = lazy(() => import('./steps/KeetIdentityStep'));

// Phase 9 Step Components - Lazy loaded
const OnboardingBackupStep = lazy(() => import('./steps/OnboardingBackupStep'));

// Phase 10 Step Components - Lazy loaded
const AttestationAndPublishStep = lazy(() => import('./steps/AttestationAndPublishStep').then(module => ({ default: module.AttestationAndPublishStep })));

// ============================================================================
// Loading Fallback Component
// ============================================================================

const StepLoadingFallback: FC = () => (
  <div className="flex items-center justify-center py-12">
    <div className="text-center">
      <Loader2 className="h-8 w-8 text-purple-400 animate-spin mx-auto mb-3" />
      <p className="text-purple-200 text-sm">Loading step...</p>
    </div>
  </div>
);

// ============================================================================
// Component Props
// ============================================================================

export interface PhysicalPeerOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
  initialMode?: OnboardingMode;
}

// ============================================================================
// Step Configuration
// ============================================================================

interface StepConfig {
  id: OnboardingStep;
  title: string;
  description: string;
  icon: JSX.Element;
}

const STEP_CONFIGS: StepConfig[] = [
  {
    id: 'intake',
    title: 'Participant Intake',
    description: 'Collect participant information',
    icon: <User className="h-5 w-5" />,
  },
  {
    id: 'identity',
    title: 'Nostr Identity',
    description: 'Create or migrate Nostr account',
    icon: <User className="h-5 w-5" />,
  },
  {
    id: 'password',
    title: 'Password Setup',
    description: 'Set password and PIN',
    icon: <User className="h-5 w-5" />,
  },
  {
    id: 'migration',
    title: 'Account Migration',
    description: 'Migrate existing Nostr account (if applicable)',
    icon: <User className="h-5 w-5" />,
  },
  {
    id: 'nfc',
    title: 'NFC Card Programming',
    description: 'Program Boltcard or Tapsigner',
    icon: <User className="h-5 w-5" />,
  },
  {
    id: 'lightning',
    title: 'Lightning Setup',
    description: 'Configure Lightning wallet',
    icon: <User className="h-5 w-5" />,
  },
  {
    id: 'keet',
    title: 'Keet P2P Identity',
    description: 'Set up Keet messaging',
    icon: <User className="h-5 w-5" />,
  },
  {
    id: 'backup',
    title: 'Backup & Security',
    description: 'Create backup materials',
    icon: <User className="h-5 w-5" />,
  },
  {
    id: 'attestation',
    title: 'Attestation',
    description: 'Publish attestations',
    icon: <Shield className="h-5 w-5" />,
  },
  {
    id: 'complete',
    title: 'Complete',
    description: 'Onboarding complete',
    icon: <CheckCircle className="h-5 w-5" />,
  },
];

// ============================================================================
// Main Component
// ============================================================================

export const PhysicalPeerOnboardingModal: FC<PhysicalPeerOnboardingModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  initialMode = 'single',
}) => {
  const {
    session,
    currentParticipant,
    participantQueue,
    currentStep,
    completedSteps,
    totalParticipants,
    completedParticipants,
    isLoading,
    error,
    startSession,
    pauseSession,
    resumeSession,
    completeSession,
    cancelSession,
    nextStep,
    previousStep,
    goToStep,
    completeStep,
    nextParticipant,
    previousParticipant,
    clearError,
  } = useOnboardingSession();

  const [isInitialized, setIsInitialized] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const mountedRef = useRef(true);

  // Password state - stored in ref for security (not in React state)
  // This password is passed from PasswordSetupStep to NostrIdentityStep
  const passwordRef = useRef<string>('');
  const passwordValidationRef = useRef<PasswordValidationResult | null>(null);

  // Callback for PasswordSetupStep to pass password securely
  const handlePasswordReady = useCallback((password: string, validation: PasswordValidationResult) => {
    passwordRef.current = password;
    passwordValidationRef.current = validation;
  }, []);

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Initialize session when modal opens
  useEffect(() => {
    if (isOpen && !isInitialized && !session) {
      startSession(initialMode).then(() => {
        if (mountedRef.current) {
          setIsInitialized(true);
        }
      }).catch((err) => {
        console.error('Failed to start onboarding session:', err);
      });
    }
  }, [isOpen, isInitialized, session, initialMode, startSession]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false);
      setIsClosing(false);
    }
  }, [isOpen]);

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleClose = useCallback(() => {
    if (session?.status === 'active') {
      // Pause session before closing
      pauseSession().then(() => {
        setIsClosing(true);
        onClose();
      }).catch((err) => {
        console.error('Failed to pause session:', err);
        onClose();
      });
    } else {
      setIsClosing(true);
      onClose();
    }
  }, [session, pauseSession, onClose]);

  const handlePauseResume = useCallback(() => {
    if (session?.status === 'active') {
      pauseSession();
    } else if (session?.status === 'paused') {
      resumeSession();
    }
  }, [session, pauseSession, resumeSession]);

  const handleComplete = useCallback(() => {
    completeSession().then(() => {
      if (onComplete) {
        onComplete();
      }
      onClose();
    }).catch((err) => {
      console.error('Failed to complete session:', err);
    });
  }, [completeSession, onComplete, onClose]);

  const handleCancel = useCallback(() => {
    if (confirm('Are you sure you want to cancel this onboarding session? All progress will be lost.')) {
      cancelSession().then(() => {
        onClose();
      }).catch((err) => {
        console.error('Failed to cancel session:', err);
        onClose();
      });
    }
  }, [cancelSession, onClose]);

  const handleStepComplete = useCallback(async (data?: any) => {
    try {
      await completeStep(currentStep, data);
      nextStep();
    } catch (err) {
      console.error('Failed to complete step:', err);
    }
  }, [currentStep, completeStep, nextStep]);

  // ============================================================================
  // Render Helpers
  // ============================================================================

  const getCurrentStepConfig = (): StepConfig | undefined => {
    return STEP_CONFIGS.find(config => config.id === currentStep);
  };

  const getStepProgress = (): number => {
    const currentIndex = STEP_CONFIGS.findIndex(config => config.id === currentStep);
    return ((currentIndex + 1) / STEP_CONFIGS.length) * 100;
  };

  const isStepCompleted = (stepId: OnboardingStep): boolean => {
    return completedSteps.includes(stepId);
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (!isOpen) return null;

  const currentStepConfig = getCurrentStepConfig();
  const stepProgress = getStepProgress();
  const isBatchMode = session?.mode === 'batch';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-purple-900/90 to-blue-900/90 backdrop-blur-sm rounded-2xl border border-white/20 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-900/95 to-blue-900/95 backdrop-blur-sm border-b border-white/20 p-6 z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              {isBatchMode ? (
                <Users className="h-6 w-6 text-purple-300" />
              ) : (
                <User className="h-6 w-6 text-purple-300" />
              )}
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {isBatchMode ? 'Batch Onboarding' : 'Single Participant Onboarding'}
                </h2>
                <p className="text-purple-200 text-sm">
                  {currentStepConfig?.title || 'Loading...'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* Pause/Resume Button */}
              {session && (
                <button
                  onClick={handlePauseResume}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                  title={session.status === 'active' ? 'Pause Session' : 'Resume Session'}
                >
                  {session.status === 'active' ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                </button>
              )}

              {/* Close Button */}
              <button
                onClick={handleClose}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-purple-200">
              <span>Progress</span>
              <span>{Math.round(stepProgress)}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-emerald-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${stepProgress}%` }}
              />
            </div>
          </div>

          {/* Batch Mode: Participant Counter */}
          {isBatchMode && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-purple-200">
                Participant {participantQueue.findIndex(p => p.participantId === currentParticipant?.participantId) + 1} of {totalParticipants}
              </span>
              <span className="text-emerald-300">
                {completedParticipants} completed
              </span>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="p-6">
          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-300 font-medium">Error</p>
                <p className="text-red-200 text-sm">{error}</p>
              </div>
              <button
                onClick={clearError}
                className="text-red-300 hover:text-red-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
              <p className="text-white font-medium">Processing...</p>
            </div>
          )}

          {/* Step Content */}
          {!isLoading && currentStepConfig && (
            <div className="space-y-6">
              {/* Step Header */}
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-500/20 border border-purple-500/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  {currentStepConfig.icon}
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {currentStepConfig.title}
                </h3>
                <p className="text-purple-200">
                  {currentStepConfig.description}
                </p>
              </div>

              {/* Step Components - Wrapped in Suspense for lazy loading */}
              <Suspense fallback={<StepLoadingFallback />}>
                {currentStep === 'intake' && (
                  <ParticipantIntakeStep onNext={nextStep} />
                )}

                {currentStep === 'password' && (
                  <PasswordSetupStep
                    onPasswordReady={handlePasswordReady}
                    onNext={nextStep}
                    onBack={previousStep}
                  />
                )}

                {currentStep === 'identity' && (
                  <NostrIdentityStep
                    password={passwordRef.current}
                    onNext={nextStep}
                    onBack={previousStep}
                  />
                )}

                {/* Conditional OTP Migration Step - only for existing Nostr accounts */}
                {currentStep === 'migration' && currentParticipant?.existingNostrAccount && (
                  <NostrMigrationOTPStep
                    onNext={nextStep}
                    onBack={previousStep}
                    allowSkip={true}
                  />
                )}

                {currentStep === 'nfc' && (
                  <NFCCardRegistrationStep
                    onNext={nextStep}
                    onBack={previousStep}
                    allowSkip={true}
                  />
                )}

                {currentStep === 'lightning' && (
                  <LightningSetupStep
                    onNext={nextStep}
                    onBack={previousStep}
                    allowSkip={true}
                  />
                )}

                {currentStep === 'keet' && (
                  <KeetIdentityStep
                    password={passwordRef.current}
                    onNext={nextStep}
                    onBack={previousStep}
                  />
                )}

                {currentStep === 'backup' && (
                  <OnboardingBackupStep
                    password={passwordRef.current}
                    onNext={nextStep}
                    onBack={previousStep}
                  />
                )}

                {currentStep === 'attestation' && (
                  <AttestationAndPublishStep
                    onNext={nextStep}
                    onBack={previousStep}
                    allowSkip={false}
                  />
                )}
              </Suspense>

              {/* Placeholder for remaining steps */}
              {!['intake', 'password', 'identity', 'migration', 'nfc', 'lightning', 'keet', 'backup', 'attestation'].includes(currentStep) && (
                <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                  <p className="text-white text-center">
                    Step component for <strong>{currentStepConfig.id}</strong> will be implemented in future phases.
                  </p>
                  <p className="text-purple-200 text-sm text-center mt-2">
                    This step is part of the onboarding workflow.
                  </p>
                </div>
              )}

              {/* Current Participant Info (Batch Mode) */}
              {isBatchMode && currentParticipant && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <h4 className="text-white font-medium mb-2">Current Participant</h4>
                  <div className="space-y-1 text-sm">
                    <p className="text-purple-200">
                      <span className="text-white font-medium">Name:</span> {currentParticipant.trueName}
                    </p>
                    {currentParticipant.displayName && (
                      <p className="text-purple-200">
                        <span className="text-white font-medium">Display Name:</span> {currentParticipant.displayName}
                      </p>
                    )}
                    <p className="text-purple-200">
                      <span className="text-white font-medium">Status:</span> {currentParticipant.status}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="sticky bottom-0 bg-gradient-to-r from-purple-900/95 to-blue-900/95 backdrop-blur-sm border-t border-white/20 p-6">
          <div className="flex items-center justify-between">
            {/* Previous Button */}
            <button
              onClick={previousStep}
              disabled={currentStep === 'intake' || isLoading}
              className="flex items-center space-x-2 px-4 py-2 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Previous</span>
            </button>

            {/* Batch Mode: Participant Navigation */}
            {isBatchMode && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={previousParticipant}
                  disabled={!currentParticipant || participantQueue.findIndex(p => p.participantId === currentParticipant?.participantId) === 0}
                  className="px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-white/5 disabled:cursor-not-allowed rounded-lg text-white text-sm transition-colors"
                >
                  ← Previous Participant
                </button>
                <button
                  onClick={nextParticipant}
                  disabled={!currentParticipant || participantQueue.findIndex(p => p.participantId === currentParticipant?.participantId) === participantQueue.length - 1}
                  className="px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-white/5 disabled:cursor-not-allowed rounded-lg text-white text-sm transition-colors"
                >
                  Next Participant →
                </button>
              </div>
            )}

            {/* Next/Complete Button */}
            {currentStep === 'complete' ? (
              <button
                onClick={handleComplete}
                disabled={isLoading}
                className="flex items-center space-x-2 px-6 py-2 bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
              >
                <CheckCircle className="h-4 w-4" />
                <span>Complete Onboarding</span>
              </button>
            ) : (
              <button
                onClick={() => handleStepComplete()}
                disabled={isLoading}
                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Cancel Button */}
          <div className="mt-4 text-center">
            <button
              onClick={handleCancel}
              className="text-red-300 hover:text-red-100 text-sm transition-colors"
            >
              Cancel Onboarding
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhysicalPeerOnboardingModal;

