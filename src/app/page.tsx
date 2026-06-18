import Link from 'next/link';
import styles from './page.module.css';
import { SUBSCRIPTION_CONFIG } from '@/lib/constants';
import { PROVIDER_LABELS, type Provider, type SubscriptionTier } from '@/types';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'ReceiptGuard';
const PROVIDERS = Object.keys(PROVIDER_LABELS) as Provider[];
const TIERS = Object.keys(SUBSCRIPTION_CONFIG) as SubscriptionTier[];

const STEPS = [
  { n: '1', title: 'Register', text: 'Create your business account in minutes.' },
  { n: '2', title: 'Add accounts', text: 'Register the accounts customers pay into.' },
  { n: '3', title: 'Verify receipts', text: 'Enter or scan a receipt reference.' },
  { n: '4', title: 'Get a result', text: 'Instantly see verified, issue, or unable-to-verify.' },
];

const FEATURES = [
  { title: 'Instant verification', text: 'Confirm payments across CBE, Telebirr, M-Pesa and more.' },
  { title: 'Duplicate detection', text: 'Catch receipts that have already been used.' },
  { title: 'Recipient matching', text: 'Flag payments sent to the wrong account.' },
  { title: 'Fraud alerts', text: 'Automatic alerts for mismatches and suspicious patterns.' },
  { title: 'Employee management', text: 'Add staff with roles and a full audit trail.' },
  { title: 'Reports & history', text: 'Searchable history and activity reports.' },
];

export default function Home() {
  return (
    <div className={styles.landing}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandIcon}>R</span>
          {APP_NAME}
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn btn-ghost">
            Sign in
          </Link>
          <Link href="/register" className="btn btn-primary">
            Get started
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={`badge badge-yellow ${styles.heroBadge}`}>Built for Ethiopian businesses</div>
        <h1 className={styles.heroTitle}>
          Verify every receipt.
          <br />
          Stop fraud before it starts.
        </h1>
        <p className={styles.heroSubtitle}>
          Confirm customer payments in seconds, detect duplicate and altered receipts, and manage your
          team — all from one dashboard.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link href="/register" className="btn btn-primary btn-lg">
            Create free account
          </Link>
          <Link href="#pricing" className="btn btn-secondary btn-lg">
            View pricing
          </Link>
        </div>
        <div className={styles.providers}>
          {PROVIDERS.map((p) => (
            <span key={p} className="badge badge-neutral">
              {PROVIDER_LABELS[p]}
            </span>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How it works</h2>
        <div className="grid-4">
          {STEPS.map((s) => (
            <div className="card card-padding" key={s.n}>
              <div className={styles.stepNum}>{s.n}</div>
              <h3 className="font-semibold mt-4">{s.title}</h3>
              <p className="text-sm text-secondary mt-2">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Everything you need to fight receipt fraud</h2>
        <div className="grid-3">
          {FEATURES.map((f) => (
            <div className="card card-padding card-hover" key={f.title}>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-secondary mt-2">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} id="pricing">
        <h2 className={styles.sectionTitle}>Simple, transparent pricing</h2>
        <div className="grid-3">
          {TIERS.map((tier) => {
            const cfg = SUBSCRIPTION_CONFIG[tier];
            const featured = tier === 'BASIC';
            return (
              <div
                className="card card-padding"
                key={tier}
                style={featured ? { borderColor: 'var(--color-accent)', boxShadow: 'var(--shadow-glow-gold)' } : undefined}
              >
                <h3 className="text-lg font-bold">{cfg.label}</h3>
                <div className="text-3xl font-bold mt-2">{cfg.price}</div>
                <ul className="flex flex-col gap-2 mt-4 mb-6">
                  {cfg.features.map((feat) => (
                    <li key={feat} className="text-sm text-secondary">
                      ✓ {feat}
                    </li>
                  ))}
                </ul>
                <Link href="/register" className={`btn ${featured ? 'btn-primary' : 'btn-secondary'} w-full`}>
                  Get started
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <footer className={styles.footer}>
        <div className="flex items-center gap-2">
          <span className={styles.brandIcon}>R</span>
          <span className="font-semibold">{APP_NAME}</span>
        </div>
        <p className="text-sm text-muted">© {APP_NAME}. Receipt verification &amp; fraud prevention.</p>
      </footer>
    </div>
  );
}
