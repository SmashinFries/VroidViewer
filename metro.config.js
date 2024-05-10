// module.exports = {
//   projectRoot: __dirname,
//   resolver: {
//     sourceExts: ['js', 'jsx', 'json', 'ts', 'tsx', 'cjs', 'mjs'],
//     assetExts: ['db', 'mp3', 'ttf', 'obj', 'vrm', 'fbx', 'mtl', 'png', 'jpg'],
//   },
// };
// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// --- burnt ---
// config.resolver.sourceExts.push('mjs');
// config.resolver.sourceExts.push('cjs');
// --- end burnt ---

// react-three-fiber
config.resolver.sourceExts.concat(['js', 'jsx', 'json', 'ts', 'tsx', 'cjs', 'mjs']);
config.resolver.assetExts.concat(['mp3', 'ttf', 'obj', 'vrm', 'fbx', 'mtl', 'png', 'jpg']);
config.resolver.assetExts.push('vrm');

module.exports = config;