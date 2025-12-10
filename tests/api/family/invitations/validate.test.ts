import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import validateInvitationHandler from "../../../../api/family/invitations/validate.js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  // Allow running the test suite without a local/test Supabase instance.
  // In that case we skip the tests rather than failing the suite.
  // When proper test credentials are configured, the suite will run fully.
  // eslint-disable-next-line no-console
  console.warn(
    "Skipping invitation validation tests: missing Supabase test credentials"
  );
}

interface TestFederation {
  id: string;
  federation_duid: string;
  federation_name: string;
}

interface InvitationOverrides {
  status?: string;
  expires_at?: string;
  safeword_locked_until?: string | null;
  require_safeword?: boolean;
  encrypted_invitee_npub?: string | null;
}

let serviceClient: SupabaseClient;
let anonClient: SupabaseClient;
let testFederation: TestFederation;
const createdInvitationIds: string[] = [];

async function createInvitation(
  overrides: InvitationOverrides = {}
): Promise<{ id: string; token: string }> {
  const now = Date.now();
  const token =
    overrides.encrypted_invitee_npub === "invalid-token"
      ? "invalid-token"
      : `inv_test_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt =
    overrides.expires_at || new Date(now + 60 * 60 * 1000).toISOString();
  const status = overrides.status || "pending";

  const { data, error } = await serviceClient
    .from("family_federation_invitations")
    .insert({
      federation_id: testFederation.id,
      federation_duid: testFederation.federation_duid,
      invitation_token: token,
      inviter_user_duid: "test-inviter",
      invited_role: "steward",
      personal_message: "Test invitation",
      encrypted_invitee_npub: overrides.encrypted_invitee_npub ?? null,
      expires_at: expiresAt,
      status,
      safeword_locked_until: overrides.safeword_locked_until ?? null,
      require_safeword: overrides.require_safeword ?? false,
      metadata: {
        federation_name: testFederation.federation_name,
        role_guide_url: "/docs/steward-onboarding-guide",
      },
    })
    .select("id, invitation_token")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create invitation: ${error?.message}`);
  }

  createdInvitationIds.push(data.id);
  return { id: data.id, token: data.invitation_token };
}

function createEvent(token: string | null) {
  return {
    httpMethod: "GET",
    rawQuery: token ? `token=${encodeURIComponent(token)}` : "",
    headers: {},
  } as any;
}

function parseBody(response: any) {
  return JSON.parse(response.body);
}

const describeOrSkip =
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_KEY
    ? describe
    : describe.skip;

describeOrSkip("api/family/invitations/validate", () => {
  beforeAll(async () => {
    const url = SUPABASE_URL!;
    const anonKey = SUPABASE_ANON_KEY!;
    const serviceKey = SUPABASE_SERVICE_KEY!;

    anonClient = createClient(url, anonKey) as SupabaseClient;
    serviceClient = createClient(url, serviceKey) as SupabaseClient;

    const now = Date.now();
    const federationDuid = `test-fed-${now}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const { data, error } = await serviceClient
      .from("family_federations")
      .insert({
        federation_name: "Test Invitation Federation",
        federation_duid: federationDuid,
        created_by: `test-founder-${now}`,
      })
      .select("id, federation_duid, federation_name")
      .single();

    if (error || !data) {
      throw new Error(`Failed to create test federation: ${error?.message}`);
    }

    testFederation = {
      id: data.id,
      federation_duid: data.federation_duid,
      federation_name: data.federation_name,
    };
  });

  afterAll(async () => {
    if (!serviceClient) return;

    if (createdInvitationIds.length > 0) {
      await serviceClient
        .from("family_federation_invitations")
        .delete()
        .in("id", createdInvitationIds);
    }

    if (testFederation) {
      await serviceClient
        .from("family_federations")
        .delete()
        .eq("id", testFederation.id);
    }
  });

  it("returns 404 for invalid/unknown token", async () => {
    const event = createEvent("inv_nonexistent");
    const res = await validateInvitationHandler(event, {} as any);

    expect(res.statusCode).toBe(404);
    const body = parseBody(res);
    expect(body.valid).toBe(false);
    expect(body.error).toBe("Invitation not found or invalid token");
  });

  it("returns 404 for expired invitation and RLS hides row for anon client", async () => {
    const expiredAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { token } = await createInvitation({ expires_at: expiredAt });

    const event = createEvent(token);
    const res = await validateInvitationHandler(event, {} as any);

    expect(res.statusCode).toBe(404);
    const body = parseBody(res);
    expect(body.valid).toBe(false);
    expect(body.error).toBe("Invitation not found or invalid token");

    const { data } = await anonClient
      .from("family_federation_invitations")
      .select("id")
      .eq("invitation_token", token);

    const visible = Array.isArray(data) ? data : [];
    expect(visible.length).toBe(0);
  });

  it("returns 404 for non-pending invitation (accepted)", async () => {
    const { token } = await createInvitation({
      status: "accepted",
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const event = createEvent(token);
    const res = await validateInvitationHandler(event, {} as any);

    expect(res.statusCode).toBe(404);
    const body = parseBody(res);
    expect(body.valid).toBe(false);
    expect(body.error).toBe("Invitation not found or invalid token");
  });

  it("returns 200 for valid pending invitation and does not modify status/view_count", async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { id, token } = await createInvitation({
      expires_at: expiresAt,
      status: "pending",
      require_safeword: true,
      encrypted_invitee_npub: "hash_targeted_npub",
    });

    const event = createEvent(token);
    const res = await validateInvitationHandler(event, {} as any);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.valid).toBe(true);

    const invitation = body.invitation;
    expect(invitation.federation_name).toBe(testFederation.federation_name);
    expect(invitation.invited_role).toBe("steward");
    expect(invitation.role_description).toContain("Steward");
    expect(invitation.expires_at).toBe(expiresAt);
    expect(invitation.federation_duid).toBe(testFederation.federation_duid);
    expect(invitation.require_safeword).toBe(true);
    expect(invitation.targeted).toBe(true);

    const { data } = await serviceClient
      .from("family_federation_invitations")
      .select("status, view_count")
      .eq("id", id)
      .single();

    expect(data.status).toBe("pending");
    expect(data.view_count).toBe(0);
  });

  it("returns 200 for safeword-locked invitation with locked flag", async () => {
    const lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { token } = await createInvitation({
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      status: "pending",
      require_safeword: true,
      safeword_locked_until: lockedUntil,
    });

    const event = createEvent(token);
    const res = await validateInvitationHandler(event, {} as any);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.valid).toBe(false);
    expect(body.error).toContain("Too many failed passphrase attempts");
    expect(body.locked).toBe(true);
    expect(body.locked_until).toBe(lockedUntil);
  });
});
