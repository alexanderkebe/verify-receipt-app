'use client';

import { useTheme } from './ThemeProvider';
import Icon from './Icon';

interface ThemeToggleProps {
  className?: string;
}

export default function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`btn btn-ghost btn-icon theme-toggle-btn ${className}`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        width: '40px',
        height: '40px',
        background: 'var(--color-glass)',
        border: '1px solid var(--color-glass-border)',
        backdropFilter: 'blur(12px)',
        color: 'var(--color-text-primary)',
        cursor: 'pointer',
        transition: 'all var(--transition-base)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: theme === 'dark' ? 'rotate(0deg)' : 'rotate(360deg)',
          transition: 'transform var(--transition-spring)',
        }}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} />
      </span>
    </button>
  );
}
