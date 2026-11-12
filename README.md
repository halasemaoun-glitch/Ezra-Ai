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
- Local knowledge library for TXT, Markdown, CSV, JSON, PDF, DOCX, PPTX, and XLSX documents (up to 8 files, with up to 5 MB per source file and 1 MB of extracted text per library item). Relevant excerpts may be sent with a question to the AI service.
- One-off message attachments: images can be sent for AI image analysis; TXT, MD, CSV, JSON, PDF, DOCX, PPTX, and XLSX documents are text-extracted for the current request (up to 5 MB per source file and 1 MB of extracted text).
- Arabic/English speech recognition, system text-to-speech fallback, and an optional local Habibi TTS native engine.
- Android wake-word foreground service and phone actions including flashlight, volume/media controls, app/system settings, alarms/timers, contact lookup, direct phone calls, and direct SMS after the corresponding Android permissions are granted.
- Voice screenshot commands (for example, “EZRA, take a screenshot”) launch Android's official screen-capture consent prompt, then save the approved capture to `Pictures/EZRA` in the device gallery.
- Optional Android AccessibilityService integration lets the user explicitly enable EZRA in system settings, then issue semantic button clicks, scroll, Back/Home, notifications, and quick-settings commands. High-impact button labels (send, delete, payment, purchase, confirmation) require an in-app confirmation first.

## Important limitations

- New chat attachments use a private, owner-scoped Supabase Storage bucket with short-lived signed URLs. Migration `ezra_private_chat_attachment_storage` has been applied to the EZRA AI Supabase project and its schema, bucket, and owner-scoped policies were verified. Previously saved metadata-only attachments cannot be restored.
- PDF and Office document extraction runs locally in the app through the Ream parser. The current implementation extracts embedded text; scanned/image-only PDFs do not receive OCR, and password-protected files must be unlocked before import.
- The knowledge library keeps a local device cache and synchronizes extracted text with the `knowledge_documents` table. Row Level Security restricts each account to its own files. The database allows up to 1 MB of extracted text per document; signed-in multi-device restore and cross-account denial still need end-to-end runtime verification.
- Habibi TTS requires a large model download and suitable free RAM/storage. Its Android native code is compiled by CI, but actual model inference and playback still require runtime verification on a device. Android system TTS remains the fallback.
- Wake-word recognition depends on Android's speech-recognition provider, microphone/notification permissions, foreground-service rules, and manufacturer battery-management behavior.
- Android requires the user to approve screen capture through its system prompt. The approval is session-scoped and may be requested again for later captures; protected app content may appear black. Calls and SMS require explicit permissions, and SMS submission does not guarantee carrier delivery.
- Accessibility control is opt-in and must be enabled manually by the user in Android Settings. EZRA only searches the active accessibility tree when the user gives a supported action; the service does not log or transmit screen text. Controls without accessible labels, custom canvas controls, and apps that restrict accessibility may not respond.
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

## Android phone command expansion (source implementation)

- File and downloads commands use Android's Storage Access Framework or Downloads UI. EZRA opens the system picker; the user chooses which file to view or share.
- Notification shade commands use the optional, user-enabled AccessibilityService global action. Notification settings open the app-specific Android notification settings page. EZRA does not silently read notification contents.
- Alarm and timer commands request direct creation through Android Clock when supported; some clock apps may still display a confirmation screen.
- Media commands dispatch play, pause, stop, next, and previous media keys to the active Android media session. The result depends on the media app and its active session.
- Existing deep links cover Wi-Fi, Internet, Bluetooth, sound, display, location, battery, storage, date/time, privacy, security, language, default apps, and EZRA app permissions.
- Deno parser tests cover Arabic/English file, downloads, notification, and media commands. Android intents and Kotlin compilation are checked by CI; behavior still depends on the device's installed apps and Android permissions.
