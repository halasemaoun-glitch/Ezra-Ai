# Habibi-TTS Android feasibility spike

## Goal
Evaluate an on-device Habibi-TTS speech engine for EZRA without changing or removing Groq, Supabase memory, speech recognition, wake-word handling, or the existing Android TTS fallback.

## Verified upstream facts
- Upstream installation is a Python package: `pip install habibi-tts`.
- Its declared runtime dependencies are `f5-tts>=1.1.5` and `torch>=2.4.0,<2.9.0`.
- The upstream inference examples use the Python CLI / Gradio interface and PyTorch checkpoints; the repository itself does not provide a ready-to-use Android SDK, Kotlin library, or React Native module.
- A separate community project, `OpenVoiceOS/phoonnx-f5tts`, publishes ONNX exports (transformer + preprocess + decode graphs) for Habibi checkpoints. Its `phoonnx` adapter is Python, so this is a model-export lead, not a ready Android integration.
- Important correction: the Unified vocabulary contains a LEV token, but its documentation says LEV had no training data. Do not claim working Levantine synthesis from that token. The meaningful trained dialect list is UNK/MSA/SAU/UAE/ALG/IRQ/EGY/MAR.
- Specialized ALG is available as an ONNX export; Specialized SAU is also available but has a non-commercial/share-alike license. Unified is likewise non-commercial/share-alike.
- Upstream states Unified, SAU and UAE model weights are CC-BY-NC-SA-4.0; ALG and the other listed specialized weights are Apache-2.0. The code is MIT.
- English is not among the Habibi dialect/model IDs. The separate F5-TTS base export is multilingual (including English) but has its own non-commercial license and would be a separate model path.

## Current EZRA integration
- EZRA is Expo SDK 54 / React Native 0.81.5.
- Current TTS is `expo-speech`, called from `App.tsx`.
- Text generation is served by the existing Supabase `smart-service` function using Groq. This must remain unchanged.
- Existing speech recognition and Android wake-word modules must remain unchanged.
- Current TTS is the fallback until a replacement has passed real-device tests.

## Device-only feasibility constraints
The OPPO A76 (Android 13, 6 GB RAM) cannot run the upstream Python CLI simply by adding the Python package to the Expo app. The ONNX export makes an Android-native port technically more plausible because ONNX Runtime has an Android package, but it still requires implementing the full multi-graph F5 inference loop, text tokenization/phonemization, reference-audio preprocessing, audio output, and model file management in native Android code.

Storage capacity alone does not solve runtime memory, CPU/accelerator compatibility, model conversion, or latency. ONNX Runtime's Android docs require the ONNX graphs to fit device disk and memory and recommend device-specific benchmarking. No claim of unlimited/offline operation is made until a complete model is packaged and measured on the target phone. A hosted inference endpoint would introduce external compute and potentially quotas/costs, so it does not satisfy the requested phone-only/offline goal.

## Safe implementation plan
1. Keep this work isolated on `ezra/habibi-android-spike`; do not merge into the active branch yet.
2. Use the community ONNX exports as the candidate artifact; inspect actual graph sizes, inputs/outputs, quantization, and license metadata before bundling.
3. Build a minimal Kotlin/Android ONNX Runtime proof of concept for ALG first. The Python `phoonnx` F5 adapter is a useful reference for the three-graph ODE pipeline, but it cannot be imported into the React Native app as-is.
4. Test Saudi using the SAU export only with its non-commercial/share-alike license respected. Treat Levantine as unsupported by the documented Habibi training data; do not label the untrained LEV token as supported. Test English as a separate F5-TTS base model, not as Habibi.
4. Add a React Native native-module adapter only after the Android proof of concept succeeds. Route speech output through that adapter when available, otherwise fall back to `expo-speech`.
5. Preserve all existing text, memory, recognition, wake-word and system-control flows. Do not alter Groq or Supabase secrets/functions for TTS.
6. Test on the actual OPPO A76: cold start, repeated utterances, memory pressure, thermal throttling, interruption/cancel, app background/foreground, and offline behavior.

## Current status
- Feasibility spike branch created.
- ONNX exports for Habibi ALG, Unified and SAU were located in the OpenVoiceOS model collection; the Android Runtime package exists, but no Android-native Habibi implementation has been verified.
- No app runtime code changed yet.
- Next technical gate: inspect/download the exact ONNX artifacts, implement a minimal Android inference spike, and benchmark it on the target phone before integrating it into EZRA.
