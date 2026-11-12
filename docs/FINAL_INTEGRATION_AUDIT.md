# EZRA AI — Final Integration Source Audit

Date: 2026-11-12
Branch: `ezra/habibi-android-spike`
Audited application revision: `4888c5ea4151958b64eccd1a8769ebb46d235212` (accessibility service source revision; validation in progress)
Phone parser helper: `f6f274f2b0fa906d44978c3bee6aa3ef2a6ed602`
Phase 7 attachment storage migration: `202611120001_chat_attachment_storage.sql`
Phone parser tests: `03bfe6929e43745572a080a882576e814dd14932`
Validation workflow test registration: `b07a50f511c71bd31260d9d21effce0537b985d8`

## Scope and evidence standard

This is a source-level integration review of the Expo/React Native application, Supabase Edge Function, Android native modules, and study/knowledge flows. A source-level finding is not a claim that the feature has been exercised on a physical Android device.

The previous application source revision `9d4bb15d80fe9fe2710d000c72351abc124cad60` has a successful EZRA CI run. The current document-format source revision `b2d64db046d250a91ba34a9e441d32796503a227` has a new validation run in progress.

## Integrated flows confirmed in source

### Application and navigation
- Expo SDK 54 app entry point registers `App`; Android application ID remains `com.halasemaoun.ezra`.
- Main destinations are Home/voice, Chat, and Settings.
- Settings, conversation history, memory center, and learning tools are mounted in the application.
- Android hardware-back handling returns from Chat to Home; native Modal close requests are handled by their modal callbacks.

### Authentication, chat, and AI service
- Supabase Auth session is used for authenticated chat operations.
- Mobile chat reads/writes are filtered by the current owner and conversation ID; database RLS is also defined in the private-owner migration.
- The app invokes the `smart-service` Edge Function through the Supabase client. The function validates the bearer token against Supabase Auth before processing requests.
- Groq credentials are read only from Edge Function secrets. The mobile client contains only the Supabase publishable key.
- Text requests route to `openai/gpt-oss-120b`; image requests route to `qwen/qwen3.8-27b`.
- The app supplies recent conversation context, current assistant mode, response preferences, companion profile, relevant local knowledge excerpts, and relevant dental learning references.
- Approved memories are now loaded once by the authenticated Edge Function using the caller's JWT and owner ID. The redundant client-side approved-memory query and duplicate prompt injection were removed in revision `1da56b2`.
- Android contact-call command parsing now lives in a pure helper. The prior call-name regex had double-escaped whitespace tokens and could fail to match normal phrases; revision `1017ab8` uses the helper, with Arabic/English regression cases added and registered in CI.
- AI request timeouts, provider errors, empty replies, and message-save failures have explicit UI error paths in the app.

### Memories and privacy
- New memory suggestions are inserted as `pending`; the user can approve, reject, and delete entries from the memory center.
- The Edge Function selects only `approved` memories for the authenticated owner, with a bounded result count and lookup timeout.
- Row-level policies in the private-owner migration restrict chat and memory rows to the owner.
- The mobile app does not use a service-role key. Do not expose any private provider credentials.

### Voice and Android integration
- Speech recognition is configured for Arabic (Algerian locale `ar-DZ`) or English (`en-US`) according to the selected response language.
- System TTS is available as a fallback. The Habibi native module exposes device capacity, model initialization, synthesis, playback, stop, and shutdown APIs.
- The wake-word module exposes a foreground microphone service, pending-command handoff, and explicit Android actions for contacts, dialer, SMS composer, alarm/timer, flashlight, volume/media, app launch, and system settings.
- The app requests microphone and (Android 13+) notification permission before enabling background wake. Direct calls and SMS use `CALL_PHONE` and `SEND_SMS` only after Android runtime permission grants; SMS submission is not proof of carrier delivery.
- Voice screenshot commands are parsed locally and start Android's MediaProjection consent UI. After approval, a dedicated foreground service captures one frame and saves it to the device gallery under `Pictures/EZRA`; Android can request consent again for later sessions.
- Android native module manifests and the wake-word config plugin declare the microphone wake service, the MediaProjection screenshot service, and an opt-in AccessibilityService. The accessibility service searches the active accessibility tree only when an explicit click command is issued; it does not retain or transmit node text. Click, scroll, and global navigation commands are parsed locally; high-impact button labels require an in-app confirmation. Regression tests are registered in CI.

### Dental, study, and knowledge flows
- Companion, Dentist, and Study modes have separate guidance and mode suggestions.
- Dentist/Study requests can retrieve relevant built-in dental reference notes.
- The learning center includes dental references, flashcards, quiz questions, and clinical case simulations.
- Study progress is stored locally and restored before persistence is allowed to write initial state.
- The local knowledge library supports TXT, Markdown, CSV, JSON, PDF, DOCX, PPTX, and XLSX. Office/PDF files are parsed locally into text; question-relevant excerpts are selected and sent to the AI service.

## Integration repair in this audit

1. Removed the second approved-memory fetch from `App.tsx`. Previously, the client embedded approved memories in the user input while the Edge Function independently fetched and added the same approved memories to the system prompt. The server is now the single source for approved-memory prompt injection, reducing duplicate context and an unnecessary database request.
2. Fixed the Android contact-call parser by replacing the double-escaped whitespace regex with a reusable tested parser; added tests for Arabic, English, incomplete, and self-directed phrases.
3. Updated `README.md` so feature descriptions and limitations match the current source implementation rather than the earlier project baseline.

## Known limitations and open verification items

1. **Previously stored metadata-only chat attachments cannot be restored.** New chat attachments use the private owner-scoped bucket and short-lived signed URLs; the storage migration is applied and its schema, bucket, and policies were verified.
2. **Knowledge-library runtime sync is not end-to-end device-verified.** The account table and owner policies are installed, and source regression/build checks pass. A signed-in upload, sign-out/sign-in restore on a second device, and cross-user denial test have not been executed.
3. **Document extraction has known limits.** Message attachments and the knowledge library now support TXT, MD, CSV, JSON, PDF, DOCX, PPTX, and XLSX. Extracted text is capped at 1 MiB per document; source files are capped at 5 MiB. Scanned/image-only PDFs do not receive OCR, and password-protected documents must be unlocked before import. Parser integration against real document fixtures still needs dedicated automated coverage.
4. **Habibi inference is not runtime-verified.** Native compilation does not prove model compatibility, memory sufficiency, successful inference, or audio playback on the target device.
5. **Wake-word reliability is device-dependent.** Android speech-recognition provider behavior, foreground-service restrictions, OEM battery management, and notification permission can affect background listening.
6. **React Native behavioral test coverage is limited.** The repository has Deno tests for Edge Function auth/persona/Groq contracts and source/build checks, but no dedicated React Native component/integration test runner is configured.
7. **No physical-device runtime check is claimed.** CI compilation and bundle export are not substitutes for running the installed application.

## Validation status

Latest confirmed EZRA CI success is run `43307038966` on application source revision `9d4bb15d80fe9fe2710d000c72351abc124cad60`:
- Knowledge-library synchronization regression tests: success.
- Supabase Edge Function type-check and tests: success.
- Expo configuration/dependency checks: success.
- Android Kotlin compilation: success.
- TypeScript check: success.
- Android JS bundle export: success.

This CI result verifies source tests and compilation/bundling, not authenticated app runtime behavior on a physical device.

## Acceptance rule

A feature is marked **implemented** when its source integration exists. It is marked **automated/build-verified** only when a repeatable test or the relevant CI job passes on the audited revision. Runtime verification remains separate and must never be inferred from source inspection or CI compilation.


## Phase 7 — persistent chat attachments (source implementation)

- Chat image and supported document attachments (TXT/MD/CSV/JSON/PDF/DOCX/PPTX/XLSX) are uploaded to the private `ezra-chat-attachments` bucket before the message is saved. Office/PDF text is extracted locally for the current AI request.
- Storage paths are namespaced by authenticated user ID, conversation ID, and message ID.
- The migration creates the private bucket, limits objects to 5 MiB and the supported MIME types, adds attachment metadata columns, and scopes Storage select/insert/delete policies to the authenticated user's first path segment. Migration `ezra_document_format_support` expands the allowed MIME types for PDF/DOCX/PPTX/XLSX without changing the private owner-scoped policies.
- Conversation restore requests one-hour signed URLs for stored attachments. The attachment chip opens the signed URL; image previews use the same private URL.
- Deleting a conversation also attempts to remove its stored objects.
- Upload failure prevents the message from being saved; a failed message insert triggers best-effort removal of the just-uploaded object.
- **Supabase migration applied:** `ezra_private_chat_attachment_storage` was applied successfully to the existing `EZRA AI` Supabase project (`qjqbgbbrzovimyutzvps`). A verification query confirmed all three attachment columns, the private 5 MiB bucket, and all three owner-scoped Storage policies.
- **Remaining verification boundary:** schema, bucket configuration, and policies are verified. An authenticated end-to-end upload, signed-URL restore, and cross-user denial test has not been run, so do not claim those runtime flows were tested.


## Phase 8 — account-synchronized knowledge library

- The app keeps an owner-scoped AsyncStorage cache and synchronizes knowledge documents with `public.knowledge_documents` after authentication.
- Cloud rows are filtered by the authenticated owner. The database enforces RLS for select/insert/update/delete and grants CRUD only to `authenticated`; anonymous access is revoked.
- The local/cloud merge chooses the most recently updated copy, retains deletion tombstones so stale devices do not immediately resurrect deleted documents, and caps active documents at eight.
- New files are parsed locally and stored as extracted UTF-8 text. Source files are limited to 5 MiB, extracted text to 1 MiB per document, and active library items to eight. New documents are written to the local cache first, then upserted to the account table. A temporary cloud failure leaves the local copy available and exposes a sync error/retry state.
- The legacy unscoped local library key is migrated into the signed-in user's scoped cache on first load.
- Migration `20261112210427_knowledge_library_sync.sql` is present in the repository and was applied to the EZRA AI Supabase project (`qjqbgbbrzovimyutzvps`) as migration `ezra_knowledge_library_sync`.
- Database verification confirmed the table, eight columns, RLS enabled, four owner-scoped policies, authenticated CRUD grants, and no anonymous SELECT grant.
- Regression tests cover legacy normalization, cloud mapping, latest-copy merge, eight-document cap, owner payload mapping, and deletion tombstones. `src/documents/documentTextUtils_test.ts` covers HTML cleanup/entity decoding, supported format detection, and query-relevant excerpt selection.
- CI run `43307038966` on `9d4bb15d80fe9fe2710d000c72351abc124cad60` passed the knowledge-sync test, Expo checks, TypeScript check, Android Kotlin compilation, and Android bundle export.
- **Remaining verification boundary:** the authenticated app-level cloud upload/restore and cross-user denial flows have not been exercised end-to-end.


## Phase 10 — PDF and Office document support (source implementation)

- Added a shared local extraction path for PDF, DOCX, PPTX, and XLSX through the Ream parser; existing TXT, MD, CSV, and JSON support remains.
- The knowledge library stores extracted text, not binary source files, with an eight-document cap, a 5 MiB source-file limit, and a 1 MiB extracted-text limit per document.
- Chat attachments retain the original file in the private `ezra-chat-attachments` bucket (5 MiB maximum) while extracted text is supplied to the AI request. Relevant excerpts are selected against the user's question within a 12,000-character context budget.
- Supabase migration `ezra_document_format_support` was applied to the correct `EZRA AI` project (`qjqbgbbrzovimyutzvps`). Verification confirmed the knowledge content/size checks are 1 MiB and the private attachment bucket allows PDF, DOCX, PPTX, and XLSX MIME types while retaining its 5 MiB limit.
- **Known boundary:** scanned/image-only PDFs do not have OCR; password-protected documents must be unlocked before import. Parser coverage currently tests text cleanup and selection helpers, not full binary fixtures for every format.
- **Validation:** GitHub Actions run `43317942617` on revision `b2d64db046d250a91ba34a9e441d32796503a227` was in progress at the time of this audit update.

## Phase 11 — Expanded Android phone commands (source implementation)

- Added Arabic/English command parsing for opening the system file picker, Downloads, notification shade, notification settings, and media transport (play, pause, stop, next, previous).
- Added native Android ACTION_OPEN_DOCUMENT support and a Downloads UI intent with a document-picker fallback.
- Notification shade display uses the existing optional AccessibilityService global action. Notification settings now target EZRA's app-specific notification settings page; this feature does not read notification contents.
- Existing alarm and timer actions use Android Clock intents with the skip-UI preference enabled when supported; Android or the installed Clock app may still show a confirmation screen. Alarm phrase parsing accepts both “منبه” and “المنبه”.
- Media controls dispatch Android media key events to the active session; app support varies. Existing quick settings deep links remain available.
- Added Deno regression tests in src/phone/phoneActionCommands_test.ts and added the suite to GitHub Actions.
- Verification boundary: source parser tests and CI checks do not prove every OEM file manager, notification shade, Clock app, or media session behaves identically. Notification shade requires the user to enable EZRA AccessibilityService.
