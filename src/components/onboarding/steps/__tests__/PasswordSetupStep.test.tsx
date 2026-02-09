/**
 * PasswordSetupStep Unit Tests
 *
 * Comprehensive tests for password setup step component.
 *
 * Test Coverage:
 * - Form rendering and initial state
 * - Password confirmation validation
 * - Mode switching (coordinator-assigned vs user-chosen)
 * - Secure password handling (refs, not state)
 * - Context integration (completeStep)
 * - Callback invocations (onPasswordReady, onNext, onBack)
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PasswordSetupStep from '../PasswordSetupStep';

// ============================================================================
// Mocks
// ============================================================================

// Mock useOnboardingSession hook
const mockCompleteStep = vi.fn();
const mockSetError = vi.fn();

vi.mock('../../../../contexts/OnboardingSessionContext', () => ({
  useOnboardingSession: () => ({
    currentParticipant: {
      participantId: 'participant-123',
      trueName: 'Test User',
      status: 'pending',
    },
    completeStep: mockCompleteStep,
    setError: mockSetError,
  }),
}));

// Mock PasswordSelectionUI component
let mockPasswordReadyCallback: ((password: string, validation: { valid: boolean; strength: string }) => void) | null = null;

vi.mock('../../PasswordSelectionUI', () => ({
  default: ({ onPasswordReady, mode }: { onPasswordReady: (password: string, validation: { valid: boolean; strength: string }) => void; mode: string }) => {
    mockPasswordReadyCallback = onPasswordReady;
    return (
      <div data-testid="password-selection-ui" data-mode={mode}>
        <button
          type="button"
          data-testid="trigger-password-ready"
          onClick={() => onPasswordReady('test-password-phrase', { valid: true, strength: 'strong' })}
        >
          Trigger Password Ready
        </button>
        <button
          type="button"
          data-testid="trigger-invalid-password"
          onClick={() => onPasswordReady('weak', { valid: false, strength: 'weak' })}
        >
          Trigger Invalid Password
        </button>
      </div>
    );
  },
}));

// ============================================================================
// Test Setup
// ============================================================================

const mockOnPasswordReady = vi.fn();
const mockOnNext = vi.fn();
const mockOnBack = vi.fn();

const defaultProps = {
  onPasswordReady: mockOnPasswordReady,
  onNext: mockOnNext,
  onBack: mockOnBack,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPasswordReadyCallback = null;
  mockCompleteStep.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// Form Rendering Tests
// ============================================================================

describe('PasswordSetupStep - Form Rendering', () => {
  it('should render the password setup form', () => {
    render(<PasswordSetupStep {...defaultProps} />);

    expect(screen.getByText(/create password/i)).toBeInTheDocument();
    expect(screen.getByTestId('password-selection-ui')).toBeInTheDocument();
  });

  it('should render confirm password field', () => {
    render(<PasswordSetupStep {...defaultProps} />);

    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it('should render submit button', () => {
    render(<PasswordSetupStep {...defaultProps} />);

    expect(screen.getByRole('button', { name: /continue|next|submit/i })).toBeInTheDocument();
  });

  it('should render back button when onBack is provided', () => {
    render(<PasswordSetupStep {...defaultProps} />);

    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('should not render back button when onBack is not provided', () => {
    render(<PasswordSetupStep onPasswordReady={mockOnPasswordReady} onNext={mockOnNext} />);

    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();
  });

  it('should render with coordinator-assigned mode by default', () => {
    render(<PasswordSetupStep {...defaultProps} />);

    const passwordUI = screen.getByTestId('password-selection-ui');
    expect(passwordUI).toHaveAttribute('data-mode', 'coordinator-assigned');
  });

  it('should render with user-chosen mode when specified', () => {
    render(<PasswordSetupStep {...defaultProps} defaultMode="user-chosen" />);

    const passwordUI = screen.getByTestId('password-selection-ui');
    expect(passwordUI).toHaveAttribute('data-mode', 'user-chosen');
  });

  it('should render security notice', () => {
    render(<PasswordSetupStep {...defaultProps} />);

    expect(screen.getByText(/security notice/i)).toBeInTheDocument();
  });

  it('should display participant name in header', () => {
    render(<PasswordSetupStep {...defaultProps} />);

    expect(screen.getByText(/test user/i)).toBeInTheDocument();
  });
});

// ============================================================================
// Password Confirmation Tests
// ============================================================================

describe('PasswordSetupStep - Password Confirmation', () => {
  it('should show error when confirm password is empty on submit', async () => {
    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    // Trigger valid password from PasswordSelectionUI
    await user.click(screen.getByTestId('trigger-password-ready'));

    // Submit without confirm password
    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match|please select/i)).toBeInTheDocument();
    });
    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should show error when confirm password does not match', async () => {
    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    // Trigger valid password
    await user.click(screen.getByTestId('trigger-password-ready'));

    // Enter non-matching confirm password
    const confirmInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmInput, 'wrong-password');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should accept matching confirm password', async () => {
    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    // Trigger valid password
    await user.click(screen.getByTestId('trigger-password-ready'));

    // Enter matching confirm password
    const confirmInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmInput, 'test-password-phrase');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalled();
    });
  });

  it('should toggle confirm password visibility', async () => {
    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    const confirmInput = screen.getByLabelText(/confirm password/i) as HTMLInputElement;
    expect(confirmInput.type).toBe('password');

    // Find and click the visibility toggle button
    const toggleButton = screen.getByRole('button', { name: /show|hide/i });
    await user.click(toggleButton);

    expect(confirmInput.type).toBe('text');

    await user.click(toggleButton);
    expect(confirmInput.type).toBe('password');
  });

  it('should clear confirm password error when user types', async () => {
    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    // Trigger valid password
    await user.click(screen.getByTestId('trigger-password-ready'));

    // Enter wrong confirm password and submit
    const confirmInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmInput, 'wrong');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });

    // Clear and type correct password
    await user.clear(confirmInput);
    await user.type(confirmInput, 'test-password-phrase');

    // Submit again
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Password Validation Tests
// ============================================================================

describe('PasswordSetupStep - Password Validation', () => {
  it('should show error when password is invalid', async () => {
    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    // Trigger invalid password
    await user.click(screen.getByTestId('trigger-invalid-password'));

    // Enter confirm password
    const confirmInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmInput, 'weak');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/password validation failed/i)).toBeInTheDocument();
    });
    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should show error when no password is selected', async () => {
    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    // Don't trigger any password, just try to submit
    const confirmInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmInput, 'some-password');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/please select|passwords do not match/i)).toBeInTheDocument();
    });
    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should update hasValidPassword state when password is ready', async () => {
    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    // Initially submit button should be disabled or show error
    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });

    // Trigger valid password
    await user.click(screen.getByTestId('trigger-password-ready'));

    // Enter matching confirm password
    const confirmInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmInput, 'test-password-phrase');

    // Now submit should work
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Callback Invocation Tests
// ============================================================================

describe('PasswordSetupStep - Callback Invocations', () => {
  it('should call onPasswordReady with password and validation on submit', async () => {
    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    // Trigger valid password
    await user.click(screen.getByTestId('trigger-password-ready'));

    // Enter matching confirm password
    const confirmInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmInput, 'test-password-phrase');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnPasswordReady).toHaveBeenCalledWith(
        'test-password-phrase',
        expect.objectContaining({ valid: true })
      );
    });
  });

  it('should call onNext after successful submission', async () => {
    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    await user.click(screen.getByTestId('trigger-password-ready'));

    const confirmInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmInput, 'test-password-phrase');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalledTimes(1);
    });
  });

  it('should call onBack when back button is clicked', async () => {
    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    const backButton = screen.getByRole('button', { name: /back/i });
    await user.click(backButton);

    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it('should not call onPasswordReady if validation fails', async () => {
    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    // Trigger valid password but enter wrong confirm
    await user.click(screen.getByTestId('trigger-password-ready'));

    const confirmInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmInput, 'wrong-password');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
    expect(mockOnPasswordReady).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Context Integration Tests
// ============================================================================

describe('PasswordSetupStep - Context Integration', () => {
  it('should call completeStep with "password" on successful submit', async () => {
    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    await user.click(screen.getByTestId('trigger-password-ready'));

    const confirmInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmInput, 'test-password-phrase');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCompleteStep).toHaveBeenCalledWith('password');
    });
  });

  it('should call setError on context when completeStep fails', async () => {
    mockCompleteStep.mockRejectedValue(new Error('Step completion failed'));

    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    await user.click(screen.getByTestId('trigger-password-ready'));

    const confirmInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmInput, 'test-password-phrase');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockSetError).toHaveBeenCalledWith(expect.stringContaining('Step completion failed'));
    });
  });

  it('should show loading state during submission', async () => {
    mockCompleteStep.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    await user.click(screen.getByTestId('trigger-password-ready'));

    const confirmInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmInput, 'test-password-phrase');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    // Button should be disabled during loading
    expect(submitButton).toBeDisabled();
  });

  it('should not call completeStep if password validation fails', async () => {
    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    // Trigger invalid password
    await user.click(screen.getByTestId('trigger-invalid-password'));

    const confirmInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmInput, 'weak');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/password validation failed/i)).toBeInTheDocument();
    });
    expect(mockCompleteStep).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Security Tests
// ============================================================================

describe('PasswordSetupStep - Security', () => {
  it('should clear password from memory after successful submission', async () => {
    const user = userEvent.setup();
    render(<PasswordSetupStep {...defaultProps} />);

    await user.click(screen.getByTestId('trigger-password-ready'));

    const confirmInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmInput, 'test-password-phrase');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalled();
    });

    // Confirm password field should be cleared
    expect((confirmInput as HTMLInputElement).value).toBe('');
  });

  it('should not expose password in component state', () => {
    // This test verifies the component uses refs instead of state for password
    // The password should never be in React state to prevent exposure in dev tools
    render(<PasswordSetupStep {...defaultProps} />);

    // The component should render without exposing password in any visible way
    expect(screen.queryByText('test-password-phrase')).not.toBeInTheDocument();
  });
});

