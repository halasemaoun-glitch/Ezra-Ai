import { requireNativeModule } from 'expo-modules-core';

export type AudarDeviceCapacity = {
  availableRamBytes: number;
  totalRamBytes: number;
  lowMemory: boolean;
  availableStorageBytes: number;
};

export type AudarSynthesisResult = {
  path: string;
  bytes: number;
  sampleRate: number;
};

type EzraAudarTtsNativeModule = {
  getDeviceCapacity(): Promise<AudarDeviceCapacity>;
  initialize(modelPath: string): Promise<{ ready: true; voice: 'demo_male_3'; decoder: string }>;
  synthesize(text: string, outputPath: string): Promise<AudarSynthesisResult>;
  playAudio(path: string): Promise<{ playing: true }>;
  stopAudio(): Promise<{ stopped: true }>;
  shutdown(): Promise<{ ready: false }>;
  addListener(eventName: 'onPlaybackFinished' | 'onPlaybackError', listener: (event: { path?: string; what?: number; extra?: number }) => void): { remove(): void };
};

export default requireNativeModule<EzraAudarTtsNativeModule>('EzraAudarTts');
