// ============================================
// NextAuth Module Augmentation
// Adds business/role fields to the session & JWT
// ============================================

import type { UserRole } from '@/types';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      businessId: string | null;
      branchId: string | null;
      businessName: string | null;
    };
  }

  interface User {
    id?: string;
    role: UserRole;
    businessId: string | null;
    branchId: string | null;
    businessName: string | null;
    fullName: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
    businessId: string | null;
    branchId: string | null;
    businessName: string | null;
  }
}
