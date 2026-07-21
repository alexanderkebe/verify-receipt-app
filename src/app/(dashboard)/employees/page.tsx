import type { Metadata } from 'next';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { isDemoMode, demoEmployees } from '@/lib/demo-data';
import EmployeesTable, { type Employee } from './EmployeesTable';
import type { UserRole, UserStatus } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Employees' };

export default async function EmployeesPage() {
  let employees: Employee[];
  if (isDemoMode()) {
    employees = demoEmployees as Employee[];
  } else {
    const session = await auth();
    const rows = await prisma.user.findMany({
      where: { businessId: session!.user.businessId!, role: { in: ['OWNER', 'MANAGER', 'EMPLOYEE'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        jobTitle: true,
        employeeCode: true,
        role: true,
        status: true,
        lastLogin: true,
      },
    });
    employees = rows.map((e) => ({
      ...e,
      role: e.role as UserRole,
      status: e.status as UserStatus,
      lastLogin: e.lastLogin?.toISOString() ?? null,
    }));
  }

  return <EmployeesTable employees={employees} />;
}
