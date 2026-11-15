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
  awaitPlaybackComplete: () => Promise<{ completed: boolean }>;
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

const MAX_PENDING_MIC_CHUNKS = 50;

function transcriptionText(value: any): string {
  return typeof value?.text === 'string' ? value.text : '';
}

/**
 * Start Android microphone capture before the network handshake. Audio is
 * buffered briefly while the Gemini Live WebSocket is being authorized and
 * configured, so the user can speak immediately after tapping the mic.
 */
export async function startEzraLiveVoiceSession(
  responseLanguage: 'ar' | 'en',
  callbacks: EzraLiveVoiceCallbacks = {},
  voiceName = 'Charon',
): Promise<EzraLiveVoiceSession> {
  if (Platform.OS !== 'android' || !NativeLiveAudio) {
    throw new Error('المحادثة الصوتية المباشرة متاحة حاليًا على Android فقط.');
  }

  let active = true;
  let playbackGeneration = 0;
  let interruptedAwaitingTurnComplete = false;
  let receivedAudioForTurn = false;
  let playbackQueue = Promise.resolve();
  let connection: GeminiLiveConnection | null = null;
  let micSubscription: { remove: () => void } | null = null;
  let errorSubscription: { remove: () => void } | null = null;
  let stopped = false;
  const pendingMicChunks: string[] = [];
  const pendingText: string[] = [];

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
    pendingMicChunks.length = 0;
    pendingText.length = 0;
  };

  try {
    // Subscribe first, then start capture. Chunks are queued until Live is ready.
    micSubscription = NativeLiveAudio.addListener('onAudioChunk', event => {
      if (!active || !('data' in event)) return;
      if (typeof event.level === 'number') callbacks.onMicLevel?.(event.level);
      if (connection && connection.socket.readyState === WebSocket.OPEN) {
        try {
          connection.sendAudio(event.data);
        } catch (error) {
          callbacks.onError?.(error instanceof Error ? error.message : 'تعذّر إرسال صوت الميكروفون.');
        }
      } else {
        pendingMicChunks.push(event.data);
        if (pendingMicChunks.length > MAX_PENDING_MIC_CHUNKS) pendingMicChunks.shift();
      }
    });
    errorSubscription = NativeLiveAudio.addListener('onAudioError', event => {
      if (active && 'message' in event) callbacks.onError?.(event.message);
    });

    await NativeLiveAudio.startRecording();
    await NativeLiveAudio.startPlayback();

    // Resolve the session now; do not keep the mic button waiting for network.
    // The connection continues in the background and reports ready/failure by callback.
    void connectEzraGeminiLive(responseLanguage, voiceName, {
      onMessage: message => {
        if (!active) return;
        const serverContent = message?.serverContent;
        if (serverContent?.interrupted) {
          interruptedAwaitingTurnComplete = true;
          receivedAudioForTurn = false;
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
              const playback = await NativeLiveAudio.playPcmChunk(audio.data);
              if (playback.writtenBytes > 0) receivedAudioForTurn = true;
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
          const completedGeneration = playbackGeneration;
          void playbackQueue.then(async () => {
            if (!active || completedGeneration !== playbackGeneration) return;
            const hadAudio = receivedAudioForTurn;
            receivedAudioForTurn = false;
            if (!hadAudio) {
              callbacks.onError?.('أكمل Gemini الرد دون إرسال صوت قابل للتشغيل؛ سأحوّل الرد إلى محرك الصوت الاحتياطي.');
              return;
            }
            const playback = await NativeLiveAudio.awaitPlaybackComplete();
            if (playback.completed && active && completedGeneration === playbackGeneration) {
              callbacks.onTurnComplete?.();
            } else if (active && completedGeneration === playbackGeneration) {
              callbacks.onError?.('لم يكتمل إخراج صوت Gemini على الجهاز؛ سأحوّل إلى محرك الصوت الاحتياطي.');
            }
          }).catch(error => {
            if (active && completedGeneration === playbackGeneration) callbacks.onError?.(
              error instanceof Error ? error.message : 'تعذّر إكمال تشغيل صوت Gemini.',
            );
          });
        }
      },
      onError: message => {
        if (active) callbacks.onError?.(message);
      },
      onClose: (code, reason) => {
        if (active) callbacks.onClosed?.(code, reason || 'انتهت جلسة Gemini Live.');
      },
    }).then(nextConnection => {
      if (!active) {
        nextConnection.close();
        return;
      }
      connection = nextConnection;
      for (const chunk of pendingMicChunks.splice(0)) {
        if (!active || nextConnection.socket.readyState !== WebSocket.OPEN) break;
        try { nextConnection.sendAudio(chunk); } catch (error) {
          callbacks.onError?.(error instanceof Error ? error.message : 'تعذّر إرسال الصوت المحفوظ مؤقتًا.');
          break;
        }
      }
      for (const text of pendingText.splice(0)) {
        if (!active) break;
        try { nextConnection.sendText(text); } catch (error) {
          callbacks.onError?.(error instanceof Error ? error.message : 'تعذّر إرسال النص إلى Gemini Live.');
          break;
        }
      }
      callbacks.onReady?.();
    }).catch(error => {
      if (active) callbacks.onError?.(error instanceof Error ? error.message : 'تعذّر الاتصال بـ Gemini Live.');
    });
  } catch (error) {
    await stop();
    throw error;
  }

  return {
    sendText: text => {
      if (!active) throw new Error('جلسة الصوت غير متاحة.');
      if (connection && connection.socket.readyState === WebSocket.OPEN) {
        connection.sendText(text);
      } else {
        pendingText.push(text);
      }
    },
    stop,
  };
}
