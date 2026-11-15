package expo.modules.ezrasupertonic3

import android.os.SystemClock
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/** Downloads a pinned Supertonic 3 ONNX snapshot into app-private storage. */
class EzraSupertonic3Module : Module() {
  private val cancelled = AtomicBoolean(false)
  @Volatile private var downloading = false

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
      !file.isFile || file.length() <= 0L ||
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
      "totalBytes" to 0L,
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
    } finally {
      connection.disconnect()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("EzraSupertonic3")
    Events("onDownloadProgress", "onDownloadError", "onDownloadComplete")

    AsyncFunction("getModelStatus") { status() }.runOnQueue(Queues.IO)

    AsyncFunction("downloadModel") {
      if (downloading) throw IllegalStateException("Supertonic 3 download is already running")
      downloading = true
      cancelled.set(false)
      try {
        assets.forEachIndexed { index, asset ->
          val file = targetFile(asset)
          if (!file.isFile || file.length() <= 0L) downloadAsset(asset, index + 1, assets.size)
        }
        val result = status()
        if (result["installed"] != true) {
          throw IllegalStateException("Model download finished but required files are missing")
        }
        sendEvent("onDownloadComplete", result)
        result
      } catch (error: Exception) {
        sendEvent("onDownloadError", mapOf("message" to (error.message ?: "Unknown download error")))
        throw error
      } finally {
        downloading = false
      }
    }.runOnQueue(Queues.IO)

    AsyncFunction("cancelDownload") {
      cancelled.set(true)
      mapOf("cancelled" to downloading)
    }.runOnQueue(Queues.IO)
  }
}
