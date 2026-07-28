interface PasswordResetUrlOptions {
  token: string;
  requestOrigin: string;
  publicAppUrl?: string;
  authUrl?: string;
  isProduction?: boolean;
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Build the public link placed in recovery emails.
 *
 * A configured localhost URL is rejected in production instead of sending a
 * link that can only open on the deployment server itself.
 */
export function buildPasswordResetUrl({
  token,
  requestOrigin,
  publicAppUrl,
  authUrl,
  isProduction = process.env.NODE_ENV === 'production',
}: PasswordResetUrlOptions): string {
  const configuredUrl = publicAppUrl?.trim() || authUrl?.trim();
  const baseUrl = configuredUrl || requestOrigin;

  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    throw new Error('Password recovery app URL is invalid');
  }

  if (!['http:', 'https:'].includes(parsedBase.protocol)) {
    throw new Error('Password recovery app URL must use HTTP or HTTPS');
  }

  if (isProduction && configuredUrl && LOCAL_HOSTNAMES.has(parsedBase.hostname)) {
    throw new Error('Password recovery app URL cannot point to localhost in production');
  }

  const resetUrl = new URL('/reset-password', parsedBase.origin);
  resetUrl.searchParams.set('token', token);
  return resetUrl.toString();
}
