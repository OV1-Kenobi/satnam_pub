/// <reference types="vite/client" />

import type { NostrExtension } from "./types/auth";

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_LIGHTNING_DOMAIN: string;
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
