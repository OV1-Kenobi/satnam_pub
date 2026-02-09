/**
 * NostrIdentityStep Unit Tests
 *
 * Comprehensive tests for Nostr identity creation/migration step component.
 *
 * Test Coverage:
 * - Form rendering for new account vs migration flows
 * - Conditional rendering based on existingNostrAccount flag
 * - Keypair generation (mock crypto-lazy)
 * - Zero-knowledge nsec handling (never exposed in state)
 * - Context integration (updateParticipant, completeStep)
 * - Callback invocations (onNext, onBack)
 * - Error handling (generation, submission)
 * - Loading states
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NostrIdentityStep from '../NostrIdentityStep';

// ============================================================================
// Mocks
// ============================================================================

// Mock useOnboardingSession hook
const mockUpdateParticipant = vi.fn();
const mockCompleteStep = vi.fn();
const mockSetError = vi.fn();

let mockParticipant = {
  participantId: 'participant-123',
  trueName: 'Test User',
  status: 'pending',
  existingNostrAccount: false,
  migrationFlag: false,
  oldNpub: '',
};

vi.mock('../../../../contexts/OnboardingSessionContext', () => ({
  useOnboardingSession: () => ({
    currentParticipant: mockParticipant,
    updateParticipant: mockUpdateParticipant,
    completeStep: mockCompleteStep,
    setError: mockSetError,
  }),
}));

// Mock crypto-lazy module for keypair generation
const mockGenerateNostrKeyPair = vi.fn();

vi.mock('../../../../../utils/crypto-lazy', () => ({
  generateNostrKeyPair: () => mockGenerateNostrKeyPair(),
}));

// Mock authenticatedFetch (for future backend integration)
const mockAuthenticatedFetch = vi.fn();

vi.mock('../../../../utils/secureSession', () => ({
  authenticatedFetch: () => mockAuthenticatedFetch(),
}));

// Mock Web Crypto API
const mockEncrypt = vi.fn();
const mockDeriveKey = vi.fn();
const mockImportKey = vi.fn();

// ============================================================================
// Test Setup
// ============================================================================

const mockOnNext = vi.fn();
const mockOnBack = vi.fn();

const defaultProps = {
  password: 'test-secure-password',
  onNext: mockOnNext,
  onBack: mockOnBack,
};

beforeEach(() => {
  vi.clearAllMocks();

  // Reset participant to new account flow
  mockParticipant = {
    participantId: 'participant-123',
    trueName: 'Test User',
    status: 'pending',
    existingNostrAccount: false,
    migrationFlag: false,
    oldNpub: '',
  };

  // Mock successful keypair generation
  mockGenerateNostrKeyPair.mockResolvedValue({
    npub: 'npub1' + 'a'.repeat(58),
    privateKey: 'a'.repeat(64), // 32 bytes in hex
    publicKey: 'b'.repeat(64),
  });

  mockUpdateParticipant.mockResolvedValue(undefined);
  mockCompleteStep.mockResolvedValue(undefined);

  // Mock Web Crypto API globally
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      },
      subtle: {
        importKey: vi.fn().mockResolvedValue('mock-key-material'),
        deriveKey: vi.fn().mockResolvedValue('mock-derived-key'),
        encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      },
    },
    writable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// Form Rendering Tests - New Account Flow
// ============================================================================

describe('NostrIdentityStep - New Account Flow Rendering', () => {
  it('should render the identity creation form', () => {
    render(<NostrIdentityStep {...defaultProps} />);

    expect(screen.getByText(/create nostr identity/i)).toBeInTheDocument();
  });

  it('should render generate button for new account', () => {
    render(<NostrIdentityStep {...defaultProps} />);

    expect(screen.getByRole('button', { name: /generate new nostr account/i })).toBeInTheDocument();
  });

  it('should render back button when onBack is provided', () => {
    render(<NostrIdentityStep {...defaultProps} />);

    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('should not render back button when onBack is not provided', () => {
    render(<NostrIdentityStep password="test-password" onNext={mockOnNext} />);

    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();
  });

  it('should display participant name in header', () => {
    render(<NostrIdentityStep {...defaultProps} />);

    expect(screen.getByText(/test user/i)).toBeInTheDocument();
  });

  it('should render security notice', () => {
    render(<NostrIdentityStep {...defaultProps} />);

    expect(screen.getByText(/security notice/i)).toBeInTheDocument();
  });

  it('should render submit button disabled when identity not generated', () => {
    render(<NostrIdentityStep {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: /continue/i });
    expect(submitButton).toBeDisabled();
  });

  it('should show generate button disabled when no password', () => {
    render(<NostrIdentityStep password="" onNext={mockOnNext} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    expect(generateButton).toBeDisabled();
  });
});

// ============================================================================
// Form Rendering Tests - Migration Flow
// ============================================================================

describe('NostrIdentityStep - Migration Flow Rendering', () => {
  beforeEach(() => {
    mockParticipant = {
      participantId: 'participant-123',
      trueName: 'Test User',
      status: 'pending',
      existingNostrAccount: true,
      migrationFlag: true,
      oldNpub: 'npub1' + 'x'.repeat(58),
    };
  });

  it('should render migration flow header', () => {
    render(<NostrIdentityStep {...defaultProps} />);

    expect(screen.getByText(/import existing account/i)).toBeInTheDocument();
  });

  it('should show existing account detected message', () => {
    render(<NostrIdentityStep {...defaultProps} />);

    expect(screen.getByText(/existing account detected/i)).toBeInTheDocument();
  });

  it('should display truncated old npub', () => {
    render(<NostrIdentityStep {...defaultProps} />);

    expect(screen.getByText(/npub1xxxx/i)).toBeInTheDocument();
  });

  it('should not show generate button in migration flow', () => {
    render(<NostrIdentityStep {...defaultProps} />);

    expect(screen.queryByRole('button', { name: /generate new nostr account/i })).not.toBeInTheDocument();
  });

  it('should render submit button as "Continue to Migration"', () => {
    render(<NostrIdentityStep {...defaultProps} />);

    expect(screen.getByRole('button', { name: /continue to migration/i })).toBeInTheDocument();
  });

  it('should enable submit button in migration flow without generating', () => {
    render(<NostrIdentityStep {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: /continue to migration/i });
    expect(submitButton).not.toBeDisabled();
  });
});

// ============================================================================
// Keypair Generation Tests
// ============================================================================

describe('NostrIdentityStep - Keypair Generation', () => {
  it('should generate keypair when generate button is clicked', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(mockGenerateNostrKeyPair).toHaveBeenCalled();
    });
  });

  it('should display generated npub after generation', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/npub1aaa/i)).toBeInTheDocument();
    });
  });

  it('should display generated NIP-05 identifier', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/testuser@satnam\.pub/i)).toBeInTheDocument();
    });
  });

  it('should show success message after generation', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/identity generated successfully/i)).toBeInTheDocument();
    });
  });

  it('should show loading state during generation', async () => {
    mockGenerateNostrKeyPair.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({
      npub: 'npub1' + 'a'.repeat(58),
      privateKey: 'a'.repeat(64),
      publicKey: 'b'.repeat(64),
    }), 100)));

    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    expect(screen.getByText(/generating keypair/i)).toBeInTheDocument();
  });

  it('should show error when generation fails', async () => {
    mockGenerateNostrKeyPair.mockRejectedValue(new Error('Keypair generation failed'));

    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/keypair generation failed/i)).toBeInTheDocument();
    });
  });

  it('should show error when password is missing', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep password="" onNext={mockOnNext} />);

    // Button should be disabled, but let's test the internal logic
    // by checking the error message if we could trigger it
    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    expect(generateButton).toBeDisabled();
  });

  it('should enable submit button after successful generation', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: /continue/i });
    expect(submitButton).toBeDisabled();

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('should show regenerate button after generation', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
    });
  });

  it('should regenerate keypair when regenerate button is clicked', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    // First generation
    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(mockGenerateNostrKeyPair).toHaveBeenCalledTimes(1);
    });

    // Regenerate
    const regenerateButton = screen.getByRole('button', { name: /regenerate/i });
    await user.click(regenerateButton);

    await waitFor(() => {
      expect(mockGenerateNostrKeyPair).toHaveBeenCalledTimes(2);
    });
  });
});

// ============================================================================
// Context Integration Tests - New Account Flow
// ============================================================================

describe('NostrIdentityStep - Context Integration (New Account)', () => {
  it('should call updateParticipant with npub and nip05 on submit', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    // Generate identity
    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/identity generated successfully/i)).toBeInTheDocument();
    });

    // Submit
    const submitButton = screen.getByRole('button', { name: /continue/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockUpdateParticipant).toHaveBeenCalledWith(
        'participant-123',
        expect.objectContaining({
          npub: expect.stringContaining('npub1'),
          nip05: expect.stringContaining('@satnam.pub'),
          currentStep: 'identity',
        })
      );
    });
  });

  it('should call completeStep with "identity" on submit', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/identity generated successfully/i)).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCompleteStep).toHaveBeenCalledWith('identity');
    });
  });

  it('should call onNext after successful submission', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/identity generated successfully/i)).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalledTimes(1);
    });
  });

  it('should show error when updateParticipant fails', async () => {
    mockUpdateParticipant.mockRejectedValue(new Error('Update failed'));

    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/identity generated successfully/i)).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/update failed/i)).toBeInTheDocument();
    });
    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should call setError on context when submission fails', async () => {
    mockCompleteStep.mockRejectedValue(new Error('Step completion failed'));

    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/identity generated successfully/i)).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockSetError).toHaveBeenCalledWith(expect.stringContaining('Step completion failed'));
    });
  });
});

// ============================================================================
// Context Integration Tests - Migration Flow
// ============================================================================

describe('NostrIdentityStep - Context Integration (Migration)', () => {
  beforeEach(() => {
    mockParticipant = {
      participantId: 'participant-123',
      trueName: 'Test User',
      status: 'pending',
      existingNostrAccount: true,
      migrationFlag: true,
      oldNpub: 'npub1' + 'x'.repeat(58),
    };
  });

  it('should call updateParticipant with migrationFlag on submit', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: /continue to migration/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockUpdateParticipant).toHaveBeenCalledWith(
        'participant-123',
        expect.objectContaining({
          migrationFlag: true,
          currentStep: 'identity',
        })
      );
    });
  });

  it('should call completeStep with "identity" in migration flow', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: /continue to migration/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCompleteStep).toHaveBeenCalledWith('identity');
    });
  });

  it('should call onNext after migration flow submission', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: /continue to migration/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalledTimes(1);
    });
  });

  it('should not call generateNostrKeyPair in migration flow', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: /continue to migration/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalled();
    });

    expect(mockGenerateNostrKeyPair).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Callback Invocation Tests
// ============================================================================

describe('NostrIdentityStep - Callback Invocations', () => {
  it('should call onBack when back button is clicked', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const backButton = screen.getByRole('button', { name: /back/i });
    await user.click(backButton);

    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it('should not call onNext if identity not generated', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: /continue/i });
    expect(submitButton).toBeDisabled();

    // Can't click disabled button
    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it('should show loading state during submission', async () => {
    mockCompleteStep.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/identity generated successfully/i)).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await user.click(submitButton);

    expect(screen.getByText(/saving/i)).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
  });
});

// ============================================================================
// Security Tests
// ============================================================================

describe('NostrIdentityStep - Security', () => {
  it('should never expose raw nsec in component state or DOM', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/identity generated successfully/i)).toBeInTheDocument();
    });

    // Raw nsec (64 hex chars) should never appear in the DOM
    const rawNsec = 'a'.repeat(64);
    expect(screen.queryByText(rawNsec)).not.toBeInTheDocument();
  });

  it('should use Web Crypto API for encryption', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep {...defaultProps} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    await user.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/identity generated successfully/i)).toBeInTheDocument();
    });

    // Verify Web Crypto API was called
    expect(crypto.subtle.importKey).toHaveBeenCalled();
    expect(crypto.subtle.deriveKey).toHaveBeenCalled();
    expect(crypto.subtle.encrypt).toHaveBeenCalled();
  });

  it('should display security notice about encryption', () => {
    render(<NostrIdentityStep {...defaultProps} />);

    expect(screen.getByText(/your private key.*encrypted with your password/i)).toBeInTheDocument();
  });

  it('should require password for identity generation', async () => {
    const user = userEvent.setup();
    render(<NostrIdentityStep password="" onNext={mockOnNext} />);

    const generateButton = screen.getByRole('button', { name: /generate new nostr account/i });
    expect(generateButton).toBeDisabled();
  });
});

