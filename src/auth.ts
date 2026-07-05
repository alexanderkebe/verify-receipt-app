// ============================================
// NextAuth (Node runtime) — Credentials provider
// Looks up the user, verifies the password, enforces
// lockout, and emits audit events.
// ============================================

import NextAuth from 'next-auth';
import type { Provider as AuthProvider } from 'next-auth/providers';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import Facebook from 'next-auth/providers/facebook';
import Apple from 'next-auth/providers/apple';
import bcrypt from 'bcryptjs';
import { authConfig } from '@/auth.config';
import prisma from '@/lib/prisma';
import { AUTH_CONFIG } from '@/lib/constants';
import { logAuditEvent, AuditActions } from '@/lib/audit';
import type { UserRole } from '@/types';
import { isDemoMode, DEMO_USER, DEMO_MANAGER_USER, DEMO_EMPLOYEE_USER, DEMO_ADMIN_USER } from '@/lib/demo-data';

class AuthError extends Error {}

// Social providers activate automatically when their credentials are set
const socialProviders: AuthProvider[] = [];
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.push(Google);
}
if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
  socialProviders.push(Facebook);
}
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
  socialProviders.push(Apple);
}

async function findDbUser(email: string) {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { business: { select: { legalName: true, tradingName: true } } },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Social sign-in only works for emails that already have an account
    // (created via business registration or the join-a-business flow).
    async signIn({ user, account }) {
      if (!account || account.provider === 'credentials') return true;
      if (isDemoMode()) return true;
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const dbUser = await findDbUser(email);
      if (!dbUser) return '/register?sso=new';
      if (dbUser.status === 'SUSPENDED' || dbUser.status === 'DEACTIVATED') return false;
      return true;
    },
    async jwt({ token, user, account }) {
      // OAuth first sign-in: pull role/business context from our database
      if (user && account && account.provider !== 'credentials' && token.email && !isDemoMode()) {
        const dbUser = await findDbUser(String(token.email));
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role as UserRole;
          token.businessId = dbUser.businessId;
          token.branchId = dbUser.branchId;
          token.businessName = dbUser.business?.tradingName ?? dbUser.business?.legalName ?? null;
          token.name = dbUser.fullName;
          await prisma.user.update({ where: { id: dbUser.id }, data: { lastLogin: new Date() } });
        }
        return token;
      }
      if (user) {
        token.id = user.id ?? token.sub ?? '';
        token.role = user.role;
        token.businessId = user.businessId;
        token.branchId = user.branchId;
        token.businessName = user.businessName;
      }
      return token;
    },
  },
  providers: [
    ...socialProviders,
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
          if (password !== 'demo123') return null;
          if (email === DEMO_ADMIN_USER.email) return DEMO_ADMIN_USER;
          if (email === DEMO_MANAGER_USER.email) return DEMO_MANAGER_USER;
          if (email === DEMO_EMPLOYEE_USER.email) return DEMO_EMPLOYEE_USER;
          return DEMO_USER; // any other email → owner
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
