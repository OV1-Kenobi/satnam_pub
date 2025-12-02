/**
 * Family Foundry Wizard Integration Tests
 * 
 * Tests for the complete wizard flow including:
 * - Backend API calls
 * - Error handling
 * - Progress tracking
 * - State management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FamilyFoundryWizard from '../FamilyFoundryWizard';
import * as familyFoundryApi from '../../lib/family-foundry-api';

// Mock the API module
vi.mock('../../lib/family-foundry-api', () => ({
  createFamilyFoundry: vi.fn(),
  mapTrustedPeersToMembers: vi.fn(),
}));

// Mock child components
vi.mock('../FamilyFoundryStep1Charter', () => ({
  default: ({ onNext }: any) => (
    <button onClick={onNext}>Next from Step 1</button>
  ),
}));

vi.mock('../FamilyFoundryStep2RBAC', () => ({
  default: ({ onNext }: any) => (
    <button onClick={onNext}>Next from Step 2</button>
  ),
}));

vi.mock('../FamilyFoundryStep3Invite', () => ({
  default: ({ onNext }: any) => (
    <button onClick={onNext}>Next from Step 3</button>
  ),
}));

describe('FamilyFoundryWizard Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the wizard with initial step', () => {
    const onComplete = vi.fn();
    render(<FamilyFoundryWizard onComplete={onComplete} />);
    
    // Should show step 1 initially
    expect(screen.getByText(/Charter Definition/i)).toBeInTheDocument();
  });

  it('should call backend API after RBAC step', async () => {
    const onComplete = vi.fn();
    const mockMembers = [
      { user_duid: 'duid-1', role: 'guardian', relationship: 'kin' },
    ];

    vi.mocked(familyFoundryApi.mapTrustedPeersToMembers).mockResolvedValue(
      mockMembers
    );

    vi.mocked(familyFoundryApi.createFamilyFoundry).mockResolvedValue({
      success: true,
      data: {
        charterId: 'charter-123',
        federationId: 'fed-123',
        federationDuid: 'duid-fed-123',
        familyName: 'Test Family',
        foundingDate: '2024-01-01',
        status: 'active',
      },
    });

    render(<FamilyFoundryWizard onComplete={onComplete} />);

    // Navigate to RBAC step
    const nextButton = screen.getByText('Next from Step 1');
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Next from Step 2')).toBeInTheDocument();
    });

    // Click next from RBAC step to trigger backend call
    const rbacNextButton = screen.getByText('Next from Step 2');
    fireEvent.click(rbacNextButton);

    // Wait for API call
    await waitFor(() => {
      expect(familyFoundryApi.mapTrustedPeersToMembers).toHaveBeenCalled();
    });
  });

  it('should handle API errors gracefully', async () => {
    const onComplete = vi.fn();
    const errorMessage = 'Failed to create federation';

    vi.mocked(familyFoundryApi.mapTrustedPeersToMembers).mockRejectedValue(
      new Error(errorMessage)
    );

    render(<FamilyFoundryWizard onComplete={onComplete} />);

    // Navigate to RBAC step
    const nextButton = screen.getByText('Next from Step 1');
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Next from Step 2')).toBeInTheDocument();
    });

    // Click next from RBAC step
    const rbacNextButton = screen.getByText('Next from Step 2');
    fireEvent.click(rbacNextButton);

    // Wait for error to be displayed
    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('should show progress during federation creation', async () => {
    const onComplete = vi.fn();

    vi.mocked(familyFoundryApi.mapTrustedPeersToMembers).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve([
                { user_duid: 'duid-1', role: 'guardian', relationship: 'kin' },
              ]),
            100
          )
        )
    );

    vi.mocked(familyFoundryApi.createFamilyFoundry).mockResolvedValue({
      success: true,
      data: {
        charterId: 'charter-123',
        federationId: 'fed-123',
        federationDuid: 'duid-fed-123',
        familyName: 'Test Family',
        foundingDate: '2024-01-01',
        status: 'active',
      },
    });

    render(<FamilyFoundryWizard onComplete={onComplete} />);

    // Navigate to RBAC step
    const nextButton = screen.getByText('Next from Step 1');
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Next from Step 2')).toBeInTheDocument();
    });

    // Click next from RBAC step
    const rbacNextButton = screen.getByText('Next from Step 2');
    fireEvent.click(rbacNextButton);

    // Progress should be visible
    await waitFor(() => {
      expect(screen.getByText(/Creating Federation/i)).toBeInTheDocument();
    });
  });
});

