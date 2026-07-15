import Link from 'next/link';
import styles from './page.module.css';
import { SUBSCRIPTION_CONFIG } from '@/lib/constants';
import { PROVIDER_LABELS, type Provider, type SubscriptionTier } from '@/types';
import ThemeToggle from '@/components/ui/ThemeToggle';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'ReceiptGuard';
const PROVIDERS = Object.keys(PROVIDER_LABELS) as Provider[];
const TIERS = Object.keys(SUBSCRIPTION_CONFIG) as SubscriptionTier[];

const PROVIDER_LOGOS: Record<Provider, string> = {
  CBE: '/Commercial Bank Of Ethiopia (PNG) @Izuki Labs.png',
  TELEBIRR: '/Telebirr icon.png',
  DASHEN: '/dashen_bank bank icon.png',
  ABYSSINIA: '/abyssinia icon.png',
  CBE_BIRR: '/CBE Birr (PNG) @Izuki Labs.png',
  MPESA: '/m-pesa icon.png',
};

const STEPS = [
  { n: '1', title: 'Register', text: 'Create your business account in minutes.' },
  { n: '2', title: 'Add accounts', text: 'Register the accounts customers pay into.' },
  { n: '3', title: 'Verify receipts', text: 'Enter or scan a receipt reference.' },
  { n: '4', title: 'Get a result', text: 'Instantly see verified, issue, or unable-to-verify.' },
];

const FEATURES = [
  {
    title: 'Instant verification',
    text: 'Confirm payments across CBE, Telebirr, M-Pesa and more.',
    detail: 'Validate references, amounts, timestamps, and payment status in seconds.',
  },
  {
    title: 'Duplicate detection',
    text: 'Catch receipts that have already been used.',
    detail: 'Every submitted reference is checked against your verification history.',
  },
  {
    title: 'Recipient matching',
    text: 'Flag payments sent to the wrong account.',
    detail: 'Compare the receipt recipient with your registered business payment accounts.',
  },
  {
    title: 'Fraud alerts',
    text: 'Automatic alerts for mismatches and suspicious patterns.',
    detail: 'Surface unusual activity early so your team can review it before approval.',
  },
  {
    title: 'Employee management',
    text: 'Add staff with roles and a full audit trail.',
    detail: 'Control access and keep a traceable record of every verification decision.',
  },
  {
    title: 'Reports & history',
    text: 'Searchable history and activity reports.',
    detail: 'Filter, review, and export the records you need for reconciliation.',
  },
];

const SECURITY = [
  { title: 'Encrypted account data', text: 'Payment account numbers are encrypted at rest with AES-256-GCM.' },
  { title: 'Tenant isolation', text: 'Every business sees only its own data, enforced on every request.' },
  { title: 'Full audit trail', text: 'Sensitive actions are logged immutably for accountability.' },
  { title: 'Role-based access', text: 'Owners, managers and employees each see only what they should.' },
];

const FAQS = [
  {
    q: 'Which payment providers are supported?',
    a: 'CBE, Telebirr, Dashen Bank, Bank of Abyssinia, CBE Birr, and M-Pesa — with more on the way.',
  },
  {
    q: 'How does duplicate detection work?',
    a: 'Each receipt reference is hashed and checked against your previously accepted payments, so a customer cannot reuse the same receipt twice.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No. It runs in any modern browser and can be installed as a progressive web app on your phone.',
  },
  {
    q: 'Is there a free plan?',
    a: 'Yes. The Free plan includes 50 verifications per month at no cost, so you can try it with no commitment.',
  },
  {
    q: 'What happens if a receipt cannot be verified?',
    a: 'You will see a clear “unable to verify” result with the reason, so your staff can ask for an alternative confirmation rather than guessing.',
  },
];

export default function Home() {
  return (
    <div className={styles.landing}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandIcon}>R</span>
          <span className={styles.brandText}>{APP_NAME}</span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className="btn btn-ghost hide-mobile">
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
            <span
              key={p}
              className={`badge badge-neutral ${styles.providerTab}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '9999px',
              }}
            >
              <img
                src={PROVIDER_LOGOS[p]}
                alt={`${PROVIDER_LABELS[p]} logo`}
                style={{
                  height: '18px',
                  width: 'auto',
                  objectFit: 'contain',
                  display: 'inline-block',
                }}
              />
              <span>{PROVIDER_LABELS[p]}</span>
            </span>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How it works</h2>
        <div className="grid-4">
          {STEPS.map((s) => (
            <div className={`card card-padding ${styles.stepCard}`} key={s.n}>
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
            <div className={`card card-padding ${styles.featureCard}`} key={f.title} tabIndex={0}>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-secondary mt-2">{f.text}</p>
              <p className={styles.featureDetail}>{f.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} id="security">
        <h2 className={styles.sectionTitle}>Your data, protected</h2>
        <div className="grid-4">
          {SECURITY.map((s) => (
            <div className="card card-padding" key={s.title}>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="text-sm text-secondary mt-2">{s.text}</p>
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

      <section className={styles.section} id="faq">
        <h2 className={styles.sectionTitle}>Frequently asked questions</h2>
        <div className={styles.faqList}>
          {FAQS.map((item) => (
            <details className={styles.faqItem} key={item.q}>
              <summary className={styles.faqQuestion}>{item.q}</summary>
              <p className={styles.faqAnswer}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.ctaBanner}`}>
        <h2 className={styles.sectionTitle}>Start verifying receipts today</h2>
        <p className="text-secondary mb-6">Create a free account — no card required.</p>
        <Link href="/register" className="btn btn-primary btn-lg">
          Get started free
        </Link>
      </section>

      <footer className={styles.footer}>
        <div className="flex items-center gap-2">
          <span className={styles.brandIcon}>R</span>
          <span className="font-semibold">{APP_NAME}</span>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <Link href="#security" className="text-sm text-secondary">
            Security
          </Link>
          <Link href="#pricing" className="text-sm text-secondary">
            Pricing
          </Link>
          <Link href="#faq" className="text-sm text-secondary">
            FAQ
          </Link>
          <Link href="/login" className="text-sm text-secondary">
            Sign in
          </Link>
        </div>
        <p className="text-sm text-muted">© {APP_NAME}. Receipt verification &amp; fraud prevention.</p>
      </footer>
    </div>
  );
}
