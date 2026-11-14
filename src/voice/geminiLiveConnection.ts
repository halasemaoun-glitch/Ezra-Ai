import { supabase } from '../lib/supabase';

export type GeminiLiveCallbacks = {
  onOpen?: () => void;
  onMessage?: (message: any) => void;
  onError?: (message: string) => void;
  onClose?: (code: number, reason: string) => void;
};

export type GeminiLiveConnection = {
  socket: WebSocket;
  sendAudio: (base64Pcm: string) => void;
  sendText: (text: string) => void;
  close: () => void;
};

const LIVE_MODEL = 'models/gemini-3.8-live';
const LIVE_SOCKET_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

export async function connectEzraGeminiLive(
  responseLanguage: 'ar' | 'en',
  callbacks: GeminiLiveCallbacks = {},
): Promise<GeminiLiveConnection> {
  const { data, error } = await supabase.functions.invoke('gemini-live-token', {
    body: { responseLanguage },
  });
  if (error || typeof data?.token !== 'string' || !data.token) {
    throw new Error(data?.error || error?.message || 'تعذر الحصول على تصريح الاتصال الصوتي.');
  }

  const socket = new WebSocket(
    `${LIVE_SOCKET_URL}?access_token=${encodeURIComponent(data.token)}`,
  );
  let opened = false;
  let closed = false;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!opened) {
        socket.close();
        reject(new Error('انتهت مهلة الاتصال بخدمة الصوت.'));
      }
    }, 15000);
    socket.onopen = () => {
      opened = true;
      clearTimeout(timeout);
      socket.send(JSON.stringify({
        setup: {
          model: LIVE_MODEL,
          generationConfig: {
            responseModalities: ['AUDIO'],
          },
          realtimeInputConfig: {
            automaticActivityDetection: { disabled: false },
          },
        },
      }));
    };
    socket.onerror = () => {
      clearTimeout(timeout);
      if (!opened) reject(new Error('تعذر الاتصال بخدمة Gemini Live.'));
      else callbacks.onError?.('انقطع الاتصال بخدمة Gemini Live.');
    };
    socket.onclose = event => {
      clearTimeout(timeout);
      closed = true;
      if (!opened) reject(new Error(event.reason || 'رفض Gemini Live الاتصال.'));
      callbacks.onClose?.(event.code, event.reason || '');
    };
    socket.onmessage = event => {
      let parsed: any;
      try { parsed = JSON.parse(String(event.data)); }
      catch { callbacks.onError?.('وصلت رسالة صوتية غير مفهومة.'); return; }
      if (parsed.setupComplete) {
        callbacks.onOpen?.();
        resolve();
      } else if (parsed.error) {
        callbacks.onError?.(parsed.error.message || 'حدث خطأ في جلسة Gemini Live.');
      } else {
        callbacks.onMessage?.(parsed);
      }
    };
  });

  const send = (payload: unknown) => {
    if (closed || socket.readyState !== WebSocket.OPEN) {
      throw new Error('اتصال Gemini Live غير متاح.');
    }
    socket.send(JSON.stringify(payload));
  };

  return {
    socket,
    sendAudio: base64Pcm => send({
      realtimeInput: {
        audio: { data: base64Pcm, mimeType: 'audio/pcm;rate=16000' },
      },
    }),
    sendText: text => send({ realtimeInput: { text } }),
    close: () => {
      closed = true;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, 'EZRA voice session ended');
      }
    },
  };
}
