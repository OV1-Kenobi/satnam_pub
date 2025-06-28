// Separate crypto modules for better code splitting
// File: utils/crypto-modules.ts

/**
 * Nostr crypto module - lazy loaded
 */
export async function loadNostrCrypto() {
  const [nostrTools, noble] = await Promise.all([
    import("nostr-tools"),
    import("@noble/secp256k1"),
  ]);

  return {
    nostrTools,
    noble,
  };
}

/**
 * BIP39 and HD wallet module - lazy loaded
 */
export async function loadBipCrypto() {
  const [bip39, hdkey] = await Promise.all([
    import("bip39"),
    import("@scure/bip32"),
  ]);

  return {
    bip39,
    HDKey: hdkey.HDKey,
  };
}

/**
 * Hashing and encryption module - lazy loaded
 * Uses conditional imports for serverless compatibility
 */
export async function loadHashCrypto() {
  try {
    // Import crypto-js which is needed for legacy functions
    const cryptoJs = await import("crypto-js");

    // For noble-hashes, import specific functions that are actually needed
    // Skip if not available to maintain serverless compatibility
    let nobleHashes = null;
    try {
      // Import specific hash functions instead of the whole module
      const [sha256, sha512] = await Promise.all([
        import("@noble/hashes/sha256"),
        import("@noble/hashes/sha512"),
      ]);
      nobleHashes = {
        sha256: sha256.sha256,
        sha512: sha512.sha512,
      };
    } catch (error) {
      console.warn(
        "⚠️ Noble hashes not available, using fallback implementations:",
        error.message
      );
      // Fallback to Web Crypto API or other implementations
      nobleHashes = {
        sha256: null, // Will use Web Crypto API fallback
        sha512: null, // Will use Web Crypto API fallback
      };
    }

    return {
      noble: nobleHashes,
      cryptoJs,
    };
  } catch (error) {
    console.warn(
      "⚠️ Hash crypto module loading failed, using minimal implementation:",
      error.message
    );
    return {
      noble: null,
      cryptoJs: null,
    };
  }
}

/**
 * Advanced crypto module - lazy loaded
 */
export async function loadAdvancedCrypto() {
  const [shamirs, z32] = await Promise.all([
    import("shamirs-secret-sharing"),
    import("z32"),
  ]);

  return {
    shamirs,
    z32,
  };
}

/**
 * Password hashing module - lazy loaded
 */
export async function loadPasswordCrypto() {
  const bcrypt = await import("bcryptjs");

  return {
    bcrypt,
  };
}

/**
 * Lightning utilities module - lazy loaded
 */
export async function loadLightningCrypto() {
  const [bolt11, bech32] = await Promise.all([
    import("bolt11"),
    import("bech32"),
  ]);

  return {
    bolt11,
    bech32,
  };
}
