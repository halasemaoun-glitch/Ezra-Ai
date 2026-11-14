package expo.modules.ezraliveaudio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.media.audiofx.AutomaticGainControl
import android.os.Process
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

class EzraLiveAudioModule : Module() {
  @Volatile private var recorder: AudioRecord? = null
  @Volatile private var player: AudioTrack? = null
  @Volatile private var recordThread: Thread? = null
  @Volatile private var echoCanceler: AcousticEchoCanceler? = null
  @Volatile private var noiseSuppressor: NoiseSuppressor? = null
  @Volatile private var automaticGainControl: AutomaticGainControl? = null
  private val recording = AtomicBoolean(false)
  private val playing = AtomicBoolean(false)

  override fun definition() = ModuleDefinition {
    Name("EzraLiveAudio")
    Events("onAudioChunk", "onAudioError")

    AsyncFunction("startRecording") {
      if (recording.get()) return@AsyncFunction mapOf("started" to true, "alreadyRunning" to true)
      val sampleRate = 16000
      val minBuffer = AudioRecord.getMinBufferSize(
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      )
      require(minBuffer > 0) { "Android could not initialize the microphone audio buffer." }
      val bufferSize = maxOf(minBuffer * 2, 6400)
      val audioRecord = AudioRecord(
        MediaRecorder.AudioSource.VOICE_COMMUNICATION,
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        bufferSize
      )
      require(audioRecord.state == AudioRecord.STATE_INITIALIZED) {
        audioRecord.release()
        "Android could not initialize the microphone."
      }
      recorder = audioRecord
      if (AcousticEchoCanceler.isAvailable()) {
        echoCanceler = AcousticEchoCanceler.create(audioRecord.audioSessionId)?.apply { enabled = true }
      }
      if (NoiseSuppressor.isAvailable()) {
        noiseSuppressor = NoiseSuppressor.create(audioRecord.audioSessionId)?.apply { enabled = true }
      }
      if (AutomaticGainControl.isAvailable()) {
        automaticGainControl = AutomaticGainControl.create(audioRecord.audioSessionId)?.apply { enabled = true }
      }
      audioRecord.startRecording()
      recording.set(true)
      recordThread = Thread({
        Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
        val buffer = ByteArray(3200) // 100 ms at 16 kHz, mono, PCM16
        while (recording.get()) {
          val count = try {
            audioRecord.read(buffer, 0, buffer.size, AudioRecord.READ_BLOCKING)
          } catch (error: Exception) {
            sendEvent("onAudioError", mapOf("message" to (error.message ?: "Microphone read failed.")))
            break
          }
          if (count > 0 && recording.get()) {
            val frame = if (count == buffer.size) buffer.copyOf() else buffer.copyOf(count)
            sendEvent("onAudioChunk", mapOf(
              "data" to Base64.encodeToString(frame, Base64.NO_WRAP),
              "mimeType" to "audio/pcm;rate=16000"
            ))
          } else if (count < 0 && recording.get()) {
            sendEvent("onAudioError", mapOf("message" to "Microphone read failed with code $count."))
            break
          }
        }
      }, "EzraLiveMic")
      recordThread?.start()
      mapOf("started" to true, "sampleRate" to sampleRate)
    }

    AsyncFunction("stopRecording") {
      recording.set(false)
      try { recorder?.stop() } catch (_: Exception) {}
      try { recordThread?.join(500) } catch (_: InterruptedException) {}
      recordThread = null
      recorder?.release()
      recorder = null
      echoCanceler?.release()
      echoCanceler = null
      noiseSuppressor?.release()
      noiseSuppressor = null
      automaticGainControl?.release()
      automaticGainControl = null
      mapOf("stopped" to true)
    }

    AsyncFunction("startPlayback") {
      if (playing.get()) return@AsyncFunction mapOf("started" to true, "alreadyRunning" to true)
      val sampleRate = 24000
      val minBuffer = AudioTrack.getMinBufferSize(
        sampleRate,
        AudioFormat.CHANNEL_OUT_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      )
      require(minBuffer > 0) { "Android could not initialize audio playback." }
      val track = AudioTrack.Builder()
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        )
        .setAudioFormat(
          AudioFormat.Builder()
            .setSampleRate(sampleRate)
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build()
        )
        .setBufferSizeInBytes(maxOf(minBuffer * 2, 9600))
        .setTransferMode(AudioTrack.MODE_STREAM)
        .build()
      require(track.state == AudioTrack.STATE_INITIALIZED) {
        track.release()
        "Android could not start the audio output stream."
      }
      track.play()
      player = track
      playing.set(true)
      mapOf("started" to true, "sampleRate" to sampleRate)
    }

    AsyncFunction("playPcmChunk") { base64: String ->
      val track = player ?: throw IllegalStateException("Live audio playback is not started.")
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      var offset = 0
      while (offset < bytes.size && playing.get()) {
        val written = track.write(bytes, offset, bytes.size - offset, AudioTrack.WRITE_BLOCKING)
        if (written < 0) throw IllegalStateException("Android audio output failed with code $written.")
        offset += written
      }
      mapOf("writtenBytes" to offset)
    }

    AsyncFunction("stopPlayback") {
      playing.set(false)
      try { player?.pause() } catch (_: Exception) {}
      try { player?.flush() } catch (_: Exception) {}
      try { player?.stop() } catch (_: Exception) {}
      player?.release()
      player = null
      mapOf("stopped" to true)
    }
  }
}
