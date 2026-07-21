import assert from 'node:assert/strict';
import test from 'node:test';

import { generateToken, hashToken } from '../src/lib/crypto';
import { forgotPasswordSchema, resetPasswordSchema } from '../src/lib/validators';

test('password reset tokens are random, fixed-length, and stored as a hash', () => {
  const first = generateToken();
  const second = generateToken();

  assert.equal(first.length, 64);
  assert.notEqual(first, second);
  assert.equal(hashToken(first).length, 64);
  assert.notEqual(hashToken(first), first);
  assert.equal(hashToken(first), hashToken(first));
});

test('forgot-password normalizes and validates email addresses', () => {
  assert.deepEqual(forgotPasswordSchema.parse({ email: '  User@Example.COM ' }), {
    email: 'user@example.com',
  });
  assert.equal(forgotPasswordSchema.safeParse({ email: 'not-an-email' }).success, false);
});

test('reset-password requires a valid token and matching strong passwords', () => {
  const token = 'a'.repeat(64);
  assert.equal(
    resetPasswordSchema.safeParse({ token, newPassword: 'new-password', confirmPassword: 'new-password' }).success,
    true,
  );
  assert.equal(
    resetPasswordSchema.safeParse({ token, newPassword: 'new-password', confirmPassword: 'different-password' }).success,
    false,
  );
  assert.equal(
    resetPasswordSchema.safeParse({ token: 'short', newPassword: 'new-password', confirmPassword: 'new-password' }).success,
    false,
  );
});
