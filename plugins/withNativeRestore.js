const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to sync specific native source folders.
 */
function withNativeRestore(config) {
  // 1. Android: Copy "vrm" package
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const rootDir = config.modRequest.projectRoot;
      const packageName = config.android?.package || 'com.dedicatus.VroidViewer';
      const packagePath = packageName.replace(/\./g, '/');
      const destVrmDir = path.join(rootDir, 'android/app/src/main/java', packagePath, 'vrm');
      const srcVrmDir = path.join(rootDir, 'native/android/vrm');

      if (fs.existsSync(srcVrmDir)) {
        console.log(`[withNativeRestore] Restoring Android VRM code to ${destVrmDir}...`);
        fs.mkdirSync(destVrmDir, { recursive: true });
        fs.cpSync(srcVrmDir, destVrmDir, { recursive: true, force: true });
      } else if (fs.existsSync(destVrmDir)) {
        console.log(`[withNativeRestore] Initializing native/android/vrm from ${destVrmDir}...`);
        fs.mkdirSync(srcVrmDir, { recursive: true });
        fs.cpSync(destVrmDir, srcVrmDir, { recursive: true });
      }
      return config;
    },
  ]);

  // 2. iOS: Copy "NativeModules" folder
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const rootDir = config.modRequest.projectRoot;
      const destNativeModulesDir = path.join(rootDir, 'ios/NativeModules');
      const srcNativeModulesDir = path.join(rootDir, 'native/ios/NativeModules');

      if (fs.existsSync(srcNativeModulesDir)) {
        console.log('[withNativeRestore] Restoring iOS NativeModules...');
        fs.mkdirSync(destNativeModulesDir, { recursive: true });
        fs.cpSync(srcNativeModulesDir, destNativeModulesDir, { recursive: true, force: true });
      } else if (fs.existsSync(destNativeModulesDir)) {
        console.log('[withNativeRestore] Initializing native/ios/NativeModules...');
        fs.mkdirSync(srcNativeModulesDir, { recursive: true });
        fs.cpSync(destNativeModulesDir, srcNativeModulesDir, { recursive: true });
      }
      return config;
    },
  ]);

  // 3. iOS: Add files to Xcode Project
  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const { projectName } = config.modRequest;
    const nativeModulesPath = 'NativeModules';
    const rootDir = config.modRequest.projectRoot;
    const srcDir = path.join(rootDir, 'native/ios/NativeModules');

    if (!fs.existsSync(srcDir)) return config;

    const files = fs.readdirSync(srcDir);
    
    // Add group if it doesn't exist
    let group = xcodeProject.getPBXGroupByName(nativeModulesPath);
    if (!group) {
        // Find the main group (usually named after the project)
        const mainGroupKey = xcodeProject.findPBXGroupKey({ name: projectName });
        xcodeProject.addPbxGroup([], nativeModulesPath, nativeModulesPath);
        // We need to actually link it to the main group, but addPbxGroup with path often works if placed correctly.
    }

    files.forEach(file => {
        const filePath = path.join(nativeModulesPath, file);
        // Add file to project (this handles adding to PBXBuildFile, PBXFileReference, etc.)
        xcodeProject.addSourceFile(filePath, null, nativeModulesPath);
    });

    return config;
  });

  return config;
}

module.exports = withNativeRestore;
