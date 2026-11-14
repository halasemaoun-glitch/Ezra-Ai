#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.join(
  process.cwd(),
  'node_modules/expo-speech-recognition/android/src/main/java/expo/modules/speechrecognition/ExpoAudioRecorder.kt',
);

if (!fs.existsSync(sourcePath)) {
  throw new Error(`expo-speech-recognition Android source was not found: ${sourcePath}`);
}

let source = fs.readFileSync(sourcePath, 'utf8');
const alreadyPatched =
  source.includes('MediaRecorder.AudioSource.VOICE_COMMUNICATION') &&
  source.includes('AcousticEchoCanceler.create(this.audioSessionId)');

if (alreadyPatched) {
  console.log('Android voice communication source and AcousticEchoCanceler are already enabled.');
  process.exit(0);
}

function replaceExactlyOnce(input, before, after, description) {
  const matches = input.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`Cannot patch Expo speech recorder (${description}); expected 1 match, found ${matches}.`);
  }
  return input.replace(before, after);
}

source = replaceExactlyOnce(
  source,
  'import android.media.MediaRecorder\n',
  'import android.media.MediaRecorder\nimport android.media.audiofx.AcousticEchoCanceler\n',
  'import AcousticEchoCanceler',
);

source = replaceExactlyOnce(
  source,
  '    private var audioRecorder: AudioRecord? = null\n',
  '    private var audioRecorder: AudioRecord? = null\n    private var acousticEchoCanceler: AcousticEchoCanceler? = null\n',
  'add AEC lifecycle field',
);

source = replaceExactlyOnce(
  source,
  '            MediaRecorder.AudioSource.VOICE_RECOGNITION,\n',
  '            MediaRecorder.AudioSource.VOICE_COMMUNICATION,\n',
  'select communication-optimized microphone input',
);

source = replaceExactlyOnce(
  source,
  '            this.startRecording()\n',
  `            // Android may provide hardware/vendor acoustic echo cancellation for VOICE_COMMUNICATION.
            // AEC is optional: unsupported devices continue with their normal capture path.
            try {
                if (AcousticEchoCanceler.isAvailable()) {
                    acousticEchoCanceler = AcousticEchoCanceler.create(this.audioSessionId)?.also {
                        it.enabled = true
                    }
                    Log.i(TAG, "Android acoustic echo cancellation initialized when supported")
                } else {
                    Log.i(TAG, "Android acoustic echo cancellation is not available on this device")
                }
            } catch (error: Exception) {
                Log.w(TAG, "Could not enable Android acoustic echo cancellation; continuing without it", error)
                acousticEchoCanceler?.release()
                acousticEchoCanceler = null
            }

            this.startRecording()
`,
  'enable AEC on the active AudioRecord session',
);

source = replaceExactlyOnce(
  source,
  '        audioRecorder?.stop()\n        stoppedAtMillis = System.currentTimeMillis()\n        audioRecorder?.release()\n',
  `        audioRecorder?.stop()
        // Release the effect before releasing the AudioRecord session it is attached to.
        acousticEchoCanceler?.release()
        acousticEchoCanceler = null
        stoppedAtMillis = System.currentTimeMillis()
        audioRecorder?.release()
`,
  'release AEC lifecycle',
);

fs.writeFileSync(sourcePath, source, 'utf8');
console.log('Patched expo-speech-recognition Android recorder: VOICE_COMMUNICATION + optional AcousticEchoCanceler.');
