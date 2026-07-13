import Link from 'next/link';
import styles from './auth.module.css';
import ThemeToggle from '@/components/ui/ThemeToggle';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'ReceiptGuard';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.authShell}>
      <div style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 100 }}>
        <ThemeToggle />
      </div>
      <div className={styles.authAside}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandIcon}>R</span>
          <span className={styles.brandText}>{APP_NAME}</span>
        </Link>
        <div className={styles.asideContent}>
          <h1 className={styles.asideTitle}>Verify every receipt. Stop fraud before it starts.</h1>
          <p className={styles.asideSubtitle}>
            Confirm Telebirr, CBE, M-Pesa and bank receipts in seconds. Detect duplicates, mismatched
            recipients, and altered amounts — all from one dashboard.
          </p>
          <ul className={styles.asideList}>
            <li>Instant verification across 6 providers</li>
            <li>Duplicate &amp; recipient-mismatch detection</li>
            <li>Employee management with full audit trail</li>
          </ul>
        </div>
        <p className={styles.asideFooter}>Built for Ethiopian businesses.</p>
      </div>
      <div className={styles.authMain}>
        <div className={styles.authCard}>{children}</div>
      </div>
    </div>
  );
}
