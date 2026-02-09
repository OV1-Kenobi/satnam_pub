/**
 * NFCCardRegistrationStep Component Tests
 * @description Unit tests for NFC card registration step
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NFCCardRegistrationStep } from '../NFCCardRegistrationStep';
import * as OnboardingSessionContext from '../../../../contexts/OnboardingSessionContext';
import * as secureSession from '../../../../utils/secureSession';

// ============================================================================
// Mocks
// ============================================================================

const mockUpdateParticipant = vi.fn();
const mockCompleteStep = vi.fn();

const mockParticipant = {
  participantId: 'test-participant-id',
  sessionId: 'test-session-id',
  trueName: 'Test User',
  displayName: 'TestUser',
  language: 'en',
  npub: 'npub1test',
  nip05: 'test@satnam.pub',
  migrationFlag: false,
  currentStep: 'nfc' as const,
  completedSteps: ['intake', 'password', 'identity'] as const,
  status: 'in_progress' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock Web NFC API
const mockNDEFReader = {
  scan: vi.fn(),
  abort: vi.fn(),
  onreading: null as ((event: any) => void) | null,
  onerror: null as ((event: any) => void) | null,
};

// ============================================================================
// Test Setup
// ============================================================================

describe('NFCCardRegistrationStep', () => {
  const mockOnNext = vi.fn();
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock OnboardingSessionContext
    vi.spyOn(OnboardingSessionContext, 'useOnboardingSession').mockReturnValue({
      currentParticipant: mockParticipant,
      updateParticipant: mockUpdateParticipant,
      completeStep: mockCompleteStep,
      session: null,
      participantQueue: [],
      totalParticipants: 0,
      completedParticipants: 0,
      currentStep: 'nfc',
      completedSteps: ['intake', 'password', 'identity'],
      isLoading: false,
      error: null,
      startSession: vi.fn(),
      pauseSession: vi.fn(),
      resumeSession: vi.fn(),
      completeSession: vi.fn(),
      cancelSession: vi.fn(),
      addParticipant: vi.fn(),
      nextStep: vi.fn(),
      previousStep: vi.fn(),
      goToStep: vi.fn(),
      nextParticipant: vi.fn(),
      previousParticipant: vi.fn(),
      clearError: vi.fn(),
    });

    // Mock Web NFC API
    (window as any).NDEFReader = vi.fn(() => mockNDEFReader);

    // Mock authenticatedFetch
    vi.spyOn(secureSession, 'authenticatedFetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        card: {
          cardId: 'test-card-id',
          participantId: 'test-participant-id',
          cardUid: 'test-card-uid',
          cardType: 'ntag424',
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
      }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).NDEFReader;
  });

  // ============================================================================
  // Rendering Tests
  // ============================================================================

  it('should render NFC card registration UI', () => {
    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText('NFC Card Registration')).toBeInTheDocument();
    expect(screen.getByText(/Register your NFC card for secure authentication/i)).toBeInTheDocument();
  });

  it('should show NFC not supported warning when Web NFC is unavailable', () => {
    delete (window as any).NDEFReader;

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText('NFC Not Supported')).toBeInTheDocument();
    expect(screen.getByText(/Web NFC is not available on this device/i)).toBeInTheDocument();
  });

  it('should render card type selection buttons', () => {
    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText('ntag424')).toBeInTheDocument();
    expect(screen.getByText('boltcard')).toBeInTheDocument();
    expect(screen.getByText('tapsigner')).toBeInTheDocument();
  });

  it('should render scan button', () => {
    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByRole('button', { name: /Scan NFC Card/i })).toBeInTheDocument();
  });

  it('should render back button when onBack is provided', () => {
    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
  });

  it('should render skip button when allowSkip is true', () => {
    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
        allowSkip={true}
      />
    );

    expect(screen.getByRole('button', { name: /Skip for Now/i })).toBeInTheDocument();
  });

  // ============================================================================
  // Card Type Selection Tests
  // ============================================================================

  it('should allow selecting different card types', async () => {
    const user = userEvent.setup();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const boltcardButton = screen.getByText('boltcard');
    await user.click(boltcardButton);

    // Button should have selected styling (check for blue border class)
    expect(boltcardButton.closest('button')).toHaveClass('border-blue-500');
  });

  it('should default to ntag424 card type', () => {
    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const ntag424Button = screen.getByText('ntag424');
    expect(ntag424Button.closest('button')).toHaveClass('border-blue-500');
  });

  // ============================================================================
  // NFC Scanning Tests
  // ============================================================================

  it('should initiate NFC scan when scan button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const scanButton = screen.getByRole('button', { name: /Scan NFC Card/i });
    await user.click(scanButton);

    await waitFor(() => {
      expect(mockNDEFReader.scan).toHaveBeenCalled();
    });
  });

  it('should show scanning state during NFC scan', async () => {
    const user = userEvent.setup();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const scanButton = screen.getByRole('button', { name: /Scan NFC Card/i });
    await user.click(scanButton);

    await waitFor(() => {
      expect(screen.getByText(/Scanning.../i)).toBeInTheDocument();
    });
  });

  it('should display card details after successful scan', async () => {
    const user = userEvent.setup();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const scanButton = screen.getByRole('button', { name: /Scan NFC Card/i });
    await user.click(scanButton);

    // Simulate successful NFC read
    await waitFor(() => {
      if (mockNDEFReader.onreading) {
        mockNDEFReader.onreading({
          serialNumber: 'test-card-uid-12345678',
          message: { records: [] },
        });
      }
    });

    await waitFor(() => {
      expect(screen.getByText('Card Detected')).toBeInTheDocument();
      expect(screen.getByText(/Card UID: test-card/i)).toBeInTheDocument();
    });
  });

  it('should handle NFC scan timeout', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const scanButton = screen.getByRole('button', { name: /Scan NFC Card/i });
    await user.click(scanButton);

    // Fast-forward past timeout (15 seconds)
    vi.advanceTimersByTime(15000);

    await waitFor(() => {
      expect(screen.getByText(/Card scan timeout/i)).toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it('should handle NFC scan error', async () => {
    const user = userEvent.setup();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const scanButton = screen.getByRole('button', { name: /Scan NFC Card/i });
    await user.click(scanButton);

    // Simulate NFC error
    await waitFor(() => {
      if (mockNDEFReader.onerror) {
        mockNDEFReader.onerror(new Event('error'));
      }
    });

    await waitFor(() => {
      expect(screen.getByText(/NFC reading error/i)).toBeInTheDocument();
    });
  });

  // ============================================================================
  // PIN Setup Tests
  // ============================================================================

  it('should show PIN input fields after scanning NTAG424 card', async () => {
    const user = userEvent.setup();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const scanButton = screen.getByRole('button', { name: /Scan NFC Card/i });
    await user.click(scanButton);

    // Simulate successful NFC read
    await waitFor(() => {
      if (mockNDEFReader.onreading) {
        mockNDEFReader.onreading({
          serialNumber: 'test-card-uid',
          message: { records: [] },
        });
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/Set Card PIN/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Confirm PIN/i)).toBeInTheDocument();
    });
  });

  it('should not show PIN input for Tapsigner cards', async () => {
    const user = userEvent.setup();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Select Tapsigner
    const tapsignerButton = screen.getByText('tapsigner');
    await user.click(tapsignerButton);

    const scanButton = screen.getByRole('button', { name: /Scan NFC Card/i });
    await user.click(scanButton);

    // Simulate successful NFC read
    await waitFor(() => {
      if (mockNDEFReader.onreading) {
        mockNDEFReader.onreading({
          serialNumber: 'test-card-uid',
          message: { records: [] },
        });
      }
    });

    await waitFor(() => {
      expect(screen.queryByLabelText(/Set Card PIN/i)).not.toBeInTheDocument();
    });
  });

  it('should validate PIN length', async () => {
    const user = userEvent.setup();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const scanButton = screen.getByRole('button', { name: /Scan NFC Card/i });
    await user.click(scanButton);

    // Simulate successful NFC read
    await waitFor(() => {
      if (mockNDEFReader.onreading) {
        mockNDEFReader.onreading({
          serialNumber: 'test-card-uid',
          message: { records: [] },
        });
      }
    });

    const pinInput = await screen.findByLabelText(/Set Card PIN/i);
    const pinConfirmInput = await screen.findByLabelText(/Confirm PIN/i);

    await user.type(pinInput, '123'); // Too short
    await user.type(pinConfirmInput, '123');

    const registerButton = screen.getByRole('button', { name: /Register Card/i });
    await user.click(registerButton);

    await waitFor(() => {
      expect(screen.getByText(/PIN must be exactly 6 digits/i)).toBeInTheDocument();
    });
  });

  it('should validate PIN contains only digits', async () => {
    const user = userEvent.setup();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const scanButton = screen.getByRole('button', { name: /Scan NFC Card/i });
    await user.click(scanButton);

    // Simulate successful NFC read
    await waitFor(() => {
      if (mockNDEFReader.onreading) {
        mockNDEFReader.onreading({
          serialNumber: 'test-card-uid',
          message: { records: [] },
        });
      }
    });

    const pinInput = await screen.findByLabelText(/Set Card PIN/i);
    const pinConfirmInput = await screen.findByLabelText(/Confirm PIN/i);

    await user.type(pinInput, 'abc123');
    await user.type(pinConfirmInput, 'abc123');

    const registerButton = screen.getByRole('button', { name: /Register Card/i });
    await user.click(registerButton);

    await waitFor(() => {
      expect(screen.getByText(/PIN must contain only digits/i)).toBeInTheDocument();
    });
  });

  it('should validate PIN confirmation matches', async () => {
    const user = userEvent.setup();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const scanButton = screen.getByRole('button', { name: /Scan NFC Card/i });
    await user.click(scanButton);

    // Simulate successful NFC read
    await waitFor(() => {
      if (mockNDEFReader.onreading) {
        mockNDEFReader.onreading({
          serialNumber: 'test-card-uid',
          message: { records: [] },
        });
      }
    });

    const pinInput = await screen.findByLabelText(/Set Card PIN/i);
    const pinConfirmInput = await screen.findByLabelText(/Confirm PIN/i);

    await user.type(pinInput, '123456');
    await user.type(pinConfirmInput, '654321'); // Different

    const registerButton = screen.getByRole('button', { name: /Register Card/i });
    await user.click(registerButton);

    await waitFor(() => {
      expect(screen.getByText(/PINs do not match/i)).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Submission Tests
  // ============================================================================

  it('should successfully register card with valid PIN', async () => {
    const user = userEvent.setup();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const scanButton = screen.getByRole('button', { name: /Scan NFC Card/i });
    await user.click(scanButton);

    // Simulate successful NFC read
    await waitFor(() => {
      if (mockNDEFReader.onreading) {
        mockNDEFReader.onreading({
          serialNumber: 'test-card-uid',
          message: { records: [] },
        });
      }
    });

    const pinInput = await screen.findByLabelText(/Set Card PIN/i);
    const pinConfirmInput = await screen.findByLabelText(/Confirm PIN/i);

    await user.type(pinInput, '123456');
    await user.type(pinConfirmInput, '123456');

    const registerButton = screen.getByRole('button', { name: /Register Card/i });
    await user.click(registerButton);

    await waitFor(() => {
      expect(secureSession.authenticatedFetch).toHaveBeenCalledWith(
        '/.netlify/functions/onboarding-card-register',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('test-card-uid'),
        })
      );
    });

    await waitFor(() => {
      expect(mockUpdateParticipant).toHaveBeenCalledWith(
        'test-participant-id',
        { currentStep: 'lightning' }
      );
    });

    await waitFor(() => {
      expect(mockCompleteStep).toHaveBeenCalledWith('nfc', expect.any(Object));
    });

    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalled();
    });
  });

  it('should register Tapsigner without PIN', async () => {
    const user = userEvent.setup();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Select Tapsigner
    const tapsignerButton = screen.getByText('tapsigner');
    await user.click(tapsignerButton);

    const scanButton = screen.getByRole('button', { name: /Scan NFC Card/i });
    await user.click(scanButton);

    // Simulate successful NFC read
    await waitFor(() => {
      if (mockNDEFReader.onreading) {
        mockNDEFReader.onreading({
          serialNumber: 'test-card-uid',
          message: { records: [] },
        });
      }
    });

    const registerButton = await screen.findByRole('button', { name: /Register Card/i });
    await user.click(registerButton);

    await waitFor(() => {
      expect(secureSession.authenticatedFetch).toHaveBeenCalledWith(
        '/.netlify/functions/onboarding-card-register',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('tapsigner'),
        })
      );
    });

    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalled();
    });
  });

  it('should handle backend registration error', async () => {
    const user = userEvent.setup();

    // Mock failed API response
    vi.spyOn(secureSession, 'authenticatedFetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Card already registered' }),
    } as Response);

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const scanButton = screen.getByRole('button', { name: /Scan NFC Card/i });
    await user.click(scanButton);

    // Simulate successful NFC read
    await waitFor(() => {
      if (mockNDEFReader.onreading) {
        mockNDEFReader.onreading({
          serialNumber: 'test-card-uid',
          message: { records: [] },
        });
      }
    });

    const pinInput = await screen.findByLabelText(/Set Card PIN/i);
    const pinConfirmInput = await screen.findByLabelText(/Confirm PIN/i);

    await user.type(pinInput, '123456');
    await user.type(pinConfirmInput, '123456');

    const registerButton = screen.getByRole('button', { name: /Register Card/i });
    await user.click(registerButton);

    await waitFor(() => {
      expect(screen.getByText(/Card already registered/i)).toBeInTheDocument();
    });

    expect(mockOnNext).not.toHaveBeenCalled();
  });

  // ============================================================================
  // Navigation Tests
  // ============================================================================

  it('should call onBack when back button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const backButton = screen.getByRole('button', { name: /Back/i });
    await user.click(backButton);

    expect(mockOnBack).toHaveBeenCalled();
  });

  it('should skip NFC registration when skip button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
        allowSkip={true}
      />
    );

    const skipButton = screen.getByRole('button', { name: /Skip for Now/i });
    await user.click(skipButton);

    await waitFor(() => {
      expect(mockUpdateParticipant).toHaveBeenCalledWith(
        'test-participant-id',
        { currentStep: 'lightning' }
      );
    });

    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalled();
    });
  });

  it('should disable register button when no card is scanned', () => {
    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const registerButton = screen.getByRole('button', { name: /Register Card/i });
    expect(registerButton).toBeDisabled();
  });

  it('should disable register button when PIN is incomplete', async () => {
    const user = userEvent.setup();

    render(
      <NFCCardRegistrationStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const scanButton = screen.getByRole('button', { name: /Scan NFC Card/i });
    await user.click(scanButton);

    // Simulate successful NFC read
    await waitFor(() => {
      if (mockNDEFReader.onreading) {
        mockNDEFReader.onreading({
          serialNumber: 'test-card-uid',
          message: { records: [] },
        });
      }
    });

    const pinInput = await screen.findByLabelText(/Set Card PIN/i);
    await user.type(pinInput, '123456');
    // Don't fill confirm PIN

    const registerButton = screen.getByRole('button', { name: /Register Card/i });
    expect(registerButton).toBeDisabled();
  });
});

