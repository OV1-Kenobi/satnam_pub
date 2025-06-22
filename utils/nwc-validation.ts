// utils/nwc-validation.ts
import { z } from "zod";

// NWC URI validation schema
export const nwcUriSchema = z.object({
  protocol: z.literal("nostr+walletconnect"),
  pubkey: z.string().regex(/^[0-9a-f]{64}$/i, "Invalid pubkey format"),
  relay: z
    .string()
    .url("Invalid relay URL")
    .refine(
      (url) => url.startsWith("wss://") || url.startsWith("ws://"),
      "Relay must be a WebSocket URL (wss:// or ws://)"
    ),
  secret: z.string().min(64, "Invalid secret length"),
  permissions: z.array(z.string()).optional(),
});

export interface NWCConnectionInfo {
  pubkey: string;
  relay: string;
  secret: string;
  permissions?: string[];
}

export function validateNWCUri(nwcUri: string): {
  isValid: boolean;
  data?: NWCConnectionInfo;
  error?: string;
} {
  try {
    // Basic format check
    if (!nwcUri.startsWith("nostr+walletconnect://")) {
      return {
        isValid: false,
        error:
          "Invalid NWC URI protocol. Must start with nostr+walletconnect://",
      };
    }

    const url = new URL(nwcUri);

    // Extract components
    const pubkey = url.hostname;
    const relay = url.searchParams.get("relay");
    const secret = url.searchParams.get("secret");
    const permissionsStr =
      url.searchParams.get("permissions") || url.searchParams.get("perms");

    // Validate required components
    if (!pubkey || !relay || !secret) {
      return {
        isValid: false,
        error: "Missing required NWC parameters: pubkey, relay, or secret",
      };
    }

    // Parse permissions if provided
    let permissions: string[] | undefined;
    if (permissionsStr) {
      permissions = permissionsStr.split(",").map((p) => p.trim());
    }

    const connectionInfo: NWCConnectionInfo = {
      pubkey,
      relay,
      secret,
      permissions,
    };

    // Validate with schema
    const validationResult = nwcUriSchema.safeParse({
      protocol: "nostr+walletconnect",
      ...connectionInfo,
    });

    if (!validationResult.success) {
      return {
        isValid: false,
        error: validationResult.error.errors.map((e) => e.message).join(", "),
      };
    }

    return {
      isValid: true,
      data: connectionInfo,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Failed to parse NWC URI: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function sanitizeNWCData(
  connectionInfo: NWCConnectionInfo
): NWCConnectionInfo {
  return {
    pubkey: connectionInfo.pubkey.toLowerCase(),
    relay: connectionInfo.relay.trim(),
    secret: connectionInfo.secret, // Keep as-is for cryptographic purposes
    permissions: connectionInfo.permissions?.map((p) => p.toLowerCase().trim()),
  };
}
