'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DASHBOARD_NAV_ITEMS } from '@/lib/constants';
import type { UserRole } from '@/types';
import Icon from '@/components/ui/Icon';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'ReceiptGuard';

export default function Sidebar({ role, open }: { role: UserRole; open: boolean }) {
  const pathname = usePathname();
  const items = DASHBOARD_NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <Link href="/dashboard" className="sidebar-logo">
        <span className="sidebar-logo-icon">R</span>
        <span className="sidebar-logo-text">{APP_NAME}</span>
      </Link>
      <nav className="sidebar-nav">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} className={`sidebar-link ${active ? 'active' : ''}`}>
              <Icon name={item.icon} className="link-icon" size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
