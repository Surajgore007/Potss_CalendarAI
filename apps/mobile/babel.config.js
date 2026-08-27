const path = require('path');

const appRoot = path.resolve(__dirname, 'app');
const projectRoot = path.resolve(__dirname, '../..');

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      function expoRouterMonorepoFixPlugin({ types: t }) {
        return {
          name: 'expo-router-monorepo-fix',
          visitor: {
            MemberExpression(p, state) {
              const object = p.node.object;
              if (!t.isMemberExpression(object)) return;
              const objectOfObject = object.object;
              if (!t.isIdentifier(objectOfObject) || objectOfObject.name !== 'process') return;
              if (!t.isIdentifier(object.property) || object.property.name !== 'env') return;
              if (t.isAssignmentExpression(p.parent) && p.parent.left === p.node) return;

              const key = p.toComputedKey();
              if (!t.isStringLiteral(key)) return;

              if (key.value === 'EXPO_ROUTER_ABS_APP_ROOT') {
                p.replaceWith(t.stringLiteral(appRoot));
              } else if (key.value === 'EXPO_ROUTER_IMPORT_MODE') {
                p.replaceWith(t.stringLiteral('sync'));
              } else if (key.value === 'EXPO_PROJECT_ROOT') {
                p.replaceWith(t.stringLiteral(projectRoot));
              } else if (key.value === 'EXPO_ROUTER_APP_ROOT') {
                const filename = state.filename || state.file.opts.filename;
                if (filename) {
                  let relativePath = path.relative(path.dirname(filename), appRoot).replace(/\\/g, '/');
                  if (!relativePath.startsWith('.')) {
                    relativePath = './' + relativePath;
                  }
                  p.replaceWith(t.stringLiteral(relativePath));
                }
              }
            },
          },
        };
      },
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-private-property-in-object', { loose: true }],
    ],
  };
};
