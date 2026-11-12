# EZRA AI

Private personal AI companion built with Expo SDK 54 and React Native, with Android native modules for Habibi TTS and wake-word/phone integration.

## Current application

- Android app identity: `com.halasemaoun.ezra`.
- Dark burgundy/pink interface with Home, Chat, and Settings destinations and an animated orb.
- Supabase email/password authentication and owner-scoped conversation and memory data.
- AI replies through the authenticated `smart-service` Supabase Edge Function. The Groq provider key stays server-side.
- Text chat uses `openai/gpt-oss-120b`; image requests use the configured vision model `qwen/qwen3.8-27b`.
- Conversation history and user-approved memory personalization.
- Companion, Dentist, and Study modes with mode-specific guidance.
- Dental learning references, flashcards, quizzes, and clinical case simulations. These are educational tools, not remote diagnosis or treatment.
- Local knowledge library for TXT, Markdown, CSV, and JSON files (up to 8 files, with a 256 KB per-file library limit). Relevant excerpts may be sent with a question to the AI service.
- One-off message attachments: images can be sent for AI image analysis; TXT, MD, CSV, and JSON documents can be read as text for the current request.
- Arabic/English speech recognition, system text-to-speech fallback, and an optional local Habibi TTS native engine.
- Android wake-word foreground service and phone actions including flashlight, volume/media controls, app/system settings, alarm/timer intents, and contact lookup. Calls and SMS open the relevant Android app for the user to review and confirm.

## Important limitations

- New chat attachments use a private, owner-scoped Supabase Storage bucket with short-lived signed URLs. Migration `ezra_private_chat_attachment_storage` has been applied to the EZRA AI Supabase project and its schema, bucket, and owner-scoped policies were verified. Previously saved metadata-only attachments cannot be restored.
- Message-level document attachments currently support TXT, MD, CSV, and JSON only, up to 5 MB for persistent chat storage. PDF and Word extraction are not implemented.
- The knowledge library is stored locally on the device and is not synchronized to the user's account.
- Habibi TTS requires a large model download and suitable free RAM/storage. Its Android native code is compiled by CI, but actual model inference and playback still require runtime verification on a device. Android system TTS remains the fallback.
- Wake-word recognition depends on Android's speech-recognition provider, microphone/notification permissions, foreground-service rules, and manufacturer battery-management behavior.
- The orb is an animated 2D React Native illustration, not a 3D model.
- Groq free-tier availability and quotas can change. If the provider quota is exhausted, AI responses may be temporarily unavailable.

## Privacy and cost

- Supabase Row Level Security policies scope private chat and memory rows to their owner.
- The mobile app uses a Supabase publishable key. Never place a Supabase secret/service-role key or provider API key in the app or repository.
- Only approved memories are loaded by the authenticated Edge Function for AI personalization.
- Knowledge-library excerpts and current message attachments are sent to the AI provider when needed to answer a request.
- No paid plan or billing upgrade is enabled or required by this repository. Free-tier limits are controlled by the service providers and may change.

## Install and validate

Requirements: Node.js 20.19.4 (Node 20 line), npm, and Android SDK tooling for local Android compilation.

```bash
npm install
npx expo-doctor
npm run typecheck
npx expo export --platform android
```

The GitHub Actions validation workflow also checks the Supabase Edge Function and its Deno tests, Expo configuration, Android Kotlin compilation, and Android JS bundle export.

An installable Android preview build can be configured through EAS using the `preview` profile in `eas.json`. Native speech modules require a development/preview build; Expo Go alone does not include these custom native modules.

Never commit provider keys, Supabase secret/service-role keys, signing credentials, or other private credentials.
