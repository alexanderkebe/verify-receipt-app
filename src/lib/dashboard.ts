// ============================================
// Dashboard aggregation queries
// ============================================

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type {
  DashboardStats,
  ProviderStat,
  EmployeeStat,
  VerificationSummary,
  TrendPoint,
  Provider,
  ResultLevel,
} from '@/types';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getDashboardStats(businessId: string): Promise<DashboardStats> {
  const todayStart = startOfToday();
  const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  weekAgo.setHours(0, 0, 0, 0);

  const todayWhere: Prisma.ReceiptVerificationWhereInput = {
    businessId,
    createdAt: { gte: todayStart },
  };

  const [
    totalToday,
    successfulToday,
    rejectedToday,
    duplicatesDetected,
    recipientMismatches,
    amountMismatches,
    verificationFailures,
    verifiedAgg,
    unresolvedAlerts,
    recent,
    weekRecords,
  ] = await Promise.all([
    prisma.receiptVerification.count({ where: todayWhere }),
    prisma.receiptVerification.count({ where: { ...todayWhere, resultLevel: 'GREEN' } }),
    prisma.receiptVerification.count({ where: { ...todayWhere, employeeDecision: 'REJECTED' } }),
    prisma.receiptVerification.count({ where: { businessId, isDuplicate: true, createdAt: { gte: todayStart } } }),
    prisma.receiptVerification.count({ where: { businessId, recipientMatches: false, createdAt: { gte: todayStart } } }),
    prisma.receiptVerification.count({ where: { businessId, amountMatches: false, createdAt: { gte: todayStart } } }),
    prisma.receiptVerification.count({ where: { ...todayWhere, resultLevel: 'YELLOW' } }),
    prisma.receiptVerification.aggregate({
      where: { ...todayWhere, resultLevel: 'GREEN' },
      _sum: { verifiedAmount: true },
    }),
    prisma.fraudAlert.count({ where: { businessId, status: { in: ['OPEN', 'ASSIGNED'] } } }),
    prisma.receiptVerification.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { employee: { select: { fullName: true } } },
    }),
    prisma.receiptVerification.findMany({
      where: { businessId, createdAt: { gte: weekAgo } },
      select: { createdAt: true, resultLevel: true, provider: true, employeeId: true },
    }),
  ]);

  // Provider + employee breakdowns (over the last week window)
  const providerMap = new Map<Provider, { count: number; success: number }>();
  const employeeMap = new Map<string, { count: number; success: number }>();
  const trendMap = new Map<string, { total: number; successful: number; failed: number }>();

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekAgo.getTime() + i * 24 * 60 * 60 * 1000);
    trendMap.set(d.toISOString().slice(0, 10), { total: 0, successful: 0, failed: 0 });
  }

  for (const r of weekRecords) {
    const p = r.provider as Provider;
    const pv = providerMap.get(p) ?? { count: 0, success: 0 };
    pv.count++;
    if (r.resultLevel === 'GREEN') pv.success++;
    providerMap.set(p, pv);

    const ev = employeeMap.get(r.employeeId) ?? { count: 0, success: 0 };
    ev.count++;
    if (r.resultLevel === 'GREEN') ev.success++;
    employeeMap.set(r.employeeId, ev);

    const key = r.createdAt.toISOString().slice(0, 10);
    const tv = trendMap.get(key);
    if (tv) {
      tv.total++;
      if (r.resultLevel === 'GREEN') tv.successful++;
      if (r.resultLevel === 'RED') tv.failed++;
    }
  }

  const employeeIds = [...employeeMap.keys()];
  const employees = employeeIds.length
    ? await prisma.user.findMany({ where: { id: { in: employeeIds } }, select: { id: true, fullName: true } })
    : [];
  const nameById = new Map(employees.map((e) => [e.id, e.fullName]));

  const providerBreakdown: ProviderStat[] = [...providerMap.entries()].map(([provider, v]) => ({
    provider,
    count: v.count,
    successRate: v.count ? Math.round((v.success / v.count) * 100) : 0,
  }));

  const employeeBreakdown: EmployeeStat[] = [...employeeMap.entries()]
    .map(([employeeId, v]) => ({
      employeeId,
      employeeName: nameById.get(employeeId) ?? 'Unknown',
      count: v.count,
      successRate: v.count ? Math.round((v.success / v.count) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const recentVerifications: VerificationSummary[] = recent.map((r) => ({
    id: r.id,
    provider: r.provider as Provider,
    resultLevel: r.resultLevel as ResultLevel,
    referenceMasked: r.referenceMasked,
    amount: r.verifiedAmount ? Number(r.verifiedAmount) : null,
    employeeName: r.employee.fullName,
    createdAt: r.createdAt.toISOString(),
  }));

  const trend: TrendPoint[] = [...trendMap.entries()].map(([date, v]) => ({ date, ...v }));

  return {
    totalToday,
    successfulToday,
    rejectedToday,
    duplicatesDetected,
    recipientMismatches,
    amountMismatches,
    verificationFailures,
    totalValueVerified: Number(verifiedAgg._sum.verifiedAmount ?? 0),
    providerBreakdown,
    employeeBreakdown,
    recentVerifications,
    unresolvedAlerts,
    trend,
  };
}
