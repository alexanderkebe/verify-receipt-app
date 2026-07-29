// ============================================
// Typed wrappers around the backend routes the app uses.
// Shapes mirror the web app's API responses.
// ============================================

import { apiFetch } from './client';
import { createDebug } from '@/lib/debug';

const debug = createDebug('[ENDPOINTS]');

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

export const getMe = () => {
  debug('getMe called');
  return apiFetch<Me>('/api/me');
};

export const getMeStats = () => {
  debug('getMeStats called');
  return apiFetch<MeStats>('/api/me/stats');
};

export const changePassword = (currentPassword: string, newPassword: string) => {
  debug('changePassword called');
  return apiFetch<{ changed: boolean }>('/api/me/password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
};

/** Telebirr lookups can take ~45s server-side — allow for it. */
export const verifyReceipt = (input: string, provider?: Provider, expectedAmount?: number) => {
  debug('verifyReceipt called:', { inputLength: input.length, provider, expectedAmount });
  return apiFetch<VerificationResult>('/api/verify/manual', {
    method: 'POST',
    body: { input, provider, expectedAmount },
    timeoutMs: 60_000,
  });
};

export const recordDecision = (verificationId: string, decision: Decision, reason?: string) => {
  debug('recordDecision called:', { verificationId, decision, reason });
  return apiFetch<unknown>(`/api/verify/${verificationId}/decision`, {
    method: 'POST',
    body: { decision, reason },
  });
};

export const getHistory = (page = 1, pageSize = 20) => {
  debug('getHistory called:', { page, pageSize });
  return apiFetch<Paginated<HistoryItem>>(`/api/history?page=${page}&pageSize=${pageSize}`);
};

export const getHealth = () => {
  debug('getHealth called');
  return apiFetch<{ healthy: boolean; responseTime: number }>('/api/verify/health');
};
