# EZRA

Private personal AI companion built with Expo and React Native.

## Current app foundation

- Android and iOS app configuration through Expo SDK 54.
- Dark, burgundy and pink EZRA chat interface with an animated 2D orb.
- Email/password sign-in through Supabase Auth.
- AI text replies through the private `smart-service` Supabase Edge Function (Groq provider key stays server-side).
- Conversation messages stored in Supabase and separated by conversation ID.
- Conversation history screen.
- Arabic speech-to-text input through the device speech-recognition service.
- Text-to-speech playback for EZRA messages using the device voice engine.
- Photo and document selection; currently only the attachment name and type are stored with the message.
- User-controlled memory center: users can add memory suggestions, approve or reject them, and delete memories; only approved memories are retrieved for that authenticated owner and supplied to EZRA when generating replies.
- Android preview APK build profile through EAS Build.
- GitHub Actions checks for Expo configuration, TypeScript, and Android bundling.

## Current limitations

- Selected photos and documents are not uploaded or analyzed by the AI yet.
- Voice input depends on the device speech-recognition service; native speech modules require an EAS build and are not supported by standard Expo Go.
- The orb is currently a 2D animated React Native illustration, not a 3D model.
- Some planned EZRA areas (phone controls, Dental AI, advanced voice conversation, and full personalization) are not implemented yet.
- No API keys or private service credentials belong in this repository or in the mobile app.

## Privacy and cost

- User data is protected by Supabase Row Level Security owner policies.
- Provider credentials are kept in server-side Supabase function secrets.
- The app uses the configured provider's available free quota; free-tier limits can change and service may pause when quota is exhausted.
- No paid plan or billing upgrade is required or enabled by this repository.

## Requirements

- Node.js 20.19.4 or newer in the Node 20 line.
- npm.
- An Expo account for EAS cloud builds.
- An Android device for installing the preview APK.

## Install and validate

```bash
npm install
npx expo-doctor
npm run typecheck
npx expo export --platform android
```

Because EZRA uses native speech recognition, create and install an EAS preview build rather than relying on Expo Go:

```bash
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
```

Keep the generated Expo project ID in the repository. Never commit provider keys, Supabase service-role keys, or other private credentials.
