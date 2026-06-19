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
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(216,207,188,0.12)" />
        <XAxis dataKey="label" stroke="#D8CFBC" fontSize={12} />
        <YAxis stroke="#D8CFBC" fontSize={12} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: '#292A22',
            border: '1px solid rgba(216,207,188,0.2)',
            borderRadius: 8,
            color: '#FFFBF4',
          }}
        />
        <Line type="monotone" dataKey="total" name="Total" stroke="#FFFBF4" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="successful" name="Verified" stroke="#D8CFBC" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="failed" name="Issues" stroke="#565449" strokeWidth={2} dot={false} />
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
        <Legend wrapperStyle={{ fontSize: 12, color: '#D8CFBC' }} />
        <Tooltip
          contentStyle={{
            background: '#292A22',
            border: '1px solid rgba(216,207,188,0.2)',
            borderRadius: 8,
            color: '#FFFBF4',
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
