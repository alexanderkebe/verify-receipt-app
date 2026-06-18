// GET /api/employees — list   |   POST /api/employees — create
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { employeeSchema, fieldErrors } from '@/lib/validators';
import { requireRole, ok, fail, handleError } from '@/lib/api-helpers';
import { logAuditEvent, AuditActions, extractRequestMeta } from '@/lib/audit';
import { generateToken } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await requireRole('OWNER', 'MANAGER');
    const employees = await prisma.user.findMany({
      where: { businessId: ctx.businessId!, role: { in: ['OWNER', 'MANAGER', 'EMPLOYEE'] } },
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
        createdAt: true,
      },
    });
    return ok(employees);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole('OWNER', 'MANAGER');
    const body = await req.json().catch(() => null);
    const parsed = employeeSchema.safeParse(body);
    if (!parsed.success) {
      return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid input');
    }
    const data = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (existing) return fail('A user with this email already exists', 409);

    // MVP without email infra: issue a temporary password the owner shares with
    // the employee. (Invitation token is also stored for a future activation flow.)
    const tempPassword = generateToken().slice(0, 10);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const employee = await prisma.user.create({
      data: {
        businessId: ctx.businessId!,
        branchId: data.branchId || null,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone || null,
        jobTitle: data.jobTitle || null,
        employeeCode: data.employeeCode || null,
        role: data.role,
        passwordHash,
        status: 'ACTIVE',
        invitationToken: generateToken(),
      },
      select: { id: true, fullName: true, email: true, role: true, status: true },
    });

    await logAuditEvent({
      businessId: ctx.businessId!,
      userId: ctx.userId,
      action: AuditActions.EMPLOYEE_CREATED,
      entityType: 'User',
      entityId: employee.id,
      newValues: { email: employee.email, role: employee.role },
      ...extractRequestMeta(req.headers),
    });

    return ok({ employee, tempPassword }, 201);
  } catch (error) {
    return handleError(error);
  }
}
