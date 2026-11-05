const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * 1. Inject Android permissions and components (Activity, Receivers) into AndroidManifest.xml
 */
const withVankoAlarmManifest = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];

    const permissionsToAdd = [
      'android.permission.SCHEDULE_EXACT_ALARM',
      'android.permission.USE_EXACT_ALARM',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.WAKE_LOCK',
      'android.permission.VIBRATE',
      'android.permission.USE_FULL_SCREEN_INTENT',
      'android.permission.DISABLE_KEYGUARD',
    ];

    for (const perm of permissionsToAdd) {
      const exists = manifest['uses-permission'].some(
        (p) => p.$?.['android:name'] === perm
      );
      if (!exists) {
        manifest['uses-permission'].push({ $: { 'android:name': perm } });
      }
    }

    const application = manifest.application?.[0];
    if (!application) return config;

    // A. Alarm Activity (Full screen lockscreen overlay)
    application.activity = application.activity || [];
    const hasAlarmActivity = application.activity.some(
      (a) => a.$?.['android:name'] === '.alarm.VankoAlarmActivity'
    );
    if (!hasAlarmActivity) {
      application.activity.push({
        $: {
          'android:name': '.alarm.VankoAlarmActivity',
          'android:exported': 'false',
          'android:showWhenLocked': 'true',
          'android:turnScreenOn': 'true',
          'android:showForAllUsers': 'true',
          'android:excludeFromRecents': 'true',
          'android:launchMode': 'singleTask',
          'android:taskAffinity': '',
          'android:theme': '@style/AppTheme',
        },
      });
    }

    // B. Receivers
    application.receiver = application.receiver || [];

    // VankoAlarmReceiver
    if (!application.receiver.some((r) => r.$?.['android:name'] === '.alarm.VankoAlarmReceiver')) {
      application.receiver.push({
        $: {
          'android:name': '.alarm.VankoAlarmReceiver',
          'android:exported': 'false',
        },
      });
    }

    // VankoAlarmActionReceiver
    if (!application.receiver.some((r) => r.$?.['android:name'] === '.alarm.VankoAlarmActionReceiver')) {
      application.receiver.push({
        $: {
          'android:name': '.alarm.VankoAlarmActionReceiver',
          'android:exported': 'false',
        },
      });
    }

    // VankoBootReceiver (System broadcast receiver)
    if (!application.receiver.some((r) => r.$?.['android:name'] === '.alarm.VankoBootReceiver')) {
      application.receiver.push({
        $: {
          'android:name': '.alarm.VankoBootReceiver',
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
              { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
              { $: { 'android:name': 'android.intent.action.TIMEZONE_CHANGED' } },
              { $: { 'android:name': 'android.intent.action.TIME_SET' } },
              { $: { 'android:name': 'android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED' } },
              { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
              { $: { 'android:name': 'com.htc.intent.action.QUICKBOOT_POWERON' } },
            ],
          },
        ],
      });
    }

    return config;
  });
};

/**
 * 2. Register VankoAlarmPackage in MainApplication.kt
 */
const withVankoAlarmMainApplication = (config) => {
  return withMainApplication(config, (config) => {
    let src = config.modResults.contents;

    // Add import
    const importStatement = 'import com.suraj.eventpulse.alarm.VankoAlarmPackage';
    if (!src.includes(importStatement)) {
      src = src.replace(/package [^\n]+/, `$&\n\n${importStatement}`);
    }

    // Register Package in getPackages()
    if (!src.includes('VankoAlarmPackage()')) {
      if (src.includes('PackageList(this).packages.apply {')) {
        src = src.replace(
          'PackageList(this).packages.apply {',
          'PackageList(this).packages.apply {\n              add(VankoAlarmPackage())'
        );
      } else if (src.includes('PackageList(this).packages')) {
        src = src.replace(
          'PackageList(this).packages',
          'PackageList(this).packages.apply {\n              add(VankoAlarmPackage())\n            }'
        );
      }
    }

    config.modResults.contents = src;
    return config;
  });
};

/**
 * 3. Copy Kotlin alarm files into the generated android source tree
 */
const withVankoAlarmKotlinFiles = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const sourceDir = path.resolve(projectRoot, 'plugins', 'alarm');
      const targetDir = path.resolve(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'suraj',
        'eventpulse',
        'alarm'
      );

      if (fs.existsSync(sourceDir)) {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        const files = fs.readdirSync(sourceDir);
        for (const file of files) {
          const srcFile = path.join(sourceDir, file);
          const destFile = path.join(targetDir, file);
          fs.copyFileSync(srcFile, destFile);
        }
      }

      return config;
    },
  ]);
};

/**
 * Combined VankoAlarm plugin
 */
const withVankoAlarm = (config) => {
  config = withVankoAlarmKotlinFiles(config);
  config = withVankoAlarmManifest(config);
  config = withVankoAlarmMainApplication(config);
  return config;
};

module.exports = createRunOncePlugin(withVankoAlarm, 'withVankoAlarm', '1.0.0');

