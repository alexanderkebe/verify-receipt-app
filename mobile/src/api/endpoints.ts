// ============================================
// Typed wrappers around the backend routes the app uses.
// Shapes mirror the web app's API responses.
// ============================================

import { apiFetch } from './client';

export type Provider = 'CBE' | 'TELEBIRR' | 'DASHEN' | 'ABYSSINIA' | 'CBE_BIRR' | 'MPESA';
export type ResultLevel = 'GREEN' | 'YELLOW' | 'RED';
export type Decision = 'ACCEPTED' | 'REJECTED' | 'ESCALATED';

export interface Me {
  id: string;
  fullName: string;
  email: string;
  role: 'OWNER' | 'MANAGER' | 'EMPLOYEE' | 'PLATFORM_ADMIN';
  businessName: string | null;
  mustChangePassword: boolean;
}

export interface MeStats {
  today: { total: number; verified: number; issues: number; rejected: number; valueVerified: number };
  yesterday: { total: number; verified: number };
  trend: Array<{ date: string; total: number; verified: number; failed: number }>;
  decisions: { accepted: number; rejected: number; escalated: number };
}

export interface DuplicateInfo {
  previousVerificationId: string;
  previousDate: string;
  previousBranch: string | null;
  previousEmployee: string;
  previousResult: ResultLevel;
  previousDecision: Decision | null;
  previousAmount: number | null;
}

export interface VerificationResult {
  id: string;
  provider: Provider;
  verificationStatus: string;
  transactionStatus: string | null;
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
  transactionDate: string | null;
  isDuplicate: boolean;
  duplicateInfo: DuplicateInfo | null;
}

export interface HistoryItem {
  id: string;
  referenceMasked: string;
  provider: Provider;
  resultLevel: ResultLevel;
  verifiedAmount: number | null;
  expectedAmount: number | null;
  payerName: string | null;
  recipientMatches: boolean | null;
  amountMatches: boolean | null;
  isDuplicate: boolean;
  employeeName: string;
  decision: Decision | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const getMe = () => apiFetch<Me>('/api/me');

export const getMeStats = () => apiFetch<MeStats>('/api/me/stats');

export const changePassword = (currentPassword: string, newPassword: string) =>
  apiFetch<{ changed: boolean }>('/api/me/password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });

/** Telebirr lookups can take ~45s server-side — allow for it. */
export const verifyReceipt = (input: string, provider?: Provider, expectedAmount?: number) =>
  apiFetch<VerificationResult>('/api/verify/manual', {
    method: 'POST',
    body: { input, provider, expectedAmount },
    timeoutMs: 60_000,
  });

export const recordDecision = (verificationId: string, decision: Decision, reason?: string) =>
  apiFetch<unknown>(`/api/verify/${verificationId}/decision`, {
    method: 'POST',
    body: { decision, reason },
  });

export const getHistory = (page = 1, pageSize = 20) =>
  apiFetch<Paginated<HistoryItem>>(`/api/history?page=${page}&pageSize=${pageSize}`);

export const getHealth = () =>
  apiFetch<{ healthy: boolean; responseTime: number }>('/api/verify/health');
