const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = path.resolve(__dirname, 'apps/mobile');
const monorepoRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [monorepoRoot];

// 2. Search both workspace and monorepo node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Explicitly bypass package export collision for Firebase Web SDK compilation on React Native / Hermes
config.resolver.unstable_enablePackageExports = false;

// 4. Support .cjs extension for Firebase Web SDKs
if (!config.resolver.sourceExts.includes('cjs')) {
  config.resolver.sourceExts.push('cjs');
}

// Keep all package resolution within the two workspace node_modules folders.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
