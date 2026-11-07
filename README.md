# EZRA

Private, single-owner personal companion app built with Expo and React Native.

## Current app foundation

- Native Android and iOS project configuration through Expo SDK 54.
- Dark chat interface.
- Chat history saved locally on the device with AsyncStorage.
- Speech-to-text input through the device speech-recognition service.
- Text-to-speech playback for EZRA messages using the device voice engine.
- Photo and document selection from the device.
- Android APK preview build profile through EAS Build.
- GitHub Actions workflow for dependency, TypeScript, and Android bundle checks.

## Important current limitations

- The chat screen is not connected to an AI model yet. Messages are stored locally; no generated AI replies are claimed.
- Picked files and photos are attached to local message records only. They are not uploaded to an AI service yet.
- Speech recognition and native modules require an EAS development/preview build. They do not run inside the standard Expo Go app.
- No API keys or private service credentials belong in this repository or in the mobile app.

## Requirements

- Node.js 20.19.4 or newer in the Node 20 line.
- npm.
- An Expo account for EAS cloud builds.
- An Android device for installing the preview APK.

## Install and run

```bash
npm install
npx expo-doctor
npm run typecheck
npx expo start
```

Because EZRA uses native speech recognition, create and install an EAS build rather than relying on Expo Go:

```bash
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
```

The first EAS setup may add an Expo project ID to `app.json`. Keep that generated ID in the repository.

## Next integration stage

Before AI chat can work, connect a private backend and configure its secrets outside GitHub source files. The backend must authenticate the single owner, keep provider keys server-side, and enforce owner-only access to messages and any explicitly approved memories.
