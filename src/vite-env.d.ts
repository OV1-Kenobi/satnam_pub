/// <reference types="vite/client" />

import type { NostrExtension } from "./types/auth";

declare global {
  interface Window {
    nostr?: NostrExtension;
  }
}

export {};
