package expo.modules.ezrawakeword

import android.accessibilityservice.AccessibilityService
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.accessibilityservice.AccessibilityServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class EzraAccessibilityService : AccessibilityService() {
  companion object {
    private const val ACTION_CHANNEL_ID = "ezra_accessibility_actions"
    private const val ACTION_NOTIFICATION_ID = 7312
    @Volatile private var instance: EzraAccessibilityService? = null

    fun isConnected(): Boolean = instance != null

    fun executeWakeCommand(context: Context, command: String): Boolean {
      if (instance == null) return false
      val value = normalize(command)
      val click = Regex("""^(?:اضغط|انقر|اكبس|اختار|حدد|tap|click|press)\s+(?:على\s+|علي\s+)?(?:زر\s+)?(.{1,80})$""").matchEntire(value)
      if (click != null) {
        val target = click.groupValues[1].trim()
        if (target.isBlank()) return false
        val sensitive = Regex("""(?:حذف|احذف|مسح|الغاء الحساب|شراء|اشتر|ادفع|دفع|تحويل|ارسال|ابعث|نشر|موافق|تاكيد|اتصال|اتصل|مكالمة|اشتراك|confirm|delete|remove|buy|purchase|pay|payment|transfer|send|post|submit|call|dial|subscribe)""")
          .containsMatchIn(target)
        if (sensitive) {
          val activePackage = instance?.rootInActiveWindow?.packageName?.toString().orEmpty()
          if (activePackage.isBlank()) {
            postActionResult(context, "لم أتمكن من تحديد التطبيق المفتوح بأمان. أعيدي الطلب من داخل التطبيق المطلوب.")
          } else {
            postConfirmationNotification(context, target, activePackage)
          }
        } else {
          val success = clickText(target)
          postActionResult(context, if (success) "تم تنفيذ الضغط على «$target»." else "لم أجد زراً قابلاً للضغط باسم «$target» في التطبيق المفتوح.")
        }
        return true
      }

      val typeText = Regex("""^(?:اكتب|ادخل|type)\s+(?:في\s+الحقل|داخل\s+الحقل|في\s+مربع\s+النص|في\s+خانه\s+(?:الرساله|الكتابه)|in\s+the\s+field)\s+([\s\S]{1,4000})$""").matchEntire(value)
      if (typeText != null) {
        val success = typeFocusedText(typeText.groupValues[1].trim())
        postActionResult(context, if (success) "تم إدخال النص في الحقل النشط. لم يتم إرسال أي رسالة." else "لم أجد حقلاً نشطاً قابلاً لتحرير النص.")
        return true
      }

      val scrollDown = Regex("""(?:مرر|اسحب|انزل|انزلي|scroll)\s*(?:الى\s*)?(?:الاسفل|للاسفل|لتحت|down)""").containsMatchIn(value)
      val scrollUp = Regex("""(?:مرر|اسحب|اصعد|اطلع|scroll)\s*(?:الى\s*)?(?:الاعلى|الاعلي|للاعلى|للاعلي|لفوق|up)""").containsMatchIn(value)
      if (scrollDown || scrollUp) {
        val success = scroll(if (scrollDown) "down" else "up")
        postActionResult(context, if (success) "تم تنفيذ التمرير." else "لم أجد قائمة قابلة للتمرير في التطبيق المفتوح.")
        return true
      }

      val action = when (value) {
        "ارجع", "رجوع", "عود", "back", "go back" -> "back"
        "الرئيسيه", "الشاشه الرئيسيه", "اذهب للرئيسيه", "home", "go home" -> "home"
        "افتح الاشعارات", "اعرض الاشعارات", "اسحب الاشعارات", "notifications" -> "notifications"
        "الاعدادات السريعه", "افتح الاعدادات السريعه", "quick settings" -> "quick_settings"
        else -> return false
      }
      val success = globalAction(action)
      postActionResult(context, if (success) "تم تنفيذ أمر التنقل." else "تعذّر تنفيذ أمر التنقل.")
      return true
    }

    fun postActionResult(context: Context, message: String) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      ensureNotificationChannel(context, manager)
      val builder = notificationBuilder(context)
        .setSmallIcon(android.R.drawable.ic_menu_view)
        .setContentTitle("EZRA نفّذ الأمر")
        .setContentText(message.take(120))
        .setAutoCancel(true)
        .setVisibility(Notification.VISIBILITY_PRIVATE)
      manager.notify(ACTION_NOTIFICATION_ID, builder.build())
    }

    private fun postConfirmationNotification(context: Context, target: String, expectedPackage: String) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      ensureNotificationChannel(context, manager)
      val intent = Intent(context, EzraAccessibilityActionReceiver::class.java).apply {
        action = EzraAccessibilityActionReceiver.ACTION_CONFIRM
        putExtra(EzraAccessibilityActionReceiver.EXTRA_TARGET, target)
        putExtra(EzraAccessibilityActionReceiver.EXTRA_EXPECTED_PACKAGE, expectedPackage)
      }
      val pendingIntent = PendingIntent.getBroadcast(
        context,
        31 * target.hashCode() + expectedPackage.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
      )
      val action = Notification.Action.Builder(android.R.drawable.ic_menu_view, "تأكيد", pendingIntent).build()
      val notification = notificationBuilder(context)
        .setSmallIcon(android.R.drawable.ic_menu_view)
        .setContentTitle("تأكيد إجراء EZRA")
        .setContentText("هل تريدين الضغط على «$target»؟")
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .setAutoCancel(true)
        .addAction(action)
        .build()
      manager.notify(ACTION_NOTIFICATION_ID, notification)
    }

    private fun ensureNotificationChannel(context: Context, manager: NotificationManager) {
      if (Build.VERSION.SDK_INT >= 26) {
        manager.createNotificationChannel(
          NotificationChannel(ACTION_CHANNEL_ID, "إجراءات EZRA", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "نتائج أو تأكيدات أوامر التحكم بالتطبيقات"
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
          }
        )
      }
    }

    private fun notificationBuilder(context: Context): Notification.Builder =
      if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, ACTION_CHANNEL_ID)
      else {
        @Suppress("DEPRECATION")
        Notification.Builder(context)
      }

    fun clickText(target: String, expectedPackage: String? = null): Boolean {
      val service = instance ?: return false
      val normalizedTarget = normalize(target)
      if (normalizedTarget.isBlank()) return false
      return service.runOnMain {
        val root = service.rootInActiveWindow ?: return@runOnMain false
        if (!expectedPackage.isNullOrBlank() && root.packageName?.toString() != expectedPackage) return@runOnMain false
        val match = service.findMatchingNode(root, normalizedTarget) ?: return@runOnMain false
        service.clickNodeOrClickableParent(match)
      }
    }

    fun typeFocusedText(text: String): Boolean {
      val service = instance ?: return false
      if (text.isBlank() || text.length > 4000) return false
      return service.runOnMain {
        val root = service.rootInActiveWindow ?: return@runOnMain false
        val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return@runOnMain false
        if (!focused.isEditable || !focused.isEnabled) return@runOnMain false
        val arguments = Bundle().apply {
          putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
      }
    }

    fun scroll(direction: String): Boolean {
      val service = instance ?: return false
      val forward = direction.equals("down", true) || direction.equals("forward", true) ||
        direction == "down" || direction == "للأسفل" || direction == "لتحت"
      val action = if (forward) AccessibilityNodeInfo.ACTION_SCROLL_FORWARD else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
      return service.runOnMain {
        val root = service.rootInActiveWindow ?: return@runOnMain false
        val scrollable = service.findScrollableNode(root) ?: root
        scrollable.performAction(action)
      }
    }

    fun globalAction(action: String): Boolean {
      val service = instance ?: return false
      val androidAction = when (action.lowercase(Locale.ROOT)) {
        "back", "رجوع", "ارجع" -> AccessibilityService.GLOBAL_ACTION_BACK
        "home", "الرئيسية", "الشاشة الرئيسية" -> AccessibilityService.GLOBAL_ACTION_HOME
        "notifications", "الإشعارات" -> AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS
        "quick_settings", "الإعدادات السريعة" -> AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS
        else -> return false
      }
      return service.runOnMain { service.performGlobalAction(androidAction) }
    }

    private fun normalize(value: CharSequence?): String = value?.toString()
      ?.lowercase(Locale.ROOT)
      ?.replace(Regex("[\\u064B-\\u065F\\u0670\\u0640]"), "")
      ?.replace(Regex("[إأآ]"), "ا")
      ?.replace("ى", "ي")
      ?.replace("ة", "ه")
      ?.replace(Regex("\\s+"), " ")
      ?.trim().orEmpty()
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
    serviceInfo = serviceInfo.apply {
      eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
        AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or
        AccessibilityEvent.TYPE_VIEW_SCROLLED
      feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
      notificationTimeout = 100
      flags = flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
    }
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    // Intentionally do not collect, store, or transmit screen text or accessibility events.
  }

  override fun onInterrupt() = Unit

  override fun onDestroy() {
    if (instance === this) instance = null
    super.onDestroy()
  }

  private fun runOnMain(block: () -> Boolean): Boolean {
    if (Looper.myLooper() == Looper.getMainLooper()) return block()
    val result = AtomicBoolean(false)
    val latch = CountDownLatch(1)
    Handler(Looper.getMainLooper()).post {
      try { result.set(block()) } finally { latch.countDown() }
    }
    return latch.await(2500, TimeUnit.MILLISECONDS) && result.get()
  }

  private fun findMatchingNode(root: AccessibilityNodeInfo, target: String): AccessibilityNodeInfo? {
    val queue = ArrayDeque<AccessibilityNodeInfo>()
    queue.add(root)
    var visited = 0
    while (queue.isNotEmpty() && visited++ < 600) {
      val node = queue.removeFirst()
      val text = normalize(node.text)
      val description = normalize(node.contentDescription)
      if (text == target || description == target || text.contains(target) || description.contains(target)) return node
      for (index in 0 until node.childCount) node.getChild(index)?.let(queue::add)
    }
    return null
  }

  private fun findScrollableNode(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    val queue = ArrayDeque<AccessibilityNodeInfo>()
    queue.add(root)
    var visited = 0
    while (queue.isNotEmpty() && visited++ < 600) {
      val node = queue.removeFirst()
      if (node.isScrollable) return node
      for (index in 0 until node.childCount) node.getChild(index)?.let(queue::add)
    }
    return null
  }

  private fun clickNodeOrClickableParent(node: AccessibilityNodeInfo): Boolean {
    var current: AccessibilityNodeInfo? = node
    repeat(8) {
      val candidate = current ?: return false
      if (candidate.isEnabled && candidate.isClickable) {
        return candidate.performAction(AccessibilityNodeInfo.ACTION_CLICK)
      }
      current = candidate.parent
    }
    return false
  }
}
