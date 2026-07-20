import type { Provider } from '@/types';

export interface RecipientAccountCandidate {
  id: string;
  accountNumberMasked: string;
  accountHolderName: string;
  phoneNumber: string | null;
}

export interface RecipientMatchResult {
  matches: boolean | null;
  accountId: string | null;
}

/**
 * Convert Ethiopian mobile-number variants (09…, 9…, 2519…, +2519…)
 * to the nine digits beginning with 9. Masked or incomplete values are not
 * accepted because four matching digits are not proof of the recipient.
 */
export function normalizeEthiopianMobile(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, '');
  const localNumber = digits.slice(-9);
  return /^9\d{8}$/.test(localNumber) ? localNumber : null;
}

export function matchRecipientAgainstAccounts(
  provider: Provider,
  recipientAccount: string | null,
  recipientName: string | null,
  accounts: RecipientAccountCandidate[],
): RecipientMatchResult {
  if (accounts.length === 0) return { matches: false, accountId: null };

  // Telebirr receipts expose the credited party's Telebirr number. Require an
  // exact full-number match; a similar name or four-digit suffix is not strong
  // enough evidence that the payment reached this business.
  if (provider === 'TELEBIRR') {
    const verifiedPhone = normalizeEthiopianMobile(recipientAccount);
    if (!verifiedPhone) return { matches: null, accountId: null };

    for (const account of accounts) {
      const registeredPhone = normalizeEthiopianMobile(account.phoneNumber);
      if (registeredPhone && registeredPhone === verifiedPhone) {
        return { matches: true, accountId: account.id };
      }
    }

    return { matches: false, accountId: null };
  }

  const normalizedRecipientName = recipientName?.toLowerCase().trim();

  for (const account of accounts) {
    // Bank responses commonly expose only a suffix, so retain suffix matching
    // for non-Telebirr providers.
    if (recipientAccount && account.accountNumberMasked) {
      const accountSuffix = account.accountNumberMasked.replace(/\*/g, '');
      if (accountSuffix && recipientAccount.endsWith(accountSuffix)) {
        return { matches: true, accountId: account.id };
      }
    }

    if (normalizedRecipientName && account.accountHolderName) {
      const holderName = account.accountHolderName.toLowerCase().trim();
      if (
        normalizedRecipientName === holderName ||
        normalizedRecipientName.includes(holderName) ||
        holderName.includes(normalizedRecipientName)
      ) {
        return { matches: true, accountId: account.id };
      }
    }

    if (recipientAccount && account.phoneNumber) {
      const normalizedRecipient = recipientAccount.replace(/[^0-9]/g, '');
      const normalizedPhone = account.phoneNumber.replace(/[^0-9]/g, '');
      if (
        normalizedRecipient === normalizedPhone ||
        normalizedRecipient.endsWith(normalizedPhone.slice(-9))
      ) {
        return { matches: true, accountId: account.id };
      }
    }
  }

  return { matches: false, accountId: null };
}
