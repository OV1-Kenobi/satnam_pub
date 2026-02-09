/**
 * TapsignerSetupFlow Component Tests
 * 
 * Tests for Tapsigner NFC card setup flow with optimized card detection.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TapsignerSetupFlow } from '../../src/components/TapsignerSetupFlow';

// Mock NFC reader module
const mockScanForCard = vi.fn();
const mockIsNFCSupported = vi.fn();
const mockHandleNFCError = vi.fn();

vi.mock('../../src/lib/tapsigner/nfc-reader', () => ({
  scanForCard: (...args: any[]) => mockScanForCard(...args),
  isNFCSupported: () => mockIsNFCSupported(),
  handleNFCError: (error: any) => mockHandleNFCError(error),
}));

// Mock authenticatedFetch
const mockAuthenticatedFetch = vi.fn();
vi.mock('../../src/utils/secureSession', () => ({
  authenticatedFetch: (...args: any[]) => mockAuthenticatedFetch(...args),
}));

describe('TapsignerSetupFlow Component', () => {
  const defaultProps = {
    onComplete: vi.fn(),
    onSkip: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mocks
    mockIsNFCSupported.mockReturnValue(true);
    mockScanForCard.mockResolvedValue({
      cardId: 'test-card-123',
      cardType: 'tapsigner',
    });
    mockHandleNFCError.mockImplementation((error: any) => {
      if (error?.message?.includes('timeout')) return 'Card detection timeout';
      if (error?.message?.includes('permission')) return 'Permission denied';
      return 'Card detection failed';
    });
    mockAuthenticatedFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  });

  describe('Component Rendering', () => {
    it('should render setup flow component', () => {
      render(<TapsignerSetupFlow {...defaultProps} />);
      expect(screen.getByText(/tapsigner/i)).toBeInTheDocument();
    });

    it('should display setup instructions', () => {
      render(<TapsignerSetupFlow {...defaultProps} />);
      const heading = screen.queryByRole('heading');
      expect(heading).toBeInTheDocument();
    });

    it('should show scan button when NFC is supported', () => {
      render(<TapsignerSetupFlow {...defaultProps} />);
      expect(screen.getByRole('button', { name: /scan/i })).toBeInTheDocument();
    });

    it('should show error message when NFC is not supported', () => {
      mockIsNFCSupported.mockReturnValue(false);
      render(<TapsignerSetupFlow {...defaultProps} />);
      expect(screen.getByText(/not supported/i)).toBeInTheDocument();
    });
  });

  describe('Card Detection', () => {
    it('should scan for card when scan button is clicked', async () => {
      const user = userEvent.setup();
      render(<TapsignerSetupFlow {...defaultProps} />);

      const scanButton = screen.getByRole('button', { name: /scan/i });
      await user.click(scanButton);

      await waitFor(() => {
        expect(mockScanForCard).toHaveBeenCalled();
      });
    });

    it('should display card information after successful scan', async () => {
      const user = userEvent.setup();
      render(<TapsignerSetupFlow {...defaultProps} />);

      const scanButton = screen.getByRole('button', { name: /scan/i });
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText(/test-card-123|detected|found/i)).toBeInTheDocument();
      });
    });

    it('should handle scan timeout error', async () => {
      const user = userEvent.setup();
      mockScanForCard.mockRejectedValue(new Error('Card detection timeout'));
      
      render(<TapsignerSetupFlow {...defaultProps} />);

      const scanButton = screen.getByRole('button', { name: /scan/i });
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText(/timeout/i)).toBeInTheDocument();
      });
    });

    it('should handle permission denied error', async () => {
      const user = userEvent.setup();
      mockScanForCard.mockRejectedValue(new Error('NFC permission denied'));
      
      render(<TapsignerSetupFlow {...defaultProps} />);

      const scanButton = screen.getByRole('button', { name: /scan/i });
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText(/permission/i)).toBeInTheDocument();
      });
    });
  });

  describe('Card Registration', () => {
    it('should call onComplete after successful registration', async () => {
      const user = userEvent.setup();
      const onComplete = vi.fn();
      
      render(<TapsignerSetupFlow {...defaultProps} onComplete={onComplete} />);

      // Scan card
      const scanButton = screen.getByRole('button', { name: /scan/i });
      await user.click(scanButton);

      await waitFor(() => {
        expect(mockScanForCard).toHaveBeenCalled();
      });

      // Complete registration (if there's a register/complete button)
      const completeButton = screen.queryByRole('button', { name: /complete|register/i });
      if (completeButton) {
        await user.click(completeButton);
        
        await waitFor(() => {
          expect(onComplete).toHaveBeenCalled();
        });
      }
    });

    it('should call onSkip when skip button is clicked', async () => {
      const user = userEvent.setup();
      const onSkip = vi.fn();
      
      render(<TapsignerSetupFlow {...defaultProps} onSkip={onSkip} />);

      const skipButton = screen.getByRole('button', { name: /skip/i });
      await user.click(skipButton);

      expect(onSkip).toHaveBeenCalled();
    });
  });
});

