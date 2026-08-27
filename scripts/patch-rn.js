const fs = require('fs');
const path = require('path');

const roots = [
  path.resolve(__dirname, '../node_modules/react-native'),
  path.resolve(__dirname, '../apps/mobile/node_modules/react-native'),
];

for (const rnRoot of roots) {
  if (!fs.existsSync(rnRoot)) continue;

  // 1. Patch Event.js
  const eventJsPath = path.join(rnRoot, 'src/private/webapis/dom/events/Event.js');
  if (fs.existsSync(eventJsPath)) {
    let content = fs.readFileSync(eventJsPath, 'utf8');
    const oldTarget = `Object.defineProperty(Event, 'NONE', {
  enumerable: true,
  value: 0,
});`;
    if (!content.includes('writable: true')) {
      content = content
        .replace(/value: 0,\n\}\);/g, 'value: 0,\n  writable: true,\n  configurable: true,\n});')
        .replace(/value: 1,\n\}\);/g, 'value: 1,\n  writable: true,\n  configurable: true,\n});')
        .replace(/value: 2,\n\}\);/g, 'value: 2,\n  writable: true,\n  configurable: true,\n});')
        .replace(/value: 3,\n\}\);/g, 'value: 3,\n  writable: true,\n  configurable: true,\n});');
      fs.writeFileSync(eventJsPath, content, 'utf8');
      console.log('Patched Event.js in:', rnRoot);
    }
  }

  // 2. Patch NativePlatformConstantsAndroid.js
  const androidConstantsPath = path.join(rnRoot, 'src/private/specs_DEPRECATED/modules/NativePlatformConstantsAndroid.js');
  if (fs.existsSync(androidConstantsPath)) {
    let content = fs.readFileSync(androidConstantsPath, 'utf8');
    if (!content.includes('const fallbackConstants = {')) {
      content = content.replace(
        "export default (TurboModuleRegistry.getEnforcing<Spec>(\n  'PlatformConstants',\n): Spec);",
        `const fallbackConstants = {
  isTesting: false,
  reactNativeVersion: { major: 0, minor: 81, patch: 5, prerelease: null },
  Version: 34,
  Release: '14',
  Serial: 'unknown',
  Fingerprint: 'android',
  Model: 'Android Device',
  Brand: 'Android',
  Manufacturer: 'Android',
  ServerHost: 'localhost:8081',
  uiMode: 'normal',
  getConstants() { return this; },
};

const moduleInstance = TurboModuleRegistry.get<Spec>('PlatformConstants') || (fallbackConstants as any);
export default moduleInstance;`
      );
      fs.writeFileSync(androidConstantsPath, content, 'utf8');
      console.log('Patched NativePlatformConstantsAndroid.js in:', rnRoot);
    }
  }

  // 3. Patch NativePlatformConstantsIOS.js
  const iosConstantsPath = path.join(rnRoot, 'src/private/specs_DEPRECATED/modules/NativePlatformConstantsIOS.js');
  if (fs.existsSync(iosConstantsPath)) {
    let content = fs.readFileSync(iosConstantsPath, 'utf8');
    if (!content.includes('const fallbackConstants = {')) {
      content = content.replace(
        "export default (TurboModuleRegistry.getEnforcing<Spec>(\n  'PlatformConstants',\n): Spec);",
        `const fallbackConstants = {
  isTesting: false,
  reactNativeVersion: { major: 0, minor: 81, patch: 5, prerelease: null },
  forceTouchAvailable: false,
  osVersion: '17.0',
  systemName: 'iOS',
  interfaceIdiom: 'phone',
  getConstants() { return this; },
};

const moduleInstance = TurboModuleRegistry.get<Spec>('PlatformConstants') || (fallbackConstants as any);
export default moduleInstance;`
      );
      fs.writeFileSync(iosConstantsPath, content, 'utf8');
      console.log('Patched NativePlatformConstantsIOS.js in:', rnRoot);
    }
  }
}
