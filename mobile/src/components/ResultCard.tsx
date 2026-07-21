import { Text, View } from 'react-native';
import type { VerificationResult } from '@/api/endpoints';
import { PROVIDER_LABELS } from '@/lib/receipt';
import { Card } from '@/components/ui';
import { radius, resultColor, spacing, useTheme } from '@/theme';

const ICONS = { GREEN: '✓', RED: '✕', YELLOW: '!' } as const;
const TITLES = {
  GREEN: 'Payment Verified',
  RED: 'Issue Detected',
  YELLOW: 'Unable to Verify',
} as const;

function money(value: number | null, currency: string): string {
  if (value === null || value === undefined) return '—';
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`;
}

function yesNo(value: boolean | null): string {
  if (value === null) return '—';
  return value ? 'Yes' : 'No';
}

function Detail({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: '48%', marginBottom: spacing.md }}>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

export default function ResultCard({ result }: { result: VerificationResult }) {
  const { colors } = useTheme();
  const level = result.resultLevel;
  const accent = resultColor(colors, level);

  return (
    <View>
      {/* Verdict banner — the one thing a cashier reads at a glance */}
      <View
        style={{
          alignItems: 'center',
          backgroundColor: `${accent}1A`,
          borderColor: accent,
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: spacing.lg,
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 30, fontWeight: '700' }}>{ICONS[level]}</Text>
        </View>
        <Text style={{ color: accent, fontSize: 20, fontWeight: '700', marginTop: spacing.md }}>
          {TITLES[level]}
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 14,
            textAlign: 'center',
            marginTop: spacing.xs,
          }}
        >
          {result.resultReason}
        </Text>
      </View>

      {result.isDuplicate && result.duplicateInfo && (
        <View
          style={{
            backgroundColor: `${colors.red}1A`,
            borderColor: colors.red,
            borderWidth: 1,
            borderRadius: radius.md,
            padding: spacing.md,
            marginTop: spacing.md,
          }}
        >
          <Text style={{ color: colors.red, fontSize: 14, fontWeight: '600' }}>
            Already used
          </Text>
          <Text style={{ color: colors.text, fontSize: 13, marginTop: spacing.xs }}>
            This receipt was accepted on{' '}
            {new Date(result.duplicateInfo.previousDate).toLocaleString()} by{' '}
            {result.duplicateInfo.previousEmployee}.
          </Text>
        </View>
      )}

      <Card style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <Detail label="Provider" value={PROVIDER_LABELS[result.provider]} />
          <Detail label="Reference" value={result.referenceMasked} />
          <Detail label="Payer" value={result.payerName ?? '—'} />
          <Detail label="Recipient" value={result.recipientName ?? '—'} />
          <Detail label="Recipient account" value={result.recipientAccountMasked ?? '—'} />
          <Detail
            label="Transaction date"
            value={
              result.transactionDate ? new Date(result.transactionDate).toLocaleString() : '—'
            }
          />
          <Detail label="Verified amount" value={money(result.verifiedAmount, result.currency)} />
          <Detail label="Expected amount" value={money(result.expectedAmount, result.currency)} />
          <Detail label="Recipient match" value={yesNo(result.recipientMatches)} />
          <Detail label="Amount match" value={yesNo(result.amountMatches)} />
        </View>
      </Card>
    </View>
  );
}
