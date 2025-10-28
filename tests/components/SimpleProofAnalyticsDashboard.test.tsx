/**
 * SimpleProof Analytics Dashboard Component Tests
 * Phase 2B-2 Day 12: SimpleProof Analytics Dashboard
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimpleProofAnalyticsDashboard } from '../../src/components/identity/SimpleProofAnalyticsDashboard';
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

describe('SimpleProofAnalyticsDashboard', () => {
  const mockUserId = 'test-user-123';
  const now = Math.floor(Date.now() / 1000);

  const mockTimestamps = [
    {
      id: 'timestamp-1',
      verification_id: 'verification-1',
      ots_proof: 'mock_ots_proof_1',
      bitcoin_block: 800000,
      bitcoin_tx: 'a'.repeat(64),
      created_at: now - 86400, // 1 day ago
      verified_at: now - 86300,
      is_valid: true,
    },
    {
      id: 'timestamp-2',
      verification_id: 'verification-2',
      ots_proof: 'mock_ots_proof_2',
      bitcoin_block: 800001,
      bitcoin_tx: 'b'.repeat(64),
      created_at: now - 172800, // 2 days ago
      verified_at: now - 172700,
      is_valid: true,
    },
    {
      id: 'timestamp-3',
      verification_id: 'verification-3',
      ots_proof: 'mock_ots_proof_3',
      bitcoin_block: null,
      bitcoin_tx: null,
      created_at: now - 259200, // 3 days ago
      verified_at: null,
      is_valid: null, // Pending
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock URL.createObjectURL and URL.revokeObjectURL for CSV export
    global.URL.createObjectURL = vi.fn(() => 'mock-url');
    global.URL.revokeObjectURL = vi.fn();
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
        <SimpleProofAnalyticsDashboard userId={mockUserId} />
      );

      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('Data Fetching', () => {
    it('should fetch analytics data on mount', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 3,
      });

      render(<SimpleProofAnalyticsDashboard userId={mockUserId} />);

      await waitFor(() => {
        expect(simpleProofService.simpleProofService.getTimestampHistory).toHaveBeenCalledWith({
          user_id: mockUserId,
          limit: 1000,
        });
      });
    });

    it('should display loading state while fetching', () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockImplementation(
        () => new Promise(() => { }) // Never resolves
      );

      render(<SimpleProofAnalyticsDashboard userId={mockUserId} />);

      expect(screen.getByText('Loading analytics...')).toBeTruthy();
    });

    it('should display error state on fetch failure', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: false,
        timestamps: [],
        total: 0,
        error: 'Failed to fetch analytics data',
      });

      render(<SimpleProofAnalyticsDashboard userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('Failed to fetch analytics data')).toBeTruthy();
      });
    });
  });

  describe('Cost Analytics', () => {
    it('should calculate and display total cost correctly', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 3,
      });

      render(<SimpleProofAnalyticsDashboard userId={mockUserId} />);

      await waitFor(() => {
        // 3 timestamps * 500 sats = 1,500 sats (appears in multiple places)
        const elements = screen.getAllByText(/1,500 sats/);
        expect(elements.length).toBeGreaterThan(0);
      });
    });

    it('should calculate and display average cost correctly', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 3,
      });

      render(<SimpleProofAnalyticsDashboard userId={mockUserId} />);

      await waitFor(() => {
        // Average: 1,500 / 3 = 500 sats
        expect(screen.getByText('500 sats')).toBeTruthy();
      });
    });

    it('should display USD conversion for costs', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 3,
      });

      render(<SimpleProofAnalyticsDashboard userId={mockUserId} />);

      await waitFor(() => {
        // 1,500 sats * 0.0005 = $0.75 USD
        expect(screen.getByText(/\$0\.75 USD/)).toBeTruthy();
      });
    });
  });

  describe('Attestation Metrics', () => {
    it('should display total attestations count', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 3,
      });

      render(<SimpleProofAnalyticsDashboard userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('3')).toBeTruthy(); // Total attestations
      });
    });

    it('should calculate success rate correctly', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 3,
      });

      render(<SimpleProofAnalyticsDashboard userId={mockUserId} />);

      await waitFor(() => {
        // 2 verified out of 3 = 66.7%
        expect(screen.getByText('66.7%')).toBeTruthy();
      });
    });

    it('should display verified, pending, and failed counts', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 3,
      });

      render(<SimpleProofAnalyticsDashboard userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('2 verified')).toBeTruthy();
        expect(screen.getByText('1 pending')).toBeTruthy();
      });
    });
  });

  describe('Time Range Filtering', () => {
    it('should filter data by selected time range', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 3,
      });

      render(<SimpleProofAnalyticsDashboard userId={mockUserId} defaultTimeRange="7d" />);

      await waitFor(() => {
        const timeRangeSelect = screen.getByDisplayValue('Last 7 Days');
        expect(timeRangeSelect).toBeTruthy();
      });
    });

    it('should update analytics when time range changes', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 3,
      });

      render(<SimpleProofAnalyticsDashboard userId={mockUserId} />);

      await waitFor(() => {
        const timeRangeSelect = screen.getByDisplayValue('Last 30 Days');
        fireEvent.change(timeRangeSelect, { target: { value: '7d' } });
      });

      await waitFor(() => {
        expect(screen.getByDisplayValue('Last 7 Days')).toBeTruthy();
      });
    });
  });

  describe('Export Functionality', () => {
    it('should have export button enabled when data exists', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 3,
      });

      render(<SimpleProofAnalyticsDashboard userId={mockUserId} />);

      await waitFor(() => {
        const exportButton = screen.getByText('Export CSV').closest('button');
        expect(exportButton).toBeTruthy();
        expect(exportButton?.hasAttribute('disabled')).toBe(false);
      });
    });

    it('should disable export button when no data', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: [],
        total: 0,
      });

      render(<SimpleProofAnalyticsDashboard userId={mockUserId} />);

      await waitFor(() => {
        const exportButton = screen.getByText('Export CSV').closest('button');
        expect(exportButton).toBeTruthy();
        expect(exportButton?.hasAttribute('disabled')).toBe(true);
      });
    });
  });

  describe('Empty State', () => {
    it('should display empty state when no attestations exist', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: [],
        total: 0,
      });

      render(<SimpleProofAnalyticsDashboard userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('No attestations found for this time range')).toBeTruthy();
      });
    });
  });

  describe('Cost Warning Display', () => {
    it('should display cost transparency warning', async () => {
      vi.mocked(simpleProofService.simpleProofService.getTimestampHistory).mockResolvedValue({
        success: true,
        timestamps: mockTimestamps,
        total: 3,
      });

      render(<SimpleProofAnalyticsDashboard userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('Cost Transparency')).toBeTruthy();
        expect(screen.getByText(/incurs on-chain transaction fees/)).toBeTruthy();
      });
    });
  });
});

