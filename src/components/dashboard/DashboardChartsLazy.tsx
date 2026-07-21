'use client';

// Loads recharts (the heaviest client dependency) only after hydration, so
// the dashboard's initial bundle and first paint don't wait on it. ssr:false
// requires a client component, hence this wrapper module.
import dynamic from 'next/dynamic';

function ChartSkeleton() {
  return <div className="skeleton" style={{ width: '100%', height: 260 }} />;
}

export const TrendChart = dynamic(
  () => import('./DashboardCharts').then((m) => ({ default: m.TrendChart })),
  { ssr: false, loading: ChartSkeleton },
);

export const ProviderChart = dynamic(
  () => import('./DashboardCharts').then((m) => ({ default: m.ProviderChart })),
  { ssr: false, loading: ChartSkeleton },
);
