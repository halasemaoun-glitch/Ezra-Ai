# Habibi-TTS Android feasibility spike

## Goal
Evaluate an on-device Habibi-TTS speech engine for EZRA without changing or removing Groq, Supabase memory, speech recognition, wake-word handling, or the existing Android TTS fallback.

## Verified upstream facts
- Upstream installation is a Python package: `pip install habibi-tts`.
- Its declared runtime dependencies are `f5-tts>=1.1.5` and `torch>=2.4.0,<2.9.0`.
- The upstream inference examples use the Python CLI / Gradio interface and model checkpoints; the repository does not provide a ready-to-use Android SDK, Kotlin library, ONNX Android bundle, or React Native module.
- Dialect IDs documented upstream include LEV and SAU for the Unified model. The documented Specialized set includes ALG but does not list LEV.
- Upstream states Unified, SAU and UAE model weights are CC-BY-NC-SA-4.0; ALG and the other listed specialized weights are Apache-2.0. The code is MIT.
- English is not among the documented Habibi dialect/model IDs.

## Current EZRA integration
- EZRA is Expo SDK 54 / React Native 0.81.5.
- Current TTS is `expo-speech`, called from `App.tsx`.
- Text generation is served by the existing Supabase `smart-service` function using Groq. This must remain unchanged.
- Existing speech recognition and Android wake-word modules must remain unchanged.
- Current TTS is the fallback until a replacement has passed real-device tests.

## Device-only feasibility constraints
The OPPO A76 (Android 13, 6 GB RAM) cannot run the upstream Python CLI simply by adding the Python package to the Expo app. The current upstream runtime is PyTorch/F5-TTS, not an Android-native runtime. Storage capacity alone does not solve runtime memory, CPU/accelerator compatibility, model conversion, or latency.

No claim of unlimited/offline operation is made until a complete model is converted, packaged, and measured on the target device. A hosted inference endpoint would introduce external compute and potentially quotas/costs, so it does not satisfy the requested phone-only/offline goal.

## Safe implementation plan
1. Keep this work isolated on `ezra/habibi-android-spike`; do not merge into the active branch yet.
2. Build a minimal Android-native proof of concept only after identifying a legally usable, convertible model path (for example ONNX or another Android-supported runtime) and confirming that the complete model + vocoder can run within the device's RAM and latency budget.
3. Benchmark Arabic LEV and ALG separately; treat SAU weights as non-commercial under their stated license. Do not claim English support from Habibi.
4. Add a React Native native-module adapter only after the Android proof of concept succeeds. Route speech output through that adapter when available, otherwise fall back to `expo-speech`.
5. Preserve all existing text, memory, recognition, wake-word and system-control flows. Do not alter Groq or Supabase secrets/functions for TTS.
6. Test on the actual OPPO A76: cold start, repeated utterances, memory pressure, thermal throttling, interruption/cancel, app background/foreground, and offline behavior.

## Current status
- Feasibility spike branch created.
- No app runtime code changed yet.
- No Android-compatible Habibi artifact has been verified.
- Next technical gate: find or produce a compatible model export and benchmark it on the target phone before integrating it into EZRA.
