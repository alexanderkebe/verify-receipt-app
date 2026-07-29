// Type declaration for the Expo Router entry module.
// This module is bootstrapped as the app entry point and its default
// export is the root React component. Expo does not publish type
// declarations for it because user code is not expected to import it
// directly — but our index.ts re-exports it so Metro can resolve a
// concrete file, so we need the type here.
declare module 'expo-router/entry' {
  import type { ComponentType } from 'react';
  const EntryPoint: ComponentType<Record<string, unknown>>;
  export default EntryPoint;
}
