import React, { useState } from 'react';
import { central_event_publishing_service as CEPS } from "../../lib/central_event_publishing_service";

export interface KeyImportResult {
  npub: string;
  pubkeyHex: string;
  isPrivate: boolean;
}

interface KeyImportFormProps {
  onImported: (result: KeyImportResult) => void;
  onError?: (message: string) => void;
}

// Zero-knowledge: Do not persist nsec in component state longer than necessary
export const KeyImportForm: React.FC<KeyImportFormProps> = ({ onImported, onError }) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input) return onError?.('Please enter your Nostr key');

    const raw = input.trim();
    if (raw.includes(' ')) return onError?.('Keys must not contain spaces');

    setLoading(true);
    try {
      let npub = '';
      let pubHex = '';
      let isPrivate = false;

      if (/^nsec1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/i.test(raw)) {
        // nsec -> canonical derivation via CEPS (nostr-tools under the hood)
        npub = CEPS.deriveNpubFromNsec(raw);
        pubHex = CEPS.decodeNpub(npub);
        isPrivate = true;
      } else if (/^npub1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/i.test(raw)) {
        // npub -> decode to hex
        pubHex = CEPS.decodeNpub(raw);
        if (pubHex.length !== 64) throw new Error('Invalid public key length');
        npub = raw;
        isPrivate = false;
      } else if (/^[0-9a-fA-F]{64}$/.test(raw)) {
        // hex private key (discouraged, but support with warning)
        const privHex = raw.toLowerCase();
        const pubFromHex = CEPS.getPublicKeyHex(privHex);
        if (!pubFromHex || pubFromHex.length !== 64) throw new Error('Invalid public key derivation');
        pubHex = pubFromHex;
        npub = CEPS.encodeNpub(pubHex);
        isPrivate = true;
      } else {
        return onError?.('Invalid key format. Use nsec1..., npub1..., or 64-hex');
      }

      // Clear the input immediately for zero-knowledge handling
      setInput('');

      onImported({ npub, pubkeyHex: pubHex, isPrivate });
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleImport} className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">Import existing key</label>
      <input
        type="password"
        autoComplete="off"
        className="w-full rounded border px-3 py-2"
        placeholder="nsec1... (preferred) or npub1... or 64-hex"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <button type="submit" disabled={loading} className="btn btn-primary">
        {loading ? 'Validating…' : 'Import'}
      </button>
    </form>
  );
};

export default KeyImportForm;

