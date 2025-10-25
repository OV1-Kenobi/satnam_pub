/// <reference types="vite/client" />

import type { NostrExtension } from "./types/auth";

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_LIGHTNING_DOMAIN: string;
  readonly VITE_IROH_ENABLED?: string;
  readonly VITE_PKARR_ENABLED?: string;
  readonly VITE_SIMPLEPROOF_ENABLED?: string;
  readonly VITE_LNBITS_INTEGRATION_ENABLED?: string;
  readonly VITE_PUBLIC_PROFILES_ENABLED?: string;
  readonly VITE_ENABLE_AMBER_SIGNING?: string;
  [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    nostr?: NostrExtension;
  }
}

export {};
