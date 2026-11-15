import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type SupertonicModelStatus = {
  installed: boolean;
  downloading: boolean;
  downloadedBytes: number;
  totalBytes: number;
  modelDirectory: string;
  missingFiles: string[];
};

export type SupertonicDownloadProgress = {
  file: string;
  fileIndex: number;
  fileCount: number;
  downloadedBytes: number;
  totalBytes: number;
  fileProgress: number;
};

export type SupertonicNativeModule = {
  getModelStatus(): Promise<SupertonicModelStatus>;
  downloadModel(): Promise<SupertonicModelStatus>;
  cancelDownload(): Promise<{ cancelled: boolean }>;
  initialize(): Promise<{ ready: boolean; engine: 'supertonic3'; language: string; voice: string }>;
  synthesize(text: string, language: 'ar' | 'en', outputPath: string, speed: number): Promise<{ path: string; bytes: number; sampleRate: number; durationSeconds: number }>;
  playAudio(path: string): Promise<{ playing: true }>;
  stopAudio(): Promise<{ stopped: true }>;
  shutdown(): Promise<{ ready: false }>;
  addListener(
    eventName: 'onDownloadProgress' | 'onDownloadError' | 'onDownloadComplete',
    listener: (event: SupertonicDownloadProgress | { message: string } | SupertonicModelStatus) => void
  ): { remove(): void };
};

const Supertonic3 = Platform.OS === 'android'
  ? requireNativeModule<SupertonicNativeModule>('EzraSupertonic3')
  : null;

export default Supertonic3;
