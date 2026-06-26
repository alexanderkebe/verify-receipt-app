// Demo mode — all mock data returned when DEMO_MODE=true
// No database or backend required.

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

const now = new Date();
const d = (offsetDays: number, h = 10, m = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export const DEMO_USER = {
  id: 'demo-user-owner',
  email: 'demo@addiscoffee.et',
  name: 'Abebe Girma',
  fullName: 'Abebe Girma',
  role: 'OWNER' as const,
  businessId: 'demo-business-1',
  branchId: null,
  businessName: 'Addis Coffee House PLC',
};

export const DEMO_MANAGER_USER = {
  id: 'demo-emp-1',
  email: 'manager@addiscoffee.et',
  name: 'Sara Tadesse',
  fullName: 'Sara Tadesse',
  role: 'MANAGER' as const,
  businessId: 'demo-business-1',
  branchId: null,
  businessName: 'Addis Coffee House PLC',
};

export const DEMO_EMPLOYEE_USER = {
  id: 'demo-emp-2',
  email: 'cashier@addiscoffee.et',
  name: 'Yonas Bekele',
  fullName: 'Yonas Bekele',
  role: 'EMPLOYEE' as const,
  businessId: 'demo-business-1',
  branchId: null,
  businessName: 'Addis Coffee House PLC',
};

export const DEMO_ADMIN_USER = {
  id: 'demo-admin-1',
  email: 'admin@receiptguard.et',
  name: 'Platform Admin',
  fullName: 'Platform Admin',
  role: 'PLATFORM_ADMIN' as const,
  businessId: null,
  branchId: null,
  businessName: null,
};

// ── Dashboard Stats ──────────────────────────────────────────────────────────

export const demoDashboardStats = {
  totalToday: 24,
  successfulToday: 19,
  rejectedToday: 3,
  duplicatesDetected: 2,
  recipientMismatches: 1,
  amountMismatches: 2,
  verificationFailures: 0,
  totalValueVerified: 143750,
  unresolvedAlerts: 3,
  providerBreakdown: [
    { provider: 'CBE', count: 12, successRate: 91.7 },
    { provider: 'TELEBIRR', count: 7, successRate: 85.7 },
    { provider: 'DASHEN', count: 3, successRate: 100 },
    { provider: 'CBE_BIRR', count: 2, successRate: 100 },
  ],
  employeeBreakdown: [
    { employeeId: 'demo-emp-1', employeeName: 'Sara Tadesse', count: 10, successRate: 90 },
    { employeeId: 'demo-emp-2', employeeName: 'Yonas Bekele', count: 8, successRate: 87.5 },
    { employeeId: 'demo-emp-3', employeeName: 'Tigist Haile', count: 6, successRate: 100 },
  ],
  recentVerifications: [
    { id: 'v1', provider: 'CBE', resultLevel: 'GREEN', referenceMasked: 'FT24***1234', amount: 5500, employeeName: 'Sara Tadesse', createdAt: d(0, 9, 45) },
    { id: 'v2', provider: 'TELEBIRR', resultLevel: 'GREEN', referenceMasked: 'TB***8821', amount: 2200, employeeName: 'Yonas Bekele', createdAt: d(0, 9, 30) },
    { id: 'v3', provider: 'CBE', resultLevel: 'RED', referenceMasked: 'FT24***5678', amount: 8000, employeeName: 'Sara Tadesse', createdAt: d(0, 8, 55) },
    { id: 'v4', provider: 'DASHEN', resultLevel: 'GREEN', referenceMasked: 'DSH***4421', amount: 3300, employeeName: 'Tigist Haile', createdAt: d(0, 8, 30) },
    { id: 'v5', provider: 'CBE', resultLevel: 'YELLOW', referenceMasked: 'FT24***9900', amount: 1500, employeeName: 'Yonas Bekele', createdAt: d(0, 8, 15) },
  ],
  trend: [
    { date: d(-6).slice(0, 10), total: 18, successful: 15, failed: 3 },
    { date: d(-5).slice(0, 10), total: 22, successful: 19, failed: 3 },
    { date: d(-4).slice(0, 10), total: 15, successful: 13, failed: 2 },
    { date: d(-3).slice(0, 10), total: 27, successful: 23, failed: 4 },
    { date: d(-2).slice(0, 10), total: 20, successful: 17, failed: 3 },
    { date: d(-1).slice(0, 10), total: 31, successful: 28, failed: 3 },
    { date: d(0).slice(0, 10), total: 24, successful: 19, failed: 5 },
  ],
};

// ── Employees ────────────────────────────────────────────────────────────────

export const demoEmployees = [
  { id: 'demo-user-owner', fullName: 'Abebe Girma', email: 'demo@addiscoffee.et', phone: '+251911234567', jobTitle: 'Owner', employeeCode: 'EMP-000', role: 'OWNER', status: 'ACTIVE', lastLogin: d(-1), createdAt: d(-180) },
  { id: 'demo-emp-1', fullName: 'Sara Tadesse', email: 'sara@addiscoffee.et', phone: '+251922345678', jobTitle: 'Head Cashier', employeeCode: 'EMP-001', role: 'MANAGER', status: 'ACTIVE', lastLogin: d(-1), createdAt: d(-120) },
  { id: 'demo-emp-2', fullName: 'Yonas Bekele', email: 'yonas@addiscoffee.et', phone: '+251933456789', jobTitle: 'Cashier', employeeCode: 'EMP-002', role: 'EMPLOYEE', status: 'ACTIVE', lastLogin: d(0), createdAt: d(-90) },
  { id: 'demo-emp-3', fullName: 'Tigist Haile', email: 'tigist@addiscoffee.et', phone: '+251944567890', jobTitle: 'Cashier', employeeCode: 'EMP-003', role: 'EMPLOYEE', status: 'ACTIVE', lastLogin: d(-2), createdAt: d(-60) },
];

// ── Payment Accounts ─────────────────────────────────────────────────────────

export const demoPaymentAccounts = [
  { id: 'demo-acct-1', provider: 'CBE', accountHolderName: 'Addis Coffee House PLC', accountNumberMasked: '****1234', suffix: '1234', phoneNumber: null, nickname: 'Main CBE Account', status: 'ACTIVE', ownershipStatus: 'VERIFIED', createdAt: d(-180) },
  { id: 'demo-acct-2', provider: 'TELEBIRR', accountHolderName: 'Addis Coffee House PLC', accountNumberMasked: '****5678', suffix: null, phoneNumber: '+251911000001', nickname: 'Telebirr Business', status: 'ACTIVE', ownershipStatus: 'VERIFIED', createdAt: d(-90) },
  { id: 'demo-acct-3', provider: 'DASHEN', accountHolderName: 'Addis Coffee House PLC', accountNumberMasked: '****9012', suffix: '9012', phoneNumber: null, nickname: 'Dashen Savings', status: 'ACTIVE', ownershipStatus: 'PENDING', createdAt: d(-30) },
];

// ── Alerts ───────────────────────────────────────────────────────────────────

export const demoAlerts = [
  { id: 'alert-1', severity: 'HIGH_RISK', alertType: 'DUPLICATE_RECEIPT', status: 'OPEN', description: 'Receipt reference FT24***5678 was submitted twice within 2 hours by different employees.', resolution: null, createdAt: d(-1, 14, 30), reference: 'FT24***5678', provider: 'CBE', payerName: 'Dawit Alemu', amount: 8000 },
  { id: 'alert-2', severity: 'WARNING', alertType: 'RECIPIENT_MISMATCH', status: 'OPEN', description: 'Recipient account on receipt does not match any registered payment account.', resolution: null, createdAt: d(-2, 11, 0), reference: 'TB***4432', provider: 'TELEBIRR', payerName: 'Hana Tesfaye', amount: 3200 },
  { id: 'alert-3', severity: 'CRITICAL', alertType: 'AMOUNT_MISMATCH', status: 'OPEN', description: 'Customer presented receipt showing 5,000 ETB but verified amount is 500 ETB — possible alteration.', resolution: null, createdAt: d(-3, 9, 15), reference: 'FT24***1199', provider: 'CBE', payerName: 'Bekele Worku', amount: 500 },
  { id: 'alert-4', severity: 'INFORMATIONAL', alertType: 'UNUSUAL_ACTIVITY', status: 'RESOLVED', description: 'High volume of verifications from a single employee in short time window.', resolution: 'Reviewed and confirmed legitimate — promotional event.', createdAt: d(-5, 16, 0), reference: 'FT24***7788', provider: 'CBE', payerName: 'Various', amount: null },
];

// ── Verification History ─────────────────────────────────────────────────────

const makeVerification = (
  id: string, provider: string, resultLevel: string, resultReason: string,
  ref: string, payer: string, amount: number, empName: string, offsetDays: number, h: number, decision = 'ACCEPTED'
) => ({
  id,
  provider,
  verificationStatus: resultLevel === 'YELLOW' ? 'NOT_FOUND' : 'VERIFIED',
  transactionStatus: resultLevel === 'GREEN' ? 'SUCCESS' : resultLevel === 'RED' ? 'FAILED' : 'UNKNOWN',
  resultLevel,
  resultReason,
  referenceMasked: ref,
  payerName: payer,
  recipientName: 'Addis Coffee House PLC',
  recipientAccountMasked: '****1234',
  recipientMatches: resultLevel !== 'RED' || resultReason !== 'RED_RECIPIENT',
  amountMatches: resultLevel !== 'RED' || resultReason !== 'RED_AMOUNT',
  expectedAmount: amount,
  verifiedAmount: resultReason === 'RED_AMOUNT' ? Math.round(amount * 0.1) : amount,
  currency: 'ETB',
  isDuplicate: resultReason === 'RED_DUPLICATE',
  duplicateInfo: null,
  transactionDate: d(offsetDays, h),
  processingTimeMs: 320 + Math.floor(Math.random() * 400),
  createdAt: d(offsetDays, h),
  employeeName: empName,
  employeeDecision: decision,
  decisionAt: d(offsetDays, h + 1),
});

export const demoHistory = {
  items: [
    makeVerification('v1', 'CBE', 'GREEN', 'GREEN', 'FT24***1234', 'Dawit Alemu', 5500, 'Sara Tadesse', 0, 9),
    makeVerification('v2', 'TELEBIRR', 'GREEN', 'GREEN', 'TB***8821', 'Hana Tesfaye', 2200, 'Yonas Bekele', 0, 9),
    makeVerification('v3', 'CBE', 'RED', 'RED_AMOUNT', 'FT24***5678', 'Bekele Worku', 8000, 'Sara Tadesse', 0, 8, 'REJECTED'),
    makeVerification('v4', 'DASHEN', 'GREEN', 'GREEN', 'DSH***4421', 'Tigist Assefa', 3300, 'Tigist Haile', 0, 8),
    makeVerification('v5', 'CBE', 'YELLOW', 'YELLOW_UNABLE', 'FT24***9900', 'Unknown', 1500, 'Yonas Bekele', 0, 8, 'ESCALATED'),
    makeVerification('v6', 'CBE', 'GREEN', 'GREEN', 'FT24***3311', 'Meron Tadesse', 6600, 'Sara Tadesse', -1, 15),
    makeVerification('v7', 'TELEBIRR', 'RED', 'RED_RECIPIENT', 'TB***4432', 'Hana Tesfaye', 3200, 'Yonas Bekele', -1, 14, 'REJECTED'),
    makeVerification('v8', 'CBE', 'GREEN', 'GREEN', 'FT24***7788', 'Abiy Kassa', 4400, 'Tigist Haile', -2, 11),
    makeVerification('v9', 'CBE_BIRR', 'GREEN', 'GREEN', 'CBB***2211', 'Selamawit Nega', 1800, 'Sara Tadesse', -2, 10),
    makeVerification('v10', 'CBE', 'RED', 'RED_DUPLICATE', 'FT24***1199', 'Bekele Worku', 7700, 'Yonas Bekele', -3, 9, 'REJECTED'),
  ],
  total: 147,
  page: 1,
  pageSize: 20,
  totalPages: 8,
};

// ── Verification result (for POST /api/verify/manual) ────────────────────────

export function makeDemoVerificationResult(reference: string, provider: string, expectedAmount?: number) {
  const amount = expectedAmount ?? 5500;
  return {
    id: `demo-v-${Date.now()}`,
    provider: provider || 'CBE',
    verificationStatus: 'VERIFIED',
    transactionStatus: 'SUCCESS',
    resultLevel: 'GREEN',
    resultReason: 'GREEN',
    referenceMasked: reference.slice(0, 4) + '***' + reference.slice(-4),
    payerName: 'Dawit Alemu',
    recipientName: 'Addis Coffee House PLC',
    recipientAccountMasked: '****1234',
    recipientMatches: true,
    amountMatches: true,
    expectedAmount: amount,
    verifiedAmount: amount,
    currency: 'ETB',
    isDuplicate: false,
    duplicateInfo: null,
    transactionDate: new Date().toISOString(),
    processingTimeMs: 412,
    createdAt: new Date().toISOString(),
  };
}

// ── Admin data ───────────────────────────────────────────────────────────────

export const demoAdminBusinesses = [
  { id: 'demo-business-1', legalName: 'Addis Coffee House PLC', tradingName: 'Addis Coffee House', status: 'ACTIVE', subscriptionTier: 'PRO', email: 'demo@addiscoffee.et', phone: '+251111234567', createdAt: d(-180), verificationCount: 1240, userCount: 4 },
  { id: 'demo-business-2', legalName: 'Shiro Meda Textiles Ltd', tradingName: 'Shiro Meda', status: 'ACTIVE', subscriptionTier: 'BASIC', email: 'info@shiromeda.et', phone: '+251112345678', createdAt: d(-90), verificationCount: 342, userCount: 6 },
  { id: 'demo-business-3', legalName: 'Merkato Electronics PLC', tradingName: 'Merkato Electronics', status: 'ACTIVE', subscriptionTier: 'FREE', email: 'sales@merkato-elec.et', phone: '+251113456789', createdAt: d(-30), verificationCount: 28, userCount: 2 },
  { id: 'demo-business-4', legalName: 'Bole Supermarket Ltd', tradingName: 'Bole Fresh', status: 'SUSPENDED', subscriptionTier: 'BASIC', email: 'admin@bolefresh.et', phone: '+251114567890', createdAt: d(-120), verificationCount: 178, userCount: 8 },
];

export const demoAdminMonitoring = {
  apiHealthy: true,
  apiResponseMs: 187,
  businesses: 4,
  activeBusinesses: 3,
  totalVerifications: 1788,
  last24h: 47,
  failures24h: 2,
  errorRate: 4,
};

export const demoAuditLogs = [
  { id: 'audit-1', action: 'LOGIN_SUCCESS', entityType: 'User', entityId: 'demo-user-owner', userId: 'demo-user-owner', businessId: 'demo-business-1', ipAddress: '192.168.1.1', createdAt: d(0, 8, 0), user: { fullName: 'Abebe Girma', email: 'demo@addiscoffee.et' } },
  { id: 'audit-2', action: 'VERIFICATION_CREATED', entityType: 'ReceiptVerification', entityId: 'v1', userId: 'demo-emp-1', businessId: 'demo-business-1', ipAddress: '192.168.1.2', createdAt: d(0, 9, 45), user: { fullName: 'Sara Tadesse', email: 'sara@addiscoffee.et' } },
  { id: 'audit-3', action: 'ALERT_CREATED', entityType: 'FraudAlert', entityId: 'alert-1', userId: 'system', businessId: 'demo-business-1', ipAddress: null, createdAt: d(-1, 14, 30), user: null },
  { id: 'audit-4', action: 'EMPLOYEE_CREATED', entityType: 'User', entityId: 'demo-emp-3', userId: 'demo-user-owner', businessId: 'demo-business-1', ipAddress: '192.168.1.1', createdAt: d(-60), user: { fullName: 'Abebe Girma', email: 'demo@addiscoffee.et' } },
];
