// ============================================
// NextAuth (Node runtime) — Credentials provider
// Looks up the user, verifies the password, enforces
// lockout, and emits audit events.
// ============================================

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { authConfig } from '@/auth.config';
import prisma from '@/lib/prisma';
import { AUTH_CONFIG } from '@/lib/constants';
import { logAuditEvent, AuditActions } from '@/lib/audit';
import type { UserRole } from '@/types';
import { isDemoMode, DEMO_USER, DEMO_ADMIN_USER } from '@/lib/demo-data';

class AuthError extends Error {}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '').toLowerCase().trim();
        const password = String(credentials?.password ?? '');

        // Demo mode: accept hardcoded credentials, no DB required
        if (isDemoMode()) {
          if (email === DEMO_ADMIN_USER.email && password === 'demo123') return DEMO_ADMIN_USER;
          if (password === 'demo123') return DEMO_USER;
          return null;
        }

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { business: { select: { legalName: true, tradingName: true, status: true } } },
        });

        // Avoid leaking which part failed
        if (!user) return null;

        // Account lockout
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new AuthError('Account temporarily locked. Try again later.');
        }

        const valid = await bcrypt.compare(password, user.passwordHash);

        if (!valid) {
          const attempts = user.loginAttempts + 1;
          const lock = attempts >= AUTH_CONFIG.maxLoginAttempts;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              loginAttempts: attempts,
              lockedUntil: lock
                ? new Date(Date.now() + AUTH_CONFIG.lockoutDurationMinutes * 60_000)
                : null,
            },
          });
          await logAuditEvent({
            businessId: user.businessId ?? undefined,
            userId: user.id,
            action: lock ? AuditActions.ACCOUNT_LOCKED : AuditActions.LOGIN_FAILED,
            entityType: 'User',
            entityId: user.id,
          });
          return null;
        }

        if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
          throw new AuthError('This account is not active. Contact your administrator.');
        }
        if (user.status === 'PENDING') {
          throw new AuthError('Please activate your account before signing in.');
        }

        // Success — reset counters, stamp last login
        await prisma.user.update({
          where: { id: user.id },
          data: { loginAttempts: 0, lockedUntil: null, lastLogin: new Date() },
        });
        await logAuditEvent({
          businessId: user.businessId ?? undefined,
          userId: user.id,
          action: AuditActions.LOGIN_SUCCESS,
          entityType: 'User',
          entityId: user.id,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          fullName: user.fullName,
          role: user.role as UserRole,
          businessId: user.businessId,
          branchId: user.branchId,
          businessName: user.business?.tradingName ?? user.business?.legalName ?? null,
        };
      },
    }),
  ],
});
