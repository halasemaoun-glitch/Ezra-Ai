package expo.modules.ezrawakeword

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.app.KeyguardManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import java.util.Locale

class EzraWakeWordService : Service(), RecognitionListener {
  companion object {
    const val PREFERENCES = "ezra_wake_word"
    const val PENDING_COMMAND = "pending_command"
    private const val CHANNEL_ID = "ezra_voice_assistant"
    private const val WAKE_CHANNEL_ID = "ezra_wake_command"
    private const val NOTIFICATION_ID = 7301
    private const val WAKE_NOTIFICATION_ID = 7302
    private const val WAKE_OPEN_ACTION = "com.halasemaoun.ezra.OPEN_FROM_WAKE_WORD"
  }

  private val handler = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var stopping = false
  private var wakeTriggered = false
  private var recognitionActive = false
  private var preferOnDeviceRecognition = true
  private var usingOnDeviceRecognition = false
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onCreate() {
    super.onCreate()
    val powerManager = getSystemService(POWER_SERVICE) as PowerManager
    wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "EZRA:WakeWord")
      .apply {
        setReferenceCounted(false)
        acquire()
      }
    createNotificationChannel()
    createWakeNotificationChannel()
    startAsForeground()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    stopping = false
    if (!wakeTriggered && !recognitionActive) startRecognition()
    return START_STICKY
  }

  override fun onDestroy() {
    stopping = true
    handler.removeCallbacksAndMessages(null)
    recognizer?.setRecognitionListener(null)
    recognizer?.cancel()
    recognizer?.destroy()
    recognizer = null
    if (wakeLock?.isHeld == true) wakeLock?.release()
    wakeLock = null
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
    if (stopping || wakeTriggered || recognitionActive) return
    if (!SpeechRecognizer.isRecognitionAvailable(this)) {
      scheduleRetry(2500)
      return
    }
    try {
      if (recognizer == null) {
        val canUseOnDevice = Build.VERSION.SDK_INT >= 31 && preferOnDeviceRecognition &&
          SpeechRecognizer.isOnDeviceRecognitionAvailable(this)
        usingOnDeviceRecognition = canUseOnDevice
        val speechRecognizer = if (canUseOnDevice) {
          SpeechRecognizer.createOnDeviceSpeechRecognizer(this)
        } else {
          SpeechRecognizer.createSpeechRecognizer(this)
        }
        speechRecognizer.setRecognitionListener(this)
        recognizer = speechRecognizer
      }
      val request = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        // Android's web-search model is more reliable for short wake phrases such as 'EZRA'.
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_WEB_SEARCH)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar")
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "ar-DZ")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
        // Keep a longer phrase window so the wake phrase and the following command arrive together.
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2100L)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
      }
      recognitionActive = true
      recognizer?.startListening(request)
    } catch (_: Exception) {
      recognitionActive = false
      scheduleRetry(1800)
    }
  }

  private fun scheduleRetry(delayMs: Long) {
    recognitionActive = false
    if (!stopping && !wakeTriggered) {
      handler.removeCallbacksAndMessages(null)
      handler.postDelayed({ startRecognition() }, delayMs)
    }
  }

  private fun normalizeRecognitionText(value: String): String = value.lowercase(Locale.ROOT)
    .replace(Regex("[\\u064B-\\u065F\\u0670\\u0640]"), "")
    .replace('إ', 'ا').replace('أ', 'ا').replace('آ', 'ا')
    .replace('ى', 'ي')
    .replace(Regex("[^\\p{L}\\p{N}\\s]"), " ")
    .replace(Regex("\\s+"), " ")
    .trim()

  private fun inspectResults(results: ArrayList<String>?) {
    if (stopping || wakeTriggered || results.isNullOrEmpty()) return
    val wakePattern = Regex("(?<![\\p{L}\\p{N}])(?:يا\\s*)?(?:ازرا|ايزرا|عذرا|ezra)(?![\\p{L}\\p{N}])")
    val recognized = results.firstOrNull { candidate ->
      wakePattern.containsMatchIn(normalizeRecognitionText(candidate))
    }?.trim().orEmpty()
    if (recognized.isEmpty()) return

    wakeTriggered = true
    val command = recognized
      .replaceFirst(Regex("(?i)(?:(?:يا|hey|okay|ok)\\s*)?(?:(?:إ|ا)?زرا|ايزرا|عذرا|ezra)"), "")
      .trim(' ', ',', '،', '.', '!', '?', '؟', ':', ';', '؛', '-')
    getSharedPreferences(PREFERENCES, MODE_PRIVATE)
      .edit()
      .putString(PENDING_COMMAND, if (command.isEmpty()) "__EZRA_WAKE_ONLY__" else command)
      .apply()

    handler.post {
      val powerManager = getSystemService(POWER_SERVICE) as PowerManager
      val keyguardManager = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
      val screenLockedOrOff = keyguardManager.isKeyguardLocked || !powerManager.isInteractive
      if (screenLockedOrOff) {
        // Android restricts background interaction and activity launches over the lock screen.
        // Keep the recognized command and let the user explicitly resume from a notification.
        postWakeCommandNotification()
      } else if (EzraAccessibilityService.executeWakeCommand(this, command)) {
        // Execute supported accessibility commands against the app that is currently visible,
        // without bringing EZRA to the foreground and stealing that app's window focus.
        getSharedPreferences(PREFERENCES, MODE_PRIVATE).edit().remove(PENDING_COMMAND).apply()
      } else {
        openPendingCommand()
      }
      stopSelf()
    }
  }

  private fun createWakeNotificationChannel() {
    if (Build.VERSION.SDK_INT >= 26) {
      val channel = NotificationChannel(
        WAKE_CHANNEL_ID,
        "طلبات EZRA الصوتية",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "إشعار لاستكمال الأمر الصوتي عندما تكون الشاشة مقفلة"
        lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        setShowBadge(false)
      }
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  private fun buildWakeLaunchIntent(): PendingIntent? {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    launchIntent.action = WAKE_OPEN_ACTION
    launchIntent.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_CLEAR_TOP or
        Intent.FLAG_ACTIVITY_SINGLE_TOP
    )
    return PendingIntent.getActivity(
      this,
      WAKE_NOTIFICATION_ID,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or
        (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
    )
  }

  private fun postWakeCommandNotification() {
    val pendingIntent = buildWakeLaunchIntent()
    if (pendingIntent == null) return
    val builder = if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(this, WAKE_CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    val notification = builder
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle("لديك طلب صوتي من EZRA")
      .setContentText("افتح EZRA لمتابعة طلبك")
      .setContentIntent(pendingIntent)
      .setAutoCancel(true)
      .setCategory(Notification.CATEGORY_MESSAGE)
      .setVisibility(Notification.VISIBILITY_PRIVATE)
      .build()
    getSystemService(NotificationManager::class.java)
      .notify(WAKE_NOTIFICATION_ID, notification)
  }

  private fun openPendingCommand() {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return
    launchIntent.action = WAKE_OPEN_ACTION
    launchIntent.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_CLEAR_TOP or
        Intent.FLAG_ACTIVITY_SINGLE_TOP
    )
    startActivity(launchIntent)
  }

  override fun onReadyForSpeech(params: android.os.Bundle?) {}
  override fun onBeginningOfSpeech() {}
  override fun onRmsChanged(rmsdB: Float) {}
  override fun onBufferReceived(buffer: ByteArray?) {}
  override fun onEndOfSpeech() {}
  override fun onError(error: Int) {
    recognitionActive = false
    if (stopping || wakeTriggered) return
    if (usingOnDeviceRecognition && preferOnDeviceRecognition &&
      (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED ||
        error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE ||
        error == SpeechRecognizer.ERROR_SERVER)) {
      // Some phones expose on-device recognition but do not have an Arabic model installed.
      // Fall back to the platform recognizer rather than silently losing wake-word support.
      preferOnDeviceRecognition = false
      handler.post {
        recognizer?.setRecognitionListener(null)
        recognizer?.cancel()
        recognizer?.destroy()
        recognizer = null
        usingOnDeviceRecognition = false
        scheduleRetry(250)
      }
      return
    }
    if (error == SpeechRecognizer.ERROR_CLIENT || error == SpeechRecognizer.ERROR_SERVER) {
      handler.post {
        recognizer?.setRecognitionListener(null)
        recognizer?.cancel()
        recognizer?.destroy()
        recognizer = null
        scheduleRetry(900)
      }
    } else {
      scheduleRetry(if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) 1600 else 700)
    }
  }
  override fun onResults(results: android.os.Bundle?) {
    recognitionActive = false
    inspectResults(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION))
    if (!wakeTriggered) scheduleRetry(450)
  }
  override fun onPartialResults(partialResults: android.os.Bundle?) {
    // Wait for final recognition so the command after the wake phrase is not cut off.
  }
  override fun onEvent(eventType: Int, params: android.os.Bundle?) {}
}
