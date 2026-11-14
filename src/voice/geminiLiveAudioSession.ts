import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import {
  connectEzraGeminiLive,
  type GeminiLiveConnection,
} from './geminiLiveConnection';

type AudioChunkEvent = { data: string; mimeType: string };
type AudioErrorEvent = { message: string };

type EzraLiveAudioNative = {
  startRecording: () => Promise<{ started: boolean; sampleRate: number }>;
  stopRecording: () => Promise<{ stopped: boolean }>;
  startPlayback: () => Promise<{ started: boolean; sampleRate: number }>;
  playPcmChunk: (base64Pcm: string) => Promise<{ writtenBytes: number }>;
  clearPlayback: () => Promise<{ cleared: boolean }>;
  stopPlayback: () => Promise<{ stopped: boolean }>;
  addListener: (
    eventName: 'onAudioChunk' | 'onAudioError',
    listener: (event: AudioChunkEvent | AudioErrorEvent) => void,
  ) => { remove: () => void };
};

export type EzraLiveVoiceCallbacks = {
  onReady?: () => void;
  onInputTranscript?: (text: string, finished: boolean) => void;
  onOutputTranscript?: (text: string, finished: boolean) => void;
  onTurnComplete?: () => void;
  onInterrupted?: () => void;
  onError?: (message: string) => void;
  onClosed?: (code: number, reason: string) => void;
};

export type EzraLiveVoiceSession = {
  sendText: (text: string) => void;
  stop: () => Promise<void>;
};

const NativeLiveAudio = Platform.OS === 'android'
  ? requireNativeModule<EzraLiveAudioNative>('EzraLiveAudio')
  : null;

function transcriptionText(value: any): string {
  return typeof value?.text === 'string' ? value.text : '';
}

/** Starts a native 16 kHz microphone and streams it to Gemini Live. */
export async function startEzraLiveVoiceSession(
  responseLanguage: 'ar' | 'en',
  callbacks: EzraLiveVoiceCallbacks = {},
): Promise<EzraLiveVoiceSession> {
  if (Platform.OS !== 'android' || !NativeLiveAudio) {
    throw new Error('المحادثة الصوتية المباشرة متاحة حاليًا على Android فقط.');
  }

  let active = true;
  let playbackGeneration = 0;
  let playbackQueue = Promise.resolve();
  let connection: GeminiLiveConnection | null = null;
  let micSubscription: { remove: () => void } | null = null;
  let errorSubscription: { remove: () => void } | null = null;
  let stopped = false;

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    active = false;
    playbackGeneration += 1;
    micSubscription?.remove();
    errorSubscription?.remove();
    micSubscription = null;
    errorSubscription = null;
    try { connection?.endAudioStream(); } catch {}
    try { await NativeLiveAudio.stopRecording(); } catch {}
    try { await NativeLiveAudio.stopPlayback(); } catch {}
    connection?.close();
    connection = null;
  };

  try {
    connection = await connectEzraGeminiLive(responseLanguage, {
      onOpen: () => callbacks.onReady?.(),
      onMessage: message => {
        if (!active) return;
        const serverContent = message?.serverContent;
        if (serverContent?.interrupted) {
          playbackGeneration += 1;
          playbackQueue = Promise.resolve();
          void NativeLiveAudio.clearPlayback().catch(error => {
            callbacks.onError?.(error instanceof Error ? error.message : 'تعذّر إيقاف الصوت فورًا.');
          });
          callbacks.onInterrupted?.();
        }

        const inputText = transcriptionText(message?.inputTranscription ?? serverContent?.inputTranscription);
        if (inputText) callbacks.onInputTranscript?.(inputText, true);
        const interimInput = transcriptionText(message?.interimInputTranscription ?? serverContent?.interimInputTranscription);
        if (interimInput) callbacks.onInputTranscript?.(interimInput, false);

        const outputText = transcriptionText(message?.outputTranscription ?? serverContent?.outputTranscription);
        if (outputText) callbacks.onOutputTranscript?.(outputText, false);

        const parts = serverContent?.modelTurn?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            const audio = part?.inlineData;
            if (typeof audio?.data !== 'string' || !audio.data) continue;
            const generation = playbackGeneration;
            playbackQueue = playbackQueue.then(async () => {
              if (!active || generation !== playbackGeneration) return;
              await NativeLiveAudio.playPcmChunk(audio.data);
            }).catch(error => {
              if (active && generation === playbackGeneration) {
                callbacks.onError?.(error instanceof Error ? error.message : 'تعذّر تشغيل صوت Gemini.');
              }
            });
          }
        }

        if (serverContent?.turnComplete) {
          const finalOutput = transcriptionText(serverContent?.outputTranscription ?? message?.outputTranscription);
          if (finalOutput) callbacks.onOutputTranscript?.(finalOutput, true);
          callbacks.onTurnComplete?.();
        }
      },
      onError: message => callbacks.onError?.(message),
      onClose: (code, reason) => {
        if (active) callbacks.onClosed?.(code, reason);
      },
    });

    await NativeLiveAudio.startPlayback();
    micSubscription = NativeLiveAudio.addListener('onAudioChunk', event => {
      if (!active || !connection || !('data' in event)) return;
      try {
        connection.sendAudio(event.data);
      } catch (error) {
        callbacks.onError?.(error instanceof Error ? error.message : 'تعذّر إرسال صوت الميكروفون.');
      }
    });
    errorSubscription = NativeLiveAudio.addListener('onAudioError', event => {
      if (active && 'message' in event) callbacks.onError?.(event.message);
    });
    await NativeLiveAudio.startRecording();
  } catch (error) {
    await stop();
    throw error;
  }

  return {
    sendText: text => {
      if (!active || !connection) throw new Error('جلسة الصوت غير متاحة.');
      connection.sendText(text);
    },
    stop,
  };
}
