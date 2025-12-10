import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const mockValidateSessionFromHeader = vi.fn<
  Promise<{ userId?: string } | null>,
  [string]
>();

vi.mock("../../../../netlify/functions/security/session-manager.js", () => ({
  SecureSessionManager: {
    validateSessionFromHeader: mockValidateSessionFromHeader,
  },
}));

import generateInvitationHandler from "../../../../api/family/invitations/generate.js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  // Allow running the suite without a local/test Supabase instance.
  // When credentials are configured these tests will execute normally.
  // eslint-disable-next-line no-console
  console.warn(
    "Skipping invitation generate tests: missing Supabase test credentials"
  );
}

interface TestFederation {
  id: string;
  federation_duid: string;
  created_by: string;
  federation_name: string;
}

let serviceClient: SupabaseClient;
let testFederation: TestFederation;

beforeEach(() => {
  mockValidateSessionFromHeader.mockReset();
});

function createEvent(body: any, headers: Record<string, string> = {}) {
  return {
    httpMethod: "POST",
    headers,
    body: JSON.stringify(body),
  } as any;
}

const describeOrSkip =
  SUPABASE_URL && SUPABASE_SERVICE_KEY ? describe : describe.skip;

describeOrSkip("api/family/invitations/generate", () => {
  beforeAll(async () => {
    const url = SUPABASE_URL!;
    const serviceKey = SUPABASE_SERVICE_KEY!;

    serviceClient = createClient(url, serviceKey) as SupabaseClient;

    const now = Date.now();
    const founderId = `test-founder-${now}`;
    const federationDuid = `test-fed-generate-${now}`;

    const { data, error } = await serviceClient
      .from("family_federations")
      .insert({
        federation_name: "Generate Invitations Federation",
        federation_duid: federationDuid,
        created_by: founderId,
      })
      .select("id, federation_duid, created_by, federation_name")
      .single();

    if (error || !data) {
      throw new Error(`Failed to create test federation: ${error?.message}`);
    }

    testFederation = {
      id: data.id,
      federation_duid: data.federation_duid,
      created_by: data.created_by,
      federation_name: data.federation_name,
    };
  });

  afterAll(async () => {
    if (!serviceClient || !testFederation) return;

    await serviceClient
      .from("family_federation_invitations")
      .delete()
      .eq("federation_id", testFederation.id);

    await serviceClient
      .from("family_federations")
      .delete()
      .eq("id", testFederation.id);
  });
  it("returns 401 when Authorization header is missing", async () => {
    const event = createEvent({});
    const res = await generateInvitationHandler(event, {} as any);

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Authentication required");
  });

  it("returns 404 when federation is not found", async () => {
    mockValidateSessionFromHeader.mockResolvedValue({ userId: "user-123" });

    const event = createEvent(
      {
        federation_duid: "non-existent-federation",
        invited_role: "steward",
        safeword: "safeword123",
      },
      { authorization: "Bearer test-token" }
    );

    const res = await generateInvitationHandler(event, {} as any);

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Federation not found");
  });

  it("returns 403 when user is not the federation founder", async () => {
    mockValidateSessionFromHeader.mockResolvedValue({ userId: "other-user" });

    const event = createEvent(
      {
        federation_duid: testFederation.federation_duid,
        invited_role: "steward",
        safeword: "safeword123",
      },
      { authorization: "Bearer test-token" }
    );

    const res = await generateInvitationHandler(event, {} as any);

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe(
      "Only federation founders can generate invitations"
    );
  });

  it("returns 400 for invalid invited_role", async () => {
    mockValidateSessionFromHeader.mockResolvedValue({
      userId: testFederation.created_by,
    });

    const event = createEvent(
      {
        federation_duid: testFederation.federation_duid,
        invited_role: "invalid_role",
        safeword: "safeword123",
      },
      { authorization: "Bearer test-token" }
    );

    const res = await generateInvitationHandler(event, {} as any);

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain("invited_role must be one of");
  });

  it("creates invitation successfully for founder with valid data", async () => {
    const safeword = "verysecurephrase";
    const inviteeNpub = "npub1testtarget";

    mockValidateSessionFromHeader.mockResolvedValue({
      userId: testFederation.created_by,
    });

    const event = createEvent(
      {
        federation_duid: testFederation.federation_duid,
        invited_role: "steward",
        personal_message: "Welcome to the federation",
        invitee_npub: inviteeNpub,
        invitee_nip05: "invitee@example.com",
        safeword,
        requireSafeword: true,
      },
      { authorization: "Bearer valid-token" }
    );

    const res = await generateInvitationHandler(event, {} as any);

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const invitation = body.invitation;
    expect(invitation.token).toMatch(/^inv_/);
    expect(invitation.url).toContain(`/invite/${invitation.token}`);
    expect(invitation.role).toBe("steward");
    expect(invitation.federation_name).toBe(testFederation.federation_name);
    expect(invitation.targeted).toBe(true);
    expect(invitation.require_safeword).toBe(true);

    const reminder = body.safeword_reminder;
    expect(reminder).not.toBeNull();
    expect(reminder.safeword).toBe(safeword);

    const { data, error } = await serviceClient
      .from("family_federation_invitations")
      .select(
        "id, federation_id, federation_duid, invited_role, encrypted_invitee_npub, safeword_hash, safeword_salt, require_safeword"
      )
      .eq("invitation_token", invitation.token)
      .single();

    if (error || !data) {
      throw new Error(`Failed to load created invitation: ${error?.message}`);
    }

    expect(data.federation_id).toBe(testFederation.id);
    expect(data.federation_duid).toBe(testFederation.federation_duid);
    expect(data.invited_role).toBe("steward");
    expect(data.encrypted_invitee_npub).toBeTruthy();
    expect((data.encrypted_invitee_npub as string).length).toBe(64);
    expect(data.safeword_hash).toBeTruthy();
    expect(data.safeword_salt).toBeTruthy();
    expect(data.require_safeword).toBe(true);
  });
});
