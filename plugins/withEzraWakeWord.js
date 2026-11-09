const { withAndroidManifest } = require("@expo/config-plugins");

const PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.RECORD_AUDIO",
  "android.permission.POST_NOTIFICATIONS"
];

module.exports = function withEzraWakeWord(config) {
  return withAndroidManifest(config, config => {
    const manifest = config.modResults.manifest;
    manifest["uses-permission"] = manifest["uses-permission"] || [];
    for (const permission of PERMISSIONS) {
      if (!manifest["uses-permission"].some(item => item.$["android:name"] === permission)) {
        manifest["uses-permission"].push({ $: { "android:name": permission } });
      }
    }

    manifest.queries = manifest.queries || [];
    const recognitionQueryExists = manifest.queries.some(query =>
      query.intent?.some(intent => intent.action?.some(action => action.$["android:name"] === "android.speech.RecognitionService"))
    );
    if (!recognitionQueryExists) {
      manifest.queries.push({
        intent: [{ action: [{ $: { "android:name": "android.speech.RecognitionService" } }] }]
      });
    }

    const application = manifest.application?.[0];
    if (!application) throw new Error("EZRA Android application manifest is missing.");
    application.service = application.service || [];
    const serviceName = "expo.modules.ezrawakeword.EzraWakeWordService";
    if (!application.service.some(item => item.$["android:name"] === serviceName)) {
      application.service.push({
        $: {
          "android:name": serviceName,
          "android:enabled": "true",
          "android:exported": "false",
          "android:stopWithTask": "false",
          "android:foregroundServiceType": "microphone"
        }
      });
    }
    return config;
  });
};
