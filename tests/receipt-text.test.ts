import assert from 'node:assert/strict';
import test from 'node:test';

import { findReferenceInText } from '../src/lib/receipt-text';

test('extracts a CBE FT reference from noisy OCR text', () => {
  assert.equal(
    findReferenceInText('Payment complete\nReference: FT24123ABCDE\nAmount 500.00', 'CBE'),
    'FT24123ABCDE',
  );
});

test('prefers the labelled Dashen transaction reference', () => {
  assert.equal(
    findReferenceInText(
      'Transaction Reference: 132WDTS26196000H\nTransfer Reference: 999999999999999',
      'DASHEN',
    ),
    '132WDTS26196000H',
  );
});

test('extracts labelled Telebirr and M-Pesa receipt identifiers', () => {
  assert.equal(findReferenceInText('Receipt No: DG61L8C6XB', 'TELEBIRR'), 'DG61L8C6XB');
  assert.equal(findReferenceInText('Receipt number SKQ12ABC34', 'MPESA'), 'SKQ12ABC34');
});

test('does not accept a CBE-shaped value for another provider', () => {
  assert.equal(findReferenceInText('Reference FT24123ABCDE', 'MPESA'), null);
});
