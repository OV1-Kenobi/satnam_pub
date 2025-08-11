/**
 * Messaging Integration Wrapper
 * 
 * Provides secure message signing capabilities to the entire application.
 * Wraps components that need Nostr message signing functionality.
 */

import React from 'react';
import { SecureMessageSigningProvider } from './SecureMessageSigningProvider';

interface MessagingIntegrationWrapperProps {
  children: React.ReactNode;
}

export const MessagingIntegrationWrapper: React.FC<MessagingIntegrationWrapperProps> = ({ children }) => {
  return (
    <SecureMessageSigningProvider>
      {children}
    </SecureMessageSigningProvider>
  );
};

// Export convenience components for specific messaging needs
export { 
  SecureMessageSigningProvider,
  useSecureMessageSigningContext,
  useGroupMessageSigning,
  useDirectMessageSigning,
  useInvitationMessageSigning,
  useSigningPreferences,
  useSigningSecurity
} from './SecureMessageSigningProvider';
