// Simple test script for NIP-06 key derivation
const crypto = require("./utils/crypto");

// Generate a recovery phrase
const phrase = crypto.generateRecoveryPhrase();
console.log("Recovery phrase:", phrase);

// Derive a key using the NIP-06 standard path
const privateKey = crypto.privateKeyFromPhrase(phrase);
console.log("Private key (account 0):", privateKey);

// Derive keys for multiple accounts
console.log("\nDeriving keys for multiple accounts:");
for (let i = 0; i < 3; i++) {
  const accountKey = crypto.privateKeyFromPhraseWithAccount(phrase, i);
  console.log(`Account ${i} private key:`, accountKey);

  // Generate a full key pair
  const keyPair = crypto.generateNostrKeyPair(phrase, i);
  console.log(`Account ${i} public key:`, keyPair.publicKey);
  console.log(`Account ${i} npub:`, keyPair.npub);
}
