import { ArrowLeft, Copy, Download, ExternalLink, QrCode } from "lucide-react";
import { useEffect, useRef, useState } from "react";


import { getBoltcardLnurl } from "@/api/endpoints/lnbits.js";
import { generateQRCodeDataURL, getRecommendedErrorCorrection } from "../utils/qr-code-browser";




interface Props { onBack: () => void; }

export default function NFCProvisioningGuide({ onBack }: Props) {

  const [lnurl, setLnurl] = useState<string>("");
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState(false);
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

  const fetchBoltcardLnurl = async () => {
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
  };

  useEffect(() => { fetchBoltcardLnurl(); }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!lnurl) return setQr("");
      try {
        const data = await generateQRCodeDataURL(lnurl, { size: 224, errorCorrectionLevel: getRecommendedErrorCorrection("payment") });
        if (alive) setQr(data);
      } catch (e) { if (alive) setQr(""); }
    })();
    return () => { alive = false; };
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
    } catch {
      if (copyResetTimeout.current) {
        window.clearTimeout(copyResetTimeout.current);
        copyResetTimeout.current = null;
      }
    }
  };

  const handleDownloadPdf = () => {
    // Use browser print-to-PDF for a simple, dependency-free export
    window.print();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 print:px-0">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <button onClick={onBack} className="inline-flex items-center text-purple-200 hover:text-white">
          <ArrowLeft className="h-5 w-5 mr-2" /> Back
        </button>
        <button onClick={handleDownloadPdf} className="inline-flex items-center bg-yellow-500 hover:bg-yellow-600 text-black font-semibold px-4 py-2 rounded-lg">
          <Download className="h-4 w-4 mr-2" /> Download PDF
        </button>
      </div>

      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg">
        <div className="flex items-center space-x-3 mb-4">
          <img src="/SatNam-logo.png" alt="Satnam" className="h-10 w-10 rounded" />
          <h1 className="text-2xl font-bold text-white">Satnam NFC Provisioning Guide</h1>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-yellow-100 mb-6">
          NFC programming requires an NFC-compatible mobile device. iOS can use the Boltcard app for provisioning; Android has full support.
        </div>

        {/* Boltcard LNURL */}
        <section className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-2">Your Boltcard LNURL</h2>
          {loading ? (
            <p className="text-purple-200">Loading your Boltcard LNURL...</p>
          ) : error ? (
            <div className="bg-white/10 border border-red-400 rounded-lg p-4 text-red-200">
              <div>
                {error || "Unable to retrieve Boltcard LNURL. Please try again."}{" "}
                <button onClick={fetchBoltcardLnurl} className="underline text-yellow-300 hover:text-yellow-400">Try again</button>
              </div>
              <button onClick={fetchBoltcardLnurl} className="mt-3 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold px-3 py-2 rounded-md">Retry</button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-3 gap-4 items-center">
              <div className="sm:col-span-1">
                <div className="bg-white rounded-xl p-3 inline-block">
                  {qr ? <img src={qr} alt="Boltcard LNURL QR" className="w-44 h-44" /> : <div className="w-44 h-44 bg-gray-100 flex items-center justify-center"><QrCode className="h-8 w-8 text-gray-400" /></div>}
                </div>
                <div className="text-xs text-purple-300 mt-2">{lnurl || "—"}</div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-purple-200 mb-1">Boltcard LNURL (text)</label>
                <div className="flex">
                  <input readOnly value={lnurl} className="flex-1 bg-purple-800 border border-purple-600 rounded-l-md px-3 py-2 text-white" />
                  <button onClick={handleCopy} className="bg-yellow-500 hover:bg-yellow-600 text-black px-3 py-2 rounded-r-md font-semibold">
                    <span className="inline-flex items-center"><Copy className="h-4 w-4 mr-1" />{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <p className="text-purple-200 text-sm mt-2">Paste this Boltcard LNURL into the Boltcard Programming app when prompted for LNURL.</p>
              </div>
            </div>
          )}
        </section>

        {/* Steps */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Step-by-Step Instructions</h2>
          <ol className="list-decimal list-inside text-purple-100 space-y-2">
            <li>Install the Boltcard Programming app on your phone.</li>
            <li>Open the app and select provision/program new card.</li>
            <li>When prompted, enter or scan your LNURL shown above.</li>
            <li>Complete the remaining prompts to write the configuration to your NFC tag.</li>
            <li>Return to Satnam and click "Register Your True Name Tag" to verify and bind your tag.</li>
          </ol>
        </section>

        {/* App Links */}
        <section className="mt-6">
          <h3 className="text-lg font-semibold text-white mb-2">Boltcard Programming App</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <a href="https://apps.apple.com/us/app/boltcard-nfc-programmer/id6450968873" target="_blank" rel="noopener noreferrer" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center space-x-2">
              <span>Install on iOS</span>
              <ExternalLink className="h-4 w-4" />
            </a>
            <a href="https://play.google.com/store/apps/details?id=com.lightningnfcapp&pcampaignid=web_share" target="_blank" rel="noopener noreferrer" className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center space-x-2">
              <span>Install on Android</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </section>

        {/* Resources */}
        <section className="mt-6">
          <h3 className="text-lg font-semibold text-white mb-2">Additional Resources</h3>
          <ul className="list-disc list-inside text-purple-100 space-y-1">
            <li><a className="underline" href="/docs/satnam-nfc-provisioning-guide.html" target="_blank" rel="noopener noreferrer">Satnam NFC Provisioning (HTML)</a></li>
            <li><a className="underline" href="/docs/Satnam-NFC-Provisioning-Guide.pdf" target="_blank" rel="noopener noreferrer">Satnam NFC Provisioning (PDF)</a></li>
            <li><a className="underline" href="https://github.com/boltcard/bolt-nfc-android-app/releases" target="_blank" rel="noopener noreferrer">Boltcard Android Releases</a></li>
          </ul>
        </section>
      </div>
    </div>
  );
}

