import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { useTheme } from '@/theme';

const HOLD_MS = 2100;
const EXIT_MS = 500;
const REDUCED_MS = 700;
const ACCENT = '#0078B8';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const splashDark = require('../../assets/splash-dark.png');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const splashLight = require('../../assets/splash-light.png');

interface Props {
  onDone: () => void;
}

/**
 * Animated in-app splash, matching the web splash (dark backdrop, deresegn-02
 * lockup, brand-blue aura, tagline, progress sweep, then fade out). Shown on
 * every app cold start — the mobile equivalent of a "hard reset".
 */
export default function SplashScreen({ onDone }: Props) {
  const { isDark } = useTheme();
  const [leaving, setLeaving] = useState(false);

  const bg = isDark ? '#0B0F19' : '#F8FAFC';
  const logoSource = isDark ? splashDark : splashLight;
  const glowBg = isDark ? 'rgba(0, 120, 184, 0.10)' : 'rgba(0, 120, 184, 0.08)';
  const taglineColor = isDark ? '#9CA3AF' : '#64748B';
  const trackBg = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';

  const overlayOpacity = useMemo(() => new Animated.Value(1), []);
  const logoOpacity = useMemo(() => new Animated.Value(0), []);
  const logoScale = useMemo(() => new Animated.Value(0.82), []);
  const glowOpacity = useMemo(() => new Animated.Value(0.65), []);
  const glowScale = useMemo(() => new Animated.Value(0.95), []);
  const taglineOpacity = useMemo(() => new Animated.Value(0), []);
  const taglineShift = useMemo(() => new Animated.Value(8), []);
  const progress = useMemo(() => new Animated.Value(0), []);

  const glowLoop = useRef<Animated.CompositeAnimation | null>(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  };

  useEffect(() => {
    let cancelled = false;
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    let doneTimer: ReturnType<typeof setTimeout> | undefined;    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (cancelled) return;

        const hold = reduced ? REDUCED_MS : HOLD_MS;

        if (!reduced) {
          Animated.parallel([
            Animated.timing(logoOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.spring(logoScale, { toValue: 1, friction: 7, tension: 55, useNativeDriver: true }),
            Animated.timing(taglineOpacity, { toValue: 1, duration: 600, delay: 250, useNativeDriver: true }),
            Animated.timing(taglineShift, { toValue: 0, duration: 600, delay: 250, useNativeDriver: true }),
            Animated.timing(progress, {
              toValue: 1,
              duration: 1400,
              delay: 400,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
          ]).start();

          glowLoop.current = Animated.loop(
            Animated.sequence([
              Animated.parallel([
                Animated.timing(glowOpacity, { toValue: 1, duration: 1100, useNativeDriver: true }),
                Animated.timing(glowScale, { toValue: 1.06, duration: 1100, useNativeDriver: true }),
              ]),
              Animated.parallel([
                Animated.timing(glowOpacity, { toValue: 0.6, duration: 1100, useNativeDriver: true }),
                Animated.timing(glowScale, { toValue: 0.95, duration: 1100, useNativeDriver: true }),
              ]),
            ])
          );
          glowLoop.current.start();
        } else {
          // Reduced motion: jump straight to the final layout, no animation.
          logoOpacity.setValue(1);
          logoScale.setValue(1);
          taglineOpacity.setValue(1);
          taglineShift.setValue(0);
          progress.setValue(0.92);
        }

        exitTimer = setTimeout(() => {
          setLeaving(true);
          Animated.timing(overlayOpacity, {
            toValue: 0,
            duration: reduced ? 0 : EXIT_MS,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished) finish();
          });
        }, hold);

        // Safety net in case the exit animation callback never fires.
        doneTimer = setTimeout(finish, hold + EXIT_MS + 100);
      })
      .catch(() => {
        // If the reduce-motion query ever rejects, never leave the splash hanging.
        finish();
      });

    return () => {
      cancelled = true;
      glowLoop.current?.stop();
      if (exitTimer) clearTimeout(exitTimer);
      if (doneTimer) clearTimeout(doneTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Animated.View
      style={[styles.overlay, { opacity: overlayOpacity, backgroundColor: bg }]}
      pointerEvents={leaving ? 'none' : 'auto'}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading Deresegn"
    >
      <Animated.View
        style={[
          styles.glow,
          { opacity: glowOpacity, transform: [{ scale: glowScale }], backgroundColor: glowBg },
        ]}
      />
      <Animated.Image
        source={logoSource}
        resizeMode="contain"
        alt=""
        style={[
          styles.logo,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      />
      <Animated.Text
        style={[
          styles.tagline,
          {
            opacity: taglineOpacity,
            transform: [{ translateY: taglineShift }],
            color: taglineColor,
          },
        ]}
      >
        Receipt Verification &amp; Fraud Prevention
      </Animated.Text>
      <View style={[styles.progressTrack, { backgroundColor: trackBg }]}>
        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  logo: {
    width: '46%',
    maxWidth: 230,
    aspectRatio: 1,
  },
  tagline: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  progressTrack: {
    width: '50%',
    maxWidth: 220,
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'flex-start',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
});
