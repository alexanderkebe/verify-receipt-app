// ============================================
// Shared debug logging utility
//
// Usage: every module creates a tagged logger:
//   import { createDebug } from '@/lib/debug';
//   const debug = createDebug('[MYMODULE]');
//   debug('something happened', detail);
//
// Logs are gated behind React Native's __DEV__ global:
//   __DEV__ = true   →  logs visible in Expo Go / dev builds
//   __DEV__ = false  →  all calls become no-ops (dead-code eliminated by Metro)
//
// Metro can also resolve '@/' path aliases (see metro.config.js), so
// TypeScript path mapping in tsconfig.json handles this correctly.
// ============================================

type DebugFn = (...args: unknown[]) => void;

const noop: DebugFn = () => {};

/**
 * Create a tagged console.log wrapper that only fires when __DEV__ is true.
 * Use `bind` so the logger is a single function reference (no per-call closure).
 */
export function createDebug(tag: string): DebugFn {
  if (!__DEV__) return noop;
  return console.log.bind(console, tag);
}
