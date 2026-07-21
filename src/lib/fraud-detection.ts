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
  employeeId: string,
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
  await checkRepeatedFailures(employeeId, businessId, alerts);

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
  employeeId: string,
  businessId: string,
  alerts: AlertToCreate[],
): Promise<void> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Recent RED results by this employee (last hour) and supervisor
    // overrides by anyone (last 24h) — independent counts, run together.
    const [recentFailures, recentOverrides] = await Promise.all([
      prisma.receiptVerification.count({
        where: {
          businessId,
          employeeId,
          resultLevel: 'RED',
          createdAt: { gte: oneHourAgo },
        },
      }),
      prisma.receiptVerification.count({
        where: {
          businessId,
          overrideByUserId: { not: null },
          overrideAt: { gte: oneDayAgo },
        },
      }),
    ]);

    if (recentFailures >= 5) {
      alerts.push({
        severity: 'WARNING',
        alertType: 'UNUSUAL_ACTIVITY',
        description: `Employee has ${recentFailures} failed verifications in the last hour. This may indicate suspicious activity or process issues.`,
      });
    }

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
