package expo.modules.ezrawakeword

import android.Manifest
import android.app.AlarmManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.BatteryManager
import android.os.StatFs
import android.os.Handler
import android.os.Looper
import android.telephony.SmsManager
import android.provider.AlarmClock
import android.provider.ContactsContract
import android.provider.Settings
import android.view.KeyEvent
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

class EzraWakeWordModule : Module() {
  private var pendingScreenCapturePromise: Promise? = null
  private companion object { const val SCREEN_CAPTURE_REQUEST_CODE = 7311 }

  override fun definition() = ModuleDefinition {
    Name("EzraWakeWord")

    Function("isAccessibilityEnabled") {
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val component = ComponentName(context, EzraAccessibilityService::class.java)
      val enabled = Settings.Secure.getString(
        context.contentResolver,
        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
      ).orEmpty()
      enabled.split(':').any { it.equals(component.flattenToString(), true) || it.equals(component.flattenToShortString(), true) }
    }

    AsyncFunction("openAccessibilitySettings") {
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (intent.resolveActivity(context.packageManager) == null) return@AsyncFunction false
      context.startActivity(intent)
      true
    }

    AsyncFunction("clickAccessibilityText") { target: String ->
      if (target.isBlank() || target.length > 100) return@AsyncFunction false
      EzraAccessibilityService.clickText(target)
    }

    AsyncFunction("scrollAccessibility") { direction: String ->
      if (direction !in listOf("up", "down", "للأعلى", "للأسفل")) return@AsyncFunction false
      EzraAccessibilityService.scroll(direction)
    }

    AsyncFunction("performAccessibilityGlobalAction") { action: String ->
      if (action !in listOf("back", "home", "notifications", "quick_settings")) return@AsyncFunction false
      EzraAccessibilityService.globalAction(action)
    }

    AsyncFunction("captureScreen") { promise: Promise ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      if (pendingScreenCapturePromise != null) {
        promise.resolve("ERROR: يوجد طلب التقاط شاشة قيد التنفيذ.")
        return@AsyncFunction
      }
      pendingScreenCapturePromise = promise
      val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      val activity = appContext.throwingActivity
      activity.runOnUiThread {
        try {
          activity.startActivityForResult(manager.createScreenCaptureIntent(), SCREEN_CAPTURE_REQUEST_CODE)
        } catch (error: Exception) {
          pendingScreenCapturePromise = null
          promise.resolve("ERROR: تعذّر فتح إذن التقاط الشاشة: ${error.message ?: "unknown error"}")
        }
      }
    }

    AsyncFunction("start") {
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val intent = Intent(context, EzraWakeWordService::class.java)
      androidx.core.content.ContextCompat.startForegroundService(context, intent)
      true
    }

    AsyncFunction("stop") {
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      context.stopService(Intent(context, EzraWakeWordService::class.java))
      true
    }

    AsyncFunction("consumePendingCommand") {
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val preferences = context.getSharedPreferences(EzraWakeWordService.PREFERENCES, 0)
      val command = preferences.getString(EzraWakeWordService.PENDING_COMMAND, "") ?: ""
      preferences.edit().remove(EzraWakeWordService.PENDING_COMMAND).apply()
      command
    }

    AsyncFunction("setTorch") { enabled: Boolean ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
      val flashCameraId = cameraManager.cameraIdList.firstOrNull { cameraId ->
        cameraManager.getCameraCharacteristics(cameraId)
          .get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
      } ?: return@AsyncFunction false
      cameraManager.setTorchMode(flashCameraId, enabled)
      true
    }

    AsyncFunction("findContactPhone") { requestedName: String ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      if (context.checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
        throw SecurityException("Contacts permission is required")
      }
      val normalizedName = requestedName.trim()
      val names = if (normalizedName.contains("أمي") || normalizedName.contains("امي") || normalizedName.contains("ماما") ||
        normalizedName.equals("mom", true) || normalizedName.equals("mother", true)) {
        listOf("أمي", "امي", "ماما", "mom", "mother", "mum")
      } else {
        listOf(normalizedName)
      }
      val selection = names.joinToString(" OR ") { "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?" }
      val selectionArgs = names.map { "%$it%" }.toTypedArray()
      val cursor = context.contentResolver.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER),
        selection,
        selectionArgs,
        "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC"
      )
      cursor?.use { if (it.moveToFirst()) it.getString(1).orEmpty() else "" } ?: ""
    }

    AsyncFunction("dialNumber") { requestedNumber: String ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val number = requestedNumber.filter { it.isDigit() || it == '+' || it == '*' || it == '#' }
      if (number.isBlank()) return@AsyncFunction false
      context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    }

    AsyncFunction("placeCall") { requestedNumber: String ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      if (context.checkSelfPermission(Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
        throw SecurityException("Call permission is required")
      }
      val number = requestedNumber.filter { it.isDigit() || it == '+' || it == '*' || it == '#' }
      if (number.isBlank()) return@AsyncFunction false
      val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$number")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (intent.resolveActivity(context.packageManager) == null) return@AsyncFunction false
      context.startActivity(intent)
      true
    }

    AsyncFunction("composeSms") { requestedNumber: String, body: String ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val number = requestedNumber.trim()
      if (number.isBlank()) return@AsyncFunction false
      val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${Uri.encode(number)}")).apply {
        putExtra("sms_body", body.take(4000))
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      true
    }

    AsyncFunction("sendSmsDirect") { requestedNumber: String, body: String ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      if (context.checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
        throw SecurityException("SMS permission is required")
      }
      val number = requestedNumber.trim()
      val message = body.trim().take(4000)
      if (number.isBlank() || message.isBlank()) return@AsyncFunction false
      val manager = if (Build.VERSION.SDK_INT >= 31) {
        context.getSystemService(SmsManager::class.java)
      } else {
        @Suppress("DEPRECATION")
        SmsManager.getDefault()
      } ?: return@AsyncFunction false
      val parts = manager.divideMessage(message)
      if (parts.size > 1) {
        manager.sendMultipartTextMessage(number, null, parts, null, null)
      } else {
        manager.sendTextMessage(number, null, message, null, null)
      }
      true
    }

    AsyncFunction("createAlarm") { hour: Int, minute: Int, label: String ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      if (hour !in 0..23 || minute !in 0..59) return@AsyncFunction false
      val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
        putExtra(AlarmClock.EXTRA_HOUR, hour)
        putExtra(AlarmClock.EXTRA_MINUTES, minute)
        putExtra(AlarmClock.EXTRA_MESSAGE, label.take(120))
        putExtra(AlarmClock.EXTRA_SKIP_UI, false)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      if (intent.resolveActivity(context.packageManager) == null) return@AsyncFunction false
      context.startActivity(intent)
      true
    }

    AsyncFunction("createTimer") { seconds: Int, label: String ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      if (seconds !in 1..86400) return@AsyncFunction false
      val intent = Intent(AlarmClock.ACTION_SET_TIMER).apply {
        putExtra(AlarmClock.EXTRA_LENGTH, seconds)
        putExtra(AlarmClock.EXTRA_MESSAGE, label.take(120))
        putExtra(AlarmClock.EXTRA_SKIP_UI, false)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      if (intent.resolveActivity(context.packageManager) == null) return@AsyncFunction false
      context.startActivity(intent)
      true
    }

    AsyncFunction("openFilePicker") {
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      if (intent.resolveActivity(context.packageManager) == null) return@AsyncFunction false
      context.startActivity(intent)
      true
    }

    AsyncFunction("openDownloads") {
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val downloadsIntent = Intent("android.intent.action.VIEW_DOWNLOADS")
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val intent = if (downloadsIntent.resolveActivity(context.packageManager) != null) {
        downloadsIntent
      } else {
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "*/*"
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
      }
      if (intent.resolveActivity(context.packageManager) == null) return@AsyncFunction false
      context.startActivity(intent)
      true
    }

    AsyncFunction("openSystemSettings") { target: String ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val action = when (target.lowercase(Locale.ROOT)) {
        "wifi" -> if (Build.VERSION.SDK_INT >= 29) Settings.Panel.ACTION_WIFI else Settings.ACTION_WIFI_SETTINGS
        "internet", "network" -> if (Build.VERSION.SDK_INT >= 29) Settings.Panel.ACTION_INTERNET_CONNECTIVITY else Settings.ACTION_WIRELESS_SETTINGS
        "bluetooth" -> Settings.ACTION_BLUETOOTH_SETTINGS
        "volume", "sound" -> if (Build.VERSION.SDK_INT >= 29) Settings.Panel.ACTION_VOLUME else Settings.ACTION_SOUND_SETTINGS
        "display" -> Settings.ACTION_DISPLAY_SETTINGS
        "location" -> Settings.ACTION_LOCATION_SOURCE_SETTINGS
        "battery" -> Settings.ACTION_BATTERY_SAVER_SETTINGS
        "apps" -> Settings.ACTION_APPLICATION_SETTINGS
        "notifications" -> Settings.ACTION_APP_NOTIFICATION_SETTINGS
        "accessibility" -> Settings.ACTION_ACCESSIBILITY_SETTINGS
        "storage" -> "android.settings.INTERNAL_STORAGE_SETTINGS"
        "date" -> "android.settings.DATE_SETTINGS"
        "privacy" -> "android.settings.PRIVACY_SETTINGS"
        "security" -> Settings.ACTION_SECURITY_SETTINGS
        "language" -> "android.settings.LOCALE_SETTINGS"
        "defaults" -> "android.settings.MANAGE_DEFAULT_APPS_SETTINGS"
        "app_permissions" -> Settings.ACTION_APPLICATION_DETAILS_SETTINGS
        "app" -> Settings.ACTION_APPLICATION_DETAILS_SETTINGS
        else -> Settings.ACTION_SETTINGS
      }
      val intent = Intent(action).apply {
        if (target.equals("app", true) || target.equals("app_permissions", true)) data = Uri.parse("package:${context.packageName}")
        if (target.equals("notifications", true)) {
          putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
          putExtra("android.provider.extra.APP_PACKAGE", context.packageName)
        }
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      if (intent.resolveActivity(context.packageManager) == null) return@AsyncFunction false
      context.startActivity(intent)
      true
    }

    AsyncFunction("launchApp") { requestedName: String ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val query = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      val matches = context.packageManager.queryIntentActivities(query, 0)
      val wanted = requestedName.trim().lowercase(Locale.ROOT)
      val packageAliases = mapOf(
        "whatsapp" to setOf("com.whatsapp"),
        "youtube" to setOf("com.google.android.youtube"),
        "chrome" to setOf("com.android.chrome"),
        "gmail" to setOf("com.google.android.gm"),
        "phone" to setOf("com.google.android.dialer", "com.android.phone"),
        "messages" to setOf("com.google.android.apps.messaging", "com.android.mms"),
        "contacts" to setOf("com.google.android.contacts", "com.android.contacts"),
        "calendar" to setOf("com.google.android.calendar"),
        "camera" to setOf("com.android.camera2", "com.google.android.GoogleCamera"),
        "clock" to setOf("com.google.android.deskclock"),
        "maps" to setOf("com.google.android.apps.maps"),
        "photos" to setOf("com.google.android.apps.photos"),
        "play store" to setOf("com.android.vending"),
        "spotify" to setOf("com.spotify.music"),
        "calculator" to setOf("com.google.android.calculator"),
        "files" to setOf("com.google.android.documentsui")
      )
      val preferredPackages = packageAliases[wanted].orEmpty()
      val match = matches.firstOrNull { info ->
        preferredPackages.contains(info.activityInfo.packageName)
      } ?: matches.firstOrNull { info ->
        info.loadLabel(context.packageManager).toString().trim().lowercase(Locale.ROOT) == wanted
      } ?: matches.firstOrNull { info ->
        info.loadLabel(context.packageManager).toString().trim().lowercase(Locale.ROOT).contains(wanted)
      } ?: return@AsyncFunction false
      val launch = context.packageManager.getLaunchIntentForPackage(match.activityInfo.packageName)
        ?: return@AsyncFunction false
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(launch)
      true
    }

    AsyncFunction("adjustVolume") { direction: String ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val adjustment = when (direction.lowercase(Locale.ROOT)) {
        "up", "raise", "increase" -> AudioManager.ADJUST_RAISE
        "down", "lower", "decrease" -> AudioManager.ADJUST_LOWER
        "mute" -> AudioManager.ADJUST_MUTE
        "unmute" -> AudioManager.ADJUST_UNMUTE
        else -> AudioManager.ADJUST_SAME
      }
      audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, adjustment, AudioManager.FLAG_SHOW_UI)
      true
    }

    AsyncFunction("mediaControl") { requestedAction: String ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val keyCode = when (requestedAction.lowercase(Locale.ROOT)) {
        "play" -> KeyEvent.KEYCODE_MEDIA_PLAY
        "pause" -> KeyEvent.KEYCODE_MEDIA_PAUSE
        "toggle" -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
        "next" -> KeyEvent.KEYCODE_MEDIA_NEXT
        "previous" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
        "stop" -> KeyEvent.KEYCODE_MEDIA_STOP
        else -> return@AsyncFunction false
      }
      val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
      audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
      true
    }

    AsyncFunction("getDeviceOverview") {
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val battery = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
      val storage = StatFs(context.filesDir.absolutePath)
      val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val batteryPercent = battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
      mapOf(
        "deviceModel" to listOf(Build.MANUFACTURER, Build.MODEL).filter { it.isNotBlank() }.joinToString(" "),
        "androidVersion" to Build.VERSION.RELEASE,
        "androidApi" to Build.VERSION.SDK_INT,
        "batteryPercent" to if (batteryPercent in 0..100) batteryPercent else -1,
        "isCharging" to battery.isCharging,
        "availableStorageBytes" to storage.availableBytes,
        "totalStorageBytes" to storage.totalBytes,
        "mediaVolume" to audio.getStreamVolume(AudioManager.STREAM_MUSIC),
        "maxMediaVolume" to audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      )
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != SCREEN_CAPTURE_REQUEST_CODE) return@OnActivityResult
      val promise = pendingScreenCapturePromise ?: return@OnActivityResult
      if (payload.resultCode != android.app.Activity.RESULT_OK || payload.data == null) {
        pendingScreenCapturePromise = null
        promise.resolve("")
        return@OnActivityResult
      }

      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        pendingScreenCapturePromise = null
        promise.resolve("ERROR: EZRA Android context is unavailable.")
        return@OnActivityResult
      }

      context.getSharedPreferences(EzraScreenCaptureService.PREFERENCES, 0)
        .edit().remove(EzraScreenCaptureService.RESULT).apply()
      val serviceIntent = Intent(context, EzraScreenCaptureService::class.java).apply {
        action = EzraScreenCaptureService.ACTION_CAPTURE
        putExtra(EzraScreenCaptureService.EXTRA_RESULT_CODE, payload.resultCode)
        putExtra(EzraScreenCaptureService.EXTRA_RESULT_DATA, payload.data)
      }
      try {
        androidx.core.content.ContextCompat.startForegroundService(context, serviceIntent)
        val handler = Handler(Looper.getMainLooper())
        var attempts = 0
        val poll = object : Runnable {
          override fun run() {
            val result = context.getSharedPreferences(EzraScreenCaptureService.PREFERENCES, 0)
              .getString(EzraScreenCaptureService.RESULT, null)
            if (result != null) {
              context.getSharedPreferences(EzraScreenCaptureService.PREFERENCES, 0)
                .edit().remove(EzraScreenCaptureService.RESULT).apply()
              pendingScreenCapturePromise = null
              promise.resolve(result)
            } else if (++attempts >= 60) {
              pendingScreenCapturePromise = null
              promise.resolve("ERROR: انتهت مهلة انتظار لقطة الشاشة.")
            } else {
              handler.postDelayed(this, 200)
            }
          }
        }
        handler.postDelayed(poll, 200)
      } catch (error: Exception) {
        pendingScreenCapturePromise = null
        promise.resolve("ERROR: تعذّر بدء خدمة التقاط الشاشة: ${error.message ?: "unknown error"}")
      }
    }

    AsyncFunction("isAvailable") {
      val context = appContext.reactContext?.applicationContext
        ?: return@AsyncFunction false
      android.speech.SpeechRecognizer.isRecognitionAvailable(context)
    }
  }
}
