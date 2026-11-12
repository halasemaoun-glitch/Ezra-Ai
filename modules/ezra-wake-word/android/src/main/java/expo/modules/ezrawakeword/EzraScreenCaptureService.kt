package expo.modules.ezrawakeword

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

class EzraScreenCaptureService : Service() {
  companion object {
    const val ACTION_CAPTURE = "com.halasemaoun.ezra.CAPTURE_SCREEN"
    const val EXTRA_RESULT_CODE = "screen_capture_result_code"
    const val EXTRA_RESULT_DATA = "screen_capture_result_data"
    const val PREFERENCES = "ezra_screen_capture"
    const val RESULT = "last_result"
    private const val CHANNEL_ID = "ezra_screen_capture"
    private const val NOTIFICATION_ID = 7310
  }

  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= 26) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "التقاط الشاشة من EZRA",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "إشعار مؤقت أثناء حفظ لقطة الشاشة"
        setShowBadge(false)
      }
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, 0) ?: 0
    val resultData = if (Build.VERSION.SDK_INT >= 33) {
      intent?.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent?.getParcelableExtra(EXTRA_RESULT_DATA)
    }
    if (resultData == null) {
      saveResult("ERROR: لم يصل إذن التقاط الشاشة من Android.")
      stopSelf(startId)
      return START_NOT_STICKY
    }

    val notification = (if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    })
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setContentTitle("EZRA يلتقط لقطة الشاشة")
      .setContentText("سيتم حفظ الصورة في معرض الصور")
      .setOngoing(true)
      .build()

    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    Thread {
      val result = try {
        EzraScreenCapture.captureToGallery(this, resultCode, resultData)
      } catch (error: Exception) {
        "ERROR: ${error.message ?: "تعذّر التقاط الشاشة."}"
      }
      saveResult(result)
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf(startId)
    }.start()
    return START_NOT_STICKY
  }

  private fun saveResult(value: String) {
    getSharedPreferences(PREFERENCES, MODE_PRIVATE)
      .edit()
      .putString(RESULT, value)
      .apply()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
