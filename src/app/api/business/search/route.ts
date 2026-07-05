// ============================================
// GET /api/business/search?q=<text>
// Public autocomplete for the employee join flow —
// returns matching active businesses by name.
// ============================================

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { ok } from '@/lib/api-helpers';
import { isDemoMode } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (isDemoMode()) {
    return ok(
      q
        ? [{ id: 'demo-business-1', name: 'Addis Coffee House PLC' }].filter((b) =>
            b.name.toLowerCase().startsWith(q.toLowerCase()),
          )
        : [],
    );
  }
  if (!q) return ok([]);

  const businesses = await prisma.business.findMany({
    where: {
      status: 'ACTIVE',
      joinPasswordHash: { not: null }, // only businesses that accept employees
      OR: [
        { legalName: { startsWith: q, mode: 'insensitive' } },
        { tradingName: { startsWith: q, mode: 'insensitive' } },
        { legalName: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, legalName: true, tradingName: true, city: true },
    take: 8,
    orderBy: { legalName: 'asc' },
  });

  return ok(
    businesses.map((b) => ({
      id: b.id,
      name: b.tradingName ?? b.legalName,
      city: b.city,
    })),
  );
}
