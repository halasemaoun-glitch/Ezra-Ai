import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  KeyboardAvoidingView,
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
        const nextId = savedId || createConversationId();
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
      Alert.alert('Could not start a new chat', 'Please try again.');
    }
  };

  const signIn = async () => {
    if (!email.trim() || !password) {
      setAuthError('Enter your email and password.');
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
        Alert.alert('Chat unavailable', 'Could not load your saved messages. Please try again.');
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
        Alert.alert('Message not saved', diagnostic);
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
            'EZRA could not reply',
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
          Alert.alert('Reply not saved', 'EZRA replied, but the response could not be saved to chat history.');
        } else {
          setMessages(previous => [
            ...previous,
            { id: savedReply.id, sender: 'ezra', text: reply },
          ]);
        }
      } else {
        Alert.alert(
          'Attachment saved',
          'The attachment name was saved. Sending the actual file to EZRA will be added in a later step.'
        );
      }
    } catch (error) {
      console.error('Message sending failed:', error);
      Alert.alert('Something went wrong', 'Please try sending your message again.');
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
        Alert.alert('Microphone permission', 'Allow microphone and speech recognition access in your device settings.');
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: 'ar',
        interimResults: true,
        continuous: false,
      });
    } catch {
      setIsListening(false);
      Alert.alert('Voice unavailable', 'Speech recognition is not available on this device right now.');
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
      Alert.alert('Photo unavailable', 'Could not open your photo library.');
    }
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const file = result.assets[0];
      setAttachment({ uri: file.uri, name: file.name, kind: 'file' });
    } catch {
      Alert.alert('File unavailable', 'Could not open the file picker.');
    }
  };

  const chooseAttachment = () => {
    Alert.alert('Attach to message', 'Choose what you want to attach.', [
      { text: 'Photo', onPress: pickImage },
      { text: 'File', onPress: pickFile },
      { text: 'Cancel', style: 'cancel' },
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
        <Text style={styles.authHint}>Preparing your private space…</Text>
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
          <Text style={styles.authTitle}>Your private space.</Text>
          <Text style={styles.authHint}>Sign in to continue to your personal companion.</Text>
          <TextInput
            style={styles.authInput}
            placeholder="Email"
            placeholderTextColor="#777680"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextInput
            style={styles.authInput}
            placeholder="Password"
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
            <Text style={styles.authButtonText}>{signingIn ? 'SIGNING IN…' : 'SIGN IN'}</Text>
          </TouchableOpacity>
          <Text style={styles.authFootnote}>Private access · Authorized account only</Text>
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
                <Text style={styles.status}>YOUR PRIVATE COMPANION</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={styles.newChatButton}
            onPress={startNewConversation}
            accessibilityLabel="Start a new conversation"
          >
            <Text style={styles.newChatText}>＋ NEW CHAT</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.privateTag}
            onPress={() => Alert.alert('Sign out', 'Sign out of your EZRA account?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => { supabase.auth.signOut(); } },
            ])}
          >
            <Text style={styles.privateText}>SIGN OUT</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.line} />

        <View style={styles.welcome}>
          <Text style={styles.welcomeSmall}>A SPACE JUST FOR YOU</Text>
          <Text style={styles.welcomeTitle}>Good to see you.</Text>
          <Text style={styles.welcomeSubtitle}>Your thoughts have a place here.</Text>
        </View>

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
                    accessibilityLabel="Read message aloud"
                  >
                    <Text style={styles.speakText}>▶  Listen</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickButton} onPress={() => setMessage('Let’s talk.')}>
            <Text style={styles.quickText}>✧  LET’S TALK</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickButton} onPress={() => setMessage('Help me plan my day.')}>
            <Text style={styles.quickText}>◷  MY DAY</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickButton} onPress={() => Alert.alert('Saved chat', `${messages.length} messages are stored on this device. Long-term AI memory is not connected yet.`)}>
            <Text style={styles.quickText}>♡  MEMORIES</Text>
          </TouchableOpacity>
        </View>

        {attachment && (
          <View style={styles.pendingAttachment}>
            <Text style={styles.pendingText} numberOfLines={1}>
              {attachment.kind === 'image' ? 'Photo: ' : 'File: '}{attachment.name}
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
            accessibilityLabel="Attach photo or file"
          >
            <Text style={styles.attachText}>＋</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Message Ezra..."
            placeholderTextColor="#777680"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={3000}
          />
          <TouchableOpacity
            style={[styles.voiceButton, isListening && styles.voiceButtonActive]}
            onPress={startListening}
            accessibilityLabel={isListening ? 'Stop voice input' : 'Start voice input'}
          >
            <Text style={styles.voiceIcon}>{isListening ? '■' : '⌁'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage} disabled={sending || chatLoading}>
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>{chatLoading ? 'LOADING YOUR PRIVATE CHAT…' : 'YOUR CHAT IS SAVED PRIVATELY'}</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  authSafe: { flex: 1, backgroundColor: '#101014', alignItems: 'center', justifyContent: 'center', padding: 26 },
  authCard: { width: '100%', maxWidth: 420, alignItems: 'center' },
  authBrand: { color: '#F5F0F5', fontSize: 24, fontWeight: '700', letterSpacing: 6, marginTop: 18 },
  authTitle: { color: '#F5F0F5', fontSize: 23, fontWeight: '600', marginTop: 26 },
  authHint: { color: '#918B98', fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 9, marginBottom: 22 },
  authInput: { width: '100%', color: '#F5F0F5', backgroundColor: '#211F27', borderWidth: 1, borderColor: '#39323D', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 15, marginBottom: 12, fontSize: 14 },
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
  line: { height: 1, backgroundColor: '#26242C' },
  welcome: { paddingHorizontal: 24, paddingTop: 29, paddingBottom: 24 },
  welcomeSmall: { color: '#B58DAE', fontSize: 9, letterSpacing: 3, marginBottom: 10 },
  welcomeTitle: { color: '#F5F0F5', fontSize: 27, fontWeight: '600' },
  welcomeSubtitle: { color: '#918B98', fontSize: 13, marginTop: 7 },
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
  messageText: { color: '#F1ECF2', fontSize: 14, lineHeight: 22 },
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
  input: { flex: 1, color: '#F5F0F5', fontSize: 14, maxHeight: 95, paddingVertical: 13 },
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
