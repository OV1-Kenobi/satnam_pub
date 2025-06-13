const {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  pbkdf2,
} = require("crypto");
const { promisify } = require("util");

async function encryptData(data, password) {
  const iv = randomBytes(16);
  const salt = randomBytes(16);

  // Use PBKDF2 for secure key derivation
  const key = await promisify(pbkdf2)(password, salt, 100000, 32, "sha256");

  const cipher = createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");

  // Return iv:salt:encrypted
  return iv.toString("hex") + ":" + salt.toString("hex") + ":" + encrypted;
}

async function decryptData(encryptedData, password) {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const iv = Buffer.from(parts[0], "hex");
  const salt = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];

  // Use PBKDF2 for secure key derivation (same as in encryption)
  const key = await promisify(pbkdf2)(password, salt, 100000, 32, "sha256");

  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

async function testCrypto() {
  try {
    const testData = "Hello, World!";
    const password = "test-password";

    console.log("Testing async encryptData/decryptData...");

    // Test encryption
    const encrypted = await encryptData(testData, password);
    console.log("Encrypted:", encrypted);

    // Test decryption
    const decrypted = await decryptData(encrypted, password);
    console.log("Decrypted:", decrypted);

    // Verify the data matches
    if (testData === decrypted) {
      console.log("✅ SUCCESS: Encryption/Decryption working properly!");
    } else {
      console.log("❌ FAILED: Data mismatch!");
    }
  } catch (error) {
    console.error("❌ ERROR:", error);
  }
}

testCrypto();
