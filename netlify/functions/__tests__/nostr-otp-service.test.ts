// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dynamic imports for central_event_publishing_service
vi.mock('../../lib/central_event_publishing_service', () => ({
  central_event_publishing_service: {
    async sendOTPDM(recipientNpub: string, userNip05?: string) {
      return { success: true, otp: '123456', messageId: 'evt1', expiresAt: new Date(), messageType: 'gift-wrap' };
    },
    async verifyOTP(recipientNpub: string, otp: string) {
      return { valid: otp === '123456', expired: false };
    },
    async cleanupOTPExpired() {
      return true;
    },
  },
}));

// Also mock the .js variant in case
vi.mock('../../lib/central_event_publishing_service.js', () => ({
  central_event_publishing_service: {
    async sendOTPDM(recipientNpub: string, userNip05?: string) {
      return { success: true, otp: '123456', messageId: 'evt1', expiresAt: new Date(), messageType: 'gift-wrap' };
    },
    async verifyOTP(recipientNpub: string, otp: string) {
      return { valid: otp === '123456', expired: false };
    },
    async cleanupOTPExpired() {
      return true;
    },
  },
}));

import { handler } from '../nostr-otp-service';

function buildEvent(body: any) {
  return {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify(body),
  } as any;
}

describe('nostr-otp-service Netlify function', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('send action delegates to central service and returns success', async () => {
    const event = buildEvent({ action: 'send', recipientNpub: 'npub1' });
    const res = await handler(event);
    const parsed = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(parsed.success).toBe(true);
    expect(parsed.otp).toBe('123456');
  });

  it('verify action validates OTP', async () => {
    const eventValid = buildEvent({ action: 'verify', recipientNpub: 'npub1', otp: '123456' });
    const resValid = await handler(eventValid);
    const parsedValid = JSON.parse(resValid.body);
    expect(resValid.statusCode).toBe(200);
    expect(parsedValid.valid).toBe(true);

    const eventInvalid = buildEvent({ action: 'verify', recipientNpub: 'npub1', otp: '000000' });
    const resInvalid = await handler(eventInvalid);
    const parsedInvalid = JSON.parse(resInvalid.body);
    expect(resInvalid.statusCode).toBe(200);
    expect(parsedInvalid.valid).toBe(false);
  });

  it('cleanup action returns boolean success', async () => {
    const event = buildEvent({ action: 'cleanup' });
    const res = await handler(event);
    const parsed = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(typeof parsed.success).toBe('boolean');
    expect(parsed.success).toBe(true);
  });
});

