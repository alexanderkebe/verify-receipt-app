// Metro is configured to watch the repo root so the app can import the web
// app's dependency-free TypeScript modules (`../src/lib/receipt-input.ts`,
// `../src/types`) directly — one implementation of the receipt-parsing rules,
// shared by web and mobile.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [repoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(repoRoot, 'node_modules'),
];
// Prefer the app's own copies of React/React Native even when a shared module
// resolves from the repo root.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
