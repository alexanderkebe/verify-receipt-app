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

config.resolver.extraNodeModules = {
  // The app's own source
  '@': path.resolve(projectRoot, 'src'),
  // Shared web-app modules (receipt parsing rules)
  '@shared': path.resolve(repoRoot, 'src'),
};

// The shared modules import `@/types` (a Next.js path alias). Only types are
// used, so redirect it to a runtime-empty shim rather than pulling the web
// app's Next/NextAuth type surface into the bundle.
const sharedTypesShim = path.resolve(projectRoot, 'src/lib/shared-types.ts');
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@/types' && context.originModulePath.startsWith(path.resolve(repoRoot, 'src'))) {
    return { type: 'sourceFile', filePath: sharedTypesShim };
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
