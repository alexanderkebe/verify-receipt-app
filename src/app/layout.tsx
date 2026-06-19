import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from './providers';

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
  themeColor: '#11120D',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
