'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import Sidebar from './Sidebar';
import Icon from '@/components/ui/Icon';
import { ROLE_LABELS, type UserRole } from '@/types';

interface Props {
  user: { name: string; role: UserRole; businessName: string | null };
  children: React.ReactNode;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function DashboardChrome({ user, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <Sidebar role={user.role} open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
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
          <span className="top-header-title">{user.businessName ?? 'Dashboard'}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="dropdown">
            <button className="flex items-center gap-2 btn btn-ghost" onClick={() => setMenuOpen((o) => !o)}>
              <span className="avatar avatar-sm">{initials(user.name)}</span>
              <span className="text-sm font-medium hide-mobile">{user.name}</span>
            </button>
            {menuOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-item" style={{ pointerEvents: 'none', opacity: 0.7 }}>
                  {user.name} — {ROLE_LABELS[user.role]}
                </div>
                <hr className="divider" style={{ margin: '4px 0' }} />
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
