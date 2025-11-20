/**
 * Browser-safe OpenTimestamps local validation helper
 *
 * WARNING: This performs minimal structural validation and data-binding checks
 * only. It does NOT verify Bitcoin chain anchoring; that remains the
 * responsibility of server-side SimpleProof / Netlify functions.
 */

export type LocalOtsValidationStatus = "valid" | "invalid" | "inconclusive";

export interface LocalOtsValidationResult {
  status: LocalOtsValidationStatus;
  provider: "opentimestamps_local";
  reason?: string;
}

interface ValidationParams {
  data: string;
  otsProofHex: string;
}

const HEADER_MAGIC: number[] = [
  0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d,
  0x70, 0x73, 0x00, 0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2,
  0xe8, 0x84, 0xe8, 0x92, 0x94,
];

const MAJOR_VERSION = 1;
const SHA256_TAG = 0x08; // OpSHA256 tag in opentimestamps
const SHA256_DIGEST_LENGTH = 32;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length === 0 || clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) {
    throw new Error("Invalid hex string");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

function readVaruint(
  bytes: Uint8Array,
  offset: number
): {
  value: number;
  nextOffset: number;
} {
  let value = 0;
  let shift = 0;
  let position = offset;

  while (position < bytes.length) {
    const b = bytes[position];
    position += 1;
    value |= (b & 0b0111_1111) << shift;
    if ((b & 0b1000_0000) === 0) {
      return { value, nextOffset: position };
    }
    shift += 7;
    if (shift > 28) {
      break;
    }
  }

  throw new Error("Invalid varuint encoding in OTS proof");
}

function parseFileDigestFromOtsProof(otsBytes: Uint8Array): Uint8Array | null {
  if (otsBytes.length < HEADER_MAGIC.length + 1 + 1 + SHA256_DIGEST_LENGTH) {
    return null;
  }

  for (let i = 0; i < HEADER_MAGIC.length; i++) {
    if (otsBytes[i] !== HEADER_MAGIC[i]) {
      return null;
    }
  }

  const { value: majorVersion, nextOffset } = readVaruint(
    otsBytes,
    HEADER_MAGIC.length
  );
  if (majorVersion !== MAJOR_VERSION) {
    return null;
  }

  let offset = nextOffset;
  const opTag = otsBytes[offset];
  offset += 1;

  if (opTag !== SHA256_TAG) {
    // We only support SHA-256 file hashes in this minimal validator
    return null;
  }

  if (otsBytes.length < offset + SHA256_DIGEST_LENGTH) {
    return null;
  }

  return otsBytes.slice(offset, offset + SHA256_DIGEST_LENGTH);
}

async function computeExpectedDigest(data: string): Promise<Uint8Array | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return null;
  }

  const encoder = new TextEncoder();
  const encoded = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return new Uint8Array(hashBuffer);
}

export async function localValidateOtsProof(
  params: ValidationParams
): Promise<LocalOtsValidationResult> {
  const { data, otsProofHex } = params;

  if (!data || !otsProofHex) {
    return {
      status: "inconclusive",
      provider: "opentimestamps_local",
      reason: "Missing data or proof for local validation",
    };
  }

  let otsBytes: Uint8Array;
  try {
    otsBytes = hexToBytes(otsProofHex);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid OTS proof hex";
    return {
      status: "inconclusive",
      provider: "opentimestamps_local",
      reason: message,
    };
  }

  const fileDigest = parseFileDigestFromOtsProof(otsBytes);
  if (!fileDigest) {
    return {
      status: "inconclusive",
      provider: "opentimestamps_local",
      reason: "Unable to parse file digest from OTS proof",
    };
  }

  const expectedDigest = await computeExpectedDigest(data);

  if (!expectedDigest) {
    return {
      status: "inconclusive",
      provider: "opentimestamps_local",
      reason:
        "Unable to compute expected digest for local validation (Web Crypto unavailable or invalid data)",
    };
  }

  if (expectedDigest.length !== fileDigest.length) {
    return {
      status: "invalid",
      provider: "opentimestamps_local",
      reason: "Digest length mismatch between data and OTS proof",
    };
  }

  for (let i = 0; i < expectedDigest.length; i++) {
    if (expectedDigest[i] !== fileDigest[i]) {
      return {
        status: "invalid",
        provider: "opentimestamps_local",
        reason: "Digest mismatch between data and OTS proof",
      };
    }
  }

  return {
    status: "valid",
    provider: "opentimestamps_local",
  };
}
