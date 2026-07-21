// ============================================
// Cryptographic Utilities
// Encryption, hashing, masking
// ============================================

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
  return Buffer.from(key.slice(0, 32), 'utf-8');
}

/**
 * Encrypt a string (e.g., account number)
 * Returns a base64 string containing IV + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Combine IV + authTag + ciphertext
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'hex'),
  ]);

  return combined.toString('base64');
}

/**
 * Decrypt a string encrypted with encrypt()
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, 'base64');

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf-8');
}

/**
 * Hash a transaction reference for duplicate detection
 * Uses SHA-256 — one-way, consistent for comparison
 */
export function hashReference(reference: string): string {
  return createHash('sha256')
    .update(reference.trim().toUpperCase())
    .digest('hex');
}

/**
 * Mask an account number: show last 4 digits
 * e.g., "1234567890" → "****7890"
 */
export function maskAccountNumber(accountNumber: string): string {
  if (!accountNumber || accountNumber.length < 4) return '****';
  const visible = accountNumber.slice(-4);
  return `****${visible}`;
}

/**
 * Mask a transaction reference: show first 4 and last 4
 * e.g., "FT243512345678" → "FT24****5678"
 */
export function maskReference(reference: string): string {
  if (!reference) return '****';
  if (reference.length <= 8) return `${reference.slice(0, 2)}****`;
  return `${reference.slice(0, 4)}****${reference.slice(-4)}`;
}

/**
 * Mask a phone number: show last 4 digits
 * e.g., "251912345678" → "****5678"
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return '****';
  return `****${phone.slice(-4)}`;
}

/**
 * Generate a random verification code (6 digits)
 */
export function generateVerificationCode(): string {
  return randomBytes(3).readUIntBE(0, 3).toString().slice(0, 6).padStart(6, '0');
}

/**
 * Generate a secure random token (for invitations, resets)
 */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a one-time token before storing it in the database.
 * If the database is exposed, the raw password-reset link is still not recoverable.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Hash a file buffer to SHA-256 (for receipt image integrity)
 */
export function hashFile(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
