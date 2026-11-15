# Supertonic 3 Android proof of concept

## Status

Experimental only. This branch is based on `ezra/android-audio-output-repair`.
Do not merge this branch or remove any existing voice engine until a real Android
device test confirms reliable audible playback.

## Why this candidate

- Supertonic 3 supports Arabic (`ar`) among 31 languages.
- It runs locally with ONNX Runtime and does not require a GPU or a network
  connection after model assets have been downloaded.
- The published model has about 99M parameters, but the ONNX files themselves
  total roughly 398 MB; the full Hugging Face repository is about 415 MB.
- The preset `M1` is the first male voice candidate to evaluate. It is a fixed
  preset; the open-weight package does not include an official voice-cloning
  pipeline. A deep/warm timbre must be verified by listening, not assumed.

## Important maintenance and licensing constraints

- The upstream open-source repository announced on 2026-07-23 that it would be
  archived with no further development or official support.
- The sample code is MIT-licensed; the model weights and voice styles use the
  OpenRAIL-M license. Preserve the license and review its use-based restrictions
  before distributing the model with EZRA.
- Use the archived model snapshot
  `supertone-oss-archive/supertonic-3` at revision
  `aafc6e32416a594460b32413efc49d7fe4ce6d46` for reproducibility.

## Integration approach

1. Add a separate Expo native module for Android using ONNX Runtime Android.
2. Download model assets on first use into app-private storage, with progress,
   integrity checks, cancellation, and a clear storage estimate. Do not bundle
   the 398 MB ONNX assets in the APK.
3. Start with the `M1` preset and Arabic language code `ar`.
4. Generate WAV output in app cache and play it through Android media audio
   routing, reusing the existing safe playback conventions where appropriate.
5. Keep Gemini Live, Audar, Habibi, and Android system TTS untouched as fallbacks.
6. Build an APK and test on the target OPPO A76 (Android 13, 6 GB RAM), measuring
   cold start, generation latency, peak memory, output quality, and playback.
7. Only consider making Supertonic the default after the user approves the
   recorded Arabic voice and the device test passes.

## Acceptance criteria

- No existing voice path is removed or silently replaced.
- Model download resumes or fails safely and reports useful errors.
- Arabic text produces a non-empty, valid WAV file.
- Audio plays through the loudspeaker and stops cleanly.
- The app remains responsive and does not crash or run out of memory on the
  target device.
- The user listens to the generated Arabic sample and approves the voice.
