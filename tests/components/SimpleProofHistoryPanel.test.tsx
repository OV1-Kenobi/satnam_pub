/**
 * SimpleProof History Panel Component Tests
 * Phase 2B-2 Day 11: SimpleProof UI Components - Part 2
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SimpleProofHistoryPanel } from '../../src/components/identity/SimpleProofHistoryPanel';
import * as simpleProofService from '../../src/services/simpleProofService';

// Mock simpleProofService
vi.mock('../../src/services/simpleProofService', () => ({
  simpleProofService: {
    getTimestampHistory: vi.fn(),
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

describe('SimpleProofHistoryPanel', () => {
  const mockUserId = 'test-user-123';
  const mockTimestamps = [
    {
      id: 'timestamp-1',
      verification_id: 'verification-1',
      ots_proof: 'mock_ots_proof_1',
      bitcoin_block: 800000,
      bitcoin_tx: 'a'.repeat(64),
      created_at: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      verified_at: Math.floor(Date.now() / 1000) - 3500,
      is_valid: true,
    },
    {
      id: 'timestamp-2',
      verification_id: 'verification-2',
      ots_proof: 'mock_ots_proof_2',
      bitcoin_block: null,
      bitcoin_tx: null,
      created_at: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
      verified_at: null,
      is_valid: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Feature Flag Gating', () => {
    it('should render when feature flag is enabled', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: [],
        total: 0,
      });

      const { container } = render(
        <SimpleProofHistoryPanel userId={mockUserId} />
      );

      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('Data Fetching', () => {
    it('should fetch timestamp history on mount', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 2,
      });

      render(<SimpleProofHistoryPanel userId={mockUserId} />);

      await waitFor(() => {
        expect(simpleProofService.simpleProofService.getTimestampHistory).toHaveBeenCalledWith({
          user_id: mockUserId,
          limit: 100,
        });
      });
    });

    it('should display loading state while fetching', () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<SimpleProofHistoryPanel userId={mockUserId} />);

      expect(screen.getByText('Loading attestation history...')).toBeTruthy();
    });

    it('should display error state on fetch failure', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: false,
        timestamps: [],
        total: 0,
        error: 'Failed to fetch history',
      });

      render(<SimpleProofHistoryPanel userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('Failed to fetch history')).toBeTruthy();
      });
    });
  });

  describe('Timestamp Display', () => {
    it('should display timestamps when data is loaded', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 2,
      });

      render(<SimpleProofHistoryPanel userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('2 attestations')).toBeTruthy();
      });
    });

    it('should display empty state when no timestamps exist', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: [],
        total: 0,
      });

      render(<SimpleProofHistoryPanel userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('No blockchain attestations found')).toBeTruthy();
      });
    });
  });

  describe('Filtering', () => {
    it('should filter by verified status', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 2,
      });

      render(<SimpleProofHistoryPanel userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('2 attestations')).toBeTruthy();
      });

      // Change filter to "Verified"
      const filterSelect = screen.getByDisplayValue('All Status');
      fireEvent.change(filterSelect, { target: { value: 'verified' } });

      await waitFor(() => {
        expect(screen.getByText('1 attestation')).toBeTruthy();
      });
    });

    it('should filter by pending status', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 2,
      });

      render(<SimpleProofHistoryPanel userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('2 attestations')).toBeTruthy();
      });

      // Change filter to "Pending"
      const filterSelect = screen.getByDisplayValue('All Status');
      fireEvent.change(filterSelect, { target: { value: 'pending' } });

      await waitFor(() => {
        expect(screen.getByText('1 attestation')).toBeTruthy();
      });
    });
  });

  describe('Sorting', () => {
    it('should sort by date by default', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 2,
      });

      render(<SimpleProofHistoryPanel userId={mockUserId} />);

      await waitFor(() => {
        const sortSelect = screen.getByDisplayValue('Date');
        expect(sortSelect).toBeTruthy();
      });
    });

    it('should sort by block number when selected', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 2,
      });

      render(<SimpleProofHistoryPanel userId={mockUserId} />);

      await waitFor(() => {
        const sortSelect = screen.getByDisplayValue('Date');
        fireEvent.change(sortSelect, { target: { value: 'block' } });
      });

      await waitFor(() => {
        expect(screen.getByDisplayValue('Block Number')).toBeTruthy();
      });
    });
  });

  describe('Pagination', () => {
    it('should paginate results when more than pageSize', async () => {
      const manyTimestamps = Array.from({ length: 15 }, (_, i) => ({
        id: `timestamp-${i}`,
        verification_id: `verification-${i}`,
        ots_proof: `mock_ots_proof_${i}`,
        bitcoin_block: 800000 + i,
        bitcoin_tx: 'a'.repeat(64),
        created_at: Math.floor(Date.now() / 1000) - i * 3600,
        verified_at: Math.floor(Date.now() / 1000) - i * 3600 + 100,
        is_valid: true,
      }));

      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: manyTimestamps,
        total: 15,
      });

      render(<SimpleProofHistoryPanel userId={mockUserId} pageSize={10} />);

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeTruthy();
      });
    });

    it('should navigate to next page', async () => {
      const manyTimestamps = Array.from({ length: 15 }, (_, i) => ({
        id: `timestamp-${i}`,
        verification_id: `verification-${i}`,
        ots_proof: `mock_ots_proof_${i}`,
        bitcoin_block: 800000 + i,
        bitcoin_tx: 'a'.repeat(64),
        created_at: Math.floor(Date.now() / 1000) - i * 3600,
        verified_at: Math.floor(Date.now() / 1000) - i * 3600 + 100,
        is_valid: true,
      }));

      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: manyTimestamps,
        total: 15,
      });

      render(<SimpleProofHistoryPanel userId={mockUserId} pageSize={10} />);

      await waitFor(() => {
        const nextButton = screen.getByText('Next');
        fireEvent.click(nextButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Page 2 of 2')).toBeTruthy();
      });
    });
  });

  describe('Cost Information', () => {
    it('should display cost warning when showCostInfo is true', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 2,
      });

      render(<SimpleProofHistoryPanel userId={mockUserId} showCostInfo={true} />);

      await waitFor(() => {
        expect(screen.getByText('Cost Transparency')).toBeTruthy();
      });
    });

    it('should not display cost warning when showCostInfo is false', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 2,
      });

      render(<SimpleProofHistoryPanel userId={mockUserId} showCostInfo={false} />);

      await waitFor(() => {
        expect(screen.queryByText('Cost Transparency')).toBeNull();
      });
    });
  });
});

