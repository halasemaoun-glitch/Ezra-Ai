package expo.modules.ezrawakeword

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import java.util.Locale

class EzraWakeWordService : Service(), RecognitionListener {
  companion object {
    const val PREFERENCES = "ezra_wake_word"
    const val PENDING_COMMAND = "pending_command"
    private const val CHANNEL_ID = "ezra_voice_assistant"
    private const val NOTIFICATION_ID = 7301
    private const val WAKE_OPEN_ACTION = "com.halasemaoun.ezra.OPEN_FROM_WAKE_WORD"
  }

  private val handler = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var stopping = false
  private var wakeTriggered = false

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    startAsForeground()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    stopping = false
    wakeTriggered = false
    startRecognition()
    return START_STICKY
  }

  override fun onDestroy() {
    stopping = true
    handler.removeCallbacksAndMessages(null)
    recognizer?.setRecognitionListener(null)
    recognizer?.cancel()
    recognizer?.destroy()
    recognizer = null
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun startAsForeground() {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent = launchIntent?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      PendingIntent.getActivity(
        this, 0, it,
        PendingIntent.FLAG_UPDATE_CURRENT or
          (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
      )
    }
    val builder = if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    val notification = builder
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle("EZRA يستمع لكلمة التنبيه")
      .setContentText("قل: يا EZRA · اضغط للعودة إلى التطبيق")
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .apply { if (pendingIntent != null) setContentIntent(pendingIntent) }
      .build()

    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= 26) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "استماع EZRA في الخلفية",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "إشعار دائم عند تفعيل كلمة تنبيه EZRA"
        setShowBadge(false)
      }
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  private fun startRecognition() {
    if (stopping || wakeTriggered) return
    if (!SpeechRecognizer.isRecognitionAvailable(this)) {
      scheduleRetry(2500)
      return
    }
    try {
      if (recognizer == null) {
        recognizer = SpeechRecognizer.createSpeechRecognizer(this).also {
          it.setRecognitionListener(this)
        }
      }
      val request = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
      }
      recognizer?.startListening(request)
    } catch (_: Exception) {
      scheduleRetry(1800)
    }
  }

  private fun scheduleRetry(delayMs: Long) {
    if (!stopping && !wakeTriggered) {
      handler.removeCallbacksAndMessages(null)
      handler.postDelayed({ startRecognition() }, delayMs)
    }
  }

  private fun inspectResults(results: ArrayList<String>?) {
    if (stopping || wakeTriggered || results.isNullOrEmpty()) return
    val recognized = results.firstOrNull()?.trim().orEmpty()
    if (recognized.isEmpty()) return

    val normalized = recognized.lowercase(Locale.ROOT)
      .replace(Regex("[\\u064B-\\u065F\\u0670]"), "")
      .replace('إ', 'ا').replace('أ', 'ا').replace('آ', 'ا')
    val wakePhrases = listOf("يا ازرا", "يا عذرا", "يا ezra", "ازرا", "ezra")
    if (wakePhrases.none { normalized.contains(it) }) return

    wakeTriggered = true
    val command = recognized
      .replace(Regex("(?i)يا\\s*(?:إزرا|ازرا|عذرا|ezra)|(?:إزرا|ازرا|عذرا|ezra)"), "")
      .trim(' ', ',', '،', '.', '!')
    getSharedPreferences(PREFERENCES, MODE_PRIVATE)
      .edit()
      .putString(PENDING_COMMAND, if (command.isEmpty()) "__EZRA_WAKE_ONLY__" else command)
      .apply()

    handler.post {
      val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
      if (launchIntent != null) {
        launchIntent.action = WAKE_OPEN_ACTION
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        launchIntent.putExtra("ezra_wake_command", command)
        startActivity(launchIntent)
      }
      stopSelf()
    }
  }

  override fun onReadyForSpeech(params: android.os.Bundle?) {}
  override fun onBeginningOfSpeech() {}
  override fun onRmsChanged(rmsdB: Float) {}
  override fun onBufferReceived(buffer: ByteArray?) {}
  override fun onEndOfSpeech() {}
  override fun onError(error: Int) {
    if (!stopping && !wakeTriggered) scheduleRetry(if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) 1600 else 700)
  }
  override fun onResults(results: android.os.Bundle?) {
    inspectResults(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION))
    if (!wakeTriggered) scheduleRetry(350)
  }
  override fun onPartialResults(partialResults: android.os.Bundle?) {
    // Wait for final recognition so the command after the wake phrase is not cut off.
  }
  override fun onEvent(eventType: Int, params: android.os.Bundle?) {}
}
