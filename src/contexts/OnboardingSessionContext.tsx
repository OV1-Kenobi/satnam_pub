/**
 * Onboarding Session Context
 * @description Context for managing high-volume physical peer onboarding sessions
 * 
 * Features:
 * - Session state management (active participant, step progression)
 * - Batch mode queue management
 * - Progress tracking and persistence (sessionStorage)
 * - Error recovery and resume capability
 * - Zero-knowledge security principles
 * 
 * ✅ Master Context Compliance: Contexts separated from React components
 * ✅ Privacy-First: Ephemeral secret handling, no plaintext passwords/PINs/nsec
 */

import React, { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  OnboardingMode,
  OnboardingParticipant,
  OnboardingSession,
  OnboardingSessionStatus,
  OnboardingStep,
} from '../types/onboarding';
import { createDebouncedFunction } from '../lib/onboarding/debounced-persistence';

// ============================================================================
// Context Type Definition
// ============================================================================

export interface OnboardingSessionContextType {
  // Session state
  session: OnboardingSession | null;
  currentParticipant: OnboardingParticipant | null;
  participantQueue: OnboardingParticipant[];

  // Progress tracking
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  totalParticipants: number;
  completedParticipants: number;

  // Loading and error states
  isLoading: boolean;
  error: string | null;

  // Session actions
  startSession: (mode: OnboardingMode) => Promise<void>;
  pauseSession: () => Promise<void>;
  resumeSession: () => Promise<void>;
  completeSession: () => Promise<void>;
  cancelSession: () => Promise<void>;

  // Participant management
  addParticipant: (participant: Omit<OnboardingParticipant, 'participantId' | 'sessionId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  removeParticipant: (participantId: string) => Promise<void>;
  setCurrentParticipant: (participantId: string | null) => void;
  updateParticipant: (participantId: string, updates: Partial<OnboardingParticipant>) => Promise<void>;

  // Step navigation
  goToStep: (step: OnboardingStep) => void;
  nextStep: () => void;
  previousStep: () => void;
  completeStep: (step: OnboardingStep, data?: Partial<OnboardingParticipant>) => Promise<void>;

  // Queue management (batch mode)
  nextParticipant: () => void;
  previousParticipant: () => void;

  // Error handling
  clearError: () => void;
  setError: (error: string) => void;

  // Persistence
  saveProgress: () => void;
  loadProgress: () => void;
  clearProgress: () => void;
}

// ============================================================================
// Context Creation
// ============================================================================

// Use React.createContext instead of destructured createContext to prevent TDZ errors
const OnboardingSessionContext = React.createContext<OnboardingSessionContextType | null>(null);

export const CONTEXT_NAME = 'OnboardingSessionContext';

// ============================================================================
// Session Storage Keys
// ============================================================================

const STORAGE_KEYS = {
  SESSION: 'satnam_onboarding_session',
  CURRENT_PARTICIPANT: 'satnam_onboarding_current_participant',
  PARTICIPANT_QUEUE: 'satnam_onboarding_participant_queue',
  CURRENT_STEP: 'satnam_onboarding_current_step',
  COMPLETED_STEPS: 'satnam_onboarding_completed_steps',
} as const;

// ============================================================================
// Step Order Definition
// ============================================================================

const STEP_ORDER: OnboardingStep[] = [
  'intake',
  'identity',
  'password',
  'migration',
  'nfc',
  'lightning',
  'keet',
  'backup',
  'attestation',
  'complete',
];

// ============================================================================
// Provider Component
// ============================================================================

export interface OnboardingSessionProviderProps {
  children: ReactNode;
}

export function OnboardingSessionProvider({ children }: OnboardingSessionProviderProps) {
  // State management
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [currentParticipant, setCurrentParticipantState] = useState<OnboardingParticipant | null>(null);
  const [participantQueue, setParticipantQueue] = useState<OnboardingParticipant[]>([]);
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('intake');
  const [completedSteps, setCompletedSteps] = useState<OnboardingStep[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);

  // Computed values
  const totalParticipants = participantQueue.length;
  const completedParticipants = participantQueue.filter(p => p.status === 'completed').length;

  // ============================================================================
  // Persistence Functions (with debouncing for performance - Phase 11)
  // ============================================================================

  // Immediate save function (no debouncing)
  const saveProgressImmediate = useCallback(() => {
    try {
      if (session) {
        sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
      }
      if (currentParticipant) {
        sessionStorage.setItem(STORAGE_KEYS.CURRENT_PARTICIPANT, JSON.stringify(currentParticipant));
      }
      if (participantQueue.length > 0) {
        sessionStorage.setItem(STORAGE_KEYS.PARTICIPANT_QUEUE, JSON.stringify(participantQueue));
      }
      sessionStorage.setItem(STORAGE_KEYS.CURRENT_STEP, currentStep);
      sessionStorage.setItem(STORAGE_KEYS.COMPLETED_STEPS, JSON.stringify(completedSteps));
    } catch (err) {
      console.error('Failed to save onboarding progress:', err);
    }
  }, [session, currentParticipant, participantQueue, currentStep, completedSteps]);

  // Debounced save function (300ms delay to batch rapid state changes)
  const debouncedSaveRef = useRef(createDebouncedFunction(async () => {
    saveProgressImmediate();
  }, 300));

  // Public saveProgress function (uses debouncing)
  const saveProgress = useCallback(() => {
    debouncedSaveRef.current();
  }, []);

  // Flush debounced saves on unmount to ensure final state is persisted
  useEffect(() => {
    return () => {
      debouncedSaveRef.current.flush();
    };
  }, []);

  const loadProgress = useCallback(() => {
    try {
      const savedSession = sessionStorage.getItem(STORAGE_KEYS.SESSION);
      const savedParticipant = sessionStorage.getItem(STORAGE_KEYS.CURRENT_PARTICIPANT);
      const savedQueue = sessionStorage.getItem(STORAGE_KEYS.PARTICIPANT_QUEUE);
      const savedStep = sessionStorage.getItem(STORAGE_KEYS.CURRENT_STEP);
      const savedCompletedSteps = sessionStorage.getItem(STORAGE_KEYS.COMPLETED_STEPS);

      if (savedSession) {
        setSession(JSON.parse(savedSession));
      }
      if (savedParticipant) {
        setCurrentParticipantState(JSON.parse(savedParticipant));
      }
      if (savedQueue) {
        setParticipantQueue(JSON.parse(savedQueue));
      }
      if (savedStep) {
        setCurrentStep(savedStep as OnboardingStep);
      }
      if (savedCompletedSteps) {
        setCompletedSteps(JSON.parse(savedCompletedSteps));
      }
    } catch (err) {
      console.error('Failed to load onboarding progress:', err);
    }
  }, []);

  const clearProgress = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEYS.SESSION);
      sessionStorage.removeItem(STORAGE_KEYS.CURRENT_PARTICIPANT);
      sessionStorage.removeItem(STORAGE_KEYS.PARTICIPANT_QUEUE);
      sessionStorage.removeItem(STORAGE_KEYS.CURRENT_STEP);
      sessionStorage.removeItem(STORAGE_KEYS.COMPLETED_STEPS);
    } catch (err) {
      console.error('Failed to clear onboarding progress:', err);
    }
  }, []);

  // Auto-save progress when state changes
  useEffect(() => {
    if (session) {
      saveProgress();
    }
  }, [session, currentParticipant, participantQueue, currentStep, completedSteps, saveProgress]);

  // Load progress on mount
  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  // ============================================================================
  // Session Management Functions
  // ============================================================================

  const startSession = useCallback(async (mode: OnboardingMode) => {
    setIsLoading(true);
    setErrorState(null);

    try {
      // Create new session
      const newSession: OnboardingSession = {
        sessionId: crypto.randomUUID(),
        coordinatorUserId: '', // Will be set by API
        mode,
        status: 'active',
        participantCount: 0,
        completedCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };

      setSession(newSession);
      setCurrentStep('intake');
      setCompletedSteps([]);
      setParticipantQueue([]);
      setCurrentParticipantState(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start session';
      setErrorState(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const pauseSession = useCallback(async () => {
    if (!session) return;

    setIsLoading(true);
    try {
      const updatedSession: OnboardingSession = {
        ...session,
        status: 'paused',
        updatedAt: new Date(),
      };
      setSession(updatedSession);
      saveProgress();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to pause session';
      setErrorState(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [session, saveProgress]);

  const resumeSession = useCallback(async () => {
    if (!session) return;

    setIsLoading(true);
    try {
      const updatedSession: OnboardingSession = {
        ...session,
        status: 'active',
        updatedAt: new Date(),
      };
      setSession(updatedSession);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to resume session';
      setErrorState(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  const completeSession = useCallback(async () => {
    if (!session) return;

    setIsLoading(true);
    try {
      const updatedSession: OnboardingSession = {
        ...session,
        status: 'completed',
        updatedAt: new Date(),
      };
      setSession(updatedSession);
      clearProgress();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to complete session';
      setErrorState(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [session, clearProgress]);

  const cancelSession = useCallback(async () => {
    if (!session) return;

    setIsLoading(true);
    try {
      const updatedSession: OnboardingSession = {
        ...session,
        status: 'cancelled',
        updatedAt: new Date(),
      };
      setSession(updatedSession);
      clearProgress();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel session';
      setErrorState(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [session, clearProgress]);

  // ============================================================================
  // Participant Management Functions
  // ============================================================================

  const addParticipant = useCallback(async (
    participantData: Omit<OnboardingParticipant, 'participantId' | 'sessionId' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!session) {
      throw new Error('No active session');
    }

    setIsLoading(true);
    try {
      const newParticipant: OnboardingParticipant = {
        ...participantData,
        participantId: crypto.randomUUID(),
        sessionId: session.sessionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setParticipantQueue(prev => [...prev, newParticipant]);

      // Update session participant count
      const updatedSession: OnboardingSession = {
        ...session,
        participantCount: session.participantCount + 1,
        updatedAt: new Date(),
      };
      setSession(updatedSession);

      // If this is the first participant, set as current
      if (participantQueue.length === 0) {
        setCurrentParticipantState(newParticipant);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add participant';
      setErrorState(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [session, participantQueue.length]);

  const removeParticipant = useCallback(async (participantId: string) => {
    if (!session) return;

    setIsLoading(true);
    try {
      setParticipantQueue(prev => prev.filter(p => p.participantId !== participantId));

      // Update session participant count
      const updatedSession: OnboardingSession = {
        ...session,
        participantCount: Math.max(0, session.participantCount - 1),
        updatedAt: new Date(),
      };
      setSession(updatedSession);

      // If removing current participant, move to next
      if (currentParticipant?.participantId === participantId) {
        const currentIndex = participantQueue.findIndex(p => p.participantId === participantId);
        const nextParticipant = participantQueue[currentIndex + 1] || participantQueue[currentIndex - 1] || null;
        setCurrentParticipantState(nextParticipant);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove participant';
      setErrorState(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [session, currentParticipant, participantQueue]);

  const setCurrentParticipant = useCallback((participantId: string | null) => {
    if (participantId === null) {
      setCurrentParticipantState(null);
      return;
    }

    const participant = participantQueue.find(p => p.participantId === participantId);
    if (participant) {
      setCurrentParticipantState(participant);
      setCurrentStep(participant.currentStep);
      setCompletedSteps(participant.completedSteps);
    }
  }, [participantQueue]);

  const updateParticipant = useCallback(async (
    participantId: string,
    updates: Partial<OnboardingParticipant>
  ) => {
    setIsLoading(true);
    try {
      setParticipantQueue(prev => prev.map(p =>
        p.participantId === participantId
          ? { ...p, ...updates, updatedAt: new Date() }
          : p
      ));

      // Update current participant if it's the one being updated
      if (currentParticipant?.participantId === participantId) {
        setCurrentParticipantState(prev =>
          prev ? { ...prev, ...updates, updatedAt: new Date() } : null
        );
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update participant';
      setErrorState(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [currentParticipant]);

  // ============================================================================
  // Step Navigation Functions
  // ============================================================================

  const goToStep = useCallback((step: OnboardingStep) => {
    setCurrentStep(step);

    // Update current participant's step
    if (currentParticipant) {
      updateParticipant(currentParticipant.participantId, { currentStep: step });
    }
  }, [currentParticipant, updateParticipant]);

  const nextStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex < STEP_ORDER.length - 1) {
      const nextStepValue = STEP_ORDER[currentIndex + 1];
      goToStep(nextStepValue);
    }
  }, [currentStep, goToStep]);

  const previousStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex > 0) {
      const prevStepValue = STEP_ORDER[currentIndex - 1];
      goToStep(prevStepValue);
    }
  }, [currentStep, goToStep]);

  const completeStep = useCallback(async (
    step: OnboardingStep,
    data?: Partial<OnboardingParticipant>
  ) => {
    if (!currentParticipant) return;

    setIsLoading(true);
    try {
      // Add step to completed steps if not already there
      const newCompletedSteps = completedSteps.includes(step)
        ? completedSteps
        : [...completedSteps, step];

      setCompletedSteps(newCompletedSteps);

      // Update participant with step completion and any additional data
      await updateParticipant(currentParticipant.participantId, {
        ...data,
        completedSteps: newCompletedSteps,
      });

      // If this is the final step, mark participant as completed
      if (step === 'complete') {
        await updateParticipant(currentParticipant.participantId, {
          status: 'completed',
        });

        // Update session completed count
        if (session) {
          const updatedSession: OnboardingSession = {
            ...session,
            completedCount: session.completedCount + 1,
            updatedAt: new Date(),
          };
          setSession(updatedSession);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to complete step';
      setErrorState(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [currentParticipant, completedSteps, session, updateParticipant]);

  // ============================================================================
  // Queue Management Functions (Batch Mode)
  // ============================================================================

  const nextParticipant = useCallback(() => {
    if (!currentParticipant) {
      // If no current participant, select first in queue
      if (participantQueue.length > 0) {
        setCurrentParticipant(participantQueue[0].participantId);
      }
      return;
    }

    const currentIndex = participantQueue.findIndex(
      p => p.participantId === currentParticipant.participantId
    );

    if (currentIndex < participantQueue.length - 1) {
      const nextPart = participantQueue[currentIndex + 1];
      setCurrentParticipant(nextPart.participantId);
    }
  }, [currentParticipant, participantQueue, setCurrentParticipant]);

  const previousParticipant = useCallback(() => {
    if (!currentParticipant) return;

    const currentIndex = participantQueue.findIndex(
      p => p.participantId === currentParticipant.participantId
    );

    if (currentIndex > 0) {
      const prevPart = participantQueue[currentIndex - 1];
      setCurrentParticipant(prevPart.participantId);
    }
  }, [currentParticipant, participantQueue, setCurrentParticipant]);

  // ============================================================================
  // Error Handling Functions
  // ============================================================================

  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  const setError = useCallback((error: string) => {
    setErrorState(error);
  }, []);

  // ============================================================================
  // Context Value
  // ============================================================================

  const contextValue: OnboardingSessionContextType = {
    // Session state
    session,
    currentParticipant,
    participantQueue,

    // Progress tracking
    currentStep,
    completedSteps,
    totalParticipants,
    completedParticipants,

    // Loading and error states
    isLoading,
    error,

    // Session actions
    startSession,
    pauseSession,
    resumeSession,
    completeSession,
    cancelSession,

    // Participant management
    addParticipant,
    removeParticipant,
    setCurrentParticipant,
    updateParticipant,

    // Step navigation
    goToStep,
    nextStep,
    previousStep,
    completeStep,

    // Queue management
    nextParticipant,
    previousParticipant,

    // Error handling
    clearError,
    setError,

    // Persistence
    saveProgress,
    loadProgress,
    clearProgress,
  };

  return (
    <OnboardingSessionContext.Provider value={contextValue}>
      {children}
    </OnboardingSessionContext.Provider>
  );
}

// ============================================================================
// Hook to use Onboarding Session Context
// ============================================================================

export function useOnboardingSession(): OnboardingSessionContextType {
  const context = useContext(OnboardingSessionContext);

  if (context === null) {
    throw new Error('useOnboardingSession must be used within OnboardingSessionProvider');
  }

  return context;
}

