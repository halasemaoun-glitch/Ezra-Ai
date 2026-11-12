# EZRA Feature Verification Matrix

Branch: `ezra/habibi-android-spike`
Baseline revision: `2803b8544e69fa153125d38cead26e3e31b066cf`

This matrix separates implementation evidence from proof of behavior. A component, native-module manifest, or UI control is not considered verified merely because it exists in source.

## Verification levels

- **Implemented**: source code and integration path exist.
- **Automated**: a repeatable test exercises the behavior or contract.
- **Build-verified**: the relevant TypeScript/Android compilation or bundle step passes.
- **Runtime-verified**: the behavior has been observed running in the target environment.

## Feature matrix

| Feature | Implementation evidence | Automated coverage at baseline | Additional verification required |
|---|---|---|---|
| AI request, response parsing, Groq contract | `supabase/functions/smart-service/groq.ts` | Deno contract tests | Expand edge cases; verify app-to-function request integration |
| Session authentication and ownership | `auth.ts`, `index.ts` | Deno auth tests | Verify unauthorized, expired, malformed, and cross-user requests |
| EZRA persona and mode guidance | `persona.ts`, `src/modes/assistantModes.ts` | Deno persona tests; no dedicated mobile mode tests | Verify all three mode prompts and mode persistence |
| Home and 3D orb states | `App.tsx`, `src/EzraOrb3D.tsx` | No dedicated component tests | Verify idle/listening/thinking/speaking state transitions and reduced-motion behavior |
| Chat and conversation history | `App.tsx` | No dedicated mobile tests | Verify send/error/retry, new chat, history load/select, ownership and persistence |
| Voice input and speech output | `App.tsx`, `src/voice/voiceProfile.ts`, native modules | No dedicated voice-flow tests | Verify permissions, Arabic/English recognition, interruption, fallback TTS and playback lifecycle |
| Habibi TTS native engine | `modules/ezra-habibi-tts` | Module/config presence only | Verify model loading, synthesis, playback, stop/error events on Android |
| Wake word and phone actions | `modules/ezra-wake-word`, config plugin, `App.tsx` | Deno tests for call, settings, and screenshot command parsing; CI compiles native Kotlin | Verify foreground service, granted/denied permissions, direct calls/SMS, and action outcomes on Android |
| User-approved screen capture | `EzraScreenCapture.kt`, `EzraScreenCaptureService.kt`, `EzraWakeWordModule.kt`, `App.tsx` | Deno tests for Arabic/English screenshot command recognition; CI compiles Kotlin and checks config plugin | Verify Android consent/cancel flow, MediaProjection foreground service, gallery save, and protected-content behavior on Android |
| Memory | `App.tsx`, Supabase tables/functions | Backend auth tests only | Verify approval states, user isolation, save/edit/reject and approved-only prompt injection |
| Knowledge files and document extraction | `src/documents/documentExtractor.ts`, `src/documents/documentTextUtils.ts`, `App.tsx`, Ream parser | Deno tests for HTML-to-text cleanup, supported extensions, and relevant excerpt selection; current CI build pending | Exercise real PDF/DOCX/PPTX/XLSX fixtures, malformed/password-protected files, and signed-in persistence/retrieval |
| Dentist/study modes and dental references | `assistantModes.ts`, `studyLibrary.ts`, `LearningToolsModal.tsx` | Source audit only | Verify mode switching, reference retrieval, card/quiz flows and progress restoration |
| Clinical case simulator | `ClinicalCaseSimulator.tsx` | Source-level scenario checks only | Verify answer lock, feedback, completion callback and navigation |
| Settings and phone controls | `App.tsx`, native wake-word module | No dedicated mobile tests | Verify each setting persists and each action handles unavailable/denied permissions |
| Navigation and RTL/LTR | `App.tsx`, theme tokens | Source audit only | Verify all tabs, language direction and narrow-screen layouts |
| Android app interaction via AccessibilityService | `EzraAccessibilityService.kt`, `EzraWakeWordModule.kt`, `withEzraWakeWord.js`, `App.tsx`, `src/phone/accessibilityCommands.ts` | Deno tests cover Arabic/English click, scroll, global navigation parsing and high-impact action confirmation; CI prebuild checks the service manifest/resources and compiles Kotlin | Verify user opt-in, semantic button clicks, scroll, global actions, permission disable/re-enable, and apps with inaccessible/custom controls on Android |
| Accessibility and reduced motion | `App.tsx`, design system | Source audit only | Verify labels, touch targets, focus/contrast and reduced-motion behavior |

## Baseline gaps

1. The repository has dedicated Deno tests for the Supabase smart-service auth, persona, Groq contracts, knowledge sync, document text utilities, and phone/screenshot command parsing.
2. The React Native application currently has no dedicated component/integration test runner configured in `package.json`.
3. Most client-side features live in the large `App.tsx` module. This makes isolated behavioral tests difficult and increases the risk of treating source inspection as proof.
4. Native TTS and wake-word behavior requires Android runtime verification; compiling their Kotlin code alone cannot prove model inference, microphone lifecycle, or audio playback.
5. The existing Android validation workflow compiles Kotlin and exports the Android JS bundle. It does not currently assemble a signed or installable APK.

## Acceptance rule

A feature is marked **verified** only when its behavior has a repeatable automated test or an explicitly recorded runtime check. Source presence and static inspection remain useful evidence, but are not substitutes for behavioral verification. Any unverified behavior must remain visibly marked as pending.

| Expanded Android phone actions | phoneActionCommands.ts, EzraWakeWordModule.kt, App.tsx | Deno tests cover Arabic/English file manager, downloads, notification shade/settings, and media transport parsing; CI compiles Kotlin and checks TypeScript/bundle | Verify file picker/downloads UI, notification shade with Accessibility opt-in, Clock confirmation, and media-session behavior across Android apps |
| Direct SMS command matching | `src/phone/smsCommandParser.ts`, `App.tsx` | Deno tests cover Arabic/English commands, joined Arabic prepositions, incomplete requests, and unrelated text | Carrier submission/delivery and contact matching remain device/network dependent |
