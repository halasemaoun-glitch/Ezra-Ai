package expo.modules.ezrahabibitts

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.StatFs
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class EzraHabibiTtsModule : Module() {
  @Volatile private var nativeLoaded = false

  private fun ensureNativeLoaded() {
    if (nativeLoaded) return
    synchronized(this) {
      if (nativeLoaded) return
      System.loadLibrary("audiocpp")
      System.loadLibrary("ezra_habibi_jni")
      nativeLoaded = true
    }
  }

  private external fun nativeInitialize(
    modelPath: String,
    referenceWavPath: String,
    transcript: String,
    dialect: String,
    threads: Int
  ): String

  private external fun nativeSynthesize(text: String, outputPath: String): String
  private external fun nativeShutdown()

  override fun definition() = ModuleDefinition {
    Name("EzraHabibiTts")

    AsyncFunction("getRuntimeInfo") {
      val loaded = try {
        ensureNativeLoaded()
        true
      } catch (_: UnsatisfiedLinkError) {
        false
      } catch (_: Exception) {
        false
      }
      mapOf(
        "available" to loaded,
        "runtime" to if (loaded) "audio.cpp Habibi/F5-TTS C ABI" else "Android native runtime not packaged",
        "androidApi" to Build.VERSION.SDK_INT
      )
    }

    AsyncFunction("getDeviceCapacity") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("Android application context is unavailable")
      val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val memoryInfo = ActivityManager.MemoryInfo().also { activityManager.getMemoryInfo(it) }
      val storageStats = StatFs(context.filesDir.absolutePath)
      val runtime = Runtime.getRuntime()

      mapOf(
        "totalRamBytes" to memoryInfo.totalMem,
        "availableRamBytes" to memoryInfo.availMem,
        "lowMemory" to memoryInfo.lowMemory,
        "runtimeMaxHeapBytes" to runtime.maxMemory(),
        "runtimeFreeHeapBytes" to runtime.freeMemory(),
        "availableAppStorageBytes" to storageStats.availableBytes,
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

    AsyncFunction("initialize") { modelPath: String, referenceWavPath: String, transcript: String, dialect: String, threads: Int ->
      ensureNativeLoaded()
      val model = File(modelPath)
      val reference = File(referenceWavPath)
      require(model.isFile && model.canRead()) { "Habibi GGUF model file is missing or unreadable." }
      require(reference.isFile && reference.canRead()) { "Approved male reference WAV is missing or unreadable." }
      require(transcript.isNotBlank()) { "The exact transcript of the reference recording is required." }
      val error = nativeInitialize(model.absolutePath, reference.absolutePath, transcript, dialect, threads)
      if (error.isNotEmpty()) throw IllegalStateException(error)
      mapOf("ready" to true, "engine" to "habibi-tts", "dialect" to dialect)
    }

    AsyncFunction("synthesize") { text: String, outputPath: String ->
      ensureNativeLoaded()
      require(text.isNotBlank()) { "Text to synthesize is empty." }
      val output = File(outputPath)
      output.parentFile?.mkdirs()
      val error = nativeSynthesize(text, output.absolutePath)
      if (error.isNotEmpty()) throw IllegalStateException(error)
      if (!output.isFile || output.length() <= 44L) throw IllegalStateException("Habibi did not create a valid WAV output.")
      mapOf("path" to output.absolutePath, "bytes" to output.length())
    }

    AsyncFunction("shutdown") {
      if (nativeLoaded) nativeShutdown()
      mapOf("ready" to false)
    }
  }
}
