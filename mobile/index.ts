// Entry point for Expo Router.
//
// The package.json "main" field was set to "expo-router/entry", but when
// watchFolders includes the repo root (../), Metro's dev server can't
// resolve that specifier — it falls back to looking for an ./index file
// and fails. This explicit index.ts gives Metro a concrete module to
// resolve while still bootstrapping the same Expo Router runtime.
export { default } from 'expo-router/entry';
