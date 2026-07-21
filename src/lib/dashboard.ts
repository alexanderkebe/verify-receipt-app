// ============================================
// Dashboard aggregation queries
// ============================================

import { unstable_cache } from 'next/cache';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
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

/**
 * Cached per-tenant stats — shared by the dashboard page, reports page, and
 * stats API. businessId inside the cache key is the tenant-isolation
 * boundary; the tag is revalidated the moment a new verification is stored
 * (see performVerification), so the 60s TTL only covers quiet periods.
 */
export function getCachedDashboardStats(businessId: string): Promise<DashboardStats> {
  return unstable_cache(
    () => getDashboardStats(businessId),
    ['dashboard-stats', businessId],
    { revalidate: 60, tags: [`dashboard:${businessId}`] },
  )();
}

interface TodayAgg {
  totalToday: number;
  successfulToday: number;
  rejectedToday: number;
  duplicatesDetected: number;
  recipientMismatches: number;
  amountMismatches: number;
  verificationFailures: number;
  totalValueVerified: number;
}

interface TrendRow {
  date: string;
  total: number;
  successful: number;
  failed: number;
}

export async function getDashboardStats(businessId: string): Promise<DashboardStats> {
  const todayStart = startOfToday();
  const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  weekAgo.setHours(0, 0, 0, 0);

  const weekWhere: Prisma.ReceiptVerificationWhereInput = {
    businessId,
    createdAt: { gte: weekAgo },
  };

  const [todayAggRows, unresolvedAlerts, recent, providerGroups, employeeGroups, trendRows] =
    await Promise.all([
      // All of today's counters in a single index scan instead of 7 COUNTs
      prisma.$queryRaw<TodayAgg[]>`
        SELECT
          COUNT(*)::int                                                            AS "totalToday",
          COUNT(*) FILTER (WHERE "resultLevel" = 'GREEN')::int                     AS "successfulToday",
          COUNT(*) FILTER (WHERE "employeeDecision" = 'REJECTED')::int             AS "rejectedToday",
          COUNT(*) FILTER (WHERE "isDuplicate")::int                               AS "duplicatesDetected",
          COUNT(*) FILTER (WHERE "recipientMatches" = false)::int                  AS "recipientMismatches",
          COUNT(*) FILTER (WHERE "amountMatches" = false)::int                     AS "amountMismatches",
          COUNT(*) FILTER (WHERE "resultLevel" = 'YELLOW')::int                    AS "verificationFailures",
          COALESCE(SUM("verifiedAmount") FILTER (WHERE "resultLevel" = 'GREEN'), 0)::float8
                                                                                   AS "totalValueVerified"
        FROM "ReceiptVerification"
        WHERE "businessId" = ${businessId}::uuid AND "createdAt" >= ${todayStart}`,
      prisma.fraudAlert.count({ where: { businessId, status: { in: ['OPEN', 'ASSIGNED'] } } }),
      prisma.receiptVerification.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          provider: true,
          resultLevel: true,
          referenceMasked: true,
          verifiedAmount: true,
          createdAt: true,
          employee: { select: { fullName: true } },
        },
      }),
      // Week-window breakdowns aggregated in the database, not in JS
      prisma.receiptVerification.groupBy({
        by: ['provider', 'resultLevel'],
        where: weekWhere,
        _count: { _all: true },
      }),
      prisma.receiptVerification.groupBy({
        by: ['employeeId', 'resultLevel'],
        where: weekWhere,
        _count: { _all: true },
      }),
      // Daily trend — createdAt is stored as UTC timestamp, so date_trunc
      // buckets match the previous toISOString() UTC day keys.
      prisma.$queryRaw<TrendRow[]>`
        SELECT
          to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD')     AS "date",
          COUNT(*)::int                                              AS "total",
          COUNT(*) FILTER (WHERE "resultLevel" = 'GREEN')::int       AS "successful",
          COUNT(*) FILTER (WHERE "resultLevel" = 'RED')::int         AS "failed"
        FROM "ReceiptVerification"
        WHERE "businessId" = ${businessId}::uuid AND "createdAt" >= ${weekAgo}
        GROUP BY 1`,
    ]);

  const today: TodayAgg = todayAggRows[0] ?? {
    totalToday: 0,
    successfulToday: 0,
    rejectedToday: 0,
    duplicatesDetected: 0,
    recipientMismatches: 0,
    amountMismatches: 0,
    verificationFailures: 0,
    totalValueVerified: 0,
  };

  // Provider + employee breakdowns (over the last week window)
  const providerMap = new Map<Provider, { count: number; success: number }>();
  for (const g of providerGroups) {
    const p = g.provider as Provider;
    const pv = providerMap.get(p) ?? { count: 0, success: 0 };
    pv.count += g._count._all;
    if (g.resultLevel === 'GREEN') pv.success += g._count._all;
    providerMap.set(p, pv);
  }

  const employeeMap = new Map<string, { count: number; success: number }>();
  for (const g of employeeGroups) {
    const ev = employeeMap.get(g.employeeId) ?? { count: 0, success: 0 };
    ev.count += g._count._all;
    if (g.resultLevel === 'GREEN') ev.success += g._count._all;
    employeeMap.set(g.employeeId, ev);
  }

  const trendMap = new Map<string, { total: number; successful: number; failed: number }>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekAgo.getTime() + i * 24 * 60 * 60 * 1000);
    trendMap.set(d.toISOString().slice(0, 10), { total: 0, successful: 0, failed: 0 });
  }
  for (const row of trendRows) {
    const tv = trendMap.get(row.date);
    if (tv) {
      tv.total = row.total;
      tv.successful = row.successful;
      tv.failed = row.failed;
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
    totalToday: today.totalToday,
    successfulToday: today.successfulToday,
    rejectedToday: today.rejectedToday,
    duplicatesDetected: today.duplicatesDetected,
    recipientMismatches: today.recipientMismatches,
    amountMismatches: today.amountMismatches,
    verificationFailures: today.verificationFailures,
    totalValueVerified: today.totalValueVerified,
    providerBreakdown,
    employeeBreakdown,
    recentVerifications,
    unresolvedAlerts,
    trend,
  };
}
