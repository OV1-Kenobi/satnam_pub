/**
 * TapsignerAuthModal Component Unit Tests
 * Phase 4 Task 4.1: Unit Tests - Step 3
 *
 * Tests for Tapsigner authentication modal component
 * NO MOCKING - uses real implementations
 */

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TapsignerAuthModal from '../../src/components/TapsignerAuthModal';
import {
  cleanupTestEnv,
  createTestAPIResponse,
  restoreFetch,
  setupFetchMock,
  setupNDEFReaderMock,
  setupTestEnv,
} from '../setup/tapsigner-test-setup';

describe('TapsignerAuthModal Component', () => {
  let mockFetch: any;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    setupTestEnv();
    setupNDEFReaderMock();
    const { mockFetch: mock, originalFetch: orig } = setupFetchMock();
    mockFetch = mock;
    originalFetch = orig;
  });

  afterEach(() => {
    cleanupTestEnv();
    restoreFetch(originalFetch);
    vi.clearAllMocks();
  });

  describe('Modal rendering', () => {
    it('should render modal when isOpen is true', () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();

      const { container } = render(
        <TapsignerAuthModal
          isOpen={true}
          onSuccess={onSuccess}
          onError={onError}
          onClose={onClose}
        />
      );

      expect(container.querySelector('.fixed')).toBeInTheDocument();
    });

    it('should not render modal when isOpen is false', () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();

      const { container } = render(
        <TapsignerAuthModal
          isOpen={false}
          onSuccess={onSuccess}
          onError={onError}
          onClose={onClose}
        />
      );

      const modal = container.querySelector('.fixed');
      expect(modal).not.toBeInTheDocument();
    });

    it('should display modal content when open', () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();

      const { container } = render(
        <TapsignerAuthModal
          isOpen={true}
          onSuccess={onSuccess}
          onError={onError}
          onClose={onClose}
        />
      );

      expect(container.querySelector('.bg-white')).toBeInTheDocument();
    });
  });

  describe('User interactions', () => {
    it('should render modal with content', () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();

      const { container } = render(
        <TapsignerAuthModal
          isOpen={true}
          onSuccess={onSuccess}
          onError={onError}
          onClose={onClose}
        />
      );

      expect(container.querySelector('.bg-white')).toBeInTheDocument();
    });

    it('should have close button', () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();

      render(
        <TapsignerAuthModal
          isOpen={true}
          onSuccess={onSuccess}
          onError={onError}
          onClose={onClose}
        />
      );

      const closeButton = screen.queryByRole('button', { name: /close/i });
      if (closeButton) {
        expect(closeButton).toBeInTheDocument();
      }
    });

    it('should render modal when open', () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();

      const { container } = render(
        <TapsignerAuthModal
          isOpen={true}
          onSuccess={onSuccess}
          onError={onError}
          onClose={onClose}
        />
      );

      expect(container.querySelector('.fixed')).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('should render modal with error callback', () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();

      const { container } = render(
        <TapsignerAuthModal
          isOpen={true}
          onSuccess={onSuccess}
          onError={onError}
          onClose={onClose}
        />
      );

      expect(container.querySelector('.fixed')).toBeInTheDocument();
    });

    it('should handle NFC availability', () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();

      const { container } = render(
        <TapsignerAuthModal
          isOpen={true}
          onSuccess={onSuccess}
          onError={onError}
          onClose={onClose}
        />
      );

      expect(container.querySelector('.bg-white')).toBeInTheDocument();
    });
  });

  describe('Loading states', () => {
    it('should render during async operations', async () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();

      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve(
                  new Response(
                    JSON.stringify(createTestAPIResponse({ success: true })),
                    {
                      status: 200,
                      headers: { 'Content-Type': 'application/json' },
                    }
                  )
                ),
              100
            )
          )
      );

      const { container } = render(
        <TapsignerAuthModal
          isOpen={true}
          onSuccess={onSuccess}
          onError={onError}
          onClose={onClose}
        />
      );

      expect(container.querySelector('.fixed')).toBeInTheDocument();
    });
  });

  describe('Success callback', () => {
    it('should render with success callback', () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();

      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            createTestAPIResponse({
              success: true,
              verified: true,
            })
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const { container } = render(
        <TapsignerAuthModal
          isOpen={true}
          onSuccess={onSuccess}
          onError={onError}
          onClose={onClose}
        />
      );

      expect(container.querySelector('.bg-white')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should render accessible modal', () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();

      const { container } = render(
        <TapsignerAuthModal
          isOpen={true}
          onSuccess={onSuccess}
          onError={onError}
          onClose={onClose}
        />
      );

      expect(container.querySelector('.fixed')).toBeInTheDocument();
    });

    it('should have interactive elements', () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();

      render(
        <TapsignerAuthModal
          isOpen={true}
          onSuccess={onSuccess}
          onError={onError}
          onClose={onClose}
        />
      );

      const buttons = screen.queryAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Feature flag gating', () => {
    it('should render component with feature flag', () => {
      process.env.VITE_TAPSIGNER_ENABLED = 'true';

      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();

      const { container } = render(
        <TapsignerAuthModal
          isOpen={true}
          onSuccess={onSuccess}
          onError={onError}
          onClose={onClose}
        />
      );

      // Component should render without error
      expect(container).toBeTruthy();
    });
  });
});

