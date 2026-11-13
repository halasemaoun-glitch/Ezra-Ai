const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");

const PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.RECORD_AUDIO",
  "android.permission.CAMERA",
  "android.permission.READ_CONTACTS",
  "android.permission.CALL_PHONE",
  "android.permission.SEND_SMS",
  "android.permission.WAKE_LOCK",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION"
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

    const launcherQueryExists = manifest.queries.some(query =>
      query.intent?.some(intent =>
        intent.action?.some(action => action.$["android:name"] === "android.intent.action.MAIN") &&
        intent.category?.some(category => category.$["android:name"] === "android.intent.category.LAUNCHER")
      )
    );
    if (!launcherQueryExists) {
      manifest.queries.push({
        intent: [{
          action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
          category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }]
        }]
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
    const accessibilityServiceName = "expo.modules.ezrawakeword.EzraAccessibilityService";
    if (!application.service.some(item => item.$["android:name"] === accessibilityServiceName)) {
      application.service.push({
        $: {
          "android:name": accessibilityServiceName,
          "android:enabled": "true",
          "android:exported": "true",
          "android:permission": "android.permission.BIND_ACCESSIBILITY_SERVICE",
          "android:label": "EZRA للتحكم الصوتي بالتطبيقات"
        },
        "intent-filter": [{
          action: [{ $: { "android:name": "android.accessibilityservice.AccessibilityService" } }]
        }],
        "meta-data": [{
          $: {
            "android:name": "android.accessibilityservice",
            "android:resource": "@xml/ezra_accessibility_service_config"
          }
        }]
      });
    }

    application.receiver = application.receiver || [];
    const accessibilityReceiverName = "expo.modules.ezrawakeword.EzraAccessibilityActionReceiver";
    if (!application.receiver.some(item => item.$["android:name"] === accessibilityReceiverName)) {
      application.receiver.push({
        $: {
          "android:name": accessibilityReceiverName,
          "android:enabled": "true",
          "android:exported": "false"
        },
        "intent-filter": [{
          action: [{ $: { "android:name": "com.halasemaoun.ezra.CONFIRM_ACCESSIBILITY_ACTION" } }]
        }]
      });
    }

    const captureServiceName = "expo.modules.ezrawakeword.EzraScreenCaptureService";
    if (!application.service.some(item => item.$["android:name"] === captureServiceName)) {
      application.service.push({
        $: {
          "android:name": captureServiceName,
          "android:enabled": "true",
          "android:exported": "false",
          "android:stopWithTask": "false",
          "android:foregroundServiceType": "mediaProjection"
        }
      });
    }
    return config;
  });

  config = withDangerousMod(config, ["android", async modConfig => {
    const res = path.join(modConfig.modRequest.platformProjectRoot, "app", "src", "main", "res");
    const xmlDir = path.join(res, "xml");
    const valuesDir = path.join(res, "values");
    fs.mkdirSync(xmlDir, { recursive: true });
    fs.mkdirSync(valuesDir, { recursive: true });
    fs.writeFileSync(path.join(xmlDir, "ezra_accessibility_service_config.xml"), `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/ezra_accessibility_service_description"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged|typeViewScrolled"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="100"
    android:canRetrieveWindowContent="true"
    android:accessibilityFlags="flagRetrieveInteractiveWindows" />`);
    fs.writeFileSync(path.join(valuesDir, "ezra_accessibility_strings.xml"), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="ezra_accessibility_service_description">يسمح لـ EZRA بالعثور على الأزرار التي تطلبينها والضغط عليها والتمرير داخل التطبيقات، وإدخال نص تطلبينه صراحةً في حقل الكتابة النشط فقط. تستخدم النصوص الظاهرة مؤقتاً للعثور على العنصر الذي تطلبينه، ولا تحفظ محتوى الشاشة أو ترسله إلى أي خادم.</string>
</resources>`);
    return modConfig;
  }]);

  return config;
};
