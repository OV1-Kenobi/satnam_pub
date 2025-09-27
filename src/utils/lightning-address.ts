// Shared Lightning Address helpers for client-side use only
// - parseLightningAddress: format validation and parsing
// - toLnurlpUrl: converts LUD-16 to LNURL-pay endpoint
// - isLightningAddressReachable: LNURL-pay discovery with optional @getalby/lightning-tools, proxy disabled by default

export type ParsedLightningAddress = { local: string; domain: string };

export function parseLightningAddress(
  addr: string
): ParsedLightningAddress | null {
  const str = (addr || "").trim();
  const m = str.match(/^([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
  if (!m) return null;
  return { local: m[1], domain: m[2].toLowerCase() };
}

export function toLnurlpUrl(addr: string): string | null {
  const parsed = parseLightningAddress(addr);
  if (!parsed) return null;
  return `https://${parsed.domain}/.well-known/lnurlp/${encodeURIComponent(
    parsed.local
  )}`;
}

let __lightningToolsModule: any | null = null;
// Test-only injection to allow mocking dynamic import in Vitest
export function __setLightningToolsModuleForTests(mod: any | null) {
  __lightningToolsModule = mod;
}

export async function isLightningAddressReachable(
  addr: string
): Promise<boolean> {
  const parsed = parseLightningAddress(addr);
  if (!parsed) return false;
  const { local, domain } = parsed;
  const useAlby =
    ((import.meta.env as any)?.VITE_USE_ALBY_LIGHTNING_TOOLS || "")
      .toString()
      .toLowerCase() === "true";

  if (useAlby) {
    try {
      type LightningTools = {
        LightningAddress: new (address: string, opts?: { proxy?: boolean }) => {
          fetch: () => Promise<void>;
          lnurlpData?: { tag?: string; callback?: string } | null;
        };
      };
      const mod = (__lightningToolsModule ??
        (await import(
          "@getalby/lightning-tools/lnurl"
        ))) as unknown as LightningTools;
      const la = new mod.LightningAddress(`${local}@${domain}`, {
        proxy: false,
      });
      await la.fetch();
      const data = la.lnurlpData;
      if (data && (data.tag === "payRequest" || (data as any)?.callback))
        return true;
    } catch {
      // fall through
    }
  }

  try {
    const url = `https://${domain}/.well-known/lnurlp/${encodeURIComponent(
      local
    )}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return !!(data && (data.tag === "payRequest" || (data as any)?.callback));
  } catch {
    return false;
  }
}
