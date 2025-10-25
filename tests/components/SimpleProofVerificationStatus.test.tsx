/**
 * SimpleProofVerificationStatus Component Tests
 * Phase 2B-2 Day 10: SimpleProof UI Components - Part 1
 *
 * Test coverage:
 * - Feature flag gating
 * - Compact view rendering
 * - Detailed view rendering
 * - Copy functionality
 * - External link functionality
 * - Timestamp formatting
 * - Cached status display
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimpleProofVerificationStatus } from '../../src/components/identity/SimpleProofVerificationStatus';
import * as toastService from '../../src/services/toastService';

// Mock toast service
vi.mock('../../src/services/toastService', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
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

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(() => Promise.resolve()),
  },
});

// Mock window.open
global.window.open = vi.fn();

describe('SimpleProofVerificationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Feature Flag Gating', () => {
    it('should render when feature flag is enabled', () => {
      const { container } = render(
        <SimpleProofVerificationStatus
          verified={true}
          otsProof="mock_ots_proof"
          bitcoinBlock={800000}
          bitcoinTx={"a".repeat(64)}
        />
      );

      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('Compact View', () => {
    it('should render compact view for verified status', () => {
      render(
        <SimpleProofVerificationStatus
          verified={true}
          compact={true}
        />
      );

      const statusElement = screen.getByRole('status');
      expect(statusElement).toBeTruthy();
      expect(statusElement.getAttribute('aria-label')).toBe('SimpleProof verification status: verified');
    });

    it('should render compact view for unverified status', () => {
      render(
        <SimpleProofVerificationStatus
          verified={false}
          compact={true}
        />
      );

      const statusElement = screen.getByRole('status');
      expect(statusElement).toBeTruthy();
      expect(statusElement.getAttribute('aria-label')).toBe('SimpleProof verification status: not verified');
    });

    it('should show cached indicator in compact view', () => {
      render(
        <SimpleProofVerificationStatus
          verified={true}
          compact={true}
          cached={true}
        />
      );

      const statusElement = screen.getByRole('status');
      expect(statusElement.getAttribute('title')).toContain('(cached)');
    });
  });

  describe('Detailed View', () => {
    it('should render detailed view with all verification data', () => {
      render(
        <SimpleProofVerificationStatus
          verified={true}
          otsProof="mock_ots_proof_data_here"
          bitcoinBlock={800000}
          bitcoinTx={"a".repeat(64)}
          verifiedAt={Math.floor(Date.now() / 1000) - 3600}
        />
      );

      expect(screen.getByText('SimpleProof Blockchain Verification')).toBeTruthy();
      expect(screen.getByText('Verified on Bitcoin blockchain')).toBeTruthy();
      expect(screen.getByText('#800,000')).toBeTruthy();
    });

    it('should render pending state when not verified', () => {
      render(
        <SimpleProofVerificationStatus
          verified={false}
        />
      );

      expect(screen.getByText('Pending blockchain verification')).toBeTruthy();
      expect(screen.getByText(/Blockchain verification is pending/)).toBeTruthy();
    });

    it('should show cached indicator in detailed view', () => {
      render(
        <SimpleProofVerificationStatus
          verified={true}
          otsProof="mock_ots_proof"
          bitcoinBlock={800000}
          bitcoinTx={"a".repeat(64)}
          verifiedAt={Math.floor(Date.now() / 1000) - 3600}
          cached={true}
        />
      );

      expect(screen.getByText('(cached)')).toBeTruthy();
    });
  });

  describe('Copy Functionality', () => {
    it('should copy OTS proof to clipboard', async () => {
      const mockProof = 'mock_ots_proof_data_here';

      render(
        <SimpleProofVerificationStatus
          verified={true}
          otsProof={mockProof}
          bitcoinBlock={800000}
          bitcoinTx={"a".repeat(64)}
        />
      );

      const copyButtons = screen.getAllByRole('button');
      const copyProofButton = copyButtons.find(
        (btn) => btn.getAttribute('aria-label') === 'Copy OpenTimestamps proof to clipboard'
      );

      expect(copyProofButton).toBeTruthy();

      if (copyProofButton) {
        fireEvent.click(copyProofButton);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockProof);
        expect(toastService.showToast.success).toHaveBeenCalledWith(
          'OTS proof copied to clipboard',
          { duration: 2000 }
        );
      }
    });

    it('should copy Bitcoin transaction hash to clipboard', async () => {
      const mockTxHash = "a".repeat(64);

      render(
        <SimpleProofVerificationStatus
          verified={true}
          otsProof="mock_ots_proof"
          bitcoinBlock={800000}
          bitcoinTx={mockTxHash}
        />
      );

      const copyButtons = screen.getAllByRole('button');
      const copyTxButton = copyButtons.find(
        (btn) => btn.getAttribute('aria-label') === 'Copy Bitcoin transaction hash to clipboard'
      );

      expect(copyTxButton).toBeTruthy();

      if (copyTxButton) {
        fireEvent.click(copyTxButton);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockTxHash);
        expect(toastService.showToast.success).toHaveBeenCalledWith(
          'Transaction hash copied to clipboard',
          { duration: 2000 }
        );
      }
    });
  });

  describe('External Link Functionality', () => {
    it('should open Bitcoin transaction in block explorer', () => {
      const mockTxHash = "a".repeat(64);

      render(
        <SimpleProofVerificationStatus
          verified={true}
          otsProof="mock_ots_proof"
          bitcoinBlock={800000}
          bitcoinTx={mockTxHash}
        />
      );

      const viewTxButton = screen.getByLabelText('View transaction on block explorer');
      expect(viewTxButton).toBeTruthy();

      fireEvent.click(viewTxButton);
      expect(window.open).toHaveBeenCalledWith(
        `https://mempool.space/tx/${mockTxHash}`,
        '_blank',
        'noopener,noreferrer'
      );
    });
  });

  describe('Timestamp Formatting', () => {
    it('should format recent timestamps correctly', () => {
      const now = Math.floor(Date.now() / 1000);

      render(
        <SimpleProofVerificationStatus
          verified={true}
          otsProof="mock_ots_proof"
          bitcoinBlock={800000}
          bitcoinTx={"a".repeat(64)}
          verifiedAt={now - 30} // 30 seconds ago
        />
      );

      expect(screen.getByText(/Just now/)).toBeTruthy();
    });

    it('should format hour-old timestamps correctly', () => {
      const now = Math.floor(Date.now() / 1000);

      render(
        <SimpleProofVerificationStatus
          verified={true}
          otsProof="mock_ots_proof"
          bitcoinBlock={800000}
          bitcoinTx={"a".repeat(64)}
          verifiedAt={now - 7200} // 2 hours ago
        />
      );

      expect(screen.getByText(/2h ago/)).toBeTruthy();
    });
  });

  describe('Proof Display Control', () => {
    it('should hide OTS proof when showProof is false', () => {
      render(
        <SimpleProofVerificationStatus
          verified={true}
          otsProof="mock_ots_proof_data_here"
          bitcoinBlock={800000}
          bitcoinTx={"a".repeat(64)}
          showProof={false}
        />
      );

      expect(screen.queryByText('OpenTimestamps Proof')).toBeNull();
    });

    it('should show OTS proof when showProof is true', () => {
      render(
        <SimpleProofVerificationStatus
          verified={true}
          otsProof="mock_ots_proof_data_here"
          bitcoinBlock={800000}
          bitcoinTx={"a".repeat(64)}
          showProof={true}
        />
      );

      expect(screen.getByText('OpenTimestamps Proof')).toBeTruthy();
    });
  });
});

