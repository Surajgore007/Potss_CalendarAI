const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo while preserving defaults
config.watchFolders = [...(config.watchFolders || []), monorepoRoot];

// 2. Search workspace, shared package, and monorepo node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'packages/shared/node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Explicitly bypass package export collision for Firebase Web SDK compilation on React Native / Hermes
config.resolver.unstable_enablePackageExports = false;

// 4. Support .cjs extension for Firebase Web SDKs
if (!config.resolver.sourceExts.includes('cjs')) {
  config.resolver.sourceExts.push('cjs');
}

config.resolver.extraNodeModules = {
  '@eventpulse/shared': path.resolve(monorepoRoot, 'packages/shared'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@eventpulse/shared') {
    return {
      filePath: path.resolve(monorepoRoot, 'packages/shared/dist/index.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
