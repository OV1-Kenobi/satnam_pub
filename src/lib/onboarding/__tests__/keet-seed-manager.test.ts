import { describe, it, expect } from "vitest";
import {
  SecureBuffer,
  encryptKeetSeed,
  decryptKeetSeed,
  generateKeetSeedPhrase,
} from "../keet-seed-manager";

const textDecoder = new TextDecoder();

describe("keet-seed-manager", () => {
  it("encrypts and decrypts Keet seed via SecureBuffer", async () => {
    const seedPhrase = generateKeetSeedPhrase();
    const password = "test-password-123";

    const { encryptedSeed, seedSalt } = await encryptKeetSeed(
      seedPhrase,
      password,
    );

    const buffer = await decryptKeetSeed(encryptedSeed, password, seedSalt);

    expect(buffer).toBeInstanceOf(SecureBuffer);

    const decryptedBytes = buffer.getData();
    const decryptedSeed = textDecoder.decode(decryptedBytes);

    expect(decryptedSeed).toBe(seedPhrase);

    buffer.destroy();
    expect(() => buffer.getData()).toThrow(/destroyed/i);
  });

  it("throws on invalid seed salt length", async () => {
    const password = "test-password-123";

    await expect(decryptKeetSeed("AA", password, "AA")).rejects.toThrow(
      /Invalid seed salt length/i,
    );
  });
});

