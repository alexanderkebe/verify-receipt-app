// ============================================
// Database Seed
// Creates a demo business with owner, employee,
// payment account, and a FREE subscription.
// Run: npm run db:seed  (requires DATABASE_URL + a live DB)
// ============================================

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { encrypt, maskAccountNumber } from '../src/lib/crypto';

const prisma = new PrismaClient();

async function main() {
  const ownerPassword = await bcrypt.hash('Password123!', 10);
  const employeePassword = await bcrypt.hash('Password123!', 10);
  const adminPassword = await bcrypt.hash('Admin123!', 10);

  // ---- Demo business ----
  const business = await prisma.business.upsert({
    where: { email: 'demo@receiptguard.et' },
    update: {},
    create: {
      legalName: 'Addis Coffee House PLC',
      tradingName: 'Addis Coffee House',
      businessType: 'Retail',
      sector: 'Food & Beverage',
      phone: '+251911000000',
      email: 'demo@receiptguard.et',
      city: 'Addis Ababa',
      region: 'Addis Ababa',
      status: 'ACTIVE',
      tosAcceptedAt: new Date(),
      emailVerifiedAt: new Date(),
      subscription: {
        create: {
          tier: 'FREE',
          monthlyVerificationLimit: 50,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
      paymentAccounts: {
        create: {
          provider: 'CBE',
          accountHolderName: 'Addis Coffee House PLC',
          accountNumberEncrypted: encrypt('1000123456789'),
          accountNumberMasked: maskAccountNumber('1000123456789'),
          suffix: '23456789',
          nickname: 'Main CBE account',
          status: 'ACTIVE',
          ownershipStatus: 'DECLARED',
        },
      },
    },
  });

  // ---- Owner ----
  await prisma.user.upsert({
    where: { email: 'owner@receiptguard.et' },
    update: {},
    create: {
      businessId: business.id,
      fullName: 'Selam Tesfaye',
      email: 'owner@receiptguard.et',
      phone: '+251911000001',
      passwordHash: ownerPassword,
      jobTitle: 'Owner',
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });

  // ---- Employee ----
  await prisma.user.upsert({
    where: { email: 'cashier@receiptguard.et' },
    update: {},
    create: {
      businessId: business.id,
      fullName: 'Abebe Bekele',
      employeeCode: 'EMP-001',
      email: 'cashier@receiptguard.et',
      phone: '+251911000002',
      passwordHash: employeePassword,
      jobTitle: 'Cashier',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    },
  });

  // ---- Platform admin ----
  await prisma.user.upsert({
    where: { email: 'admin@receiptguard.et' },
    update: {},
    create: {
      fullName: 'Platform Admin',
      email: 'admin@receiptguard.et',
      passwordHash: adminPassword,
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log('Seed complete:');
  console.log('  Owner    → owner@receiptguard.et / Password123!');
  console.log('  Cashier  → cashier@receiptguard.et / Password123!');
  console.log('  Admin    → admin@receiptguard.et / Admin123!');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
