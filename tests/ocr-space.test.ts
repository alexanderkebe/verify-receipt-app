import assert from 'node:assert/strict';
import test from 'node:test';

import { HostedOcrError, parseOcrSpaceResponse } from '../src/lib/ocr-space';

test('parses OCR.Space text without returning overlay data', () => {
  assert.deepEqual(
    parseOcrSpaceResponse({
      ParsedResults: [{ ParsedText: 'Receipt No: DG61L8C6XB' }],
      IsErroredOnProcessing: false,
      ProcessingTimeInMilliseconds: '321',
    }),
    { text: 'Receipt No: DG61L8C6XB', processingTimeMs: 321 },
  );
});

test('rejects an OCR.Space processing failure', () => {
  assert.throws(
    () =>
      parseOcrSpaceResponse({
        ParsedResults: [],
        IsErroredOnProcessing: true,
        ErrorMessage: ['Unable to recognize the file'],
      }),
    HostedOcrError,
  );
});
