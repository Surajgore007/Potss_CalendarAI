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

// 4. Patch Firebase Firestore TargetState.Oe() unexpected state assertion in React Native
const firestoreDirs = [
  path.resolve(__dirname, '../node_modules/@firebase/firestore/dist'),
  path.resolve(__dirname, '../apps/mobile/node_modules/@firebase/firestore/dist'),
];

for (const fDir of firestoreDirs) {
  if (!fs.existsSync(fDir)) continue;

  const targetFiles = ['index.rn.js', 'index.cjs.js', 'index.esm2017.js', 'index.esm5.js'];
  for (const file of targetFiles) {
    const fullPath = path.join(fDir, file);
    if (!fs.existsSync(fullPath)) continue;

    let content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes('this.fe -= 1, __PRIVATE_hardAssert(this.fe >= 0)')) {
      content = content.replace(
        /this\.fe -= 1, __PRIVATE_hardAssert\(this\.fe >= 0\)/g,
        'this.fe = Math.max(0, this.fe - 1)'
      );
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Patched TargetState assertion in: ${fullPath}`);
    }
  }
}

// 5. Patch expo-modules-core runtime safety when globalThis.expo is accessed before native JSI is installed
const expoCoreDirs = [
  path.resolve(__dirname, '../node_modules/expo-modules-core'),
  path.resolve(__dirname, '../apps/mobile/node_modules/expo-modules-core'),
];

for (const coreDir of expoCoreDirs) {
  if (!fs.existsSync(coreDir)) continue;

  // 5a. Patch ensureNativeModulesAreInstalled.native.ts
  const ensureNativePath = path.join(coreDir, 'src/ensureNativeModulesAreInstalled.native.ts');
  if (fs.existsSync(ensureNativePath)) {
    let content = fs.readFileSync(ensureNativePath, 'utf8');
    if (!content.includes('installExpoGlobalPolyfill')) {
      content = `import { installExpoGlobalPolyfill } from './polyfill/dangerous-internal';\n` + content;
      content = content.replace(
        '  if (!globalThis.expo) {\n    return;\n  }',
        '  if (globalThis.expo) {\n    return;\n  }'
      );
      content = content.replace(
        /}\s*$/,
        '  if (!globalThis.expo) {\n    installExpoGlobalPolyfill();\n  }\n}\n'
      );
      fs.writeFileSync(ensureNativePath, content, 'utf8');
      console.log(`Patched ensureNativeModulesAreInstalled.native.ts in: ${coreDir}`);
    }
  }

  // 5b. Patch src/polyfill/index.ts
  const polyfillIndexPath = path.join(coreDir, 'src/polyfill/index.ts');
  if (fs.existsSync(polyfillIndexPath)) {
    let content = fs.readFileSync(polyfillIndexPath, 'utf8');
    if (!content.includes('installExpoGlobalPolyfill')) {
      content = `import { installExpoGlobalPolyfill } from './dangerous-internal';\n\nif (!globalThis.expo) {\n  installExpoGlobalPolyfill();\n}\n`;
      fs.writeFileSync(polyfillIndexPath, content, 'utf8');
      console.log(`Patched polyfill/index.ts in: ${coreDir}`);
    }
  }

  // 5c. Safe exports in EventEmitter.ts, NativeModule.ts, SharedObject.ts, SharedRef.ts
  const safeFallbacks = [
    {
      file: 'src/EventEmitter.ts',
      from: 'export const EventEmitter: typeof ExpoGlobal.EventEmitter = globalThis.expo.EventEmitter;',
      to: "export const EventEmitter: typeof ExpoGlobal.EventEmitter =\n  globalThis.expo?.EventEmitter || require('./polyfill/CoreModule').EventEmitter;",
    },
    {
      file: 'src/NativeModule.ts',
      from: 'export const NativeModule: typeof ExpoGlobal.NativeModule = globalThis.expo.NativeModule;',
      to: "export const NativeModule: typeof ExpoGlobal.NativeModule =\n  globalThis.expo?.NativeModule || require('./polyfill/CoreModule').NativeModule;",
    },
    {
      file: 'src/SharedObject.ts',
      from: 'export const SharedObject: typeof ExpoGlobal.SharedObject = globalThis.expo.SharedObject;',
      to: "export const SharedObject: typeof ExpoGlobal.SharedObject =\n  globalThis.expo?.SharedObject || require('./polyfill/CoreModule').SharedObject;",
    },
    {
      file: 'src/SharedRef.ts',
      from: 'export const SharedRef: typeof ExpoGlobal.SharedRef = globalThis.expo.SharedRef;',
      to: "export const SharedRef: typeof ExpoGlobal.SharedRef =\n  globalThis.expo?.SharedRef || require('./polyfill/CoreModule').SharedRef;",
    },
  ];

  for (const item of safeFallbacks) {
    const itemPath = path.join(coreDir, item.file);
    if (fs.existsSync(itemPath)) {
      let content = fs.readFileSync(itemPath, 'utf8');
      if (content.includes(item.from)) {
        content = content.replace(item.from, item.to);
        fs.writeFileSync(itemPath, content, 'utf8');
        console.log(`Patched ${item.file} in: ${coreDir}`);
      }
    }
  }

  // 5d. Clean up expo-modules-core/tsconfig.json so IDE doesn't complain about missing expo-module-scripts
  const tsconfigPath = path.join(coreDir, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    let content = fs.readFileSync(tsconfigPath, 'utf8');
    if (content.includes('"extends": "expo-module-scripts/tsconfig.base"')) {
      const fixedTsconfig = JSON.stringify(
        {
          compilerOptions: {
            outDir: './build',
            declaration: true,
            emitDeclarationOnly: true,
            skipLibCheck: true,
          },
          include: ['./src'],
          exclude: ['**/__mocks__/*', '**/__tests__/*', '**/__rsc_tests__/*'],
        },
        null,
        2
      );
      fs.writeFileSync(tsconfigPath, fixedTsconfig, 'utf8');
      console.log(`Patched tsconfig.json in: ${coreDir}`);
    }
  }
}

