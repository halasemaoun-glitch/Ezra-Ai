# EZRA — Habibi-TTS Android integration

## Target architecture

- Text generation remains on the existing Supabase `smart-service` function using Groq.
- Habibi speech synthesis is intended to run locally on Android, with no hosted TTS endpoint or recurring API quota.
- The selected inference implementation is the community F5-TTS/Habibi port in `0xShug0/audio.cpp`, using its C ABI from an Android JNI bridge.
- The current `expo-speech` implementation remains a temporary fallback until the native engine, model loading, voice reference, and real-device playback have all passed tests.
- Do not change Supabase, Groq, conversation memory, speech recognition, wake-word, or Android system-control flows as part of this TTS work.

## Verified upstream inference path

The upstream `audio.cpp` F5-TTS community model documents end-to-end inference for Habibi, with the aliases `habibi` and `habibi_tts`. It exposes a C ABI suitable for embedding in a native application. The model request requires:
- generated text;
- a short reference voice recording;
- the exact transcript of that reference recording;
- a Habibi dialect token (for example `ALG`, `SAU`, `MSA`, or `UNK`).

The GGUF package combines the DiT transformer and Vocos vocoder, plus a vocabulary file. The upstream quickstart uses `reference_text`, `dialect`, and the reference audio. Reference clips longer than about 10.9 seconds are truncated by the model path.

Important language and licensing limits:
- Habibi is an Arabic model; it is not the English speech engine. English must retain a separate fallback/engine path.
- The `LEV` token exists in the dialect vocabulary, but the earlier model documentation states it had no training data. Do not advertise reliable Levantine synthesis until a real voice test confirms it.
- The Unified weights are CC-BY-NC-SA-4.0. Check the exact license for each specialized checkpoint before redistribution or commercial use. The F5-TTS/Habibi weights are not a blanket commercial-use license.
- F5-TTS is reference-conditioned voice cloning, not a built-in male voice selector. A reference recording and matching transcript are mandatory; do not silently use the user's previously uploaded recording as the primary voice because it was designated backup only.

## Android integration status

- The local Expo module at `modules/ezra-habibi-tts` now exposes native initialization, synthesis-to-WAV, Android MediaPlayer playback, stop, and playback events.
- The JNI bridge calls the pinned audio.cpp v0.9.4 C ABI. It reads a short PCM WAV reference, supplies the exact transcript and dialect token, runs offline CPU inference, and writes the generated PCM as WAV.
- The app now has controls to download the Unified GGUF package and vocabulary from the upstream Hugging Face repository, select an approved WAV reference, enter its exact transcript, choose ALG/SAU/MSA/UNK, and activate Habibi. Once activated, it restores the local engine on later app starts.
- Arabic replies use Habibi when initialization succeeds. English and any safe fallback remain on Android system TTS. Existing Groq, Supabase, memory, recognition, wake-word, and Android control flows are unchanged.
- The Android workflow cross-compiles the upstream C ABI and EZRA JNI bridge for arm64, then assembles a debug APK with those native libraries included.
- The first upstream C ABI Android arm64 cross-compile passed, including the C ABI symbol checks. The newer combined JNI + full APK build still needs to pass before the module is considered build-validated.
- CPU inference is deliberately constrained to two threads and a 960-frame budget. The reference clip is limited to approximately 5 seconds on this CPU path; longer samples are truncated by the model.
- No model is bundled in the APK. The user downloads it to app-private storage on first setup. Peak runtime memory and sustained performance still require testing on the OPPO A76.

## Device and voice constraints

- Target device: OPPO A76, Android 13, 6 GB physical RAM.
- Free storage previously reported by the user was about 26.4 GB; that is enough to investigate a model package but does not guarantee sufficient runtime RAM.
- The Android app must check available RAM and storage before offering model installation or loading. Do not infer inference feasibility from disk space or virtual RAM.
- The user's previous recording remains backup only. The app must request/select a separate suitable reference voice before enabling Habibi as the default spoken voice.
- If the required voice reference or model is missing, keep the current device TTS fallback and explain the missing prerequisite instead of silently claiming Habibi is active.

## Implementation sequence

1. Cross-compile the upstream F5/Habibi C ABI for Android arm64 and inspect its actual shared-library dependencies.
2. Add the JNI bridge and expose a small asynchronous Expo API for model readiness, synthesis-to-WAV, cancellation, and native errors.
3. Add resumable model package download and integrity verification; store model files in app-private storage and never bundle a multi-gigabyte model in the APK.
4. Add reference-audio selection/recording with a matching transcript, keeping the earlier user recording out of the primary voice path unless the user explicitly changes that decision.
5. Route Arabic speech through Habibi only when the model and voice reference are ready; preserve `expo-speech` for English and safe fallback/error cases.
6. Test cold load, repeated synthesis, audio interruption, background/foreground, offline operation, memory pressure, thermal throttling, and recovery on the actual OPPO A76.
7. Only after those checks pass, mark Habibi as the default primary engine in the app UI. Keep all changes on `ezra/habibi-android-spike` until explicitly approved; do not merge to `main`.

## Honest current state

The upstream model has a real inference implementation and an embeddable C ABI. EZRA has not yet compiled that runtime for Android, created the JNI bridge, loaded the model on the phone, or generated audio through Habibi. The new CI workflow is the first Android-native build gate. The primary-engine preference is recorded in the app's voice profile, but runtime speech still uses the temporary `expo-speech` fallback until the integration sequence above is complete.
