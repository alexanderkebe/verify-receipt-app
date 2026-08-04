'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './SplashScreen.module.css';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Deresegn';

// How long the entrance animation plays before the fade-out starts.
const HOLD_MS = 2100;
// Fade-out duration.
const EXIT_MS = 500;
// Much shorter hold for users who prefer reduced motion.
const REDUCED_MS = 700;

/**
 * Branded splash overlay shown only on a first visit or a hard reset — gated
 * by the pre-paint head script in the root layout (html[data-splash]). Soft
 * reloads (F5) and back/forward restores skip it entirely, and client-side
 * route transitions never remount the root layout, so it never flashes
 * during in-app navigation.
 */
export default function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    // The pre-paint head script sets `data-splash` on <html> only for a first
    // visit or a hard reset. If it's absent, this is a soft reload (or the
    // script was blocked) — skip the splash entirely.
    if (!document.documentElement.hasAttribute('data-splash')) {
      // Client-only DOM attribute — deriving this during render would mismatch
      // hydration (the server always emits the overlay markup; CSS keeps it
      // hidden unless data-splash is present), so unmount from the effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(false);
      return;
    }

    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Lock background scrolling while the opaque overlay is up, so the page
    // doesn't appear scrolled the moment the splash lifts.
    document.body.style.overflow = 'hidden';
    const hold = reduced.current ? REDUCED_MS : HOLD_MS;

    const exitTimer = window.setTimeout(() => setLeaving(true), hold);
    const doneTimer = window.setTimeout(() => {
      setVisible(false);
      // Clean up the gating attribute and scroll lock once the splash is done.
      document.documentElement.removeAttribute('data-splash');
      document.body.style.overflow = '';
    }, hold + EXIT_MS + 50);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
      document.body.style.overflow = '';
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`${styles.overlay} ${leaving ? styles.leaving : ''}`}
      role="status"
      aria-label={`Loading ${APP_NAME}`}
    >
      <div className={styles.glow} aria-hidden="true" />
      <img src="/brand/splash-dark.png" alt={APP_NAME} className={`${styles.logo} theme-logo-dark`} />
      <img src="/brand/splash-light.png" alt={APP_NAME} className={`${styles.logo} theme-logo-light`} />
      <p className={styles.tagline}>Receipt Verification &amp; Fraud Prevention</p>
      <div className={styles.progress} aria-hidden="true">
        <div className={styles.progressFill} />
      </div>
    </div>
  );
}
