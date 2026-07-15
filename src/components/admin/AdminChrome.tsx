'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { ADMIN_NAV_ITEMS } from '@/lib/constants';
import Icon from '@/components/ui/Icon';
import ThemeToggle from '@/components/ui/ThemeToggle';

export default function AdminChrome({ user, children }: { user: { name: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <Link href="/admin" className="sidebar-logo" onClick={() => setSidebarOpen(false)}>
          <span className="sidebar-logo-icon">R</span>
          <span className="sidebar-logo-text">Admin Console</span>
        </Link>
        <nav className="sidebar-nav">
          <div className="sidebar-section-title">Platform</div>
          {ADMIN_NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${active ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon name={item.icon} className="link-icon" size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <header className="top-header">
        <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
          <button
            className="btn btn-icon btn-ghost mobile-only"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Toggle navigation"
          >
            <Icon name="menu" />
          </button>
          <span className="top-header-title">Platform Administration</span>
        </div>
        <div className="top-header-actions">
          <ThemeToggle />
          <div className="dropdown">
            <button className="flex items-center gap-2 btn btn-ghost" onClick={() => setMenuOpen((o) => !o)}>
              <span className="avatar avatar-sm">{user.name.slice(0, 2).toUpperCase()}</span>
              <span className="text-sm font-medium hide-mobile">{user.name}</span>
            </button>
            {menuOpen && (
              <div className="dropdown-menu">
                <button className="dropdown-item" onClick={() => signOut({ callbackUrl: '/login' })}>
                  <Icon name="logout" size={16} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">{children}</main>
    </>
  );
}
