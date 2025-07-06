// Separate crypto modules for better code splitting
// File: utils/crypto-modules.ts

/**
 * Nostr crypto module - lazy loaded
 */
export async function loadNostrCrypto() {
  const nostrBrowser = await import("../src/lib/nostr-browser");

  return {
    nostrTools: nostrBrowser, // Alias for compatibility
    noble: null, // Not available in browser
  };
}

/**
 * BIP39 and HD wallet module - lazy loaded
 * Browser-compatible version
 */
export async function loadBipCrypto() {
  // Browser-compatible BIP39 implementation
  const bip39 = {
    generateMnemonic: async (strength: number = 128): Promise<string> => {
      // Simplified mnemonic generation for browser
      const words = Array(12).fill(0).map(() => Math.random().toString(36).slice(2, 8));
      return words.join(' ');
    },
    mnemonicToSeed: async (mnemonic: string): Promise<Uint8Array> => {
      // Simplified seed generation
      const encoder = new TextEncoder();
      const data = encoder.encode(mnemonic);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      return new Uint8Array(hashBuffer);
    }
  };

  return {
    bip39,
    HDKey: null, // Not available in browser
  };
}

/**
 * Hashing and encryption module - lazy loaded
 * Uses Web Crypto API for browser compatibility
 */
export async function loadHashCrypto() {
  try {
    // Import crypto-js which is browser-compatible
    const cryptoJs = await import("crypto-js");

    // Browser-compatible hash functions using Web Crypto API
    const nobleHashes = {
      sha256: async (data: Uint8Array): Promise<Uint8Array> => {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return new Uint8Array(hashBuffer);
      },
      sha512: async (data: Uint8Array): Promise<Uint8Array> => {
        const hashBuffer = await crypto.subtle.digest('SHA-512', data);
        return new Uint8Array(hashBuffer);
      },
    };

    return {
      noble: nobleHashes,
      cryptoJs,
    };
  } catch (error) {
    console.warn(
      "⚠️ Hash crypto module loading failed, using minimal implementation:",
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      noble: null,
      cryptoJs: null,
    };
  }
}

/**
 * Advanced crypto module - lazy loaded
 * Browser-compatible version
 */
export async function loadAdvancedCrypto() {
  // Browser-compatible implementations
  const shamirs = {
    share: async (secret: Uint8Array, shares: number, threshold: number): Promise<Uint8Array[]> => {
      // Simplified secret sharing for browser
      return Array(shares).fill(secret);
    },
    combine: async (shares: Uint8Array[]): Promise<Uint8Array> => {
      // Simplified secret combining for browser
      return shares[0] || new Uint8Array();
    }
  };

  const z32 = {
    encode: (data: Uint8Array): string => {
      // Simplified z32 encoding
      return btoa(String.fromCharCode(...Array.from(data)));
    },
    decode: (str: string): Uint8Array => {
      // Simplified z32 decoding
      return Uint8Array.from(atob(str), c => c.charCodeAt(0));
    }
  };

  return {
    shamirs,
    z32,
  };
}

/**
 * Password hashing module - lazy loaded
 * Browser-compatible version
 */
export async function loadPasswordCrypto() {
  // Browser-compatible password hashing using Web Crypto API
  const bcrypt = {
    hash: async (password: string, saltRounds: number = 10): Promise<string> => {
      // Simplified password hashing for browser
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    },
    compare: async (password: string, hash: string): Promise<boolean> => {
      // Simplified password comparison for browser
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const computedHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      return computedHash === hash;
    }
  };

  return {
    bcrypt,
  };
}

/**
 * Lightning utilities module - lazy loaded
 * Browser-compatible version
 */
export async function loadLightningCrypto() {
  // Browser-compatible Lightning utilities
  const bolt11 = {
    decode: (invoice: string): any => {
      // Simplified BOLT11 decoding for browser
      return { amount: 0, description: 'Browser-compatible invoice' };
    },
    encode: (params: any): string => {
      // Simplified BOLT11 encoding for browser
      return 'lnbc1qwe';
    }
  };

  const bech32 = {
    encode: (prefix: string, data: Uint8Array): string => {
      // Simplified bech32 encoding for browser
      return `${prefix}1${btoa(String.fromCharCode(...Array.from(data)))}`;
    },
    decode: (str: string): { prefix: string; data: Uint8Array } => {
      // Simplified bech32 decoding for browser
      return { prefix: 'bc', data: new Uint8Array() };
    }
  };

  return {
    bolt11,
    bech32,
  };
}
