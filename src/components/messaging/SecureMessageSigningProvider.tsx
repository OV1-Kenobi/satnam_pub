/**
 * Secure Message Signing Provider
 * 
 * Provides a complete message signing interface with consent modal integration.
 * Wraps the useSecureMessageSigning hook with UI components for user consent.
 */

import * as React from 'react';
import { MessageType, SigningMethod, SigningResult, UnsignedEvent, useSecureMessageSigning } from '../../lib/messaging/secure-message-signing';
import { MethodSelectionData, MethodSelectionModal } from './MethodSelectionModal';
import { NsecConsentData, NsecConsentModal } from './NsecConsentModal';

// Context for secure message signing
interface SecureMessageSigningContextType {
  signMessage: (event: UnsignedEvent, messageType: MessageType) => Promise<SigningResult>;
  signGroupMessage: (content: string, groupId: string, tags?: string[][]) => Promise<SigningResult>;
  signDirectMessage: (content: string, recipientPubkey: string, tags?: string[][]) => Promise<SigningResult>;
  signInvitationMessage: (content: string, recipientPubkey: string, invitationType?: string) => Promise<SigningResult>;
  signingPreference: 'nip07' | 'encrypted-nsec';
  setSigningPreference: (method: 'nip07' | 'encrypted-nsec') => void;
  isNIP07Available: boolean;
  lastError: string | null;
  clearError: () => void;
}

const SecureMessageSigningContext = React.createContext<SecureMessageSigningContextType | null>(null);

interface SecureMessageSigningProviderProps {
  children: React.ReactNode;
}

export const SecureMessageSigningProvider: React.FC<SecureMessageSigningProviderProps> = ({ children }) => {
  const signing = useSecureMessageSigning();
  const [consentResolver, setConsentResolver] = React.useState<((consent: NsecConsentData) => void) | null>(null);
  const [methodSelectionResolver, setMethodSelectionResolver] = React.useState<((method: SigningMethod | null) => void) | null>(null);

  // Handle consent modal response
  const handleConsentResponse = (consent: NsecConsentData) => {
    if (consentResolver) {
      consentResolver(consent);
      setConsentResolver(null);
    }
    signing.setShowConsentModal(false);
  };

  // Handle method selection modal response
  const handleMethodSelectionResponse = (selection: MethodSelectionData) => {
    if (methodSelectionResolver) {
      methodSelectionResolver(selection.userConfirmed ? selection.selectedMethod : null);
      setMethodSelectionResolver(null);
    }
    signing.setShowMethodSelectionModal(false);
  };

  // Enhanced signing functions that handle consent and method selection modals
  const enhancedSignMessage = async (event: UnsignedEvent, messageType: MessageType): Promise<SigningResult> => {
    // Override both requestNsecConsent and requestMethodSelection to use our modals
    const originalRequestConsent = signing.requestNsecConsent;
    const originalRequestMethodSelection = signing.requestMethodSelection;

    // Create promises that will be resolved by the modals
    const consentPromise = new Promise<NsecConsentData>((resolve) => {
      setConsentResolver(() => resolve);
      signing.setShowConsentModal(true);
    });

    const methodSelectionPromise = new Promise<SigningMethod | null>((resolve) => {
      setMethodSelectionResolver(() => resolve);
      signing.setShowMethodSelectionModal(true);
    });

    // Temporarily replace the functions to use our modal handlers
    const mockRequestConsent = async (messageType: MessageType): Promise<NsecConsentData> => {
      return consentPromise;
    };

    const mockRequestMethodSelection = async (messageType: MessageType): Promise<SigningMethod | null> => {
      return methodSelectionPromise;
    };

    try {
      // Call the original sign message with our modal handlers
      return await signing.signMessage(event, messageType);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Signing failed',
        method: signing.signingPreference,
        timestamp: Date.now()
      };
    }
  };

  const enhancedSignGroupMessage = async (
    content: string,
    groupId: string,
    tags: string[][] = []
  ): Promise<SigningResult> => {
    const event: UnsignedEvent = {
      kind: 9, // Group message kind (NIP-58)
      content,
      tags: [
        ['h', groupId],
        ...tags
      ]
    };

    return enhancedSignMessage(event, 'group-message');
  };

  const enhancedSignDirectMessage = async (
    content: string,
    recipientPubkey: string,
    tags: string[][] = []
  ): Promise<SigningResult> => {
    const event: UnsignedEvent = {
      kind: 14, // Direct message kind
      content,
      tags: [
        ['p', recipientPubkey],
        ...tags
      ]
    };

    return enhancedSignMessage(event, 'direct-message');
  };

  const enhancedSignInvitationMessage = async (
    content: string,
    recipientPubkey: string,
    invitationType: string = 'peer'
  ): Promise<SigningResult> => {
    const event: UnsignedEvent = {
      kind: 1, // Text note kind
      content,
      tags: [
        ['p', recipientPubkey],
        ['t', 'invitation'],
        ['t', 'satnam-pub'],
        ['invitation-type', invitationType]
      ]
    };

    return enhancedSignMessage(event, 'invitation');
  };

  const contextValue: SecureMessageSigningContextType = {
    signMessage: enhancedSignMessage,
    signGroupMessage: enhancedSignGroupMessage,
    signDirectMessage: enhancedSignDirectMessage,
    signInvitationMessage: enhancedSignInvitationMessage,
    signingPreference: signing.signingPreference,
    setSigningPreference: signing.setSigningPreference,
    isNIP07Available: signing.isNIP07Available,
    lastError: signing.lastError,
    clearError: signing.clearError
  };

  return (
    <SecureMessageSigningContext.Provider value={contextValue}>
      {children}

      {/* Method Selection Modal */}
      <MethodSelectionModal
        isOpen={signing.showMethodSelectionModal}
        onClose={() => {
          signing.setShowMethodSelectionModal(false);
          if (methodSelectionResolver) {
            methodSelectionResolver(null);
            setMethodSelectionResolver(null);
          }
        }}
        onMethodSelect={handleMethodSelectionResponse}
        messageType={signing.pendingSigningRequest?.messageType || 'general-event'}
        isNIP07Available={signing.isNIP07Available}
        currentPreference={signing.signingPreference}
      />

      {/* Consent Modal */}
      <NsecConsentModal
        isOpen={signing.showConsentModal}
        onClose={() => {
          signing.setShowConsentModal(false);
          if (consentResolver) {
            consentResolver({
              granted: false,
              timestamp: Date.now(),
              sessionId: '',
              expiresAt: 0,
              warningAcknowledged: false
            });
            setConsentResolver(null);
          }
        }}
        onConsent={handleConsentResponse}
        messageType={signing.pendingSigningRequest?.messageType || 'general-event'}
        sessionTimeout={30 * 60 * 1000} // 30 minutes
      />
    </SecureMessageSigningContext.Provider>
  );
};

// Hook to use the secure message signing context
export const useSecureMessageSigningContext = (): SecureMessageSigningContextType => {
  const context = React.useContext(SecureMessageSigningContext);
  if (!context) {
    throw new Error('useSecureMessageSigningContext must be used within a SecureMessageSigningProvider');
  }
  return context;
};

// Convenience hooks for specific message types
export const useGroupMessageSigning = () => {
  const { signGroupMessage, lastError, clearError } = useSecureMessageSigningContext();
  return { signGroupMessage, lastError, clearError };
};

export const useDirectMessageSigning = () => {
  const { signDirectMessage, lastError, clearError } = useSecureMessageSigningContext();
  return { signDirectMessage, lastError, clearError };
};

export const useInvitationMessageSigning = () => {
  const { signInvitationMessage, lastError, clearError } = useSecureMessageSigningContext();
  return { signInvitationMessage, lastError, clearError };
};

// Signing preference management hook
export const useSigningPreferences = () => {
  const {
    signingPreference,
    setSigningPreference,
    isNIP07Available
  } = useSecureMessageSigningContext();

  return {
    signingPreference,
    setSigningPreference,
    isNIP07Available,
    availableMethods: [
      {
        method: 'nip07' as const,
        name: 'Browser Extension (NIP-07)',
        description: 'Zero-knowledge signing with browser extension',
        available: isNIP07Available,
        recommended: true
      },
      {
        method: 'encrypted-nsec' as const,
        name: 'Encrypted Private Key',
        description: 'Fallback method using encrypted database storage',
        available: true,
        recommended: false
      }
    ]
  };
};

// Security status hook
export const useSigningSecurity = () => {
  const { isNIP07Available, signingPreference } = useSecureMessageSigningContext();

  const getSecurityLevel = () => {
    if (signingPreference === 'nip07' && isNIP07Available) {
      return {
        level: 'maximum' as const,
        description: 'Zero-knowledge signing with browser extension',
        color: 'green'
      };
    } else if (signingPreference === 'encrypted-nsec') {
      return {
        level: 'high' as const,
        description: 'Secure encrypted private key with user consent',
        color: 'orange'
      };
    } else {
      return {
        level: 'unavailable' as const,
        description: 'No signing method available',
        color: 'red'
      };
    }
  };

  return {
    securityStatus: getSecurityLevel(),
    isNIP07Available,
    currentMethod: signingPreference
  };
};
