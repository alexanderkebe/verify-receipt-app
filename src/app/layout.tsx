import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from './providers';
import { ThemeProvider } from '@/components/ui/ThemeProvider';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'ReceiptGuard';

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Receipt Verification & Fraud Prevention`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    'Verify customer payment receipts in seconds, detect duplicates and fraud, and manage your team — built for Ethiopian businesses.',
  applicationName: APP_NAME,
  manifest: '/manifest.json',
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
      </head>
      <body>
        <ThemeProvider>
          <div className="liquid-bg">
            <div className="liquid-blob liquid-blob-1" />
            <div className="liquid-blob liquid-blob-2" />
            <div className="liquid-blob liquid-blob-3" />
          </div>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
