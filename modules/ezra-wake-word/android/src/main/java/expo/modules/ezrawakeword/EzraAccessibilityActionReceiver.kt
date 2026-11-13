package expo.modules.ezrawakeword

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class EzraAccessibilityActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != ACTION_CONFIRM) return
    val target = intent.getStringExtra(EXTRA_TARGET).orEmpty()
    val expectedPackage = intent.getStringExtra(EXTRA_EXPECTED_PACKAGE).orEmpty()
    if (target.isBlank() || expectedPackage.isBlank()) return
    val success = EzraAccessibilityService.clickText(target, expectedPackage)
    EzraAccessibilityService.postActionResult(
      context,
      if (success) "تم تنفيذ الضغط على «$target»." else "تعذّر العثور على «$target» أو الضغط عليه."
    )
  }

  companion object {
    const val ACTION_CONFIRM = "com.halasemaoun.ezra.CONFIRM_ACCESSIBILITY_ACTION"
    const val EXTRA_TARGET = "accessibility_action_target"
    const val EXTRA_EXPECTED_PACKAGE = "accessibility_action_expected_package"
  }
}
