// ============================================
// API Route Helpers
// Session/role guards + consistent JSON envelopes
// ============================================

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import type { ApiResponse, UserRole } from '@/types';

export interface AuthedContext {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  businessId: string | null;
  branchId: string | null;
  businessName: string | null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Throw 401 if there is no session; returns the typed context otherwise. */
export async function requireSession(): Promise<AuthedContext> {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError(401, 'Authentication required');
  }
  const u = session.user;
  return {
    userId: u.id,
    email: u.email,
    fullName: u.name,
    role: u.role,
    businessId: u.businessId,
    branchId: u.branchId,
    businessName: u.businessName,
  };
}

/** Require an active business tenant (everything except platform admins). */
export async function requireBusiness(): Promise<AuthedContext & { businessId: string }> {
  const ctx = await requireSession();
  if (!ctx.businessId) {
    throw new ApiError(403, 'No business associated with this account');
  }
  return ctx as AuthedContext & { businessId: string };
}

/** Require one of the given roles. */
export async function requireRole(...roles: UserRole[]): Promise<AuthedContext> {
  const ctx = await requireSession();
  if (!roles.includes(ctx.role)) {
    throw new ApiError(403, 'You do not have permission to perform this action');
  }
  return ctx;
}

export function ok<T>(data: T, init?: number): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status: init ?? 200 });
}

export function fail(message: string, status = 400): NextResponse<ApiResponse> {
  return NextResponse.json({ success: false, error: message }, { status });
}

/** Wrap a handler so ApiError/unknown errors become clean JSON responses. */
export function handleError(error: unknown): NextResponse<ApiResponse> {
  if (error instanceof ApiError) {
    return fail(error.message, error.status);
  }
  const message = error instanceof Error ? error.message : 'Unexpected error';
  console.error('API error:', error);
  return fail(message, 500);
}
