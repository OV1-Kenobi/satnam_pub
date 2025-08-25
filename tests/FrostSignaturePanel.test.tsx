/**
 * Test Suite for FROST Signature Panel Component
 * 
 * Tests the critical improvements:
 * 1. User feedback for transaction approval errors
 * 2. Division by zero prevention in progress calculation
 * 3. Null safety for amount formatting
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FrostSignaturePanel from '../src/components/FrostSignaturePanel';
import { FrostTransaction } from '../src/services/familyWalletApi';

// Mock transaction data for testing
const mockTransactionBase: FrostTransaction = {
  id: 'test-tx-1',
  type: 'lightning',
  amount: 1000,
  description: 'Test Lightning Payment',
  status: 'pending_signatures',
  current_signatures: 2,
  required_signatures: 3,
  created_at: '2024-12-24T10:00:00Z',
  deadline: '2024-12-25T10:00:00Z',
  participants: ['user1', 'user2', 'user3'],
  signatures: []
};

// Test data variations
const mockTransactions = {
  normal: { ...mockTransactionBase },
  zeroRequired: { ...mockTransactionBase, id: 'test-tx-2', required_signatures: 0, current_signatures: 3 },
  nullAmount: { ...mockTransactionBase, id: 'test-tx-3', amount: null as any },
  undefinedAmount: { ...mockTransactionBase, id: 'test-tx-4', amount: undefined as any },
  completed: { ...mockTransactionBase, id: 'test-tx-5', current_signatures: 3, status: 'completed' as any }
};

describe('FrostSignaturePanel', () => {
  const defaultProps = {
    pendingTransactions: [mockTransactions.normal],
    userRole: 'steward',
    canApprove: true,
    onApproveTransaction: jest.fn(),
    onRefresh: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Error Handling and User Feedback', () => {
    it('should display error toast when transaction approval fails', async () => {
      const mockOnApprove = jest.fn().mockRejectedValue(new Error('Network error'));
      
      render(
        <FrostSignaturePanel
          {...defaultProps}
          onApproveTransaction={mockOnApprove}
        />
      );

      // Click approve button
      const approveButton = screen.getByText('Approve');
      fireEvent.click(approveButton);

      // Wait for error toast to appear
      await waitFor(() => {
        expect(screen.getByText('Transaction Approval Failed')).toBeInTheDocument();
        expect(screen.getByText(/Failed to approve transaction: Network error/)).toBeInTheDocument();
      });

      // Verify error toast has dismiss button
      const dismissButton = screen.getByLabelText('Dismiss error');
      expect(dismissButton).toBeInTheDocument();
    });

    it('should auto-dismiss error toast after 5 seconds', async () => {
      jest.useFakeTimers();
      const mockOnApprove = jest.fn().mockRejectedValue(new Error('Timeout'));
      
      render(
        <FrostSignaturePanel
          {...defaultProps}
          onApproveTransaction={mockOnApprove}
        />
      );

      // Trigger error
      fireEvent.click(screen.getByText('Approve'));
      
      await waitFor(() => {
        expect(screen.getByText('Transaction Approval Failed')).toBeInTheDocument();
      });

      // Fast-forward 5 seconds
      jest.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(screen.queryByText('Transaction Approval Failed')).not.toBeInTheDocument();
      });

      jest.useRealTimers();
    });

    it('should manually dismiss error toast when X button is clicked', async () => {
      const mockOnApprove = jest.fn().mockRejectedValue(new Error('Manual test'));
      
      render(
        <FrostSignaturePanel
          {...defaultProps}
          onApproveTransaction={mockOnApprove}
        />
      );

      // Trigger error
      fireEvent.click(screen.getByText('Approve'));
      
      await waitFor(() => {
        expect(screen.getByText('Transaction Approval Failed')).toBeInTheDocument();
      });

      // Click dismiss button
      fireEvent.click(screen.getByLabelText('Dismiss error'));

      await waitFor(() => {
        expect(screen.queryByText('Transaction Approval Failed')).not.toBeInTheDocument();
      });
    });

    it('should clear error notification on successful approval', async () => {
      const mockOnApprove = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce(undefined);
      
      render(
        <FrostSignaturePanel
          {...defaultProps}
          onApproveTransaction={mockOnApprove}
        />
      );

      // First approval fails
      fireEvent.click(screen.getByText('Approve'));
      
      await waitFor(() => {
        expect(screen.getByText('Transaction Approval Failed')).toBeInTheDocument();
      });

      // Second approval succeeds
      fireEvent.click(screen.getByText('Approve'));
      
      await waitFor(() => {
        expect(screen.queryByText('Transaction Approval Failed')).not.toBeInTheDocument();
      });
    });
  });

  describe('Division by Zero Prevention', () => {
    it('should handle zero required signatures correctly', () => {
      render(
        <FrostSignaturePanel
          {...defaultProps}
          pendingTransactions={[mockTransactions.zeroRequired]}
        />
      );

      // Should show 100% progress
      expect(screen.getByText('100%')).toBeInTheDocument();
      
      // Should show completion message
      expect(screen.getByText('✅ All required signatures collected - Transaction ready for settlement')).toBeInTheDocument();
      
      // Progress bar should be full (green)
      const progressBar = document.querySelector('.bg-green-500');
      expect(progressBar).toHaveStyle({ width: '100%' });
    });

    it('should calculate progress correctly for normal transactions', () => {
      render(
        <FrostSignaturePanel
          {...defaultProps}
          pendingTransactions={[mockTransactions.normal]}
        />
      );

      // Should show 67% progress (2/3 * 100 = 66.67, rounded to 67)
      expect(screen.getByText('67%')).toBeInTheDocument();
      
      // Should not show completion message
      expect(screen.queryByText('All required signatures collected')).not.toBeInTheDocument();
    });

    it('should show green progress bar when signatures are complete', () => {
      render(
        <FrostSignaturePanel
          {...defaultProps}
          pendingTransactions={[mockTransactions.completed]}
        />
      );

      // Should show 100% progress
      expect(screen.getByText('100%')).toBeInTheDocument();
      
      // Progress bar should be green
      const progressBar = document.querySelector('.bg-green-500');
      expect(progressBar).toBeInTheDocument();
    });
  });

  describe('Null Safety for Amount Formatting', () => {
    it('should handle null amounts gracefully', () => {
      render(
        <FrostSignaturePanel
          {...defaultProps}
          pendingTransactions={[mockTransactions.nullAmount]}
        />
      );

      // Should display "0 sats" instead of crashing
      expect(screen.getByText('0 sats')).toBeInTheDocument();
    });

    it('should handle undefined amounts gracefully', () => {
      render(
        <FrostSignaturePanel
          {...defaultProps}
          pendingTransactions={[mockTransactions.undefinedAmount]}
        />
      );

      // Should display "0 sats" instead of crashing
      expect(screen.getByText('0 sats')).toBeInTheDocument();
    });

    it('should format valid amounts with en-US locale', () => {
      const largeAmountTransaction = {
        ...mockTransactionBase,
        amount: 1234567
      };

      render(
        <FrostSignaturePanel
          {...defaultProps}
          pendingTransactions={[largeAmountTransaction]}
        />
      );

      // Should format with commas using en-US locale
      expect(screen.getByText('1,234,567 sats')).toBeInTheDocument();
    });

    it('should handle zero amounts correctly', () => {
      const zeroAmountTransaction = {
        ...mockTransactionBase,
        amount: 0
      };

      render(
        <FrostSignaturePanel
          {...defaultProps}
          pendingTransactions={[zeroAmountTransaction]}
        />
      );

      // Should display "0 sats"
      expect(screen.getByText('0 sats')).toBeInTheDocument();
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle empty transaction list', () => {
      render(
        <FrostSignaturePanel
          {...defaultProps}
          pendingTransactions={[]}
        />
      );

      expect(screen.getByText('No pending transactions requiring signatures')).toBeInTheDocument();
    });

    it('should disable approve button when canApprove is false', () => {
      render(
        <FrostSignaturePanel
          {...defaultProps}
          canApprove={false}
        />
      );

      // Approve button should not be present
      expect(screen.queryByText('Approve')).not.toBeInTheDocument();
    });

    it('should show loading state during approval', async () => {
      const mockOnApprove = jest.fn(() => new Promise(resolve => setTimeout(resolve, 100)));
      
      render(
        <FrostSignaturePanel
          {...defaultProps}
          onApproveTransaction={mockOnApprove}
        />
      );

      fireEvent.click(screen.getByText('Approve'));

      // Should show loading state
      expect(screen.getByText('Approving...')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.queryByText('Approving...')).not.toBeInTheDocument();
      });
    });

    it('should handle multiple transactions with mixed states', () => {
      const mixedTransactions = [
        mockTransactions.normal,
        mockTransactions.zeroRequired,
        mockTransactions.nullAmount
      ];

      render(
        <FrostSignaturePanel
          {...defaultProps}
          pendingTransactions={mixedTransactions}
        />
      );

      // Should render all transactions
      expect(screen.getAllByText(/Test Lightning Payment/)).toHaveLength(3);
      
      // Should handle different progress states
      expect(screen.getByText('67%')).toBeInTheDocument(); // Normal transaction
      expect(screen.getByText('100%')).toBeInTheDocument(); // Zero required
      
      // Should handle different amount formats
      expect(screen.getByText('1,000 sats')).toBeInTheDocument(); // Normal amount
      expect(screen.getByText('0 sats')).toBeInTheDocument(); // Null amount
    });
  });
});
