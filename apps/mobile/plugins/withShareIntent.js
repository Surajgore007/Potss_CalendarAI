const { withAndroidManifest, withMainActivity, createRunOncePlugin } = require('@expo/config-plugins');

const withShareIntentManifest = (config) => {
  return withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest.application?.[0];
    if (!mainApplication) return config;

    const mainActivity = mainApplication.activity?.find(
      (a) => a.$['android:name'] === '.MainActivity'
    );

    if (!mainActivity) return config;

    mainActivity['intent-filter'] = mainActivity['intent-filter'] || [];

    const hasSendFilter = mainActivity['intent-filter'].some((filter) =>
      filter.action?.some((action) => action.$['android:name'] === 'android.intent.action.SEND')
    );

    if (!hasSendFilter) {
      mainActivity['intent-filter'].push(
        {
          $: { 'android:label': '@string/app_name' },
          action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          data: [{ $: { 'android:mimeType': 'text/plain' } }],
        },
        {
          $: { 'android:label': '@string/app_name' },
          action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          data: [{ $: { 'android:mimeType': 'text/*' } }],
        },
        {
          $: { 'android:label': '@string/app_name' },
          action: [{ $: { 'android:name': 'android.intent.action.SEND_MULTIPLE' } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          data: [{ $: { 'android:mimeType': 'text/plain' } }],
        },
        {
          $: { 'android:label': '@string/app_name' },
          action: [{ $: { 'android:name': 'android.intent.action.SEND_MULTIPLE' } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          data: [{ $: { 'android:mimeType': 'text/*' } }],
        }
      );
    }

    return config;
  });
};

const withShareIntentMainActivity = (config) => {
  return withMainActivity(config, (config) => {
    let src = config.modResults.contents;

    // 1. Add imports if missing
    if (!src.includes('import android.content.Intent')) {
      src = src.replace(
        /package [^\n]+/,
        `$&\n\nimport android.content.Intent\nimport android.net.Uri\nimport java.net.URLEncoder`
      );
    }

    // 2. Inject handleSendIntent into existing onCreate without creating duplicate onCreate
    if (src.includes('fun onCreate(') && !src.includes('handleSendIntent(intent)')) {
      src = src.replace(
        /override fun onCreate\(savedInstanceState: Bundle\?\) \{/,
        `override fun onCreate(savedInstanceState: Bundle?) {\n    handleSendIntent(intent)`
      );
    }

    // 3. Add onNewIntent and handleSendIntent helper methods
    if (!src.includes('private fun handleSendIntent')) {
      const helperMethods = `
  override fun onNewIntent(intent: Intent) {
    handleSendIntent(intent)
    super.onNewIntent(intent)
  }

  private fun handleSendIntent(incomingIntent: Intent?) {
    if (incomingIntent == null) return
    val action = incomingIntent.action

    if (Intent.ACTION_SEND == action || Intent.ACTION_SEND_MULTIPLE == action || "android.intent.action.PROCESS_TEXT" == action) {
      var sharedText = incomingIntent.getStringExtra(Intent.EXTRA_TEXT)
        ?: incomingIntent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
        ?: incomingIntent.getStringExtra("android.intent.extra.PROCESS_TEXT")
        ?: incomingIntent.getCharSequenceExtra("android.intent.extra.PROCESS_TEXT")?.toString()
        ?: incomingIntent.getStringExtra(Intent.EXTRA_SUBJECT)

      if (sharedText.isNullOrBlank() && incomingIntent.clipData != null && incomingIntent.clipData!!.itemCount > 0) {
        sharedText = incomingIntent.clipData?.getItemAt(0)?.text?.toString()
      }

      if (!sharedText.isNullOrBlank()) {
        try {
          val encoded = URLEncoder.encode(sharedText, "UTF-8")
          incomingIntent.action = Intent.ACTION_VIEW
          incomingIntent.data = Uri.parse("eventpulse://(auth)/extract?text=$encoded&autoExtract=true")
          setIntent(incomingIntent)
        } catch (e: Exception) {
          // fallback gracefully
        }
      }
    }
  }
`;

      const lastBraceIndex = src.lastIndexOf('}');
      if (lastBraceIndex !== -1) {
        src = src.slice(0, lastBraceIndex) + helperMethods + src.slice(lastBraceIndex);
      }
    }

    config.modResults.contents = src;
    return config;
  });
};

const withShareIntent = (config) => {
  config = withShareIntentManifest(config);
  config = withShareIntentMainActivity(config);
  return config;
};

module.exports = createRunOncePlugin(withShareIntent, 'withShareIntent', '1.0.0');
