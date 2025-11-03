/**
 * PKARR Publishing Helpers for Integration Tests
 * Phase 2 Week 3: Real Integration Testing
 *
 * Provides helpers for publishing and querying real PKARR records
 * to DHT relays. Uses actual PKARR relay endpoints.
 *
 * Usage:
 * ```typescript
 * const record = createPkarrRecord(publicKey, records);
 * const published = await publishPkarrRecord(record);
 * const queried = await queryPkarrRecordFromDHT(publicKey);
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PkarrRecord {
  public_key: string;
  records: Array<{
    name: string;
    type: string;
    value: string;
    ttl?: number;
  }>;
  timestamp: number;
  sequence: number;
  signature: string;
}

export interface PkarrPublishResult {
  success: boolean;
  publicKey: string;
  sequence: number;
  relaysPublished: string[];
  error?: string;
}

export interface PkarrQueryResult {
  success: boolean;
  record?: PkarrRecord;
  relayQueried?: string;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const PKARR_RELAYS = [
  "https://pkarr.relay.pubky.tech",
  "https://pkarr.relay.synonym.to",
];

const RELAY_TIMEOUT = 5000; // 5 seconds

// ============================================================================
// RECORD CREATION
// ============================================================================

/**
 * Create a PKARR record for testing
 */
export function createPkarrRecord(
  publicKey: string,
  records: Array<{
    name: string;
    type: string;
    value: string;
    ttl?: number;
  }>,
  sequence: number = 1
): PkarrRecord {
  const timestamp = Math.floor(Date.now() / 1000);

  return {
    public_key: publicKey,
    records,
    timestamp,
    sequence,
    signature: generateMockSignature(publicKey, timestamp, sequence),
  };
}

/**
 * Generate a mock Ed25519 signature for testing
 * In real scenarios, this would be signed with the private key
 */
function generateMockSignature(
  publicKey: string,
  timestamp: number,
  sequence: number
): string {
  // Generate a 128-character hex string (64 bytes)
  const chars = "0123456789abcdef";
  let signature = "";
  for (let i = 0; i < 128; i++) {
    signature += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return signature;
}

// ============================================================================
// RECORD PUBLISHING
// ============================================================================

/**
 * Publish a PKARR record to DHT relays
 */
export async function publishPkarrRecord(
  record: PkarrRecord
): Promise<PkarrPublishResult> {
  const relaysPublished: string[] = [];
  let lastError: string | undefined;

  for (const relay of PKARR_RELAYS) {
    try {
      const response = await Promise.race([
        fetch(`${relay}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record),
        }),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error("Relay timeout")), RELAY_TIMEOUT)
        ),
      ]);

      if (response.ok) {
        relaysPublished.push(relay);
      } else {
        lastError = `HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown error";
      console.warn(`Failed to publish to ${relay}:`, lastError);
    }
  }

  return {
    success: relaysPublished.length > 0,
    publicKey: record.public_key,
    sequence: record.sequence,
    relaysPublished,
    error: relaysPublished.length === 0 ? lastError : undefined,
  };
}

// ============================================================================
// RECORD QUERYING
// ============================================================================

/**
 * Query a PKARR record from DHT relays by public key
 */
export async function queryPkarrRecordFromDHT(
  publicKey: string
): Promise<PkarrQueryResult> {
  for (const relay of PKARR_RELAYS) {
    try {
      const response = await Promise.race([
        fetch(`${relay}/resolve/${publicKey}`),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error("Relay timeout")), RELAY_TIMEOUT)
        ),
      ]);

      if (response.ok) {
        const record = await response.json();
        return {
          success: true,
          record,
          relayQueried: relay,
        };
      }
    } catch (error) {
      console.warn(`Failed to query from ${relay}:`, error);
    }
  }

  return {
    success: false,
    error: "Failed to query record from all relays",
  };
}

// ============================================================================
// RECORD VALIDATION
// ============================================================================

/**
 * Validate public key format (64-character hex string)
 */
export function isValidPublicKey(publicKey: string): boolean {
  return /^[a-f0-9]{64}$/.test(publicKey);
}

/**
 * Validate PKARR record structure
 */
export function isValidPkarrRecord(record: any): boolean {
  return (
    record &&
    typeof record.public_key === "string" &&
    isValidPublicKey(record.public_key) &&
    Array.isArray(record.records) &&
    typeof record.timestamp === "number" &&
    typeof record.sequence === "number" &&
    typeof record.signature === "string" &&
    record.signature.length === 128
  );
}

/**
 * Validate DNS record structure
 */
export function isValidDnsRecord(record: any): boolean {
  return (
    record &&
    typeof record.name === "string" &&
    typeof record.type === "string" &&
    typeof record.value === "string" &&
    (record.ttl === undefined || typeof record.ttl === "number")
  );
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Publish multiple PKARR records
 */
export async function publishMultiplePkarrRecords(
  records: PkarrRecord[]
): Promise<PkarrPublishResult[]> {
  return Promise.all(records.map((record) => publishPkarrRecord(record)));
}

/**
 * Query multiple PKARR records
 */
export async function queryMultiplePkarrRecords(
  publicKeys: string[]
): Promise<PkarrQueryResult[]> {
  return Promise.all(publicKeys.map((key) => queryPkarrRecordFromDHT(key)));
}
