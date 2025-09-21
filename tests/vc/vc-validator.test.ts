import { describe, expect, it } from "vitest";
import { buildSelfIssuedVC, VC_V2_CONTEXT } from "../../src/lib/vc/builders";
import {
  validateProofCompliance,
  validateVC,
} from "../../src/lib/vc/validators";

describe("VC v2.0 - SCDiD basics", () => {
  it("builds and validates a self-issued VC", () => {
    const holder = "nostr:npub1example";
    const vc = buildSelfIssuedVC({
      holderId: holder,
      subject: { role: "private" },
    });

    const res = validateVC(vc);
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
    expect(vc["@context"]).toContain(VC_V2_CONTEXT);
    expect(vc.type).toContain("VerifiableCredential");
    expect(vc.issuer).toBe(holder);
    expect(vc.holder).toBe(holder);
  });

  it("flags missing proof for compliance check", async () => {
    const holder = "nostr:npub1example";
    const vc = buildSelfIssuedVC({ holderId: holder, subject: {} });
    const res = await validateProofCompliance(vc);
    expect(res.valid).toBe(false);
    expect(res.errors?.[0]).toMatch(/Missing or invalid proof/i);
  });
});
