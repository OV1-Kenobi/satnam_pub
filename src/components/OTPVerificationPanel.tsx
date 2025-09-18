import React, { useEffect, useMemo, useRef, useState } from 'react';

interface OTPVerificationPanelProps {
  npub: string;
  nip05: string;
  lightningAddress?: string;
  onVerified: (info: { sessionId: string; expiresAt: string }) => void;
}

export const OTPVerificationPanel: React.FC<OTPVerificationPanelProps> = ({ npub, nip05, lightningAddress, onVerified }) => {
  const [sessionId, setSessionId] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<number>(120);
  const [digits, setDigits] = useState<number>(6);
  const [remaining, setRemaining] = useState<number>(0);
  const timer = useRef<number | null>(null);

  const canGenerate = useMemo(() => !!npub && !!nip05, [npub, nip05]);

  const startCountdown = (expIso: string) => {
    if (timer.current) window.clearInterval(timer.current);
    const exp = Date.parse(expIso);
    timer.current = window.setInterval(() => {
      const diff = Math.max(0, Math.floor((exp - Date.now()) / 1000));
      setRemaining(diff);
      if (diff <= 0 && timer.current) {
        window.clearInterval(timer.current);
        timer.current = null;
      }
    }, 1000);
  };

  const generate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setStatus('');
    try {
      const res = await fetch('/.netlify/functions/auth-migration-otp-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npub, nip05, lightningAddress })
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || `HTTP ${res.status}`);
      setSessionId(json.sessionId);
      setExpiresAt(json.expiresAt);
      setPeriod(json.period || 120);
      setDigits(json.digits || 6);
      startCountdown(json.expiresAt);
      setStatus('Verification code sent to your Nostr account via encrypted DM.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (!sessionId || code.length !== digits) return;
    setLoading(true);
    setStatus('');
    try {
      const res = await fetch('/.netlify/functions/auth-migration-otp-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, npub, code })
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || `HTTP ${res.status}`);
      onVerified({ sessionId, expiresAt });
      setStatus('Verified!');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-800">Step 2: Verify Ownership</h4>
        {expiresAt && <span className="text-xs text-gray-500">Expires in {remaining}s</span>}
      </div>

      <p className="text-sm text-gray-600">We will send a one-time TOTP code to your existing Nostr account ({npub.slice(0, 12)}…). Enter the 6-digit code to continue.</p>

      <div className="flex gap-2">
        <button type="button" disabled={!canGenerate || loading} onClick={generate} className="btn btn-secondary">
          {loading ? 'Sending…' : 'Send Code'}
        </button>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={digits}
          className="w-28 rounded border px-3 py-2 tracking-widest text-center"
          placeholder={''.padStart(digits, '•')}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D+/g, '').slice(0, digits))}
        />
        <button type="button" disabled={!sessionId || code.length !== digits || loading} onClick={verify} className="btn btn-primary">
          {loading ? 'Verifying…' : 'Verify'}
        </button>
      </div>

      {status && <div className="text-xs text-gray-700">{status}</div>}
    </div>
  );
};

export default OTPVerificationPanel;

