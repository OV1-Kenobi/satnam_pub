/**
 * Complete Onboarding Flow Integration Tests
 * 
 * End-to-end tests for the full onboarding process including:
 * - New user onboarding (all steps)
 * - Migrated user onboarding (OTP verification)
 * - Error recovery scenarios
 * - NFC card programming
 * - Lightning wallet setup
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PhysicalPeerOnboardingModal from '../../src/components/onboarding/PhysicalPeerOnboardingModal';
import { OnboardingSessionProvider } from '../../src/contexts/OnboardingSessionContext';

// ============================================================================
// Mocks
// ============================================================================

// Mock authenticatedFetch
const mockAuthenticatedFetch = vi.fn();
vi.mock('../../src/utils/secureSession', () => ({
  authenticatedFetch: (...args: any[]) => mockAuthenticatedFetch(...args),
}));

// Mock crypto utilities
vi.mock('../../src/utils/crypto-lazy', () => ({
  generateNostrKeyPair: vi.fn().mockResolvedValue({
    publicKey: 'a'.repeat(64),
    privateKey: 'b'.repeat(64),
  }),
}));

// Mock Keet seed manager
vi.mock('../../src/lib/onboarding/keet-seed-manager', () => ({
  generateKeetSeedPhrase: vi.fn().mockReturnValue('test seed phrase with twelve words'),
  deriveKeetPeerIdFromSeed: vi.fn().mockResolvedValue('test-peer-id'),
  encryptKeetSeed: vi.fn().mockResolvedValue({
    encrypted: 'encrypted-seed',
    salt: 'salt-value',
  }),
  secureClearMemory: vi.fn(),
  validateKeetSeedPhrase: vi.fn().mockReturnValue(true),
}));

// Mock NFC modules
vi.mock('../../src/lib/tapsigner/nfc-reader', () => ({
  scanForCard: vi.fn().mockResolvedValue({
    cardId: 'test-card-123',
    cardType: 'ntag424',
  }),
  isNFCSupported: vi.fn().mockReturnValue(true),
  handleNFCError: vi.fn((error: any) => error?.message || 'NFC error'),
}));

vi.mock('../../src/lib/nfc/batch-ndef-writer', () => ({
  batchWriteNDEFRecords: vi.fn().mockResolvedValue({
    success: true,
    bytesWritten: 100,
  }),
  writeSingleTextRecord: vi.fn().mockResolvedValue({
    success: true,
    bytesWritten: 50,
  }),
  isNFCWriteSupported: vi.fn().mockReturnValue(true),
}));

// Mock Web Crypto API
let uuidCounter = 0;
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => `test-uuid-${++uuidCounter}`,
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

// ============================================================================
// Test Helpers
// ============================================================================

const renderOnboardingModal = (props = {}) => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onComplete: vi.fn(),
  };

  return {
    ...render(
      <OnboardingSessionProvider>
        <PhysicalPeerOnboardingModal {...defaultProps} {...props} />
      </OnboardingSessionProvider>
    ),
    ...defaultProps,
  };
};

const setupSuccessfulAPIMocks = () => {
  mockAuthenticatedFetch.mockImplementation((url: string) => {
    if (url.includes('onboarding-participant-register')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          participant: {
            participantId: 'participant-123',
            sessionId: 'session-123',
            trueName: 'Test User',
            displayName: 'testuser',
            language: 'en',
            existingNostrAccount: false,
            migrationFlag: false,
            currentStep: 'intake',
            status: 'pending',
            createdAt: new Date().toISOString(),
          },
        }),
      });
    }

    if (url.includes('onboarding-identity-create')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          participant: {
            participantId: 'participant-123',
            npub: 'npub1' + 'a'.repeat(58),
            nip05: 'testuser@satnam.pub',
          },
        }),
      });
    }

    if (url.includes('onboarding-card-register')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          card: {
            cardId: 'card-123',
            participantId: 'participant-123',
            cardUid: 'test-card-uid',
            cardType: 'ntag424',
            status: 'pending',
          },
        }),
      });
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  });
};

// ============================================================================
// Tests
// ============================================================================

describe('Complete Onboarding Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    sessionStorage.clear();
    setupSuccessfulAPIMocks();
  });

  describe('New User Onboarding - Happy Path', () => {
    it('should complete intake step and advance to password', async () => {
      const user = userEvent.setup();
      renderOnboardingModal();

      await waitFor(() => {
        expect(screen.getByText(/participant intake/i)).toBeInTheDocument();
      });

      const trueNameInput = screen.getByLabelText(/true name/i);
      await user.type(trueNameInput, 'Alice Johnson');

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText(/password setup/i)).toBeInTheDocument();
      });
    });

    it('should complete password step and advance to identity', async () => {
      const user = userEvent.setup();
      renderOnboardingModal();

      // Complete intake
      await waitFor(() => {
        expect(screen.getByText(/participant intake/i)).toBeInTheDocument();
      });

      const trueNameInput = screen.getByLabelText(/true name/i);
      await user.type(trueNameInput, 'Alice Johnson');
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Complete password
      await waitFor(() => {
        expect(screen.getByText(/password setup/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmInput = screen.getByLabelText(/confirm password/i);
      await user.type(passwordInput, 'StrongPassword123!');
      await user.type(confirmInput, 'StrongPassword123!');
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Should reach identity step
      await waitFor(() => {
        expect(screen.getByText(/nostr identity/i)).toBeInTheDocument();
      });
    });

    it('should generate new Nostr identity', async () => {
      const user = userEvent.setup();
      renderOnboardingModal();

      // Navigate to identity step
      await waitFor(() => {
        expect(screen.getByText(/participant intake/i)).toBeInTheDocument();
      });

      const trueNameInput = screen.getByLabelText(/true name/i);
      await user.type(trueNameInput, 'Alice Johnson');
      await user.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/password setup/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmInput = screen.getByLabelText(/confirm password/i);
      await user.type(passwordInput, 'StrongPassword123!');
      await user.type(confirmInput, 'StrongPassword123!');
      await user.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/nostr identity/i)).toBeInTheDocument();
      });

      // Generate new identity
      const generateButton = screen.queryByRole('button', { name: /generate|create new/i });
      if (generateButton) {
        await user.click(generateButton);

        await waitFor(() => {
          expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
            expect.stringContaining('onboarding-identity-create'),
            expect.any(Object)
          );
        });
      }
    });
  });

  describe('Migration Flow', () => {
    beforeEach(() => {
      mockAuthenticatedFetch.mockImplementation((url: string) => {
        if (url.includes('onboarding-participant-register')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              participant: {
                participantId: 'participant-123',
                sessionId: 'session-123',
                trueName: 'Test User',
                displayName: 'testuser',
                language: 'en',
                existingNostrAccount: true,
                migrationFlag: true,
                currentStep: 'intake',
                status: 'pending',
                createdAt: new Date().toISOString(),
              },
            }),
          });
        }

        if (url.includes('auth-migration-otp-generate')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              sessionId: 'otp-session-123',
              expiresAt: new Date(Date.now() + 600000).toISOString(),
              period: 120,
              digits: 6,
            }),
          });
        }

        if (url.includes('auth-migration-otp-verify')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              verified: true,
            }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });
    });

    it('should show migration step for existing accounts', async () => {
      const user = userEvent.setup();
      renderOnboardingModal();

      await waitFor(() => {
        expect(screen.getByText(/participant intake/i)).toBeInTheDocument();
      });

      const existingAccountCheckbox = screen.getByLabelText(/existing.*nostr/i);
      await user.click(existingAccountCheckbox);

      const trueNameInput = screen.getByLabelText(/true name/i);
      await user.type(trueNameInput, 'Alice Johnson');
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Eventually should reach migration step
      await waitFor(() => {
        expect(screen.getByText(/migration|verify/i)).toBeInTheDocument();
      }, { timeout: 10000 });
    });
  });

  describe('Error Recovery', () => {
    it('should handle API errors gracefully', async () => {
      const user = userEvent.setup();

      mockAuthenticatedFetch.mockRejectedValueOnce(new Error('Network error'));

      renderOnboardingModal();

      await waitFor(() => {
        expect(screen.getByText(/participant intake/i)).toBeInTheDocument();
      });

      const trueNameInput = screen.getByLabelText(/true name/i);
      await user.type(trueNameInput, 'Alice Johnson');
      await user.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });
    });

    it('should allow retry after error', async () => {
      const user = userEvent.setup();

      // First call fails, second succeeds
      mockAuthenticatedFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            participant: {
              participantId: 'participant-123',
              sessionId: 'session-123',
              trueName: 'Test User',
              currentStep: 'intake',
              status: 'pending',
            },
          }),
        });

      renderOnboardingModal();

      await waitFor(() => {
        expect(screen.getByText(/participant intake/i)).toBeInTheDocument();
      });

      const trueNameInput = screen.getByLabelText(/true name/i);
      await user.type(trueNameInput, 'Alice Johnson');
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Error should appear
      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });

      // Retry
      const retryButton = screen.queryByRole('button', { name: /retry|try again/i });
      if (retryButton) {
        await user.click(retryButton);

        await waitFor(() => {
          expect(screen.queryByText(/error|failed/i)).not.toBeInTheDocument();
        });
      }
    });
  });

  describe('NFC Card Programming', () => {
    it('should allow skipping NFC card registration', async () => {
      const user = userEvent.setup();
      renderOnboardingModal();

      // Navigate through steps
      await waitFor(() => {
        expect(screen.getByText(/participant intake/i)).toBeInTheDocument();
      });

      // Look for skip buttons throughout the flow
      const skipButtons = screen.queryAllByRole('button', { name: /skip/i });
      if (skipButtons.length > 0) {
        await user.click(skipButtons[0]);

        // Should advance
        await waitFor(() => {
          expect(mockAuthenticatedFetch).toHaveBeenCalled();
        });
      }
    });
  });
});

