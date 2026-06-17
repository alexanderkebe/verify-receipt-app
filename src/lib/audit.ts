// ============================================
// Audit Logging Service
// Append-only audit trail for all business events
// ============================================

import prisma from '@/lib/prisma';

export interface AuditEntry {
  businessId?: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an audit event (append-only)
 */
export async function logAuditEvent(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        businessId: entry.businessId,
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValues: entry.oldValues ? JSON.parse(JSON.stringify(entry.oldValues)) : undefined,
        newValues: entry.newValues ? JSON.parse(JSON.stringify(entry.newValues)) : undefined,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  } catch (error) {
    // Never let audit logging failure break the application
    console.error('Audit log failed:', error);
  }
}

/**
 * Extract IP and user agent from request headers
 */
export function extractRequestMeta(headers: Headers): { ipAddress: string; userAgent: string } {
  return {
    ipAddress: headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               headers.get('x-real-ip') ||
               'unknown',
    userAgent: headers.get('user-agent') || 'unknown',
  };
}

// Common audit action constants
export const AuditActions = {
  // Auth
  LOGIN_SUCCESS: 'auth.login_success',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT: 'auth.logout',
  PASSWORD_RESET_REQUEST: 'auth.password_reset_request',
  PASSWORD_RESET_COMPLETE: 'auth.password_reset_complete',
  PASSWORD_CHANGED: 'auth.password_changed',
  ACCOUNT_LOCKED: 'auth.account_locked',

  // Business
  BUSINESS_REGISTERED: 'business.registered',
  BUSINESS_UPDATED: 'business.updated',
  BUSINESS_SUSPENDED: 'business.suspended',
  BUSINESS_ACTIVATED: 'business.activated',

  // Employees
  EMPLOYEE_CREATED: 'employee.created',
  EMPLOYEE_UPDATED: 'employee.updated',
  EMPLOYEE_SUSPENDED: 'employee.suspended',
  EMPLOYEE_ACTIVATED: 'employee.activated',
  EMPLOYEE_ROLE_CHANGED: 'employee.role_changed',
  EMPLOYEE_BRANCH_CHANGED: 'employee.branch_changed',

  // Payment Accounts
  PAYMENT_ACCOUNT_ADDED: 'payment_account.added',
  PAYMENT_ACCOUNT_UPDATED: 'payment_account.updated',
  PAYMENT_ACCOUNT_DEACTIVATED: 'payment_account.deactivated',

  // Verification
  VERIFICATION_STARTED: 'verification.started',
  VERIFICATION_COMPLETED: 'verification.completed',
  VERIFICATION_DECISION: 'verification.decision',
  VERIFICATION_OVERRIDE: 'verification.override',

  // Alerts
  ALERT_CREATED: 'alert.created',
  ALERT_ASSIGNED: 'alert.assigned',
  ALERT_RESOLVED: 'alert.resolved',

  // Admin
  ADMIN_BUSINESS_SUSPENDED: 'admin.business_suspended',
  ADMIN_PLAN_CHANGED: 'admin.plan_changed',
} as const;
