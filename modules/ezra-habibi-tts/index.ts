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

type HabibiTtsNativeModule = {
  getRuntimeInfo(): Promise<HabibiRuntimeInfo>;
  getDeviceCapacity(): Promise<HabibiDeviceCapacity>;
  inspectModelFile(path: string): Promise<{
    exists: boolean;
    readable: boolean;
    bytes: number;
    absolutePath: string;
  }>;
};

export default requireNativeModule<HabibiTtsNativeModule>('EzraHabibiTts');
