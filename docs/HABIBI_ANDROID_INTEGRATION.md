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
- The Unified dialect vocabulary exposes `LEV`; however, dialect quality must be confirmed with real-device samples. Do not advertise reliable Levantine synthesis until a voice test confirms it.
- The Unified weights are CC-BY-NC-SA-4.0. Check the exact license for each specialized checkpoint before redistribution or commercial use. The F5-TTS/Habibi weights are not a blanket commercial-use license.
- F5-TTS is reference-conditioned voice cloning, not a built-in male voice selector. A reference recording and matching transcript are mandatory; do not silently use the user's previously uploaded recording as the primary voice because it was designated backup only.

## Android integration status

- The local Expo module at `modules/ezra-habibi-tts` now exposes native initialization, synthesis-to-WAV, Android MediaPlayer playback, stop, and playback events.
- The JNI bridge calls the pinned audio.cpp v0.9.4 C ABI. It reads a short PCM WAV reference, supplies the exact transcript and dialect token, runs offline CPU inference, and writes the generated PCM as WAV.
- The app now has controls to download the Unified GGUF package and vocabulary from the upstream Hugging Face repository, select an approved WAV reference, enter its exact transcript, choose LEV/ALG/SAU/MSA/UNK, and activate Habibi. Selecting a new reference clears any previous transcript, and initialization checks that the model, vocabulary, and reference files exist before allocating native memory. Once activated, it restores the local engine on later app starts.
- Arabic replies use Habibi when initialization succeeds. English and any safe fallback remain on Android system TTS. Existing Groq, Supabase, memory, recognition, wake-word, and Android control flows are unchanged.
- The Android workflow cross-compiles the upstream C ABI and EZRA JNI bridge for arm64, verifies exported symbols, packages the runtime, and assembles a debug APK. A combined JNI + APK workflow has passed CI and produced a debug artifact; this validates compilation and packaging only, not inference or playback on the target phone.
- CPU inference is deliberately constrained to one thread and a 256-frame budget to reduce peak memory pressure on mobile devices. At this 256-frame budget, the app limits reference audio to approximately 1.3 seconds because the runtime truncates reference audio beyond half the frame budget; Arabic output is split into short 24-character chunks to reduce generation overflow. This is a memory-constrained compromise and its voice quality must be evaluated on the target device.
- No model is bundled in the APK. The user downloads it to app-private storage on first setup. Peak runtime memory and sustained performance still require testing on the OPPO A76.

## Device and voice constraints

- Target device: OPPO A76, Android 13, 6 GB physical RAM.
- Free storage previously reported by the user was about 26.4 GB; that is enough to investigate a model package but does not guarantee sufficient runtime RAM.
- The Android app checks available storage before downloading and available RAM before initialization. These are conservative preflight checks, not proof that the model will fit during inference. Do not infer inference feasibility from disk space or virtual RAM.
- The user's previous recording remains backup only. The app must request/select a separate suitable reference voice before enabling Habibi as the default spoken voice.
- If the required voice reference or model is missing, keep the current device TTS fallback and explain the missing prerequisite instead of silently claiming Habibi is active.

## Implementation sequence

1. **Passed:** cross-compile the upstream F5/Habibi C ABI for Android arm64 and verify C ABI symbols.
2. **Implemented, CI pending:** JNI bridge, Expo initialization/synthesis/playback/stop APIs, and WAV output.
3. **Implemented, device pending:** first-run download of the Unified GGUF + vocabulary to app-private storage, with HTTP and file-size checks. Cryptographic hash verification is still a hardening task.
4. **Implemented, user input required:** select an approved short PCM WAV reference and enter its exact transcript. The earlier user recording remains backup only.
5. **Implemented, device pending:** route Arabic replies through Habibi only after successful initialization; keep English and error fallback on Android system TTS.
6. **Pending on the OPPO A76:** cold load, repeated synthesis, playback interruption, background/foreground, offline operation, memory pressure, thermal throttling, and recovery.
7. Only after real-device checks pass, mark Habibi as the proven primary engine. Keep all changes on `ezra/habibi-android-spike` until explicitly approved; do not merge to `main`.

## Honest current state

The upstream audio.cpp C ABI has already compiled successfully for Android arm64. EZRA now contains a JNI bridge, a local Expo API for initialization and WAV synthesis/playback, model download/setup UI, and Arabic speech routing that selects Habibi only after the user has supplied a suitable male reference WAV and matching transcript and native initialization succeeds. The combined JNI + APK build passed CI; real-device inference and playback remain pending. No successful Habibi inference or playback has yet been verified on the OPPO A76; that requires a built APK, the separately approved male reference clip, and an on-device test. Until then, the app keeps its Android system TTS fallback. Do not merge to `main`.
