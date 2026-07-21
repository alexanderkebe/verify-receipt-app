interface MinuteBucket {
  startedAt: number;
  count: number;
}

interface DailyBucket {
  date: string;
  count: number;
}

interface OcrRateState {
  businesses: Map<string, MinuteBucket>;
  daily: DailyBucket;
}

const globalForOcr = globalThis as typeof globalThis & {
  __receiptGuardOcrRateState?: OcrRateState;
};

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function state(): OcrRateState {
  const date = todayUtc();
  const existing = globalForOcr.__receiptGuardOcrRateState;
  if (existing) {
    if (existing.daily.date !== date) existing.daily = { date, count: 0 };
    return existing;
  }

  const created: OcrRateState = {
    businesses: new Map(),
    daily: { date, count: 0 },
  };
  globalForOcr.__receiptGuardOcrRateState = created;
  return created;
}

export function consumeOcrQuota(businessId: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const minuteLimit = positiveInt(process.env.OCR_RATE_LIMIT_PER_MINUTE, 10);
  const dailyLimit = positiveInt(process.env.OCR_DAILY_LIMIT, 450);
  const current = state();

  if (current.daily.count >= dailyLimit) {
    return { allowed: false, retryAfterSeconds: 60 * 60 };
  }

  const bucket = current.businesses.get(businessId);
  if (bucket && now - bucket.startedAt < 60_000 && bucket.count >= minuteLimit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((60_000 - (now - bucket.startedAt)) / 1000)),
    };
  }

  if (!bucket || now - bucket.startedAt >= 60_000) {
    current.businesses.set(businessId, { startedAt: now, count: 1 });
  } else {
    bucket.count += 1;
  }
  current.daily.count += 1;

  if (current.businesses.size > 5_000) {
    for (const [key, value] of current.businesses) {
      if (now - value.startedAt >= 60_000) current.businesses.delete(key);
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
