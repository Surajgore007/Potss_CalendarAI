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
    const requiredImports = [
      'import android.content.Intent',
      'import android.net.Uri',
      'import java.net.URLEncoder',
      'import android.os.Build',
    ];
    for (const imp of requiredImports) {
      if (!src.includes(imp)) {
        src = src.replace(/package [^\n]+/, `$&\n${imp}`);
      }
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
    val type = incomingIntent.type ?: ""

    if (Intent.ACTION_SEND == action || Intent.ACTION_SEND_MULTIPLE == action || "android.intent.action.PROCESS_TEXT" == action) {
      // 1. Extract shared text / caption (WhatsApp message, caption on shared photo, URL, PROCESS_TEXT)
      var sharedText = incomingIntent.getStringExtra(Intent.EXTRA_TEXT)
        ?: incomingIntent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
        ?: incomingIntent.getStringExtra("android.intent.extra.PROCESS_TEXT")
        ?: incomingIntent.getCharSequenceExtra("android.intent.extra.PROCESS_TEXT")?.toString()
        ?: incomingIntent.getStringExtra(Intent.EXTRA_SUBJECT)

      if (sharedText.isNullOrBlank() && incomingIntent.clipData != null && incomingIntent.clipData!!.itemCount > 0) {
        sharedText = incomingIntent.clipData?.getItemAt(0)?.text?.toString()
      }

      // 2. Extract shared image / screenshot stream if present
      var isImage = type.startsWith("image/")
      val imageUri: Uri? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        incomingIntent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
      } else {
        @Suppress("DEPRECATION")
        incomingIntent.getParcelableExtra(Intent.EXTRA_STREAM)
      } ?: if (incomingIntent.clipData != null && incomingIntent.clipData!!.itemCount > 0) {
        incomingIntent.clipData?.getItemAt(0)?.uri
      } else null

      if (!isImage && imageUri != null) {
        try {
          val resolvedType = contentResolver.getType(imageUri)
          if (resolvedType != null && resolvedType.startsWith("image/")) {
            isImage = true
          }
        } catch (e: Exception) {}
      }

      var cachedImageUri: String? = null
      if (imageUri != null && isImage) {
        try {
          val inputStream = contentResolver.openInputStream(imageUri)
          if (inputStream != null) {
            val originalBitmap = android.graphics.BitmapFactory.decodeStream(inputStream)
            inputStream.close()

            if (originalBitmap != null) {
              val maxDim = 1280
              val width = originalBitmap.width
              val height = originalBitmap.height
              val scale = if (width > maxDim || height > maxDim) {
                maxDim.toFloat() / Math.max(width, height)
              } else {
                1.0f
              }
              val scaledBitmap = if (scale < 1.0f) {
                android.graphics.Bitmap.createScaledBitmap(
                  originalBitmap,
                  (width * scale).toInt(),
                  (height * scale).toInt(),
                  true
                )
              } else {
                originalBitmap
              }

              val cacheFile = java.io.File(cacheDir, "shared_screenshot_\${System.currentTimeMillis()}.jpg")
              val outputStream = java.io.FileOutputStream(cacheFile)
              scaledBitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 80, outputStream)
              outputStream.close()
              if (scaledBitmap != originalBitmap) {
                scaledBitmap.recycle()
              }
              originalBitmap.recycle()

              cachedImageUri = Uri.fromFile(cacheFile).toString()
              android.util.Log.i("MainActivity", "Successfully cached downscaled screenshot: \$cachedImageUri")
            }
          }
        } catch (e: Exception) {
          android.util.Log.e("MainActivity", "Failed to cache shared image: \${e.message}", e)
        }
      }

      // 3. Construct unified deep link intent:
      // - Both Text & Image: pass both (allows UI to show image preview while prioritizing text extraction)
      // - Text Only: pass text
      // - Image Only (no text): pass image
      val hasText = !sharedText.isNullOrBlank()
      val hasImageUri = cachedImageUri != null

      if (hasText && hasImageUri) {
        try {
          val encodedText = URLEncoder.encode(sharedText, "UTF-8")
          val encodedImg = URLEncoder.encode(cachedImageUri, "UTF-8")
          incomingIntent.action = Intent.ACTION_VIEW
          incomingIntent.data = Uri.parse("eventpulse://(auth)/extract?text=\$encodedText&imageUri=\$encodedImg&autoExtract=true")
          setIntent(incomingIntent)
          return
        } catch (e: Exception) {}
      } else if (hasText) {
        try {
          val encodedText = URLEncoder.encode(sharedText, "UTF-8")
          incomingIntent.action = Intent.ACTION_VIEW
          incomingIntent.data = Uri.parse("eventpulse://(auth)/extract?text=\$encodedText&autoExtract=true")
          setIntent(incomingIntent)
          return
        } catch (e: Exception) {}
      } else if (hasImageUri) {
        try {
          val encodedImg = URLEncoder.encode(cachedImageUri, "UTF-8")
          incomingIntent.action = Intent.ACTION_VIEW
          incomingIntent.data = Uri.parse("eventpulse://(auth)/extract?imageUri=\$encodedImg&autoExtract=true")
          setIntent(incomingIntent)
          return
        } catch (e: Exception) {}
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
