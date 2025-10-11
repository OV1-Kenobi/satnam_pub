// src/hooks/useNFCContactVerification.ts
// Android Web NFC helper to read card UID + NIP-05 (NDEF text) and optional SUN params (from NDEF URL)
// Then verify on server via /.netlify/functions/nfc-verify-contact

export interface VerifiedContact {
  success: boolean;
  contactDuid?: string;
  contactNip05?: string;
  sunVerified?: boolean;
  error?: string;
}

type SunParams = { piccData: string; cmac: string };

type VerifyInit = {
  cardUid?: string;
  nip05?: string;
  token?: string;
  sunParams?: SunParams;
};

export function useNFCContactVerification() {
  function tryParseUrl(data: any): URL | null {
    try {
      if (!data) return null;
      const s =
        typeof data === "string" ? data : data?.toString ? data.toString() : "";
      if (!s) return null;
      return new URL(s);
    } catch {
      return null;
    }
  }

  async function readNdefOnce(): Promise<{
    cardUid: string;
    nip05?: string;
    sunParams?: SunParams;
  }> {
    if (typeof (window as any).NDEFReader === "undefined") {
      throw new Error("Web NFC not supported on this device/browser");
    }
    const reader = new (window as any).NDEFReader();
    return new Promise(async (resolve, reject) => {
      try {
        await reader.scan();
      } catch (err) {
        reject(err instanceof Error ? err : new Error("NFC scan failed"));
        return;
      }
      // Add a timeout to avoid hanging indefinitely
      const timeoutId = setTimeout(() => {
        reader.onreading = null;
        reader.onreadingerror = null;
        reject(new Error("NFC read timeout"));
      }, 30000); // 30 second timeout

      const onError = (err: any) => {
        clearTimeout(timeoutId);
        reader.onreading = null;
        reader.onreadingerror = null;
        reject(err instanceof Error ? err : new Error("NFC read error"));
      };
      reader.onreadingerror = onError;

      reader.onreading = (event: any) => {
        try {
          clearTimeout(timeoutId);
          const cardUid: string = String(event.serialNumber || "");
          let nip05: string | undefined;
          let sunParams: SunParams | undefined;
          const message = event.message;
          if (message && Array.isArray(message.records)) {
            for (const rec of message.records) {
              if (rec.recordType === "text") {
                const textDecoder = new TextDecoder(rec.encoding || "utf-8");
                const data = rec.data
                  ? textDecoder.decode(rec.data)
                  : undefined;
                if (data && data.includes("@")) {
                  nip05 = data.trim();
                }
              } else if (rec.recordType === "url") {
                const url = tryParseUrl(rec.data);
                if (url) {
                  const p = url.searchParams.get("p");
                  const c = url.searchParams.get("c");
                  if (p && c) {
                    sunParams = { piccData: p, cmac: c };
                    // Note: we intentionally do not log p/c values
                    console.debug("[NFC] SUN parameters detected");
                  }
                }
              }
            }
          }
          reader.onreading = null;
          reader.onreadingerror = null;
          resolve({ cardUid, nip05, sunParams });
        } catch (e) {
          onError(e);
        }
      };
    });
  }

  async function verifyAndAddContact(
    init?: VerifyInit
  ): Promise<VerifiedContact> {
    try {
      let cardUid = init?.cardUid;
      let nip05 = init?.nip05;
      let sunParams = init?.sunParams;
      if (!cardUid || !nip05 || !sunParams) {
        const res = await readNdefOnce();
        cardUid = cardUid || res.cardUid;
        nip05 = nip05 || res.nip05;
        sunParams = sunParams || res.sunParams;
      }
      if (!cardUid) return { success: false, error: "Missing card UID" };
      if (!nip05) return { success: false, error: "Missing NIP-05" };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (init?.token) headers["Authorization"] = `Bearer ${init.token}`;
      const body: any = { cardUid, nip05 };
      if (sunParams?.piccData && sunParams?.cmac) {
        body.sunParams = { piccData: sunParams.piccData, cmac: sunParams.cmac };
      } else {
        console.debug(
          "[NFC] Using standard UID-hash verification (no SUN params)"
        );
      }
      // add timeout support
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const resp = await fetch("/.netlify/functions/nfc-verify-contact", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      let json: any;
      try {
        json = await resp.json();
      } catch {
        return { success: false, error: "Invalid server response" };
      }
      if (!resp.ok || !json?.success) {
        return { success: false, error: json?.error || "Verification failed" };
      }
      return {
        success: true,
        contactDuid: json.contactDuid,
        contactNip05: json.contactNip05,
        sunVerified: !!json.sunVerified,
      };
    } catch (e: any) {
      return { success: false, error: e?.message || "Unexpected error" };
    }
  }

  return { verifyAndAddContact };
}
