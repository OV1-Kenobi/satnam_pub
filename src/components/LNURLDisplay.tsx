import { ArrowLeft, Copy, QrCode } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { getBoltcardLnurl } from "@/api/endpoints/lnbits.js";
import { generateQRCodeDataURL, getRecommendedErrorCorrection } from "../utils/qr-code-browser";



interface Props {
  onBack: () => void;
}

export default function LNURLDisplay({ onBack }: Props) {


  const [lnurl, setLnurl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Track mount to avoid setState on unmounted component
  const isMountedRef = useRef(true);
  // Track copy reset timeout to clear on unmount
  const copyResetTimeout = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (copyResetTimeout.current) {
        window.clearTimeout(copyResetTimeout.current);
        copyResetTimeout.current = null;
      }
    };
  }, []);

  const fetchBoltcardLnurl = useCallback(async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await getBoltcardLnurl();
      if (!isMountedRef.current) return;
      if (resp.success && resp.data && typeof resp.data.lnurl === "string") {
        setLnurl(resp.data.lnurl);
      } else {
        setError(resp.error || "Unable to retrieve Boltcard LNURL");
      }
    } catch (e) {
      if (isMountedRef.current) {
        setError(e instanceof Error ? e.message : "Network error");
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => { fetchBoltcardLnurl(); }, [fetchBoltcardLnurl]);

  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!lnurl) return setQrDataUrl("");
      try {
        const data = await generateQRCodeDataURL(lnurl, {
          size: 256,
          margin: 4,
          errorCorrectionLevel: getRecommendedErrorCorrection("payment"),
        });
        if (alive) setQrDataUrl(data);
      } catch (e) {
        console.error("Failed to render LNURL QR:", e);
        if (alive) setQrDataUrl("");
      }
    })();
    return () => {
      alive = false;
    };
  }, [lnurl]);

  const handleCopy = async () => {
    if (!lnurl) return;
    try {
      await navigator.clipboard.writeText(lnurl);
      setCopied(true);
      if (copyResetTimeout.current) {
        window.clearTimeout(copyResetTimeout.current);
      }
      copyResetTimeout.current = window.setTimeout(() => {
        setCopied(false);
        copyResetTimeout.current = null;
      }, 1500);
    } catch (e) {
      if (copyResetTimeout.current) {
        window.clearTimeout(copyResetTimeout.current);
        copyResetTimeout.current = null;
      }
      console.warn("Clipboard copy failed:", e);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-4">
        <button onClick={onBack} className="inline-flex items-center text-purple-200 hover:text-white">
          <ArrowLeft className="h-5 w-5 mr-2" /> Back
        </button>
      </div>

      <h1 className="text-3xl font-bold text-white mb-2">Your LNURL</h1>
      <p className="text-purple-100 mb-6">
        Scan or copy your LNURL below. You will paste this into the Boltcard Programming app when provisioning your NFC Name Tag.
      </p>

      {loading ? (
        <div className="bg-white/10 border border-white/20 rounded-xl p-6 text-purple-100">Loading your Boltcard LNURL...</div>
      ) : error ? (
        <div className="bg-white/10 border border-red-400 rounded-xl p-6 text-red-200">
          <div>
            {error || "Unable to retrieve Boltcard LNURL. Please try again."}{" "}
            <button onClick={fetchBoltcardLnurl} className="underline text-yellow-300 hover:text-yellow-400">Try again</button>
          </div>
          <button onClick={fetchBoltcardLnurl} className="mt-3 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold px-3 py-2 rounded-md">Retry</button>
        </div>
      ) : (
        <div className="bg-white/10 border border-white/20 rounded-2xl p-6">
          <div className="grid sm:grid-cols-2 gap-6 items-center">
            <div className="flex flex-col items-center">
              <div className="bg-white rounded-xl p-4">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Boltcard LNURL QR" className="w-56 h-56" />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center bg-gray-100 rounded-md">
                    <QrCode className="h-10 w-10 text-gray-400" />
                  </div>
                )}
              </div>
              <span className="text-xs text-purple-300 mt-2">QR encodes: {lnurl || "—"}</span>
            </div>

            <div>
              <label className="block text-sm text-purple-200 mb-2">Boltcard LNURL (text)</label>
              <div className="flex">
                <input readOnly value={lnurl} className="flex-1 bg-purple-800 border border-purple-600 rounded-l-md px-3 py-2 text-white" />
                <button onClick={handleCopy} className="bg-yellow-500 hover:bg-yellow-600 text-black px-3 py-2 rounded-r-md font-semibold">
                  <span className="inline-flex items-center">
                    <Copy className="h-4 w-4 mr-1" /> {copied ? "Copied" : "Copy"}
                  </span>
                </button>
              </div>

              <div className="mt-4 text-sm text-purple-100 space-y-1">
                <p>This is your Boltcard provisioning LNURL. Paste it into the Boltcard Programming app during NFC tag setup.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 text-purple-200 text-sm">
        <h2 className="text-white font-semibold mb-2">Next</h2>
        <ol className="list-decimal list-inside space-y-1">
          <li>Install the Boltcard Programming app on your NFC-capable phone.</li>
          <li>Open the app and choose to provision a new card.</li>
          <li>When prompted for LNURL, scan the QR above or paste the link.</li>
        </ol>
      </div>
    </div>
  );
}

