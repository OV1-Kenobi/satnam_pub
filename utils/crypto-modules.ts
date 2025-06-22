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
 */
export async function loadHashCrypto() {
  const [noble, cryptoJs] = await Promise.all([
    import("@noble/hashes"),
    import("crypto-js"),
  ]);

  return {
    noble,
    cryptoJs,
  };
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
