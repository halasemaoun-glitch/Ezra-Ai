package expo.modules.ezrasupertonic3

import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import ai.onnxruntime.OrtEnvironment
import expo.modules.ezrasupertonic3.engine.Helper
import expo.modules.ezrasupertonic3.engine.Style
import expo.modules.ezrasupertonic3.engine.TextToSpeech
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Downloads a pinned Supertonic 3 ONNX snapshot into app-private storage. */
class EzraSupertonic3Module : Module() {
  private val cancelled = AtomicBoolean(false)
  @Volatile private var downloading = false
  private val downloadExecutor = Executors.newSingleThreadExecutor()
  private val inferenceExecutor = Executors.newSingleThreadExecutor()
  private val mainHandler = Handler(Looper.getMainLooper())
  @Volatile private var ttsEngine: TextToSpeech? = null
  @Volatile private var voiceStyle: Style? = null
  @Volatile private var ortEnvironment: OrtEnvironment? = null
  @Volatile private var mediaPlayer: MediaPlayer? = null

  private data class Asset(val relativePath: String, val expectedSha256: String? = null)

  private val revision = "aafc6e32416a594460b32413efc49d7fe4ce6d46"
  private val repository = "supertone-oss-archive/supertonic-3"
  private val assets = listOf(
    Asset("onnx/duration_predictor.onnx"),
    Asset("onnx/text_encoder.onnx"),
    Asset("onnx/vector_estimator.onnx"),
    Asset("onnx/vocoder.onnx"),
    Asset("onnx/tts.json"),
    Asset("onnx/unicode_indexer.json"),
    Asset("voice_styles/M1.json")
  )

  private fun modelDirectory(): File {
    val context = appContext.reactContext
      ?: throw IllegalStateException("Android application context is unavailable")
    return File(context.filesDir, "models/supertonic3")
  }

  private fun targetFile(asset: Asset): File {
    val root = modelDirectory().canonicalFile
    val target = File(root, asset.relativePath).canonicalFile
    require(target.path.startsWith(root.path + File.separator)) { "Invalid model asset path" }
    return target
  }

  private fun markerFile(file: File) = File(file.parentFile, file.name + ".complete")

  private fun isComplete(file: File): Boolean {
    if (!file.isFile || file.length() <= 0L) return false
    val marker = markerFile(file)
    if (!marker.isFile) return false
    return runCatching { marker.readText().trim().matches(Regex("[a-fA-F0-9]{64}")) }.getOrDefault(false)
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(1024 * 1024)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private fun status(): Map<String, Any> {
    val root = modelDirectory()
    val missing = assets.filter { asset ->
      val file = targetFile(asset)
      !isComplete(file) ||
        (asset.expectedSha256 != null && sha256(file) != asset.expectedSha256)
    }.map { it.relativePath }
    val bytes = assets.sumOf { asset ->
      val file = targetFile(asset)
      if (file.isFile) file.length() else 0L
    }
    return mapOf(
      "installed" to missing.isEmpty(),
      "downloading" to downloading,
      "downloadedBytes" to bytes,
      "totalBytes" to assets.sumOf { asset -> targetFile(asset).length() }.coerceAtLeast(bytes),
      "modelDirectory" to root.absolutePath,
      "missingFiles" to missing
    )
  }

  private fun downloadAsset(asset: Asset, index: Int, total: Int) {
    if (cancelled.get()) throw InterruptedException("Model download cancelled")
    val destination = targetFile(asset)
    destination.parentFile?.mkdirs()
    val partial = File(destination.parentFile, destination.name + ".part")
    var offset = if (partial.exists()) partial.length() else 0L
    val url = URL("https://huggingface.co/$repository/resolve/$revision/${asset.relativePath}?download=true")
    val connection = (url.openConnection() as HttpURLConnection).apply {
      connectTimeout = 30_000
      readTimeout = 60_000
      instanceFollowRedirects = true
      if (offset > 0L) setRequestProperty("Range", "bytes=$offset-")
    }
    try {
      connection.connect()
      val response = connection.responseCode
      if (response != HttpURLConnection.HTTP_OK && response != HttpURLConnection.HTTP_PARTIAL) {
        throw IllegalStateException("Download failed for ${asset.relativePath} (HTTP $response)")
      }
      if (offset > 0L && response != HttpURLConnection.HTTP_PARTIAL) {
        partial.delete()
        offset = 0L
      }
      val append = offset > 0L && response == HttpURLConnection.HTTP_PARTIAL
      val contentLength = connection.contentLengthLong.coerceAtLeast(0L)
      val expectedFileBytes = if (append) offset + contentLength else contentLength
      var fileBytes = if (append) offset else 0L
      var lastEventAt = 0L
      connection.inputStream.use { input ->
        FileOutputStream(partial, append).use { output ->
          val buffer = ByteArray(1024 * 256)
          while (true) {
            if (cancelled.get()) throw InterruptedException("Model download cancelled")
            val count = input.read(buffer)
            if (count < 0) break
            output.write(buffer, 0, count)
            fileBytes += count
            val now = SystemClock.elapsedRealtime()
            if (now - lastEventAt >= 250L) {
              lastEventAt = now
              sendEvent("onDownloadProgress", mapOf(
                "file" to asset.relativePath,
                "fileIndex" to index,
                "fileCount" to total,
                "downloadedBytes" to fileBytes,
                "totalBytes" to expectedFileBytes,
                "fileProgress" to if (expectedFileBytes > 0L) fileBytes.toDouble() / expectedFileBytes else 0.0
              ))
            }
          }
          output.fd.sync()
        }
      }
      if (!partial.isFile || partial.length() <= 0L) {
        throw IllegalStateException("Downloaded file is empty: ${asset.relativePath}")
      }
      if (expectedFileBytes > 0L && partial.length() != expectedFileBytes) {
        throw IllegalStateException("Incomplete download for ${asset.relativePath}; retry to resume")
      }
      if (asset.expectedSha256 != null && sha256(partial) != asset.expectedSha256) {
        throw IllegalStateException("SHA-256 verification failed for ${asset.relativePath}")
      }
      if (destination.exists() && !destination.delete()) {
        throw IllegalStateException("Cannot replace existing model file: ${asset.relativePath}")
      }
      if (!partial.renameTo(destination)) {
        throw IllegalStateException("Cannot finalize model file: ${asset.relativePath}")
      }
      val marker = markerFile(destination)
      val markerTemp = File(marker.parentFile, marker.name + ".tmp")
      markerTemp.writeText(sha256(destination))
      if (marker.exists()) marker.delete()
      if (!markerTemp.renameTo(marker)) {
        destination.delete()
        throw IllegalStateException("Cannot finalize model integrity marker: ${asset.relativePath}")
      }
    } finally {
      connection.disconnect()
    }
  }

  private fun localFile(path: String): File {
    val uri = Uri.parse(path)
    return if (uri.scheme == "file") File(uri.path ?: path) else File(path)
  }

  private fun onInferenceFailure(promise: Promise, error: Exception) {
    promise.reject("ERR_SUPERTONIC_INFERENCE", error.message ?: "Supertonic inference failed", error)
  }

  override fun definition() = ModuleDefinition {
    Name("EzraSupertonic3")
    Events("onDownloadProgress", "onDownloadError", "onDownloadComplete", "onPlaybackFinished", "onPlaybackError")

    AsyncFunction("getModelStatus") { status() }

    AsyncFunction("downloadModel") { promise: Promise ->
      if (downloading) {
        promise.reject("ERR_SUPERTONIC_DOWNLOAD_ACTIVE", "Supertonic 3 download is already running", null)
        return@AsyncFunction
      }
      downloading = true
      cancelled.set(false)
      downloadExecutor.execute {
        try {
          assets.forEachIndexed { index, asset ->
            val file = targetFile(asset)
            if (!isComplete(file)) downloadAsset(asset, index + 1, assets.size)
          }
          val result = status()
          if (result["installed"] != true) {
            throw IllegalStateException("Model download finished but required files are missing")
          }
          sendEvent("onDownloadComplete", result)
          promise.resolve(result)
        } catch (error: Exception) {
          sendEvent("onDownloadError", mapOf("message" to (error.message ?: "Unknown download error")))
          promise.reject("ERR_SUPERTONIC_DOWNLOAD", error.message, error)
        } finally {
          downloading = false
        }
      }
    }

    AsyncFunction("initialize") { promise: Promise ->
      inferenceExecutor.execute {
        try {
          val root = modelDirectory()
          val onnxDir = File(root, "onnx")
          val voiceFile = File(root, "voice_styles/M1.json")
          require(assets.all { isComplete(targetFile(it)) }) {
            "Supertonic model files are not fully installed. Download the voice first."
          }
          val env = ortEnvironment ?: OrtEnvironment.getEnvironment().also { ortEnvironment = it }
          val nextEngine = Helper.loadTextToSpeech(onnxDir.absolutePath, false, env)
          val nextStyle = Helper.loadVoiceStyle(listOf(voiceFile.absolutePath), true, env)
          val previousEngine = ttsEngine
          val previousStyle = voiceStyle
          ttsEngine = nextEngine
          voiceStyle = nextStyle
          runCatching { previousStyle?.close() }
          runCatching { previousEngine?.close() }
          promise.resolve(mapOf("ready" to true, "engine" to "supertonic3", "language" to "ar", "voice" to "M1"))
        } catch (error: Exception) {
          onInferenceFailure(promise, error)
        }
      }
    }

    AsyncFunction("synthesize") { text: String, language: String, outputPath: String, speed: Double, promise: Promise ->
      inferenceExecutor.execute {
        try {
          require(text.isNotBlank()) { "Text to synthesize is empty." }
          require(language == "ar" || language == "en") { "Supertonic language must be ar or en." }
          val engine = ttsEngine ?: throw IllegalStateException("Supertonic is not initialized.")
          val style = voiceStyle ?: throw IllegalStateException("Supertonic M1 voice is not loaded.")
          val env = ortEnvironment ?: throw IllegalStateException("ONNX Runtime is not initialized.")
          val destination = localFile(outputPath)
          destination.parentFile?.mkdirs()
          val result = engine.call(text, language, style, 8, speed.toFloat(), 0.25f, env)
          val audio = result.wav ?: throw IllegalStateException("Supertonic returned no audio.")
          Helper.writeWavFile(destination.absolutePath, audio, engine.sampleRate)
          require(destination.isFile && destination.length() > 44L) { "Supertonic WAV output is missing or invalid." }
          promise.resolve(mapOf(
            "path" to destination.absolutePath,
            "bytes" to destination.length(),
            "sampleRate" to engine.sampleRate,
            "durationSeconds" to result.duration.firstOrNull()?.toDouble().orZero()
          ))
        } catch (error: Exception) {
          onInferenceFailure(promise, error)
        }
      }
    }

    AsyncFunction("playAudio") { path: String, promise: Promise ->
      val audioFile = localFile(path)
      require(audioFile.isFile && audioFile.canRead() && audioFile.length() > 44L) {
        "Generated Supertonic WAV file is missing or invalid."
      }
      mainHandler.post {
        try {
          mediaPlayer?.runCatching { stop() }
          mediaPlayer?.release()
          val player = MediaPlayer.create(appContext.reactContext, Uri.fromFile(audioFile))
            ?: throw IllegalStateException("Android could not open the generated WAV.")
          mediaPlayer = player
          player.setOnCompletionListener {
            sendEvent("onPlaybackFinished", mapOf("path" to audioFile.absolutePath))
            it.release()
            if (mediaPlayer === it) mediaPlayer = null
          }
          player.setOnErrorListener { failedPlayer, what, extra ->
            sendEvent("onPlaybackError", mapOf("path" to audioFile.absolutePath, "what" to what, "extra" to extra))
            failedPlayer.release()
            if (mediaPlayer === failedPlayer) mediaPlayer = null
            true
          }
          player.start()
          promise.resolve(mapOf("playing" to true))
        } catch (error: Exception) {
          sendEvent("onPlaybackError", mapOf("message" to (error.message ?: "Playback failed")))
          promise.reject("ERR_SUPERTONIC_PLAYBACK", error.message, error)
        }
      }
    }

    AsyncFunction("stopAudio") { promise: Promise ->
      mainHandler.post {
        runCatching { mediaPlayer?.stop() }
        mediaPlayer?.release()
        mediaPlayer = null
        promise.resolve(mapOf("stopped" to true))
      }
    }

    AsyncFunction("shutdown") { promise: Promise ->
      inferenceExecutor.execute {
        runCatching { voiceStyle?.close() }
        runCatching { ttsEngine?.close() }
        voiceStyle = null
        ttsEngine = null
        promise.resolve(mapOf("ready" to false))
      }
    }


    AsyncFunction("cancelDownload") {
      cancelled.set(true)
      mapOf("cancelled" to downloading)
    }

    OnDestroy {
      cancelled.set(true)
      downloadExecutor.shutdownNow()
      inferenceExecutor.shutdownNow()
      mainHandler.post {
        runCatching { mediaPlayer?.stop() }
        mediaPlayer?.release()
        mediaPlayer = null
      }
      runCatching { voiceStyle?.close() }
      runCatching { ttsEngine?.close() }
    }
  }
}

private fun Double?.orZero(): Double = this ?: 0.0
