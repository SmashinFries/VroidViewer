const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Expo Config Plugin to sync specific native source folders
 * and ensure Android build environment is correctly configured.
 */
function withNativeRestore(config) {
  // 1. Android: Copy "vrm" package and fix build configuration
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

      // Register NativeVrmPackage in MainApplication.kt so React Native can find the view
      const mainAppPath = path.join(rootDir, 'android/app/src/main/java', packagePath, 'MainApplication.kt');
      if (fs.existsSync(mainAppPath)) {
        let mainApp = fs.readFileSync(mainAppPath, 'utf8');
        const vrmPackageLine = `packages.add(${packageName}.vrm.NativeVrmPackage())`;
        if (!mainApp.includes('NativeVrmPackage')) {
          console.log('[withNativeRestore] Registering NativeVrmPackage in MainApplication.kt...');
          mainApp = mainApp.replace(
            /\/\/ Packages that cannot be autolinked yet can be added manually here.*\n.*\/\/ packages\.add\(.*\)/,
            `// Packages that cannot be autolinked yet can be added manually here, for example:\n            ${vrmPackageLine}`
          );
          fs.writeFileSync(mainAppPath, mainApp);
        }
      }

      // Ensure app/build.gradle has Filament dependencies for VRM native code
      const appBuildGradlePath = path.join(rootDir, 'android/app/build.gradle');
      if (fs.existsSync(appBuildGradlePath)) {
        let appBuildGradle = fs.readFileSync(appBuildGradlePath, 'utf8');
        if (!appBuildGradle.includes('filament-android')) {
          console.log('[withNativeRestore] Adding Filament dependencies to app/build.gradle...');
          const filamentDeps = [
            '',
            '    // Filament 3D engine dependencies for VRM rendering',
            '    implementation("com.google.android.filament:filament-android:1.70.1")',
            '    implementation("com.google.android.filament:filament-utils-android:1.70.1")',
            '    implementation("com.google.android.filament:gltfio-android:1.70.1")',
            '    implementation("dev.romainguy:kotlin-math:1.5.3")',
          ].join('\n');
          appBuildGradle = appBuildGradle.replace(
            'implementation("com.facebook.react:react-android")',
            'implementation("com.facebook.react:react-android")' + filamentDeps
          );
          fs.writeFileSync(appBuildGradlePath, appBuildGradle);
        }
      }

      // Ensure gradle.properties has org.gradle.java.home set to JDK 21
      const gradlePropsPath = path.join(rootDir, 'android/gradle.properties');
      if (fs.existsSync(gradlePropsPath)) {
        let gradleProps = fs.readFileSync(gradlePropsPath, 'utf8');
        const jdk21Path = '/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home';
        if (!gradleProps.includes('org.gradle.java.home=')) {
          console.log('[withNativeRestore] Adding org.gradle.java.home to gradle.properties...');
          gradleProps = gradleProps.replace(
            'org.gradle.jvmargs=',
            `org.gradle.java.home=${jdk21Path}\norg.gradle.jvmargs=`
          );
          fs.writeFileSync(gradlePropsPath, gradleProps);
        }
      }

      // Ensure local.properties has sdk.dir pointing to Android SDK
      const localPropsPath = path.join(rootDir, 'android/local.properties');
      const androidSdkPath = process.env.ANDROID_HOME
        || process.env.ANDROID_SDK_ROOT
        || path.join(os.homedir(), 'Library/Android/sdk');
      if (!fs.existsSync(localPropsPath) && fs.existsSync(androidSdkPath)) {
        console.log('[withNativeRestore] Creating local.properties with sdk.dir...');
        fs.writeFileSync(localPropsPath, `sdk.dir=${androidSdkPath}\n`);
      }

      return config;
    },
  ]);

  // 2. iOS: Sync "NativeModules" folder. 
  // During prebuild, the ios/ folder may be cleaned, so we restore from backup.
  // If the user edited ios/NativeModules directly, we sync those changes back to backup.
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const rootDir = config.modRequest.projectRoot;
      const srcNativeModulesDir = path.join(rootDir, 'ios/NativeModules');
      const backupDir = path.join(rootDir, 'native/ios/NativeModules');

      if (fs.existsSync(backupDir) && !fs.existsSync(srcNativeModulesDir)) {
        console.log('[withNativeRestore] Restoring ios/NativeModules from backup...');
        fs.mkdirSync(srcNativeModulesDir, { recursive: true });
        fs.cpSync(backupDir, srcNativeModulesDir, { recursive: true, force: true });
      } else if (fs.existsSync(srcNativeModulesDir)) {
        console.log('[withNativeRestore] Syncing ios/NativeModules to backup...');
        fs.mkdirSync(backupDir, { recursive: true });
        fs.cpSync(srcNativeModulesDir, backupDir, { recursive: true, force: true });
      }
      return config;
    },
  ]);

  // 3. iOS: Add NativeModules files to Xcode Project
  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const { projectName } = config.modRequest;
    const rootDir = config.modRequest.projectRoot;
    const srcDir = path.join(rootDir, 'ios/NativeModules');
    const groupName = 'NativeModules';

    console.log(`[withNativeRestore] Starting Xcode registration for ${groupName}`);

    if (!fs.existsSync(srcDir)) {
        console.log(`[withNativeRestore] Skipping: ${srcDir} does not exist`);
        return config;
    }

    const files = fs.readdirSync(srcDir).filter(f => !f.startsWith('.'));
    const target = xcodeProject.getFirstTarget()?.uuid;
    const pbxGroups = xcodeProject.hash.project.objects['PBXGroup'] || {};
    
    // Find the absolute root group from PBXProject section
    const projectObjects = xcodeProject.hash.project.objects['PBXProject'] || {};
    let absoluteRootKey = null;
    for (const [key, obj] of Object.entries(projectObjects)) {
        if (!key.endsWith('_comment') && obj.mainGroup) {
            absoluteRootKey = obj.mainGroup;
            break;
        }
    }

    console.log(`[withNativeRestore] Found ${files.length} files. Target: ${target}, Root: ${absoluteRootKey}`);

    if (!target) {
        console.warn('[withNativeRestore] ERR: No target found');
        return config;
    }

    // Identify or create group
    let groupKey = null;
    for (const [key, group] of Object.entries(pbxGroups)) {
      if (key.endsWith('_comment')) continue;
      if (group.name === groupName || group.path === groupName) {
        groupKey = key;
        break;
      }
    }

    if (!groupKey) {
      console.log(`[withNativeRestore] Creating new group: ${groupName}`);
      const newGroupResult = xcodeProject.addPbxGroup([], groupName, groupName);
      groupKey = newGroupResult.uuid;
    } else {
      console.log(`[withNativeRestore] Using existing group: ${groupKey}`);
    }

    // Force placement at the VERY TOP of the absolute root
    if (absoluteRootKey && pbxGroups[absoluteRootKey]) {
      const rootGroup = pbxGroups[absoluteRootKey];
      rootGroup.children = rootGroup.children || [];
      
      console.log(`[withNativeRestore] Cleaning up existing associations for ${groupName}...`);
      for (const [key, group] of Object.entries(pbxGroups)) {
          if (key.endsWith('_comment')) continue;
          if (group.children) {
              const originalLen = group.children.length;
              group.children = group.children.filter(c => c.value !== groupKey);
              if (group.children.length < originalLen) {
                  console.log(`[withNativeRestore] Removed ${groupName} from group: ${key}`);
              }
          }
      }

      console.log(`[withNativeRestore] Unshifting ${groupName} to absolute root (index 0)`);
      rootGroup.children.unshift({ value: groupKey, comment: groupName });
    } else {
        console.warn(`[withNativeRestore] ERR: Root group ${absoluteRootKey} not found in objects!`);
    }

    // Register files
    files.forEach(file => {
      const filePath = `${groupName}/${file}`;
      try {
        if (file.endsWith('.swift') || file.endsWith('.m') || file.endsWith('.mm') || file.endsWith('.metal')) {
          xcodeProject.addSourceFile(filePath, { target }, groupKey);
        } else if (file.endsWith('.h')) {
          xcodeProject.addHeaderFile(filePath, { target }, groupKey);
        }
      } catch (e) {
        console.warn(`[withNativeRestore] File registration failed for ${file}: ${e.message}`);
      }
    });

    console.log('[withNativeRestore] Xcode registration complete.');
    return config;
  });

  return config;
}

module.exports = withNativeRestore;
