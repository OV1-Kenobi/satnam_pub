/**
 * Password Recovery Key (PRK) System Tests
 *
 * Tests for PRK encryption, decryption, and recovery functions.
 * Ensures zero-knowledge password recovery works correctly.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  createPRKFromNsec,
  createPRKFromKeetSeed,
  recoverPasswordFromNsec,
  recoverPasswordFromKeetSeed,
  createPRKs,
  prkResultToDatabaseFields,
  databaseFieldsToPRK,
  type PRKEncryptionResult,
  type PRKCreationResult,
} from "../password-recovery-key";

// Test fixtures
const TEST_PASSWORD = "MySecurePassword123!";
const TEST_NSEC =
  "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5";
const TEST_KEET_SEED =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

describe("Password Recovery Key System", () => {
  describe("createPRKFromNsec", () => {
    it("should create a valid PRK from nsec", async () => {
      const prk = await createPRKFromNsec(TEST_PASSWORD, TEST_NSEC);

      expect(prk).toBeDefined();
      expect(prk.encrypted).toBeDefined();
      expect(prk.salt).toBeDefined();
      expect(prk.iv).toBeDefined();

      // Verify base64url encoding (no +, /, or = characters)
      expect(prk.encrypted).not.toMatch(/[+/=]/);
      expect(prk.salt).not.toMatch(/[+/=]/);
      expect(prk.iv).not.toMatch(/[+/=]/);
    });

    it("should generate unique salt and IV for each call", async () => {
      const prk1 = await createPRKFromNsec(TEST_PASSWORD, TEST_NSEC);
      const prk2 = await createPRKFromNsec(TEST_PASSWORD, TEST_NSEC);

      expect(prk1.salt).not.toBe(prk2.salt);
      expect(prk1.iv).not.toBe(prk2.iv);
      expect(prk1.encrypted).not.toBe(prk2.encrypted);
    });

    it("should throw error for invalid nsec format", async () => {
      await expect(
        createPRKFromNsec(TEST_PASSWORD, "invalid-nsec"),
      ).rejects.toThrow();
    });
  });

  describe("createPRKFromKeetSeed", () => {
    it("should create a valid PRK from Keet seed", async () => {
      const prk = await createPRKFromKeetSeed(TEST_PASSWORD, TEST_KEET_SEED);

      expect(prk).toBeDefined();
      expect(prk.encrypted).toBeDefined();
      expect(prk.salt).toBeDefined();
      expect(prk.iv).toBeDefined();

      // Verify base64url encoding
      expect(prk.encrypted).not.toMatch(/[+/=]/);
      expect(prk.salt).not.toMatch(/[+/=]/);
      expect(prk.iv).not.toMatch(/[+/=]/);
    });

    it("should generate unique salt and IV for each call", async () => {
      const prk1 = await createPRKFromKeetSeed(TEST_PASSWORD, TEST_KEET_SEED);
      const prk2 = await createPRKFromKeetSeed(TEST_PASSWORD, TEST_KEET_SEED);

      expect(prk1.salt).not.toBe(prk2.salt);
      expect(prk1.iv).not.toBe(prk2.iv);
    });

    it("should throw error for invalid mnemonic", async () => {
      await expect(
        createPRKFromKeetSeed(TEST_PASSWORD, "invalid seed phrase"),
      ).rejects.toThrow();
    });
  });

  describe("recoverPasswordFromNsec", () => {
    it("should recover password correctly with valid nsec", async () => {
      const prk = await createPRKFromNsec(TEST_PASSWORD, TEST_NSEC);
      const recovered = await recoverPasswordFromNsec(prk, TEST_NSEC);

      expect(recovered).toBe(TEST_PASSWORD);
    });

    it("should fail with wrong nsec", async () => {
      const prk = await createPRKFromNsec(TEST_PASSWORD, TEST_NSEC);
      const wrongNsec =
        "nsec1qqqqqmgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5";

      await expect(recoverPasswordFromNsec(prk, wrongNsec)).rejects.toThrow();
    });

    it("should recover different passwords correctly", async () => {
      const password1 = "FirstPassword123!";
      const password2 = "SecondPassword456!";

      const prk1 = await createPRKFromNsec(password1, TEST_NSEC);
      const prk2 = await createPRKFromNsec(password2, TEST_NSEC);

      const recovered1 = await recoverPasswordFromNsec(prk1, TEST_NSEC);
      const recovered2 = await recoverPasswordFromNsec(prk2, TEST_NSEC);

      expect(recovered1).toBe(password1);
      expect(recovered2).toBe(password2);
    });
  });

  describe("recoverPasswordFromKeetSeed", () => {
    it("should recover password correctly with valid seed", async () => {
      const prk = await createPRKFromKeetSeed(TEST_PASSWORD, TEST_KEET_SEED);
      const recovered = await recoverPasswordFromKeetSeed(prk, TEST_KEET_SEED);

      expect(recovered).toBe(TEST_PASSWORD);
    });

    it("should fail with wrong seed", async () => {
      const prk = await createPRKFromKeetSeed(TEST_PASSWORD, TEST_KEET_SEED);
      const wrongSeed =
        "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";

      await expect(
        recoverPasswordFromKeetSeed(prk, wrongSeed),
      ).rejects.toThrow();
    });
  });

  describe("createPRKs", () => {
    it("should create both PRKs when both secrets provided", async () => {
      const result = await createPRKs(TEST_PASSWORD, TEST_NSEC, TEST_KEET_SEED);

      expect(result.nsecPRK).toBeDefined();
      expect(result.keetPRK).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.version).toBe(1);
    });

    it("should create only nsec PRK when only nsec provided", async () => {
      const result = await createPRKs(TEST_PASSWORD, TEST_NSEC, undefined);

      expect(result.nsecPRK).toBeDefined();
      expect(result.keetPRK).toBeUndefined();
    });

    it("should create only keet PRK when only seed provided", async () => {
      const result = await createPRKs(TEST_PASSWORD, undefined, TEST_KEET_SEED);

      expect(result.nsecPRK).toBeUndefined();
      expect(result.keetPRK).toBeDefined();
    });

    it("should throw when no secrets provided", async () => {
      await expect(
        createPRKs(TEST_PASSWORD, undefined, undefined),
      ).rejects.toThrow();
    });
  });

  describe("prkResultToDatabaseFields", () => {
    it("should convert PRK result with both PRKs to database fields", async () => {
      const result = await createPRKs(TEST_PASSWORD, TEST_NSEC, TEST_KEET_SEED);
      const dbFields = prkResultToDatabaseFields(result);

      expect(dbFields.encrypted_prk_nsec).toBe(result.nsecPRK?.encrypted);
      expect(dbFields.prk_salt_nsec).toBe(result.nsecPRK?.salt);
      expect(dbFields.prk_iv_nsec).toBe(result.nsecPRK?.iv);
      expect(dbFields.encrypted_prk_keet).toBe(result.keetPRK?.encrypted);
      expect(dbFields.prk_salt_keet).toBe(result.keetPRK?.salt);
      expect(dbFields.prk_iv_keet).toBe(result.keetPRK?.iv);
      expect(dbFields.prk_created_at).toBe(result.createdAt);
      expect(dbFields.prk_updated_at).toBe(result.createdAt);
      expect(dbFields.prk_version).toBe(result.version);
    });

    it("should set null for missing keet PRK fields", async () => {
      const result = await createPRKs(TEST_PASSWORD, TEST_NSEC, undefined);
      const dbFields = prkResultToDatabaseFields(result);

      expect(dbFields.encrypted_prk_nsec).not.toBeNull();
      expect(dbFields.encrypted_prk_keet).toBeNull();
      expect(dbFields.prk_salt_keet).toBeNull();
      expect(dbFields.prk_iv_keet).toBeNull();
    });

    it("should set null for missing nsec PRK fields", async () => {
      const result = await createPRKs(TEST_PASSWORD, undefined, TEST_KEET_SEED);
      const dbFields = prkResultToDatabaseFields(result);

      expect(dbFields.encrypted_prk_nsec).toBeNull();
      expect(dbFields.prk_salt_nsec).toBeNull();
      expect(dbFields.prk_iv_nsec).toBeNull();
      expect(dbFields.encrypted_prk_keet).not.toBeNull();
    });
  });

  describe("databaseFieldsToPRK", () => {
    it("should convert database fields to nsec PRK", async () => {
      const result = await createPRKs(TEST_PASSWORD, TEST_NSEC, TEST_KEET_SEED);
      const dbFields = prkResultToDatabaseFields(result);
      const prk = databaseFieldsToPRK(dbFields, "nsec");

      expect(prk).not.toBeNull();
      expect(prk?.encrypted).toBe(result.nsecPRK?.encrypted);
      expect(prk?.salt).toBe(result.nsecPRK?.salt);
      expect(prk?.iv).toBe(result.nsecPRK?.iv);
    });

    it("should convert database fields to keet PRK", async () => {
      const result = await createPRKs(TEST_PASSWORD, TEST_NSEC, TEST_KEET_SEED);
      const dbFields = prkResultToDatabaseFields(result);
      const prk = databaseFieldsToPRK(dbFields, "keet");

      expect(prk).not.toBeNull();
      expect(prk?.encrypted).toBe(result.keetPRK?.encrypted);
      expect(prk?.salt).toBe(result.keetPRK?.salt);
      expect(prk?.iv).toBe(result.keetPRK?.iv);
    });

    it("should return null when nsec PRK fields are missing", () => {
      const prk = databaseFieldsToPRK({}, "nsec");
      expect(prk).toBeNull();
    });

    it("should return null when keet PRK fields are missing", () => {
      const prk = databaseFieldsToPRK({}, "keet");
      expect(prk).toBeNull();
    });

    it("should return null when only partial nsec fields exist", () => {
      const prk = databaseFieldsToPRK(
        { encrypted_prk_nsec: "test", prk_salt_nsec: null, prk_iv_nsec: null },
        "nsec",
      );
      expect(prk).toBeNull();
    });

    it("should return null when only partial keet fields exist", () => {
      const prk = databaseFieldsToPRK(
        {
          encrypted_prk_keet: "test",
          prk_salt_keet: "salt",
          prk_iv_keet: null,
        },
        "keet",
      );
      expect(prk).toBeNull();
    });

    it("should enable round-trip recovery from database fields", async () => {
      // Create PRK, convert to DB fields, convert back, and recover password
      const result = await createPRKs(TEST_PASSWORD, TEST_NSEC, TEST_KEET_SEED);
      const dbFields = prkResultToDatabaseFields(result);

      const nsecPrk = databaseFieldsToPRK(dbFields, "nsec");
      const keetPrk = databaseFieldsToPRK(dbFields, "keet");

      expect(nsecPrk).not.toBeNull();
      expect(keetPrk).not.toBeNull();

      // Recover password using nsec
      const recoveredFromNsec = await recoverPasswordFromNsec(
        nsecPrk!,
        TEST_NSEC,
      );
      expect(recoveredFromNsec).toBe(TEST_PASSWORD);

      // Recover password using keet seed
      const recoveredFromKeet = await recoverPasswordFromKeetSeed(
        keetPrk!,
        TEST_KEET_SEED,
      );
      expect(recoveredFromKeet).toBe(TEST_PASSWORD);
    });
  });
});
