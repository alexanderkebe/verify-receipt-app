import assert from 'node:assert/strict';
import test from 'node:test';

import { matchRecipientAgainstAccounts } from '../src/lib/recipient-matching';
import { normalizeResponse } from '../src/lib/verifier-api';
import { paymentAccountSchema } from '../src/lib/validators';

const account = {
  id: 'telebirr-account',
  accountNumberMasked: '********6789',
  accountHolderName: 'Addis Coffee PLC',
  phoneNumber: '251911234567',
};

test('maps the Telebirr credited-party fields from a live verifier response', () => {
  const result = normalizeResponse('TELEBIRR', 'CE12345678', {
    transactionStatus: 'Completed',
    payerName: 'Customer Name',
    creditedPartyName: 'Addis Coffee PLC',
    creditedPartyAccountNo: '0911234567',
    settledAmount: '1,250.00 Birr',
    receiptNo: 'CE12345678',
    paymentDate: '20-07-2026 14:30:00',
    serviceFee: '2.50 Birr',
  });

  assert.equal(result.verificationStatus, 'VERIFIED');
  assert.equal(result.recipientAccount, '0911234567');
  assert.equal(result.recipientAccountMasked, '******4567');
  assert.equal(result.recipientName, 'Addis Coffee PLC');
  assert.equal(result.amount, 1250);
  assert.equal(result.receiptNumber, 'CE12345678');
  assert.equal(result.fees, 2.5);
});

test('accepts equivalent Ethiopian Telebirr phone-number formats', () => {
  const result = matchRecipientAgainstAccounts(
    'TELEBIRR',
    '+251 911 234 567',
    'Different formatting is harmless',
    [account],
  );

  assert.deepEqual(result, { matches: true, accountId: account.id });
});

test('rejects a different Telebirr number even when the recipient name matches', () => {
  const result = matchRecipientAgainstAccounts(
    'TELEBIRR',
    '0911999999',
    account.accountHolderName,
    [account],
  );

  assert.deepEqual(result, { matches: false, accountId: null });
});

test('does not approve Telebirr from a name when the verified number is missing', () => {
  const result = matchRecipientAgainstAccounts(
    'TELEBIRR',
    null,
    account.accountHolderName,
    [account],
  );

  assert.deepEqual(result, { matches: null, accountId: null });
});

test('does not accept a masked four-digit Telebirr suffix as proof', () => {
  const result = matchRecipientAgainstAccounts(
    'TELEBIRR',
    '******4567',
    account.accountHolderName,
    [account],
  );

  assert.deepEqual(result, { matches: null, accountId: null });
});

test('requires the full phone number when adding a Telebirr payment account', () => {
  const valid = paymentAccountSchema.safeParse({
    provider: 'TELEBIRR',
    accountHolderName: 'Addis Coffee PLC',
    accountNumber: '0911234567',
  });
  const truncated = paymentAccountSchema.safeParse({
    provider: 'TELEBIRR',
    accountHolderName: 'Addis Coffee PLC',
    accountNumber: '4567',
  });

  assert.equal(valid.success, true);
  assert.equal(truncated.success, false);
});
