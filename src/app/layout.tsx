import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import SplashScreen from '@/components/SplashScreen';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Deresegn';

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Receipt Verification & Fraud Prevention`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    'Verify customer payment receipts in seconds, detect duplicates and fraud, and manage your team — built for Ethiopian businesses.',
  applicationName: APP_NAME,
  manifest: '/manifest.json',
  icons: {
    icon: '/brand/mark.png',
    apple: '/brand/mark.png',
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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  if (!theme) {
                    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {}
              })()
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
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
            `,
          }}
        />
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
