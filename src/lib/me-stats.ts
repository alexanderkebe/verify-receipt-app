// ============================================
// Per-employee "my progress" aggregation
// Powers the mobile app's Home tiles and Progress screen.
// ============================================

import { unstable_cache } from 'next/cache';
import prisma from '@/lib/prisma';

export interface MeStats {
  today: {
    total: number;
    verified: number;
    issues: number;
    rejected: number;
    valueVerified: number;
  };
  yesterday: {
    total: number;
    verified: number;
  };
  /** Last 7 days, oldest first, zero-filled */
  trend: Array<{ date: string; total: number; verified: number; failed: number }>;
  /** Decision counts over the last 7 days */
  decisions: { accepted: number; rejected: number; escalated: number };
}

interface WindowAgg {
  todayTotal: number;
  todayVerified: number;
  todayIssues: number;
  todayRejected: number;
  todayValueVerified: number;
  yesterdayTotal: number;
  yesterdayVerified: number;
}

interface TrendRow {
  date: string;
  total: number;
  verified: number;
  failed: number;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getMeStats(businessId: string, userId: string): Promise<MeStats> {
  const todayStart = startOfToday();
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  weekAgo.setHours(0, 0, 0, 0);

  const [windowRows, trendRows, decisionGroups] = await Promise.all([
    // Today + yesterday counters in one scan of the employee's recent rows
    prisma.$queryRaw<WindowAgg[]>`
      SELECT
        COUNT(*) FILTER (WHERE "createdAt" >= ${todayStart})::int                                    AS "todayTotal",
        COUNT(*) FILTER (WHERE "createdAt" >= ${todayStart} AND "resultLevel" = 'GREEN')::int        AS "todayVerified",
        COUNT(*) FILTER (WHERE "createdAt" >= ${todayStart} AND "resultLevel" = 'RED')::int          AS "todayIssues",
        COUNT(*) FILTER (WHERE "createdAt" >= ${todayStart} AND "employeeDecision" = 'REJECTED')::int AS "todayRejected",
        COALESCE(SUM("verifiedAmount") FILTER (WHERE "createdAt" >= ${todayStart} AND "resultLevel" = 'GREEN'), 0)::float8
                                                                                                      AS "todayValueVerified",
        COUNT(*) FILTER (WHERE "createdAt" < ${todayStart})::int                                     AS "yesterdayTotal",
        COUNT(*) FILTER (WHERE "createdAt" < ${todayStart} AND "resultLevel" = 'GREEN')::int         AS "yesterdayVerified"
      FROM "ReceiptVerification"
      WHERE "businessId" = ${businessId}::uuid
        AND "employeeId" = ${userId}::uuid
        AND "createdAt" >= ${yesterdayStart}`,
    // Daily trend — UTC day buckets, matching the dashboard's convention
    prisma.$queryRaw<TrendRow[]>`
      SELECT
        to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD')  AS "date",
        COUNT(*)::int                                           AS "total",
        COUNT(*) FILTER (WHERE "resultLevel" = 'GREEN')::int    AS "verified",
        COUNT(*) FILTER (WHERE "resultLevel" = 'RED')::int      AS "failed"
      FROM "ReceiptVerification"
      WHERE "businessId" = ${businessId}::uuid
        AND "employeeId" = ${userId}::uuid
        AND "createdAt" >= ${weekAgo}
      GROUP BY 1`,
    prisma.receiptVerification.groupBy({
      by: ['employeeDecision'],
      where: {
        businessId,
        employeeId: userId,
        createdAt: { gte: weekAgo },
        employeeDecision: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const w = windowRows[0] ?? {
    todayTotal: 0,
    todayVerified: 0,
    todayIssues: 0,
    todayRejected: 0,
    todayValueVerified: 0,
    yesterdayTotal: 0,
    yesterdayVerified: 0,
  };

  const trendMap = new Map<string, { total: number; verified: number; failed: number }>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekAgo.getTime() + i * 24 * 60 * 60 * 1000);
    trendMap.set(d.toISOString().slice(0, 10), { total: 0, verified: 0, failed: 0 });
  }
  for (const row of trendRows) {
    const tv = trendMap.get(row.date);
    if (tv) {
      tv.total = row.total;
      tv.verified = row.verified;
      tv.failed = row.failed;
    }
  }

  const decisions = { accepted: 0, rejected: 0, escalated: 0 };
  for (const g of decisionGroups) {
    if (g.employeeDecision === 'ACCEPTED') decisions.accepted = g._count._all;
    if (g.employeeDecision === 'REJECTED') decisions.rejected = g._count._all;
    if (g.employeeDecision === 'ESCALATED') decisions.escalated = g._count._all;
  }

  return {
    today: {
      total: w.todayTotal,
      verified: w.todayVerified,
      issues: w.todayIssues,
      rejected: w.todayRejected,
      valueVerified: w.todayValueVerified,
    },
    yesterday: {
      total: w.yesterdayTotal,
      verified: w.yesterdayVerified,
    },
    trend: [...trendMap.entries()].map(([date, v]) => ({ date, ...v })),
    decisions,
  };
}

/**
 * Cached per-user stats. The userId in the key is the isolation boundary;
 * the tag is revalidated when the employee stores a new verification
 * (see performVerification), so the 60s TTL only covers quiet periods.
 */
export function getCachedMeStats(businessId: string, userId: string): Promise<MeStats> {
  return unstable_cache(
    () => getMeStats(businessId, userId),
    ['me-stats', userId],
    { revalidate: 60, tags: [`me-stats:${userId}`] },
  )();
}
