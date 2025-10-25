/**
 * IrohNodeManager Component Tests
 * Phase 2B-2 Week 2 Task 3: UI Components
 * 
 * Test Coverage:
 * - Feature flag gating
 * - Node ID validation
 * - Node reachability testing
 * - Add/edit/remove functionality
 * - Error handling
 * - Accessibility
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IrohNodeManager from '../../src/components/iroh/IrohNodeManager';
import { irohVerificationService } from '../../src/services/irohVerificationService';

// Mock the irohVerificationService
vi.mock('../../src/services/irohVerificationService', () => ({
  irohVerificationService: {
    verifyNode: vi.fn(),
    isEnabled: vi.fn(),
  },
}));

// Mock the toast service
vi.mock('../../src/services/toastService', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe('IrohNodeManager', () => {
  const validNodeId = 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrst'; // 52 chars: a-z (26) + 234567 (6) + a-t (20) = 52
  const invalidNodeId = 'INVALID-NODE-ID-WITH-UPPERCASE-AND-SPECIAL-CHARS!';

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock feature flag as enabled by default
    vi.stubEnv('VITE_IROH_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('Feature Flag Gating', () => {
    it('should render when VITE_IROH_ENABLED is true', () => {
      vi.stubEnv('VITE_IROH_ENABLED', 'true');

      render(<IrohNodeManager />);

      expect(screen.getAllByText(/Iroh Node/i)[0]).toBeTruthy();
    });

    it('should not render when VITE_IROH_ENABLED is false', () => {
      vi.stubEnv('VITE_IROH_ENABLED', 'false');

      const { container } = render(<IrohNodeManager />);

      expect(container.firstChild).toBeNull();
    });

    it('should not render when VITE_IROH_ENABLED is undefined', () => {
      vi.unstubAllEnvs();

      const { container } = render(<IrohNodeManager />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Node ID Validation', () => {
    it('should accept valid 52-character base32 node ID', async () => {
      render(<IrohNodeManager compact={true} />);

      const input = screen.getByPlaceholderText(/52-character base32 node ID/i);
      fireEvent.change(input, { target: { value: validNodeId } });

      await waitFor(() => {
        expect(screen.queryByText(/Invalid node ID format/i)).toBeNull();
      });
    });

    it('should reject invalid node ID format', async () => {
      render(<IrohNodeManager compact={true} />);

      const input = screen.getByPlaceholderText(/52-character base32 node ID/i);
      fireEvent.change(input, { target: { value: invalidNodeId } });

      await waitFor(() => {
        expect(screen.getByText(/Invalid node ID format/i)).toBeTruthy();
      });
    });

    it('should reject node ID with uppercase characters', async () => {
      render(<IrohNodeManager compact={true} />);

      const input = screen.getByPlaceholderText(/52-character base32 node ID/i);
      fireEvent.change(input, { target: { value: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQR' } });

      await waitFor(() => {
        expect(screen.getByText(/Invalid node ID format/i)).toBeTruthy();
      });
    });

    it('should reject node ID with incorrect length', async () => {
      render(<IrohNodeManager compact={true} />);

      const input = screen.getByPlaceholderText(/52-character base32 node ID/i);
      fireEvent.change(input, { target: { value: 'tooshort' } });

      await waitFor(() => {
        expect(screen.getByText(/Invalid node ID format/i)).toBeTruthy();
      });
    });

    it('should allow empty node ID (optional field)', async () => {
      render(<IrohNodeManager compact={true} />);

      const input = screen.getByPlaceholderText(/52-character base32 node ID/i);
      fireEvent.change(input, { target: { value: '' } });

      await waitFor(() => {
        expect(screen.queryByText(/Invalid node ID format/i)).toBeNull();
      });
    });
  });

  describe('Node Reachability Testing', () => {
    it('should call verifyNode when test button is clicked', async () => {
      const mockVerifyNode = vi.mocked(irohVerificationService.verifyNode);
      mockVerifyNode.mockResolvedValue({
        success: true,
        is_reachable: true,
        relay_url: 'https://relay.iroh.computer',
        direct_addresses: ['192.168.1.1:4433'],
        last_seen: Math.floor(Date.now() / 1000),
        cached: false,
      });

      render(<IrohNodeManager nodeId={validNodeId} compact={true} showTestButton={true} />);

      const testButton = screen.getByRole('button', { name: /Test node reachability/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(mockVerifyNode).toHaveBeenCalledWith({ node_id: validNodeId });
      });
    });

    it('should display success message when node is reachable', async () => {
      const mockVerifyNode = vi.mocked(irohVerificationService.verifyNode);
      mockVerifyNode.mockResolvedValue({
        success: true,
        is_reachable: true,
        relay_url: 'https://relay.iroh.computer',
        direct_addresses: ['192.168.1.1:4433'],
        last_seen: Math.floor(Date.now() / 1000),
        cached: false,
      });

      render(<IrohNodeManager nodeId={validNodeId} compact={true} showTestButton={true} />);

      const testButton = screen.getByRole('button', { name: /Test node reachability/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText(/Node is reachable/i)).toBeTruthy();
      });
    });

    it('should display error message when node is unreachable', async () => {
      const mockVerifyNode = vi.mocked(irohVerificationService.verifyNode);
      mockVerifyNode.mockResolvedValue({
        success: false,
        is_reachable: false,
        relay_url: null,
        direct_addresses: null,
        last_seen: 0,
        cached: false,
        error: 'Node not found',
      });

      render(<IrohNodeManager nodeId={validNodeId} compact={true} showTestButton={true} />);

      const testButton = screen.getByRole('button', { name: /Test node reachability/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText(/Node is unreachable/i)).toBeTruthy();
      });
    });

    it('should handle API errors gracefully', async () => {
      const mockVerifyNode = vi.mocked(irohVerificationService.verifyNode);
      mockVerifyNode.mockRejectedValue(new Error('Network error'));

      render(<IrohNodeManager nodeId={validNodeId} compact={true} showTestButton={true} />);

      const testButton = screen.getByRole('button', { name: /Test node reachability/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText(/Node is unreachable/i)).toBeTruthy();
      });
    });

    it('should disable test button while testing', async () => {
      const mockVerifyNode = vi.mocked(irohVerificationService.verifyNode);
      // Create a promise that won't resolve during the test
      let resolvePromise: () => void;
      const testPromise = new Promise<any>((resolve) => {
        resolvePromise = () => resolve({
          success: true,
          is_reachable: true,
          relay_url: null,
          direct_addresses: null,
          last_seen: null,
          cached: false,
        });
      });
      mockVerifyNode.mockReturnValue(testPromise);

      render(<IrohNodeManager nodeId={validNodeId} compact={true} showTestButton={true} />);

      const testButton = screen.getByRole('button', { name: /Test node reachability/i });
      fireEvent.click(testButton);

      // Check that button shows "Testing..." and is disabled
      await waitFor(() => {
        const button = screen.getByText(/Testing/i).closest('button');
        expect(button).toBeTruthy();
        expect(button?.getAttribute('disabled')).toBe('');
      });
    });
  });

  describe('Compact vs Full View', () => {
    it('should render compact view when compact prop is true', () => {
      render(<IrohNodeManager compact={true} />);

      expect(screen.getByText(/Iroh Node ID \(Optional\)/i)).toBeTruthy();
      expect(screen.queryByText(/Iroh Node Configuration/i)).toBeNull();
    });

    it('should render full view when compact prop is false', () => {
      render(<IrohNodeManager compact={false} />);

      expect(screen.getByText(/Iroh Node Configuration/i)).toBeTruthy();
      expect(screen.queryByText(/Iroh Node ID \(Optional\)/i)).toBeNull();
    });
  });

  describe('onChange Callback', () => {
    it('should call onChange when node ID is saved', async () => {
      const mockOnChange = vi.fn();

      render(<IrohNodeManager compact={true} onChange={mockOnChange} />);

      const input = screen.getByPlaceholderText(/52-character base32 node ID/i);
      fireEvent.change(input, { target: { value: validNodeId } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith(validNodeId);
      });
    });

    it('should call onChange with undefined when node ID is removed', async () => {
      const mockOnChange = vi.fn();

      render(<IrohNodeManager nodeId={validNodeId} compact={false} onChange={mockOnChange} />);

      const removeButton = screen.getByRole('button', { name: /Remove node ID/i });
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith(undefined);
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<IrohNodeManager compact={true} />);

      const input = screen.getByLabelText(/Iroh node ID/i);
      expect(input).toBeTruthy();
    });

    it('should mark input as invalid when validation fails', async () => {
      render(<IrohNodeManager compact={true} />);

      const input = screen.getByPlaceholderText(/52-character base32 node ID/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: invalidNodeId } });

      await waitFor(() => {
        expect(input.getAttribute('aria-invalid')).toBe('true');
      });
    });

    it('should associate error message with input', async () => {
      render(<IrohNodeManager compact={true} />);

      const input = screen.getByPlaceholderText(/52-character base32 node ID/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: invalidNodeId } });

      await waitFor(() => {
        expect(input.getAttribute('aria-describedby')).toBe('iroh-error');
      });
    });

    it('should have role="status" for status messages', async () => {
      const mockVerifyNode = vi.mocked(irohVerificationService.verifyNode);
      mockVerifyNode.mockResolvedValue({
        success: true,
        is_reachable: true,
        relay_url: null,
        direct_addresses: null,
        last_seen: Date.now(),
        cached: false,
      });

      render(<IrohNodeManager nodeId={validNodeId} compact={true} showTestButton={true} />);

      const testButton = screen.getByRole('button', { name: /Test node reachability/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        const statusElement = screen.getByRole('status');
        expect(statusElement).toBeTruthy();
      });
    });
  });
});

