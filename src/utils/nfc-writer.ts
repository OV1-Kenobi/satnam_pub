// src/utils/nfc-writer.ts
// Web NFC helper to write an NDEF Text record containing a NIP-05 identifier.
// Client-side only. Use on Android (Chrome/Edge). Gracefully no-op on unsupported platforms.

export async function writeNdefTextRecord(nip05: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (typeof window === 'undefined') {
      return { success: false, error: 'Not a browser environment' };
    }
    // Web NFC API support check
    const NDEFReaderCtor: any = (window as any).NDEFReader;
    if (typeof NDEFReaderCtor === 'undefined') {
      return { success: false, error: 'Web NFC not supported on this device/browser' };
    }

    const ndef = new NDEFReaderCtor();
    // Informational log; avoid logging sensitive data
    console.debug('[NFC] Writing NDEF Text record for iOS compatibility...');

    await ndef.write({
      records: [
        {
          recordType: 'text',
          lang: 'en',
          data: nip05,
        },
      ],
    });

    return { success: true };
  } catch (e: any) {
    const msg = e?.message || 'NDEF write failed';
    console.warn('[NFC] NDEF Text write failed:', msg);
    return { success: false, error: msg };
  }
}

