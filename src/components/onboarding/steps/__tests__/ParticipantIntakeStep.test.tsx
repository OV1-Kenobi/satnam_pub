/**
 * ParticipantIntakeStep Unit Tests
 *
 * Comprehensive tests for participant intake form component.
 *
 * Test Coverage:
 * - Form rendering and initial state
 * - Form validation (required fields, npub format)
 * - User interactions (input changes, checkbox toggles)
 * - Backend integration (API calls, error handling)
 * - Context integration (addParticipant, completeStep)
 * - Callback invocations (onNext, onBack)
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ParticipantIntakeStep from '../ParticipantIntakeStep';

// ============================================================================
// Mocks
// ============================================================================

// Mock useOnboardingSession hook
const mockAddParticipant = vi.fn();
const mockCompleteStep = vi.fn();
const mockSetError = vi.fn();

vi.mock('../../../../contexts/OnboardingSessionContext', () => ({
  useOnboardingSession: () => ({
    session: { sessionId: 'test-session-123', mode: 'single', status: 'active' },
    currentParticipant: null,
    addParticipant: mockAddParticipant,
    completeStep: mockCompleteStep,
    setError: mockSetError,
  }),
}));

// Mock authenticatedFetch
const mockAuthenticatedFetch = vi.fn();
vi.mock('../../../../utils/secureSession', () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...args),
}));

// ============================================================================
// Test Setup
// ============================================================================

const mockOnNext = vi.fn();
const mockOnBack = vi.fn();

const defaultProps = {
  onNext: mockOnNext,
  onBack: mockOnBack,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default successful API response
  mockAuthenticatedFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      participant: {
        participantId: 'participant-123',
        sessionId: 'test-session-123',
        trueName: 'Test User',
        displayName: 'testuser',
        language: 'en',
        existingNostrAccount: false,
        existingLightningWallet: false,
        migrationFlag: false,
        technicalComfort: 'medium',
        currentStep: 'intake',
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    }),
  });
  mockAddParticipant.mockResolvedValue(undefined);
  mockCompleteStep.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// Form Rendering Tests
// ============================================================================

describe('ParticipantIntakeStep - Form Rendering', () => {
  it('should render the form with all required fields', () => {
    render(<ParticipantIntakeStep {...defaultProps} />);

    expect(screen.getByLabelText(/true name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/language/i)).toBeInTheDocument();
    expect(screen.getByText(/existing nostr account/i)).toBeInTheDocument();
    expect(screen.getByText(/existing lightning wallet/i)).toBeInTheDocument();
    expect(screen.getByText(/technical comfort/i)).toBeInTheDocument();
  });

  it('should render with default values', () => {
    render(<ParticipantIntakeStep {...defaultProps} />);

    const trueNameInput = screen.getByLabelText(/true name/i) as HTMLInputElement;
    const displayNameInput = screen.getByLabelText(/display name/i) as HTMLInputElement;
    const languageSelect = screen.getByLabelText(/language/i) as HTMLSelectElement;

    expect(trueNameInput.value).toBe('');
    expect(displayNameInput.value).toBe('');
    expect(languageSelect.value).toBe('en');
  });

  it('should render submit button', () => {
    render(<ParticipantIntakeStep {...defaultProps} />);

    expect(screen.getByRole('button', { name: /continue|next|submit/i })).toBeInTheDocument();
  });

  it('should render back button when onBack is provided', () => {
    render(<ParticipantIntakeStep {...defaultProps} />);

    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('should not render back button when onBack is not provided', () => {
    render(<ParticipantIntakeStep onNext={mockOnNext} />);

    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();
  });

  it('should render all supported languages in dropdown', () => {
    render(<ParticipantIntakeStep {...defaultProps} />);

    const languageSelect = screen.getByLabelText(/language/i);
    expect(languageSelect).toBeInTheDocument();

    // Check for some key languages
    expect(screen.getByRole('option', { name: /english/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /español/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /português/i })).toBeInTheDocument();
  });

  it('should render technical comfort radio buttons', () => {
    render(<ParticipantIntakeStep {...defaultProps} />);

    expect(screen.getByLabelText(/low/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/medium/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/high/i)).toBeInTheDocument();
  });
});

// ============================================================================
// Form Validation Tests
// ============================================================================

describe('ParticipantIntakeStep - Form Validation', () => {
  it('should show error when true name is empty on submit', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/true name is required/i)).toBeInTheDocument();
    });
    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should show error when existing Nostr account is checked but npub is empty', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    // Fill in required fields
    await user.type(screen.getByLabelText(/true name/i), 'Test User');

    // Check existing Nostr account
    const nostrCheckbox = screen.getByRole('checkbox', { name: /existing nostr account/i });
    await user.click(nostrCheckbox);

    // Submit without npub
    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/npub is required/i)).toBeInTheDocument();
    });
    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should show error for invalid npub format', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    await user.type(screen.getByLabelText(/true name/i), 'Test User');

    const nostrCheckbox = screen.getByRole('checkbox', { name: /existing nostr account/i });
    await user.click(nostrCheckbox);

    // Enter invalid npub
    const npubInput = screen.getByPlaceholderText(/npub1/i);
    await user.type(npubInput, 'invalid-npub');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/invalid npub format/i)).toBeInTheDocument();
    });
    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should accept valid npub format', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    await user.type(screen.getByLabelText(/true name/i), 'Test User');

    const nostrCheckbox = screen.getByRole('checkbox', { name: /existing nostr account/i });
    await user.click(nostrCheckbox);

    // Enter valid npub (63 chars after npub1)
    const validNpub = 'npub1' + 'a'.repeat(58);
    const npubInput = screen.getByPlaceholderText(/npub1/i);
    await user.type(npubInput, validNpub);

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalled();
    });
  });

  it('should clear validation errors when user corrects input', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    // Submit empty form to trigger error
    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/true name is required/i)).toBeInTheDocument();
    });

    // Type in true name
    await user.type(screen.getByLabelText(/true name/i), 'Test User');

    // Error should be cleared on next submit attempt
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.queryByText(/true name is required/i)).not.toBeInTheDocument();
    });
  });
});

// ============================================================================
// User Interaction Tests
// ============================================================================

describe('ParticipantIntakeStep - User Interactions', () => {
  it('should update true name on input', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    const trueNameInput = screen.getByLabelText(/true name/i) as HTMLInputElement;
    await user.type(trueNameInput, 'John Doe');

    expect(trueNameInput.value).toBe('John Doe');
  });

  it('should update display name on input', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    const displayNameInput = screen.getByLabelText(/display name/i) as HTMLInputElement;
    await user.type(displayNameInput, 'johndoe');

    expect(displayNameInput.value).toBe('johndoe');
  });

  it('should update language on selection', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    const languageSelect = screen.getByLabelText(/language/i);
    await user.selectOptions(languageSelect, 'es');

    expect((languageSelect as HTMLSelectElement).value).toBe('es');
  });

  it('should toggle existing Nostr account checkbox', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    const nostrCheckbox = screen.getByRole('checkbox', { name: /existing nostr account/i });
    expect(nostrCheckbox).not.toBeChecked();

    await user.click(nostrCheckbox);
    expect(nostrCheckbox).toBeChecked();

    await user.click(nostrCheckbox);
    expect(nostrCheckbox).not.toBeChecked();
  });

  it('should show npub input when existing Nostr account is checked', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    // npub input should not be visible initially
    expect(screen.queryByPlaceholderText(/npub1/i)).not.toBeInTheDocument();

    // Check existing Nostr account
    const nostrCheckbox = screen.getByRole('checkbox', { name: /existing nostr account/i });
    await user.click(nostrCheckbox);

    // npub input should now be visible
    expect(screen.getByPlaceholderText(/npub1/i)).toBeInTheDocument();
  });

  it('should toggle existing Lightning wallet checkbox', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    const lightningCheckbox = screen.getByRole('checkbox', { name: /existing lightning wallet/i });
    expect(lightningCheckbox).not.toBeChecked();

    await user.click(lightningCheckbox);
    expect(lightningCheckbox).toBeChecked();
  });

  it('should update technical comfort on radio selection', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    const lowRadio = screen.getByLabelText(/low/i);
    const highRadio = screen.getByLabelText(/high/i);

    await user.click(lowRadio);
    expect(lowRadio).toBeChecked();

    await user.click(highRadio);
    expect(highRadio).toBeChecked();
    expect(lowRadio).not.toBeChecked();
  });

  it('should call onBack when back button is clicked', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    const backButton = screen.getByRole('button', { name: /back/i });
    await user.click(backButton);

    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Backend Integration Tests
// ============================================================================

describe('ParticipantIntakeStep - Backend Integration', () => {
  it('should call authenticatedFetch with correct payload on submit', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    await user.type(screen.getByLabelText(/true name/i), 'Test User');
    await user.type(screen.getByLabelText(/display name/i), 'testuser');
    await user.selectOptions(screen.getByLabelText(/language/i), 'es');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/.netlify/functions/onboarding-participant-register',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"trueName":"Test User"'),
        })
      );
    });
  });

  it('should include existingNostrAccount and oldNpub in payload when checked', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    await user.type(screen.getByLabelText(/true name/i), 'Test User');

    const nostrCheckbox = screen.getByRole('checkbox', { name: /existing nostr account/i });
    await user.click(nostrCheckbox);

    const validNpub = 'npub1' + 'a'.repeat(58);
    await user.type(screen.getByPlaceholderText(/npub1/i), validNpub);

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"existingNostrAccount":true'),
        })
      );
    });
  });

  it('should include existingLightningWallet in payload when checked', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    await user.type(screen.getByLabelText(/true name/i), 'Test User');

    const lightningCheckbox = screen.getByRole('checkbox', { name: /existing lightning wallet/i });
    await user.click(lightningCheckbox);

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"existingLightningWallet":true'),
        })
      );
    });
  });

  it('should show loading state during submission', async () => {
    // Make the fetch take some time
    mockAuthenticatedFetch.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({
      ok: true,
      json: () => Promise.resolve({ participant: { participantId: 'test' } }),
    }), 100)));

    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    await user.type(screen.getByLabelText(/true name/i), 'Test User');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    // Button should be disabled during loading
    expect(submitButton).toBeDisabled();
  });

  it('should display error message on API failure', async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error occurred' }),
    });

    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    await user.type(screen.getByLabelText(/true name/i), 'Test User');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/server error occurred/i)).toBeInTheDocument();
    });
    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should display generic error on network failure', async () => {
    mockAuthenticatedFetch.mockRejectedValue(new Error('Network error'));

    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    await user.type(screen.getByLabelText(/true name/i), 'Test User');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
    expect(mockOnNext).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Context Integration Tests
// ============================================================================

describe('ParticipantIntakeStep - Context Integration', () => {
  it('should call addParticipant with correct data on successful submit', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    await user.type(screen.getByLabelText(/true name/i), 'Test User');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockAddParticipant).toHaveBeenCalledWith(
        expect.objectContaining({
          trueName: 'Test User',
          language: 'en',
          npub: 'pending',
          currentStep: 'intake',
          status: 'pending',
        })
      );
    });
  });

  it('should call completeStep with "intake" on successful submit', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    await user.type(screen.getByLabelText(/true name/i), 'Test User');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCompleteStep).toHaveBeenCalledWith('intake');
    });
  });

  it('should call onNext after successful submission', async () => {
    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    await user.type(screen.getByLabelText(/true name/i), 'Test User');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalledTimes(1);
    });
  });

  it('should call setError on context when API fails', async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Validation failed' }),
    });

    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    await user.type(screen.getByLabelText(/true name/i), 'Test User');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockSetError).toHaveBeenCalledWith(expect.stringContaining('Validation failed'));
    });
  });

  it('should not call addParticipant if API fails', async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    });

    const user = userEvent.setup();
    render(<ParticipantIntakeStep {...defaultProps} />);

    await user.type(screen.getByLabelText(/true name/i), 'Test User');

    const submitButton = screen.getByRole('button', { name: /continue|next|submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument();
    });
    expect(mockAddParticipant).not.toHaveBeenCalled();
  });
});

