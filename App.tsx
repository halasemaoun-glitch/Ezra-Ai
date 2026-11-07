import React, { useEffect, useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { StatusBar } from 'expo-status-bar';

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

const STORAGE_KEY = 'ezra.chat.messages.v1';

export default function App() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ezra',
      text: 'مرحبًا. أنا إزرا. أنا هنا، احكيلي… شو في بالك اليوم؟',
    },
  ]);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const restore = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) setMessages(JSON.parse(saved) as Message[]);
      } catch {
        Alert.alert('Storage unavailable', 'Could not restore your saved chat.');
      } finally {
        setReady(true);
      }
    };
    restore();
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(messages)).catch(() => {
      Alert.alert('Save failed', 'Your latest messages could not be saved.');
    });
  }, [messages, ready]);

  useSpeechRecognitionEvent('start', () => setIsListening(true));
  useSpeechRecognitionEvent('end', () => setIsListening(false));
  useSpeechRecognitionEvent('result', event => {
    const transcript = event.results[0]?.transcript;
    if (transcript) setMessage(transcript);
  });
  useSpeechRecognitionEvent('error', () => setIsListening(false));

  const sendMessage = () => {
    const text = message.trim();
    if (!text && !attachment) return;

    const nextMessage: Message = {
      id: String(Date.now()),
      sender: 'user',
      text,
      ...(attachment ? { attachment } : {}),
    };
    setMessages(previous => [...previous, nextMessage]);
    setMessage('');
    setAttachment(null);
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
          <View style={styles.privateTag}>
            <Text style={styles.privateText}>PRIVATE</Text>
          </View>
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
          <TouchableOpacity style={styles.quickButton} onPress={() => setMessage('Show my saved chat.')}>
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
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>YOUR CHAT IS SAVED ON THIS DEVICE</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
