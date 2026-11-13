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
- The ALG specialized checkpoint is selected to strengthen Algerian pronunciation; dialect quality must still be confirmed with real-device samples. Do not advertise reliable Levantine synthesis until a voice test confirms it.
- The Algerian-specialized ALG weights are Apache 2.0; the Unified weights are CC-BY-NC-SA-4.0. Check the exact license for each specialized checkpoint before redistribution or commercial use. The F5-TTS/Habibi weights are not a blanket commercial-use license.
- F5-TTS is reference-conditioned voice cloning, not a built-in male voice selector. A reference recording and matching transcript are mandatory; do not silently use the user's previously uploaded recording as the primary voice because it was designated backup only.

## Android integration status

- The local Expo module at `modules/ezra-habibi-tts` now exposes native initialization, synthesis-to-WAV, Android MediaPlayer playback, stop, and playback events.
- The JNI bridge calls the pinned audio.cpp v0.9.4 C ABI. It reads a short PCM WAV reference, supplies the exact transcript and dialect token, runs offline CPU inference, and writes the generated PCM as WAV.
- The app downloads the Algerian-specialized Habibi ALG GGUF package and matching vocabulary from the audio.cpp Hugging Face package repository, selects an approved WAV reference, accepts its exact transcript, fixes the dialect token to ALG, and activates Habibi. Selecting a new reference clears any previous transcript, and initialization checks that the model, vocabulary, and reference files exist before allocating native memory. The Android system-TTS fallback now keeps separate Arabic and English voice selections, with sample playback for each language; voice gender depends on the installed Android TTS provider and cannot be guaranteed by Expo's voice metadata. Once activated, it restores the local engine on later app starts.
- Arabic replies use the Algerian-specialized Habibi ALG checkpoint when initialization succeeds. English and any safe fallback remain on Android system TTS. Existing Groq, Supabase, memory, recognition, wake-word, and Android control flows are unchanged.
- The Android workflow cross-compiles the upstream C ABI and EZRA JNI bridge for arm64, verifies exported symbols, packages the runtime, and assembles a debug APK. A combined JNI + APK workflow has passed CI and produced a debug artifact; this validates compilation and packaging only, not inference or playback on the target phone.
- CPU inference is deliberately constrained to one thread and a 128-frame budget. The Android build applies Q8_0 DiT linear weights, sequential classifier-free guidance, and a CPU graph-arena patch with a 768 MiB minimum allocation. The app currently requires at least 2.2 GiB of available system RAM and rejects Android low-memory state before native model loading. This is a conservative preflight, not a guarantee that inference will fit or remain stable. The JNI bridge limits the reference clip to approximately 1.3 seconds for this mobile budget, and Arabic output is split into short 24-character chunks to reduce generation overflow. The target 6 GB phone may still be unable to run Habibi reliably; do not lower the guard without a measured on-device memory profile.
- No model is bundled in the APK. The user downloads the Algerian-specialized ALG model and its matching vocabulary to app-private storage on first setup. Peak runtime memory and sustained performance still require testing on the OPPO A76.

## Device and voice constraints

- Target device: OPPO A76, Android 13, 6 GB physical RAM.
- Free storage previously reported by the user was about 26.4 GB; that is enough to investigate a model package but does not guarantee sufficient runtime RAM.
- The Android app checks available storage before downloading and available RAM before initialization. These are conservative preflight checks, not proof that the model will fit during inference. Do not infer inference feasibility from disk space or virtual RAM.
- The user's previous recording remains backup only. The app must request/select a separate suitable reference voice before enabling Habibi as the default spoken voice.
- No male reference WAV is bundled in the repository or APK. Habibi requires a suitable male reference recording and its exact transcript; do not substitute the user's earlier backup recording without explicit approval. If the required reference or model is missing, keep the current device TTS fallback and explain the missing prerequisite instead of silently claiming Habibi is active.

## Implementation sequence

1. **Passed:** cross-compile the upstream F5/Habibi C ABI for Android arm64 and verify C ABI symbols.
2. **Implemented, CI pending:** JNI bridge, Expo initialization/synthesis/playback/stop APIs, and WAV output.
3. **Implemented, device pending:** first-run download of the Algerian-specialized ALG GGUF + vocabulary to app-private storage, with HTTP and file-size checks. Cryptographic hash verification is still a hardening task.
4. **Implemented, user input required:** select an approved short PCM WAV reference and enter its exact transcript. The earlier user recording remains backup only.
5. **Implemented, device pending:** route Arabic replies through Habibi only after successful initialization; keep English and error fallback on Android system TTS.
6. **Pending on the OPPO A76:** confirm the 3.5 GiB free-RAM preflight can be met, cold load, repeated synthesis, playback interruption, background/foreground, offline operation, memory pressure, thermal throttling, and recovery.
7. Only after real-device checks pass, mark Habibi as the proven primary engine. Keep all changes on `ezra/habibi-android-spike` until explicitly approved; do not merge to `main`.

## Honest current state

The upstream audio.cpp C ABI has already compiled successfully for Android arm64. EZRA now contains a JNI bridge, a local Expo API for initialization and WAV synthesis/playback, model download/setup UI, and Arabic speech routing that selects Habibi only after the user has supplied a suitable male reference WAV and matching transcript and native initialization succeeds. The combined JNI + APK build has passed CI on an earlier revision; the latest branch still needs a matching native build check, and real-device inference and playback remain pending. No successful Habibi inference or playback has yet been verified on the OPPO A76; that requires a built APK, the separately approved male reference clip, and an on-device test. Until then, the app keeps its Android system TTS fallback. Do not merge to `main`.


## ALG checkpoint update (2026-11-10)

- The pinned audio.cpp v0.9.4 model specification includes the `habibi_alg` package under `Habibi-TTS/Specialized/ALG`, with `habibi-alg-orig.gguf` and its matching `vocab.txt`.
- EZRA now downloads this specialized package rather than the Unified checkpoint, migrates away from any saved Unified model path, validates the selected checkpoint path, and fixes the request dialect to `ALG`.
- The UI no longer offers dialects that would mismatch the specialized checkpoint. The JNI request uses default speed (1.0) instead of the previous slower 0.92 and explicitly enables diacritic stripping.
- This improves model/dialect matching but does not prove voice quality, real-device memory fit, or successful synthesis. A separate, suitable male reference recording and on-device testing are still required.


## Latest Android test build

- Requested from the current EZRA development branch after personality integration validation. This documentation-only update triggers the existing free GitHub Actions Android build; it does not change application code or deploy Supabase.


## Voice-language routing update

- The app now applies the existing automatic language detector when a reply is spoken: Arabic-script replies route to Habibi when it is ready, recognized non-Arabic language phrases use their matching Android TTS locale, and otherwise Latin-script text defaults to English rather than inheriting an Arabic UI preference. Mixed Arabic/Latin replies are still treated as Arabic as a whole; sentence-level code-switching remains future work.
- The current native Habibi checkpoint is ALG only. English remains on Android system TTS, whose available voice gender and naturalness depend on the installed provider and must be selected/listened to on the device.


## Stability branch native build

- The `ezra/stability-voice-memory-files` branch is now included in the native Habibi cross-compile and APK workflow. Voice application changes on this branch must be built through that workflow so the APK includes the compiled `libaudiocpp.so` runtime; the generic APK workflow alone is not a Habibi-enabled build.
