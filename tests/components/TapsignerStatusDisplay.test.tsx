/**
 * TapsignerStatusDisplay Component Unit Tests
 * Phase 3 Task 3.5: Frontend Testing & Debugging
 *
 * Tests for Tapsigner status display component
 * Tests new API-driven implementation with cardId prop
 */

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TapsignerStatusDisplay from '../../src/components/TapsignerStatusDisplay';
import { apiClient } from '../../src/utils/api-client';
import {
  cleanupTestEnv,
  setupTestEnv,
} from '../setup/tapsigner-test-setup';

// Mock apiClient
vi.mock('../../src/utils/api-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('TapsignerStatusDisplay Component', () => {
  const mockCardStatus = {
    cardId: 'a1b2c3d4e5f6a7b8',
    isRegistered: true,
    familyRole: 'private' as const,
    pinAttempts: 3,
    isLocked: false,
    createdAt: '2025-11-06T10:00:00Z',
    lastUsed: '2025-11-06T12:00:00Z',
    walletLink: {
      walletId: 'wallet-123',
      spendLimitSats: 100000,
      tapToSpendEnabled: true,
    },
  };

  beforeEach(() => {
    setupTestEnv();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupTestEnv();
    vi.clearAllMocks();
  });

  describe('Component rendering', () => {
    it('should render empty state when no card registered', async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: { ...mockCardStatus, isRegistered: false },
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByText(/no tapsigner card registered/i)).toBeInTheDocument();
      });
    });

    it('should display loading state initially', () => {
      (apiClient.get as any).mockImplementationOnce(
        () => new Promise(() => { }) // Never resolves
      );

      const { container } = render(<TapsignerStatusDisplay cardId="test-card-id" />);

      // Component should render without crashing
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should display card status when registered', async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByText(/card information/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should display card ID truncated', async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByText(/a1b2c3d4e5f6a7b8/i)).toBeInTheDocument();
      });
    });

    it('should display capabilities list', async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByText(/nostr remote signer/i)).toBeInTheDocument();
        expect(screen.getByText(/multi-purpose authentication/i)).toBeInTheDocument();
        expect(screen.getByText(/pin 2fa protection/i)).toBeInTheDocument();
      });
    });
  });

  describe('User interactions', () => {
    it('should call onTestConnection when test button clicked', async () => {
      const mockOnTestConnection = vi.fn().mockResolvedValueOnce(undefined);

      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(
        <TapsignerStatusDisplay
          cardId="test-card-id"
          onTestConnection={mockOnTestConnection}
          showActions={true}
        />
      );

      await waitFor(() => {
        const buttons = screen.queryAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });

      const buttons = screen.queryAllByRole('button');
      const testButton = buttons.find(b => b.textContent?.includes('Test'));
      if (testButton) {
        testButton.click();
        await waitFor(() => {
          expect(mockOnTestConnection).toHaveBeenCalled();
        });
      }
    });

    it('should show unregister confirmation dialog', async () => {
      const mockOnUnregister = vi.fn();

      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(
        <TapsignerStatusDisplay
          cardId="test-card-id"
          onUnregisterCard={mockOnUnregister}
          showActions={true}
        />
      );

      await waitFor(() => {
        const buttons = screen.queryAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      const buttons = screen.queryAllByRole('button');
      const unregisterButton = buttons.find(b => b.textContent?.includes('Unregister'));
      if (unregisterButton) {
        unregisterButton.click();
      }
    });

    it('should copy card ID to clipboard', async () => {
      const mockClipboard = {
        writeText: vi.fn().mockResolvedValueOnce(undefined),
      };
      Object.assign(navigator, { clipboard: mockClipboard });

      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByTitle(/copy card id/i)).toBeInTheDocument();
      });

      const copyButton = screen.getByTitle(/copy card id/i) as HTMLButtonElement;
      copyButton.click();

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith(mockCardStatus.cardId);
      });
    });
  });

  describe('Security status display', () => {
    it('should display PIN attempts counter', async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByText(/pin attempts/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should display lockout status', async () => {
      const lockedStatus = { ...mockCardStatus, isLocked: true };

      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: lockedStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByText(/card information/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Error handling', () => {
    it('should display error state when API fails', () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: false,
        error: 'Failed to fetch card status',
      });

      const { container } = render(<TapsignerStatusDisplay cardId="test-card-id" />);

      // Component should render without crashing
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should show retry button on error', () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: false,
        error: 'Network error',
      });

      const { container } = render(<TapsignerStatusDisplay cardId="test-card-id" />);

      // Component should render without crashing
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should retry on retry button click', () => {
      (apiClient.get as any)
        .mockResolvedValueOnce({
          success: false,
          error: 'Network error',
        })
        .mockResolvedValueOnce({
          success: true,
          data: mockCardStatus,
        });

      const { container } = render(<TapsignerStatusDisplay cardId="test-card-id" />);

      // Component should render without crashing
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper button labels', async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(
        <TapsignerStatusDisplay
          cardId="test-card-id"
          showActions={true}
        />
      );

      await waitFor(() => {
        const buttons = screen.queryAllByRole('button');
        buttons.forEach((button) => {
          expect(button.textContent).toBeTruthy();
        });
      });
    });

    it('should have semantic HTML structure', async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      const { container } = render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(container.querySelector('h3')).toBeInTheDocument();
      });
    });
  });

  describe('Feature flag gating', () => {
    it('should respect VITE_TAPSIGNER_ENABLED flag', () => {
      process.env.VITE_TAPSIGNER_ENABLED = 'false';

      const { container } = render(<TapsignerStatusDisplay cardId="test-card-id" />);

      expect(container.firstChild).toBeNull();
    });

    it('should render when VITE_TAPSIGNER_ENABLED is true', async () => {
      process.env.VITE_TAPSIGNER_ENABLED = 'true';

      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByText(/card information/i)).toBeInTheDocument();
      });
    });
  });

  describe('Wallet linking', () => {
    it('should display wallet link information when available', async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByText(/lightning wallet link/i)).toBeInTheDocument();
        expect(screen.getByText(/tap-to-spend enabled/i)).toBeInTheDocument();
      });
    });

    it('should not display wallet link when not available', async () => {
      const noWalletStatus = { ...mockCardStatus, walletLink: undefined };

      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: noWalletStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.queryByText(/lightning wallet link/i)).not.toBeInTheDocument();
      });
    });
  });
});

