// ============================================
// NextAuth Edge-Safe Configuration
// Shared between middleware (edge) and auth.ts (node).
// Must NOT import Prisma/bcrypt — those run only in the
// Credentials provider added in auth.ts.
// ============================================

import type { NextAuthConfig } from 'next-auth';
import { AUTH_CONFIG } from '@/lib/constants';

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'demo-fallback-secret-32-chars-long!!',
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: AUTH_CONFIG.sessionMaxAgeSeconds,
  },
  providers: [], // Real providers are attached in auth.ts (Node runtime)
  callbacks: {
    // Thread business/role context through the JWT
    jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.sub ?? '';
        token.role = user.role;
        token.businessId = user.businessId;
        token.branchId = user.branchId;
        token.businessName = user.businessName;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.businessId = token.businessId;
        session.user.branchId = token.branchId;
        session.user.businessName = token.businessName;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
