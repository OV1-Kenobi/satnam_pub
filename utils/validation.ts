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

// Federation validation schemas
const createFederationSchemaBase = z.object({
  action: z.literal("create"),
  name: z
    .string()
    .min(1, "Federation name is required")
    .max(100, "Federation name must be 100 characters or less"),
  description: z
    .string()
    .max(500, "Description must be 500 characters or less")
    .optional(),
  guardianUrls: z
    .array(z.string().url("Invalid guardian URL format"))
    .min(1, "At least one guardian URL is required")
    .max(10, "Maximum 10 guardian URLs allowed"),
  threshold: z
    .number()
    .int("Threshold must be an integer")
    .min(1, "Threshold must be at least 1")
    .max(10, "Threshold cannot exceed 10"),
});

export const createFederationSchema = createFederationSchemaBase.refine(
  (data) => {
    // Cross-field validation: threshold cannot exceed guardian count
    return data.threshold <= data.guardianUrls.length;
  },
  {
    message: "Threshold cannot exceed the number of guardians",
    path: ["threshold"],
  }
);

export const joinFederationSchema = z.object({
  action: z.literal("join"),
  inviteCode: z.string().min(1, "Invite code is required"),
});

export const connectFederationSchema = z.object({
  action: z.literal("connect"),
  federationId: z.string().min(1, "Federation ID is required"),
});

export const federationActionSchema = z.discriminatedUnion("action", [
  createFederationSchemaBase,
  joinFederationSchema,
  connectFederationSchema,
]);

// GET federation query schema
export const getFederationQuerySchema = z.object({
  id: z.string().min(1, "Federation ID is required").optional(),
});

// Validate request data against a schema
export function validateData<T>(
  schema: z.ZodType<T>,
  data: unknown
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

// Helper function to format Zod errors for API responses
export function formatValidationErrors(error: z.ZodError): {
  message: string;
  errors: Record<string, string[]>;
} {
  const errors: Record<string, string[]> = {};

  error.errors.forEach((err) => {
    const path = err.path.join(".");
    if (!errors[path]) {
      errors[path] = [];
    }
    errors[path].push(err.message);
  });

  return {
    message: "Validation failed",
    errors,
  };
}
