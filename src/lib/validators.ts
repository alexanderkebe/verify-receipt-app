// ============================================
// Zod Validation Schemas
// Shared between API routes and client forms
// ============================================

import { z } from 'zod';
import { AUTH_CONFIG, PROVIDER_REFERENCE_PATTERNS } from '@/lib/constants';

const PROVIDERS = ['CBE', 'TELEBIRR', 'DASHEN', 'ABYSSINIA', 'CBE_BIRR', 'MPESA'] as const;

export const providerSchema = z.enum(PROVIDERS);

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');
const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+?251|0)?9\d{8}$/, 'Enter a valid Ethiopian phone number')
  .optional()
  .or(z.literal(''));
const passwordSchema = z
  .string()
  .min(AUTH_CONFIG.passwordMinLength, `Password must be at least ${AUTH_CONFIG.passwordMinLength} characters`);

// ---- Auth ----
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  // Step 1 — business
  legalName: z.string().trim().min(2, 'Business legal name is required'),
  tradingName: z.string().trim().optional(),
  businessType: z.string().trim().min(1, 'Business type is required'),
  sector: z.string().trim().optional(),
  phone: z.string().trim().min(7, 'Business phone is required'),
  email: emailSchema,
  city: z.string().trim().optional(),
  region: z.string().trim().optional(),
  address: z.string().trim().optional(),
  // Step 2 — first payment account
  account: z
    .object({
      provider: providerSchema,
      accountHolderName: z.string().trim().min(2, 'Account holder name is required'),
      accountNumber: z.string().trim().min(4, 'Account number is required'),
      suffix: z.string().trim().optional(),
      phoneNumber: z.string().trim().optional(),
      nickname: z.string().trim().optional(),
    })
    .optional(),
  // Step 3 — owner account
  ownerName: z.string().trim().min(2, 'Your full name is required'),
  ownerEmail: emailSchema,
  ownerPassword: passwordSchema,
  tosAccepted: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms of service' }) }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

// ---- Employees ----
export const employeeSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required'),
  email: emailSchema,
  phone: phoneSchema,
  jobTitle: z.string().trim().optional(),
  employeeCode: z.string().trim().optional(),
  role: z.enum(['MANAGER', 'EMPLOYEE']),
  branchId: z.string().uuid().optional().nullable(),
});

// ---- Payment Accounts ----
export const paymentAccountSchema = z.object({
  provider: providerSchema,
  accountHolderName: z.string().trim().min(2, 'Account holder name is required'),
  accountNumber: z.string().trim().min(4, 'Account number is required'),
  suffix: z.string().trim().optional(),
  phoneNumber: z.string().trim().optional(),
  nickname: z.string().trim().optional(),
  branchId: z.string().uuid().optional().nullable(),
});

// ---- Verification ----
export const manualVerificationSchema = z
  .object({
    provider: providerSchema,
    reference: z.string().trim().min(4, 'Reference is required'),
    suffix: z.string().trim().optional(),
    phoneNumber: z.string().trim().optional(),
    expectedAmount: z.coerce.number().positive('Amount must be greater than zero').optional(),
  })
  .superRefine((val, ctx) => {
    const pattern = PROVIDER_REFERENCE_PATTERNS[val.provider];
    if (pattern && !pattern.pattern.test(val.reference)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reference'], message: pattern.description });
    }
  });
export type ManualVerificationInput = z.infer<typeof manualVerificationSchema>;

export const decisionSchema = z.object({
  decision: z.enum(['ACCEPTED', 'REJECTED', 'ESCALATED']),
  reason: z.string().trim().max(500).optional(),
});

export const overrideSchema = z.object({
  finalDecision: z.enum(['ACCEPTED', 'REJECTED']),
  reason: z.string().trim().min(5, 'A reason (min 5 chars) is required'),
  // Supervisor re-auth
  password: z.string().min(1, 'Supervisor password is required'),
});

/**
 * Flatten a ZodError into a `{ field: message }` map for form display.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
