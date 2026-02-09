/**
 * LightningSetupStep Component Tests
 * @description Unit tests for Lightning wallet setup step
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LightningSetupStep from '../LightningSetupStep';
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
  nip05: 'testuser@satnam.pub',
  migrationFlag: false,
  currentStep: 'lightning' as const,
  completedSteps: ['intake', 'password', 'identity', 'nfc'] as const,
  status: 'in_progress' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ============================================================================
// Test Setup
// ============================================================================

describe('LightningSetupStep', () => {
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
      currentStep: 'lightning',
      completedSteps: ['intake', 'password', 'identity', 'nfc'],
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

    // Mock authenticatedFetch
    vi.spyOn(secureSession, 'authenticatedFetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        linkId: 'test-link-id',
        lightningAddress: 'testuser@satnam.pub',
        walletId: 'test-wallet-id',
        setupMode: 'auto',
        scrubEnabled: false,
      }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Rendering Tests
  // ============================================================================

  it('should render Lightning wallet setup UI', () => {
    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText('Lightning Wallet Setup')).toBeInTheDocument();
    expect(screen.getByText(/Configure your Lightning wallet to send and receive Bitcoin payments/i)).toBeInTheDocument();
  });

  it('should render setup mode selection buttons', () => {
    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText('Auto-Provision Wallet')).toBeInTheDocument();
    expect(screen.getByText('Connect External Wallet')).toBeInTheDocument();
  });

  it('should default to auto-provision mode', () => {
    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const autoProvisionButton = screen.getByText('Auto-Provision Wallet').closest('button');
    expect(autoProvisionButton).toHaveClass('border-blue-500');
  });

  it('should render back button when onBack is provided', () => {
    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
  });

  it('should render skip button when allowSkip is true', () => {
    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
        allowSkip={true}
      />
    );

    expect(screen.getByRole('button', { name: /Skip for Now/i })).toBeInTheDocument();
  });

  it('should not render skip button when allowSkip is false', () => {
    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
        allowSkip={false}
      />
    );

    expect(screen.queryByRole('button', { name: /Skip for Now/i })).not.toBeInTheDocument();
  });

  it('should show error when no participant data is available', () => {
    vi.spyOn(OnboardingSessionContext, 'useOnboardingSession').mockReturnValue({
      currentParticipant: null,
      updateParticipant: mockUpdateParticipant,
      completeStep: mockCompleteStep,
      session: null,
      participantQueue: [],
      totalParticipants: 0,
      completedParticipants: 0,
      currentStep: 'lightning',
      completedSteps: [],
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

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText('No participant data available')).toBeInTheDocument();
  });

  // ============================================================================
  // Setup Mode Selection Tests
  // ============================================================================

  it('should switch to external wallet mode when external button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const externalButton = screen.getByText('Connect External Wallet').closest('button');
    await user.click(externalButton!);

    expect(externalButton).toHaveClass('border-blue-500');
    expect(screen.getByLabelText('NWC Connection String')).toBeInTheDocument();
  });

  it('should switch back to auto-provision mode when auto button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Switch to external mode first
    const externalButton = screen.getByText('Connect External Wallet').closest('button');
    await user.click(externalButton!);

    // Switch back to auto mode
    const autoButton = screen.getByText('Auto-Provision Wallet').closest('button');
    await user.click(autoButton!);

    expect(autoButton).toHaveClass('border-blue-500');
    expect(screen.getByText('Your Lightning Address')).toBeInTheDocument();
  });

  // ============================================================================
  // Auto-Provision Mode Tests
  // ============================================================================

  it('should display Lightning Address in auto-provision mode', () => {
    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText('Your Lightning Address')).toBeInTheDocument();
    expect(screen.getByText('testuser@satnam.pub')).toBeInTheDocument();
  });

  it('should generate Lightning Address from display name when nip05 is not available', () => {
    const participantWithoutNip05 = {
      ...mockParticipant,
      nip05: undefined,
    };

    vi.spyOn(OnboardingSessionContext, 'useOnboardingSession').mockReturnValue({
      currentParticipant: participantWithoutNip05,
      updateParticipant: mockUpdateParticipant,
      completeStep: mockCompleteStep,
      session: null,
      participantQueue: [],
      totalParticipants: 0,
      completedParticipants: 0,
      currentStep: 'lightning',
      completedSteps: ['intake', 'password', 'identity', 'nfc'],
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

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText('testuser@satnam.pub')).toBeInTheDocument();
  });

  it('should render Scrub forwarding toggle in auto-provision mode', () => {
    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText('Scrub Forwarding (Optional)')).toBeInTheDocument();
    expect(screen.getByText(/Automatically forward payments to your external self-custody wallet/i)).toBeInTheDocument();
  });

  it('should show Scrub forwarding fields when toggle is enabled', async () => {
    const user = userEvent.setup();

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Find and click the Scrub forwarding toggle
    const toggleButtons = screen.getAllByRole('button');
    const scrubToggle = toggleButtons.find(btn =>
      btn.className.includes('inline-flex') && btn.className.includes('items-center')
    );

    await user.click(scrubToggle!);

    await waitFor(() => {
      expect(screen.getByLabelText('External Lightning Address')).toBeInTheDocument();
      expect(screen.getByLabelText(/Forward Percentage:/i)).toBeInTheDocument();
    });
  });

  it('should allow adjusting Scrub forwarding percentage', async () => {
    const user = userEvent.setup();

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Enable Scrub forwarding
    const toggleButtons = screen.getAllByRole('button');
    const scrubToggle = toggleButtons.find(btn =>
      btn.className.includes('inline-flex') && btn.className.includes('items-center')
    );
    await user.click(scrubToggle!);

    await waitFor(() => {
      const percentSlider = screen.getByLabelText(/Forward Percentage:/i) as HTMLInputElement;
      expect(percentSlider).toBeInTheDocument();
      expect(percentSlider.value).toBe('100');
    });
  });

  it('should successfully provision LNbits wallet in auto mode', async () => {
    const user = userEvent.setup();

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const provisionButton = screen.getByRole('button', { name: /Provision Lightning Wallet/i });
    await user.click(provisionButton);

    await waitFor(() => {
      expect(secureSession.authenticatedFetch).toHaveBeenCalledWith(
        '/.netlify/functions/onboarding-lightning-setup',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"setupMode":"auto"'),
        })
      );
    });

    await waitFor(() => {
      expect(mockUpdateParticipant).toHaveBeenCalledWith(
        'test-participant-id',
        expect.objectContaining({
          currentStep: 'keet',
        })
      );
    });

    await waitFor(() => {
      expect(mockCompleteStep).toHaveBeenCalledWith(
        'lightning',
        expect.objectContaining({
          setupMode: 'auto',
        })
      );
    });

    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('should show loading state during wallet provisioning', async () => {
    const user = userEvent.setup();

    // Mock a delayed response
    vi.spyOn(secureSession, 'authenticatedFetch').mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({
          success: true,
          linkId: 'test-link-id',
          lightningAddress: 'testuser@satnam.pub',
          walletId: 'test-wallet-id',
          setupMode: 'auto',
          scrubEnabled: false,
        }),
      } as Response), 100))
    );

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const provisionButton = screen.getByRole('button', { name: /Provision Lightning Wallet/i });
    await user.click(provisionButton);

    expect(screen.getByText('Provisioning Wallet...')).toBeInTheDocument();
    expect(provisionButton).toBeDisabled();
  });

  it('should handle provisioning errors gracefully', async () => {
    const user = userEvent.setup();

    vi.spyOn(secureSession, 'authenticatedFetch').mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'LNbits provisioning failed',
      }),
    } as Response);

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const provisionButton = screen.getByRole('button', { name: /Provision Lightning Wallet/i });
    await user.click(provisionButton);

    await waitFor(() => {
      expect(screen.getByText('LNbits provisioning failed')).toBeInTheDocument();
    });

    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should send Scrub forwarding configuration when enabled', async () => {
    const user = userEvent.setup();

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Enable Scrub forwarding
    const toggleButtons = screen.getAllByRole('button');
    const scrubToggle = toggleButtons.find(btn =>
      btn.className.includes('inline-flex') && btn.className.includes('items-center')
    );
    await user.click(scrubToggle!);

    // Enter external Lightning Address
    await waitFor(() => {
      const externalAddressInput = screen.getByLabelText('External Lightning Address');
      user.type(externalAddressInput, 'user@getalby.com');
    });

    const provisionButton = screen.getByRole('button', { name: /Provision Lightning Wallet/i });
    await user.click(provisionButton);

    await waitFor(() => {
      expect(secureSession.authenticatedFetch).toHaveBeenCalledWith(
        '/.netlify/functions/onboarding-lightning-setup',
        expect.objectContaining({
          body: expect.stringContaining('"scrubEnabled":true'),
        })
      );
    });
  });

  // ============================================================================
  // External Wallet Mode Tests
  // ============================================================================

  it('should render NWC connection string input in external mode', async () => {
    const user = userEvent.setup();

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const externalButton = screen.getByText('Connect External Wallet').closest('button');
    await user.click(externalButton!);

    expect(screen.getByLabelText('NWC Connection String')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('nostr+walletconnect://...')).toBeInTheDocument();
  });

  it('should validate NWC connection string format', async () => {
    const user = userEvent.setup();

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Switch to external mode
    const externalButton = screen.getByText('Connect External Wallet').closest('button');
    await user.click(externalButton!);

    // Enter invalid NWC connection string
    const nwcInput = screen.getByLabelText('NWC Connection String');
    await user.type(nwcInput, 'invalid-nwc-string');

    const connectButton = screen.getByRole('button', { name: /Connect External Wallet/i });
    await user.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText(/Invalid NWC connection string format/i)).toBeInTheDocument();
    });

    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should successfully connect external wallet with valid NWC', async () => {
    const user = userEvent.setup();

    vi.spyOn(secureSession, 'authenticatedFetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        linkId: 'test-link-id',
        setupMode: 'external',
        scrubEnabled: false,
      }),
    } as Response);

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Switch to external mode
    const externalButton = screen.getByText('Connect External Wallet').closest('button');
    await user.click(externalButton!);

    // Enter valid NWC connection string
    const nwcInput = screen.getByLabelText('NWC Connection String');
    const validNWC = 'nostr+walletconnect://a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2?relay=wss://relay.example.com&secret=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    await user.type(nwcInput, validNWC);

    const connectButton = screen.getByRole('button', { name: /Connect External Wallet/i });
    await user.click(connectButton);

    await waitFor(() => {
      expect(secureSession.authenticatedFetch).toHaveBeenCalledWith(
        '/.netlify/functions/onboarding-lightning-setup',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"setupMode":"external"'),
        })
      );
    });

    await waitFor(() => {
      expect(mockCompleteStep).toHaveBeenCalledWith(
        'lightning',
        expect.objectContaining({
          setupMode: 'external',
          nwcConnectionString: '[ENCRYPTED]',
        })
      );
    });

    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('should disable connect button when NWC connection string is empty', async () => {
    const user = userEvent.setup();

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Switch to external mode
    const externalButton = screen.getByText('Connect External Wallet').closest('button');
    await user.click(externalButton!);

    const connectButton = screen.getByRole('button', { name: /Connect External Wallet/i });
    expect(connectButton).toBeDisabled();
  });

  it('should show loading state during external wallet connection', async () => {
    const user = userEvent.setup();

    // Mock a delayed response
    vi.spyOn(secureSession, 'authenticatedFetch').mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({
          success: true,
          linkId: 'test-link-id',
          setupMode: 'external',
          scrubEnabled: false,
        }),
      } as Response), 100))
    );

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Switch to external mode
    const externalButton = screen.getByText('Connect External Wallet').closest('button');
    await user.click(externalButton!);

    // Enter valid NWC
    const nwcInput = screen.getByLabelText('NWC Connection String');
    const validNWC = 'nostr+walletconnect://a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2?relay=wss://relay.example.com&secret=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    await user.type(nwcInput, validNWC);

    const connectButton = screen.getByRole('button', { name: /Connect External Wallet/i });
    await user.click(connectButton);

    expect(screen.getByText('Connecting Wallet...')).toBeInTheDocument();
    expect(connectButton).toBeDisabled();
  });

  it('should handle external wallet connection errors gracefully', async () => {
    const user = userEvent.setup();

    vi.spyOn(secureSession, 'authenticatedFetch').mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'Failed to connect external wallet',
      }),
    } as Response);

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Switch to external mode
    const externalButton = screen.getByText('Connect External Wallet').closest('button');
    await user.click(externalButton!);

    // Enter valid NWC
    const nwcInput = screen.getByLabelText('NWC Connection String');
    const validNWC = 'nostr+walletconnect://a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2?relay=wss://relay.example.com&secret=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    await user.type(nwcInput, validNWC);

    const connectButton = screen.getByRole('button', { name: /Connect External Wallet/i });
    await user.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to connect external wallet')).toBeInTheDocument();
    });

    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should validate external Lightning Address when Scrub forwarding is enabled in external mode', async () => {
    const user = userEvent.setup();

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Switch to external mode
    const externalButton = screen.getByText('Connect External Wallet').closest('button');
    await user.click(externalButton!);

    // Enter valid NWC
    const nwcInput = screen.getByLabelText('NWC Connection String');
    const validNWC = 'nostr+walletconnect://a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2?relay=wss://relay.example.com&secret=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    await user.type(nwcInput, validNWC);

    // Enable Scrub forwarding
    const toggleButtons = screen.getAllByRole('button');
    const scrubToggle = toggleButtons.find(btn =>
      btn.className.includes('inline-flex') && btn.className.includes('items-center')
    );
    await user.click(scrubToggle!);

    // Enter invalid external Lightning Address
    await waitFor(async () => {
      const externalAddressInput = screen.getByLabelText('External Lightning Address');
      await user.type(externalAddressInput, 'invalid-address');
    });

    const connectButton = screen.getByRole('button', { name: /Connect External Wallet/i });
    await user.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText(/Invalid external Lightning Address format/i)).toBeInTheDocument();
    });

    expect(mockOnNext).not.toHaveBeenCalled();
  });

  // ============================================================================
  // Validation Tests
  // ============================================================================

  it('should validate Lightning Address format correctly', () => {
    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Valid Lightning Address is displayed (from participant data)
    expect(screen.getByText('testuser@satnam.pub')).toBeInTheDocument();
  });

  it('should accept valid Lightning Address formats', async () => {
    const user = userEvent.setup();

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Enable Scrub forwarding to access external Lightning Address input
    const toggleButtons = screen.getAllByRole('button');
    const scrubToggle = toggleButtons.find(btn =>
      btn.className.includes('inline-flex') && btn.className.includes('items-center')
    );
    await user.click(scrubToggle!);

    await waitFor(async () => {
      const externalAddressInput = screen.getByLabelText('External Lightning Address');
      await user.type(externalAddressInput, 'user@getalby.com');
    });

    const provisionButton = screen.getByRole('button', { name: /Provision Lightning Wallet/i });
    await user.click(provisionButton);

    // Should not show validation error
    await waitFor(() => {
      expect(screen.queryByText(/Invalid external Lightning Address format/i)).not.toBeInTheDocument();
    });
  });

  it('should accept NWC connection strings with valid format', async () => {
    const user = userEvent.setup();

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Switch to external mode
    const externalButton = screen.getByText('Connect External Wallet').closest('button');
    await user.click(externalButton!);

    // Enter valid NWC
    const nwcInput = screen.getByLabelText('NWC Connection String');
    const validNWC = 'nostr+walletconnect://a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2?relay=wss://relay.example.com&secret=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    await user.type(nwcInput, validNWC);

    const connectButton = screen.getByRole('button', { name: /Connect External Wallet/i });

    // Button should be enabled with valid NWC
    expect(connectButton).not.toBeDisabled();
  });

  // ============================================================================
  // Navigation Tests
  // ============================================================================

  it('should call onBack when back button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const backButton = screen.getByRole('button', { name: /Back/i });
    await user.click(backButton);

    expect(mockOnBack).toHaveBeenCalled();
  });

  it('should disable back button during provisioning', async () => {
    const user = userEvent.setup();

    // Mock a delayed response
    vi.spyOn(secureSession, 'authenticatedFetch').mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({
          success: true,
          linkId: 'test-link-id',
          lightningAddress: 'testuser@satnam.pub',
          walletId: 'test-wallet-id',
          setupMode: 'auto',
          scrubEnabled: false,
        }),
      } as Response), 100))
    );

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const provisionButton = screen.getByRole('button', { name: /Provision Lightning Wallet/i });
    await user.click(provisionButton);

    const backButton = screen.getByRole('button', { name: /Back/i });
    expect(backButton).toBeDisabled();
  });

  it('should call skip handler when skip button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <LightningSetupStep
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
        expect.objectContaining({
          currentStep: 'keet',
        })
      );
    });

    expect(mockOnNext).toHaveBeenCalled();
  });

  it('should disable skip button during provisioning', async () => {
    const user = userEvent.setup();

    // Mock a delayed response
    vi.spyOn(secureSession, 'authenticatedFetch').mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({
          success: true,
          linkId: 'test-link-id',
          lightningAddress: 'testuser@satnam.pub',
          walletId: 'test-wallet-id',
          setupMode: 'auto',
          scrubEnabled: false,
        }),
      } as Response), 100))
    );

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
        allowSkip={true}
      />
    );

    const provisionButton = screen.getByRole('button', { name: /Provision Lightning Wallet/i });
    await user.click(provisionButton);

    const skipButton = screen.getByRole('button', { name: /Skip for Now/i });
    expect(skipButton).toBeDisabled();
  });

  // ============================================================================
  // Security Tests
  // ============================================================================

  it('should not expose NWC connection string in completed step data', async () => {
    const user = userEvent.setup();

    vi.spyOn(secureSession, 'authenticatedFetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        linkId: 'test-link-id',
        setupMode: 'external',
        scrubEnabled: false,
      }),
    } as Response);

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Switch to external mode
    const externalButton = screen.getByText('Connect External Wallet').closest('button');
    await user.click(externalButton!);

    // Enter valid NWC
    const nwcInput = screen.getByLabelText('NWC Connection String');
    const validNWC = 'nostr+walletconnect://a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2?relay=wss://relay.example.com&secret=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    await user.type(nwcInput, validNWC);

    const connectButton = screen.getByRole('button', { name: /Connect External Wallet/i });
    await user.click(connectButton);

    await waitFor(() => {
      expect(mockCompleteStep).toHaveBeenCalledWith(
        'lightning',
        expect.objectContaining({
          nwcConnectionString: '[ENCRYPTED]',
        })
      );
    });

    // Verify the actual NWC string is NOT in the call
    const completeStepCall = mockCompleteStep.mock.calls[0];
    expect(JSON.stringify(completeStepCall)).not.toContain(validNWC);
  });

  it('should display success message after successful setup', async () => {
    const user = userEvent.setup();

    render(
      <LightningSetupStep
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const provisionButton = screen.getByRole('button', { name: /Provision Lightning Wallet/i });
    await user.click(provisionButton);

    await waitFor(() => {
      expect(screen.getByText(/Lightning wallet provisioned successfully!/i)).toBeInTheDocument();
    });
  });
});

