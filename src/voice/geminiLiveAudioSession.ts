import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import {
  connectEzraGeminiLive,
  type GeminiLiveConnection,
} from './geminiLiveConnection';

type AudioChunkEvent = { data: string; mimeType: string; level?: number };
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
  onMicLevel?: (level: number) => void;
  onInputTranscript?: (text: string, finished: boolean) => void;
  onOutputTranscript?: (text: string, finished: boolean) => void;
  onAssistantAudioStarted?: () => void;
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
  let interruptedAwaitingTurnComplete = false;
  let playbackQueue = Promise.resolve();
  let connection: GeminiLiveConnection | null = null;
  let resumptionHandle: string | null = null;
  let resumeInProgress = false;
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
        const resumptionUpdate = message?.sessionResumptionUpdate;
        if (resumptionUpdate?.resumable && typeof resumptionUpdate.newHandle === 'string') {
          resumptionHandle = resumptionUpdate.newHandle;
        }
        const serverContent = message?.serverContent;
        if (serverContent?.interrupted) {
          interruptedAwaitingTurnComplete = true;
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
            callbacks.onAssistantAudioStarted?.();
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

        if (serverContent?.turnComplete && interruptedAwaitingTurnComplete) {
          interruptedAwaitingTurnComplete = false;
          return;
        }
        if (serverContent?.turnComplete) {
          const finalOutput = transcriptionText(serverContent?.outputTranscription ?? message?.outputTranscription);
          if (finalOutput) callbacks.onOutputTranscript?.(finalOutput, true);
          callbacks.onTurnComplete?.();
        }
      },
      onError: message => {
        // A transport error is followed by onClose; let session resumption run first.
        if (/انقطع الاتصال بخدمة Gemini Live/.test(message)) return;
        callbacks.onError?.(message);
      },
      onClose: (code, reason) => {
        if (!active) return;
        if (
          resumptionHandle &&
          connection &&
          Date.now() < connection.expiresAt &&
          !resumeInProgress
        ) {
          resumeInProgress = true;
          const handle = resumptionHandle;
          void connection.resume(handle).then(() => {
            resumeInProgress = false;
          }).catch(error => {
            resumeInProgress = false;
            if (active) callbacks.onClosed?.(
              code,
              error instanceof Error ? error.message : (reason || 'تعذّر استئناف جلسة Gemini Live.'),
            );
          });
          return;
        }
        callbacks.onClosed?.(code, reason);
      },
    });

    await NativeLiveAudio.startPlayback();
    micSubscription = NativeLiveAudio.addListener('onAudioChunk', event => {
      if (!active || !('data' in event)) return;
      if (typeof event.level === 'number') callbacks.onMicLevel?.(event.level);
      if (!connection || connection.socket.readyState !== WebSocket.OPEN) return;
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
