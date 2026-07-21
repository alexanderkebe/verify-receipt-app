// ============================================
// Zod Validation Schemas
// Shared between API routes and client forms
// ============================================

import { z } from 'zod';
import { AUTH_CONFIG } from '@/lib/constants';

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

const registerAccountSchema = z
  .object({
    provider: providerSchema,
    accountHolderName: z.string().trim().min(2, 'Account holder name is required'),
    accountNumber: z.string().trim().min(4, 'Account or phone number is required'),
  })
  .superRefine((val, ctx) => {
    // Mobile money providers use a phone number as the account number
    if (val.provider === 'CBE_BIRR' || val.provider === 'TELEBIRR') {
      if (!/^(\+?251|0)?9\d{8}$/.test(val.accountNumber.replace(/\s/g, ''))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['accountNumber'],
          message: 'Enter a valid Ethiopian phone number for this provider',
        });
      }
    }
  });

export const registerSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is required'),
  ownerName: z.string().trim().min(2, 'Your name is required'),
  email: emailSchema,
  password: passwordSchema,
  // Shared password employees will use to join this business
  businessPassword: z.string().min(6, 'Business password must be at least 6 characters'),
  // All payment accounts the business receives money with
  accounts: z.array(registerAccountSchema).min(1, 'Add at least one payment account'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const businessJoinSchema = z.object({
  businessId: z.string().uuid('Select a business from the list'),
  businessPassword: z.string().min(1, 'Business password is required'),
  fullName: z.string().trim().min(2, 'Your full name is required'),
  email: emailSchema,
  password: passwordSchema,
});
export type BusinessJoinInput = z.infer<typeof businessJoinSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().length(64, 'This password reset link is invalid'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

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
export const paymentAccountSchema = z
  .object({
    provider: providerSchema,
    accountHolderName: z.string().trim().min(2, 'Account holder name is required'),
    accountNumber: z.string().trim().min(4, 'Account number is required'),
    suffix: z.string().trim().optional(),
    phoneNumber: z.string().trim().optional(),
    nickname: z.string().trim().optional(),
    branchId: z.string().uuid().optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.provider !== 'TELEBIRR') return;
    const phone = (val.phoneNumber || val.accountNumber).replace(/[^0-9]/g, '');
    if (!/^(251|0)?9\d{8}$/.test(phone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountNumber'],
        message: 'Enter the full Ethiopian Telebirr phone number',
      });
    }
  });

// ---- Verification ----
// A single free-form input: reference number or receipt URL.
// Provider is auto-detected server-side / at the Verifier API,
// but the user can pin it explicitly from the manual form.
export const manualVerificationSchema = z.object({
  input: z.string().trim().min(4, 'Enter a reference number or receipt link'),
  provider: providerSchema.optional(),
  expectedAmount: z.coerce.number().positive('Amount must be greater than zero').optional(),
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
