import { z } from "zod";

// User validation schema
export const userSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  displayName: z.string().min(1).max(100).optional(),
  nostrPublicKey: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "Invalid Nostr public key format")
    .optional(),
});

// Family validation schema
export const familySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  adminId: z.string().uuid(),
  members: z.array(z.string().uuid()).optional(),
});

// Lightning address validation schema
export const lightningAddressSchema = z.object({
  username: z.string().min(3).max(50),
  domain: z.string().min(3).max(100),
});

// NIP-05 verification schema
export const nip05Schema = z.object({
  name: z.string().min(1).max(100),
  pubkey: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "Invalid Nostr public key format"),
});

// Validate request data against a schema
export function validateData<T>(
  schema: z.ZodType<T>,
  data: unknown,
): {
  success: boolean;
  data?: T;
  error?: z.ZodError;
} {
  try {
    const validData = schema.parse(data);
    return { success: true, data: validData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error };
    }
    throw error;
  }
}
