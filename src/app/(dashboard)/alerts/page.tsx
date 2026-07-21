import type { Metadata } from 'next';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { isDemoMode, demoAlerts } from '@/lib/demo-data';
import AlertsList, { type Alert } from './AlertsList';
import type { AlertSeverity, AlertStatus, AlertType, Provider } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Fraud Alerts' };

export default async function AlertsPage() {
  let alerts: Alert[];
  if (isDemoMode()) {
    alerts = demoAlerts as Alert[];
  } else {
    const session = await auth();
    const rows = await prisma.fraudAlert.findMany({
      where: { businessId: session!.user.businessId! },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        verification: {
          select: { referenceMasked: true, provider: true, payerName: true, verifiedAmount: true },
        },
      },
    });
    alerts = rows.map((a) => ({
      id: a.id,
      severity: a.severity as AlertSeverity,
      alertType: a.alertType as AlertType,
      status: a.status as AlertStatus,
      description: a.description,
      resolution: a.resolution,
      createdAt: a.createdAt.toISOString(),
      reference: a.verification.referenceMasked,
      provider: a.verification.provider as Provider,
      payerName: a.verification.payerName,
      amount: a.verification.verifiedAmount ? Number(a.verification.verifiedAmount) : null,
    }));
  }

  return <AlertsList alerts={alerts} />;
}
