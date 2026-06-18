'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { PROVIDER_LABELS, PROVIDER_COLORS, type ProviderStat, type TrendPoint } from '@/types';

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const rows = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="label" stroke="#64748B" fontSize={12} />
        <YAxis stroke="#64748B" fontSize={12} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: '#1E293B',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            color: '#F1F5F9',
          }}
        />
        <Line type="monotone" dataKey="total" name="Total" stroke="#F5A623" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="successful" name="Verified" stroke="#22C55E" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="failed" name="Issues" stroke="#EF4444" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ProviderChart({ data }: { data: ProviderStat[] }) {
  if (!data.length) {
    return <div className="empty-state-text text-center">No verifications yet.</div>;
  }
  const rows = data.map((d) => ({ name: PROVIDER_LABELS[d.provider], value: d.count, provider: d.provider }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {rows.map((r) => (
            <Cell key={r.provider} fill={PROVIDER_COLORS[r.provider]} stroke="transparent" />
          ))}
        </Pie>
        <Legend wrapperStyle={{ fontSize: 12, color: '#94A3B8' }} />
        <Tooltip
          contentStyle={{
            background: '#1E293B',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            color: '#F1F5F9',
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
