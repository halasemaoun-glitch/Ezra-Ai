package expo.modules.ezrawakeword

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

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

    AsyncFunction("isAvailable") {
      val context = appContext.reactContext?.applicationContext
        ?: return@AsyncFunction false
      android.speech.SpeechRecognizer.isRecognitionAvailable(context)
    }
  }
}
