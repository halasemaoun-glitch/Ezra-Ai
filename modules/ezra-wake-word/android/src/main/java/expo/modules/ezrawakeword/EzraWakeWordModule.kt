package expo.modules.ezrawakeword

import android.content.Intent
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

    AsyncFunction("isAvailable") {
      val context = appContext.reactContext?.applicationContext
        ?: return@AsyncFunction false
      android.speech.SpeechRecognizer.isRecognitionAvailable(context)
    }
  }
}
