// ============================================
// Constants and Configuration
// Receipt Verification System
// ============================================

import type { Provider, SubscriptionTier } from '@/types';

// ---- Verifier API Configuration ----
export const VERIFIER_API_BASE_URL = process.env.VERIFIER_API_URL || 'https://verifyapi.leulzenebe.pro';
export const VERIFIER_API_KEY = process.env.VERIFIER_API_KEY || '';

// ---- Provider Endpoint Mapping ----
export const PROVIDER_ENDPOINTS: Record<Provider, string> = {
  CBE: '/verify-cbe',
  TELEBIRR: '/verify-telebirr',
  DASHEN: '/verify-dashen',
  ABYSSINIA: '/verify-abyssinia',
  CBE_BIRR: '/verify-cbebirr',
  MPESA: '/verify-mpesa',
};

// ---- Provider Reference Formats (for validation) ----
export const PROVIDER_REFERENCE_PATTERNS: Record<Provider, { pattern: RegExp; description: string }> = {
  CBE: {
    pattern: /^[A-Za-z0-9]{6,30}$/,
    description: 'CBE reference: 6-30 alphanumeric characters',
  },
  TELEBIRR: {
    pattern: /^[A-Za-z0-9]{6,30}$/,
    description: 'Telebirr reference: 6-30 alphanumeric characters',
  },
  DASHEN: {
    pattern: /^[A-Za-z0-9]{6,30}$/,
    description: 'Dashen reference: 6-30 alphanumeric characters',
  },
  ABYSSINIA: {
    pattern: /^[A-Za-z0-9]{6,30}$/,
    description: 'Bank of Abyssinia reference: 6-30 alphanumeric characters',
  },
  CBE_BIRR: {
    pattern: /^[A-Za-z0-9]{6,30}$/,
    description: 'CBE Birr receipt number: 6-30 alphanumeric characters',
  },
  MPESA: {
    pattern: /^[A-Za-z0-9]{6,30}$/,
    description: 'M-Pesa receipt number: 6-30 alphanumeric characters',
  },
};

// ---- Provider Additional Field Requirements ----
export const PROVIDER_REQUIRED_FIELDS: Record<Provider, string[]> = {
  CBE: ['suffix'],          // 8-digit account suffix
  TELEBIRR: [],             // Reference only
  DASHEN: [],               // Reference only
  ABYSSINIA: ['suffix'],    // 5-digit suffix
  CBE_BIRR: ['phoneNumber'], // Ethiopian phone number
  MPESA: [],                // Receipt number only
};

export const PROVIDER_FIELD_LABELS: Record<string, { label: string; placeholder: string; help: string }> = {
  suffix_CBE: {
    label: 'Account Suffix',
    placeholder: 'Enter 8-digit suffix',
    help: 'The last 8 digits of the receiving CBE account number',
  },
  suffix_ABYSSINIA: {
    label: 'Account Suffix',
    placeholder: 'Enter 5-digit suffix',
    help: 'The last 5 digits of the receiving Bank of Abyssinia account number',
  },
  phoneNumber_CBE_BIRR: {
    label: 'Phone Number',
    placeholder: '2519XXXXXXXX',
    help: 'Ethiopian phone number in 251 format',
  },
};

// ---- Subscription Tier Config ----
export const SUBSCRIPTION_CONFIG: Record<SubscriptionTier, {
  label: string;
  limit: number;
  price: string;
  features: string[];
}> = {
  FREE: {
    label: 'Free',
    limit: 50,
    price: 'Free',
    features: [
      '50 verifications per month',
      '1 payment account',
      '2 employees',
      'Basic dashboard',
      'Email support',
    ],
  },
  BASIC: {
    label: 'Basic',
    limit: 500,
    price: '500 ETB/mo',
    features: [
      '500 verifications per month',
      '5 payment accounts',
      '10 employees',
      'Full dashboard & reports',
      'Fraud alerts',
      'CSV/PDF export',
      'Priority support',
    ],
  },
  PRO: {
    label: 'Pro',
    limit: -1,
    price: '1,500 ETB/mo',
    features: [
      'Unlimited verifications',
      'Unlimited payment accounts',
      'Unlimited employees',
      'Full dashboard & reports',
      'Advanced fraud alerts',
      'CSV/PDF export',
      'API access',
      'Dedicated support',
      'Multi-branch management',
    ],
  },
};

// ---- File Upload Config ----
export const UPLOAD_CONFIG = {
  maxFileSizeMB: 10,
  maxFileSizeBytes: 10 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.pdf'],
  imageRetentionDays: 30,
};

// ---- Auth Config ----
export const AUTH_CONFIG = {
  maxLoginAttempts: 5,
  lockoutDurationMinutes: 15,
  sessionMaxAgeSeconds: 30 * 24 * 60 * 60, // 30 days — stay signed in
  verificationCodeExpMinutes: 15,
  resetTokenExpMinutes: 60,
  invitationExpDays: 7,
  passwordMinLength: 8,
};

// ---- Verification Config ----
export const VERIFICATION_CONFIG = {
  // Telebirr lookups regularly take 30s+ (the provider's receipt site is
  // slow from abroad) — keep this under the route's 60s maxDuration.
  apiTimeoutMs: 45000,
  maxRetries: 1,
  retryDelayMs: 1000,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60000,
  transactionTimeWindowHours: 72, // warn if tx older than this
};

// ---- Pagination ----
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const EXPORT_MAX_ROWS = 5000;

// ---- Nav Items ----
export const DASHBOARD_NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard', roles: ['OWNER', 'MANAGER', 'EMPLOYEE'] },
  { label: 'Verify Receipt', href: '/verify', icon: 'scan', roles: ['OWNER', 'MANAGER', 'EMPLOYEE'] },
  { label: 'History', href: '/history', icon: 'history', roles: ['OWNER', 'MANAGER', 'EMPLOYEE'] },
  { label: 'Employees', href: '/employees', icon: 'people', roles: ['OWNER', 'MANAGER'] },
  { label: 'Payment Accounts', href: '/accounts', icon: 'account', roles: ['OWNER', 'MANAGER'] },
  { label: 'Fraud Alerts', href: '/alerts', icon: 'alert', roles: ['OWNER', 'MANAGER'] },
  { label: 'Reports', href: '/reports', icon: 'chart', roles: ['OWNER', 'MANAGER'] },
  { label: 'Settings', href: '/settings', icon: 'settings', roles: ['OWNER'] },
];

export const ADMIN_NAV_ITEMS = [
  { label: 'Overview', href: '/admin', icon: 'dashboard' },
  { label: 'Businesses', href: '/admin/businesses', icon: 'business' },
  { label: 'Monitoring', href: '/admin/monitoring', icon: 'monitor' },
  { label: 'Audit Log', href: '/admin/audit', icon: 'audit' },
];
