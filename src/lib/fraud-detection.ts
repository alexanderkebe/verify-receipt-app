// ============================================
// Fraud Detection Rules Engine
// Generates alerts based on verification results
// ============================================

import prisma from '@/lib/prisma';
import type { VerificationStatus, TransactionStatus, ResultLevel, AlertSeverity, AlertType } from '@/types';

interface FraudCheckInput {
  resultLevel: ResultLevel;
  recipientMatches: boolean | null;
  amountMatches: boolean | null;
  isDuplicate: boolean;
  verificationStatus: VerificationStatus;
  transactionStatus: TransactionStatus | null;
}

interface AlertToCreate {
  severity: AlertSeverity;
  alertType: AlertType;
  description: string;
}

/**
 * Evaluate fraud rules and create alerts as needed
 */
export async function generateFraudAlerts(
  verificationId: string,
  businessId: string,
  input: FraudCheckInput,
): Promise<void> {
  const alerts: AlertToCreate[] = [];

  // Rule 1: Recipient mismatch → HIGH_RISK
  if (input.recipientMatches === false) {
    alerts.push({
      severity: 'HIGH_RISK',
      alertType: 'RECIPIENT_MISMATCH',
      description: 'Payment recipient does not match any registered business account. This payment was directed to a different account.',
    });
  }

  // Rule 2: Duplicate receipt → CRITICAL
  if (input.isDuplicate) {
    alerts.push({
      severity: 'CRITICAL',
      alertType: 'DUPLICATE_RECEIPT',
      description: 'This receipt reference was previously accepted. A customer may be attempting to reuse a receipt.',
    });
  }

  // Rule 3: Amount mismatch → WARNING
  if (input.amountMatches === false) {
    alerts.push({
      severity: 'WARNING',
      alertType: 'AMOUNT_MISMATCH',
      description: 'The verified transaction amount does not match the expected amount.',
    });
  }

  // Rule 4: Unsuccessful transaction → HIGH_RISK
  if (input.transactionStatus && ['FAILED', 'CANCELLED'].includes(input.transactionStatus)) {
    alerts.push({
      severity: 'HIGH_RISK',
      alertType: 'UNSUCCESSFUL_TRANSACTION',
      description: `Transaction status is ${input.transactionStatus.toLowerCase()}. This payment did not complete successfully.`,
    });
  }

  // Rule 5: Check for repeated failures by the same employee (async, non-blocking)
  await checkRepeatedFailures(verificationId, businessId, alerts);

  // Create all alerts
  if (alerts.length > 0) {
    await prisma.fraudAlert.createMany({
      data: alerts.map(alert => ({
        verificationId,
        businessId,
        severity: alert.severity,
        alertType: alert.alertType,
        description: alert.description,
        status: 'OPEN',
      })),
    });
  }
}

/**
 * Check if an employee has had repeated verification failures recently
 */
async function checkRepeatedFailures(
  verificationId: string,
  businessId: string,
  alerts: AlertToCreate[],
): Promise<void> {
  try {
    // Get the employee from this verification
    const verification = await prisma.receiptVerification.findUnique({
      where: { id: verificationId },
      select: { employeeId: true },
    });

    if (!verification) return;

    // Count recent RED results by this employee in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentFailures = await prisma.receiptVerification.count({
      where: {
        businessId,
        employeeId: verification.employeeId,
        resultLevel: 'RED',
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentFailures >= 5) {
      alerts.push({
        severity: 'WARNING',
        alertType: 'UNUSUAL_ACTIVITY',
        description: `Employee has ${recentFailures} failed verifications in the last hour. This may indicate suspicious activity or process issues.`,
      });
    }

    // Check for repeated supervisor overrides by any supervisor in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentOverrides = await prisma.receiptVerification.count({
      where: {
        businessId,
        overrideByUserId: { not: null },
        overrideAt: { gte: oneDayAgo },
      },
    });

    if (recentOverrides >= 10) {
      alerts.push({
        severity: 'WARNING',
        alertType: 'REPEATED_OVERRIDES',
        description: `${recentOverrides} supervisor overrides recorded in the last 24 hours. Review override patterns.`,
      });
    }
  } catch (error) {
    // Don't let analytics failures break the verification
    console.error('Fraud analytics check failed:', error);
  }
}
