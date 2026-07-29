// Metro is configured to watch the repo root so the app can import the web
// app's dependency-free TypeScript modules (`../src/lib/receipt-input.ts`,
// `../src/types`) directly — one implementation of the receipt-parsing rules,
// shared by web and mobile.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

config.watchFolders = [repoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(repoRoot, 'node_modules'),
];
config.resolver.extraNodeModules = {
  // The app's own source
  '@': path.resolve(projectRoot, 'src'),
  // Shared web-app modules (receipt parsing rules)
  '@shared': path.resolve(repoRoot, 'src'),
};

// [DEBUG] Helpers to log Metro resolver activity
function logResolve(msg, context, moduleName) {
  if (!process.env.EXPO_DEBUG_METRO) return;
  const origin = context.originModulePath || '(unknown)';
  console.log(`[METRO] ${msg} | module="${moduleName}" origin="${origin}"`);
}

// --- Path normalisation helper ---
// Metro always uses forward slashes internally, even on Windows.
// Normalise OS-native backslashes to forward slashes so startsWith checks
// work cross-platform regardless of what path.normalize() produces.
function normalise(p) {
  return path.normalize(p).replace(/\\/g, '/').toLowerCase();
}

const sharedTypesShim = path.resolve(projectRoot, 'src/lib/shared-types.ts');
const repoSrc = normalise(path.resolve(repoRoot, 'src'));
const projRoot = normalise(projectRoot);

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@/types') {
    const origin = context.originModulePath ? normalise(context.originModulePath) : '';
    const fromRepo = origin.startsWith(repoSrc);
    const fromProject = origin.startsWith(projRoot);

    logResolve(
      `@/types shim check | fromRepo=${fromRepo} fromProject=${fromProject} origin="${origin}" repoSrc="${repoSrc}" projRoot="${projRoot}" shim="${sharedTypesShim}"`,
      context,
      moduleName,
    );

    if (fromRepo || fromProject) {
      logResolve(`@/types shim → redirecting to "${sharedTypesShim}"`, context, moduleName);
      return { type: 'sourceFile', filePath: sharedTypesShim };
    }
    logResolve(`@/types shim NO MATCH — falling through`, context, moduleName);
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

if (process.env.EXPO_DEBUG_METRO) {
  console.log('[METRO] ========================================');
  console.log('[METRO] Resolver config loaded: EXPO_DEBUG_METRO=1');
  console.log(`[METRO] projectRoot="${projectRoot}"`);
  console.log(`[METRO] repoRoot="${repoRoot}"`);
  console.log(`[METRO] sharedTypesShim="${sharedTypesShim}"`);
  console.log(`[METRO] watchFolders="${JSON.stringify(config.watchFolders)}"`);
  console.log(`[METRO] nodeModulesPaths="${JSON.stringify(config.resolver.nodeModulesPaths)}"`);
  console.log(`[METRO] extraNodeModules="${JSON.stringify(config.resolver.extraNodeModules)}"`);
  console.log('[METRO] ========================================');
}

module.exports = config;
