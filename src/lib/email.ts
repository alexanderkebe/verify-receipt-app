interface PasswordResetEmail {
  to: string;
  name: string;
  resetUrl: string;
  idempotencyKey: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character];
  });
}

export function isPasswordEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.PASSWORD_RESET_FROM_EMAIL);
}

export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
  idempotencyKey,
}: PasswordResetEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('Password recovery email is not configured');

  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl);
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'ReceiptGuard';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      'User-Agent': 'ReceiptGuard/1.0',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Reset your ${appName} password`,
      text: `Hello ${name},\n\nUse this link to reset your password:\n${resetUrl}\n\nThis link expires in 60 minutes and can be used once. If you did not request this, you can ignore this email.`,
      html: `<p>Hello ${safeName},</p><p>Use the link below to reset your password:</p><p><a href="${safeUrl}">Reset password</a></p><p>This link expires in 60 minutes and can be used once. If you did not request this, you can ignore this email.</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Password recovery email failed with status ${response.status}`);
  }
}
