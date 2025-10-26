/**
 * SimpleProof Verification Badge Component Tests
 * Phase 2B-2 Day 11: SimpleProof UI Components - Part 2
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SimpleProofVerificationBadge } from '../../src/components/identity/SimpleProofVerificationBadge';

// Mock clientConfig
vi.mock('../../src/config/env.client', () => ({
  clientConfig: {
    flags: {
      simpleproofEnabled: true,
    },
  },
}));

describe('SimpleProofVerificationBadge', () => {
  const mockBitcoinBlock = 800000;
  const mockBitcoinTx = 'a'.repeat(64);
  const mockOtsProof = 'mock_ots_proof_data';
  const mockVerifiedAt = Math.floor(Date.now() / 1000) - 3600;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Feature Flag Gating', () => {
    it('should render when feature flag is enabled', () => {
      const { container } = render(
        <SimpleProofVerificationBadge variant="verified" />
      );

      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('Badge Variants', () => {
    it('should render verified variant with correct styling', () => {
      render(
        <SimpleProofVerificationBadge
          variant="verified"
          bitcoinBlock={mockBitcoinBlock}
          bitcoinTx={mockBitcoinTx}
          otsProof={mockOtsProof}
          verifiedAt={mockVerifiedAt}
        />
      );

      expect(screen.getByText('Blockchain Verified')).toBeTruthy();
    });

    it('should render pending variant with correct styling', () => {
      render(<SimpleProofVerificationBadge variant="pending" />);

      expect(screen.getByText('Pending Verification')).toBeTruthy();
    });

    it('should render error variant with correct styling', () => {
      render(<SimpleProofVerificationBadge variant="error" />);

      expect(screen.getByText('Verification Failed')).toBeTruthy();
    });
  });

  describe('Tooltip Functionality', () => {
    it('should show tooltip on hover when showTooltip is true', () => {
      render(
        <SimpleProofVerificationBadge
          variant="verified"
          bitcoinBlock={mockBitcoinBlock}
          showTooltip={true}
        />
      );

      const badge = screen.getByLabelText('Blockchain Verified');
      fireEvent.mouseEnter(badge);

      // Tooltip should appear (checking for Bitcoin block number in tooltip)
      expect(screen.getByText(/Verified on Bitcoin block/)).toBeTruthy();
    });

    it('should hide tooltip on mouse leave', () => {
      render(
        <SimpleProofVerificationBadge
          variant="verified"
          bitcoinBlock={mockBitcoinBlock}
          showTooltip={true}
        />
      );

      const badge = screen.getByLabelText('Blockchain Verified');
      fireEvent.mouseEnter(badge);
      fireEvent.mouseLeave(badge);

      // Tooltip should disappear
      expect(screen.queryByText(/Verified on Bitcoin block/)).toBeNull();
    });
  });

  describe('Click Functionality', () => {
    it('should open details modal when clicked (verified variant, clickable=true)', () => {
      render(
        <SimpleProofVerificationBadge
          variant="verified"
          bitcoinBlock={mockBitcoinBlock}
          bitcoinTx={mockBitcoinTx}
          otsProof={mockOtsProof}
          verifiedAt={mockVerifiedAt}
          clickable={true}
        />
      );

      const badge = screen.getByLabelText('Blockchain Verified');
      fireEvent.click(badge);

      // Modal should appear
      expect(screen.getByText('Blockchain Verification Details')).toBeTruthy();
    });

    it('should not open details modal when clickable is false', () => {
      render(
        <SimpleProofVerificationBadge
          variant="verified"
          bitcoinBlock={mockBitcoinBlock}
          bitcoinTx={mockBitcoinTx}
          otsProof={mockOtsProof}
          verifiedAt={mockVerifiedAt}
          clickable={false}
        />
      );

      const badge = screen.getByLabelText('Blockchain Verified');
      fireEvent.click(badge);

      // Modal should not appear
      expect(screen.queryByText('Blockchain Verification Details')).toBeNull();
    });

    it('should not open details modal for pending variant', () => {
      render(
        <SimpleProofVerificationBadge
          variant="pending"
          clickable={true}
        />
      );

      const badge = screen.getByLabelText('Pending Verification');
      fireEvent.click(badge);

      // Modal should not appear for pending variant
      expect(screen.queryByText('Blockchain Verification Details')).toBeNull();
    });

    it('should not open details modal for error variant', () => {
      render(
        <SimpleProofVerificationBadge
          variant="error"
          clickable={true}
        />
      );

      const badge = screen.getByLabelText('Verification Failed');
      fireEvent.click(badge);

      // Modal should not appear for error variant
      expect(screen.queryByText('Blockchain Verification Details')).toBeNull();
    });
  });

  describe('Details Modal', () => {
    it('should display verification details in modal', () => {
      render(
        <SimpleProofVerificationBadge
          variant="verified"
          bitcoinBlock={mockBitcoinBlock}
          bitcoinTx={mockBitcoinTx}
          otsProof={mockOtsProof}
          verifiedAt={mockVerifiedAt}
          clickable={true}
        />
      );

      const badge = screen.getByLabelText('Blockchain Verified');
      fireEvent.click(badge);

      // Check modal content
      expect(screen.getByText('Blockchain Verification Details')).toBeTruthy();
      expect(screen.getByText('About Blockchain Attestations')).toBeTruthy();
    });

    it('should close modal when close button is clicked', () => {
      render(
        <SimpleProofVerificationBadge
          variant="verified"
          bitcoinBlock={mockBitcoinBlock}
          bitcoinTx={mockBitcoinTx}
          otsProof={mockOtsProof}
          verifiedAt={mockVerifiedAt}
          clickable={true}
        />
      );

      const badge = screen.getByLabelText('Blockchain Verified');
      fireEvent.click(badge);

      // Modal should be open
      expect(screen.getByText('Blockchain Verification Details')).toBeTruthy();

      // Click close button
      const closeButtons = screen.getAllByLabelText('Close details');
      fireEvent.click(closeButtons[0]);

      // Modal should be closed
      expect(screen.queryByText('Blockchain Verification Details')).toBeNull();
    });

    it('should close modal when overlay is clicked', () => {
      render(
        <SimpleProofVerificationBadge
          variant="verified"
          bitcoinBlock={mockBitcoinBlock}
          bitcoinTx={mockBitcoinTx}
          otsProof={mockOtsProof}
          verifiedAt={mockVerifiedAt}
          clickable={true}
        />
      );

      const badge = screen.getByLabelText('Blockchain Verified');
      fireEvent.click(badge);

      // Modal should be open
      expect(screen.getByText('Blockchain Verification Details')).toBeTruthy();

      // Click overlay (the modal's parent div with backdrop)
      const overlay = screen.getByText('Blockchain Verification Details').closest('.fixed');
      if (overlay) {
        fireEvent.click(overlay);
      }

      // Modal should be closed
      expect(screen.queryByText('Blockchain Verification Details')).toBeNull();
    });
  });

  describe('Cost Information Display', () => {
    it('should display cost information in modal', () => {
      render(
        <SimpleProofVerificationBadge
          variant="verified"
          bitcoinBlock={mockBitcoinBlock}
          bitcoinTx={mockBitcoinTx}
          otsProof={mockOtsProof}
          verifiedAt={mockVerifiedAt}
          clickable={true}
        />
      );

      const badge = screen.getByLabelText('Blockchain Verified');
      fireEvent.click(badge);

      // Check for cost information
      expect(screen.getByText('About Blockchain Attestations')).toBeTruthy();
      expect(screen.getByText(/incurs on-chain transaction fees/)).toBeTruthy();
    });
  });
});

