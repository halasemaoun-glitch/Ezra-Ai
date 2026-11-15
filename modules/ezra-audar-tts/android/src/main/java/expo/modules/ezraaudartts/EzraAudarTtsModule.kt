package expo.modules.ezraaudartts

import android.app.ActivityManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.StatFs
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.IntBuffer
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.min

class EzraAudarTtsModule : Module() {
  @Volatile private var nativeLoaded = false
  @Volatile private var ready = false
  private var ortEnvironment: OrtEnvironment? = null
  private var decoderSession: OrtSession? = null
  private var decoderInputName: String? = null
  private var decoderOutputName: String? = null
  private var referenceText = ""
  private var referenceCodes = IntArray(0)
  private var mediaPlayer: MediaPlayer? = null
  private var mediaPlayerFile: File? = null
  @Volatile private var playbackAudioManager: AudioManager? = null
  @Volatile private var previousPlaybackAudioMode: Int? = null

  private fun restorePlaybackAudioRoute() {
    val manager = playbackAudioManager
    if (manager != null) {
      try { previousPlaybackAudioMode?.let { manager.mode = it } } catch (_: Exception) {}
    }
    playbackAudioManager = null
    previousPlaybackAudioMode = null
  }

  private fun localFile(path: String): File {
    val uri = Uri.parse(path)
    return if (uri.scheme == "file") File(uri.path ?: path) else File(path)
  }

  private fun ensureNativeLoaded() {
    if (nativeLoaded) return
    synchronized(this) {
      if (nativeLoaded) return
      System.loadLibrary("ezra_audar_jni")
      nativeLoaded = true
    }
  }

  private external fun nativeInitialize(modelPath: String, threads: Int): String
  private external fun nativeGenerate(text: String, refText: String, refCodes: IntArray): IntArray
  private external fun nativeShutdown()

  private fun writePcmWav(path: File, samples: FloatArray, sampleRate: Int = 24000) {
    require(samples.isNotEmpty()) { "NeuCodec returned an empty audio tensor." }
    val dataBytes = samples.size * 2
    DataOutputStream(BufferedOutputStream(FileOutputStream(path))).use { out ->
      fun writeAscii(value: String) = value.forEach { out.writeByte(it.code) }
      fun writeIntLE(value: Int) {
        out.writeByte(value and 0xff)
        out.writeByte((value ushr 8) and 0xff)
        out.writeByte((value ushr 16) and 0xff)
        out.writeByte((value ushr 24) and 0xff)
      }
      fun writeShortLE(value: Int) {
        out.writeByte(value and 0xff)
        out.writeByte((value ushr 8) and 0xff)
      }
      writeAscii("RIFF")
      writeIntLE(36 + dataBytes)
      writeAscii("WAVE")
      writeAscii("fmt ")
      writeIntLE(16)
      writeShortLE(1)
      writeShortLE(1)
      writeIntLE(sampleRate)
      writeIntLE(sampleRate * 2)
      writeShortLE(2)
      writeShortLE(16)
      writeAscii("data")
      writeIntLE(dataBytes)
      samples.forEach { sample ->
        val pcm = (max(-1f, min(1f, sample)) * 32767f).toInt()
        writeShortLE(pcm)
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("EzraAudarTts")
    Events("onPlaybackFinished", "onPlaybackError")

    AsyncFunction("getDeviceCapacity") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("Android application context is unavailable")
      val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val memory = ActivityManager.MemoryInfo().also { manager.getMemoryInfo(it) }
      val storage = StatFs(context.filesDir.absolutePath)
      mapOf(
        "availableRamBytes" to memory.availMem,
        "totalRamBytes" to memory.totalMem,
        "lowMemory" to memory.lowMemory,
        "availableStorageBytes" to storage.availableBytes
      )
    }

    AsyncFunction("initialize") { modelPath: String ->
      if (ready) return@AsyncFunction mapOf("ready" to true, "voice" to "demo_male_3")
      val context = appContext.reactContext
        ?: throw IllegalStateException("Android application context is unavailable")
      val model = localFile(modelPath)
      require(model.isFile && model.canRead() && model.length() >= 400_000_000L) {
        "Audar Flash Q4 model is missing or incomplete."
      }

      val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val memory = ActivityManager.MemoryInfo().also { manager.getMemoryInfo(it) }
      require(!memory.lowMemory && memory.availMem >= 1_800L * 1024L * 1024L) {
        "Audar needs at least 1.8 GB free RAM before loading. Close other apps and retry."
      }

      val decoderFile = File(context.filesDir, "audar/neucodec-model-int8.onnx")
      decoderFile.parentFile?.mkdirs()
      if (!decoderFile.isFile || decoderFile.length() < 250_000_000L) {
        context.assets.open("audar/model_int8.onnx").use { input ->
          decoderFile.outputStream().use { output -> input.copyTo(output) }
        }
      }

      val reference = context.assets.open("audar/demo_male_3_reference.json").bufferedReader().use { it.readText() }
      val referenceJson = JSONObject(reference)
      require(referenceJson.optString("voiceId") == "demo_male_3") {
        "The bundled Audar reference voice is not demo_male_3."
      }
      referenceText = referenceJson.getString("referenceText")
      val codesJson = referenceJson.getJSONArray("codes")
      referenceCodes = IntArray(codesJson.length()) { index -> codesJson.getInt(index) }
      require(referenceCodes.isNotEmpty()) { "Audar demo_male_3 reference codes are empty." }

      ensureNativeLoaded()
      val nativeError = nativeInitialize(model.absolutePath, 2)
      if (nativeError.isNotEmpty()) throw IllegalStateException(nativeError)

      val env = OrtEnvironment.getEnvironment()
      val options = OrtSession.SessionOptions()
      options.setIntraOpNumThreads(2)
      options.setInterOpNumThreads(1)
      val session = env.createSession(decoderFile.absolutePath, options)
      require(session.inputNames.isNotEmpty() && session.outputNames.isNotEmpty()) {
        "NeuCodec ONNX decoder has no input or output tensors."
      }
      ortEnvironment = env
      decoderSession = session
      decoderInputName = session.inputNames.first()
      decoderOutputName = session.outputNames.first()
      ready = true
      mapOf("ready" to true, "voice" to "demo_male_3", "decoder" to "NeuCodec INT8")
    }

    AsyncFunction("synthesize") { text: String, outputPath: String ->
      check(ready) { "Audar is not initialized." }
      require(text.isNotBlank()) { "Text to synthesize is empty." }
      val speechCodes = nativeGenerate(text, referenceText, referenceCodes)
      require(speechCodes.isNotEmpty()) { "Audar generated no speech codes." }
      val env = ortEnvironment ?: error("NeuCodec runtime is not initialized.")
      val session = decoderSession ?: error("NeuCodec decoder is not initialized.")
      val inputName = decoderInputName ?: error("NeuCodec input tensor is missing.")
      val outputName = decoderOutputName ?: error("NeuCodec output tensor is missing.")
      val input = OnnxTensor.createTensor(
        env,
        IntBuffer.wrap(speechCodes),
        longArrayOf(1L, 1L, speechCodes.size.toLong())
      )
      val results = session.run(mapOf(inputName to input))
      try {
        val output = results.get(outputName).get() as OnnxTensor
        val buffer = output.floatBuffer
        val samples = FloatArray(buffer.remaining())
        buffer.get(samples)
        val destination = localFile(outputPath)
        destination.parentFile?.mkdirs()
        writePcmWav(destination, samples)
        mapOf("path" to destination.absolutePath, "bytes" to destination.length(), "sampleRate" to 24000)
      } finally {
        results.close()
        input.close()
      }
    }

    AsyncFunction("playAudio") { path: String ->
      val audioFile = localFile(path)
      require(audioFile.isFile && audioFile.length() > 44L) { "Audar output WAV is missing or invalid." }
      mediaPlayer?.release()
      mediaPlayerFile?.delete()
      restorePlaybackAudioRoute()
      val manager = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      if (manager != null) {
        previousPlaybackAudioMode = manager.mode
        playbackAudioManager = manager
        try { manager.mode = AudioManager.MODE_NORMAL } catch (_: Exception) {}
      }
      val player = MediaPlayer()
      mediaPlayer = player
      mediaPlayerFile = audioFile
      player.setVolume(1.0f, 1.0f)
      player.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      player.setOnPreparedListener { it.start() }
      player.setOnCompletionListener {
        it.release()
        if (mediaPlayer === it) mediaPlayer = null
        audioFile.delete()
        if (mediaPlayerFile == audioFile) mediaPlayerFile = null
        restorePlaybackAudioRoute()
        sendEvent("onPlaybackFinished", mapOf("path" to path))
      }
      player.setOnErrorListener { failed, what, extra ->
        failed.release()
        if (mediaPlayer === failed) mediaPlayer = null
        audioFile.delete()
        if (mediaPlayerFile == audioFile) mediaPlayerFile = null
        restorePlaybackAudioRoute()
        sendEvent("onPlaybackError", mapOf("what" to what, "extra" to extra))
        true
      }
      try {
        player.setDataSource(audioFile.absolutePath)
        player.prepareAsync()
      } catch (error: Exception) {
        player.release()
        mediaPlayer = null
        mediaPlayerFile = null
        audioFile.delete()
        restorePlaybackAudioRoute()
        throw IllegalStateException("Android could not play Audar audio.", error)
      }
      mapOf("playing" to true)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopAudio") {
      mediaPlayer?.let {
        try { if (it.isPlaying) it.stop() } catch (_: IllegalStateException) {}
        it.release()
      }
      mediaPlayer = null
      mediaPlayerFile?.delete()
      mediaPlayerFile = null
      restorePlaybackAudioRoute()
      mapOf("stopped" to true)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("shutdown") {
      mediaPlayer?.release()
      mediaPlayer = null
      mediaPlayerFile?.delete()
      mediaPlayerFile = null
      restorePlaybackAudioRoute()
      decoderSession?.close()
      decoderSession = null
      ortEnvironment = null
      if (nativeLoaded) nativeShutdown()
      ready = false
      mapOf("ready" to false)
    }
  }
}
