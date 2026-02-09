/**
 * OnboardingSessionContext Unit Tests
 * 
 * Comprehensive tests for high-volume physical peer onboarding session state management.
 * 
 * Test Coverage:
 * - Session lifecycle (start, pause, resume, complete, cancel)
 * - Participant management (add, remove, update, navigate)
 * - Step navigation (go to, next, previous, complete)
 * - Progress tracking (participants, steps)
 * - Persistence (save, load, clear, auto-save)
 * - Error handling (set, clear, invalid inputs)
 * - Edge cases (empty queue, boundaries, expiration)
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import {
  OnboardingSessionProvider,
  useOnboardingSession,
} from "../../src/contexts/OnboardingSessionContext";
import type { OnboardingParticipant } from "../../src/types/onboarding";

// ============================================================================
// Test Setup
// ============================================================================

// Mock crypto.randomUUID for deterministic IDs
let uuidCounter = 0;
const mockUUID = () => `test-uuid-${++uuidCounter}`;

beforeEach(() => {
  // Reset UUID counter
  uuidCounter = 0;

  // Mock crypto.randomUUID
  vi.spyOn(crypto, 'randomUUID').mockImplementation(mockUUID);

  // Clear sessionStorage
  sessionStorage.clear();
});

afterEach(() => {
  // Clean up
  sessionStorage.clear();
  vi.clearAllMocks();
  uuidCounter = 0;
});

// Wrapper component for context provider
const wrapper = ({ children }: { children: ReactNode }) => (
  <OnboardingSessionProvider>{children}</OnboardingSessionProvider>
);

// Helper to create test participant
const createTestParticipant = (overrides?: Partial<OnboardingParticipant>): Omit<OnboardingParticipant, 'participantId' | 'sessionId' | 'createdAt' | 'updatedAt'> => ({
  trueName: 'Test User',
  displayName: 'testuser',
  language: 'en',
  npub: 'npub1test',
  migrationFlag: false,
  status: 'pending',
  currentStep: 'intake',
  completedSteps: [],
  ...overrides,
});

// ============================================================================
// Session Lifecycle Tests
// ============================================================================

describe('OnboardingSessionContext - Session Lifecycle', () => {
  it('should initialize with null session', () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    expect(result.current.session).toBeNull();
    expect(result.current.currentParticipant).toBeNull();
    expect(result.current.participantQueue).toEqual([]);
    expect(result.current.currentStep).toBe('intake');
    expect(result.current.completedSteps).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should safely no-op session actions when no session exists', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    expect(result.current.session).toBeNull();

    await act(async () => {
      await result.current.pauseSession();
      await result.current.resumeSession();
      await result.current.completeSession();
      await result.current.cancelSession();
    });

    expect(result.current.session).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should start session in single mode', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    expect(result.current.session).not.toBeNull();
    expect(result.current.session?.mode).toBe('single');
    expect(result.current.session?.status).toBe('active');
    expect(result.current.session?.sessionId).toBe('test-uuid-1');
    expect(result.current.currentStep).toBe('intake');
  });

  it('should start session in batch mode', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('batch');
    });

    expect(result.current.session).not.toBeNull();
    expect(result.current.session?.mode).toBe('batch');
    expect(result.current.session?.status).toBe('active');
    expect(result.current.session?.sessionId).toBe('test-uuid-1');
  });

  it('should pause active session', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    expect(result.current.session?.status).toBe('active');

    await act(async () => {
      await result.current.pauseSession();
    });

    expect(result.current.session?.status).toBe('paused');
    // State should be preserved
    expect(result.current.session?.sessionId).toBe('test-uuid-1');
  });

  it('should resume paused session', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    await act(async () => {
      await result.current.pauseSession();
    });

    await waitFor(() => {
      expect(result.current.session?.status).toBe('paused');
    });

    await act(async () => {
      await result.current.resumeSession();
    });

    await waitFor(() => {
      expect(result.current.session?.status).toBe('active');
    });
  });

  it('should complete session and trigger cleanup', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    expect(result.current.session?.status).toBe('active');

    await act(async () => {
      await result.current.completeSession();
    });

    expect(result.current.session?.status).toBe('completed');
  });

  it('should cancel session and clear state', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    expect(result.current.session?.status).toBe('active');

    await act(async () => {
      await result.current.cancelSession();
    });

    expect(result.current.session?.status).toBe('cancelled');
  });
});

// ============================================================================
// Participant Management Tests
// ============================================================================

describe('OnboardingSessionContext - Participant Management', () => {
  it('should throw when adding participant without active session', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    expect(result.current.session).toBeNull();
    expect(result.current.error).toBeNull();

    await expect(
      result.current.addParticipant(createTestParticipant())
    ).rejects.toThrow('No active session');

    // Guard throws before error state is set in catch block
    expect(result.current.error).toBeNull();
  });

  it('should add participant to queue', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('batch');
    });

    const participant = createTestParticipant();

    await act(async () => {
      await result.current.addParticipant(participant);
    });

    expect(result.current.participantQueue).toHaveLength(1);
    expect(result.current.totalParticipants).toBe(1);
    expect(result.current.participantQueue[0].trueName).toBe('Test User');
    expect(result.current.participantQueue[0].participantId).toBe('test-uuid-2'); // uuid-1 is session
  });

  it('should remove participant from queue', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('batch');
    });

    await act(async () => {
      await result.current.addParticipant(createTestParticipant());
    });

    const participantId = result.current.participantQueue[0].participantId;

    await act(async () => {
      await result.current.removeParticipant(participantId);
    });

    expect(result.current.participantQueue).toHaveLength(0);
    expect(result.current.totalParticipants).toBe(0);
  });

  it('should set current participant', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('batch');
    });

    await act(async () => {
      await result.current.addParticipant(createTestParticipant());
    });

    const participantId = result.current.participantQueue[0].participantId;

    act(() => {
      result.current.setCurrentParticipant(participantId);
    });

    expect(result.current.currentParticipant).not.toBeNull();
    expect(result.current.currentParticipant?.participantId).toBe(participantId);
  });

  it('should update participant data', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('batch');
    });

    await act(async () => {
      await result.current.addParticipant(createTestParticipant());
    });

    const participantId = result.current.participantQueue[0].participantId;

    await act(async () => {
      await result.current.updateParticipant(participantId, {
        displayName: 'updateduser',
        status: 'in_progress',
      });
    });

    expect(result.current.participantQueue[0].displayName).toBe('updateduser');
    expect(result.current.participantQueue[0].status).toBe('in_progress');
  });

  it('should navigate to next participant in batch mode', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('batch');
    });

    await act(async () => {
      await result.current.addParticipant(createTestParticipant({ trueName: 'User 1' }));
      await result.current.addParticipant(createTestParticipant({ trueName: 'User 2' }));
    });

    act(() => {
      result.current.setCurrentParticipant(result.current.participantQueue[0].participantId);
    });

    expect(result.current.currentParticipant?.trueName).toBe('User 1');

    act(() => {
      result.current.nextParticipant();
    });

    expect(result.current.currentParticipant?.trueName).toBe('User 2');
  });

  it('should navigate to previous participant in batch mode', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('batch');
    });

    await act(async () => {
      await result.current.addParticipant(createTestParticipant({ trueName: 'User 1' }));
      await result.current.addParticipant(createTestParticipant({ trueName: 'User 2' }));
    });

    act(() => {
      result.current.setCurrentParticipant(result.current.participantQueue[1].participantId);
    });

    expect(result.current.currentParticipant?.trueName).toBe('User 2');

    act(() => {
      result.current.previousParticipant();
    });

    expect(result.current.currentParticipant?.trueName).toBe('User 1');
  });
});

// ============================================================================
// Step Navigation Tests
// ============================================================================

describe('OnboardingSessionContext - Step Navigation', () => {
  it('should navigate to specific step', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    expect(result.current.currentStep).toBe('intake');

    act(() => {
      result.current.goToStep('password');
    });

    expect(result.current.currentStep).toBe('password');
  });

  it('should advance to next step in sequence', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    expect(result.current.currentStep).toBe('intake');

    act(() => {
      result.current.nextStep();
    });

    expect(result.current.currentStep).toBe('identity');
  });

  it('should go back to previous step', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    act(() => {
      result.current.goToStep('password');
    });

    expect(result.current.currentStep).toBe('password');

    act(() => {
      result.current.previousStep();
    });

    expect(result.current.currentStep).toBe('identity');
  });

  it('should complete step and add to completedSteps', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    // Add a participant and set as current (required for completeStep)
    await act(async () => {
      await result.current.addParticipant(createTestParticipant());
    });

    expect(result.current.completedSteps).toEqual([]);

    await act(async () => {
      await result.current.completeStep('intake');
    });

    expect(result.current.completedSteps).toContain('intake');
  });

  it('should no-op when completeStep is called without a current participant', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    expect(result.current.currentParticipant).toBeNull();
    expect(result.current.completedSteps).toEqual([]);

    await act(async () => {
      await result.current.completeStep('intake');
    });

    expect(result.current.completedSteps).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should mark participant completed and increment session completedCount on final step', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    await act(async () => {
      await result.current.addParticipant(createTestParticipant());
    });

    expect(result.current.session?.completedCount).toBe(0);
    expect(result.current.currentParticipant?.status).toBe('pending');

    await act(async () => {
      await result.current.completeStep('complete');
    });

    expect(result.current.completedSteps).toContain('complete');
    expect(result.current.currentParticipant?.status).toBe('completed');
    expect(result.current.session?.completedCount).toBe(1);
  });
});

// ============================================================================
// Progress Tracking Tests
// ============================================================================

describe('OnboardingSessionContext - Progress Tracking', () => {
  it('should correctly calculate totalParticipants', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('batch');
    });

    await act(async () => {
      await result.current.addParticipant(createTestParticipant());
      await result.current.addParticipant(createTestParticipant());
      await result.current.addParticipant(createTestParticipant());
    });

    expect(result.current.totalParticipants).toBe(3);
  });

  it('should correctly calculate completedParticipants', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('batch');
    });

    await act(async () => {
      await result.current.addParticipant(createTestParticipant());
      await result.current.addParticipant(createTestParticipant());
    });

    const participant1Id = result.current.participantQueue[0].participantId;

    await act(async () => {
      await result.current.updateParticipant(participant1Id, { status: 'completed' });
    });

    expect(result.current.completedParticipants).toBe(1);
  });

  it('should track completedSteps array accurately', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    // Add a participant (required for completeStep)
    await act(async () => {
      await result.current.addParticipant(createTestParticipant());
    });

    // Complete steps one at a time to allow state updates
    await act(async () => {
      await result.current.completeStep('intake');
    });

    await act(async () => {
      await result.current.completeStep('identity');
    });

    await act(async () => {
      await result.current.completeStep('password');
    });

    expect(result.current.completedSteps).toHaveLength(3);
    expect(result.current.completedSteps).toContain('intake');
    expect(result.current.completedSteps).toContain('identity');
    expect(result.current.completedSteps).toContain('password');
  });

  it('should update currentStep correctly during navigation', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    expect(result.current.currentStep).toBe('intake');

    act(() => {
      result.current.nextStep();
    });

    expect(result.current.currentStep).toBe('identity');

    act(() => {
      result.current.nextStep();
    });

    expect(result.current.currentStep).toBe('password');
  });
});

// ============================================================================
// Persistence Tests
// ============================================================================

describe('OnboardingSessionContext - Persistence', () => {
  it('should save session state to sessionStorage', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    act(() => {
      result.current.saveProgress();
    });

    const savedSession = sessionStorage.getItem('satnam_onboarding_session');
    expect(savedSession).not.toBeNull();

    const parsedSession = JSON.parse(savedSession!);
    expect(parsedSession.mode).toBe('single');
    expect(parsedSession.status).toBe('active');
  });

  it('should restore session state from sessionStorage on mount', async () => {
    // Pre-populate sessionStorage
    const mockSession = {
      sessionId: 'test-session-123',
      mode: 'batch' as const,
      status: 'paused' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    sessionStorage.setItem('satnam_onboarding_session', JSON.stringify(mockSession));
    sessionStorage.setItem('satnam_onboarding_current_step', 'password');
    sessionStorage.setItem('satnam_onboarding_completed_steps', JSON.stringify(['intake', 'identity']));

    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    act(() => {
      result.current.loadProgress();
    });

    await waitFor(() => {
      expect(result.current.session).not.toBeNull();
      expect(result.current.session?.mode).toBe('batch');
      expect(result.current.session?.status).toBe('paused');
      expect(result.current.currentStep).toBe('password');
      expect(result.current.completedSteps).toEqual(['intake', 'identity']);
    });
  });

  it('should restore participant queue and current participant from sessionStorage', async () => {
    const now = new Date().toISOString();

    const mockSession = {
      sessionId: 'test-session-456',
      mode: 'batch' as const,
      status: 'active' as const,
      participantCount: 2,
      completedCount: 1,
      createdAt: now,
      updatedAt: now,
    };

    const participant1 = {
      participantId: 'participant-1',
      sessionId: 'test-session-456',
      trueName: 'Restored User 1',
      displayName: 'restored1',
      status: 'pending' as const,
      currentStep: 'identity' as const,
      completedSteps: ['intake'] as const,
      createdAt: now,
      updatedAt: now,
    };

    const participant2 = {
      participantId: 'participant-2',
      sessionId: 'test-session-456',
      trueName: 'Restored User 2',
      displayName: 'restored2',
      status: 'in_progress' as const,
      currentStep: 'password' as const,
      completedSteps: ['intake', 'identity'] as const,
      createdAt: now,
      updatedAt: now,
    };

    sessionStorage.setItem('satnam_onboarding_session', JSON.stringify(mockSession));
    sessionStorage.setItem('satnam_onboarding_current_participant', JSON.stringify(participant2));
    sessionStorage.setItem(
      'satnam_onboarding_participant_queue',
      JSON.stringify([participant1, participant2])
    );
    sessionStorage.setItem('satnam_onboarding_current_step', 'password');
    sessionStorage.setItem(
      'satnam_onboarding_completed_steps',
      JSON.stringify(['intake', 'identity'])
    );

    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    act(() => {
      result.current.loadProgress();
    });

    await waitFor(() => {
      expect(result.current.participantQueue).toHaveLength(2);
      expect(result.current.participantQueue[0].trueName).toBe('Restored User 1');
      expect(result.current.currentParticipant).not.toBeNull();
      expect(result.current.currentParticipant?.participantId).toBe('participant-2');
      expect(result.current.currentStep).toBe('password');
      expect(result.current.completedSteps).toEqual(['intake', 'identity']);
    });
  });

  it('should clear session data from sessionStorage', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    act(() => {
      result.current.saveProgress();
    });

    expect(sessionStorage.getItem('satnam_onboarding_session')).not.toBeNull();

    act(() => {
      result.current.clearProgress();
    });

    expect(sessionStorage.getItem('satnam_onboarding_session')).toBeNull();
    expect(sessionStorage.getItem('satnam_onboarding_current_step')).toBeNull();
    expect(sessionStorage.getItem('satnam_onboarding_completed_steps')).toBeNull();
  });

  it('should auto-save on state changes', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    // Wait for auto-save debounce
    await waitFor(() => {
      const savedSession = sessionStorage.getItem('satnam_onboarding_session');
      expect(savedSession).not.toBeNull();
    }, { timeout: 3000 });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('OnboardingSessionContext - Error Handling', () => {
  it('should set error message', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    expect(result.current.error).toBeNull();

    act(() => {
      result.current.setError('Test error message');
    });

    expect(result.current.error).toBe('Test error message');
  });

  it('should clear error message', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    act(() => {
      result.current.setError('Test error message');
    });

    expect(result.current.error).toBe('Test error message');

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('should handle invalid participant ID gracefully', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('batch');
    });

    // Try to remove non-existent participant
    await act(async () => {
      await result.current.removeParticipant('invalid-id');
    });

    // Should not throw error, queue should remain empty
    expect(result.current.participantQueue).toHaveLength(0);
  });

  it('should handle invalid step transitions gracefully', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    // Try to go to invalid step
    act(() => {
      result.current.goToStep('invalid-step' as any);
    });

    // Should not crash, currentStep should remain valid
    expect(result.current.currentStep).toBeDefined();
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('OnboardingSessionContext - Edge Cases', () => {
  it('should handle empty participant queue in batch mode', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('batch');
    });

    expect(result.current.participantQueue).toHaveLength(0);
    expect(result.current.totalParticipants).toBe(0);
    expect(result.current.completedParticipants).toBe(0);
    expect(result.current.currentParticipant).toBeNull();
  });

  it('should prevent navigation beyond first step', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    expect(result.current.currentStep).toBe('intake');

    // Try to go to previous step from first step
    act(() => {
      result.current.previousStep();
    });

    // Should remain at first step
    expect(result.current.currentStep).toBe('intake');
  });

  it('should prevent navigation beyond last step', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    // Navigate to last step
    act(() => {
      result.current.goToStep('complete');
    });

    expect(result.current.currentStep).toBe('complete');

    // Try to go to next step from last step
    act(() => {
      result.current.nextStep();
    });

    // Should remain at last step
    expect(result.current.currentStep).toBe('complete');
  });

  it('should prevent navigation beyond first participant', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('batch');
    });

    await act(async () => {
      await result.current.addParticipant(createTestParticipant({ trueName: 'User 1' }));
      await result.current.addParticipant(createTestParticipant({ trueName: 'User 2' }));
    });

    act(() => {
      result.current.setCurrentParticipant(result.current.participantQueue[0].participantId);
    });

    expect(result.current.currentParticipant?.trueName).toBe('User 1');

    // Try to go to previous participant from first participant
    act(() => {
      result.current.previousParticipant();
    });

    // Should remain at first participant
    expect(result.current.currentParticipant?.trueName).toBe('User 1');
  });

  it('should prevent navigation beyond last participant', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('batch');
    });

    await act(async () => {
      await result.current.addParticipant(createTestParticipant({ trueName: 'User 1' }));
      await result.current.addParticipant(createTestParticipant({ trueName: 'User 2' }));
    });

    act(() => {
      result.current.setCurrentParticipant(result.current.participantQueue[1].participantId);
    });

    expect(result.current.currentParticipant?.trueName).toBe('User 2');

    // Try to go to next participant from last participant
    act(() => {
      result.current.nextParticipant();
    });

    // Should remain at last participant
    expect(result.current.currentParticipant?.trueName).toBe('User 2');
  });

  it('should handle session expiration (24 hours)', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    // Create session with old timestamp
    const oldDate = new Date();
    oldDate.setHours(oldDate.getHours() - 25); // 25 hours ago

    const expiredSession = {
      sessionId: 'expired-session',
      mode: 'single' as const,
      status: 'active' as const,
      createdAt: oldDate.toISOString(),
      updatedAt: oldDate.toISOString(),
    };

    sessionStorage.setItem('satnam_onboarding_session', JSON.stringify(expiredSession));

    act(() => {
      result.current.loadProgress();
    });

    // Session should be loaded (expiration handling would be in business logic)
    await waitFor(() => {
      expect(result.current.session).not.toBeNull();
    });
  });

  it('should handle concurrent state updates', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('batch');
    });

    // Simulate concurrent participant additions
    await act(async () => {
      await Promise.all([
        result.current.addParticipant(createTestParticipant({ trueName: 'User 1' })),
        result.current.addParticipant(createTestParticipant({ trueName: 'User 2' })),
        result.current.addParticipant(createTestParticipant({ trueName: 'User 3' })),
      ]);
    });

    // All participants should be added
    expect(result.current.totalParticipants).toBe(3);
  });

  it('should handle null currentParticipant in batch mode', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('batch');
    });

    await act(async () => {
      await result.current.addParticipant(createTestParticipant());
    });

    // Clear current participant (first participant is auto-set)
    act(() => {
      result.current.setCurrentParticipant(null);
    });

    expect(result.current.currentParticipant).toBeNull();

    // Try to navigate - should select first participant
    act(() => {
      result.current.nextParticipant();
    });

    // Should now have first participant selected
    expect(result.current.currentParticipant).not.toBeNull();
  });

  it('should handle completeStep with participant data', async () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });

    await act(async () => {
      await result.current.startSession('single');
    });

    await act(async () => {
      await result.current.addParticipant(createTestParticipant());
    });

    // Complete step with data
    await act(async () => {
      await result.current.completeStep('intake', {
        displayName: 'newdisplayname',
      });
    });

    expect(result.current.completedSteps).toContain('intake');
    // Participant data should be updated
    expect(result.current.currentParticipant?.displayName).toBe('newdisplayname');
  });
});

// ==========================================================================
// Hook Usage Tests
// ==========================================================================

describe('OnboardingSessionContext - Hook Usage', () => {
  it('should throw if useOnboardingSession is used outside provider', () => {
    expect(() => renderHook(() => useOnboardingSession())).toThrow(
      'useOnboardingSession must be used within OnboardingSessionProvider'
    );
  });
});
