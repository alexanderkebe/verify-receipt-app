// ============================================
// Receipt Image Storage (Local Disk — MVP)
// Swappable for S3-compatible storage later.
// ============================================

import { mkdir, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { UPLOAD_CONFIG } from '@/lib/constants';
import { hashFile } from '@/lib/crypto';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

export interface StoredImage {
  storageLocation: string;
  fileHash: string;
  mimeType: string;
  fileSizeBytes: number;
  retentionExpiry: Date;
}

export function validateUpload(mimeType: string, sizeBytes: number): string | null {
  if (!UPLOAD_CONFIG.allowedMimeTypes.includes(mimeType)) {
    return `Unsupported file type. Allowed: ${UPLOAD_CONFIG.allowedExtensions.join(', ')}`;
  }
  if (sizeBytes > UPLOAD_CONFIG.maxFileSizeBytes) {
    return `File too large. Maximum size is ${UPLOAD_CONFIG.maxFileSizeMB}MB`;
  }
  return null;
}

/**
 * Persist a receipt image to disk, namespaced by business.
 * Filename is the content hash to dedupe identical uploads.
 */
export async function storeReceiptImage(
  businessId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<StoredImage> {
  const fileHash = hashFile(buffer);
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
  const dir = join(UPLOAD_DIR, businessId);
  await mkdir(dir, { recursive: true });

  const fileName = `${fileHash}.${ext}`;
  const fullPath = join(dir, fileName);
  await writeFile(fullPath, buffer);

  const retentionExpiry = new Date(Date.now() + UPLOAD_CONFIG.imageRetentionDays * 24 * 60 * 60 * 1000);

  return {
    storageLocation: join(businessId, fileName),
    fileHash,
    mimeType,
    fileSizeBytes: buffer.length,
    retentionExpiry,
  };
}

/**
 * Delete an image given its relative storage location.
 */
export async function deleteReceiptImage(storageLocation: string): Promise<void> {
  try {
    await unlink(join(UPLOAD_DIR, storageLocation));
  } catch {
    // Already gone — ignore
  }
}
