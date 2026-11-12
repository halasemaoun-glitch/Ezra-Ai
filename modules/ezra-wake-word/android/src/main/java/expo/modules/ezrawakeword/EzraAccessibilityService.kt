package expo.modules.ezrawakeword

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
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
    @Volatile private var instance: EzraAccessibilityService? = null

    fun isConnected(): Boolean = instance != null

    fun clickText(target: String): Boolean {
      val service = instance ?: return false
      val normalizedTarget = normalize(target)
      if (normalizedTarget.isBlank()) return false
      return service.runOnMain {
        val root = service.rootInActiveWindow ?: return@runOnMain false
        val match = service.findMatchingNode(root, normalizedTarget) ?: return@runOnMain false
        service.clickNodeOrClickableParent(match)
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
