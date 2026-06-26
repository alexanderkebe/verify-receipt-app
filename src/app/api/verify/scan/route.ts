// POST /api/verify/scan — verify a receipt from an uploaded image
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { performImageVerification } from '@/lib/verification';
import { storeReceiptImage, validateUpload } from '@/lib/image-storage';
import { requireBusiness, ok, fail, handleError } from '@/lib/api-helpers';
import { extractRequestMeta } from '@/lib/audit';
import { isDemoMode, makeDemoVerificationResult } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    const formData = await req.formData().catch(() => null);
    const expectedRaw = formData?.get('expectedAmount');
    const expectedAmount = expectedRaw ? Number(expectedRaw) : undefined;
    // Simulate a short processing delay feeling
    return ok(makeDemoVerificationResult('SCAN' + Date.now(), 'CBE', expectedAmount));
  }
  try {
    const ctx = await requireBusiness();

    const formData = await req.formData().catch(() => null);
    const file = formData?.get('image');
    if (!file || !(file instanceof File)) {
      return fail('No image uploaded');
    }

    const validationError = validateUpload(file.type, file.size);
    if (validationError) return fail(validationError);

    const expectedRaw = formData?.get('expectedAmount');
    const expectedAmount = expectedRaw ? Number(expectedRaw) : undefined;

    const buffer = Buffer.from(await file.arrayBuffer());
    const meta = extractRequestMeta(req.headers);

    const result = await performImageVerification(buffer, file.type, expectedAmount, {
      businessId: ctx.businessId,
      branchId: ctx.branchId ?? undefined,
      employeeId: ctx.userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Persist the image and link it to the verification (30-day retention)
    try {
      const stored = await storeReceiptImage(ctx.businessId, buffer, file.type);
      await prisma.receiptImage.create({
        data: {
          verificationId: result.id,
          storageLocation: stored.storageLocation,
          fileHash: stored.fileHash,
          mimeType: stored.mimeType,
          fileSizeBytes: stored.fileSizeBytes,
          retentionExpiry: stored.retentionExpiry,
        },
      });
    } catch (e) {
      // Image persistence failing should not void a completed verification
      console.error('Failed to persist receipt image:', e);
    }

    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
