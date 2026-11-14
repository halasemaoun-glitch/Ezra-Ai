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
  endAudioStream: () => void;
  sendText: (text: string) => void;
  close: () => void;
};

const LIVE_MODEL = 'models/gemini-3.8-live';
const LIVE_SOCKET_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

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
  let setupCompleted = false;
  let closed = false;
  let settled = false;
  let setupTimer: ReturnType<typeof setTimeout> | null = null;

  await new Promise<void>((resolve, reject) => {
    const failSetup = (message: string) => {
      if (settled) return;
      settled = true;
      if (setupTimer) clearTimeout(setupTimer);
      socket.close();
      reject(new Error(message));
    };

    const connectionTimer = setTimeout(() => {
      failSetup('انتهت مهلة الاتصال بخدمة Gemini Live.');
    }, 20000);

    socket.onopen = () => {
      setupTimer = setTimeout(() => {
        failSetup('لم تكتمل تهيئة جلسة Gemini Live في الوقت المحدد.');
      }, 15000);
      try {
        socket.send(JSON.stringify({
          setup: { model: LIVE_MODEL },
        }));
      } catch {
        clearTimeout(connectionTimer);
        failSetup('تعذّر إرسال إعدادات جلسة Gemini Live.');
      }
    };

    socket.onerror = () => {
      if (!setupCompleted) {
        clearTimeout(connectionTimer);
        failSetup('تعذر الاتصال بخدمة Gemini Live.');
      } else {
        callbacks.onError?.('انقطع الاتصال بخدمة Gemini Live.');
      }
    };

    socket.onclose = event => {
      closed = true;
      clearTimeout(connectionTimer);
      if (setupTimer) clearTimeout(setupTimer);
      if (!setupCompleted) {
        failSetup(event.reason || 'رفض Gemini Live إعداد الجلسة.');
      } else {
        callbacks.onClose?.(event.code, event.reason || '');
      }
    };

    socket.onmessage = event => {
      let parsed: any;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        callbacks.onError?.('وصلت رسالة من Gemini Live بتنسيق غير مفهوم.');
        return;
      }

      if (parsed.setupComplete) {
        setupCompleted = true;
        settled = true;
        clearTimeout(connectionTimer);
        if (setupTimer) clearTimeout(setupTimer);
        callbacks.onOpen?.();
        resolve();
      } else if (parsed.error) {
        const message = parsed.error.message || 'حدث خطأ أثناء إعداد جلسة Gemini Live.';
        if (!setupCompleted) failSetup(message);
        else callbacks.onError?.(message);
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
    endAudioStream: () => send({ realtimeInput: { audioStreamEnd: true } }),
    sendText: text => send({ realtimeInput: { text } }),
    close: () => {
      closed = true;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, 'EZRA voice session ended');
      }
    },
  };
}
