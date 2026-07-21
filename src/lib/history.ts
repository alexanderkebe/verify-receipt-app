// ============================================
// Verification history queries (filtered, paginated)
// ============================================

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/constants';
import type { HistoryFilters, PaginatedResponse, Provider, ResultLevel, EmployeeDecision } from '@/types';

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
  decision: EmployeeDecision | null;
  createdAt: string;
}

interface Scope {
  businessId: string;
  role: 'OWNER' | 'MANAGER' | 'EMPLOYEE' | 'PLATFORM_ADMIN';
  userId: string;
}

export async function getHistory(
  scope: Scope,
  filters: HistoryFilters,
  maxPageSize: number = MAX_PAGE_SIZE,
): Promise<PaginatedResponse<HistoryItem>> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  const where: Prisma.ReceiptVerificationWhereInput = { businessId: scope.businessId };

  // Employees only see their own verifications
  if (scope.role === 'EMPLOYEE') {
    where.employeeId = scope.userId;
  } else if (filters.employeeId) {
    where.employeeId = filters.employeeId;
  }

  if (filters.provider) where.provider = filters.provider;
  if (filters.resultLevel) where.resultLevel = filters.resultLevel;
  if (filters.decision) where.employeeDecision = filters.decision;
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.reference) where.referenceMasked = { contains: filters.reference, mode: 'insensitive' };

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      where.createdAt.lte = to;
    }
  }

  if (filters.minAmount != null || filters.maxAmount != null) {
    where.verifiedAmount = {};
    if (filters.minAmount != null) where.verifiedAmount.gte = filters.minAmount;
    if (filters.maxAmount != null) where.verifiedAmount.lte = filters.maxAmount;
  }

  const [total, records] = await Promise.all([
    prisma.receiptVerification.count({ where }),
    prisma.receiptVerification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        referenceMasked: true,
        provider: true,
        resultLevel: true,
        verifiedAmount: true,
        expectedAmount: true,
        payerName: true,
        recipientMatches: true,
        amountMatches: true,
        isDuplicate: true,
        employeeDecision: true,
        createdAt: true,
        employee: { select: { fullName: true } },
      },
    }),
  ]);

  const items: HistoryItem[] = records.map((r) => ({
    id: r.id,
    referenceMasked: r.referenceMasked,
    provider: r.provider as Provider,
    resultLevel: r.resultLevel as ResultLevel,
    verifiedAmount: r.verifiedAmount ? Number(r.verifiedAmount) : null,
    expectedAmount: r.expectedAmount ? Number(r.expectedAmount) : null,
    payerName: r.payerName,
    recipientMatches: r.recipientMatches,
    amountMatches: r.amountMatches,
    isDuplicate: r.isDuplicate,
    employeeName: r.employee.fullName,
    decision: r.employeeDecision as EmployeeDecision | null,
    createdAt: r.createdAt.toISOString(),
  }));

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
