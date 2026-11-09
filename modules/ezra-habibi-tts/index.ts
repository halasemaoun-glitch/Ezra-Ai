import { requireNativeModule } from 'expo-modules-core';

export type HabibiRuntimeInfo = {
  available: boolean;
  runtime: string;
  androidApi: number;
};

type HabibiTtsNativeModule = {
  getRuntimeInfo(): Promise<HabibiRuntimeInfo>;
  inspectModelFile(path: string): Promise<{
    exists: boolean;
    readable: boolean;
    bytes: number;
    absolutePath: string;
  }>;
};

export default requireNativeModule<HabibiTtsNativeModule>('EzraHabibiTts');
