import { z } from "zod";

// Domain configuration schema
export const domainConfigureSchema = z.object({
  familyId: z.string().uuid(),
  domainName: z.string().min(3).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/, "Invalid domain name format"),
  domainType: z.enum(["traditional", "pubky", "handshake", "ens"]),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
  userPubkey: z.string().regex(/^[0-9a-f]{64}$/i, "Invalid Nostr public key format"),
  lightningEndpoint: z.string().url("Invalid Lightning endpoint URL"),
});

// Type for domain configuration data
export type DomainConfigData = z.infer<typeof domainConfigureSchema>;