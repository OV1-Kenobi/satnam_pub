import { createBoltcard, createLightningAddress, getPaymentHistory, provisionWallet } from "@/api/endpoints/lnbits.js";
import { useEffect, useMemo, useState } from "react";
import { useNWCWallet } from "../hooks/useNWCWallet";
import { isLightningAddressReachable, parseLightningAddress } from "../utils/lightning-address";
import NWCWalletSetupModal from "./NWCWalletSetupModal";



/**
 * LNBitsIntegrationPanel
 * UI hooks behind VITE_LNBITS_INTEGRATION_ENABLED feature flag.
 * Exposes:
 *  1) Wallet provisioning
 *  2) Lightning Address creation (from NIP-05)
 *  3) Boltcard provisioning (NTAG424)
 *  4) Payment notifications + history
 */

type PaymentEvent = {
  id: string;
  created_at: string;
  amount_sats: number;
  lightning_address?: string | null;
  memo?: string | null;
  payment_hash: string;
};

export default function LNBitsIntegrationPanel() {
  const enabled = (import.meta.env.VITE_LNBITS_INTEGRATION_ENABLED || "").toString().toLowerCase() === "true";
  const [loading, setLoading] = useState<{ [k: string]: boolean }>({});
  const [result, setResult] = useState<{ [k: string]: any }>({});
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState("My Boltcard");
  const [spendLimit, setSpendLimit] = useState<number>(20000);

  // Feature flags
  const nwcFeatureEnabled = ((import.meta.env as any)?.VITE_ENABLE_NWC_PROVIDER || '').toString().toLowerCase() === 'true';
  const [provider, setProvider] = useState<'lnbits' | 'nwc'>('lnbits');
  const [nwcModalOpen, setNwcModalOpen] = useState(false);

  const { isConnected: nwcConnected, balance: nwcBalance, getBalance: nwcGetBalance, primaryConnection: nwcPrimary } = useNWCWallet();

  const [refreshingBalance, setRefreshingBalance] = useState(false);
  async function handleRefreshBalance() {
    setRefreshingBalance(true);
    try {
      await nwcGetBalance();
    } catch (e) {
      setError('Failed to refresh NWC balance');
    } finally {
      setRefreshingBalance(false);
    }
  }

  // Payment history state
  const [history, setHistory] = useState<PaymentEvent[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState<number | null>(null);


  // External Lightning Address UI state
  const [addrMode, setAddrMode] = useState<'internal' | 'external'>("internal");
  const [externalLightningAddress, setExternalLightningAddress] = useState("");
  const [addrValid, setAddrValid] = useState<boolean | null>(null);
  const [addrReachable, setAddrReachable] = useState<boolean | null>(null);
  const [checkingAddr, setCheckingAddr] = useState<boolean>(false);
  function validateLightningAddressFormat(addr: string): { local: string; domain: string } | null {
    const p = parseLightningAddress(addr);
    return p ? { local: p.local, domain: p.domain } : null;
  }
  async function verifyLightningAddressReachable(local: string, domain: string): Promise<boolean> {
    return isLightningAddressReachable(`${local}@${domain}`);
  }
  useEffect(() => {
    if (!externalLightningAddress) { setAddrValid(null); setAddrReachable(null); return; }
    const p = validateLightningAddressFormat(externalLightningAddress); setAddrValid(!!p);
    if (!p) { setAddrReachable(null); return; }
    let cancel = false; setCheckingAddr(true);
    verifyLightningAddressReachable(p.local, p.domain).then(ok => { if (!cancel) setAddrReachable(ok); }).finally(() => { if (!cancel) setCheckingAddr(false); });
    return () => { cancel = true; };
  }, [externalLightningAddress]);

  // Block external submission unless address is present, valid, and confirmed reachable
  const externalCreationBlocked = useMemo(() => {
    if (addrMode !== 'external') return false;
    const hasValue = externalLightningAddress.trim().length > 0;
    return checkingAddr || !hasValue || !addrValid || addrReachable !== true;
  }, [addrMode, externalLightningAddress, checkingAddr, addrValid, addrReachable]);

  const disabled = useMemo(() => !enabled, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    // Load first page initially
    (async () => {
      setLoading(l => ({ ...l, history: true }));
      try {
        const res = await getPaymentHistory({ page: 1, limit });
        if (res.success) {
          setHistory(res.data || []);
          setTotal(typeof res.total === "number" ? res.total : null);
          setPage(1);
        }
      } catch (e) {
        // non-blocking
      } finally {
        setLoading(l => ({ ...l, history: false }));
      }
    })();
  }, [enabled, limit]);

  if (!enabled) return null;

  async function handleProvisionWallet() {
    if (nwcFeatureEnabled && provider === 'nwc') {
      setError('NWC provider selected. Use your connected NWC wallet for payments.');
      return;
    }
    setError(null); setLoading(l => ({ ...l, wallet: true }));
    try {
      const res = await provisionWallet();
      if (!res.success) throw new Error(res.error || "Failed");
      setResult(r => ({ ...r, wallet: res.data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(l => ({ ...l, wallet: false }));
    }
  }

  async function handleCreateLightningAddress() {
    if (nwcFeatureEnabled && provider === 'nwc') {
      setError('NWC provider selected. Lightning Address creation via LNbits is disabled.');
      return;
    }
    setError(null);

    if (addrMode === 'external') {
      const trimmedAddr = externalLightningAddress.trim();
      if (!trimmedAddr) {
        setError('Please enter a Lightning Address (local@domain)');
        return;
      }
      if (checkingAddr) {
        setError('Validating Lightning Address... please wait');
        return;
      }
      if (!addrValid) {
        setError('Invalid Lightning Address format');
        return;
      }
      if (addrReachable !== true) {
        setError('Lightning Address appears unreachable');
        return;
      }

      setLoading(l => ({ ...l, address: true }));
      try {
        const res = await createLightningAddress({ externalLightningAddress: trimmedAddr });
        if (!res.success) throw new Error(res.error || 'Failed');
        setResult(r => ({ ...r, address: res.data }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(l => ({ ...l, address: false }));
      }
      return;
    }

    // Internal mode
    setLoading(l => ({ ...l, address: true }));
    try {
      const res = await createLightningAddress();
      if (!res.success) throw new Error(res.error || 'Failed');
      setResult(r => ({ ...r, address: res.data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(l => ({ ...l, address: false }));
    }
  }

  async function handleCreateBoltcard() {
    setError(null); setLoading(l => ({ ...l, boltcard: true }));
    try {
      const res = await createBoltcard({ label, spend_limit_sats: spendLimit });
      if (!res.success) throw new Error(res.error || "Failed");
      setResult(r => ({ ...r, boltcard: res.data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(l => ({ ...l, boltcard: false }));
    }
  }

  async function handleLoadPage(nextPage: number) {
    if (nextPage < 1) return;
    setLoading(l => ({ ...l, history: true }));
    try {
      const res = await getPaymentHistory({ page: nextPage, limit });
      if (res.success) {
        setHistory(res.data || []);
        setTotal(typeof res.total === "number" ? res.total : null);
        setPage(nextPage);
      }
    } finally {
      setLoading(l => ({ ...l, history: false }));
    }
  }

  const totalPages = total ? Math.max(1, Math.ceil(total / limit)) : null;

  return (
    <div className="space-y-6 p-4 rounded-lg border border-gray-700 bg-gray-800/40">
      <h2 className="text-xl font-semibold text-white">LNbits Integration</h2>
      {error && (
        <div className="text-red-400 text-sm">{error}</div>
      )}

      {nwcFeatureEnabled && (
        <section className="space-y-2">
          <h3 className="text-lg font-medium text-gray-100">Provider</h3>
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            <label className="inline-flex items-center gap-2 text-sm text-gray-200">
              <input type="radio" name="provider" value="lnbits" checked={provider === 'lnbits'} onChange={() => setProvider('lnbits')} />
              <span>LNbits (default)</span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-200">
              <input type="radio" name="provider" value="nwc" checked={provider === 'nwc'} onChange={() => setProvider('nwc')} />
              <span>Use NWC</span>
            </label>
          </div>
          {provider === 'nwc' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <button onClick={() => setNwcModalOpen(true)} className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm">
                  {nwcConnected ? "Manage NWC Wallet" : "Connect NWC Wallet"}
                </button>
                <button onClick={handleRefreshBalance} disabled={!nwcConnected || refreshingBalance} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm">
                  {refreshingBalance ? "Refreshing..." : "Refresh NWC Balance"}
                </button>
              </div>
              <div className="text-xs text-gray-400">
                {nwcConnected
                  ? <>Connected to <span className="text-gray-200">{nwcPrimary?.wallet_name || "NWC Wallet"}</span>{nwcBalance ? <> — Balance: <span className="text-gray-200">{nwcBalance.balance.toLocaleString()} {nwcBalance.currency}</span></> : null}</>
                  : <>No NWC wallet connected. LNbits actions below are disabled while NWC is selected.</>}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 1) Wallet Provisioning */}
      <section className="space-y-2">
        <h3 className="text-lg font-medium text-gray-100">1) Provision Wallet</h3>
        <p className="text-sm text-gray-400">Creates an LNbits user and a wallet for your account.</p>
        <button disabled={loading.wallet || disabled || (nwcFeatureEnabled && provider === 'nwc')} onClick={handleProvisionWallet}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
          {loading.wallet ? "Creating..." : "Create LNbits Wallet"}
        </button>
        {result.wallet && (
          <div className="text-sm text-gray-300">
            <div>Wallet ID: <span className="text-gray-100">{result.wallet.walletId || result.wallet.wallet_id || "-"}</span></div>
            {result.wallet.lightningAddress && (
              <div>Lightning Address: <span className="text-gray-100">{result.wallet.lightningAddress}</span></div>
            )}
          </div>
        )}
      </section>

      {/* 2) Lightning Address */}
      <section className="space-y-3">
        <h3 className="text-lg font-medium text-gray-100">2) Lightning Address Configuration</h3>
        <div className="flex flex-col sm:flex-row gap-3 items-start">
          <label className="inline-flex items-center gap-2 text-sm text-gray-200">
            <input type="radio" name="addrMode" value="internal" checked={addrMode === 'internal'} onChange={() => setAddrMode('internal')} />
            <span>Generate from my NIP-05</span>
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-200">
            <input type="radio" name="addrMode" value="external" checked={addrMode === 'external'} onChange={() => setAddrMode('external')} />
            <span>Use my existing external Lightning Address</span>
          </label>
        </div>
        {addrMode === 'external' && (
          <div className="relative">
            <input value={externalLightningAddress} onChange={e => setExternalLightningAddress(e.target.value)} placeholder="alice@example.com"
              className="w-full px-3 py-2 rounded bg-gray-900 text-gray-100 border border-gray-700 pr-10" />
            {externalLightningAddress && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {checkingAddr ? <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                  : addrValid && addrReachable ? <span className="text-green-400 text-xs">OK</span>
                    : addrValid && addrReachable === false ? <span className="text-red-400 text-xs">Unreachable</span>
                      : null}
              </div>
            )}
          </div>
        )}
        <div>
          <button disabled={loading.address || disabled || (nwcFeatureEnabled && provider === 'nwc') || externalCreationBlocked} onClick={handleCreateLightningAddress}
            className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50">
            {loading.address ? "Creating..." : "Create Lightning Address"}
          </button>
        </div>
        {result.address && (
          <div className="text-sm text-gray-300">
            <div>Address: <span className="text-gray-100">{result.address.address}</span></div>
            <div>Link ID: <span className="text-gray-100">{result.address.linkId}</span></div>
          </div>
        )}
      </section>

      {/* 3) Boltcard Provisioning */}
      <section className="space-y-2">
        <h3 className="text-lg font-medium text-gray-100">3) Provision Boltcard (NTAG424)</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Card label"
            className="px-3 py-2 rounded bg-gray-900 text-gray-100 border border-gray-700 flex-1" />
          <input type="number" value={spendLimit} min={1} onChange={e => setSpendLimit(parseInt(e.target.value || "0", 10))} placeholder="Daily limit (sats)"
            className="px-3 py-2 rounded bg-gray-900 text-gray-100 border border-gray-700 w-56" />
          <button disabled={loading.boltcard || disabled} onClick={handleCreateBoltcard}
            className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">{loading.boltcard ? "Provisioning..." : "Provision Boltcard"}</button>
        </div>
        {result.boltcard && (
          <div className="text-sm text-gray-300 space-y-1">
            <div>Card ID: <span className="text-gray-100">{result.boltcard.cardId}</span></div>
            {result.boltcard.authQr && (
              <div className="mt-2">
                <div className="text-gray-400 text-xs mb-1">Authorization QR / Link:</div>
                <a className="text-blue-400 underline break-words" href={result.boltcard.authQr} target="_blank" rel="noreferrer">{result.boltcard.authQr}</a>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 4) Payment notifications + history */}
      <section className="space-y-3">
        <h3 className="text-lg font-medium text-gray-100">4) Payment Notifications</h3>
        <p className="text-sm text-gray-400">
          Incoming LNURL-pay transfers to your Lightning Address trigger a private Nostr DM via CEPS (protocol='nip17').
        </p>

        <div className="bg-gray-900/60 border border-gray-700 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-300">Payment History</div>
            <div className="space-x-2">
              <button
                className="px-3 py-1 text-xs bg-gray-700 rounded disabled:opacity-50"
                disabled={loading.history || page <= 1}
                onClick={() => handleLoadPage(page - 1)}
              >
                Previous
              </button>
              <button
                className="px-3 py-1 text-xs bg-gray-700 rounded disabled:opacity-50"
                disabled={loading.history || (totalPages !== null && page >= totalPages)}
                onClick={() => handleLoadPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-gray-400">
                <tr>
                  <th className="text-left py-1 pr-4">Date</th>
                  <th className="text-right py-1 pr-4">Amount (sats)</th>
                  <th className="text-left py-1 pr-4">Lightning Address</th>
                  <th className="text-left py-1">Memo</th>
                </tr>
              </thead>
              <tbody className="text-gray-200">
                {history.length === 0 && (
                  <tr>
                    <td className="py-2 text-gray-400" colSpan={4}>{loading.history ? 'Loading...' : 'No payments yet'}</td>
                  </tr>
                )}
                {history.map((ev) => (
                  <tr key={ev.id} className="border-t border-gray-800">
                    <td className="py-2 pr-4">{new Date(ev.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-4 text-right">{ev.amount_sats.toLocaleString()}</td>
                    <td className="py-2 pr-4 font-mono text-xs break-all">{ev.lightning_address || '-'}</td>
                    <td className="py-2 truncate max-w-[240px]" title={ev.memo || undefined}>{ev.memo || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages !== null && (
            <div className="text-xs text-gray-400 mt-2">Page {page} of {totalPages}</div>
          )}
        </div>
      </section>
      {nwcFeatureEnabled && (
        <NWCWalletSetupModal isOpen={nwcModalOpen} onClose={() => setNwcModalOpen(false)} />
      )}
    </div>
  );
}
