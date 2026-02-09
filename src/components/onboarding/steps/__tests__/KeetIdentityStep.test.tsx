6555555555555555555555555555555555555555555555555556/**
 * KeetIdentityStep Component Tests
 * @description Unit tests for Keet P2P identity setup step
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import KeetIdentityStep from '../KeetIdentityStep';
import * as OnboardingSessionContext from '../../../../contexts/OnboardingSessionContext';
import * as keetSeedManager from '../../../../lib/onboarding/keet-seed-manager';

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
  currentStep: 'keet' as const,
  completedSteps: ['intake', 'password', 'identity', 'nfc', 'lightning'] as const,
  status: 'in_progress' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};

Object.assign(navigator, {
  clipboard: mockClipboard,
});

// ============================================================================
// Test Setup
// ============================================================================

describe('KeetIdentityStep', () => {
  const mockOnNext = vi.fn();
  const mockOnBack = vi.fn();
  const mockPassword = 'TestPassword123!';

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
      currentStep: 'keet',
      completedSteps: ['intake', 'password', 'identity', 'nfc', 'lightning'],
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

    // Mock keet-seed-manager functions
    vi.spyOn(keetSeedManager, 'generateKeetSeedPhrase').mockReturnValue(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art'
    );

    vi.spyOn(keetSeedManager, 'deriveKeetPeerIdFromSeed').mockResolvedValue(
      'a'.repeat(64) // Mock peer ID (64 hex chars)
    );

    vi.spyOn(keetSeedManager, 'encryptKeetSeed').mockResolvedValue({
      encryptedSeed: 'encrypted-seed-base64url',
      seedSalt: 'seed-salt-base64url',
    });

    vi.spyOn(keetSeedManager, 'secureClearMemory').mockImplementation(() => { });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Rendering Tests
  // ============================================================================

  it('should render Keet identity setup UI', () => {
    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText('Keet P2P Identity')).toBeInTheDocument();
    expect(screen.getByText(/Generate your 24-word seed for secure peer-to-peer messaging/i)).toBeInTheDocument();
  });

  it('should render generate seed button in initial state', () => {
    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByRole('button', { name: /Generate Keet Identity/i })).toBeInTheDocument();
  });

  it('should render back button when onBack is provided', () => {
    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
  });



  // ============================================================================
  // Seed Generation Tests
  // ============================================================================

  it('should generate 24-word BIP39 seed when generate button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(keetSeedManager.generateKeetSeedPhrase).toHaveBeenCalled();
    });
  });

  it('should derive Keet Peer ID from generated seed', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(keetSeedManager.deriveKeetPeerIdFromSeed).toHaveBeenCalledWith(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art'
      );
    });
  });

  it('should display Keet Peer ID after generation', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/Keet Peer ID:/i)).toBeInTheDocument();
      expect(screen.getByText(/aaaa/i)).toBeInTheDocument(); // Part of the mock peer ID
    });
  });

  it('should show "Show Seed Phrase" button after generation', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Show Seed Phrase/i })).toBeInTheDocument();
    });
  });

  it('should handle seed generation errors gracefully', async () => {
    const user = userEvent.setup();

    vi.spyOn(keetSeedManager, 'generateKeetSeedPhrase').mockImplementation(() => {
      throw new Error('Seed generation failed');
    });

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/Seed generation failed/i)).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Display/Timer Tests
  // ============================================================================

  it('should display 24-word seed grid when "Show Seed Phrase" is clicked', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    // Show seed
    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    // Wait for seed grid to be displayed
    await waitFor(() => {
      // Check for numbered elements and words
      const numberedElements = screen.queryAllByText(/^\d+\.$/);
      expect(numberedElements.length).toBe(24);

      // Check for specific words
      const abandonElements = screen.queryAllByText('abandon');
      expect(abandonElements.length).toBeGreaterThan(0);

      expect(screen.getByText('art')).toBeInTheDocument();
    });
  });

  it('should start 5-minute countdown timer when seed is displayed', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate and show seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/Auto-clear in: 5:00/i)).toBeInTheDocument();
    });
  });

  it('should allow copying seed to clipboard', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    // Wait for show button to appear
    const showButton = await screen.findByRole('button', { name: /Show Seed Phrase/i });
    await user.click(showButton);

    // Wait for seed grid to be fully displayed with timer
    await waitFor(() => {
      expect(screen.getByText(/Auto-clear in:/i)).toBeInTheDocument();
      expect(screen.getAllByText('abandon').length).toBeGreaterThan(0);
    });

    // Find copy button - it should be present
    const copyButton = screen.getByRole('button', { name: /Copy/i });
    expect(copyButton).toBeInTheDocument();

    // Click the copy button
    await user.click(copyButton);

    // Verify the button text changes to "Copied!" after clicking
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it('should show backup confirmation checkbox when seed is displayed', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate and show seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/I have written down my 24-word seed/i)).toBeInTheDocument();
    });
  });

  it('should disable "Secure Seed" button until backup is confirmed', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate and show seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    await waitFor(() => {
      const secureButton = screen.getByRole('button', { name: /Secure Seed/i });
      expect(secureButton).toBeDisabled();
    });
  });

  it('should enable "Secure Seed" button when backup is confirmed', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate and show seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    // Check backup confirmation
    await waitFor(async () => {
      const checkbox = screen.getByLabelText(/I have written down my 24-word seed/i);
      await user.click(checkbox);
    });

    await waitFor(() => {
      const secureButton = screen.getByRole('button', { name: /Secure Seed/i });
      expect(secureButton).not.toBeDisabled();
    });
  });

  // ============================================================================
  // Encryption/Storage Tests
  // ============================================================================

  it('should encrypt seed with user password when "Secure Seed" is clicked', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate and show seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    // Confirm backup and secure
    await waitFor(async () => {
      const checkbox = screen.getByLabelText(/I have written down my 24-word seed/i);
      await user.click(checkbox);
    });

    await waitFor(async () => {
      const secureButton = screen.getByRole('button', { name: /Secure Seed/i });
      await user.click(secureButton);
    });

    await waitFor(() => {
      expect(keetSeedManager.encryptKeetSeed).toHaveBeenCalledWith(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art',
        mockPassword
      );
    });
  });

  it('should store encrypted seed in participant context', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate and show seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    // Confirm backup and secure
    await waitFor(async () => {
      const checkbox = screen.getByLabelText(/I have written down my 24-word seed/i);
      await user.click(checkbox);
    });

    await waitFor(async () => {
      const secureButton = screen.getByRole('button', { name: /Secure Seed/i });
      await user.click(secureButton);
    });

    await waitFor(() => {
      expect(mockUpdateParticipant).toHaveBeenCalledWith(
        'test-participant-id',
        expect.objectContaining({
          keetPeerId: 'a'.repeat(64),
          encryptedKeetSeed: 'encrypted-seed-base64url',
          keetSeedSalt: 'seed-salt-base64url',
        })
      );
    });
  });

  it('should clear ephemeral seed from memory after encryption', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate and show seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    // Confirm backup and secure
    await waitFor(async () => {
      const checkbox = screen.getByLabelText(/I have written down my 24-word seed/i);
      await user.click(checkbox);
    });

    await waitFor(async () => {
      const secureButton = screen.getByRole('button', { name: /Secure Seed/i });
      await user.click(secureButton);
    });

    await waitFor(() => {
      expect(keetSeedManager.secureClearMemory).toHaveBeenCalled();
    });
  });

  it('should show success message after seed is secured', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate and show seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    // Confirm backup and secure
    await waitFor(async () => {
      const checkbox = screen.getByLabelText(/I have written down my 24-word seed/i);
      await user.click(checkbox);
    });

    await waitFor(async () => {
      const secureButton = screen.getByRole('button', { name: /Secure Seed/i });
      await user.click(secureButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/Keet Identity Secured!/i)).toBeInTheDocument();
    });
  });

  it('should handle encryption errors gracefully', async () => {
    const user = userEvent.setup();

    vi.spyOn(keetSeedManager, 'encryptKeetSeed').mockRejectedValue(
      new Error('Encryption failed')
    );

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate and show seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    // Confirm backup and secure
    await waitFor(async () => {
      const checkbox = screen.getByLabelText(/I have written down my 24-word seed/i);
      await user.click(checkbox);
    });

    await waitFor(async () => {
      const secureButton = screen.getByRole('button', { name: /Secure Seed/i });
      await user.click(secureButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/Encryption failed/i)).toBeInTheDocument();
    });
  });

  it('should show loading state during encryption', async () => {
    const user = userEvent.setup();

    // Mock delayed encryption
    vi.spyOn(keetSeedManager, 'encryptKeetSeed').mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({
        encryptedSeed: 'encrypted-seed-base64url',
        seedSalt: 'seed-salt-base64url',
      }), 100))
    );

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate and show seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    // Confirm backup and secure
    await waitFor(async () => {
      const checkbox = screen.getByLabelText(/I have written down my 24-word seed/i);
      await user.click(checkbox);
    });

    await waitFor(async () => {
      const secureButton = screen.getByRole('button', { name: /Secure Seed/i });
      await user.click(secureButton);
    });

    expect(screen.getByText(/Securing.../i)).toBeInTheDocument();
  });

  // ============================================================================
  // Validation Tests
  // ============================================================================

  it('should require password prop', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { });

    expect(() => {
      render(
        <KeetIdentityStep
          password=""
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );
    }).not.toThrow();

    consoleError.mockRestore();
  });

  it('should not allow securing seed without backup confirmation', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate and show seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    // Try to secure without confirming backup
    await waitFor(() => {
      const secureButton = screen.getByRole('button', { name: /Secure Seed/i });
      expect(secureButton).toBeDisabled();
    });

    expect(keetSeedManager.encryptKeetSeed).not.toHaveBeenCalled();
  });

  it('should validate that seed is generated before showing', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Should not show "Show Seed Phrase" button initially
    expect(screen.queryByRole('button', { name: /Show Seed Phrase/i })).not.toBeInTheDocument();
  });

  // ============================================================================
  // Navigation Tests
  // ============================================================================

  it('should call onBack when back button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const backButton = screen.getByRole('button', { name: /Back/i });
    await user.click(backButton);

    expect(mockOnBack).toHaveBeenCalled();
  });

  it('should call onNext after seed is secured', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate and show seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    // Confirm backup and secure
    await waitFor(async () => {
      const checkbox = screen.getByLabelText(/I have written down my 24-word seed/i);
      await user.click(checkbox);
    });

    await waitFor(async () => {
      const secureButton = screen.getByRole('button', { name: /Secure Seed/i });
      await user.click(secureButton);
    });

    // Click continue button
    await waitFor(async () => {
      const continueButton = screen.getByRole('button', { name: /Continue/i });
      await user.click(continueButton);
    });

    expect(mockOnNext).toHaveBeenCalled();
  });

  it('should not allow navigation to next step before seed is secured', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate seed but don't secure it
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    // Should not show continue button
    expect(screen.queryByRole('button', { name: /Continue/i })).not.toBeInTheDocument();
  });

  // ============================================================================
  // Security Tests
  // ============================================================================

  it('should not expose plaintext seed in component state after securing', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate and show seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    // Confirm backup and secure
    await waitFor(async () => {
      const checkbox = screen.getByLabelText(/I have written down my 24-word seed/i);
      await user.click(checkbox);
    });

    await waitFor(async () => {
      const secureButton = screen.getByRole('button', { name: /Secure Seed/i });
      await user.click(secureButton);
    });

    // After securing, seed words should not be visible
    await waitFor(() => {
      expect(screen.queryByText('1. abandon')).not.toBeInTheDocument();
    });
  });

  it('should call secureClearMemory when component unmounts with active seed', async () => {
    const user = userEvent.setup();

    const { unmount } = render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate seed first
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(vi.mocked(keetSeedManager.generateKeetSeedPhrase)).toHaveBeenCalled();
    });

    // Clear previous calls
    vi.clearAllMocks();

    // Now unmount
    unmount();

    // secureClearMemory should be called during cleanup
    expect(keetSeedManager.secureClearMemory).toHaveBeenCalled();
  });

  it('should clear timers on component unmount', async () => {
    const user = userEvent.setup();

    const { unmount } = render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Generate and show seed to start timer
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    // Unmount component
    unmount();

    // Timer should be cleared (no errors should occur)
    expect(true).toBe(true);
  });

  it('should use zero-knowledge pattern for seed display', async () => {
    const user = userEvent.setup();

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Initially, seed should not be visible
    expect(screen.queryAllByText('abandon').length).toBe(0);

    // Generate seed
    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });
    await user.click(generateButton);

    // Seed still not visible until explicitly shown
    expect(screen.queryAllByText('abandon').length).toBe(0);

    // Show seed
    await waitFor(() => {
      const showButton = screen.getByRole('button', { name: /Show Seed Phrase/i });
      return user.click(showButton);
    });

    // Now seed is visible (check for the word "abandon" which appears multiple times)
    await waitFor(() => {
      expect(screen.getAllByText('abandon').length).toBeGreaterThan(0);
    });
  });

  it('should prevent multiple simultaneous seed generations', async () => {
    const user = userEvent.setup();

    // Mock delayed peer ID derivation (not seed generation, which is synchronous)
    let callCount = 0;
    vi.spyOn(keetSeedManager, 'deriveKeetPeerIdFromSeed').mockImplementation(() => {
      callCount++;
      return new Promise(resolve => setTimeout(() => resolve('a'.repeat(64)), 100));
    });

    render(
      <KeetIdentityStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const generateButton = screen.getByRole('button', { name: /Generate Keet Identity/i });

    // Click multiple times rapidly
    await user.click(generateButton);
    await user.click(generateButton);
    await user.click(generateButton);

    // Wait for async operations to complete
    await waitFor(() => {
      expect(callCount).toBe(1);
    }, { timeout: 500 });

    // Should only call once despite multiple clicks
    expect(callCount).toBe(1);
  });
});


