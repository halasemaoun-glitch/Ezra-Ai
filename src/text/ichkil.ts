import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

type EzraIchkilNativeModule = {
  diacritizeArabic: (text: string) => Promise<string>;
};

const NativeIchkil = Platform.OS === 'android'
  ? requireNativeModule<EzraIchkilNativeModule>('EzraLiveAudio')
  : null;

/**
 * Add Arabic tashkeel on-device with the bundled EZRA native module.
 * The Ichkil model is downloaded once into app-private storage and verified
 * before first inference; subsequent calls work offline.
 */
export async function diacritizeArabicLocally(text: string): Promise<string> {
  if (!text || !/[\u0621-\u064A]/.test(text)) return text;
  if (!NativeIchkil) {
    throw new Error('التشكيل المحلي Ichkil متاح حاليًا على Android فقط.');
  }
  return NativeIchkil.diacritizeArabic(text);
}
