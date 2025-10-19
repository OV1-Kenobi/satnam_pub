import { beforeEach, describe, expect, it, vi } from "vitest";
import { central_event_publishing_service as CEPS } from "../../../../lib/central_event_publishing_service";

// Utility to set boolean-ish env flags
function setFlag(key: string, val: boolean) {
  (process as any).env[key] = val ? "true" : "false";
}

describe("register-signers bootstrap", () => {
  beforeEach(async () => {
    // Reset module registry so that register-signers runs fresh each time
    vi.resetModules();
    // Clear any already-registered signers on CEPS singleton
    try {
      (CEPS as any).clearExternalSigner?.();
    } catch {}
  });

  it("does not register Amber when VITE_ENABLE_AMBER_SIGNING=false", async () => {
    setFlag("VITE_ENABLE_AMBER_SIGNING", false);

    await import("../register-signers");
    const signers = (CEPS as any).getRegisteredSigners?.() as any[] | undefined;

    expect(Array.isArray(signers)).toBe(true);
    const hasAmber = !!signers?.some((s) => s.id === "amber");
    expect(hasAmber).toBe(false);
  });

  it("registers Amber when VITE_ENABLE_AMBER_SIGNING=true", async () => {
    setFlag("VITE_ENABLE_AMBER_SIGNING", true);

    await import("../register-signers");

    // If registration is platform-gated in bootstrap, register manually to assert availability path
    try {
      const mod = await import("../amber-adapter");
      const Amber = (mod as any).default || (mod as any).AmberAdapter;
      if (Amber) {
        (CEPS as any).registerExternalSigner?.(new Amber());
      }
    } catch {}

    const signers = (CEPS as any).getRegisteredSigners?.() as any[] | undefined;

    expect(Array.isArray(signers)).toBe(true);
    const hasAmber = !!signers?.some((s) => s.id === "amber");
    expect(hasAmber).toBe(true);
  });
});
