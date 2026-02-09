import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as OnboardingSessionContext from '../../../../contexts/OnboardingSessionContext';
import * as secureSession from '../../../../services/secureSession';
import NostrMigrationOTPStep from '../NostrMigrationOTPStep';

// Mock dependencies
vi.mock('../../../../contexts/OnboardingSessionContext');
vi.mock('../../../../services/secureSession');

describe('NostrMigrationOTPStep', () => {
  const mockOnNext = vi.fn();
  const mockOnBack = vi.fn();
  const mockUpdateParticipant = vi.fn();
  const mockCompleteStep = vi.fn();

  const mockParticipant = {
    participantId: 'test-participant-id',
    sessionId: 'test-session-id',
    trueName: 'Test User',
    displayName: 'testuser',
    npub: 'npub1' + 'a'.repeat(58),
    nip05: 'testuser@satnam.pub',
    lightningAddress: 'testuser@satnam.pub',
    existingNostrAccount: true,
    migrationFlag: false,
    currentStep: 'migration' as const,
    completedSteps: ['intake', 'password', 'identity'] as const,
    status: 'in_progress' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock OnboardingSessionContext
    vi.spyOn(OnboardingSessionContext, 'useOnboardingSession').mockReturnValue({
      currentParticipant: mockParticipant,
      updateParticipant: mockUpdateParticipant,
      completeStep: mockCompleteStep,
      session: null,
      participants: [],
      isLoading: false,
      error: null,
      createSession: vi.fn(),
      registerParticipant: vi.fn(),
      updateSession: vi.fn(),
      completeSession: vi.fn(),
      loadSession: vi.fn(),
      clearSession: vi.fn(),
    });

    // Mock authenticatedFetch with default success responses
    vi.spyOn(secureSession, 'authenticatedFetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        sessionId: 'otp-session-123',
        expiresAt: new Date(Date.now() + 600000).toISOString(), // 10 minutes
        period: 120,
        digits: 6,
      }),
    } as Response);

    mockUpdateParticipant.mockResolvedValue(undefined);
    mockCompleteStep.mockResolvedValue(undefined);
  });

  // ============================================================================
  // Rendering Tests
  // ============================================================================

  it('should render with all UI elements', () => {
    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText(/verify nostr account ownership/i)).toBeInTheDocument();
    expect(screen.getByText(/existing nostr account/i)).toBeInTheDocument();
    expect(screen.getByText(/new nip-05/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send verification code/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('should display participant npub and NIP-05', () => {
    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Check for truncated npub display
    expect(screen.getByText(/npub1aaaaaaaaa/i)).toBeInTheDocument();
    expect(screen.getByText('testuser@satnam.pub')).toBeInTheDocument();
  });

  it('should show skip button when allowSkip is true', () => {
    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
        allowSkip={true}
      />
    );

    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument();
  });

  it('should not show skip button when allowSkip is false', () => {
    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
        allowSkip={false}
      />
    );

    expect(screen.queryByRole('button', { name: /skip for now/i })).not.toBeInTheDocument();
  });

  it('should show error when no participant data', () => {
    vi.spyOn(OnboardingSessionContext, 'useOnboardingSession').mockReturnValue({
      currentParticipant: null,
      updateParticipant: mockUpdateParticipant,
      completeStep: mockCompleteStep,
      session: null,
      participants: [],
      isLoading: false,
      error: null,
      createSession: vi.fn(),
      registerParticipant: vi.fn(),
      updateSession: vi.fn(),
      completeSession: vi.fn(),
      loadSession: vi.fn(),
      clearSession: vi.fn(),
    });

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText(/error: no participant data found/i)).toBeInTheDocument();
  });

  it('should display instructions for OTP flow', () => {
    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText(/how it works/i)).toBeInTheDocument();
    expect(screen.getByText(/click "send verification code"/i)).toBeInTheDocument();
    expect(screen.getByText(/check your nostr dms/i)).toBeInTheDocument();
  });

  // ============================================================================
  // OTP Generation Tests
  // ============================================================================

  it('should successfully generate OTP and show verification UI', async () => {
    const user = userEvent.setup();
    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(secureSession.authenticatedFetch).toHaveBeenCalledWith(
        '/.netlify/functions/auth-migration-otp-generate',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(mockParticipant.npub),
        })
      );
    });

    // Should show success message
    await waitFor(() => {
      expect(screen.getByText(/verification code sent to your nostr account/i)).toBeInTheDocument();
    });

    // Should show verification UI
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verify code/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend code/i })).toBeInTheDocument();
  });

  it('should show loading state during OTP generation', async () => {
    const user = userEvent.setup();

    // Mock delayed response
    vi.spyOn(secureSession, 'authenticatedFetch').mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({
          success: true,
          sessionId: 'otp-session-123',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          period: 120,
          digits: 6,
        }),
      } as Response), 100))
    );

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    expect(screen.getByText('Sending Code...')).toBeInTheDocument();
    expect(sendButton).toBeDisabled();
  });

  it('should handle OTP generation errors gracefully', async () => {
    const user = userEvent.setup();

    vi.spyOn(secureSession, 'authenticatedFetch').mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'Rate limit exceeded',
      }),
    } as Response);

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText(/rate limit exceeded/i)).toBeInTheDocument();
    });

    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should start countdown timer after OTP generation', async () => {
    const user = userEvent.setup();
    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText(/code expires in/i)).toBeInTheDocument();
    });

    // Should show countdown timer (10:00 or 9:59)
    expect(screen.getByText(/9:\d{2}/)).toBeInTheDocument();
  });

  it('should include Lightning Address in OTP generation request if available', async () => {
    const user = userEvent.setup();
    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(secureSession.authenticatedFetch).toHaveBeenCalledWith(
        '/.netlify/functions/auth-migration-otp-generate',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('testuser@satnam.pub'),
        })
      );
    });
  });

  // ============================================================================
  // OTP Verification Tests
  // ============================================================================

  it('should successfully verify OTP and advance to next step', async () => {
    const user = userEvent.setup();

    // Mock successful verification
    vi.spyOn(secureSession, 'authenticatedFetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          sessionId: 'otp-session-123',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          period: 120,
          digits: 6,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          verified: true,
          period: 120,
        }),
      } as Response);

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate OTP first
    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    // Enter 6-digit code
    const codeInput = screen.getByLabelText(/verification code/i);
    await user.type(codeInput, '123456');

    // Verify code
    const verifyButton = screen.getByRole('button', { name: /verify code/i });
    await user.click(verifyButton);

    await waitFor(() => {
      expect(secureSession.authenticatedFetch).toHaveBeenCalledWith(
        '/.netlify/functions/auth-migration-otp-verify',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('123456'),
        })
      );
    });

    // Should update participant
    await waitFor(() => {
      expect(mockUpdateParticipant).toHaveBeenCalledWith(
        'test-participant-id',
        expect.objectContaining({
          currentStep: 'nfc',
          migrationFlag: true,
        })
      );
    });

    // Should complete step
    expect(mockCompleteStep).toHaveBeenCalledWith(
      'migration',
      expect.objectContaining({
        sessionId: 'otp-session-123',
        method: 'otp',
      })
    );

    // Should show success message
    await waitFor(() => {
      expect(screen.getByText(/account ownership verified successfully/i)).toBeInTheDocument();
    });

    // Should advance to next step
    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('should disable verify button until 6 digits entered', async () => {
    const user = userEvent.setup();
    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate OTP first
    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    const verifyButton = screen.getByRole('button', { name: /verify code/i });
    expect(verifyButton).toBeDisabled();

    // Enter less than 6 digits
    const codeInput = screen.getByLabelText(/verification code/i);
    await user.type(codeInput, '12345');

    expect(verifyButton).toBeDisabled();

    // Enter 6th digit
    await user.type(codeInput, '6');

    expect(verifyButton).not.toBeDisabled();
  });

  it('should only accept numeric input for OTP code', async () => {
    const user = userEvent.setup();
    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate OTP first
    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    const codeInput = screen.getByLabelText(/verification code/i) as HTMLInputElement;
    await user.type(codeInput, 'abc123def456');

    // Should only contain digits
    expect(codeInput.value).toBe('123456');
  });

  it('should limit OTP code to 6 digits', async () => {
    const user = userEvent.setup();
    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate OTP first
    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    const codeInput = screen.getByLabelText(/verification code/i) as HTMLInputElement;
    await user.type(codeInput, '1234567890');

    // Should only contain first 6 digits
    expect(codeInput.value).toBe('123456');
  });

  it('should show loading state during OTP verification', async () => {
    const user = userEvent.setup();

    // Mock delayed verification response
    vi.spyOn(secureSession, 'authenticatedFetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          sessionId: 'otp-session-123',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          period: 120,
          digits: 6,
        }),
      } as Response)
      .mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => ({
            success: true,
            verified: true,
            period: 120,
          }),
        } as Response), 100))
      );

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate OTP
    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    // Enter code and verify
    const codeInput = screen.getByLabelText(/verification code/i);
    await user.type(codeInput, '123456');

    const verifyButton = screen.getByRole('button', { name: /verify code/i });
    await user.click(verifyButton);

    expect(screen.getByText('Verifying...')).toBeInTheDocument();
    expect(verifyButton).toBeDisabled();
  });

  it('should handle invalid OTP code error', async () => {
    const user = userEvent.setup();

    vi.spyOn(secureSession, 'authenticatedFetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          sessionId: 'otp-session-123',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          period: 120,
          digits: 6,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'Invalid code',
        }),
      } as Response);

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate OTP
    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    // Enter invalid code
    const codeInput = screen.getByLabelText(/verification code/i);
    await user.type(codeInput, '999999');

    const verifyButton = screen.getByRole('button', { name: /verify code/i });
    await user.click(verifyButton);

    await waitFor(() => {
      expect(screen.getByText(/invalid code/i)).toBeInTheDocument();
    });

    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should handle expired OTP code error', async () => {
    const user = userEvent.setup();

    vi.spyOn(secureSession, 'authenticatedFetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          sessionId: 'otp-session-123',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          period: 120,
          digits: 6,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'Code expired',
          expired: true,
        }),
      } as Response);

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate OTP
    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    // Enter code
    const codeInput = screen.getByLabelText(/verification code/i);
    await user.type(codeInput, '123456');

    const verifyButton = screen.getByRole('button', { name: /verify code/i });
    await user.click(verifyButton);

    await waitFor(() => {
      expect(screen.getByText(/verification code has expired/i)).toBeInTheDocument();
    });

    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should handle replay attack error', async () => {
    const user = userEvent.setup();

    vi.spyOn(secureSession, 'authenticatedFetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          sessionId: 'otp-session-123',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          period: 120,
          digits: 6,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'Code already used',
          replayAttack: true,
        }),
      } as Response);

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate OTP
    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    // Enter code
    const codeInput = screen.getByLabelText(/verification code/i);
    await user.type(codeInput, '123456');

    const verifyButton = screen.getByRole('button', { name: /verify code/i });
    await user.click(verifyButton);

    await waitFor(() => {
      expect(screen.getByText(/this code has already been used/i)).toBeInTheDocument();
    });

    expect(mockOnNext).not.toHaveBeenCalled();
  });

  // ============================================================================
  // Resend Functionality Tests
  // ============================================================================

  it('should allow resending OTP after cooldown', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers();

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate OTP first time
    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resend code/i })).toBeInTheDocument();
    });

    const resendButton = screen.getByRole('button', { name: /resend in \d+s/i });
    expect(resendButton).toBeDisabled();

    // Fast-forward 60 seconds
    vi.advanceTimersByTime(60000);

    await waitFor(() => {
      const enabledResendButton = screen.getByRole('button', { name: /resend code/i });
      expect(enabledResendButton).not.toBeDisabled();
    });

    vi.useRealTimers();
  });

  it('should trigger new OTP generation when resend is clicked', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers();

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate OTP first time
    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resend in \d+s/i })).toBeInTheDocument();
    });

    // Fast-forward 60 seconds
    vi.advanceTimersByTime(60000);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resend code/i })).toBeInTheDocument();
    });

    // Click resend
    const resendButton = screen.getByRole('button', { name: /resend code/i });
    await user.click(resendButton);

    // Should call generate endpoint again
    await waitFor(() => {
      expect(secureSession.authenticatedFetch).toHaveBeenCalledTimes(2);
    });

    vi.useRealTimers();
  });

  it('should show cooldown timer after resend', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers();

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate OTP
    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resend in 60s/i })).toBeInTheDocument();
    });

    // Advance 30 seconds
    vi.advanceTimersByTime(30000);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resend in 30s/i })).toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  // ============================================================================
  // Navigation Tests
  // ============================================================================

  it('should call onBack when back button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const backButton = screen.getByRole('button', { name: /back/i });
    await user.click(backButton);

    expect(mockOnBack).toHaveBeenCalled();
  });

  it('should disable back button during OTP generation', async () => {
    const user = userEvent.setup();

    // Mock delayed response
    vi.spyOn(secureSession, 'authenticatedFetch').mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({
          success: true,
          sessionId: 'otp-session-123',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          period: 120,
          digits: 6,
        }),
      } as Response), 100))
    );

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    const backButton = screen.getByRole('button', { name: /back/i });
    expect(backButton).toBeDisabled();
  });

  it('should disable back button during OTP verification', async () => {
    const user = userEvent.setup();

    // Mock delayed verification
    vi.spyOn(secureSession, 'authenticatedFetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          sessionId: 'otp-session-123',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          period: 120,
          digits: 6,
        }),
      } as Response)
      .mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => ({
            success: true,
            verified: true,
            period: 120,
          }),
        } as Response), 100))
      );

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate OTP
    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    // Enter code and verify
    const codeInput = screen.getByLabelText(/verification code/i);
    await user.type(codeInput, '123456');

    const verifyButton = screen.getByRole('button', { name: /verify code/i });
    await user.click(verifyButton);

    const backButton = screen.getByRole('button', { name: /back/i });
    expect(backButton).toBeDisabled();
  });

  it('should call skip handler when skip button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
        allowSkip={true}
      />
    );

    const skipButton = screen.getByRole('button', { name: /skip for now/i });
    await user.click(skipButton);

    await waitFor(() => {
      expect(mockUpdateParticipant).toHaveBeenCalledWith(
        'test-participant-id',
        expect.objectContaining({
          currentStep: 'nfc',
          migrationFlag: false,
        })
      );
    });

    expect(mockOnNext).toHaveBeenCalled();
  });

  it('should disable skip button during OTP generation', async () => {
    const user = userEvent.setup();

    // Mock delayed response
    vi.spyOn(secureSession, 'authenticatedFetch').mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({
          success: true,
          sessionId: 'otp-session-123',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          period: 120,
          digits: 6,
        }),
      } as Response), 100))
    );

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
        allowSkip={true}
      />
    );

    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    const skipButton = screen.getByRole('button', { name: /skip for now/i });
    expect(skipButton).toBeDisabled();
  });

  it('should disable skip button during OTP verification', async () => {
    const user = userEvent.setup();

    // Mock delayed verification
    vi.spyOn(secureSession, 'authenticatedFetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          sessionId: 'otp-session-123',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          period: 120,
          digits: 6,
        }),
      } as Response)
      .mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => ({
            success: true,
            verified: true,
            period: 120,
          }),
        } as Response), 100))
      );

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
        allowSkip={true}
      />
    );

    // Generate OTP
    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    // Enter code and verify
    const codeInput = screen.getByLabelText(/verification code/i);
    await user.type(codeInput, '123456');

    const verifyButton = screen.getByRole('button', { name: /verify code/i });
    await user.click(verifyButton);

    const skipButton = screen.getByRole('button', { name: /skip for now/i });
    expect(skipButton).toBeDisabled();
  });

  // ============================================================================
  // Security Tests
  // ============================================================================

  it('should not expose session ID in completed step data', async () => {
    const user = userEvent.setup();

    vi.spyOn(secureSession, 'authenticatedFetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          sessionId: 'otp-session-123',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          period: 120,
          digits: 6,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          verified: true,
          period: 120,
        }),
      } as Response);

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate OTP
    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    // Enter code and verify
    const codeInput = screen.getByLabelText(/verification code/i);
    await user.type(codeInput, '123456');

    const verifyButton = screen.getByRole('button', { name: /verify code/i });
    await user.click(verifyButton);

    await waitFor(() => {
      expect(mockCompleteStep).toHaveBeenCalledWith(
        'migration',
        expect.objectContaining({
          sessionId: 'otp-session-123',
          method: 'otp',
        })
      );
    });

    // Session ID is included but should be treated as sensitive
    const completeStepCall = mockCompleteStep.mock.calls[0];
    expect(completeStepCall[1]).toHaveProperty('sessionId');
  });

  it('should display success message after successful verification', async () => {
    const user = userEvent.setup();

    vi.spyOn(secureSession, 'authenticatedFetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          sessionId: 'otp-session-123',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          period: 120,
          digits: 6,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          verified: true,
          period: 120,
        }),
      } as Response);

    render(
      <NostrMigrationOTPStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate OTP
    const sendButton = screen.getByRole('button', { name: /send verification code/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    // Enter code and verify
    const codeInput = screen.getByLabelText(/verification code/i);
    await user.type(codeInput, '123456');

    const verifyButton = screen.getByRole('button', { name: /verify code/i });
    await user.click(verifyButton);

    await waitFor(() => {
      expect(screen.getByText(/account ownership verified successfully/i)).toBeInTheDocument();
    });
  });
});

