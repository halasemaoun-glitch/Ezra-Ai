package expo.modules.ezrawakeword

import android.Manifest
import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.provider.AlarmClock
import android.provider.ContactsContract
import android.provider.Settings
import android.view.KeyEvent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

class EzraWakeWordModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EzraWakeWord")

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

    AsyncFunction("callNumber") { requestedNumber: String ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      if (context.checkSelfPermission(Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
        throw SecurityException("Phone permission is required")
      }
      val number = requestedNumber.filter { it.isDigit() || it == '+' || it == '*' || it == '#' }
      if (number.isBlank()) return@AsyncFunction false
      val callIntent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$number")).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(callIntent)
      true
    }

    AsyncFunction("dialNumber") { requestedNumber: String ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val number = requestedNumber.filter { it.isDigit() || it == '+' || it == '*' || it == '#' }
      if (number.isBlank()) return@AsyncFunction false
      context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
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

    AsyncFunction("openSystemSettings") { target: String ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("EZRA Android context is unavailable")
      val action = when (target.lowercase(Locale.ROOT)) {
        "wifi" -> if (Build.VERSION.SDK_INT >= 29) Settings.Panel.ACTION_WIFI else Settings.ACTION_WIFI_SETTINGS
        "internet" -> if (Build.VERSION.SDK_INT >= 29) Settings.Panel.ACTION_INTERNET_CONNECTIVITY else Settings.ACTION_WIRELESS_SETTINGS
        "bluetooth" -> Settings.ACTION_BLUETOOTH_SETTINGS
        "volume", "sound" -> if (Build.VERSION.SDK_INT >= 29) Settings.Panel.ACTION_VOLUME else Settings.ACTION_SOUND_SETTINGS
        "display" -> Settings.ACTION_DISPLAY_SETTINGS
        "location" -> Settings.ACTION_LOCATION_SOURCE_SETTINGS
        "battery" -> Settings.ACTION_BATTERY_SAVER_SETTINGS
        "apps" -> Settings.ACTION_APPLICATION_SETTINGS
        "notifications" -> Settings.ACTION_APP_NOTIFICATION_SETTINGS
        "accessibility" -> Settings.ACTION_ACCESSIBILITY_SETTINGS
        "app" -> Settings.ACTION_APPLICATION_DETAILS_SETTINGS
        else -> Settings.ACTION_SETTINGS
      }
      val intent = Intent(action).apply {
        if (target.equals("app", true)) data = Uri.parse("package:${context.packageName}")
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
      val match = matches.firstOrNull { info ->
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
        "play", "pause", "toggle" -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
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

    AsyncFunction("isAvailable") {
      val context = appContext.reactContext?.applicationContext
        ?: return@AsyncFunction false
      android.speech.SpeechRecognizer.isRecognitionAvailable(context)
    }
  }
}
