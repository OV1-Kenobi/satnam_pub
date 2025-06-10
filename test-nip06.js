// Simple test script for NIP-06 key derivation
const crypto = require("./utils/crypto");

try {
  // Generate a recovery phrase
  const phrase = crypto.generateRecoveryPhrase();
  console.log("Recovery phrase:", phrase);

  // Derive a key using the NIP-06 standard path
  try {
    const privateKey = crypto.privateKeyFromPhrase(phrase);
    console.log("Private key (account 0):", privateKey);
  } catch (error) {
    console.error("Failed to derive private key:", error);
    process.exit(1);
  }

  // Derive keys for multiple accounts
  console.log("\nDeriving keys for multiple accounts:");
  for (let i = 0; i < 3; i++) {
    try {
      const accountKey = crypto.privateKeyFromPhraseWithAccount(phrase, i);
      console.log(`Account ${i} private key:`, accountKey);

      // Generate a full key pair
      const keyPair = crypto.generateNostrKeyPair(phrase, i);
      console.log(`Account ${i} public key:`, keyPair.publicKey);
      console.log(`Account ${i} npub:`, keyPair.npub);
    } catch (error) {
      console.error(`Failed to derive keys for account ${i}:`, error);
    }
  }
} catch (error) {
  console.error("Failed to generate recovery phrase:", error);
  process.exit(1);
}
