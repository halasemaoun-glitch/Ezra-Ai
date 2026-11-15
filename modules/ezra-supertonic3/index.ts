import { requireNativeModule } from 'expo-modules-core';

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

type SupertonicNativeModule = {
  getModelStatus(): Promise<SupertonicModelStatus>;
  downloadModel(): Promise<SupertonicModelStatus>;
  cancelDownload(): Promise<{ cancelled: boolean }>;
  addListener(
    eventName: 'onDownloadProgress' | 'onDownloadError' | 'onDownloadComplete',
    listener: (event: SupertonicDownloadProgress | { message: string } | SupertonicModelStatus) => void
  ): { remove(): void };
};

export default requireNativeModule<SupertonicNativeModule>('EzraSupertonic3');
