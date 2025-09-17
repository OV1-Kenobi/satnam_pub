import { registerPlugin } from '@capacitor/core';

/**
 * NfcIsoDepPlugin
 * Capacitor interface for native Android ISO-DEP/APDU NFC operations used to initialize NTAG424 DNA.
 * Zero-knowledge: never pass unencrypted private keys or sensitive secrets to native.
 */
export interface NfcIsoDepPlugin {
  /**
   * Check if NFC ISO-DEP is available and the adapter is enabled on the device.
   * @returns `{ available: boolean }` where available indicates adapter presence and enabled state.
   */
  isAvailable(): Promise<{ available: boolean }>

  /**
   * Enable NFC reader mode and connect to the first ISO-DEP tag presented within a timeout (~30s).
   * Resolves when the tag is connected and ready for APDU transceive.
   * Rejects on timeout or NFC off.
   * @returns `{ success: true }` on successful connection.
   */
  connect(): Promise<{ success: boolean }>

  /**
   * Send a raw APDU command to the connected ISO-DEP tag.
   * @param options `{ apduHex: string }` - HEX encoded APDU (e.g., "00A40400...")
   * @returns `{ responseHex: string }` - HEX encoded response (includes SW bytes, e.g., "9000").
   */
  transceive(options: { apduHex: string }): Promise<{ responseHex: string }>

  /**
   * Disconnect from the current tag and disable reader mode.
   * @returns `{ success: boolean }`.
   */
  disconnect(): Promise<{ success: boolean }>
}

/**
 * Register the plugin for web-to-native bridge usage.
 * Note: Only available on Android; callers should feature-detect and fallback in browsers.
 */
export const NfcIsoDep = registerPlugin<NfcIsoDepPlugin>('NfcIsoDep');

export default NfcIsoDep;

