import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityForgeIntegration } from '../src/components/auth/AuthIntegration';
import IdentityForge from '../src/components/IdentityForge';

// Mock CEPS used by IdentityForge to decode/encode keys
vi.mock('../lib/central_event_publishing_service', () => {
  const fixedPriv = new Uint8Array(32);
  for (let i = 0; i < 32; i++) fixedPriv[i] = (i + 1) & 0xff;
  return {
    central_event_publishing_service: {
      decodeNsec: vi.fn(() => fixedPriv),
      decodeNpub: vi.fn(() => '02'.padEnd(66, 'a')), // compressed-like hex
      encodeNpub: vi.fn(() => 'npub1mockedpublickey'),
    },
  };
});

// Mock SecureTokenManager used post-registration
vi.mock('../src/lib/auth/secure-token-manager', () => {
  return {
    default: {
      initialize: vi.fn(async () => true),
      parseTokenPayload: vi.fn((token: string) => ({
        exp: Math.floor(Date.now() / 1000) + 3600,
        hashedId: 'user123',
      })),
      setAccessToken: vi.fn(() => { }),
      getAccessToken: vi.fn(() => 'jwt-token'),
    },
  };
});

// Mock NostrProfileService to avoid real relay calls and ensure quick consent dialog
vi.mock('../src/lib/nostr-profile-service', () => {
  return {
    NostrProfileService: class {
      fetchProfileMetadata = vi.fn(async (_npub?: string) => ({
        name: 'Alice',
        about: 'Test profile',
        picture: '',
        nip05: '',
        lud16: '',
      }));
    },
  };
});


// Mock unified auth hooks to avoid needing real providers
vi.mock('../src/components/auth/AuthProvider', async () => {
  // Return minimal stubs for hooks used by Integration and IdentityForge
  return {
    useAuth: () => ({
      user: null,
      sessionToken: null,
      authenticated: false,
      loading: false,
      error: null,
      accountActive: true,
      sessionValid: true,
      lastValidated: null,
      authenticateNIP05Password: vi.fn(async () => true),
      authenticateNIP07: vi.fn(async () => false),
      authenticateNFC: vi.fn(async () => false),
      validateSession: vi.fn(async () => true),
      refreshSession: vi.fn(async () => true),
      logout: vi.fn(async () => { }),
      canAccessProtectedArea: vi.fn(() => true),
      requireAuthentication: vi.fn(async () => true),
      checkAccountStatus: vi.fn(async () => true),
      clearError: vi.fn(() => { }),
      handleAuthSuccess: vi.fn(async () => true),
      isRegistrationFlow: true,
      isLoginFlow: false,
      setIsRegistrationFlow: vi.fn(() => { }),
      setIsLoginFlow: vi.fn(() => { }),
    }),
    useIdentityForge: () => ({
      isRegistrationFlow: true,
      setRegistrationFlow: vi.fn(() => { }),
      authenticateAfterRegistration: vi.fn(async () => true),
      completeRegistration: vi.fn(() => { }),
    }),
    useNostrichSignin: () => ({
      isLoginFlow: false,
      setLoginFlow: vi.fn(() => { }),
    }),
  };
});

// Mock api client used by IdentityForge registration
vi.mock('../src/utils/api-client', () => {
  return {
    apiClient: {
      storeUserData: vi.fn(async () => ({
        success: true,
        user: {
          username: 'alice',
          nip05: 'alice@satnam.pub',
          npub: 'npub1mockedpublickey',
        },
        session: { token: 'jwt-token' },
      })),
    },
  };
});

// Utility: create a fetch Response-like object
function jsonResponse(data: any, init?: { status?: number }) {
  return {
    ok: (init?.status ?? 200) < 400,
    status: init?.status ?? 200,
    headers: new Map([['content-type', 'application/json']]),
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as any;
}

describe('IdentityForge Account Migration - full integration flow', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock fetch endpoints used in the flow
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      // Username availability check (debounced)
      if (url.includes('/.netlify/functions/check-username-availability')) {
        return jsonResponse({ success: true, available: true });
      }
      // OTP generate
      if (url.includes('/.netlify/functions/auth-migration-otp-generate')) {
        const body = init?.body ? JSON.parse(init!.body as string) : {};
        if (!body?.npub || !body?.nip05) {
          return jsonResponse({ success: false, error: 'missing fields' }, { status: 400 });
        }
        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        return jsonResponse({ success: true, sessionId: 'sess-123', expiresAt, period: 120, digits: 6 });
      }
      // OTP verify
      if (url.includes('/.netlify/functions/auth-migration-otp-verify')) {
        const body = init?.body ? JSON.parse(init!.body as string) : {};
        if (body?.code === '123456') {
          return jsonResponse({ success: true });
        }
        return jsonResponse({ success: false, error: 'Invalid code' }, { status: 400 });
      }
      // Fallback for unexpected fetches in this flow
      return jsonResponse({ ok: true });
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch as any;
  });

  it('completes migration flow: username -> import nsec -> consent -> OTP -> register -> completion', async () => {
    render(
      <MemoryRouter initialEntries={['/register?mode=migration']}>
        <IdentityForgeIntegration>
          <IdentityForge onBack={() => { }} onComplete={() => { }} />
        </IdentityForgeIntegration>
      </MemoryRouter>
    );

    // Step 1: Username + password
    const usernameInput = await screen.findByPlaceholderText('Enter your username');
    fireEvent.change(usernameInput, { target: { value: 'alice' } });

    const passwordInput = screen.getByPlaceholderText('Create a strong password');
    const confirmInput = screen.getByPlaceholderText('Confirm your password');
    fireEvent.change(passwordInput, { target: { value: 'supersecure123' } });
    fireEvent.change(confirmInput, { target: { value: 'supersecure123' } });

    // Wait for availability banner
    await waitFor(() => {
      expect(screen.queryByText(/Username is available/i)).toBeTruthy();
    });

    // Continue to Step 2
    fireEvent.click(screen.getByRole('button', { name: /Forge Your Satnam Identity/i }));

    // Ensure migration path heading visible
    await screen.findByText('Forge Your Satnam Identity');

    // Enter nsec to enable full-access import
    const keyInput = await screen.findByPlaceholderText('nsec1... or npub1...');
    fireEvent.change(keyInput, { target: { value: 'nsec1' + 'x'.repeat(60) } });

    // Click Import Account
    const importBtn = screen.getByRole('button', { name: /Import Account/i });
    fireEvent.click(importBtn);

    // Proceed to OTP panel (consent dialog may be skipped in test env)
    const sendCode = await screen.findByRole('button', { name: 'Send Code' });
    fireEvent.click(sendCode);

    // Wait for sent status
    await waitFor(() => {
      expect(screen.queryByText(/Verification code sent/i)).toBeTruthy();
    });

    // Enter code and verify
    const codeInput = screen.getByPlaceholderText('••••••');
    fireEvent.change(codeInput, { target: { value: '123456' } });
    const verifyBtn = screen.getByRole('button', { name: 'Verify' });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.queryByText('Verified!')).toBeTruthy();
      expect(screen.queryByText('Ownership verified. You may continue.')).toBeTruthy();
    });

    // Continue (register identity, go to completion screen)
    const continueBtn = screen.getByRole('button', { name: 'Continue' });
    fireEvent.click(continueBtn);

    // Completion UI assertion
    await waitFor(() => {
      expect(screen.queryByText('Your Unforgeable True Name is Established! 🎉')).toBeTruthy();
      expect(screen.queryByText('alice@satnam.pub')).toBeTruthy();
    });
  });

  it('shows error when OTP verification fails and prevents continuation', async () => {
    render(
      <MemoryRouter initialEntries={['/register?mode=migration']}>
        <IdentityForgeIntegration>
          <IdentityForge onBack={() => { }} onComplete={() => { }} />
        </IdentityForgeIntegration>
      </MemoryRouter>
    );

    // Step 1 setup
    fireEvent.change(await screen.findByPlaceholderText('Enter your username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('Create a strong password'), { target: { value: 'supersecure123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm your password'), { target: { value: 'supersecure123' } });
    await waitFor(() => expect(screen.queryByText(/Username is available/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Forge Your Satnam Identity/i }));

    // Import minimal nsec -> consent
    fireEvent.change(await screen.findByPlaceholderText('nsec1... or npub1...'), { target: { value: 'nsec1' + 'x'.repeat(60) } });
    fireEvent.click(screen.getByRole('button', { name: /Import Account/i }));
    // Go straight to sending code (consent modal is optional)
    fireEvent.click(await screen.findByRole('button', { name: 'Send Code' }));
    await waitFor(() => expect(screen.queryByText(/Verification code sent/i)).toBeTruthy());

    // Enter wrong code
    const codeInput = screen.getByPlaceholderText('••••••');
    fireEvent.change(codeInput, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => {
      expect(screen.queryByText(/Invalid code/i)).toBeTruthy();
    });

    // Continue button should be disabled (otp not verified)
    const continueBtn = screen.getByRole('button', { name: 'Continue' });
    expect((continueBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('handles network failures gracefully on OTP generate', async () => {
    // Override fetch just for this test
    (global.fetch as any) = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.includes('/.netlify/functions/check-username-availability')) {
        return jsonResponse({ success: true, available: true });
      }
      if (url.includes('/.netlify/functions/auth-migration-otp-generate')) {
        throw new Error('Network error');
      }
      return jsonResponse({ ok: true });
    });

    render(
      <MemoryRouter initialEntries={['/register?mode=migration']}>
        <IdentityForgeIntegration>
          <IdentityForge onBack={() => { }} onComplete={() => { }} />
        </IdentityForgeIntegration>
      </MemoryRouter>
    );

    // Step 1
    fireEvent.change(await screen.findByPlaceholderText('Enter your username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('Create a strong password'), { target: { value: 'supersecure123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm your password'), { target: { value: 'supersecure123' } });
    await waitFor(() => expect(screen.queryByText(/Username is available/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Forge Your Satnam Identity/i }));

    // Import and consent
    fireEvent.change(await screen.findByPlaceholderText('nsec1... or npub1...'), { target: { value: 'nsec1' + 'x'.repeat(60) } });
    fireEvent.click(screen.getByRole('button', { name: /Import Account/i }));
    // Try sending code -> expect error message rendered by panel
    fireEvent.click(await screen.findByRole('button', { name: 'Send Code' }));

    await waitFor(() => {
      expect(screen.queryByText(/Network error/i)).toBeTruthy();
    });
  });
});

