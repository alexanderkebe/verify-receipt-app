import { createHash } from 'crypto';

interface RateBucket {
  startedAt: number;
  count: number;
}

const WINDOW_MS = 15 * 60_000;
const MAX_REQUESTS = 3;

const globalForPasswordReset = globalThis as typeof globalThis & {
  __receiptGuardPasswordResetRates?: Map<string, RateBucket>;
};

function buckets(): Map<string, RateBucket> {
  globalForPasswordReset.__receiptGuardPasswordResetRates ??= new Map();
  return globalForPasswordReset.__receiptGuardPasswordResetRates;
}

/** Best-effort per-instance abuse protection without retaining raw email/IP values. */
export function consumePasswordResetQuota(email: string, ipAddress: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const key = createHash('sha256')
    .update(`${email.trim().toLowerCase()}|${ipAddress}`)
    .digest('hex');
  const current = buckets();
  const bucket = current.get(key);

  if (bucket && now - bucket.startedAt < WINDOW_MS && bucket.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - bucket.startedAt)) / 1000)),
    };
  }

  if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
    current.set(key, { startedAt: now, count: 1 });
  } else {
    bucket.count += 1;
  }

  if (current.size > 5_000) {
    for (const [bucketKey, value] of current) {
      if (now - value.startedAt >= WINDOW_MS) current.delete(bucketKey);
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
