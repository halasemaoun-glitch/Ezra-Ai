import { requireNativeModule } from 'expo-modules-core';

export type HabibiRuntimeInfo = {
  available: boolean;
  runtime: string;
  androidApi: number;
};

export type HabibiDeviceCapacity = {
  totalRamBytes: number;
  availableRamBytes: number;
  lowMemory: boolean;
  runtimeMaxHeapBytes: number;
  runtimeFreeHeapBytes: number;
  availableAppStorageBytes: number;
  androidApi: number;
};

export type HabibiInitialization = {
  ready: boolean;
  engine: 'habibi-tts';
  dialect: string;
};

export type HabibiSynthesisResult = {
  path: string;
  bytes: number;
};

type HabibiTtsNativeModule = {
  getRuntimeInfo(): Promise<HabibiRuntimeInfo>;
  getDeviceCapacity(): Promise<HabibiDeviceCapacity>;
  inspectModelFile(path: string): Promise<{
    exists: boolean;
    readable: boolean;
    bytes: number;
    absolutePath: string;
  }>;
  initialize(
    modelPath: string,
    referenceWavPath: string,
    transcript: string,
    dialect: string,
    threads: number
  ): Promise<HabibiInitialization>;
  synthesize(text: string, outputPath: string): Promise<HabibiSynthesisResult>;
  playAudio(path: string): Promise<{ playing: true }>;
  stopAudio(): Promise<{ stopped: true }>;
  shutdown(): Promise<{ ready: false }>;
  addListener(eventName: 'onPlaybackFinished' | 'onPlaybackError', listener: (event: { path?: string; what?: number; extra?: number }) => void): { remove(): void };
};

export default requireNativeModule<HabibiTtsNativeModule>('EzraHabibiTts');
