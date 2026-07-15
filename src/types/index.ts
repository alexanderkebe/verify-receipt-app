// ============================================
// TypeScript Type Definitions
// Receipt Verification System
// ============================================

// ---- Provider Types ----
export type Provider = 'CBE' | 'TELEBIRR' | 'DASHEN' | 'ABYSSINIA' | 'CBE_BIRR' | 'MPESA';

export const PROVIDER_LABELS: Record<Provider, string> = {
  CBE: 'Commercial Bank of Ethiopia',
  TELEBIRR: 'Telebirr',
  DASHEN: 'Dashen Bank',
  ABYSSINIA: 'Bank of Abyssinia',
  CBE_BIRR: 'CBE Birr',
  MPESA: 'M-Pesa',
};

export const PROVIDER_COLORS: Record<Provider, string> = {
  CBE: '#1B4D8E',
  TELEBIRR: '#00A651',
  DASHEN: '#D4145A',
  ABYSSINIA: '#006837',
  CBE_BIRR: '#2196F3',
  MPESA: '#4CAF50',
};

// ---- Verification Types ----
export type VerificationStatus = 'VERIFIED' | 'NOT_FOUND' | 'INVALID' | 'ERROR' | 'TIMEOUT' | 'UNSUPPORTED';
export type TransactionStatus = 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED' | 'UNKNOWN';
export type ResultLevel = 'GREEN' | 'RED' | 'YELLOW';
export type EmployeeDecision = 'ACCEPTED' | 'REJECTED' | 'ESCALATED';

export const RESULT_LABELS: Record<ResultLevel, string> = {
  GREEN: 'Verified — Payment Matches',
  RED: 'Verified — Issue Detected',
  YELLOW: 'Unable to Verify',
};

export const RESULT_DESCRIPTIONS: Record<string, string> = {
  'GREEN': 'Payment is verified, recipient matches, amount is correct, and receipt is not a duplicate.',
  'RED_RECIPIENT': 'Transaction exists but the recipient does not match any of your registered accounts.',
  'RED_AMOUNT': 'Transaction exists but the expected and verified amounts differ.',
  'RED_DUPLICATE': 'This receipt reference was previously accepted by your business.',
  'RED_INVALID': 'The payment provider indicates this transaction failed, was cancelled, or the reference is invalid.',
  'YELLOW_UNABLE': 'We could not verify this receipt at this time due to a provider timeout or system issue. Please try again.',
  'YELLOW_MANUAL': 'This receipt requires manual review due to low confidence or unusual details.',
};

// ---- User & Auth Types ----
export type UserRole = 'OWNER' | 'MANAGER' | 'EMPLOYEE' | 'PLATFORM_ADMIN';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Business Owner',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
  PLATFORM_ADMIN: 'Platform Admin',
};

// ---- Alert Types ----
export type AlertSeverity = 'INFORMATIONAL' | 'WARNING' | 'HIGH_RISK' | 'CRITICAL';
export type AlertType = 
  | 'RECIPIENT_MISMATCH' 
  | 'DUPLICATE_RECEIPT' 
  | 'AMOUNT_MISMATCH'
  | 'UNSUCCESSFUL_TRANSACTION'
  | 'APPARENT_ALTERATION'
  | 'REPEATED_FAILURES'
  | 'UNUSUAL_ACTIVITY'
  | 'REPEATED_OVERRIDES';
export type AlertStatus = 'OPEN' | 'ASSIGNED' | 'RESOLVED' | 'DISMISSED';

export const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  INFORMATIONAL: 'Info',
  WARNING: 'Warning',
  HIGH_RISK: 'High Risk',
  CRITICAL: 'Critical',
};

// ---- Subscription Types ----
export type SubscriptionTier = 'FREE' | 'BASIC' | 'PRO';

export const TIER_LIMITS: Record<SubscriptionTier, number> = {
  FREE: 50,
  BASIC: 500,
  PRO: -1, // unlimited
};

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  FREE: 'Free',
  BASIC: 'Basic',
  PRO: 'Pro',
};

// ---- API Response Types ----
export interface NormalizedVerificationResult {
  provider: Provider;
  verificationStatus: VerificationStatus;
  transactionStatus: TransactionStatus;
  reference: string;
  referenceMasked: string;
  payerName: string | null;
  recipientName: string | null;
  recipientAccount: string | null;
  recipientAccountMasked: string | null;
  amount: number | null;
  currency: string;
  transactionDate: string | null;
  receiptNumber: string | null;
  description: string | null;
  fees: number | null;
  rawResponse: Record<string, unknown>;
}

export interface VerificationInput {
  provider?: Provider;
  reference: string;
  suffix?: string;
  phoneNumber?: string;
  expectedAmount?: number;
  /** Hosted receipt token (CBE mbreciept / BoA slip QR) — resolved via the bank's public API */
  receiptToken?: string;
}

export interface ImageVerificationInput {
  imageFile: File;
  expectedAmount?: number;
}

export interface VerificationResult {
  id: string;
  provider: Provider;
  verificationStatus: VerificationStatus;
  transactionStatus: TransactionStatus | null;
  resultLevel: ResultLevel;
  resultReason: string;
  referenceMasked: string;
  payerName: string | null;
  recipientName: string | null;
  recipientAccountMasked: string | null;
  recipientMatches: boolean | null;
  amountMatches: boolean | null;
  expectedAmount: number | null;
  verifiedAmount: number | null;
  currency: string;
  isDuplicate: boolean;
  duplicateInfo: DuplicateInfo | null;
  transactionDate: string | null;
  // Extra details returned by the Verifier API, shown as-is
  receiptNumber?: string | null;
  fees?: number | null;
  apiDescription?: string | null;
  processingTimeMs: number;
  createdAt: string;
}

export interface DuplicateInfo {
  previousVerificationId: string;
  previousDate: string;
  previousBranch: string | null;
  previousEmployee: string;
  previousResult: ResultLevel;
  previousDecision: EmployeeDecision | null;
  previousAmount: number | null;
}

// ---- Dashboard Types ----
export interface DashboardStats {
  totalToday: number;
  successfulToday: number;
  rejectedToday: number;
  duplicatesDetected: number;
  recipientMismatches: number;
  amountMismatches: number;
  verificationFailures: number;
  totalValueVerified: number;
  providerBreakdown: ProviderStat[];
  employeeBreakdown: EmployeeStat[];
  recentVerifications: VerificationSummary[];
  unresolvedAlerts: number;
  trend: TrendPoint[];
}

export interface ProviderStat {
  provider: Provider;
  count: number;
  successRate: number;
}

export interface EmployeeStat {
  employeeId: string;
  employeeName: string;
  count: number;
  successRate: number;
}

export interface VerificationSummary {
  id: string;
  provider: Provider;
  resultLevel: ResultLevel;
  referenceMasked: string;
  amount: number | null;
  employeeName: string;
  createdAt: string;
}

export interface TrendPoint {
  date: string;
  total: number;
  successful: number;
  failed: number;
}

// ---- Session Types ----
export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  businessId: string | null;
  branchId: string | null;
  businessName: string | null;
}

// ---- API Request/Response ----
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface HistoryFilters {
  dateFrom?: string;
  dateTo?: string;
  provider?: Provider;
  resultLevel?: ResultLevel;
  employeeId?: string;
  branchId?: string;
  reference?: string;
  minAmount?: number;
  maxAmount?: number;
  decision?: EmployeeDecision;
  page?: number;
  pageSize?: number;
}
