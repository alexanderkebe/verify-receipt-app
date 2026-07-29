import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  recordDecision,
  verifyReceipt,
  type Decision,
  type Provider,
  type VerificationResult,
} from '@/api/endpoints';
import {
  PROVIDERS,
  PROVIDER_HELP_TEXTS,
  PROVIDER_PLACEHOLDERS,
  PROVIDER_SHORT_LABELS,
  QR_SCANNER_PROVIDERS,
  appOnlyQrMessage,
  findReceiptReference,
} from '@/lib/receipt';
import QrScanner from '@/components/QrScanner';
import ResultCard from '@/components/ResultCard';
import { Button, Card, ErrorBanner, Input, Label, Screen, Subtitle, Title } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';
import { createDebug } from '@/lib/debug';

const debug = createDebug('[VERIFY]');

type Mode = 'scan' | 'manual';

export default function VerifyScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [provider, setProvider] = useState<Provider | null>(null);
  const [mode, setMode] = useState<Mode>('scan');
  const [reference, setReference] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const canScan = provider !== null && QR_SCANNER_PROVIDERS.has(provider);

  debug('VerifyScreen rendered — provider:', provider, 'mode:', mode, 'loading:', loading, 'result:', !!result);

  function reset() {
    debug('reset');
    setResult(null);
    setError(null);
    setDecision(null);
    setDecisionError(null);
    setReference('');
    setExpectedAmount('');
    setScanNotice(null);
  }

  function selectProvider(next: Provider) {
    debug('selectProvider:', next);
    setProvider(next);
    reset();
    // Providers whose QRs are app-internal go straight to manual entry
    const nextMode = QR_SCANNER_PROVIDERS.has(next) ? 'scan' : 'manual';
    debug('selectProvider — mode set to:', nextMode);
    setMode(nextMode);
  }

  async function runVerification(input: string) {
    debug('runVerification — input:', input.substring(0, 40) + (input.length > 40 ? '...' : ''), 'provider:', provider, 'expectedAmount:', expectedAmount);
    setLoading(true);
    setError(null);
    setDecision(null);
    setDecisionError(null);
    try {
      const amount = expectedAmount ? Number(expectedAmount) : undefined;
      const resultData = await verifyReceipt(input.trim(), provider ?? undefined, amount);
      debug('runVerification — SUCCESS, resultLevel:', resultData.resultLevel, 'id:', resultData.id);
      setResult(resultData);
    } catch (e) {
      debug('runVerification — ERROR:', (e as Error).message);
      setError((e as Error).message);
    } finally {
      setLoading(false);
      debug('runVerification — completed, loading=false');
    }
  }

  /** Returns true when the QR was usable and verification started. */
  function handleScanned(value: string): boolean {
    debug('handleScanned — raw value:', value.substring(0, 60));
    const parsed = findReceiptReference(value);
    debug('handleScanned — parsed:', parsed);
    if (!parsed || parsed.appOnly) {
      const notice = appOnlyQrMessage(provider);
      debug('handleScanned — app-only QR, notice:', notice);
      setScanNotice(notice);
      return false;
    }
    debug('handleScanned — usable reference:', parsed.reference);
    setScanNotice(null);
    setReference(parsed.reference);
    void runVerification(value);
    return true;
  }

  async function submitDecision(next: Decision) {
    if (!result) {
      debug('submitDecision — no result yet, skipping');
      return;
    }
    debug('submitDecision — submitting:', next, 'for verification:', result.id);
    setDecisionError(null);
    try {
      await recordDecision(result.id, next);
      debug('submitDecision — SUCCESS:', next);
      setDecision(next);
    } catch (e) {
      debug('submitDecision — ERROR:', (e as Error).message);
      setDecisionError((e as Error).message);
    }
  }

  // ---- Provider picker ----
  if (!provider) {
    return (
      <Screen style={{ paddingTop: insets.top + spacing.md, padding: 0 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <View style={{ marginBottom: spacing.xl }}>
            <Title>Verify receipt</Title>
            <Subtitle>Which service did the customer pay with?</Subtitle>
          </View>
          <View style={{ gap: spacing.md }}>
            {PROVIDERS.map((p) => (
              <Pressable
                key={p}
                onPress={() => selectProvider(p)}
                style={({ pressed }) => ({
                  backgroundColor: colors.bgSecondary,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.lg,
                  padding: spacing.lg,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>
                  {PROVIDER_SHORT_LABELS[p]}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </Screen>
    );
  }

  // ---- Result ----
  if (result) {
    return (
      <Screen style={{ paddingTop: insets.top + spacing.md, padding: 0 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <ResultCard result={result} />

          {decisionError && (
            <View style={{ marginTop: spacing.md }}>
              <ErrorBanner message={decisionError} />
            </View>
          )}

          {decision ? (
            <Card style={{ marginTop: spacing.lg, alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                Recorded as {decision.toLowerCase()}
              </Text>
            </Card>
          ) : (
            <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                What did you do with this payment?
              </Text>
              <Button title="Accept payment" variant="success" onPress={() => submitDecision('ACCEPTED')} />
              <Button title="Reject payment" variant="danger" onPress={() => submitDecision('REJECTED')} />
              <Button
                title="Escalate to manager"
                variant="secondary"
                onPress={() => submitDecision('ESCALATED')}
              />
            </View>
          )}

          <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
            <Button
              title="Verify another receipt"
              variant="ghost"
              onPress={reset}
            />
            <Button
              title="Change provider"
              variant="ghost"
              onPress={() => { reset(); setProvider(null); }}
            />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  // ---- Input (scan / manual) ----
  return (
    <Screen style={{ paddingTop: insets.top + spacing.md, padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        {/* Back-to-providers header with visible button */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing.lg,
          }}
        >
          <View style={{ flex: 1 }}>
            <Title>{PROVIDER_SHORT_LABELS[provider]}</Title>
          </View>
          <Pressable
            onPress={() => setProvider(null)}
            style={({ pressed }) => ({
              backgroundColor: colors.bgTertiary,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.pill,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
              Change
            </Text>
          </Pressable>
        </View>

        {canScan && (
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
            {(['scan', 'manual'] as Mode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={{
                  flex: 1,
                  paddingVertical: spacing.md,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  backgroundColor: mode === m ? colors.accent : colors.bgTertiary,
                }}
              >
                <Text
                  style={{
                    color: mode === m ? colors.accentText : colors.textSecondary,
                    fontWeight: '600',
                  }}
                >
                  {m === 'scan' ? 'Scan QR' : 'Type reference'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {error && (
          <View style={{ marginBottom: spacing.lg }}>
            <ErrorBanner message={error} />
          </View>
        )}

        {loading ? (
          <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
              Checking the receipt…
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                textAlign: 'center',
                marginTop: spacing.sm,
              }}
            >
              This can take up to a minute for some providers.
            </Text>
          </Card>
        ) : mode === 'scan' && canScan ? (
          <QrScanner onScanned={handleScanned} notice={scanNotice} />
        ) : (
          <View>
            <View style={{ marginBottom: spacing.lg }}>
              <Label>Reference number</Label>
              <Input
                value={reference}
                onChangeText={setReference}
                placeholder={PROVIDER_PLACEHOLDERS[provider]}
                autoCorrect={false}
              />
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.xs }}>
                {PROVIDER_HELP_TEXTS[provider]}
              </Text>
            </View>

            <View style={{ marginBottom: spacing.xl }}>
              <Label>Expected amount (optional)</Label>
              <Input
                value={expectedAmount}
                onChangeText={setExpectedAmount}
                placeholder="e.g. 250"
                keyboardType="decimal-pad"
              />
            </View>

            <Button
              title="Verify"
              onPress={() => runVerification(reference)}
              disabled={reference.trim().length < 4}
            />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
