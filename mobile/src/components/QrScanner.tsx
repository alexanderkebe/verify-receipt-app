import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

interface Props {
  /** Called with the raw QR payload. Return true to stop scanning. */
  onScanned: (value: string) => boolean;
  /** Guidance shown under the viewfinder (e.g. an app-only-QR warning). */
  notice?: string | null;
}

/**
 * Camera viewfinder using Android's native barcode engine (the same one the
 * phone's camera app uses), so it reads glary and angled codes the web
 * scanner struggles with. Repeat payloads are ignored so the same code isn't
 * submitted on every frame.
 */
export default function QrScanner({ onScanned, notice }: Props) {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const lastValue = useRef<string | null>(null);
  const [active, setActive] = useState(true);

  if (!permission) {
    return <View style={{ height: 320 }} />;
  }

  if (!permission.granted) {
    return (
      <View
        style={{
          height: 320,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bgTertiary,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        }}
      >
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 14,
            textAlign: 'center',
            marginBottom: spacing.lg,
          }}
        >
          Allow camera access to scan the QR code on a receipt.
        </Text>
        <Button title="Allow camera" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View>
      <View
        style={{
          height: 320,
          borderRadius: radius.lg,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: '#000',
        }}
      >
        {active && (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              const value = data?.trim();
              if (!value || value === lastValue.current) return;
              lastValue.current = value;
              // Accepted → stop the camera; rejected → keep looking, but the
              // repeat guard stops us re-reporting the same bad code.
              if (onScanned(value)) setActive(false);
            }}
          />
        )}
        {/* Framing guide */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 180,
            height: 180,
            marginTop: -90,
            marginLeft: -90,
            borderWidth: 2,
            borderColor: colors.accent,
            borderRadius: radius.md,
          }}
        />
      </View>

      <Text
        style={{
          color: notice ? colors.yellow : colors.textSecondary,
          fontSize: 13,
          textAlign: 'center',
          marginTop: spacing.md,
        }}
      >
        {notice ?? 'Point the camera at the QR code on the receipt.'}
      </Text>
    </View>
  );
}
