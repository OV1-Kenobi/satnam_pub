import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory store to simulate migration_otp_sessions table
const sessions: Record<string, any> = {};
let idCounter = 0;

// Mock CEPS server DM (non-fatal if fails; we'll just resolve)
vi.mock('../lib/central_event_publishing_service', () => ({
  central_event_publishing_service: {
    sendServerDM: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock rate limiter to always allow
vi.mock('../netlify/functions/utils/rate-limiter.js', () => ({
  allowRequest: () => true
}));

// Minimal supabase query builder mock supporting chains used in functions
function makeQueryBuilder(table: string) {
  const ctx: any = { table, filters: [] as any[] };
  return {
    select(_cols?: string) {
      ctx.op = 'select';
      return this;
    },
    insert(row: any) {
      ctx.op = 'insert';
      ctx.row = row;
      return {
        select: () => ({
          single: () => {
            const id = `sess-${++idCounter}`;
            const nowIso = new Date().toISOString();
            sessions[id] = {
              session_id: id,
              npub: row.npub,
              totp_secret: row.totp_secret,
              used_codes: row.used_codes || [],
              attempt_count: row.attempt_count || 0,
              created_at: nowIso,
              expires_at: row.expires_at,
              last_attempt_at: null
            };
            return { data: { session_id: id, expires_at: row.expires_at }, error: null };
          }
        })
      };
    },
    update(patch: any) {
      ctx.op = 'update';
      ctx.patch = patch;
      return {
        eq: (col: string, val: any) => {
          // update single row by session_id
          if (col === 'session_id' && sessions[val]) {
            sessions[val] = { ...sessions[val], ...patch };
          }
          return { data: null, error: null } as any;
        }
      };
    },
    eq(col: string, val: any) {
      ctx.filters.push({ type: 'eq', col, val });
      return this;
    },
    gte(col: string, valIso: string) {
      ctx.filters.push({ type: 'gte', col, val: valIso });
      // implement select flow returning recent sessions count
      const data = Object.values(sessions).filter((s: any) => {
        if (ctx.table !== 'migration_otp_sessions') return false;
        let ok = true;
        for (const f of ctx.filters) {
          if (f.type === 'eq' && (s as any)[f.col] !== f.val) ok = false;
          if (f.type === 'gte' && new Date((s as any)[f.col]).toISOString() < f.val) ok = false;
        }
        return ok;
      });
      return { data, error: null } as any;
    },
    single() {
      // used only by verify select
      const row = Object.values(sessions).find((s: any) => {
        let ok = true;
        for (const f of ctx.filters) {
          if (f.type === 'eq' && (s as any)[f.col] !== f.val) ok = false;
        }
        return ok;
      });
      if (!row) return { data: null, error: new Error('not found') } as any;
      return { data: row, error: null } as any;
    }
  };
}

vi.mock('../netlify/functions/supabase.js', () => ({
  supabase: {
    from: (table: string) => makeQueryBuilder(table)
  }
}));

import { handler as generate } from '../netlify/functions/auth-migration-otp-generate';
import { handler as verify } from '../netlify/functions/auth-migration-otp-verify';
import { generateTOTP } from '../utils/crypto';

function makeEvent(body: any) {
  return {
    httpMethod: 'POST',
    headers: { origin: 'http://localhost' },
    body: JSON.stringify(body)
  } as any;
}

describe('Netlify Functions: Migration OTP generate/verify', () => {
  beforeEach(() => {
    for (const k of Object.keys(sessions)) delete sessions[k];
    idCounter = 0;
  });

  it('generates an OTP session and sends server DM', async () => {
    const res = await generate(makeEvent({ npub: 'npub1abc', nip05: 'user@satnam.pub' }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.sessionId).toBeTruthy();
    expect(sessions[body.sessionId]).toBeTruthy();
  });

  it('enforces per-npub request limit via recent session count', async () => {
    const base = { npub: 'npub1limit', nip05: 'u@satnam.pub' };
    await generate(makeEvent(base));
    await generate(makeEvent(base));
    await generate(makeEvent(base));
    const res4 = await generate(makeEvent(base));
    expect(res4.statusCode).toBe(429);
  });

  it('verifies a valid TOTP and blocks replay attempts', async () => {
    const g = await generate(makeEvent({ npub: 'npub1verify', nip05: 'v@satnam.pub' }));
    expect(g.statusCode).toBe(200);
    const { sessionId } = JSON.parse(g.body);
    const secret = sessions[sessionId].totp_secret as string;

    const code = await generateTOTP(secret);

    const v1 = await verify(makeEvent({ sessionId, npub: 'npub1verify', code }));
    expect(v1.statusCode).toBe(200);

    const v2 = await verify(makeEvent({ sessionId, npub: 'npub1verify', code }));
    expect(v2.statusCode).toBe(400);
  });
});

