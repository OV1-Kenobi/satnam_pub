/**
 * SimpleProofTimestampButton Component Tests
 * Phase 2B-2 Day 10: SimpleProof UI Components - Part 1
 *
 * Test coverage:
 * - Feature flag gating
 * - Button rendering and states
 * - Timestamp creation flow
 * - Success/error handling
 * - Disabled states
 * - Loading states
 * - Callback invocation
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimpleProofTimestampButton } from '../../src/components/identity/SimpleProofTimestampButton';
import * as simpleProofService from '../../src/services/simpleProofService';
import * as toastService from '../../src/services/toastService';

// Mock toast service
vi.mock('../../src/services/toastService', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock simpleProofService
vi.mock('../../src/services/simpleProofService', () => ({
  simpleProofService: {
    createTimestamp: vi.fn(),
    isEnabled: vi.fn(() => true),
  },
}));

// Mock clientConfig
vi.mock('../../src/config/env.client', () => ({
  clientConfig: {
    flags: {
      simpleproofEnabled: true,
    },
  },
}));

describe('SimpleProofTimestampButton', () => {
  const mockData = JSON.stringify({ test: 'data' });
  const mockVerificationId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Feature Flag Gating', () => {
    it('should render when feature flag is enabled', () => {
      const { container } = render(
        <SimpleProofTimestampButton
          data={mockData}
          verificationId={mockVerificationId}
        />
      );

      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('Button Rendering', () => {
    it('should render button with default text', () => {
      render(
        <SimpleProofTimestampButton
          data={mockData}
          verificationId={mockVerificationId}
        />
      );

      expect(screen.getByText('Create Blockchain Timestamp')).toBeTruthy();
    });

    it('should render button with primary variant by default', () => {
      render(
        <SimpleProofTimestampButton
          data={mockData}
          verificationId={mockVerificationId}
        />
      );

      const button = screen.getByRole('button');
      expect(button.className).toContain('bg-orange-600');
    });

    it('should render button with secondary variant', () => {
      render(
        <SimpleProofTimestampButton
          data={mockData}
          verificationId={mockVerificationId}
          variant="secondary"
        />
      );

      const button = screen.getByRole('button');
      expect(button.className).toContain('bg-purple-600');
    });

    it('should render button with outline variant', () => {
      render(
        <SimpleProofTimestampButton
          data={mockData}
          verificationId={mockVerificationId}
          variant="outline"
        />
      );

      const button = screen.getByRole('button');
      expect(button.className).toContain('bg-transparent');
    });

    it('should render button with small size', () => {
      render(
        <SimpleProofTimestampButton
          data={mockData}
          verificationId={mockVerificationId}
          size="sm"
        />
      );

      const button = screen.getByRole('button');
      expect(button.className).toContain('text-xs');
    });

    it('should render button with large size', () => {
      render(
        <SimpleProofTimestampButton
          data={mockData}
          verificationId={mockVerificationId}
          size="lg"
        />
      );

      const button = screen.getByRole('button');
      expect(button.className).toContain('text-base');
    });
  });

  describe('Disabled States', () => {
    it('should be disabled when disabled prop is true', () => {
      render(
        <SimpleProofTimestampButton
          data={mockData}
          verificationId={mockVerificationId}
          disabled={true}
        />
      );

      const button = screen.getByRole('button');
      expect(button.getAttribute('disabled')).toBe('');
    });

    it('should show "Timestamp Created" when alreadyTimestamped is true', () => {
      render(
        <SimpleProofTimestampButton
          data={mockData}
          verificationId={mockVerificationId}
          alreadyTimestamped={true}
        />
      );

      expect(screen.getByText('Timestamp Created')).toBeTruthy();
      const button = screen.getByRole('button');
      expect(button.getAttribute('disabled')).toBe('');
    });
  });

  describe('Timestamp Creation Flow', () => {
    it('should create timestamp successfully', async () => {
      const mockResult = {
        success: true,
        ots_proof: 'mock_ots_proof',
        bitcoin_block: 800000,
        bitcoin_tx: 'a'.repeat(64),
        verified_at: Math.floor(Date.now() / 1000),
      };

      vi.mocked(simpleProofService.simpleProofService.createTimestamp).mockResolvedValueOnce(mockResult);

      render(
        <SimpleProofTimestampButton
          data={mockData}
          verificationId={mockVerificationId}
        />
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText('Creating Timestamp...')).toBeTruthy();
      });

      // Should show success state
      await waitFor(() => {
        expect(screen.getByText('Timestamp Created')).toBeTruthy();
      });

      expect(toastService.showToast.success).toHaveBeenCalledWith(
        'Blockchain timestamp created successfully!',
        { duration: 5000 }
      );
    });

    it('should handle timestamp creation error', async () => {
      const mockError = {
        success: false,
        error: 'API error',
        ots_proof: '',
        bitcoin_block: null,
        bitcoin_tx: null,
        verified_at: 0,
      };

      vi.mocked(simpleProofService.simpleProofService.createTimestamp).mockResolvedValueOnce(mockError);

      render(
        <SimpleProofTimestampButton
          data={mockData}
          verificationId={mockVerificationId}
        />
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(toastService.showToast.error).toHaveBeenCalledWith(
          'Failed to create timestamp: API error',
          { duration: 5000 }
        );
      });
    });

    it('should invoke onSuccess callback on successful creation', async () => {
      const mockResult = {
        success: true,
        ots_proof: 'mock_ots_proof',
        bitcoin_block: 800000,
        bitcoin_tx: 'a'.repeat(64),
        verified_at: Math.floor(Date.now() / 1000),
      };

      const onSuccess = vi.fn();

      vi.mocked(simpleProofService.simpleProofService.createTimestamp).mockResolvedValueOnce(mockResult);

      render(
        <SimpleProofTimestampButton
          data={mockData}
          verificationId={mockVerificationId}
          onSuccess={onSuccess}
        />
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith({
          ots_proof: mockResult.ots_proof,
          bitcoin_block: mockResult.bitcoin_block,
          bitcoin_tx: mockResult.bitcoin_tx,
          verified_at: mockResult.verified_at,
        });
      });
    });

    it('should invoke onError callback on failed creation', async () => {
      const mockError = {
        success: false,
        error: 'API error',
        ots_proof: '',
        bitcoin_block: null,
        bitcoin_tx: null,
        verified_at: 0,
      };

      const onError = vi.fn();

      vi.mocked(simpleProofService.simpleProofService.createTimestamp).mockResolvedValueOnce(mockError);

      render(
        <SimpleProofTimestampButton
          data={mockData}
          verificationId={mockVerificationId}
          onError={onError}
        />
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('API error');
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading state during timestamp creation', async () => {
      vi.mocked(simpleProofService.simpleProofService.createTimestamp).mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      render(
        <SimpleProofTimestampButton
          data={mockData}
          verificationId={mockVerificationId}
        />
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Creating Timestamp...')).toBeTruthy();
        expect(button.getAttribute('aria-busy')).toBe('true');
        expect(button.getAttribute('disabled')).toBe('');
      });
    });
  });

  describe('Validation', () => {
    it('should show error when data is missing', async () => {
      render(
        <SimpleProofTimestampButton
          data=""
          verificationId={mockVerificationId}
        />
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(toastService.showToast.error).toHaveBeenCalledWith(
          'Missing required data for timestamping',
          { duration: 3000 }
        );
      });
    });

    it('should show error when verificationId is missing', async () => {
      render(
        <SimpleProofTimestampButton
          data={mockData}
          verificationId=""
        />
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(toastService.showToast.error).toHaveBeenCalledWith(
          'Missing required data for timestamping',
          { duration: 3000 }
        );
      });
    });
  });
});

