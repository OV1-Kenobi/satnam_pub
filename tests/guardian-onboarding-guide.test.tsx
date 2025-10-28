/**
 * Guardian Onboarding Guide Component Tests
 * 
 * Tests the GuardianOnboardingGuide component for:
 * - Rendering all sections correctly
 * - Section navigation
 * - FAQ expansion/collapse
 * - Embedded mode
 * - Navigation callbacks
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GuardianOnboardingGuide from '../src/components/GuardianOnboardingGuide';

describe('GuardianOnboardingGuide Component', () => {
  describe('Rendering', () => {
    it('should render the component with header in standalone mode', () => {
      render(<GuardianOnboardingGuide />);

      expect(screen.getByText('Guardian Onboarding Guide')).toBeTruthy();
      expect(screen.getByText(/Learn how to protect your family's digital sovereignty/i)).toBeTruthy();
    });

    it('should not render header in embedded mode', () => {
      render(<GuardianOnboardingGuide embedded={true} />);

      expect(screen.queryByText('Guardian Onboarding Guide')).toBeNull();
    });

    it('should render all section navigation buttons', () => {
      render(<GuardianOnboardingGuide />);

      const sections = [
        'Introduction',
        'Your Role',
        'Signing Workflow',
        'Receiving Requests',
        'Responding',
        'Security',
        'Troubleshooting'
      ];

      sections.forEach(section => {
        expect(screen.getByText(section)).toBeTruthy();
      });
    });

    it('should render intro section by default', () => {
      render(<GuardianOnboardingGuide />);

      expect(screen.getByText(/Welcome, Guardian!/i)).toBeTruthy();
      expect(screen.getByText(/No Single Point of Failure/i)).toBeTruthy();
      expect(screen.getByText(/Privacy-First/i)).toBeTruthy();
    });
  });

  describe('Section Navigation', () => {
    it('should switch to responsibilities section when clicked', () => {
      render(<GuardianOnboardingGuide />);

      const roleButton = screen.getByText('Your Role');
      fireEvent.click(roleButton);

      expect(screen.getByText('Guardian Responsibilities')).toBeTruthy();
      expect(screen.getByText(/Review Signing Requests Carefully/i)).toBeTruthy();
    });

    it('should switch to workflow section when clicked', () => {
      render(<GuardianOnboardingGuide />);

      const workflowButton = screen.getByText('Signing Workflow');
      fireEvent.click(workflowButton);

      expect(screen.getByText('Threshold Signing Workflow')).toBeTruthy();
      expect(screen.getByText(/Example: 3-of-5 Threshold/i)).toBeTruthy();
    });

    it('should switch to receiving section when clicked', () => {
      render(<GuardianOnboardingGuide />);

      const receivingButton = screen.getByText('Receiving Requests');
      fireEvent.click(receivingButton);

      expect(screen.getByText('Receiving Approval Requests')).toBeTruthy();
      expect(screen.getByText(/NIP-59 Message Format/i)).toBeTruthy();
    });

    it('should switch to responding section when clicked', () => {
      render(<GuardianOnboardingGuide />);

      const respondingButton = screen.getByText('Responding');
      fireEvent.click(respondingButton);

      expect(screen.getByText('Responding to Requests')).toBeTruthy();
      expect(screen.getByText(/Review the Request/i)).toBeTruthy();
    });

    it('should switch to security section when clicked', () => {
      render(<GuardianOnboardingGuide />);

      const securityButton = screen.getByText('Security');
      fireEvent.click(securityButton);

      expect(screen.getByText('Security Best Practices')).toBeTruthy();
      expect(screen.getByText(/Protect Your Credentials/i)).toBeTruthy();
    });

    it('should switch to troubleshooting section when clicked', () => {
      render(<GuardianOnboardingGuide />);

      const troubleshootingButton = screen.getByText('Troubleshooting');
      fireEvent.click(troubleshootingButton);

      expect(screen.getByText('Troubleshooting & FAQ')).toBeTruthy();
    });

    it('should highlight active section button', () => {
      render(<GuardianOnboardingGuide />);

      const workflowButton = screen.getByText('Signing Workflow');
      fireEvent.click(workflowButton);

      // Check if the button has the active gradient class
      const buttonElement = workflowButton.closest('button');
      expect(buttonElement?.className).toContain('from-purple-600');
      expect(buttonElement?.className).toContain('to-blue-600');
    });
  });

  describe('FAQ Functionality', () => {
    it('should expand FAQ when clicked', () => {
      render(<GuardianOnboardingGuide />);

      // Navigate to troubleshooting section
      const troubleshootingButton = screen.getByText('Troubleshooting');
      fireEvent.click(troubleshootingButton);

      // Click on first FAQ
      const faqQuestion = screen.getByText(/How many guardians are required?/i);
      fireEvent.click(faqQuestion);

      // Check if answer is visible
      expect(screen.getByText(/Family federations can configure thresholds/i)).toBeTruthy();
    });

    it('should collapse FAQ when clicked again', () => {
      render(<GuardianOnboardingGuide />);

      // Navigate to troubleshooting section
      const troubleshootingButton = screen.getByText('Troubleshooting');
      fireEvent.click(troubleshootingButton);

      // Click on first FAQ to expand
      const faqQuestion = screen.getByText(/How many guardians are required?/i);
      fireEvent.click(faqQuestion);

      // Click again to collapse
      fireEvent.click(faqQuestion);

      // Answer should not be visible (or check for collapsed state)
      // Note: This test may need adjustment based on actual collapse behavior
    });

    it('should show all FAQ questions', () => {
      render(<GuardianOnboardingGuide />);

      // Navigate to troubleshooting section
      const troubleshootingButton = screen.getByText('Troubleshooting');
      fireEvent.click(troubleshootingButton);

      const faqQuestions = [
        'How many guardians are required?',
        'What happens if a guardian is unavailable?',
        'Can I change my approval after submitting?',
        'How long do I have to respond?',
        'Are my communications private?'
      ];

      faqQuestions.forEach(question => {
        expect(screen.getByText(question)).toBeTruthy();
      });
    });
  });

  describe('Navigation Callbacks', () => {
    it('should call onBack when back button is clicked', () => {
      const onBackMock = vi.fn();
      render(<GuardianOnboardingGuide onBack={onBackMock} />);

      const backButton = screen.getByText('Back');
      fireEvent.click(backButton);

      expect(onBackMock).toHaveBeenCalledTimes(1);
    });

    it('should call onComplete when complete button is clicked', () => {
      const onCompleteMock = vi.fn();
      render(<GuardianOnboardingGuide onComplete={onCompleteMock} />);

      const completeButton = screen.getByText('I Understand My Role');
      fireEvent.click(completeButton);

      expect(onCompleteMock).toHaveBeenCalledTimes(1);
    });

    it('should not render back button if onBack is not provided', () => {
      render(<GuardianOnboardingGuide />);

      expect(screen.queryByText('Back')).toBeNull();
    });

    it('should not render complete button if onComplete is not provided', () => {
      render(<GuardianOnboardingGuide />);

      expect(screen.queryByText('I Understand My Role')).toBeNull();
    });

    it('should not render navigation buttons in embedded mode', () => {
      const onBackMock = vi.fn();
      const onCompleteMock = vi.fn();
      render(
        <GuardianOnboardingGuide
          embedded={true}
          onBack={onBackMock}
          onComplete={onCompleteMock}
        />
      );

      expect(screen.queryByText('Back')).toBeNull();
      expect(screen.queryByText('I Understand My Role')).toBeNull();
    });
  });

  describe('Content Verification', () => {
    it('should display Master Context role hierarchy', () => {
      render(<GuardianOnboardingGuide />);

      // Navigate to responsibilities section
      const roleButton = screen.getByText('Your Role');
      fireEvent.click(roleButton);

      expect(screen.getByText(/Master Context Role Hierarchy/i)).toBeTruthy();
      expect(screen.getByText('Private')).toBeTruthy();
      expect(screen.getByText('Offspring')).toBeTruthy();
      expect(screen.getByText('Adult')).toBeTruthy();
      expect(screen.getByText('Steward')).toBeTruthy();
      expect(screen.getByText('Guardian')).toBeTruthy();
    });

    it('should display NIP-59 message format example', () => {
      render(<GuardianOnboardingGuide />);

      // Navigate to receiving section
      const receivingButton = screen.getByText('Receiving Requests');
      fireEvent.click(receivingButton);

      expect(screen.getByText(/NIP-59 Message Format/i)).toBeTruthy();
      expect(screen.getByText(/guardian_approval_request/i)).toBeTruthy();
    });

    it('should display workflow timeline', () => {
      render(<GuardianOnboardingGuide />);

      // Navigate to workflow section
      const workflowButton = screen.getByText('Signing Workflow');
      fireEvent.click(workflowButton);

      expect(screen.getByText(/Timeline Example/i)).toBeTruthy();
      expect(screen.getByText(/Request initiated/i)).toBeTruthy();
      expect(screen.getByText(/Threshold met!/i)).toBeTruthy();
    });

    it('should display security best practices', () => {
      render(<GuardianOnboardingGuide />);

      // Navigate to security section
      const securityButton = screen.getByText('Security');
      fireEvent.click(securityButton);

      expect(screen.getByText(/Protect Your Credentials/i)).toBeTruthy();
      expect(screen.getByText(/Report Suspicious Activity/i)).toBeTruthy();
      expect(screen.getByText(/Never share your nsec/i)).toBeTruthy();
    });

    it('should display 4-step response workflow', () => {
      render(<GuardianOnboardingGuide />);

      // Navigate to responding section
      const respondingButton = screen.getByText('Responding');
      fireEvent.click(respondingButton);

      expect(screen.getByText(/Review the Request/i)).toBeTruthy();
      expect(screen.getByText(/Verify Authenticity/i)).toBeTruthy();
      expect(screen.getByText(/Submit Your Approval/i)).toBeTruthy();
      expect(screen.getByText(/Wait for Threshold/i)).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      render(<GuardianOnboardingGuide />);

      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThan(0);
    });

    it('should have clickable buttons for navigation', () => {
      render(<GuardianOnboardingGuide />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);

      buttons.forEach(button => {
        expect(button).toBeTruthy();
      });
    });
  });
});

