import { describe, it, expect, vi, beforeEach } from 'vitest';

// Dynamic import CEPS to avoid module init side-effects in tests
const importCEPS = async () => (await import('../lib/central_event_publishing_service')).central_event_publishing_service;

// Create a basic mock for SecureNsecManager singleton used inside CEPS
class SecureNsecManagerMock {
  private active = false;
  private sessionId: string | null = null;
  private remainingOps = 0;
  private timers: NodeJS.Timeout[] = [];

  getActiveSessionId() {
    return this.active ? (this.sessionId || 'sess-1') : null;
  }
  getSessionStatus(id?: string) {
    if (!this.active) return { active: false };
    return { active: this.remainingOps > 0, remainingOperations: this.remainingOps, sessionId: this.sessionId || 'sess-1' };
  }
  async useTemporaryNsec<T>(_id: string, fn: (nsecHex: string) => Promise<T>): Promise<T> {
    if (!this.active || this.remainingOps <= 0) throw new Error('Temporary nsec session not available or expired');
    this.remainingOps -= 1;
    return fn('deadbeef'.repeat(8));
  }
  clearTemporarySession() {
    this.active = false;
    this.sessionId = null;
  }
  async createPostRegistrationSession(_nsec: string, _duration?: number, maxOps?: number, _browserLifetime?: boolean) {
    this.active = true;
    this.sessionId = 'sess-1';
    this.remainingOps = typeof maxOps === 'number' ? maxOps : 50;
    return this.sessionId;
  }
}

// Inject our mock into CEPS by stubbing its module import reference
vi.mock('../src/lib/secure-nsec-manager', () => {
  const mock = new SecureNsecManagerMock();
  return {
    secureNsecManager: mock,
    SecureNsecManager: class { static getInstance() { return mock; } }
  };
});

// Mock policy to control CEPS behavior
vi.mock('../src/lib/user-signing-preferences', () => {
  return {
    userSigningPreferences: {
      async getUserPreferences() {
        return {
          sessionDurationMinutes: 15,
          maxOperationsPerSession: 50,
          sessionLifetimeMode: 'timed',
        };
      }
    }
  };
});

describe('CEPS signing policy enforcement', () => {
  let CEPS: any;

  beforeEach(async () => {
    vi.resetModules();
    CEPS = await importCEPS();
  });

  it('enforces single-use sessions: second sign fails', async () => {
    // Override policy to single-use
    vi.doMock('../src/lib/user-signing-preferences', () => ({
      userSigningPreferences: { async getUserPreferences() { return { sessionDurationMinutes: 15, maxOperationsPerSession: 1, sessionLifetimeMode: 'timed' }; } }
    }));
    CEPS = await importCEPS();

    await CEPS.initializeNsecSession({ nsec: 'nsec1xyz' } as any);

    const unsigned = { kind: 1, content: 'hello' };
    const first = await CEPS.signEventWithActiveSession(unsigned);
    expect(first.id || first.sig).toBeDefined();

    await expect(CEPS.signEventWithActiveSession(unsigned)).rejects.toThrow(
      'Signing session expired or operation limit reached'
    );
  });

  it('enforces maxOperations: third operation fails when maxOps=2', async () => {
    vi.doMock('../src/lib/user-signing-preferences', () => ({
      userSigningPreferences: { async getUserPreferences() { return { sessionDurationMinutes: 15, maxOperationsPerSession: 2, sessionLifetimeMode: 'timed' }; } }
    }));
    CEPS = await importCEPS();

    await CEPS.initializeNsecSession({ nsec: 'nsec1xyz' } as any);

    const unsigned = { kind: 1, content: 'op' };
    await CEPS.signEventWithActiveSession(unsigned);
    await CEPS.signEventWithActiveSession(unsigned);
    await expect(CEPS.signEventWithActiveSession(unsigned)).rejects.toThrow(
      'Signing session expired or operation limit reached'
    );
  });

  it('passes browserLifetime=true to SecureNsecManager when preference is browser_session', async () => {
    const browserSpy = vi.fn();
    vi.doMock('../src/lib/secure-nsec-manager', () => {
      const mock = new SecureNsecManagerMock();
      (mock as any).createPostRegistrationSession = async (_n: string, _d?: number, _m?: number, b?: boolean) => {
        browserSpy(b);
        return 'sess-1';
      };
      return { secureNsecManager: mock, SecureNsecManager: class { static getInstance() { return mock; } } };
    });
    vi.doMock('../src/lib/user-signing-preferences', () => ({
      userSigningPreferences: { async getUserPreferences() { return { sessionDurationMinutes: 15, maxOperationsPerSession: 50, sessionLifetimeMode: 'browser_session' }; } }
    }));

    CEPS = await importCEPS();
    await CEPS.initializeNsecSession({ nsec: 'nsec1xyz' } as any);
    expect(browserSpy).toHaveBeenCalledWith(true);
  });
});

