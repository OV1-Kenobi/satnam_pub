// Browser-compatible input validation using Zod schemas
// NO Node.js dependencies - uses Zod for validation

import { z } from 'zod';

// Common validation schemas
export const UserSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  npub: z.string().regex(/^npub[a-zA-Z0-9]{58}$/, 'Invalid npub format'),
  username: z.string().min(1).max(50, 'Username must be between 1 and 50 characters'),
  role: z.enum(['guardian', 'private', 'offspring', 'adult', 'steward']),
  familyId: z.string().optional()
});

export const FamilySchema = z.object({
  familyId: z.string().min(1, 'Family ID is required'),
  name: z.string().min(1).max(100, 'Family name must be between 1 and 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  settings: z.object({
    privacyLevel: z.enum(['public', 'private', 'federated']),
    allowExternalInvites: z.boolean(),
    requireApproval: z.boolean()
  }).optional()
});

export const PaymentSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  currency: z.enum(['sats', 'ecash', 'fedimint']),
  recipient: z.string().min(1, 'Recipient is required'),
  description: z.string().max(200, 'Description must be less than 200 characters').optional(),
  privacyLevel: z.enum(['public', 'private', 'federated']).optional()
});

export const AuthenticationSchema = z.object({
  method: z.enum(['nwc', 'otp', 'nsec', 'hardware']),
  identifier: z.string().min(1, 'Identifier is required'),
  code: z.string().optional(),
  privacyLevel: z.enum(['minimal', 'standard', 'maximum']).optional()
});

export const NostrEventSchema = z.object({
  kind: z.number().int().positive(),
  content: z.string(),
  tags: z.array(z.array(z.string())).optional(),
  created_at: z.number().int().positive().optional()
});

// Validation functions
export class InputValidator {
  /**
   * Validate user data
   */
  static validateUser(data: unknown) {
    return UserSchema.safeParse(data);
  }

  /**
   * Validate family data
   */
  static validateFamily(data: unknown) {
    return FamilySchema.safeParse(data);
  }

  /**
   * Validate payment data
   */
  static validatePayment(data: unknown) {
    return PaymentSchema.safeParse(data);
  }

  /**
   * Validate authentication data
   */
  static validateAuthentication(data: unknown) {
    return AuthenticationSchema.safeParse(data);
  }

  /**
   * Validate Nostr event
   */
  static validateNostrEvent(data: unknown) {
    return NostrEventSchema.safeParse(data);
  }

  /**
   * Sanitize string input
   */
  static sanitizeString(input: string): string {
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/[&]/g, '&amp;') // Escape ampersands
      .replace(/["]/g, '&quot;') // Escape quotes
      .replace(/[']/g, '&#x27;') // Escape single quotes
      .replace(/[/]/g, '&#x2F;'); // Escape forward slashes
  }

  /**
   * Validate email format
   */
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate npub format
   */
  static validateNpub(npub: string): boolean {
    const npubRegex = /^npub[a-zA-Z0-9]{58}$/;
    return npubRegex.test(npub);
  }

  /**
   * Validate nsec format
   */
  static validateNsec(nsec: string): boolean {
    const nsecRegex = /^nsec[a-zA-Z0-9]{58}$/;
    return nsecRegex.test(nsec);
  }

  /**
   * Validate Lightning invoice
   */
  static validateLightningInvoice(invoice: string): boolean {
    const invoiceRegex = /^lnbc[a-zA-Z0-9]+$/;
    return invoiceRegex.test(invoice);
  }

  /**
   * Validate amount (positive number)
   */
  static validateAmount(amount: number): boolean {
    return typeof amount === 'number' && amount > 0 && isFinite(amount);
  }

  /**
   * Validate UUID format
   */
  static validateUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Validate JSON string
   */
  static validateJSON(jsonString: string): boolean {
    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate URL format
   */
  static validateURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate date string
   */
  static validateDate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }

  /**
   * Get validation errors as formatted string
   */
  static getValidationErrors(result: z.SafeParseReturnType<any, any>): string[] {
    if (result.success) {
      return [];
    }

    return result.error.errors.map((error) => {
      const path = error.path.join('.');
      return `${path}: ${error.message}`;
    });
  }
}

 