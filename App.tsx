import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  Animated,
  AppState,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { StatusBar } from 'expo-status-bar';
import EzraOrb3D from './src/EzraOrb3D';
import { supabase } from './src/lib/supabase';

type Attachment = {
  uri: string;
  name: string;
  kind: 'image' | 'file';
  mimeType?: string;
  base64?: string;
  textContent?: string;
};

type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

type MemoryItem = {
  id: string;
  content: string;
  category: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

type Message = {
  id: string;
  text: string;
  sender: 'ezra' | 'user';
  attachment?: Attachment;
};

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  sender: 'ezra',
  text: 'مرحبًا. أنا إزرا. أنا هنا، احكيلي… شو في بالك اليوم؟',
};
const createConversationId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
  const random = Math.floor(Math.random() * 16);
  const value = character === 'x' ? random : (random & 0x3) | 0x8;
  return value.toString(16);
});

function EzraOrb({ status, voiceLevel = 0 }: { status: string; voiceLevel?: number }) {
  const waveform = useRef(Array.from({ length: 9 }, () => new Animated.Value(0.18))).current;
  const listening = status.includes('يستمع');
  const thinking = status.includes('أفكر');
  const speaking = status.includes('يتحدث');
  useEffect(() => {
    if (listening) {
      waveform.forEach((bar, index) => {
        const envelope = 0.12 + voiceLevel * (0.38 + (Math.sin(index * 1.7) + 1) * 0.2);
        bar.setValue(Math.max(0.12, Math.min(1, envelope)));
      });
      return () => waveform.forEach(bar => bar.stopAnimation());
    }
    const waveLoops = waveform.map((bar, index) => {
      bar.setValue(0.18);
      const duration = thinking ? 1050 : speaking ? 360 : 560;
      const loop = Animated.loop(Animated.sequence([
        Animated.delay(index * (thinking ? 110 : 65)),
        Animated.timing(bar, { toValue: 0.95, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bar, { toValue: 0.18, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]));
      if (listening || thinking || speaking) loop.start();
      return loop;
    });
    return () => waveLoops.forEach(loop => loop.stop());
  }, [waveform, status, listening, thinking, speaking, voiceLevel]);
  const active = listening || thinking || speaking;
  const caption = listening ? 'أنا أسمعك… خذ وقتك' : thinking ? 'أرتّب أفكاري لأجيبك' : speaking ? 'أنا معك، ويمكنك مقاطعتي' : 'أنا هنا عندما تحتاجني';
  return (
    <View style={styles.orbSection}>
      <View style={styles.orbStage}>
        <EzraOrb3D status={status} level={listening ? voiceLevel : 0} />
      </View>
      <View style={[styles.orbStatusPill, active && styles.orbStatusPillActive]}>
        <View style={[styles.orbStatusDot, active && styles.orbStatusDotActive]} />
        <Text style={styles.orbStatus}>{status}</Text>
      </View>
      <View style={styles.orbWaveform} accessibilityLabel={listening ? 'موجات الاستماع' : speaking ? 'موجات التحدث' : 'موجات حالة إزرا'}>
        {waveform.map((bar, index) => (
          <Animated.View key={index} style={[styles.orbWaveBar, { opacity: active ? 0.9 : 0.18, transform: [{ scaleY: active ? bar : 0.18 }] }]} />
        ))}
      </View>
      <Text style={styles.orbCaption}>{caption}</Text>
    </View>
  );
}

export default function App() {
  const [message, setMessage] = useState('');
  const [voiceHome, setVoiceHome] = useState(true);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [speechRate, setSpeechRate] = useState(0.92);
  const [speechPitch, setSpeechPitch] = useState(0.9);
  const [recognitionLanguage, setRecognitionLanguage] = useState<'ar' | 'en'>('ar');
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [voiceRetrying, setVoiceRetrying] = useState(false);
  const [voiceRetryMessage, setVoiceRetryMessage] = useState('');
  const [autoListen, setAutoListen] = useState(true);
  const autoListenRef = useRef(true);
  const voiceTranscriptRef = useRef('');
  const voiceTurnInProgressRef = useRef(false);
  const voiceRequestStartedRef = useRef(false);
  const voiceRetryCountRef = useRef(0);
  const [ttsVoices, setTtsVoices] = useState<{ identifier: string; name: string; language: string; quality?: string }[]>([]);
  const [selectedTtsVoice, setSelectedTtsVoice] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [session, setSession] = useState<import('@supabase/supabase-js').Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [memoryVisible, setMemoryVisible] = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memorySaving, setMemorySaving] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memorySearch, setMemorySearch] = useState('');
  const [memoryFilter, setMemoryFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [historySearch, setHistorySearch] = useState('');
  const micPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const active = nextState === 'active';
      setAppIsActive(active);
      if (!active) {
        // Keep microphone capture foreground-only; resume automatically when the app returns.
        ExpoSpeechRecognitionModule.stop();
        Speech.stop();
        setIsListening(false);
        setSpeakingMessageId(null);
        setVoiceLevel(0);
      }
    });
    return () => subscription.remove();
  }, []);

  const visibleMemories = memories.filter(item => {
    const matchesSearch = item.content.toLocaleLowerCase().includes(memorySearch.trim().toLocaleLowerCase());
    return matchesSearch && (memoryFilter === 'all' || item.approval_status === memoryFilter);
  });
  const visibleConversations = conversations.filter(item =>
    item.title.toLocaleLowerCase().includes(historySearch.trim().toLocaleLowerCase())
  );

  useEffect(() => {
    AsyncStorage.multiGet(['ezra:autoSpeak', 'ezra:speechRate', 'ezra:recognitionLanguage', 'ezra:autoListen', 'ezra:ttsVoice', 'ezra:speechPitch']).then(values => {
      const savedAutoSpeak = values[0]?.[1];
      const savedRate = values[1]?.[1];
      const savedLanguage = values[2]?.[1];
      const savedAutoListen = values[3]?.[1];
      const savedTtsVoice = values[4]?.[1];
      if (savedTtsVoice) setSelectedTtsVoice(savedTtsVoice);
      const savedPitch = Number(values[5]?.[1]);
      if (Number.isFinite(savedPitch) && savedPitch >= 0.75 && savedPitch <= 1.1) setSpeechPitch(savedPitch);
      if (savedLanguage === 'ar' || savedLanguage === 'en') setRecognitionLanguage(savedLanguage);
      if (savedAutoListen !== null) {
        const enabled = savedAutoListen === 'true';
        autoListenRef.current = enabled;
        setAutoListen(enabled);
      }
      if (savedAutoSpeak !== null) setAutoSpeak(savedAutoSpeak === 'true');
      if (savedRate) {
        const parsed = Number(savedRate);
        if (Number.isFinite(parsed)) setSpeechRate(Math.min(1.15, Math.max(0.75, parsed)));
      }
    }).catch(error => console.warn('Could not restore voice preferences:', error));
  }, []);

  useEffect(() => {
    const active = isListening || !!speakingMessageId || sending;
    if (!active) {
      micPulse.stopAnimation();
      micPulse.setValue(1);
      return;
    }
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(micPulse, { toValue: 1.2, duration: 760, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(micPulse, { toValue: 1, duration: 760, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [isListening, speakingMessageId, sending, micPulse]);

  useEffect(() => {
    Speech.getAvailableVoicesAsync()
      .then(voices => setTtsVoices(voices.map(voice => ({ identifier: voice.identifier, name: voice.name, language: voice.language, quality: voice.quality }))))
      .catch(error => console.warn('Could not load device speech voices:', error));
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setAuthError(error.message);
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setConversationId(null);
      return;
    }

    let active = true;
    const restoreConversation = async () => {
      try {
        const storageKey = `ezra:conversation:${session.user.id}`;
        const savedId = await AsyncStorage.getItem(storageKey);
        const nextId = savedId || '00000000-0000-4000-8000-000000000001';
        if (!savedId) await AsyncStorage.setItem(storageKey, nextId);
        if (active) setConversationId(nextId);
      } catch (error) {
        console.error('Could not restore conversation ID:', error);
        if (active) setConversationId(createConversationId());
      }
    };

    restoreConversation();
    return () => { active = false; };
  }, [session?.user.id]);

  const openMemoryCenter = async () => {
    if (!session) return;
    setMemoryVisible(true);
    setMemoryLoading(true);
    const { data, error } = await supabase
      .from('memories')
      .select('id, content, category, approval_status, created_at')
      .eq('owner_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Could not load memories:', error);
      Alert.alert('تعذّر تحميل الذكريات', 'حاول مرة أخرى بعد قليل.');
      setMemoryLoading(false);
      return;
    }
    setMemories((data ?? []) as MemoryItem[]);
    setMemoryLoading(false);
  };

  const saveMemory = async () => {
    const content = memoryDraft.trim();
    if (!session || !content || memorySaving) return;
    setMemorySaving(true);
    const { data, error } = await supabase
      .from('memories')
      .insert({
        owner_id: session.user.id,
        content,
        category: 'general',
        approval_status: 'pending',
      })
      .select('id, content, category, approval_status, created_at')
      .single();

    if (error || !data) {
      console.error('Could not save memory:', error);
      Alert.alert('تعذّر حفظ الذكرى', 'تحقق من الاتصال ثم حاول مرة أخرى.');
    } else {
      setMemories(previous => [data as MemoryItem, ...previous]);
      setMemoryDraft('');
      Alert.alert('تم حفظ الاقتراح', 'أُضيفت الذكرى كاقتراح بانتظار موافقتك.');
    }
    setMemorySaving(false);
  };

  const updateMemoryStatus = async (memoryId: string, status: 'approved' | 'rejected') => {
    if (!session) return;
    const { error } = await supabase
      .from('memories')
      .update({ approval_status: status, updated_at: new Date().toISOString() })
      .eq('id', memoryId)      .eq('owner_id', session.user.id);    if (error) {
      console.error('Could not update memory status:', error);
      Alert.alert('تعذّر تحديث الذكرى', 'حاول مرة أخرى.');
      return;
    }
    setMemories(previous => previous.map(item =>
      item.id === memoryId ? { ...item, approval_status: status } : item
    ));
  };

  const deleteMemory = (memoryId: string) => {
    if (!session) return;
    Alert.alert('حذف الذكرى', 'هل تريد حذف هذه الذكرى نهائيًا؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('memories')
            .delete()
            .eq('id', memoryId)
            .eq('owner_id', session.user.id);
          if (error) {
            console.error('Could not delete memory:', error);
            Alert.alert('تعذّر حذف الذكرى', 'حاول مرة أخرى.');
            return;
          }
          setMemories(previous => previous.filter(item => item.id !== memoryId));
        },
      },
    ]);
  };

  const openConversationHistory = async () => {
    if (!session) return;
    setHistoryVisible(true);
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from('chat_messages')
      .select('conversation_id, role, content, created_at')
      .eq('owner_id', session.user.id)
      .order('created_at', { ascending: true })
      .limit(500);

    if (error) {
      console.error('Could not load conversation history:', error);
      Alert.alert('تعذّر تحميل سجل المحادثات', 'حاول مرة أخرى بعد قليل.');
      setHistoryLoading(false);
      return;
    }

    const grouped = new Map<string, ConversationSummary>();
    (data ?? []).forEach((row: any) => {
      if (!row.conversation_id) return;
      const existing = grouped.get(row.conversation_id);
      const content = typeof row.content === 'string' ? row.content.trim() : '';
      if (!existing) {
        grouped.set(row.conversation_id, {
          id: row.conversation_id,
          title: row.role === 'user' && content ? content : 'محادثة جديدة',
          updatedAt: row.created_at,
        });
      } else {
        existing.updatedAt = row.created_at;
        if (existing.title === 'محادثة جديدة' && row.role === 'user' && content) {
          existing.title = content;
        }
      }
    });

    setConversations(
      Array.from(grouped.values())
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    );
    setHistoryLoading(false);
  };

  const selectConversation = async (selectedId: string) => {
    if (!session) return;
    try {
      await AsyncStorage.setItem(`ezra:conversation:${session.user.id}`, selectedId);
      setConversationId(selectedId);
      setMessages([WELCOME_MESSAGE]);
      setMessage('');
      setAttachment(null);
      setHistoryVisible(false);
    } catch (error) {
      console.error('Could not restore selected conversation:', error);
      Alert.alert('تعذّر فتح المحادثة', 'حاول مرة أخرى.');
    }
  };

  const startNewConversation = async () => {
    if (!session) return;
    const nextId = createConversationId();
    try {
      await AsyncStorage.setItem(`ezra:conversation:${session.user.id}`, nextId);
      setConversationId(nextId);
      setMessages([WELCOME_MESSAGE]);
      setMessage('');
      setAttachment(null);
    } catch (error) {
      console.error('Could not start a new conversation:', error);
      Alert.alert('تعذّر بدء محادثة جديدة', 'حاول مرة أخرى.');
    }
  };

  const deleteConversation = (selectedId: string) => {
    if (!session) return;
    Alert.alert('حذف المحادثة', 'سيتم حذف رسائل هذه المحادثة نهائيًا. هل تريد المتابعة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('chat_messages')
            .delete()
            .eq('owner_id', session.user.id)
            .eq('conversation_id', selectedId);
          if (error) {
            console.error('Could not delete conversation:', error);
            Alert.alert('تعذّر حذف المحادثة', 'حاول مرة أخرى بعد قليل.');
            return;
          }
          setConversations(previous => previous.filter(item => item.id !== selectedId));
          if (selectedId === conversationId) await startNewConversation();
        },
      },
    ]);
  };

  const signIn = async () => {
    if (!email.trim() || !password) {
      setAuthError('أدخل البريد الإلكتروني وكلمة المرور.');
      return;
    }
    setSigningIn(true);
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) setAuthError(error.message);
    setSigningIn(false);
  };

  const returnToVoiceHome = () => {
    if (isListening) ExpoSpeechRecognitionModule.stop();
    Speech.stop();
    setIsListening(false);
    setSpeakingMessageId(null);
    setVoiceHome(true);
  };

  useEffect(() => {
    if (!session || !conversationId) {
      setMessages([WELCOME_MESSAGE]);
      return;
    }

    let active = true;
    const loadMessages = async () => {
      setChatLoading(true);
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, role, content, attachment_name, attachment_type')
        .eq('owner_id', session.user.id)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!active) return;
      if (error) {
        Alert.alert('تعذّر تحميل المحادثة', 'حاول مرة أخرى.');
      } else if (data && data.length > 0) {
        setMessages(data.map((row: any) => ({
          id: row.id,
          sender: row.role === 'assistant' ? 'ezra' : 'user',
          text: row.content,
          ...(row.attachment_name ? {
            attachment: {
              uri: '',
              name: row.attachment_name,
              kind: row.attachment_type === 'image' ? 'image' : 'file',
            },
          } : {}),
        })));
      } else {
        setMessages([WELCOME_MESSAGE]);
      }
      setChatLoading(false);
    };

    loadMessages();
    return () => {
      active = false;
    };
  }, [session?.user.id, conversationId]);

  useSpeechRecognitionEvent('start', () => {
    setVoiceRetrying(false);
    setVoiceRetryMessage('');
    setVoiceLevel(0);
    setIsListening(true);
  });
  useSpeechRecognitionEvent('volumechange', event => {
    const normalized = event.value <= 0 ? 0 : Math.min(1, event.value / 10);
    setVoiceLevel(previous => previous * 0.58 + normalized * 0.42);
  });
  useSpeechRecognitionEvent('soundend', () => {
    setVoiceLevel(0);
  });
  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
    setVoiceLevel(0);
    const spokenText = voiceTranscriptRef.current.trim();
    if (autoListenRef.current && voiceHome && spokenText) {
      voiceTurnInProgressRef.current = true;
      voiceTranscriptRef.current = '';
      setMessage(spokenText);
      setTimeout(() => sendMessage(true, spokenText), 250);
    }
  });
  useSpeechRecognitionEvent('result', event => {
    const latestResult = event.results[event.results.length - 1];
    const transcript = latestResult?.transcript;
    if (transcript) {
      voiceRetryCountRef.current = 0;
      voiceTranscriptRef.current = transcript;
      setMessage(transcript);
    }
  });
  useSpeechRecognitionEvent('error', event => {
    setIsListening(false);
    setVoiceLevel(0);
    voiceTranscriptRef.current = '';
    const blocked = event.error === 'not-allowed' || event.error === 'service-not-allowed';
    if (blocked) {
      autoListenRef.current = false;
      setAutoListen(false);
      setVoiceRetrying(false);
      setVoiceRetryMessage('');
      Alert.alert('إذن الميكروفون أو خدمة الصوت', 'تحقق من إذن الميكروفون ومن تفعيل خدمة التعرّف على الكلام في إعدادات الهاتف.');
    } else if (event.error === 'no-speech') {
      // Silence is normal on a voice-first screen; retry without treating it as a service failure.
      voiceRetryCountRef.current = 0;
      setVoiceRetryMessage('لم أسمع كلامًا، سأحاول مجددًا…');
      setVoiceRetrying(true);
    } else if (event.error === 'aborted') {
      setVoiceRetrying(false);
      setVoiceRetryMessage('');
    } else if (event.error === 'audio-capture') {
      autoListenRef.current = false;
      setAutoListen(false);
      setVoiceRetrying(false);
      setVoiceRetryMessage('');
      Alert.alert('الميكروفون غير متاح', 'لم يتمكن الهاتف من الوصول إلى الميكروفون. أغلق أي تطبيق يستخدمه ثم حاول مجددًا.');
    } else if (autoListenRef.current && voiceHome && voiceRetryCountRef.current < 2) {
      voiceRetryCountRef.current += 1;
      setVoiceRetryMessage('انقطع الاتصال بخدمة الصوت، أعيد المحاولة…');
      setVoiceRetrying(true);
    } else if (voiceRetryCountRef.current >= 2) {
      setVoiceRetrying(false);
      setVoiceRetryMessage('');
      autoListenRef.current = false;
      setAutoListen(false);
      Alert.alert('تعذّر استمرار الاستماع', 'توقّف التعرّف الصوتي بعد محاولتين. تحقق من اتصال الإنترنت وإذن الميكروفون، ثم اضغط الميكروفون للمحاولة مجددًا.');
    }
  });

  useEffect(() => {
    if (voiceHome) return;
    if (isListening) ExpoSpeechRecognitionModule.stop();
    if (speakingMessageId) {
      Speech.stop();
      setSpeakingMessageId(null);
    }
    setVoiceLevel(0);
  }, [voiceHome, isListening, speakingMessageId]);

  useEffect(() => {
    if (!appIsActive || !session || !voiceHome || !autoListen || isListening || sending || speakingMessageId || chatLoading) return;
    const timer = setTimeout(() => beginListening(), voiceRetrying ? 900 : 500);
    return () => clearTimeout(timer);
  }, [appIsActive, session?.user.id, voiceHome, autoListen, recognitionLanguage, isListening, sending, speakingMessageId, chatLoading, voiceRetrying]);

  useEffect(() => {
    if (!appIsActive || !voiceHome || !autoListen || !voiceTurnInProgressRef.current || !voiceRequestStartedRef.current || sending || speakingMessageId || isListening) return;
    voiceTurnInProgressRef.current = false;
    voiceRequestStartedRef.current = false;
    const timer = setTimeout(() => beginListening(), 700);
    return () => clearTimeout(timer);
  }, [appIsActive, sending, speakingMessageId, isListening, voiceHome, autoListen]);

  const sendMessage = async (voiceReply = false, voiceText?: string) => {
    const text = (voiceText ?? message).trim();
    if ((!text && !attachment) || !session || !conversationId || sending) return;
    if (voiceText !== undefined) voiceRequestStartedRef.current = true;

    setSending(true);

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          owner_id: session.user.id,
          conversation_id: conversationId,
          role: 'user',
          content: text,
          attachment_name: attachment?.name ?? null,
          attachment_type: attachment?.kind ?? null,
        })
        .select('id')
        .single();

      if (error || !data) {
        console.error('Could not save user message to chat_messages:', {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
        });
        const diagnostic = error
          ? [error.message, error.details, error.hint, error.code ? `Code: ${error.code}` : null]
              .filter(Boolean)
              .join('\\n\\n')
          : 'Supabase returned no saved message row.';
        Alert.alert('لم تُحفظ الرسالة', diagnostic);
        voiceTurnInProgressRef.current = false;
        voiceRequestStartedRef.current = false;
        setSending(false);
        return;
      }

      const nextMessage: Message = {
        id: data.id,
        sender: 'user',
        text,
        ...(attachment ? { attachment } : {}),
      };
      setMessages(previous => [...previous, nextMessage]);
      setMessage('');
      setAttachment(null);

      if (text || attachment) {
        const attachmentPrompt = attachment?.kind === 'image'
          ? 'Please inspect the attached image carefully and answer the user\'s question. If no question was provided, describe the image and any readable text.'
          : attachment?.textContent
            ? `The user attached a text document named ${attachment.name}. Analyze its contents below:\n\n${attachment.textContent.slice(0, 8000)}${attachment.textContent.length > 12000 ? '\\n\\n[The document was shortened to fit the request.]' : ''}`
            : '';
        const userInput = [text, attachmentPrompt].filter(Boolean).join('\n\n');
        const recentContext = messages
          .filter(item => item.id !== 'welcome' && !!item.text.trim())
          .slice(-12)
          .map(item => `${item.sender === 'user' ? 'User' : 'EZRA'}: ${item.text}`)
          .join('\n').slice(-4000);
        const conversationInput = recentContext
          ? `Continue this conversation naturally. Use the previous messages as context.\n\n${recentContext}\nUser: ${userInput}`
          : userInput;

        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const aiRequest = await Promise.race([
          supabase.functions.invoke('smart-service', {
            body: {
              input: conversationInput,
              voiceMode: voiceReply,
              ...(attachment?.kind === 'image' && attachment.base64
                ? { imageDataUrl: `data:${attachment.mimeType || 'image/jpeg'};base64,${attachment.base64}` }
                : {}),
            },
          }).then(result => ({ kind: 'response' as const, result })),
          new Promise<{ kind: 'timeout' }>(resolve => {
            timeoutId = setTimeout(() => resolve({ kind: 'timeout' }), attachment ? 60000 : 30000);
          }),
        ]);
        if (timeoutId) clearTimeout(timeoutId);

        if (aiRequest.kind === 'timeout') {
          console.error('EZRA AI request timed out after 30 seconds.');
          Alert.alert(
            'انتهت مهلة انتظار الرد',
            'تم حفظ رسالتك، لكن إزرا لم يرد خلال 30 ثانية. يمكنك المحاولة مرة أخرى بعد قليل.'
          );
          voiceTurnInProgressRef.current = false;
          voiceRequestStartedRef.current = false;
          setSending(false);
          return;
        }

        const { data: aiData, error: aiError } = aiRequest.result;
        if (aiError || typeof aiData?.reply !== 'string' || !aiData.reply.trim()) {
          const context = (aiError as any)?.context;
          const details = [
            aiError?.message,
            context?.status ? `HTTP status: ${context.status}` : null,
            context?.statusText,
            typeof context?.body === 'string'
              ? context.body
              : context?.body
                ? JSON.stringify(context.body)
                : null,
            !aiError && aiData ? JSON.stringify(aiData) : null,
          ].filter(Boolean).join('\\n\\n');
          console.error('EZRA AI request failed:', { aiError, aiData });
          Alert.alert(
            'تعذّر على إزرا الرد',
            details || 'تم حفظ رسالتك، لكن الخدمة لم تُرجع ردًا. حاول مرة أخرى بعد قليل.'
          );
          voiceTurnInProgressRef.current = false;
          voiceRequestStartedRef.current = false;
          setSending(false);
          return;
        }

        const reply = aiData.reply.trim();
        // Start spoken playback as soon as the model reply arrives; saving history must not delay EZRA's voice.
        const playbackMessageId = `reply-${Date.now()}`;
        if (voiceReply || autoSpeak) speak(reply, playbackMessageId);

        const { data: savedReply, error: saveReplyError } = await supabase
          .from('chat_messages')
          .insert({
            owner_id: session.user.id,
            conversation_id: conversationId,
            role: 'assistant',
            content: reply,
          })
          .select('id')
          .single();

        if (saveReplyError || !savedReply) {
          console.error('Could not save EZRA reply:', saveReplyError);
          setMessages(previous => [
            ...previous,
            { id: playbackMessageId, sender: 'ezra', text: reply },
          ]);
          Alert.alert('لم يُحفظ الرد', 'إزرا أجاب، لكن تعذّر حفظ الرد في سجل المحادثة.');
        } else {
          setMessages(previous => [
            ...previous,
            { id: savedReply.id, sender: 'ezra', text: reply },
          ]);
        }
      }
    } catch (error) {
      console.error('Message sending failed:', error);
      Alert.alert('حدث خطأ', 'حاول إرسال رسالتك مرة أخرى.');
      voiceTurnInProgressRef.current = false;
      voiceRequestStartedRef.current = false;
    }

    setSending(false);
  };

  const beginListening = async (interruptSpeech = false) => {
    if (!appIsActive || !autoListenRef.current || isListening || sending || (speakingMessageId && !interruptSpeech)) return;
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        autoListenRef.current = false;
        setAutoListen(false);
        Alert.alert('إذن الميكروفون', 'اسمح لـ EZRA باستخدام الميكروفون والتعرّف على الكلام لتفعيل المحادثة التلقائية.');
        return;
      }
      voiceTranscriptRef.current = '';
      ExpoSpeechRecognitionModule.start({
        lang: recognitionLanguage === 'ar' ? 'ar' : 'en-US',
        interimResults: true,
        continuous: false,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 90 },
      });
    } catch {
      setIsListening(false);
      console.warn('Automatic voice listening could not start.');
    }
  };

  const startListening = async () => {
    if (speakingMessageId) {
      Speech.stop();
      setSpeakingMessageId(null);
      voiceTurnInProgressRef.current = false;
      voiceRequestStartedRef.current = false;
      autoListenRef.current = true;
      setAutoListen(true);
      AsyncStorage.setItem('ezra:autoListen', 'true').catch(() => {});
      setTimeout(() => beginListening(true), 250);
      return;
    }
    if (isListening) {
      autoListenRef.current = false;
      setAutoListen(false);
      AsyncStorage.setItem('ezra:autoListen', 'false').catch(() => {});
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    autoListenRef.current = true;
    setAutoListen(true);
    AsyncStorage.setItem('ezra:autoListen', 'true').catch(() => {});
    await beginListening();
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('تعذّر قراءة الصورة', 'لم نتمكن من تجهيز الصورة لإرسالها. حاول اختيار صورة أخرى.');
        return;
      }
      if (asset.base64.length > 3.5 * 1024 * 1024) {
        Alert.alert('الصورة كبيرة جدًا', 'اختر صورة أصغر حتى نتمكن من تحليلها.');
        return;
      }
      const mimeType = asset.mimeType || 'image/jpeg';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        Alert.alert('صيغة الصورة غير مدعومة', 'اختر صورة بصيغة JPG أو PNG أو WebP.');
        return;
      }
      setAttachment({
        uri: asset.uri,
        name: asset.fileName || 'صورة مرفقة',
        kind: 'image',
        mimeType,
        base64: asset.base64,
      });
    } catch {
      Alert.alert('الصورة غير متاحة', 'تعذّر فتح معرض الصور.');
    }
  };

  const pickملف = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const file = result.assets[0];
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      const supportedTextTypes = ['txt', 'md', 'csv', 'json'];
      if (!supportedTextTypes.includes(extension)) {
        Alert.alert('نوع الملف غير مدعوم بعد', 'حاليًا يستطيع إزرا قراءة ملفات TXT وMD وCSV وJSON. دعم PDF وWord قادم لاحقًا.');
        return;
      }
      if (typeof file.size === 'number' && file.size > 1024 * 1024) {
        Alert.alert('الملف كبير جدًا', 'اختر ملفًا نصيًا أصغر من 1 ميغابايت.');
        return;
      }
      const response = await fetch(file.uri);
      const textContent = await response.text();
      if (!textContent.trim()) {
        Alert.alert('الملف فارغ', 'لم نعثر على نص قابل للقراءة داخل الملف.');
        return;
      }
      if (textContent.length > 1024 * 1024) {
        Alert.alert('الملف كبير جدًا', 'اختر ملفًا نصيًا أصغر من 1 ميغابايت.');
        return;
      }
      setAttachment({ uri: file.uri, name: file.name, kind: 'file', mimeType: file.mimeType, textContent });
    } catch {
      Alert.alert('تعذّر فتح الملفات', 'حاول مرة أخرى.');
    }
  };

  const chooseAttachment = () => {
    Alert.alert('إرفاق بالرسالة', 'اختر ما تريد إرفاقه.', [
      { text: 'صورة', onPress: pickImage },
      { text: 'ملف', onPress: pickملف },
      { text: 'إلغاء', style: 'cancel' },
    ]);
  };

  const speak = (text: string, messageId: string) => {
    if (speakingMessageId === messageId) {
      Speech.stop();
      setSpeakingMessageId(null);
      return;
    }
    Speech.stop();
    setSpeakingMessageId(messageId);
    const speechLanguage = /[\\u0600-\\u06FF]/.test(text) ? 'ar' : 'en';
    const matchingVoice = ttsVoices
      .filter(voice => voice.language.toLowerCase().startsWith(speechLanguage))
      .sort((a, b) => Number(b.quality === 'Enhanced') - Number(a.quality === 'Enhanced'))[0];
    const preferredVoice = ttsVoices.find(voice => voice.identifier === selectedTtsVoice && voice.language.toLowerCase().startsWith(speechLanguage)) || matchingVoice;
    Speech.speak(text, {
      language: speechLanguage,
      ...(preferredVoice ? { voice: preferredVoice.identifier } : {}),
      rate: speechRate,
      pitch: speechPitch,
      volume: 1.0,
      onDone: () => setSpeakingMessageId(current => current === messageId ? null : current),
      onStopped: () => setSpeakingMessageId(current => current === messageId ? null : current),
      onError: () => setSpeakingMessageId(current => current === messageId ? null : current),
    });
  };

  if (authLoading) {
    return (
      <SafeAreaView style={styles.authSafe}>
        <StatusBar style="light" />
        <Text style={styles.authBrand}>EZRA</Text>
        <Text style={styles.authHint}>نجهّز مساحتك الخاصة…</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.authSafe}>
        <StatusBar style="light" />
        <View style={styles.authCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>E</Text>
          </View>
          <Text style={styles.authBrand}>EZRA</Text>
          <Text style={styles.authTitle}>مساحتك الخاصة.</Text>
          <Text style={styles.authHint}>سجّل الدخول للمتابعة مع مساعدك الشخصي.</Text>
          <TextInput
            style={[styles.authInput, styles.authInputLtr]}
            placeholder="البريد الإلكتروني"
            placeholderTextColor="#777680"
            textAlign="left"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextInput
            style={[styles.authInput, styles.authInputLtr]}
            placeholder="كلمة المرور"
            placeholderTextColor="#777680"
            textAlign="left"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
          />
          {!!authError && <Text style={styles.authError}>{authError}</Text>}
          <TouchableOpacity
            style={[styles.authButton, signingIn && styles.authButtonDisabled]}
            onPress={signIn}
            disabled={signingIn}
          >
            <Text style={styles.authButtonText}>{signingIn ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}</Text>
          </TouchableOpacity>
          <Text style={styles.authFootnote}>دخول خاص · للحساب المصرّح فقط</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (voiceHome) {
    const voiceStatus = isListening
      ? 'إزرا يستمع'
      : voiceRetrying
        ? (voiceRetryMessage || 'أعيد الاتصال بالصوت…')
      : speakingMessageId
        ? 'إزرا يتحدث'
        : (sending || chatLoading)
          ? 'لحظة، أفكر…'
          : 'أنا هنا';
    return (
      <SafeAreaView style={styles.voiceSafe}>
        <StatusBar style="light" />
        <View style={styles.voiceHome}>
          <View style={styles.voiceTopActions}>
            <TouchableOpacity onPress={() => setSettingsVisible(true)} style={styles.voiceTopButton} accessibilityLabel="الإعدادات"><Text style={styles.voiceTopButtonText}>⚙</Text></TouchableOpacity>
            <View style={styles.voiceBrand}>
              <Text style={styles.voiceBrandName}>EZRA</Text>
              <View style={styles.voiceBrandStatus}><View style={styles.voiceBrandDot} /><Text style={styles.voiceBrandStatusText}>PERSONAL AI</Text></View>
            </View>
            <TouchableOpacity onPress={openConversationHistory} style={styles.voiceTopButton} accessibilityLabel="سجل المحادثات"><Text style={styles.voiceTopButtonText}>◷</Text></TouchableOpacity>
          </View>
          <View style={styles.voiceOrbWrap}>
            <EzraOrb status={voiceStatus} voiceLevel={voiceLevel} />
          </View>
          <View style={styles.voiceMicWrap}>
            <Animated.View
              pointerEvents="none"
              style={[styles.voiceMicHalo, { opacity: isListening || speakingMessageId || sending ? 0.72 : 0.24, transform: [{ scale: micPulse }] }]}
            />
            <TouchableOpacity
              style={[styles.voiceMic, isListening && styles.voiceMicActive, !!speakingMessageId && styles.voiceMicSpeaking]}
              onPress={startListening}
              accessibilityRole="button"
              accessibilityLabel={speakingMessageId ? 'مقاطعة إزرا والتحدث الآن' : isListening ? 'إيقاف الاستماع' : 'ابدأ التحدث مع إزرا'}
              accessibilityHint={speakingMessageId ? 'سيوقف صوت إزرا ويبدأ الاستماع إليك' : isListening ? 'اضغط لإيقاف التقاط صوتك' : 'اضغط لبدء المحادثة الصوتية'}
            >
              <Text style={styles.voiceMicIcon}>{speakingMessageId ? 'Ⅱ' : isListening ? '■' : '⌁'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.voiceMicHint}>{voiceRetrying ? (voiceRetryMessage || 'أعيد الاتصال بخدمة الاستماع…') : speakingMessageId ? 'اضغط للمقاطعة والتحدث' : isListening ? 'أنا أسمعك الآن…' : sending ? 'أجهّز لك الرد…' : 'اضغط وتحدث معي بحرية'}</Text>
          {!!message.trim() && (
            <View style={styles.voiceTranscriptCard} accessibilityLiveRegion="polite">
              <Text style={styles.voiceTranscriptLabel}>{isListening ? 'ألتقط كلماتك الآن' : sending ? 'وصلني كلامك، أجهّز الرد' : 'النص الذي التقطته'}</Text>
              <Text style={styles.voiceTranscript} numberOfLines={3}>{message}</Text>
              {!isListening && !sending && (
                <TouchableOpacity style={styles.voiceSendButton} onPress={() => sendMessage(true)} disabled={sending}>
                  <Text style={styles.voiceSendLabel}>إرسال إلى إزرا  ↑</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          <TouchableOpacity style={styles.voiceTextLink} onPress={() => setVoiceHome(false)}>
            <Text style={styles.voiceTextLinkLabel}>المحادثة النصية  ·  السجل والملفات</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.voiceMemoryLink} onPress={openMemoryCenter}>
            <Text style={styles.voiceMemoryLabel}>الذاكرة</Text>
          </TouchableOpacity>
          <Modal visible={settingsVisible} transparent animationType="slide" onRequestClose={() => setSettingsVisible(false)}>
            <View style={styles.settingsBackdrop}>
              <View style={styles.settingsPanel}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>إعدادات الصوت</Text>                  <TouchableOpacity style={styles.historyClose} onPress={() => setSettingsVisible(false)}><Text style={styles.historyCloseText}>×</Text></TouchableOpacity>
                </View>                <View style={styles.settingRow}>
                  <View style={styles.settingCopy}><Text style={styles.settingTitle}>الاستماع التلقائي</Text><Text style={styles.settingHint}>يستمع بعد فتح الشاشة وبعد كل رد</Text></View>
                  <Switch value={autoListen} onValueChange={value => { autoListenRef.current = value; setAutoListen(value); if (!value) { setVoiceRetrying(false); setVoiceRetryMessage(''); } AsyncStorage.setItem('ezra:autoListen', String(value)).catch(() => {}); if (!value && isListening) ExpoSpeechRecognitionModule.stop(); }} trackColor={{ false: '#39323D', true: '#875477' }} thumbColor={autoListen ? '#F2C8E5' : '#AAA'} />
                </View>
                <View style={styles.settingRow}>
                  <View style={styles.settingCopy}><Text style={styles.settingTitle}>قراءة ردود EZRA تلقائيًا</Text><Text style={styles.settingHint}>ينطق الرد بعد وصوله</Text></View>
                  <Switch value={autoSpeak} onValueChange={value => { setAutoSpeak(value); AsyncStorage.setItem('ezra:autoSpeak', String(value)).catch(() => {}); }} trackColor={{ false: '#39323D', true: '#875477' }} thumbColor={autoSpeak ? '#F2C8E5' : '#AAA'} />
                </View>
                <View style={styles.settingRow}>
                  <View style={styles.settingCopy}><Text style={styles.settingTitle}>سرعة الصوت</Text><Text style={styles.settingHint}>{speechRate.toFixed(2)}×</Text></View>
                  <View style={styles.rateControls}>
                    <TouchableOpacity style={styles.rateButton} onPress={() => { const v = Math.max(0.75, Number((speechRate - 0.05).toFixed(2))); setSpeechRate(v); AsyncStorage.setItem('ezra:speechRate', String(v)).catch(() => {}); }}><Text style={styles.rateButtonText}>−</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.rateButton} onPress={() => { const v = Math.min(1.15, Number((speechRate + 0.05).toFixed(2))); setSpeechRate(v); AsyncStorage.setItem('ezra:speechRate', String(v)).catch(() => {}); }}><Text style={styles.rateButtonText}>＋</Text></TouchableOpacity>
                  </View>
                </View>
                <View style={styles.settingRow}>
                  <View style={styles.settingCopy}><Text style={styles.settingTitle}>عمق الصوت</Text><Text style={styles.settingHint}>{speechPitch.toFixed(2)} · نبرة أعمق</Text></View>
                  <View style={styles.rateControls}>
                    <TouchableOpacity style={styles.rateButton} onPress={() => { const value = Math.max(0.75, Number((speechPitch - 0.05).toFixed(2))); setSpeechPitch(value); AsyncStorage.setItem('ezra:speechPitch', String(value)).catch(() => {}); }}><Text style={styles.rateButtonText}>−</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.rateButton} onPress={() => { const value = Math.min(1.1, Number((speechPitch + 0.05).toFixed(2))); setSpeechPitch(value); AsyncStorage.setItem('ezra:speechPitch', String(value)).catch(() => {}); }}><Text style={styles.rateButtonText}>＋</Text></TouchableOpacity>
                  </View>
                </View>
                <View style={styles.settingRow}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingTitle}>الصوت العربي</Text>
                    <Text style={styles.settingHint}>{ttsVoices.find(voice => voice.identifier === selectedTtsVoice)?.name || 'تلقائي · أفضل صوت محسّن متاح'}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.voiceTopButton}
                    onPress={() => {
                      const arabicVoices = ttsVoices.filter(voice => voice.language.toLowerCase().startsWith('ar'));
                      Alert.alert('اختيار الصوت العربي', 'اختر صوتًا متاحًا على هاتفك. يمكنك تجربة الأصوات لاختيار الأنسب لك.', [
                        { text: 'تلقائي · الأفضل', onPress: () => { setSelectedTtsVoice(null); AsyncStorage.removeItem('ezra:ttsVoice').catch(() => {}); } },
                        ...arabicVoices.slice(0, 8).map(voice => ({
                          text: `${voice.name}${voice.quality === 'Enhanced' ? ' · محسّن' : ''} · تجربة`,
                          onPress: () => {
                            setSelectedTtsVoice(voice.identifier);
                            AsyncStorage.setItem('ezra:ttsVoice', voice.identifier).catch(() => {});
                            Speech.stop();
                            Speech.speak('مرحباً، أنا إزرا. سعيد بالحديث معك، كيف أستطيع مساعدتك؟', {
                              language: 'ar', voice: voice.identifier, rate: speechRate, pitch: speechPitch, volume: 1,
                            });
                          },
                        })),
                        { text: 'إغلاق', style: 'cancel' as const },
                      ]);
                    }}
                  >
                    <Text style={styles.voiceTopButtonText}>اختيار</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.settingRow}>
                  <View style={styles.settingCopy}><Text style={styles.settingTitle}>لغة التعرّف الصوتي</Text><Text style={styles.settingHint}>{recognitionLanguage === 'ar' ? 'العربية' : 'English'}</Text></View>
                  <View style={styles.rateControls}>
                    <TouchableOpacity style={[styles.rateButton, recognitionLanguage === 'ar' && styles.languageButtonActive]} onPress={() => { setRecognitionLanguage('ar'); AsyncStorage.setItem('ezra:recognitionLanguage', 'ar').catch(() => {}); }}><Text style={styles.rateButtonText}>ع</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.rateButton, recognitionLanguage === 'en' && styles.languageButtonActive]} onPress={() => { setRecognitionLanguage('en'); AsyncStorage.setItem('ezra:recognitionLanguage', 'en').catch(() => {}); }}><Text style={styles.rateButtonText}>EN</Text></TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.settingsFootnote}>نختار أفضل صوت عربي محسّن متاح على هاتفك تلقائيًا. جودة الصوت تعتمد أيضًا على محرّك تحويل النص إلى كلام والأصوات المثبتة في الجهاز.</Text>
              </View>
            </View>
          </Modal>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.brand}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>E</Text>
            </View>
            <View>
              <Text style={styles.name}>EZRA</Text>
              <View style={styles.statusRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.status}>مساعدك الشخصي</Text>
              </View>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.historyButton}
              onPress={returnToVoiceHome}
              accessibilityLabel="العودة إلى الشاشة الصوتية"
            >
              <Text style={styles.newChatText}>◉ الصوت</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.historyButton}
              onPress={openConversationHistory}
              accessibilityLabel="سجل المحادثات"
            >
              <Text style={styles.newChatText}>☷ المحادثات</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.newChatButton}
              onPress={startNewConversation}
              accessibilityLabel="بدء محادثة جديدة"
            >
              <Text style={styles.newChatText}>＋ جديدة</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.privateTag}
            onPress={() => Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج من حساب EZRA؟', [
              { text: 'إلغاء', style: 'cancel' },
              { text: 'تسجيل الخروج', style: 'destructive', onPress: () => { supabase.auth.signOut(); } },
            ])}
          >
            <Text style={styles.privateText}>تسجيل الخروج</Text>
          </TouchableOpacity>
        </View>

        <Modal
          visible={memoryVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setMemoryVisible(false)}
        >
          <View style={styles.historyBackdrop}>
            <View style={styles.memoryPanel}>
              <View style={styles.historyHeader}>
                <TouchableOpacity onPress={() => setMemoryVisible(false)} style={styles.historyClose}>
                  <Text style={styles.historyCloseText}>×</Text>
                </TouchableOpacity>
                <View style={styles.historyHeadingWrap}>
                  <Text style={styles.historyTitle}>ذاكرة إزرا</Text>
                  <Text style={styles.historySubtitle}>أنت تتحكم بما تحتفظ به إزرا</Text>
                </View>
              </View>

              <Text style={styles.memoryNotice}>
                أضف ما تريد أن تتذكره إزرا. لن تُعتمد أي ذكرى إلا بعد موافقتك.
              </Text>
              <TextInput
                style={styles.memoryInput}
                value={memoryDraft}
                onChangeText={setMemoryDraft}
                placeholder="مثال: أفضل الإجابات المختصرة باللغة العربية…"
                placeholderTextColor="#777680"
                multiline
                maxLength={1000}
                textAlign="right"
              />
              <TouchableOpacity
                style={[styles.memorySaveButton, (!memoryDraft.trim() || memorySaving) && styles.authButtonDisabled]}
                onPress={saveMemory}
                disabled={!memoryDraft.trim() || memorySaving}
              >
                <Text style={styles.memorySaveText}>
                  {memorySaving ? 'جارٍ الحفظ…' : '＋ حفظ كاقتراح'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.memorySectionTitle}>الذكريات المحفوظة والاقتراحات</Text>
              <TextInput
                style={styles.memorySearchInput}
                value={memorySearch}
                onChangeText={setMemorySearch}
                placeholder="ابحث داخل ذكرياتك…"
                placeholderTextColor="#777680"
                textAlign="right"
              />
              <View style={styles.memoryFilters}>
                {([
                  ['all', 'الكل'],
                  ['pending', 'بانتظار الموافقة'],
                  ['approved', 'معتمدة'],
                  ['rejected', 'مرفوضة'],
                ] as const).map(([value, label]) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.memoryFilter, memoryFilter === value && styles.memoryFilterActive]}
                    onPress={() => setMemoryFilter(value)}
                  >
                    <Text style={[styles.memoryFilterText, memoryFilter === value && styles.memoryFilterTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {memoryLoading ? (
                <Text style={styles.historyEmpty}>جارٍ تحميل الذكريات…</Text>
              ) : memories.length === 0 ? (
                <Text style={styles.historyEmpty}>لا توجد ذكريات بعد. يمكنك إضافة أول ذكرى أعلاه.</Text>
              ) : visibleMemories.length === 0 ? (
                <Text style={styles.historyEmpty}>لا توجد ذكريات تطابق البحث أو التصفية.</Text>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.memoryList}>
                  {visibleMemories.map(item => (
                    <View key={item.id} style={styles.memoryItem}>
                      <Text style={styles.memoryItemText}>{item.content}</Text>
                      <Text style={styles.memoryStatus}>
                        {item.approval_status === 'approved' ? 'معتمدة' : item.approval_status === 'pending' ? 'بانتظار موافقتك' : 'مرفوضة'}
                      </Text>
                      <View style={styles.memoryActions}>
                        {item.approval_status !== 'approved' && (
                          <TouchableOpacity
                            style={styles.memoryApprove}
                            onPress={() => updateMemoryStatus(item.id, 'approved')}
                          >
                            <Text style={styles.memoryActionText}>موافقة</Text>
                          </TouchableOpacity>
                        )}
                        {item.approval_status === 'pending' && (
                          <TouchableOpacity
                            style={styles.memoryReject}
                            onPress={() => updateMemoryStatus(item.id, 'rejected')}
                          >
                            <Text style={styles.memoryActionText}>رفض</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={styles.memoryDelete}
                          onPress={() => deleteMemory(item.id)}
                        >
                          <Text style={styles.memoryActionText}>حذف</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        <Modal
          visible={historyVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setHistoryVisible(false)}
        >
          <View style={styles.historyBackdrop}>
            <View style={styles.historyPanel}>
              <View style={styles.historyHeader}>
                <TouchableOpacity onPress={() => setHistoryVisible(false)} style={styles.historyClose}>
                  <Text style={styles.historyCloseText}>×</Text>
                </TouchableOpacity>
                <View style={styles.historyHeadingWrap}>
                  <Text style={styles.historyTitle}>محادثاتك السابقة</Text>
                  <Text style={styles.historySubtitle}>كل حديثك محفوظ هنا</Text>
                </View>
              </View>
              <TextInput
                style={styles.memorySearchInput}
                value={historySearch}
                onChangeText={setHistorySearch}
                placeholder="ابحث في المحادثات…"
                placeholderTextColor="#777680"
                textAlign="right"
              />
              {historyLoading ? (
                <Text style={styles.historyEmpty}>جارٍ تحميل المحادثات…</Text>
              ) : conversations.length === 0 ? (
                <Text style={styles.historyEmpty}>لا توجد محادثات سابقة حتى الآن.</Text>
              ) : visibleConversations.length === 0 ? (
                <Text style={styles.historyEmpty}>لا توجد محادثات تطابق البحث.</Text>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {visibleConversations.map(item => (
                    <View key={item.id} style={styles.historyItemRow}>
                      <TouchableOpacity
                        style={[styles.historyItem, styles.historyItemOpen, item.id === conversationId && styles.historyItemActive]}
                        onPress={() => selectConversation(item.id)}
                      >
                        <Text style={styles.historyDate}>
                          {new Date(item.updatedAt).toLocaleDateString('ar-DZ')}
                        </Text>
                        <Text style={styles.historyItemTitle} numberOfLines={2}>{item.title}</Text>
                        {item.id === conversationId && <Text style={styles.historyCurrent}>المحادثة الحالية</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.historyDeleteButton}
                        onPress={() => deleteConversation(item.id)}
                        accessibilityLabel="حذف المحادثة"
                      >
                        <Text style={styles.historyDeleteText}>حذف</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        <View style={styles.line} />

        <View style={styles.welcome}>
          <Text style={styles.welcomeSmall}>مساحة صُممت لأجلك</Text>
          <Text style={styles.welcomeTitle}>أهلًا بعودتك.</Text>
          <Text style={styles.welcomeSubtitle}>أنا هنا لأستمع إليك وأساعدك.</Text>
        </View>

        <EzraOrb status={isListening ? 'أستمع إليك الآن' : speakingMessageId ? 'أتحدث إليك' : (sending || chatLoading) ? 'أفكر في كلامك…' : 'أنا معك'} />

        <ScrollView
          style={styles.chat}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map(item => (
            <View
              key={item.id}
              style={[styles.messageRow, item.sender === 'user' && styles.userRow]}
            >
              {item.sender === 'ezra' && (
                <View style={styles.miniAvatar}>
                  <Text style={styles.miniAvatarText}>E</Text>
                </View>
              )}
              <View style={styles.messageColumn}>
                <View
                  style={[
                    styles.messageBubble,
                    item.sender === 'user' ? styles.userBubble : styles.ezraBubble,
                  ]}
                >
                  {!!item.text && <Text style={styles.messageText}>{item.text}</Text>}
                  {item.attachment && (
                    <View style={styles.attachmentChip}>
                      <Text style={styles.attachmentIcon}>
                        {item.attachment.kind === 'image' ? '▧' : '▤'}
                      </Text>
                      <Text style={styles.attachmentName} numberOfLines={1}>
                        {item.attachment.name}
                      </Text>
                    </View>
                  )}
                </View>
                {item.sender === 'ezra' && !!item.text && (
                  <TouchableOpacity
                    style={styles.speakButton}
                    onPress={() => speak(item.text, item.id)}
                    accessibilityLabel={speakingMessageId === item.id ? 'إيقاف قراءة الرد' : 'استمع إلى الرد'}
                  >
                    <Text style={styles.speakText}>{speakingMessageId === item.id ? '■  إيقاف' : '▶  استمع'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickButton} onPress={() => setMessage('مرحبًا إزرا، أريد أن نتحدث.')}>
            <Text style={styles.quickText}>✧  لنتحدث</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickButton} onPress={() => setMessage('ساعدني في تنظيم يومي.')}>
            <Text style={styles.quickText}>◷  يومي</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickButton} onPress={openMemoryCenter}>
            <Text style={styles.quickText}>♡  الذكريات</Text>
          </TouchableOpacity>
        </View>

        {attachment && (
          <View style={styles.pendingAttachment}>
            <Text style={styles.pendingText} numberOfLines={1}>
              {attachment.kind === 'image' ? 'صورة جاهزة للتحليل: ' : 'ملف جاهز للقراءة: '}{attachment.name}
            </Text>
            <TouchableOpacity onPress={() => setAttachment(null)}>
              <Text style={styles.removeAttachment}>×</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.composer}>
          <TouchableOpacity
            style={styles.attachButton}
            onPress={chooseAttachment}
            accessibilityLabel="إرفاق صورة أو ملف"
          >
            <Text style={styles.attachText}>＋</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            textAlign="right"
            placeholder="اكتب رسالتك إلى إزرا…"
            placeholderTextColor="#777680"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={3000}
          />
          <TouchableOpacity
            style={[styles.voiceButton, isListening && styles.voiceButtonActive]}
            onPress={startListening}
            accessibilityLabel={isListening ? 'إيقاف الإدخال الصوتي' : 'بدء الإدخال الصوتي'}
          >
            <Text style={styles.voiceIcon}>{isListening ? '■' : '⌁'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sendButton} onPress={() => sendMessage()} disabled={sending || chatLoading}>
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>{chatLoading ? 'جارٍ تحميل محادثتك…' : 'محادثتك محفوظة بخصوصية'}</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  orbSection: { alignItems: 'center', paddingTop: 0, paddingBottom: 10 },
  orbStage: { width: 292, height: 292, alignItems: 'center', justifyContent: 'center' },
  orbRipple: { position: 'absolute', width: 252, height: 252, borderRadius: 126, borderWidth: 1, borderColor: 'rgba(239,133,203,0.46)' },
  orbHalo: { position: 'absolute', width: 224, height: 224, borderRadius: 112, backgroundColor: '#8E3B78', shadowColor: '#E34BB5', shadowOpacity: 0.9, shadowRadius: 32, shadowOffset: { width: 0, height: 0 }, elevation: 18 },
  orbAura: { position: 'absolute', width: 278, height: 278, borderRadius: 139, borderWidth: 1, borderColor: 'rgba(191,92,164,0.22)' },
  orbHaloListening: { backgroundColor: '#A13E86', shadowColor: '#F05CC4' },
  orbHaloThinking: { backgroundColor: '#633C91', shadowColor: '#A77AFF' },
  orbHaloSpeaking: { backgroundColor: '#87366E', shadowColor: '#FF8AD5' },
  orbRingOuter: { position: 'absolute', width: 244, height: 244, borderRadius: 122, borderWidth: 1, borderColor: '#A85B91', borderStyle: 'dashed', opacity: 0.62, alignItems: 'flex-start', justifyContent: 'center' },
  orbRingInner: { position: 'absolute', width: 184, height: 184, borderRadius: 92, borderWidth: 1, borderColor: '#D17AB7', opacity: 0.7, alignItems: 'flex-end', justifyContent: 'center' },
  orbOrbitDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F0B7DF', marginLeft: -3 },
  orbOrbitDotSmall: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#C58BE2', marginRight: -2 },
  orbCore: { width: 146, height: 146, borderRadius: 73, backgroundColor: '#672B5A', borderWidth: 1, borderColor: '#E6A0D0', alignItems: 'center', justifyContent: 'center', shadowColor: '#D84AAE', shadowOpacity: 0.9, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 16 },
  orbCoreListening: { backgroundColor: '#81366D', borderColor: '#F4B2E1' },
  orbCoreThinking: { backgroundColor: '#4D326E', borderColor: '#C5A5F5' },
  orbCoreSpeaking: { backgroundColor: '#79345F', borderColor: '#FFD0EB' },
  orbCoreShade: { position: 'absolute', width: 142, height: 142, borderRadius: 71, backgroundColor: 'rgba(15,5,22,0.42)', transform: [{ translateX: 10 }, { translateY: 13 }] },
  orbCoreInner: { position: 'absolute', width: 112, height: 112, borderRadius: 56, backgroundColor: 'rgba(194,91,164,0.26)', borderWidth: 1, borderColor: 'rgba(255,204,239,0.28)' },
  orbCoreHighlight: { width: 78, height: 78, borderRadius: 39, backgroundColor: '#D07AB5', opacity: 0.48, borderWidth: 1, borderColor: '#F0B7DF', transform: [{ translateX: -9 }, { translateY: -11 }] },
  orbParticleTop: { position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: '#F7D8ED', top: 35, right: 83, opacity: 0.8 },
  orbParticleLeft: { position: 'absolute', width: 3, height: 3, borderRadius: 2, backgroundColor: '#D6A5F2', left: 42, top: 147, opacity: 0.75 },
  orbParticleBottom: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: '#E6A0D0', bottom: 43, right: 75, opacity: 0.75 },
  orbCoreSpark: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#F4D7EC', top: 34, right: 38, opacity: 0.8 },
  orbStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 6, borderRadius: 20, backgroundColor: '#211B27', borderWidth: 1, borderColor: '#493044', marginTop: -1 },
  orbStatusPillActive: { borderColor: '#9C5C91', backgroundColor: '#2B1C2D' },
  orbStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#9EBD9D' },
  orbStatusDotActive: { backgroundColor: '#E7A6D2' },
  orbStatus: { color: '#E7B9D8', fontSize: 11, fontWeight: '600' },
  orbWaveform: { height: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12 },
  orbWaveBar: { width: 3, height: 22, borderRadius: 2, backgroundColor: '#D88BC1', shadowColor: '#D84AAE', shadowOpacity: 0.7, shadowRadius: 6 },
  orbCaption: { color: '#77717E', fontSize: 9, marginTop: 6 },
  voiceSafe: { flex: 1, backgroundColor: '#08070D' },
  voiceTopActions: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  voiceBrand: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  voiceBrandName: { color: '#E8C5DF', fontSize: 17, fontWeight: '700', letterSpacing: 5 },
  voiceBrandStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  voiceBrandDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#9EBD9D' },
  voiceBrandStatusText: { color: '#817583', fontSize: 7, letterSpacing: 1.7 },
  voiceTopButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(36,24,38,0.72)', borderWidth: 1, borderColor: '#493044' },
  voiceTopButtonText: { color: '#BFA4BA', fontSize: 11 },
  settingsBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.76)', justifyContent: 'flex-end' },
  settingsPanel: { backgroundColor: '#17131C', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: '#56384F', padding: 22, paddingBottom: 34 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: '#302532' },
  settingCopy: { flex: 1, alignItems: 'flex-end', marginRight: 12 },
  settingTitle: { color: '#F3EAF2', fontSize: 13, fontWeight: '600' },
  settingHint: { color: '#9D899C', fontSize: 11, marginTop: 5 },
  rateControls: { flexDirection: 'row', gap: 8 },
  rateButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#38263A', alignItems: 'center', justifyContent: 'center' },
  rateButtonText: { color: '#F0C9E4', fontSize: 21 },
  settingsFootnote: { color: '#827684', fontSize: 10, textAlign: 'right', marginTop: 18, lineHeight: 17 },
  voiceHome: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingTop: 34, paddingBottom: 24, paddingHorizontal: 24, backgroundColor: '#08070D' },

  voiceOrbWrap: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },

  voiceMicWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  voiceMicHalo: { position: 'absolute', width: 84, height: 84, borderRadius: 42, borderWidth: 1, borderColor: '#D98AC4', backgroundColor: 'rgba(173,65,139,0.12)' },
  voiceMic: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#35182F', borderWidth: 1, borderColor: '#C46BA9', shadowColor: '#D64BAF', shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 12 },
  voiceMicActive: { backgroundColor: '#7A285F', borderColor: '#F0B5DE' },
  voiceMicSpeaking: { backgroundColor: '#4A285D', borderColor: '#C5A5F5' },
  voiceMicIcon: { color: '#F7D8ED', fontSize: 30, fontWeight: '600' },
  voiceMicHint: { color: '#8F7B91', fontSize: 11, letterSpacing: 0.25, marginTop: -8, marginBottom: 2 },
  voiceTranscriptCard: { width: '100%', maxWidth: 360, padding: 14, borderRadius: 18, backgroundColor: '#19131F', borderWidth: 1, borderColor: '#57364F', marginBottom: 12 },
  voiceTranscriptLabel: { color: '#C58BB7', textAlign: 'right', fontSize: 10, marginBottom: 6, letterSpacing: 0.3 },
  voiceTranscript: { color: '#F5EAF3', textAlign: 'right', fontSize: 13, lineHeight: 21 },
  voiceSendButton: { alignSelf: 'flex-end', marginTop: 10, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 14, backgroundColor: '#A94F91' },
  voiceSendLabel: { color: '#FFF5FC', fontSize: 12, fontWeight: '700' },
  voiceTextLink: { marginTop: 12, padding: 10 },
  voiceTextLinkLabel: { color: '#B58DAE', fontSize: 11, letterSpacing: 0.5 },
  voiceMemoryLink: { padding: 7 },
  voiceMemoryLabel: { color: '#766B7B', fontSize: 10 },
  authSafe: { flex: 1, backgroundColor: '#101014', alignItems: 'center', justifyContent: 'center', padding: 26 },
  authCard: { width: '100%', maxWidth: 420, alignItems: 'center' },
  authBrand: { color: '#F5F0F5', fontSize: 24, fontWeight: '700', letterSpacing: 6, marginTop: 18 },
  authTitle: { color: '#F5F0F5', fontSize: 23, fontWeight: '600', marginTop: 26 },
  authHint: { color: '#918B98', fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 9, marginBottom: 22 },
  authInput: { width: '100%', textAlign: 'right', writingDirection: 'rtl', color: '#F5F0F5', backgroundColor: '#211F27', borderWidth: 1, borderColor: '#39323D', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 15, marginBottom: 12, fontSize: 14 },
  authInputLtr: { textAlign: 'left', writingDirection: 'ltr' },
  authError: { width: '100%', color: '#F0A4A4', fontSize: 12, marginBottom: 12 },
  authButton: { width: '100%', backgroundColor: '#B58DAE', borderRadius: 14, alignItems: 'center', paddingVertical: 16, marginTop: 4 },
  authButtonDisabled: { opacity: 0.6 },
  authButtonText: { color: '#171219', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  authFootnote: { color: '#68636E', fontSize: 10, letterSpacing: 0.6, marginTop: 20 },
  safe: { flex: 1, backgroundColor: '#101014' },
  container: { flex: 1, backgroundColor: '#101014' },
  header: {
    height: 76,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: '#29212B',
    borderWidth: 1,
    borderColor: '#A77A9B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#E7B9D8', fontSize: 23, fontWeight: '600' },
  name: { color: '#F5F0F5', fontSize: 17, letterSpacing: 4, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#9EBD9D' },
  status: { color: '#96919D', fontSize: 9, letterSpacing: 0.6 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  historyButton: { paddingHorizontal: 8, paddingVertical: 7, borderRadius: 10, backgroundColor: '#211F27', borderWidth: 1, borderColor: '#493849' },
  newChatButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#29212B',
    borderWidth: 1,
    borderColor: '#6E4D69',
  },
  newChatText: { color: '#E7B9D8', fontSize: 9, letterSpacing: 0.8 },
  privateTag: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#211F27',
    borderWidth: 1,
    borderColor: '#39323D',
  },
  privateText: { color: '#D5A9CC', fontSize: 9, letterSpacing: 1.2 },
  historyBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  historyPanel: { height: '78%', backgroundColor: '#15131A', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: '#493849', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  historyHeadingWrap: { alignItems: 'flex-end', flex: 1 },
  historyTitle: { color: '#F5F0F5', fontSize: 19, fontWeight: '700' },
  historySubtitle: { color: '#918B98', fontSize: 11, marginTop: 5 },
  historyClose: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#29212B', alignItems: 'center', justifyContent: 'center' },
  historyCloseText: { color: '#E7B9D8', fontSize: 25, lineHeight: 28 },
  historyEmpty: { color: '#A69BAA', textAlign: 'center', marginTop: 45, fontSize: 13 },
  historyItem: { padding: 15, marginBottom: 9, borderRadius: 14, backgroundColor: '#211F27', borderWidth: 1, borderColor: '#39323D' },
  historyItemRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginBottom: 9 },
  historyItemOpen: { flex: 1, marginBottom: 0 },
  historyDeleteButton: { paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#38252B', borderWidth: 1, borderColor: '#63404B' },
  historyDeleteText: { color: '#E7B9D8', fontSize: 10, fontWeight: '600' },
  historyItemActive: { borderColor: '#B58DAE', backgroundColor: '#2B202D' },
  historyDate: { color: '#A98BA5', fontSize: 10, textAlign: 'right', marginBottom: 7 },
  historyItemTitle: { color: '#F1ECF2', fontSize: 13, lineHeight: 20, textAlign: 'right' },
  historyCurrent: { color: '#D5A9CC', fontSize: 10, textAlign: 'right', marginTop: 7 },
  memoryPanel: { height: '88%', backgroundColor: '#15131A', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: '#493849', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  memoryNotice: { color: '#A69BAA', fontSize: 11, lineHeight: 18, textAlign: 'right', marginBottom: 10 },
  memoryInput: { minHeight: 76, maxHeight: 120, color: '#F5F0F5', backgroundColor: '#211F27', borderWidth: 1, borderColor: '#493849', borderRadius: 13, padding: 12, textAlignVertical: 'top', textAlign: 'right', writingDirection: 'rtl', fontSize: 12 },
  memorySaveButton: { backgroundColor: '#B58DAE', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 9 },
  memorySaveText: { color: '#171219', fontSize: 12, fontWeight: '700' },
  memorySectionTitle: { color: '#E7B9D8', fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 20, marginBottom: 10 },
  memorySearchInput: { minHeight: 42, color: '#F5F0F5', backgroundColor: '#211F27', borderWidth: 1, borderColor: '#493849', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, textAlign: 'right', fontSize: 12, marginBottom: 9 },
  memoryFilters: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, marginBottom: 10 },
  memoryFilter: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: '#211F27', borderWidth: 1, borderColor: '#39323D' },
  memoryFilterActive: { backgroundColor: '#3B3040', borderColor: '#B58DAE' },
  memoryFilterText: { color: '#A69BAA', fontSize: 9 },
  memoryFilterTextActive: { color: '#F0C9E4', fontWeight: '700' },
  memoryList: { paddingBottom: 16, gap: 9 },
  memoryItem: { padding: 13, borderRadius: 13, backgroundColor: '#211F27', borderWidth: 1, borderColor: '#39323D' },
  memoryItemText: { color: '#F1ECF2', fontSize: 12, lineHeight: 19, textAlign: 'right' },
  memoryStatus: { color: '#B58DAE', fontSize: 10, textAlign: 'right', marginTop: 8 },
  memoryActions: { flexDirection: 'row', justifyContent: 'flex-start', gap: 7, marginTop: 10 },
  memoryApprove: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: '#3B3040' },
  memoryReject: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: '#49313A' },
  memoryDelete: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: '#38252B' },
  memoryActionText: { color: '#E7B9D8', fontSize: 10, fontWeight: '600' },
  line: { height: 1, backgroundColor: '#26242C' },
  welcome: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 6, alignItems: 'flex-end' },
  welcomeSmall: { color: '#B58DAE', fontSize: 10, marginBottom: 10, textAlign: 'right' },
  welcomeTitle: { color: '#F5F0F5', fontSize: 27, fontWeight: '600', textAlign: 'right' },
  welcomeSubtitle: { color: '#918B98', fontSize: 13, marginTop: 7, textAlign: 'right' },
  chat: { flex: 1 },
  chatContent: { paddingHorizontal: 19, paddingBottom: 20, gap: 17 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9 },
  userRow: { justifyContent: 'flex-end' },
  miniAvatar: {
    width: 27,
    height: 27,
    borderRadius: 10,
    backgroundColor: '#352735',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarText: { color: '#E6B8D8', fontWeight: '700', fontSize: 13 },
  messageColumn: { maxWidth: '86%', gap: 5 },
  messageBubble: { maxWidth: '100%', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 17 },
  ezraBubble: { backgroundColor: '#201E26', borderBottomLeftRadius: 5 },
  userBubble: { backgroundColor: '#493449', borderBottomRightRadius: 5 },
  messageText: { color: '#F1ECF2', fontSize: 14, lineHeight: 22, textAlign: 'right', writingDirection: 'rtl' },
  speakButton: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3 },
  speakText: { color: '#B58DAE', fontSize: 10 },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 5,
    padding: 9,
    borderRadius: 10,
    backgroundColor: '#17151C',
  },
  attachmentIcon: { color: '#D5A9CC', fontSize: 17 },
  attachmentName: { color: '#E8DCE8', fontSize: 11, maxWidth: 190 },
  quickActions: { flexDirection: 'row', paddingHorizontal: 15, gap: 7, paddingVertical: 12 },
  quickButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#1C1B22',
    alignItems: 'center',
  },
  quickText: { color: '#C9B6C8', fontSize: 9, letterSpacing: 0.3 },
  pendingAttachment: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#211F27',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pendingText: { color: '#D5C5D5', fontSize: 11, flex: 1 },
  removeAttachment: { color: '#E7B9D8', fontSize: 21, paddingHorizontal: 6 },
  composer: {
    marginHorizontal: 14,
    minHeight: 57,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#211F27',
    borderWidth: 1,
    borderColor: '#39323D',
    borderRadius: 18,
    gap: 7,
  },
  attachButton: { width: 29, alignItems: 'center' },
  attachText: { color: '#BBA7BB', fontSize: 25 },
  input: { flex: 1, color: '#F5F0F5', fontSize: 14, maxHeight: 95, paddingVertical: 13, textAlign: 'right', writingDirection: 'rtl' },
  voiceButton: { width: 32, height: 35, alignItems: 'center', justifyContent: 'center' },
  voiceButtonActive: { backgroundColor: '#493449', borderRadius: 10 },
  voiceIcon: { color: '#D5A9CC', fontSize: 21 },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#B58DAE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: { color: '#171219', fontSize: 22, fontWeight: '700' },
  footer: {
    color: '#68636E',
    fontSize: 8,
    letterSpacing: 1.6,
    textAlign: 'center',
    paddingTop: 13,
    paddingBottom: 9,
  },
  languageButtonActive: { backgroundColor: '#875477', borderWidth: 1, borderColor: '#E6A0D0' },
});
