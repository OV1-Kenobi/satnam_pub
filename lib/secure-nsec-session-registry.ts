/**
 * Secure Nsec session provider registry.
 *
 * This indirection layer decouples central_event_publishing_service.ts
 * from any concrete implementation (e.g. src/lib/secure-nsec-manager.ts)
 * so we can avoid circular dependencies while preserving runtime behavior.
 */

export interface SecureNsecSessionProvider {
  createPostRegistrationSession(
    nsecInput: string,
    maxDurationMs?: number,
    maxOperations?: number,
    browserLifetime?: boolean
  ): Promise<string>;

  getActiveSessionId(): string | null;

  useTemporaryNsec<T>(
    sessionId: string,
    operation: (nsecHex: string) => Promise<T>
  ): Promise<T>;

  getSessionStatus?(
    sessionId?: string
  ): {
    active: boolean;
    remainingTime?: number;
    remainingOperations?: number;
    sessionId?: string;
  };

  clearTemporarySession?(): void;
}

let secureNsecSessionProvider: SecureNsecSessionProvider | null = null;

export function registerSecureNsecSessionProvider(
  provider: SecureNsecSessionProvider | null
): void {
  secureNsecSessionProvider = provider;
}

export function getSecureNsecSessionProvider(): SecureNsecSessionProvider | null {
  return secureNsecSessionProvider;
}

