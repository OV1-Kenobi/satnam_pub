import { ArrowLeft, Copy, Download, ExternalLink, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getBoltcardLnurl, getLNbitsWalletUrl } from "@/api/endpoints/lnbits.js";

import { useNFCContactVerification } from "../hooks/useNFCContactVerification";

interface Props { onBack: () => void; }

export default function NFCProvisioningGuide({ onBack }: Props) {

  const [lnurl, setLnurl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [walletUrl, setWalletUrl] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<'wallet-setup' | 'card-scan' | 'auth-url'>('wallet-setup');

  // Track mount to avoid setState on unmounted component
  const isMountedRef = useRef(true);
  // Track copy reset timeout to clear on unmount
  const copyResetTimeout = useRef<number | undefined>(undefined);
  const { verifyAndAddContact } = useNFCContactVerification();
  const [jwt, setJwt] = useState<string>("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [sunVerified, setSunVerified] = useState<boolean | null>(null);
  const [verifiedNip, setVerifiedNip] = useState<string | null>(null);

  async function handleVerifyTap() {





    setVerifyError(null);
    setVerifying(true);
    setSunVerified(null);
    setVerifiedNip(null);
    try {
      const res = await verifyAndAddContact({ token: jwt });
      if (!res.success) {
        setVerifyError(res.error || "Verification failed");
      } else {
        setSunVerified(!!res.sunVerified);
        setVerifiedNip(res.contactNip05 || null);
      }
    } catch (e: any) {
      setVerifyError(e?.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  }


  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (copyResetTimeout.current) {
        window.clearTimeout(copyResetTimeout.current);
        copyResetTimeout.current = undefined;
      }
    };
  }, []);

  const fetchWalletUrl = async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await getLNbitsWalletUrl();
      if (!isMountedRef.current) return;
      if (resp.success && resp.data && typeof resp.data.walletUrl === "string") {
        setWalletUrl(resp.data.walletUrl);
      } else {
        setError(resp.error || "Unable to retrieve wallet URL");
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

  const fetchBoltcardLnurl = async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await getBoltcardLnurl();
      if (!isMountedRef.current) return;
      if (resp.success && resp.data && typeof resp.data.lnurl === "string") {
        setLnurl(resp.data.lnurl);
        setCurrentStep('auth-url');
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

  useEffect(() => { fetchWalletUrl(); }, []);



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
        copyResetTimeout.current = undefined;
      }, 1500);
    } catch {
      if (copyResetTimeout.current) {
        window.clearTimeout(copyResetTimeout.current);
        copyResetTimeout.current = undefined;
      }
    }
  };

  const handleCopyWalletUrl = async () => {
    if (!walletUrl) return;
    try {
      await navigator.clipboard.writeText(walletUrl);
      setCopied(true);
      if (copyResetTimeout.current) {
        window.clearTimeout(copyResetTimeout.current);
      }
      copyResetTimeout.current = window.setTimeout(() => {
        if (isMountedRef.current) {
          setCopied(false);
        }
        copyResetTimeout.current = undefined;
      }, 2000);
    } catch {
      if (copyResetTimeout.current) {
        window.clearTimeout(copyResetTimeout.current);
        copyResetTimeout.current = undefined;
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
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-100 mb-6">
          <p className="mb-2">
            <strong>⚠️ Important:</strong> This is a single-device workflow. You'll use your phone for both LNbits setup AND NFC programming.
          </p>
          <p className="text-sm">
            You'll alternate between your mobile browser (for LNbits) and the Boltcard Programming app (for NFC operations), using copy/paste to transfer information between them.
          </p>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-blue-100 mb-6">
          <p className="mb-2">
            <strong>📺 Video Tutorial:</strong> Watch the complete process in action
          </p>
          <a
            href="https://youtu.be/_sW7miqaXJc?si=NRDeBT-NlsNuPheA"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-300 underline hover:text-blue-200"
          >
            LNbits Boltcard Setup Tutorial (YouTube)
          </a>
          <p className="text-xs mt-1">Note: Follow the single-device variation described below</p>
        </div>

        {/* Step-by-Step Workflow */}
        <section className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Complete NFC Name Tag Setup Process</h2>

          {currentStep === 'wallet-setup' && (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-green-200 mb-2">Step 1: Access Your LNbits Wallet</h3>
                <p className="text-green-100 mb-3">
                  First, you need to access your LNbits wallet to set up the Boltcard configuration.
                </p>
                {loading && <div className="text-green-200">Loading your wallet URL...</div>}
                {error && <div className="text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-3">{error}</div>}
                {walletUrl && (
                  <div className="space-y-3">
                    <div className="bg-white/10 rounded-lg p-3">
                      <p className="text-sm text-green-200 mb-2">Your LNbits Wallet URL:</p>
                      <div className="flex">
                        <input readOnly value={walletUrl} className="flex-1 bg-green-800 border border-green-600 rounded-l-md px-3 py-2 text-white text-sm" />
                        <button
                          onClick={handleCopyWalletUrl}
                          className="bg-green-500 hover:bg-green-600 text-black px-3 py-2 rounded-r-md font-semibold"
                        >
                          {copied ? "Copied!" : <><Copy className="h-4 w-4 inline mr-1" />Copy</>}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => window.open(walletUrl, '_blank')}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center space-x-2"
                    >
                      <Smartphone className="h-5 w-5" />
                      <span>Open LNbits Wallet (Boltcard Extension)</span>
                      <ExternalLink className="h-4 w-4" />
                    </button>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                      <p className="text-yellow-200 text-sm">
                        <strong>Next:</strong> In LNbits, go to the Boltcard extension, set your spending limits, then tap the NFC button to scan your card's UID.
                      </p>
                    </div>
                    <button
                      onClick={() => setCurrentStep('card-scan')}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg"
                    >
                      I've Set Up My Card in LNbits →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 'card-scan' && (
            <div className="space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-200 mb-2">Step 2: Get Your Auth URL</h3>
                <p className="text-blue-100 mb-3">
                  After scanning your NFC card's UID in LNbits, it will generate an auth URL for programming.
                </p>
                <div className="space-y-3">
                  <button
                    onClick={fetchBoltcardLnurl}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-lg"
                  >
                    {loading ? "Fetching..." : "Get My Auth URL"}
                  </button>
                  {error && <div className="text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg p-3">{error}</div>}
                  <button
                    onClick={() => setCurrentStep('wallet-setup')}
                    className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg"
                  >
                    ← Back to Wallet Setup
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'auth-url' && lnurl && (
            <div className="space-y-4">
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-purple-200 mb-2">Step 3: Copy Auth URL to Boltcard App</h3>
                <p className="text-purple-100 mb-3">
                  Copy this auth URL and paste it into the Boltcard Programming app.
                </p>
                <div className="space-y-3">
                  <div className="bg-white/10 rounded-lg p-3">
                    <label className="block text-sm text-purple-200 mb-2">Auth URL (Copy This):</label>
                    <div className="flex">
                      <input readOnly value={lnurl} className="flex-1 bg-purple-800 border border-purple-600 rounded-l-md px-3 py-2 text-white text-sm" />
                      <button onClick={handleCopy} className="bg-yellow-500 hover:bg-yellow-600 text-black px-3 py-2 rounded-r-md font-semibold">
                        {copied ? "Copied!" : <><Copy className="h-4 w-4 inline mr-1" />Copy</>}
                      </button>
                    </div>
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                    <p className="text-yellow-200 text-sm">
                      <strong>Next:</strong> Open the Boltcard Programming app, select "Create Bolt Card" → "PASTE AUTH URL", paste the URL above, then tap your NFC card to program it.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Final Step */}
        <section className="space-y-4">
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-orange-200 mb-2">Step 4: Return to Satnam</h3>
            <p className="text-orange-100 mb-3">
              After successfully programming your NFC card with the Boltcard app, return to Satnam to register your True Name Tag with PIN protection.
            </p>

            {/* Tap-to-Add Contact (Demo) */}
            <section className="mt-6">
              <h3 className="text-lg font-semibold text-white mb-2">Tap-to-Add Contact (Demo)</h3>
              <div className="bg-white/10 border border-white/20 rounded-lg p-4 text-purple-100 space-y-3">
                <p className="text-sm">Paste your JWT then tap a contact's card to verify. Android can include SUN parameters when SDM is enabled. iOS reads NDEF Text only.</p>
                <div className="flex gap-2">
                  {/* JWT input field - do not move this into handleVerifyTap function body */}

                  <input
                    className="flex-1 bg-purple-900/40 border border-purple-600 rounded px-3 py-2 text-white text-sm"
                    placeholder="Paste Bearer JWT (optional)"
                    value={jwt}


                    onChange={(e) => setJwt(e.target.value)}
                  />
                  <button
                    onClick={handleVerifyTap}
                    disabled={verifying}
                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded"
                  >
                    {verifying ? 'Verifying…' : 'Tap to Verify'}
                  </button>
                </div>
                {verifyError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-100 text-sm">{verifyError}</div>
                )}
                {verifiedNip && (
                  <div className="text-xs text-purple-200">Verified NIP-05: {verifiedNip}</div>
                )}
                {sunVerified === true && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded p-3 text-green-100 text-sm">
                    ✓ Contact verified with cryptographic SUN proof (anti-cloning protection active)
                  </div>
                )}
                {sunVerified === false && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3 text-yellow-100 text-sm">
                    ⚠ Contact verified with UID-hash only (SUN not available)
                  </div>
                )}
              </div>
            </section>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-yellow-200 text-sm">
                <strong>Final Step:</strong> Click "Register Your True Name Tag" in Satnam to add PIN protection and bind the card to your account.
              </p>
            </div>
          </div>
        </section>

        {/* App Links */}
        {/* Multi-Function (Android Only) */}
        <section className="mt-6">
          <h3 className="text-lg font-semibold text-white mb-2">Multi-Function Card Setup (Android Only)</h3>
          <div className="bg-white/10 border border-white/20 rounded-lg p-4 text-purple-100 space-y-2">
            <p>Android users can program authentication, FROST signing pointer, and Nostr metadata directly in Satnam using Web NFC.</p>
            <ul className="list-disc list-inside text-sm space-y-1">
              <li>Step 1: Set your PIN in Satnam (server-side storage only).</li>
              <li>Step 2: Enable signing capabilities: call <code>/.netlify/functions/nfc-enable-signing</code> with your desired <code>signingType</code> (frost | nostr | both).</li>
              <li>Step 3: Program via Web NFC: Satnam writes File 04 (custom NIP-05 layout) and mirrors NIP-05 as an NDEF Text record for iOS compatibility. Payment (File 01) remains via Boltcard app.</li>
              <li>Step 4: Verify: A read-back check confirms programming success.</li>
            </ul>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3 text-yellow-100">
              <strong>Compatibility:</strong> Web NFC is available in Chrome/Edge on Android. iOS cannot program additional files via web, but can read NDEF Text (NIP-05) for tap-to-add contact flow. Use the Boltcard app for payment setup.
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 text-blue-100 mt-2">
              <strong>iOS Tap-to-Add:</strong> iOS devices can read the NDEF Text record (NIP-05) and Satnam will verify ownership server-side. Optional SUN verification provides cryptographic proof against card cloning when SDM parameters are available.
            </div>
          </div>
        </section>

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
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-purple-300 mb-2">📚 Documentation</h4>
              <ul className="list-disc list-inside text-purple-100 space-y-1">
                <li><a className="underline" href="/docs/satnam-nfc-provisioning-guide.html" target="_blank" rel="noopener noreferrer">Provisioning Guide (HTML)</a></li>
                <li><a className="underline" href="/docs/Satnam-NFC-Provisioning-Guide.pdf" target="_blank" rel="noopener noreferrer">Provisioning Guide (PDF)</a></li>
                <li><a className="underline" href="/docs/NFC_TROUBLESHOOTING.md" target="_blank" rel="noopener noreferrer">Troubleshooting Guide</a></li>
                <li><a className="underline" href="/docs/NFC_API_ENDPOINTS.md" target="_blank" rel="noopener noreferrer">API Reference</a></li>
                <li><a className="underline" href="/docs/NFC_SECURITY_ARCHITECTURE.md" target="_blank" rel="noopener noreferrer">Security Architecture</a></li>
                <li><a className="underline" href="/docs/NFC_FEATURE_FLAGS.md" target="_blank" rel="noopener noreferrer">Feature Flags</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-purple-300 mb-2">🔧 Tools & Apps</h4>
              <ul className="list-disc list-inside text-purple-100 space-y-1">
                <li><a className="underline" href="/docs/ntag424-blob-viewer.html" target="_blank" rel="noopener noreferrer">Blob Viewer Tool</a></li>
                <li><a className="underline" href="https://github.com/boltcard/bolt-nfc-android-app/releases" target="_blank" rel="noopener noreferrer">Boltcard Android App</a></li>
              </ul>
            </div>
          </div>
        </section>
      </div >
    </div >
  );
}

