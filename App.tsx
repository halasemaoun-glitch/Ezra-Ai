import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
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
import { supabase } from './src/lib/supabase';

type Attachment = {
  uri: string;
  name: string;
  kind: 'image' | 'file';
};

type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
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

function EzraOrb({ status }: { status: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const orbit = Animated.loop(
      Animated.timing(rotation, { toValue: 1, duration: 14500, easing: Easing.linear, useNativeDriver: true })
    );
    breathing.start();
    orbit.start();
    return () => { breathing.stop(); orbit.stop(); };
  }, [pulse, rotation]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.07] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.38, 0.88] });
  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const reverseSpin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const active = status !== 'أنا معك';
  return (
    <View style={styles.orbSection}>
      <View style={styles.orbStage}>
        <Animated.View style={[styles.orbHalo, { opacity: glow, transform: [{ scale }] }]} />
        <Animated.View style={[styles.orbRingOuter, { transform: [{ rotate: spin }] }]}>
          <View style={styles.orbOrbitDot} />
        </Animated.View>
        <Animated.View style={[styles.orbRingInner, { transform: [{ rotate: reverseSpin }] }]}>
          <View style={styles.orbOrbitDotSmall} />
        </Animated.View>
        <Animated.View style={[styles.orbCore, { transform: [{ scale }] }]}>
          <View style={styles.orbCoreHighlight} />
          <View style={styles.orbCoreSpark} />
        </Animated.View>
      </View>
      <View style={[styles.orbStatusPill, active && styles.orbStatusPillActive]}>
        <View style={[styles.orbStatusDot, active && styles.orbStatusDotActive]} />
        <Text style={styles.orbStatus}>{status}</Text>
      </View>
      <Text style={styles.orbCaption}>مساحتك الخاصة للحديث والتفكير</Text>
    </View>
  );
}

export default function App() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [isListening, setIsListening] = useState(false);
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

  useSpeechRecognitionEvent('start', () => setIsListening(true));
  useSpeechRecognitionEvent('end', () => setIsListening(false));
  useSpeechRecognitionEvent('result', event => {
    const transcript = event.results[0]?.transcript;
    if (transcript) setMessage(transcript);
  });
  useSpeechRecognitionEvent('error', () => setIsListening(false));

  const sendMessage = async () => {
    const text = message.trim();
    if ((!text && !attachment) || !session || !conversationId || sending) return;

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

      if (text) {
        const recentContext = messages
          .filter(item => item.id !== 'welcome' && !!item.text.trim())
          .slice(-12)
          .map(item => `${item.sender === 'user' ? 'User' : 'EZRA'}: ${item.text}`)
          .join('\n');
        const conversationInput = recentContext
          ? `Continue this conversation naturally. Use the previous messages as context.\n\n${recentContext}\nUser: ${text}`
          : text;

        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const aiRequest = await Promise.race([
          supabase.functions.invoke('smart-service', {
            body: { input: conversationInput },
          }).then(result => ({ kind: 'response' as const, result })),
          new Promise<{ kind: 'timeout' }>(resolve => {
            timeoutId = setTimeout(() => resolve({ kind: 'timeout' }), 30000);
          }),
        ]);
        if (timeoutId) clearTimeout(timeoutId);

        if (aiRequest.kind === 'timeout') {
          console.error('EZRA AI request timed out after 30 seconds.');
          Alert.alert(
            'EZRA response timed out',
            'Your message was saved, but smart-service did not respond within 30 seconds. The next build will stop the endless sending state so we can diagnose the service.'
          );
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
            details || 'Your message was saved, but smart-service returned an empty response.'
          );
          setSending(false);
          return;
        }

        const reply = aiData.reply.trim();
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
            { id: `unsaved-${Date.now()}`, sender: 'ezra', text: reply },
          ]);
          Alert.alert('لم يُحفظ الرد', 'إزرا أجاب، لكن تعذّر حفظ الرد في سجل المحادثة.');
        } else {
          setMessages(previous => [
            ...previous,
            { id: savedReply.id, sender: 'ezra', text: reply },
          ]);
        }
      } else {
        Alert.alert(
          'تم حفظ المرفق',
          'تم حفظ اسم المرفق. سنضيف إرسال الملف نفسه إلى إزرا في مرحلة لاحقة.'
        );
      }
    } catch (error) {
      console.error('Message sending failed:', error);
      Alert.alert('حدث خطأ', 'حاول إرسال رسالتك مرة أخرى.');
    }

    setSending(false);
  };

  const startListening = async () => {
    try {
      if (isListening) {
        ExpoSpeechRecognitionModule.stop();
        return;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('إذن الميكروفون', 'اسمح باستخدام الميكروفون والتعرّف على الكلام من إعدادات الجهاز.');
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: 'ar',
        interimResults: true,
        continuous: false,
      });
    } catch {
      setIsListening(false);
      Alert.alert('الصوت غير متاح', 'التعرّف على الكلام غير متاح على هذا الجهاز حاليًا.');
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setAttachment({
        uri: asset.uri,
        name: asset.fileName || 'Selected photo',
        kind: 'image',
      });
    } catch {
      Alert.alert('صورة unavailable', 'تعذّر فتح معرض الصور.');
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
      setAttachment({ uri: file.uri, name: file.name, kind: 'file' });
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

  const speak = (text: string) => {
    Speech.stop();
    Speech.speak(text, { language: 'ar', rate: 0.92, pitch: 0.92 });
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
            style={styles.authInput}
            textAlign="right"
            placeholder="البريد الإلكتروني"
            placeholderTextColor="#777680"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextInput
            style={styles.authInput}
            placeholder="كلمة المرور"
            placeholderTextColor="#777680"
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
              {historyLoading ? (
                <Text style={styles.historyEmpty}>جارٍ تحميل المحادثات…</Text>
              ) : conversations.length === 0 ? (
                <Text style={styles.historyEmpty}>لا توجد محادثات سابقة حتى الآن.</Text>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {conversations.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.historyItem, item.id === conversationId && styles.historyItemActive]}
                      onPress={() => selectConversation(item.id)}
                    >
                      <Text style={styles.historyDate}>
                        {new Date(item.updatedAt).toLocaleDateString('ar-DZ')}
                      </Text>
                      <Text style={styles.historyItemTitle} numberOfLines={2}>{item.title}</Text>
                      {item.id === conversationId && <Text style={styles.historyCurrent}>المحادثة الحالية</Text>}
                    </TouchableOpacity>
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

        <EzraOrb status={isListening ? 'أستمع إليك الآن' : (sending || chatLoading) ? 'أفكر في كلامك…' : 'أنا معك'} />

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
                    onPress={() => speak(item.text)}
                    accessibilityLabel="استمع إلى الرد"
                  >
                    <Text style={styles.speakText}>▶  استمع</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickButton} onPress={() => setMessage('Let’s talk.')}>
            <Text style={styles.quickText}>✧  لنتحدث</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickButton} onPress={() => setMessage('Help me plan my day.')}>
            <Text style={styles.quickText}>◷  يومي</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickButton} onPress={() => Alert.alert('الذكريات', `لديك ${messages.length} رسائل في هذه المحادثة. الذاكرة الذكية طويلة الأمد سنضيفها في مرحلة لاحقة.`)}>
            <Text style={styles.quickText}>♡  الذكريات</Text>
          </TouchableOpacity>
        </View>

        {attachment && (
          <View style={styles.pendingAttachment}>
            <Text style={styles.pendingText} numberOfLines={1}>
              {attachment.kind === 'image' ? 'صورة: ' : 'ملف: '}{attachment.name}
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
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage} disabled={sending || chatLoading}>
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
  orbStage: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  orbHalo: { position: 'absolute', width: 126, height: 126, borderRadius: 63, backgroundColor: '#8E3B78', shadowColor: '#E34BB5', shadowOpacity: 0.9, shadowRadius: 32, shadowOffset: { width: 0, height: 0 }, elevation: 18 },
  orbRingOuter: { position: 'absolute', width: 138, height: 138, borderRadius: 69, borderWidth: 1, borderColor: '#A85B91', borderStyle: 'dashed', opacity: 0.62, alignItems: 'flex-start', justifyContent: 'center' },
  orbRingInner: { position: 'absolute', width: 108, height: 108, borderRadius: 54, borderWidth: 1, borderColor: '#D17AB7', opacity: 0.7, alignItems: 'flex-end', justifyContent: 'center' },
  orbOrbitDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F0B7DF', marginLeft: -3 },
  orbOrbitDotSmall: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#C58BE2', marginRight: -2 },
  orbCore: { width: 86, height: 86, borderRadius: 43, backgroundColor: '#672B5A', borderWidth: 1, borderColor: '#E6A0D0', alignItems: 'center', justifyContent: 'center', shadowColor: '#D84AAE', shadowOpacity: 0.9, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 16 },
  orbCoreHighlight: { width: 45, height: 45, borderRadius: 23, backgroundColor: '#B85A9D', opacity: 0.55, borderWidth: 1, borderColor: '#F0B7DF' },
  orbCoreSpark: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#F4D7EC', top: 21, right: 23, opacity: 0.8 },
  orbStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 6, borderRadius: 20, backgroundColor: '#211B27', borderWidth: 1, borderColor: '#493044', marginTop: -1 },
  orbStatusPillActive: { borderColor: '#9C5C91', backgroundColor: '#2B1C2D' },
  orbStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#9EBD9D' },
  orbStatusDotActive: { backgroundColor: '#E7A6D2' },
  orbStatus: { color: '#E7B9D8', fontSize: 11, fontWeight: '600' },
  orbCaption: { color: '#77717E', fontSize: 9, marginTop: 6 },
  authSafe: { flex: 1, backgroundColor: '#101014', alignItems: 'center', justifyContent: 'center', padding: 26 },
  authCard: { width: '100%', maxWidth: 420, alignItems: 'center' },
  authBrand: { color: '#F5F0F5', fontSize: 24, fontWeight: '700', letterSpacing: 6, marginTop: 18 },
  authTitle: { color: '#F5F0F5', fontSize: 23, fontWeight: '600', marginTop: 26 },
  authHint: { color: '#918B98', fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 9, marginBottom: 22 },
  authInput: { width: '100%', textAlign: 'right', writingDirection: 'rtl', color: '#F5F0F5', backgroundColor: '#211F27', borderWidth: 1, borderColor: '#39323D', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 15, marginBottom: 12, fontSize: 14 },
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
  historyItemActive: { borderColor: '#B58DAE', backgroundColor: '#2B202D' },
  historyDate: { color: '#A98BA5', fontSize: 10, textAlign: 'right', marginBottom: 7 },
  historyItemTitle: { color: '#F1ECF2', fontSize: 13, lineHeight: 20, textAlign: 'right' },
  historyCurrent: { color: '#D5A9CC', fontSize: 10, textAlign: 'right', marginTop: 7 },
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
});
