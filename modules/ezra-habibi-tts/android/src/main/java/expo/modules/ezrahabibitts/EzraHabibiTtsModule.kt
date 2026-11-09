package expo.modules.ezrahabibitts

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import ai.onnxruntime.OrtEnvironment
import java.io.File

class EzraHabibiTtsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EzraHabibiTts")

    AsyncFunction("getRuntimeInfo") {
      // Initialises the native ONNX Runtime library without downloading or
      // loading the multi-gigabyte Habibi model into memory.
      OrtEnvironment.getEnvironment()
      mapOf(
        "available" to true,
        "runtime" to "ONNX Runtime Android 1.22.0",
        "androidApi" to Build.VERSION.SDK_INT
      )
    }

    AsyncFunction("inspectModelFile") { path: String ->
      val file = File(path)
      mapOf(
        "exists" to file.exists(),
        "readable" to (file.exists() && file.canRead()),
        "bytes" to (if (file.exists()) file.length() else 0L),
        "absolutePath" to file.absolutePath
      )
    }
  }
}
