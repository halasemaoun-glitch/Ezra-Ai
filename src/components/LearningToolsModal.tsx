import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import {
  EMPTY_STUDY_PROGRESS,
  mergeStudyProgressSnapshots,
  normalizeStudySnapshot,
  studyProgressFromCloudRow,
  studyProgressToCloudRow,
  type StudyProgress,
} from '../study/studyProgressSync';
import ClinicalCaseSimulator, { CLINICAL_CASE_COUNT } from './ClinicalCaseSimulator';
import {
  Alert,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  DENTAL_QUIZ,
  DENTAL_REFERENCE_LIBRARY,
  DENTAL_STUDY_CARDS,
} from '../study/studyLibrary';
import type { AssistantMode } from '../modes/assistantModes';

type ToolTab = 'library' | 'cards' | 'quiz' | 'cases';

const STUDY_PROGRESS_KEY = 'ezra:studyProgress:v1';

type Props = {
  visible: boolean;
  mode: AssistantMode;
  onClose: () => void;
  onAskEzra: (prompt: string) => void;
  userId: string | null;
};

export default function LearningToolsModal({ visible, mode, onClose, onAskEzra, userId }: Props) {
  const [tab, setTab] = useState<ToolTab>('library');
  const [topicId, setTopicId] = useState(DENTAL_REFERENCE_LIBRARY[0].id);
  const [cardIndex, setCardIndex] = useState(0);
  const [cardRevealed, setCardRevealed] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [progress, setProgress] = useState<StudyProgress>(EMPTY_STUDY_PROGRESS);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<'loading' | 'synced' | 'error' | 'local'>('loading');

  useEffect(() => {
    let active = true;
    setLoadedForUserId(null);
    if (!userId) {
      setProgress(EMPTY_STUDY_PROGRESS);
      setProgressLoaded(false);
      setSyncState('local');
      return () => { active = false; };
    }
    setProgressLoaded(false);
    setProgress(EMPTY_STUDY_PROGRESS);
    setSyncState('loading');
    (async () => {
      const storageKey = `${STUDY_PROGRESS_KEY}:${userId}`;
      const scopedRaw = await AsyncStorage.getItem(storageKey);
      let localSnapshot = scopedRaw
        ? normalizeStudySnapshot(JSON.parse(scopedRaw))
        : normalizeStudySnapshot(EMPTY_STUDY_PROGRESS);

      if (!scopedRaw) {
        const legacyRaw = await AsyncStorage.getItem(STUDY_PROGRESS_KEY);
        if (legacyRaw) {
          localSnapshot = normalizeStudySnapshot(JSON.parse(legacyRaw));
          await AsyncStorage.removeItem(STUDY_PROGRESS_KEY);
        }
      }

      const { data, error } = await supabase
        .from('study_progress')
        .select('progress, updated_at')
        .eq('owner_id', userId)
        .maybeSingle();

      if (!active) return;
      if (error) {
        setProgress(localSnapshot.progress);
        await AsyncStorage.setItem(storageKey, JSON.stringify(localSnapshot));
        setLoadedForUserId(userId);
        setProgressLoaded(true);
        setSyncState('error');
        return;
      }

      const cloudSnapshot = data
        ? studyProgressFromCloudRow({ owner_id: userId, progress: data.progress, updated_at: data.updated_at })
        : null;
      const merged = mergeStudyProgressSnapshots(localSnapshot, cloudSnapshot);
      setProgress(merged.progress);
      await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
      setLoadedForUserId(userId);
      setProgressLoaded(true);
      setSyncState('synced');
    })().catch(async () => {
      if (!active) return;
      setSyncState('error');
      setProgressLoaded(true);
    });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!progressLoaded || !userId || loadedForUserId !== userId) return;
    const snapshot = { progress, updatedAt: new Date().toISOString() };
    const storageKey = `${STUDY_PROGRESS_KEY}:${userId}`;
    AsyncStorage.setItem(storageKey, JSON.stringify(snapshot)).catch(() => undefined);
    void (async () => {
      try {
        const { error } = await supabase.from('study_progress')
          .upsert(studyProgressToCloudRow(snapshot, userId), { onConflict: 'owner_id' });
        setSyncState(error ? 'error' : 'synced');
      } catch {
        setSyncState('error');
      }
    })();
  }, [progress, progressLoaded, userId, loadedForUserId]);

  const saveProgress = (patch: Partial<StudyProgress>) => {
    setProgress(previous => ({ ...previous, ...patch }));
  };

  const retrySync = () => {
    if (!userId) return;
    const snapshot = { progress, updatedAt: new Date().toISOString() };
    setSyncState('loading');
    AsyncStorage.setItem(`${STUDY_PROGRESS_KEY}:${userId}`, JSON.stringify(snapshot)).catch(() => undefined);
    void (async () => {
      try {
        const { error } = await supabase.from('study_progress')
          .upsert(studyProgressToCloudRow(snapshot, userId), { onConflict: 'owner_id' });
        setSyncState(error ? 'error' : 'synced');
      } catch {
        setSyncState('error');
      }
    })();
  };

  const selectedTopic = useMemo(
    () => DENTAL_REFERENCE_LIBRARY.find(item => item.id === topicId) ?? DENTAL_REFERENCE_LIBRARY[0],
    [topicId],
  );
  const currentCard = DENTAL_STUDY_CARDS[cardIndex];
  const currentQuestion = DENTAL_QUIZ[questionIndex];

  useEffect(() => {
    if (!visible) return;
    setTab(mode === 'study' ? 'cards' : 'library');
  }, [visible, mode]);

  const chooseTab = (next: ToolTab) => {
    setTab(next);
    if (next === 'quiz') {
      setQuestionIndex(0);
      setSelectedAnswer(null);
      setScore(0);
      setAnsweredCount(0);
      setQuizFinished(false);
    }
  };

  const answerQuestion = (index: number) => {
    if (selectedAnswer !== null || quizFinished) return;
    setSelectedAnswer(index);
    setAnsweredCount(previous => previous + 1);
    if (index === currentQuestion.correctIndex) setScore(previous => previous + 1);
  };

  const nextQuestion = () => {
    if (questionIndex >= DENTAL_QUIZ.length - 1) {
      setQuizFinished(true);
      saveProgress({ quizAttempts: progress.quizAttempts + 1, lastQuizScore: score, bestQuizScore: Math.max(progress.bestQuizScore, score) });
      return;
    }
    setQuestionIndex(previous => previous + 1);
    setSelectedAnswer(null);
  };

  const restartQuiz = () => {
    setQuestionIndex(0);
    setSelectedAnswer(null);
    setScore(0);
    setAnsweredCount(0);
    setQuizFinished(false);
  };

  const askAboutTopic = () => {
    onAskEzra(`اشرح لي موضوع «${selectedTopic.title}» شرحاً منظماً، مع أمثلة سريرية تعليمية وأسئلة مراجعة. وضّح حدود المعلومات وما يحتاج إلى مرجع دراسي أو تقييم سريري.`);
  };

  const askForCustomCards = () => {
    onAskEzra('حوّل موضوعنا الحالي أو الدرس الذي أرسله إلى 10 بطاقات مراجعة. اكتب السؤال في جهة والإجابة المختصرة في الجهة الأخرى، وركّز على الفهم والمصطلحات المهمة.');
  };

  const askForCustomQuiz = () => {
    onAskEzra('اختبرني في موضوعنا الحالي باختبار تفاعلي من 5 أسئلة اختيار من متعدد. اطرح سؤالاً واحداً في كل مرة، وانتظر إجابتي قبل كشف الحل، ثم اشرح سبب الإجابة الصحيحة.');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.panel}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>مركز التعلّم EZRA</Text>
                <Text style={styles.subtitle}>مكتبة سنية وبطاقات واختبارات للمراجعة</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="إغلاق مركز التعلم">
                <Text style={styles.closeText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tabs}>
              {([
                ['library', 'مكتبة الأسنان'],
                ['cards', 'بطاقات المراجعة'],
                ['quiz', 'اختبر نفسك'],
                ['cases', 'حالات سريرية'],
              ] as [ToolTab, string][]).map(([value, label]) => (
                <TouchableOpacity key={value} onPress={() => chooseTab(value)} style={[styles.tab, tab === value && styles.tabActive]} accessibilityRole="button" accessibilityState={{ selected: tab === value }}>
                  <Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
              <View style={styles.studyProgressCard}>
                <Text style={styles.studyProgressTitle}>تقدّمك المحفوظ</Text>
                <View style={styles.progressSyncRow}>
                  <Text style={styles.studyProgressText}>{syncState === 'loading' ? 'جارٍ مزامنة تقدّمك…' : syncState === 'synced' ? 'متزامن مع حسابك' : syncState === 'error' ? 'تعذّرت المزامنة؛ تقدّمك محفوظ محلياً' : 'سجّل الدخول لمزامنة تقدّمك'}</Text>
                  {syncState === 'error' ? <TouchableOpacity onPress={retrySync} accessibilityRole="button"><Text style={styles.retrySyncText}>إعادة المحاولة</Text></TouchableOpacity> : null}
                </View>
                <Text style={styles.studyProgressText}>بطاقات راجعتها: {progress.reviewedCardIds.length}/{DENTAL_STUDY_CARDS.length}  ·  حالات أكملتها: {progress.completedCaseIds.length}/{CLINICAL_CASE_COUNT}</Text>
                <Text style={styles.studyProgressText}>محاولات الاختبار: {progress.quizAttempts}  ·  أفضل نتيجة: {progress.bestQuizScore}/{DENTAL_QUIZ.length}</Text>
              </View>
              {tab === 'library' ? (
                <>
                  <Text style={styles.sectionTitle}>مراجع أساسية مختصرة</Text>
                  <Text style={styles.helper}>اختر موضوعاً لعرض ملخصه ونقاطه الأساسية.</Text>
                  <View style={styles.topicList}>
                    {DENTAL_REFERENCE_LIBRARY.map(item => (
                      <TouchableOpacity key={item.id} onPress={() => setTopicId(item.id)} style={[styles.topicChip, topicId === item.id && styles.topicChipActive]} accessibilityRole="button" accessibilityState={{ selected: topicId === item.id }}>
                        <Text style={[styles.topicChipText, topicId === item.id && styles.topicChipTextActive]}>{item.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.referenceCard}>
                    <Text style={styles.category}>{selectedTopic.category}</Text>
                    <Text style={styles.referenceTitle}>{selectedTopic.title}</Text>
                    <Text style={styles.body}>{selectedTopic.summary}</Text>
                    <Text style={styles.keyPointsTitle}>النقاط الأساسية</Text>
                    {selectedTopic.keyPoints.map((point, index) => (
                      <View key={index} style={styles.bulletRow}>
                        <Text style={styles.bullet}>•</Text>
                        <Text style={styles.bulletText}>{point}</Text>
                      </View>
                    ))}
                    {selectedTopic.caution ? <Text style={styles.safety}>{selectedTopic.caution}</Text> : null}
                    {selectedTopic.sources?.length ? (
                      <View style={{ gap: 7, marginTop: 5 }}>
                        <Text style={styles.keyPointsTitle}>مراجع علمية موثوقة</Text>
                        {selectedTopic.sources.map(source => (
                          <TouchableOpacity key={source.url} onPress={() => { void Linking.openURL(source.url).catch(() => Alert.alert('تعذّر فتح المرجع', 'تحقق من اتصال الإنترنت ثم حاول مجدداً.')); }} accessibilityRole="link" accessibilityLabel={source.label} style={{ paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#211923', borderWidth: 1, borderColor: '#493747' }}>
                            <Text style={{ color: '#E7B3D5', fontSize: 11, lineHeight: 17, textAlign: 'right' }}>{source.label} ↗</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                    <TouchableOpacity style={styles.askButton} onPress={askAboutTopic} accessibilityRole="button">
                      <Text style={styles.askButtonText}>ناقش هذا الموضوع مع EZRA</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : tab === 'cards' ? (
                <>
                  <Text style={styles.sectionTitle}>بطاقات التعلّم</Text>
                  <Text style={styles.helper}>حاول الإجابة قبل كشف الوجه الخلفي للبطاقة.</Text>
                  <View style={styles.progressRow}>
                    <Text style={styles.progressText}>البطاقة {cardIndex + 1} من {DENTAL_STUDY_CARDS.length}</Text>
                    <Text style={styles.progressText}>{currentCard.topic}</Text>
                  </View>
                  <TouchableOpacity style={styles.flashcard} onPress={() => { const reveal = !cardRevealed; setCardRevealed(reveal); if (reveal && !progress.reviewedCardIds.includes(currentCard.id)) saveProgress({ reviewedCardIds: [...progress.reviewedCardIds, currentCard.id] }); }} accessibilityRole="button" accessibilityLabel={cardRevealed ? 'إخفاء الإجابة' : 'كشف الإجابة'}>
                    <Text style={styles.cardEyebrow}>{cardRevealed ? 'الإجابة' : 'السؤال'}</Text>
                    <Text style={styles.flashcardText}>{cardRevealed ? currentCard.answer : currentCard.question}</Text>
                    <Text style={styles.tapHint}>{cardRevealed ? 'اضغط لإظهار السؤال' : 'اضغط لكشف الإجابة'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.askButton} onPress={askForCustomCards} accessibilityRole="button">
                    <Text style={styles.askButtonText}>أنشئ بطاقات من درسي الحالي</Text>
                  </TouchableOpacity>
                  <View style={styles.actionsRow}>
                    <TouchableOpacity style={styles.secondaryButton} onPress={() => { setCardIndex(previous => (previous - 1 + DENTAL_STUDY_CARDS.length) % DENTAL_STUDY_CARDS.length); setCardRevealed(false); }}>
                      <Text style={styles.secondaryButtonText}>السابق</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.primaryButton} onPress={() => { setCardIndex(previous => (previous + 1) % DENTAL_STUDY_CARDS.length); setCardRevealed(false); }}>
                      <Text style={styles.primaryButtonText}>البطاقة التالية</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : tab === 'quiz' ? (
                <>
                  <Text style={styles.sectionTitle}>اختبار المعرفة السنية</Text>
                  <TouchableOpacity style={styles.askButton} onPress={askForCustomQuiz} accessibilityRole="button">
                    <Text style={styles.askButtonText}>اختبار تفاعلي من موضوع محادثتي</Text>
                  </TouchableOpacity>
                  {quizFinished ? (
                    <View style={styles.resultCard}>
                      <Text style={styles.resultTitle}>انتهى الاختبار</Text>
                      <Text style={styles.resultScore}>{score} / {DENTAL_QUIZ.length}</Text>
                      <Text style={styles.body}>أجبت عن {answeredCount} أسئلة. راجع التفسيرات ثم أعد المحاولة لتثبيت المعلومات.</Text>
                      <TouchableOpacity style={styles.primaryButton} onPress={restartQuiz}>
                        <Text style={styles.primaryButtonText}>إعادة الاختبار</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <View style={styles.progressRow}>
                        <Text style={styles.progressText}>السؤال {questionIndex + 1} من {DENTAL_QUIZ.length}</Text>
                        <Text style={styles.progressText}>النقاط: {score}</Text>
                      </View>
                      <View style={styles.questionCard}>
                        <Text style={styles.questionText}>{currentQuestion.prompt}</Text>
                        {currentQuestion.options.map((option, index) => {
                          const isCorrect = index === currentQuestion.correctIndex;
                          const isSelected = selectedAnswer === index;
                          return (
                            <TouchableOpacity
                              key={index}
                              disabled={selectedAnswer !== null}
                              onPress={() => answerQuestion(index)}
                              style={[styles.answerOption, isSelected && (isCorrect ? styles.answerCorrect : styles.answerWrong), selectedAnswer !== null && isCorrect && styles.answerCorrect]}
                              accessibilityRole="button"
                              accessibilityState={{ selected: isSelected, disabled: selectedAnswer !== null }}
                            >
                              <Text style={[styles.answerText, (isSelected || (selectedAnswer !== null && isCorrect)) && styles.answerTextActive]}>{option}</Text>
                            </TouchableOpacity>
                          );
                        })}
                        {selectedAnswer !== null ? (
                          <View style={styles.explanationBox}>
                            <Text style={styles.explanationTitle}>{selectedAnswer === currentQuestion.correctIndex ? 'إجابة صحيحة' : 'راجع هذه النقطة'}</Text>
                            <Text style={styles.body}>{currentQuestion.explanation}</Text>
                            <TouchableOpacity style={styles.primaryButton} onPress={nextQuestion}>
                              <Text style={styles.primaryButtonText}>{questionIndex === DENTAL_QUIZ.length - 1 ? 'عرض النتيجة' : 'السؤال التالي'}</Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    </>
                  )}
                </>
              ) : (
                <ClinicalCaseSimulator completedCaseIds={progress.completedCaseIds} onCaseCompleted={caseId => { if (!progress.completedCaseIds.includes(caseId)) saveProgress({ completedCaseIds: [...progress.completedCaseIds, caseId] }); }} />
              )}
              <Text style={styles.disclaimer}>محتوى تعليمي تأسيسي للمراجعة، وليس بديلاً عن المراجع الأكاديمية المعتمدة أو الإرشادات السريرية المحلية أو التقييم السريري.</Text>
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5, 4, 9, 0.82)', justifyContent: 'flex-end' },
  safe: { flex: 1, justifyContent: 'flex-end' },
  panel: { maxHeight: '94%', minHeight: '78%', backgroundColor: '#100D15', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: '#493044', overflow: 'hidden' },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#302433' },
  headerText: { flex: 1, alignItems: 'flex-end', gap: 4 },
  title: { color: '#F6EDF5', fontSize: 17, fontWeight: '800' },
  subtitle: { color: '#A99BAA', fontSize: 10, textAlign: 'right' },
  closeButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#251B2A', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  closeText: { color: '#F1D7EA', fontSize: 27, lineHeight: 30 },
  tabs: { flexDirection: 'row-reverse', padding: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: '#302433' },
  tab: { flex: 1, minHeight: 42, paddingHorizontal: 4, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1520' },
  tabActive: { backgroundColor: '#532642', borderWidth: 1, borderColor: '#B75B91' },
  tabText: { color: '#B9ABB9', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  tabTextActive: { color: '#FFF0FA' },
  content: { flex: 1 },
  studyProgressCard: { backgroundColor: '#211629', borderRadius: 14, borderWidth: 1, borderColor: '#5A3B55', padding: 12, gap: 5 },
  studyProgressTitle: { color: '#F0C5DF', fontSize: 11, fontWeight: '800', textAlign: 'right' },
  studyProgressText: { color: '#C7B8C7', fontSize: 10, textAlign: 'right' },
  progressSyncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  retrySyncText: { color: '#E8A6CE', fontSize: 10, fontWeight: '800' },
  contentInner: { padding: 16, gap: 12, paddingBottom: 28 },
  sectionTitle: { color: '#F5EAF3', fontSize: 15, fontWeight: '800', textAlign: 'right' },
  helper: { color: '#A99BAA', fontSize: 11, lineHeight: 17, textAlign: 'right' },
  topicList: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 7 },
  topicChip: { borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, borderWidth: 1, borderColor: '#443447', backgroundColor: '#19141F' },
  topicChipActive: { backgroundColor: '#46243D', borderColor: '#B75B91' },
  topicChipText: { color: '#C7B8C7', fontSize: 10, textAlign: 'right' },
  topicChipTextActive: { color: '#FFF0FA', fontWeight: '700' },
  referenceCard: { backgroundColor: '#19141F', borderRadius: 18, borderWidth: 1, borderColor: '#3B2C40', padding: 15, gap: 10 },
  category: { color: '#D28AB8', fontSize: 10, fontWeight: '800', textAlign: 'right' },
  referenceTitle: { color: '#F8ECF5', fontSize: 16, fontWeight: '800', textAlign: 'right' },
  body: { color: '#D0C5D0', fontSize: 12, lineHeight: 21, textAlign: 'right' },
  keyPointsTitle: { color: '#E9C4DD', fontSize: 12, fontWeight: '800', textAlign: 'right', marginTop: 3 },
  bulletRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8 },
  bullet: { color: '#D88ABC', fontSize: 15, lineHeight: 20 },
  bulletText: { flex: 1, color: '#CFC2CE', fontSize: 11, lineHeight: 19, textAlign: 'right' },
  askButton: { minHeight: 46, borderRadius: 14, backgroundColor: '#532642', borderWidth: 1, borderColor: '#B75B91', alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  askButtonText: { color: '#FFF0FA', fontSize: 12, fontWeight: '800' },
  progressRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { color: '#C7B4C7', fontSize: 10, fontWeight: '700' },
  flashcard: { minHeight: 230, borderRadius: 22, backgroundColor: '#211629', borderWidth: 1, borderColor: '#865078', padding: 22, alignItems: 'center', justifyContent: 'center', gap: 18 },
  cardEyebrow: { color: '#D88ABC', fontSize: 11, fontWeight: '800' },
  flashcardText: { color: '#FFF0FA', fontSize: 17, lineHeight: 29, fontWeight: '700', textAlign: 'center' },
  tapHint: { color: '#A99BAA', fontSize: 10 },
  actionsRow: { flexDirection: 'row-reverse', gap: 10 },
  secondaryButton: { flex: 1, minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: '#59445D', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#D9C7D7', fontSize: 12, fontWeight: '700' },
  primaryButton: { flex: 1, minHeight: 46, borderRadius: 13, backgroundColor: '#74365E', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginTop: 4 },
  primaryButtonText: { color: '#FFF3FA', fontSize: 12, fontWeight: '800' },
  questionCard: { backgroundColor: '#19141F', borderRadius: 18, borderWidth: 1, borderColor: '#3B2C40', padding: 15, gap: 10 },
  questionText: { color: '#F8ECF5', fontSize: 15, lineHeight: 24, fontWeight: '800', textAlign: 'right', marginBottom: 4 },
  answerOption: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#493A4C', backgroundColor: '#211B27', justifyContent: 'center', paddingHorizontal: 12 },
  answerCorrect: { borderColor: '#5FAD86', backgroundColor: '#18382C' },
  answerWrong: { borderColor: '#C66C75', backgroundColor: '#3B2028' },
  answerText: { color: '#D5C9D5', fontSize: 11, textAlign: 'right' },
  answerTextActive: { color: '#FFFFFF', fontWeight: '700' },
  explanationBox: { borderTopWidth: 1, borderTopColor: '#3D3041', paddingTop: 12, gap: 8, marginTop: 4 },
  explanationTitle: { color: '#E9C4DD', fontSize: 12, fontWeight: '800', textAlign: 'right' },
  resultCard: { borderRadius: 18, backgroundColor: '#211629', borderWidth: 1, borderColor: '#865078', padding: 20, gap: 12, alignItems: 'center' },
  resultTitle: { color: '#F8ECF5', fontSize: 17, fontWeight: '800' },
  resultScore: { color: '#F0B5D7', fontSize: 34, fontWeight: '900' },
  disclaimer: { color: '#938895', fontSize: 9, lineHeight: 15, textAlign: 'right', marginTop: 4 },
});
