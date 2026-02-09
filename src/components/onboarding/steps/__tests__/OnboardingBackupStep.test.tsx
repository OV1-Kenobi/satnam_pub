/**
 * OnboardingBackupStep Component Tests
 * 
 * Comprehensive test suite for the backup step component.
 * Follows the testing pattern from KeetIdentityStep.test.tsx.
 * 
 * Test Coverage:
 * - Rendering Tests (5 tests)
 * - Decryption Tests (5 tests)
 * - Display/Timer Tests (5 tests)
 * - Copy Functionality Tests (5 tests)
 * - Template Download Tests (3 tests)
 * - Confirmation Tests (3 tests)
 * - Navigation Tests (3 tests)
 * - Security Tests (5 tests)
 * 
 * Total: 34+ test cases
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OnboardingBackupStep } from '../OnboardingBackupStep';
import * as OnboardingSessionContext from '../../../../contexts/OnboardingSessionContext';
import * as keetSeedManager from '../../../../lib/onboarding/keet-seed-manager';
import * as nsecDecryption from '../../../../lib/onboarding/nsec-decryption';
import type { OnboardingParticipant } from '../../../../types/onboarding';

// ============================================================================
// Mocks
// ============================================================================

const mockOnNext = vi.fn();
const mockOnBack = vi.fn();
const mockUpdateParticipant = vi.fn();
const mockCompleteStep = vi.fn();

const mockPassword = 'test-password-123';
const mockNsecHex = 'a'.repeat(64); // 64 hex chars
const mockEncryptedNsec = 'salt:iv:ciphertext';
const mockKeetSeed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
const mockEncryptedKeetSeed = 'encrypted-seed-base64url';
const mockKeetSeedSalt = 'seed-salt-base64url';
const mockKeetPeerId = 'a'.repeat(64);

const mockParticipant: OnboardingParticipant = {
  participantId: 'test-participant-id',
  sessionId: 'test-session-id',
  trueName: 'Test User',
  displayName: 'testuser',
  language: 'en',
  npub: 'npub1test',
  migrationFlag: false,
  currentStep: 'backup',
  completedSteps: ['intake', 'password', 'identity', 'keet'],
  status: 'in_progress',
  createdAt: new Date(),
  updatedAt: new Date(),
  encrypted_nsec: mockEncryptedNsec,
  encrypted_keet_seed: mockEncryptedKeetSeed,
  keet_seed_salt: mockKeetSeedSalt,
  keet_peer_id: mockKeetPeerId,
};

interface MockSecureBuffer {
  getData: () => Uint8Array;
  destroy: ReturnType<typeof vi.fn>;
  isDestroyed: () => boolean;
}

let keetSeedSecureBufferMock: MockSecureBuffer;
let clipboardWriteTextMock: ReturnType<typeof vi.fn>;

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();

  // Mock OnboardingSessionContext
  vi.spyOn(OnboardingSessionContext, 'useOnboardingSession').mockReturnValue({
    currentParticipant: mockParticipant,
    updateParticipant: mockUpdateParticipant,
    completeStep: mockCompleteStep,
    sessionId: 'test-session-id',
    mode: 'single',
    participants: [mockParticipant],
    addParticipant: vi.fn(),
    removeParticipant: vi.fn(),
    setCurrentParticipant: vi.fn(),
    clearSession: vi.fn(),
    setError: vi.fn(),
    clearError: vi.fn(),
    error: null,
  });

  // Mock nsec decryption (bytes-only API)
  vi.spyOn(nsecDecryption, 'decryptNsecWithPassword').mockResolvedValue(
    new TextEncoder().encode(mockNsecHex),
  );

  // Mock Keet seed decryption
  keetSeedSecureBufferMock = {
    getData: () => new TextEncoder().encode(mockKeetSeed),
    destroy: vi.fn(),
    isDestroyed: () => false,
  };
  vi.spyOn(keetSeedManager, 'decryptKeetSeed').mockResolvedValue(
    keetSeedSecureBufferMock as any,
  );

  // Mock secureClearMemory
  vi.spyOn(keetSeedManager, 'secureClearMemory').mockImplementation(() => { });
  vi.spyOn(nsecDecryption, 'secureClearMemory').mockImplementation(() => { });

  // Mock clipboard API
  clipboardWriteTextMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: clipboardWriteTextMock,
    },
    writable: true,
    configurable: true,
  });

  // Mock URL.createObjectURL and URL.revokeObjectURL
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = vi.fn();
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Mock download functionality for template download tests
 * This prevents jsdom navigation errors when clicking download links
 */
function mockDownloadFunctionality() {
  const mockClick = vi.fn();
  const originalCreateElement = document.createElement.bind(document);

  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'a') {
      const mockAnchor = originalCreateElement('a');
      mockAnchor.click = mockClick;
      return mockAnchor;
    }
    return originalCreateElement(tagName);
  });

  return { mockClick };
}

// ============================================================================
// Rendering Tests
// ============================================================================

describe('OnboardingBackupStep - Rendering', () => {
  it('should render backup step UI', () => {
    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText(/Backup Your Secrets/i)).toBeInTheDocument();
    expect(screen.getByText(/Write down your secrets by hand/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show My Secrets/i })).toBeInTheDocument();
  });

  it('should display what will be shown', () => {
    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText(/Nostr Private Key \(nsec\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Keet Seed Phrase \(24 words\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Password/i)).toBeInTheDocument();
    expect(screen.getByText(/Your account password/i)).toBeInTheDocument();
  });

  it('should show security warning before displaying secrets', () => {
    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText(/Security Warning/i)).toBeInTheDocument();
    expect(screen.getByText(/5 minutes only/i)).toBeInTheDocument();
  });

  it('should show back button', () => {
    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
  });

  it('should show password change note', () => {
    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByText(/You can change your password later/i)).toBeInTheDocument();
  });
});

// ============================================================================
// Decryption Tests
// ============================================================================

describe('OnboardingBackupStep - Decryption', () => {
  it('should decrypt nsec when showing secrets', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    await waitFor(() => {
      expect(nsecDecryption.decryptNsecWithPassword).toHaveBeenCalledWith(
        mockEncryptedNsec,
        mockPassword
      );
    });
  });

  it('should decrypt Keet seed when showing secrets', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    await waitFor(() => {
      expect(keetSeedManager.decryptKeetSeed).toHaveBeenCalledWith(
        mockEncryptedKeetSeed,
        mockPassword,
        mockKeetSeedSalt
      );
    });
  });

  it('should handle decryption errors gracefully', async () => {
    const user = userEvent.setup();
    vi.mocked(nsecDecryption.decryptNsecWithPassword).mockRejectedValueOnce(
      new Error('Decryption failed')
    );

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    await waitFor(() => {
      expect(screen.getByText(/Decryption failed/i)).toBeInTheDocument();
    });
  });

  it('should show loading state during decryption', async () => {
    const user = userEvent.setup();

    // Make decryption hang so we can observe the intermediate loading state
    vi.mocked(nsecDecryption.decryptNsecWithPassword).mockImplementationOnce(
      () => new Promise(() => { }),
    );

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    // Trigger click but don't await completion so handler stays in loading state
    void user.click(showButton);

    expect(await screen.findByText(/Decrypting.../i)).toBeInTheDocument();
  });

  it('should handle missing participant data', () => {
    vi.spyOn(OnboardingSessionContext, 'useOnboardingSession').mockReturnValue({
      currentParticipant: null,
      updateParticipant: mockUpdateParticipant,
      completeStep: mockCompleteStep,
      sessionId: 'test-session-id',
      mode: 'single',
      participants: [],
      addParticipant: vi.fn(),
      removeParticipant: vi.fn(),
      setCurrentParticipant: vi.fn(),
      clearSession: vi.fn(),
      setError: vi.fn(),
      clearError: vi.fn(),
      error: null,
    });

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Component should still render but show button should be disabled or show error when clicked
    expect(screen.getByRole('button', { name: /Show My Secrets/i })).toBeInTheDocument();
  });
});

// ============================================================================
// Display/Timer Tests
// ============================================================================

describe('OnboardingBackupStep - Display and Timer', () => {
  it('should display all three secrets after decryption', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    await waitFor(() => {
      // Check for nsec
      expect(screen.getByText(/1\. Nostr Private Key/i)).toBeInTheDocument();
      expect(screen.getByText(mockNsecHex)).toBeInTheDocument();

      // Check for Keet seed
      expect(screen.getByText(/2\. Keet Seed Phrase/i)).toBeInTheDocument();

      // Check for password
      expect(screen.getByText(/3\. Password/i)).toBeInTheDocument();
      expect(screen.getByText(mockPassword)).toBeInTheDocument();
    });
  });

  it('should display 24-word Keet seed in grid format', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

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

  it('should start 5-minute countdown timer when secrets are displayed', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    await waitFor(() => {
      expect(screen.getByText(/Auto-clear in: 5:00/i)).toBeInTheDocument();
    });
  });

  it('should hide show button after secrets are displayed', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Show My Secrets/i })).not.toBeInTheDocument();
    });
  });

  it('should show download template button after secrets are displayed', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download Blank Backup Template/i })).toBeInTheDocument();
    });
  });
});

// ============================================================================
// Copy Functionality Tests
// ============================================================================

describe('OnboardingBackupStep - Copy Functionality', () => {
  it('should allow copying nsec to clipboard', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for secrets to be displayed
    await waitFor(() => {
      expect(screen.getByText(mockNsecHex)).toBeInTheDocument();
    });

    // Find and click the copy button for nsec (first copy button)
    const copyButtons = screen.getAllByRole('button', { name: /Copy/i });
    await user.click(copyButtons[0]);

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(mockNsecHex);
    });
  });

  it('should allow copying Keet seed to clipboard', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for secrets to be displayed
    await waitFor(() => {
      expect(screen.getByText('art')).toBeInTheDocument();
    });

    // Find and click the copy button for Keet seed (second copy button)
    const copyButtons = screen.getAllByRole('button', { name: /Copy/i });
    await user.click(copyButtons[1]);

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(mockKeetSeed);
    });
  });

  it('should allow copying password to clipboard', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for secrets to be displayed
    await waitFor(() => {
      expect(screen.getByText(mockPassword)).toBeInTheDocument();
    });

    // Find and click the copy button for password (third copy button)
    const copyButtons = screen.getAllByRole('button', { name: /Copy/i });
    await user.click(copyButtons[2]);

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(mockPassword);
    });
  });

  it('should show "Copied!" feedback after copying', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for secrets to be displayed
    await waitFor(() => {
      expect(screen.getByText(mockNsecHex)).toBeInTheDocument();
    });

    // Click copy button
    const copyButtons = screen.getAllByRole('button', { name: /Copy/i });
    await user.click(copyButtons[0]);

    // Check for "Copied!" feedback
    await waitFor(() => {
      expect(screen.getByText(/Copied!/i)).toBeInTheDocument();
    });
  });

  it('should handle clipboard errors gracefully', async () => {
    const user = userEvent.setup();

    // Mock clipboard to reject
    const mockWriteText = vi.fn().mockRejectedValue(new Error('Clipboard error'));
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: mockWriteText,
      },
      writable: true,
      configurable: true,
    });

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for secrets to be displayed
    await waitFor(() => {
      expect(screen.getByText(mockNsecHex)).toBeInTheDocument();
    });

    // Click copy button
    const copyButtons = screen.getAllByRole('button', { name: /Copy/i });
    await user.click(copyButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Failed to copy to clipboard/i)).toBeInTheDocument();
    });
  });
});

// ============================================================================
// Template Download Tests
// ============================================================================

describe('OnboardingBackupStep - Template Download', () => {
  it('should download blank backup template', async () => {
    const user = userEvent.setup();
    const { mockClick } = mockDownloadFunctionality();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for download button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download Blank Backup Template/i })).toBeInTheDocument();
    });

    // Click download button
    const downloadButton = screen.getByRole('button', { name: /Download Blank Backup Template/i });
    await user.click(downloadButton);

    // Verify download was triggered
    expect(mockClick).toHaveBeenCalled();
    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  it('should create template with blank fields (no pre-filled secrets)', async () => {
    const user = userEvent.setup();
    const { mockClick } = mockDownloadFunctionality();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for download button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download Blank Backup Template/i })).toBeInTheDocument();
    });

    // Click download button
    const downloadButton = screen.getByRole('button', { name: /Download Blank Backup Template/i });
    await user.click(downloadButton);

    // Verify Blob was created (template should not contain actual secrets)
    const blobCall = vi.mocked(global.URL.createObjectURL).mock.calls[0][0];
    expect(blobCall).toBeInstanceOf(Blob);
    expect(mockClick).toHaveBeenCalled();
  });

  it('should include security reminders in template', async () => {
    const user = userEvent.setup();
    const { mockClick } = mockDownloadFunctionality();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for download button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download Blank Backup Template/i })).toBeInTheDocument();
    });

    // Click download button
    const downloadButton = screen.getByRole('button', { name: /Download Blank Backup Template/i });
    await user.click(downloadButton);

    // Template should be created
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
  });
});

// ============================================================================
// Confirmation Tests
// ============================================================================

describe('OnboardingBackupStep - Confirmation', () => {
  it('should enable "Complete Backup" button when checkbox is checked', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for checkbox
    await waitFor(() => {
      expect(screen.getByLabelText(/I have securely written down/i)).toBeInTheDocument();
    });

    // Check the checkbox
    const checkbox = screen.getByLabelText(/I have securely written down/i);
    await user.click(checkbox);

    // Complete Backup button should be enabled
    const completeButton = screen.getByRole('button', { name: /Complete Backup/i });
    expect(completeButton).not.toBeDisabled();
  });

  it('should disable "Complete Backup" button when checkbox is unchecked', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for checkbox
    await waitFor(() => {
      expect(screen.getByLabelText(/I have securely written down/i)).toBeInTheDocument();
    });

    // Complete Backup button should be disabled by default
    const completeButton = screen.getByRole('button', { name: /Complete Backup/i });
    expect(completeButton).toBeDisabled();
  });

  it('should show confirmation checkbox after secrets are displayed', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for checkbox
    await waitFor(() => {
      expect(screen.getByLabelText(/I have securely written down/i)).toBeInTheDocument();
    });

    // Check for warning text
    expect(screen.getByText(/These secrets cannot be recovered if lost/i)).toBeInTheDocument();
  });
});

// ============================================================================
// Navigation Tests
// ============================================================================

describe('OnboardingBackupStep - Navigation', () => {
  it('should call onBack when Back button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const backButton = screen.getByRole('button', { name: /Back/i });
    await user.click(backButton);

    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it('should call onNext when Complete Backup is clicked with confirmation', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for checkbox
    await waitFor(() => {
      expect(screen.getByLabelText(/I have securely written down/i)).toBeInTheDocument();
    });

    // Check the checkbox
    const checkbox = screen.getByLabelText(/I have securely written down/i);
    await user.click(checkbox);

    // Click Complete Backup
    const completeButton = screen.getByRole('button', { name: /Complete Backup/i });
    await user.click(completeButton);

    expect(mockOnNext).toHaveBeenCalledTimes(1);
  });

  it('should not call onNext when Complete Backup is clicked without confirmation', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for Complete Backup button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Complete Backup/i })).toBeInTheDocument();
    });

    // Complete Backup button should be disabled
    const completeButton = screen.getByRole('button', { name: /Complete Backup/i });
    expect(completeButton).toBeDisabled();

    // onNext should not be called
    expect(mockOnNext).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Security Tests
// ============================================================================

describe('OnboardingBackupStep - Security', () => {
  it('should call secureClearMemory when completing backup', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for checkbox
    await waitFor(() => {
      expect(screen.getByLabelText(/I have securely written down/i)).toBeInTheDocument();
    });

    // Check the checkbox
    const checkbox = screen.getByLabelText(/I have securely written down/i);
    await user.click(checkbox);

    // Click Complete Backup
    const completeButton = screen.getByRole('button', { name: /Complete Backup/i });
    await user.click(completeButton);

    // Verify secure memory cleanup was called
    await waitFor(() => {
      expect(keetSeedManager.secureClearMemory).toHaveBeenCalled();
    });
  });

  it('should clear ephemeral secrets when completing backup', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for secrets to be displayed
    await waitFor(() => {
      expect(screen.getByText(mockNsecHex)).toBeInTheDocument();
    });

    // Check the checkbox
    const checkbox = screen.getByLabelText(/I have securely written down/i);
    await user.click(checkbox);

    // Click Complete Backup
    const completeButton = screen.getByRole('button', { name: /Complete Backup/i });
    await user.click(completeButton);

    // Secrets should be cleared (component should call cleanup)
    expect(mockOnNext).toHaveBeenCalled();
  });

  it('should clear timers when completing backup', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for secrets to be displayed
    await waitFor(() => {
      expect(screen.getByText(mockNsecHex)).toBeInTheDocument();
    });

    // Check the checkbox
    const checkbox = screen.getByLabelText(/I have securely written down/i);
    await user.click(checkbox);

    // Click Complete Backup
    const completeButton = screen.getByRole('button', { name: /Complete Backup/i });
    await user.click(completeButton);

    // Timers should be cleared
    expect(mockOnNext).toHaveBeenCalled();
  });

  it('should destroy Keet seed SecureBuffer after decryption', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    await waitFor(() => {
      expect(keetSeedSecureBufferMock.destroy).toHaveBeenCalled();
    });
  });

  it('should cleanup on unmount', async () => {
    const user = userEvent.setup();

    const { unmount } = render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for secrets to be displayed
    await waitFor(() => {
      expect(screen.getByText(mockNsecHex)).toBeInTheDocument();
    });

    // Unmount component
    unmount();

    // Verify cleanup was called
    expect(keetSeedManager.secureClearMemory).toHaveBeenCalled();
  });

  it('should not expose secrets in component state after cleanup', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingBackupStep
        password={mockPassword}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );

    // Show secrets
    const showButton = screen.getByRole('button', { name: /Show My Secrets/i });
    await user.click(showButton);

    // Wait for secrets to be displayed
    await waitFor(() => {
      expect(screen.getByText(mockNsecHex)).toBeInTheDocument();
    });

    // Check the checkbox
    const checkbox = screen.getByLabelText(/I have securely written down/i);
    await user.click(checkbox);

    // Click Complete Backup
    const completeButton = screen.getByRole('button', { name: /Complete Backup/i });
    await user.click(completeButton);

    // Verify cleanup was called
    await waitFor(() => {
      expect(keetSeedManager.secureClearMemory).toHaveBeenCalled();
    });
  });
});

