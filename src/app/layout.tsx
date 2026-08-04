import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import SplashScreen from '@/components/SplashScreen';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Deresegn';

export const metadata: Metadata = {
  title: {
    default: 'ደረሰኝ',
    template: `%s · ደረሰኝ`,
  },
  description:
    'Verify customer payment receipts in seconds, detect duplicates and fraud, and manage your team — built for Ethiopian businesses.',
  applicationName: APP_NAME,
  manifest: '/manifest.json',
  // Favicons are declared as explicit <link> tags in <head> below so they can
  // carry a `media` attribute — the white mark on dark browser chrome, the blue
  // gradient mark on light. Next's `metadata.icons` cannot express that.
  icons: {
    apple: '/brand/apple-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0B0F19',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Dark browser chrome gets the white mark; light chrome gets the blue
            gradient. Browsers that ignore `media` fall back to the last match. */}
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          media="(prefers-color-scheme: dark)"
          href="/favicon-dark-32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          media="(prefers-color-scheme: dark)"
          href="/brand/mark-dark-192.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          media="(prefers-color-scheme: light)"
          href="/favicon-32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          media="(prefers-color-scheme: light)"
          href="/brand/mark-192.png"
        />
        {/* Unconditional fallback for browsers without `media` support. */}
        <link rel="icon" type="image/png" sizes="512x512" href="/brand/mark.png" />
        <Script id="theme-init" strategy="beforeInteractive">
          {`
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  if (!theme) {
                    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {}
              })()
          `}
        </Script>
        <Script id="splash-init" strategy="beforeInteractive">
          {`
              (function() {
                // Show the splash only on a first visit or a hard reset (new
                // session / cache-bypassed reload). sessionStorage survives
                // normal reloads (F5) and back/forward restores, but not hard
                // resets or fresh tabs, so a missing flag means "show".
                var showSplash = true;
                try {
                  showSplash = sessionStorage.getItem('ds-splash') !== '1';
                  if (showSplash) sessionStorage.setItem('ds-splash', '1');
                } catch (e) {
                  showSplash = true;
                }
                if (showSplash) document.documentElement.setAttribute('data-splash', '');
              })()
          `}
        </Script>
      </head>
      <body>
        <ThemeProvider>
          <div className="liquid-bg">
            <div className="liquid-blob liquid-blob-1" />
            <div className="liquid-blob liquid-blob-2" />
            <div className="liquid-blob liquid-blob-3" />
          </div>
          {children}
          <SplashScreen />
        </ThemeProvider>
      </body>
    </html>
  );
}
