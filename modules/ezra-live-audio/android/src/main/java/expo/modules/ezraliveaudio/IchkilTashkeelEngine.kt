package expo.modules.ezraliveaudio

import android.content.Context
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.LongBuffer
import java.security.MessageDigest
import java.text.Normalizer
import java.util.Locale

/**
 * Fully on-device Arabic diacritization using Ichkil v0.3.0 and ONNX Runtime.
 * The model is downloaded once, SHA-256 verified, and cached in app-private storage.
 */
internal class IchkilTashkeelEngine(context: Context) {
  private val cacheDir = File(context.filesDir, "ichkil-v0.3.0").apply { mkdirs() }
  private val modelFile = File(cacheDir, "model.onnx")
  private val configFile = File(cacheDir, "config.json")
  private val modelUrl = "https://huggingface.co/ichkil/ichkil/resolve/v0.3.0/model.onnx?download=true"
  private val configUrl = "https://huggingface.co/ichkil/ichkil/resolve/v0.3.0/config.json?download=true"
  private val expectedSha256 = "9779e1aca89cebc77a9b92037b7d700c422cdf6c3774d4883f4652f641f3f705"

  @Volatile private var session: OrtSession? = null
  @Volatile private var vocabulary: Map<String, Long>? = null
  private val environment: OrtEnvironment by lazy { OrtEnvironment.getEnvironment() }

  @Synchronized
  fun diacritize(input: String): String {
    val normalized = normalizeAndStrip(input)
    if (normalized.isEmpty()) return ""
    ensureSession()
    val chunks = splitText(normalized, 1024)
    return chunks.joinToString("") { inferChunk(it) }
  }

  @Synchronized
  private fun ensureSession() {
    if (session != null && vocabulary != null) return
    downloadIfNeeded(configFile, configUrl)
    val config = JSONObject(configFile.readText(Charsets.UTF_8))
    val sym2idJson = config.getJSONObject("sym2id")
    val vocab = HashMap<String, Long>(sym2idJson.length())
    val keys = sym2idJson.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      vocab[key] = sym2idJson.getLong(key)
    }
    require(vocab.containsKey("<unk>")) { "Ichkil vocabulary is missing <unk>." }
    require(config.optInt("num_tags", 16) == 16) { "Unsupported Ichkil label count." }
    downloadIfNeeded(modelFile, modelUrl)
    val actualHash = sha256(modelFile)
    require(actualHash.equals(expectedSha256, ignoreCase = true)) {
      "Ichkil model checksum mismatch; the cached model was rejected."
    }
    val options = OrtSession.SessionOptions().apply { setIntraOpNumThreads(2) }
    session = environment.createSession(modelFile.absolutePath, options)
    options.close()
    vocabulary = vocab
  }

  private fun downloadIfNeeded(file: File, source: String) {
    if (file.exists() && file.length() > 0L) return
    val temporary = File(file.parentFile, file.name + ".download")
    val connection = (URL(source).openConnection() as HttpURLConnection).apply {
      connectTimeout = 20000
      readTimeout = 90000
      instanceFollowRedirects = true
      setRequestProperty("User-Agent", "EZRA-AI/1.0 Ichkil-Android")
    }
    try {
      connection.connect()
      require(connection.responseCode in 200..299) {
        "Ichkil download failed (HTTP ${connection.responseCode})."
      }
      connection.inputStream.use { input ->
        temporary.outputStream().use { output -> input.copyTo(output) }
      }
      require(temporary.length() > 0L) { "Ichkil download returned an empty file." }
      if (file.exists()) file.delete()
      require(temporary.renameTo(file)) { "Could not save the Ichkil model cache." }
    } finally {
      connection.disconnect()
      if (temporary.exists()) temporary.delete()
    }
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(Locale.ROOT, it) }
  }

  private fun inferChunk(text: String): String {
    val chars = text.codePoints().toArray()
    if (chars.isEmpty()) return ""
    val vocab = vocabulary ?: error("Ichkil vocabulary is not loaded.")
    val unknown = vocab["<unk>"] ?: 1L
    val ids = LongArray(chars.size) { index ->
      vocab[String(Character.toChars(chars[index]))] ?: unknown
    }
    val tensor = OnnxTensor.createTensor(environment, LongBuffer.wrap(ids), longArrayOf(1L, ids.size.toLong()))
    tensor.use { inputTensor ->
      val result = (session ?: error("Ichkil model is not loaded."))
        .run(mapOf("input_ids" to inputTensor))
      result.use {
        val output = it.get("logits").orElseThrow { IllegalStateException("Ichkil returned no logits.") } as OnnxTensor
        output.use { logitsTensor ->
          val scores = logitsTensor.floatBuffer
          val out = StringBuilder(text.length + text.length / 2)
          for (i in chars.indices) {
            val cp = chars[i]
            out.appendCodePoint(cp)
            if (isArabicLetter(cp)) {
              val offset = i * 16
              var bestLabel = 0
              var bestScore = Float.NEGATIVE_INFINITY
              for (label in 0 until 16) {
                val score = scores.get(offset + label)
                if (score > bestScore) {
                  bestScore = score
                  bestLabel = label
                }
              }
              out.append(LABELS[bestLabel])
            }
          }
          return out.toString()
        }
      }
    }
  }

  private fun normalizeAndStrip(value: String): String {
    val mapped = Normalizer.normalize(value, Normalizer.Form.NFC)
      .replace('\u0671', '\u0627')
      .replace('\u06CC', '\u064A')
      .replace('\u06A9', '\u0643')
      .replace('\u06C1', '\u0647')
      .replace('\u00A0', ' ')
      .replace(Regex("[\\u200B-\\u200F\\uFEFF]"), "")
      .replace(Regex("[\\u0610-\\u061A\\u064B-\\u065F\\u0670\\u06D6-\\u06ED]"), "")
      .replace('\u0640'.toString(), "")
      .replace(Regex("\\s+"), " ")
      .trim()
    return mapped
  }

  private fun splitText(text: String, maxChars: Int): List<String> {
    val points = text.codePoints().toArray()
    if (points.size <= maxChars) return listOf(text)
    val chunks = ArrayList<String>()
    var start = 0
    while (start < points.size) {
      var end = minOf(start + maxChars, points.size)
      if (end < points.size) {
        var boundary = end
        while (boundary > start && !Character.isWhitespace(points[boundary - 1])) boundary--
        if (boundary > start) end = boundary
      }
      chunks.add(String(points, start, end - start))
      start = end
    }
    return chunks
  }

  private fun isArabicLetter(codePoint: Int): Boolean =
    codePoint in 0x0621..0x063A || codePoint in 0x0641..0x064A

  companion object {
    private val LABELS = arrayOf(
      "", "", "\u064E", "\u064F", "\u0650", "\u0652", "\u0651",
      "\u0651\u064E", "\u0651\u064F", "\u0651\u0650", "\u064B",
      "\u064C", "\u064D", "\u0651\u064B", "\u0651\u064C", "\u0651\u064D"
    )
  }
}
