/**
 * @fileoverview React hook for NTAG424 Production Tag Authentication
 * @description Provides NFC-based multi-factor authentication and registration for Satnam.pub
 * @compliance Master Context - Privacy-first, Bitcoin-only, browser-only, no Node.js modules
 * @integration Supabase, LightningClient, NFC Web API
 */

import { useState, useCallback } from "react";
import { NTAG424ProductionManager, NTAG424AuthResponse } from "../lib/ntag424-production";
import { supabase } from '../lib/supabase';
import { LightningClient } from '../lib/lightning-client';

export interface ProductionNTAG424AuthState {
  isAuthenticated: boolean;
  sessionToken: string | null;
  userNpub: string | null;
  familyRole: string | null;
  walletAccess: any;
  error?: string | null;
}

/**
 * useProductionNTAG424
 * React hook for NFC-based authentication and registration with NTAG424 production tags
 * @returns {object} Hook state and NFC auth/register functions
 */
export const useProductionNTAG424 = (
  supabaseClient: any = supabase,
  lightningClient: any = new LightningClient()
) => {
  const [authState, setAuthState] = useState<ProductionNTAG424AuthState>({
    isAuthenticated: false,
    sessionToken: null,
    userNpub: null,
    familyRole: null,
    walletAccess: null,
    error: null,
  });
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Authenticate with NTAG424 production tag via NFC
   * @param pin User PIN for tag authentication
   * @returns {Promise<NTAG424AuthResponse>} Authentication result
   */
  const authenticateWithNFC = useCallback(
    async (pin: string): Promise<NTAG424AuthResponse> => {
      setIsProcessing(true);
      setAuthState((prev) => ({ ...prev, error: null }));
      try {
        if (typeof window !== 'undefined' && 'NDEFReader' in window) {
          const ndef = new (window as any).NDEFReader();
          await ndef.scan();
          return new Promise<NTAG424AuthResponse>((resolve, reject) => {
            ndef.addEventListener("reading", async (event: any) => {
              try {
                const uid = event.serialNumber;
                // TODO: Extract SUN message from event.message.records (future NTAG424 DNA integration)
                let sunMessage = "";
                if (event.message && event.message.records && event.message.records.length > 0) {
                  // Placeholder: implement SUN extraction logic as per NTAG424 DNA spec
                  sunMessage = ""; // e.g., parseTextRecord(event.message.records[0])
                }
                const ntagManager = new NTAG424ProductionManager(supabaseClient, lightningClient);
                const result = await ntagManager.authenticateProductionTag(uid, pin, sunMessage);
                if (result.success) {
                  setAuthState({
                    isAuthenticated: true,
                    sessionToken: result.sessionToken!,
                    userNpub: result.userNpub!,
                    familyRole: result.familyRole!,
                    walletAccess: result.walletAccess,
                    error: null,
                  });
                  resolve(result);
                } else {
                  setAuthState((prev) => ({ ...prev, error: result.error || 'Authentication failed' }));
                  reject(new Error(result.error));
                }
              } catch (error: any) {
                setAuthState((prev) => ({ ...prev, error: error.message || 'NFC authentication error' }));
                reject(error);
              } finally {
                setIsProcessing(false);
              }
            });
            setTimeout(() => {
              setIsProcessing(false);
              setAuthState((prev) => ({ ...prev, error: 'NFC read timeout' }));
              reject(new Error("NFC read timeout"));
            }, 30000);
          });
        } else {
          throw new Error("NFC not supported on this device/browser");
        }
      } catch (error: any) {
        setIsProcessing(false);
        setAuthState((prev) => ({ ...prev, error: error.message || 'NFC authentication error' }));
        throw error;
      }
    },
    [supabaseClient, lightningClient]
  );

  /**
   * Register a new NTAG424 production tag via NFC
   * @param pin User PIN for tag registration
   * @param userNpub User's Nostr public key
   * @param familyRole Family role for the tag
   * @param spendingLimits Optional spending limits
   * @returns {Promise<boolean>} Registration success
   */
  const registerNewTag = useCallback(
    async (
      pin: string,
      userNpub: string,
      familyRole: string,
      spendingLimits?: any
    ): Promise<boolean> => {
      setIsProcessing(true);
      setAuthState((prev) => ({ ...prev, error: null }));
      try {
        if (typeof window !== 'undefined' && 'NDEFReader' in window) {
          const ndef = new (window as any).NDEFReader();
          await ndef.scan();
          return new Promise<boolean>((resolve, reject) => {
            ndef.addEventListener("reading", async (event: any) => {
              try {
                const uid = event.serialNumber;
                const ntagManager = new NTAG424ProductionManager(supabaseClient, lightningClient);
                const success = await ntagManager.registerProductionTag(
                  uid,
                  pin,
                  userNpub,
                  familyRole,
                  spendingLimits
                );
                setIsProcessing(false);
                resolve(success);
              } catch (error: any) {
                setIsProcessing(false);
                setAuthState((prev) => ({ ...prev, error: error.message || 'NFC registration error' }));
                reject(error);
              }
            });
            setTimeout(() => {
              setIsProcessing(false);
              setAuthState((prev) => ({ ...prev, error: 'NFC read timeout' }));
              reject(new Error("NFC read timeout"));
            }, 30000);
          });
        } else {
          throw new Error("NFC not supported on this device/browser");
        }
      } catch (error: any) {
        setIsProcessing(false);
        setAuthState((prev) => ({ ...prev, error: error.message || 'NFC registration error' }));
        throw error;
      }
    },
    [supabaseClient, lightningClient]
  );

  /**
   * Reset authentication state
   */
  const resetAuthState = useCallback(() => {
    setAuthState({
      isAuthenticated: false,
      sessionToken: null,
      userNpub: null,
      familyRole: null,
      walletAccess: null,
      error: null,
    });
  }, []);

  return {
    authState,
    isProcessing,
    authenticateWithNFC,
    registerNewTag,
    resetAuthState,
  };
}; 