import React, { useMemo, useState } from 'react';
import { Linking, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { DENTAL_CLINICAL_CASES, type DentalClinicalCase } from '../study/clinicalCases';

export { CLINICAL_CASE_COUNT } from '../study/clinicalCases';

type Props = {
  completedCaseIds: string[];
  onCaseCompleted: (caseId: string) => void;
};

function DetailSection({ title, items, warning = false }: { title: string; items: string[]; warning?: boolean }) {
  return (
    <View style={styles.detailSection}>
      <Text style={[styles.sectionTitle, warning && styles.warningTitle]}>{title}</Text>
      {items.map((item, index) => (
        <Text key={index} style={[styles.detailText, warning && styles.warningText]}>• {item}</Text>
      ))}
    </View>
  );
}

function ClinicalCaseDetails({ item }: { item: DentalClinicalCase }) {
  return (
    <View style={styles.details}>
      <DetailSection title="القصة المرضية التي يجب استكمالها" items={item.historyToCollect} />
      <DetailSection title="الفحص والعلامات السريرية" items={item.clinicalFindings} />
      <DetailSection title="علامات الخطر والاستعجال" items={item.redFlags} warning />
      <View style={styles.detailSection}>
        <Text style={styles.sectionTitle}>الاحتمالات التشخيصية التفريقية</Text>
        {item.differentials.map((differential, index) => (
          <View key={index} style={styles.differentialCard}>
            <Text style={styles.differentialTitle}>{index + 1}. {differential.diagnosis}</Text>
            <Text style={styles.miniHeading}>ما يدعم الاحتمال</Text>
            {differential.supportingClues.map((clue, clueIndex) => <Text key={clueIndex} style={styles.detailText}>• {clue}</Text>)}
            <Text style={styles.miniHeading}>ما يعارضه أو ما يزال ناقصاً</Text>
            {differential.opposingOrMissingClues.map((clue, clueIndex) => <Text key={clueIndex} style={styles.detailText}>• {clue}</Text>)}
          </View>
        ))}
      </View>
      <DetailSection title="الفحوص المطلوبة أو التي قد تُبحث" items={item.investigations} />
      <DetailSection title="خيارات التدبير ومبادئ العلاج" items={item.management} />
      <DetailSection title="المضاعفات المحتملة" items={item.complications} warning />
      <DetailSection title="المتابعة وإعادة التقييم" items={item.followUp} />
      <View style={styles.detailSection}>
        <Text style={styles.sectionTitle}>المراجع والإرشادات</Text>
        {item.sources.map((source, index) => (
          <TouchableOpacity key={index} onPress={() => Linking.openURL(source.url)} accessibilityRole="link">
            <Text style={styles.sourceLink}>↗ {source.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function ClinicalCaseSimulator({ completedCaseIds, onCaseCompleted }: Props) {
  const [caseIndex, setCaseIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const currentCase = DENTAL_CLINICAL_CASES[caseIndex];
  const completed = useMemo(() => new Set(completedCaseIds), [completedCaseIds]);
  const isCorrect = selectedAnswer === currentCase.correctIndex;

  const chooseCase = (index: number) => {
    setCaseIndex(index);
    setSelectedAnswer(null);
  };

  const answer = (index: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(index);
    onCaseCompleted(currentCase.id);
  };

  const nextCase = () => chooseCase((caseIndex + 1) % DENTAL_CLINICAL_CASES.length);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>بنك الحالات السريرية</Text>
      <Text style={styles.helper}>حالات تعليمية منظمة للتدرب على تحليل العلامات والتشخيص التفريقي والفحوص والتدبير والمضاعفات. لا تمثل تشخيصاً لمريض حقيقي.</Text>
      <Text style={styles.progress}>أنجزت {DENTAL_CLINICAL_CASES.filter(item => completed.has(item.id)).length} من {DENTAL_CLINICAL_CASES.length} حالة</Text>
      <View style={styles.casePicker}>
        {DENTAL_CLINICAL_CASES.map((item, index) => (
          <TouchableOpacity key={item.id} onPress={() => chooseCase(index)} style={[styles.caseChip, index === caseIndex && styles.caseChipActive]}>
            <Text style={[styles.caseChipText, index === caseIndex && styles.caseChipTextActive]}>{index + 1}. {item.title}</Text>
            {completed.has(item.id) ? <Text style={styles.doneMark}>✓</Text> : null}
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.caseCard}>
        <Text style={styles.level}>{itemLevel(currentCase)}</Text>
        <Text style={styles.caseTitle}>{currentCase.title}</Text>
        <Text style={styles.specialty}>{currentCase.specialty}</Text>
        <Text style={styles.sectionTitle}>عرض الحالة</Text>
        <Text style={styles.scenario}>{currentCase.presentation}</Text>
        <ClinicalCaseDetails item={currentCase} />
        <View style={styles.quizBlock}>
          <Text style={styles.question}>اختبر فهمك: {currentCase.question}</Text>
          {currentCase.options.map((option, index) => {
            const correct = index === currentCase.correctIndex;
            const chosen = selectedAnswer === index;
            return (
              <TouchableOpacity
                key={index}
                disabled={selectedAnswer !== null}
                onPress={() => answer(index)}
                style={[styles.option, chosen && (correct ? styles.correct : styles.incorrect), selectedAnswer !== null && correct && styles.correct]}
                accessibilityRole="button"
                accessibilityState={{ disabled: selectedAnswer !== null, selected: chosen }}
              >
                <Text style={[styles.optionText, (chosen || (selectedAnswer !== null && correct)) && styles.optionTextActive]}>{option}</Text>
              </TouchableOpacity>
            );
          })}
          {selectedAnswer !== null ? (
            <View style={styles.feedback}>
              <Text style={[styles.feedbackTitle, { color: isCorrect ? '#8FD4AE' : '#E7A1B5' }]}>{isCorrect ? 'تحليل صحيح' : 'لنراجع القرار'}</Text>
              <Text style={styles.explanation}>{currentCase.explanation}</Text>
              <TouchableOpacity onPress={nextCase} style={styles.nextButton}>
                <Text style={styles.nextButtonText}>الحالة التالية</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function itemLevel(item: DentalClinicalCase): string {
  return 'حالة تعليمية · ' + item.level;
}

const styles = StyleSheet.create({
  container: { gap: 11 },
  heading: { color: '#F5EAF3', fontSize: 15, fontWeight: '800', textAlign: 'right' },
  helper: { color: '#A99BAA', fontSize: 11, lineHeight: 19, textAlign: 'right' },
  progress: { color: '#B9A7B8', fontSize: 10, textAlign: 'right' },
  casePicker: { gap: 7 },
  caseChip: { minHeight: 42, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#443447', backgroundColor: '#19141F', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  caseChipActive: { backgroundColor: '#46243D', borderColor: '#B75B91' },
  caseChipText: { color: '#C7B8C7', fontSize: 11, textAlign: 'right', flex: 1, lineHeight: 18 },
  caseChipTextActive: { color: '#FFF0FA', fontWeight: '700' },
  doneMark: { color: '#8FD4AE', fontWeight: '900', paddingLeft: 8 },
  caseCard: { backgroundColor: '#19141F', borderRadius: 18, borderWidth: 1, borderColor: '#3B2C40', padding: 15, gap: 10 },
  level: { color: '#D28AB8', fontSize: 10, fontWeight: '800', textAlign: 'right' },
  caseTitle: { color: '#F8ECF5', fontSize: 16, fontWeight: '800', textAlign: 'right' },
  specialty: { color: '#C4A6C0', fontSize: 10, textAlign: 'right' },
  sectionTitle: { color: '#E9C4DD', fontSize: 12, lineHeight: 20, fontWeight: '800', textAlign: 'right', marginTop: 4 },
  scenario: { color: '#D0C5D0', fontSize: 12, lineHeight: 22, textAlign: 'right' },
  details: { gap: 11, borderTopWidth: 1, borderTopColor: '#3D3041', paddingTop: 10 },
  detailSection: { gap: 5 },
  detailText: { color: '#D0C5D0', fontSize: 11, lineHeight: 19, textAlign: 'right' },
  warningTitle: { color: '#F0A7B2' },
  warningText: { color: '#E7B9C1' },
  differentialCard: { backgroundColor: '#211B27', borderWidth: 1, borderColor: '#493A4C', borderRadius: 12, padding: 10, gap: 5, marginTop: 5 },
  differentialTitle: { color: '#F3D9EA', fontSize: 11, fontWeight: '800', textAlign: 'right' },
  miniHeading: { color: '#C58FB2', fontSize: 10, fontWeight: '800', textAlign: 'right', marginTop: 3 },
  sourceLink: { color: '#D69BC3', fontSize: 10, lineHeight: 18, textAlign: 'right', textDecorationLine: 'underline' },
  quizBlock: { borderTopWidth: 1, borderTopColor: '#3D3041', paddingTop: 12, gap: 9, marginTop: 5 },
  question: { color: '#E9C4DD', fontSize: 12, lineHeight: 21, fontWeight: '800', textAlign: 'right' },
  option: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#493A4C', backgroundColor: '#211B27', justifyContent: 'center', paddingHorizontal: 12 },
  correct: { borderColor: '#5FAD86', backgroundColor: '#18382C' },
  incorrect: { borderColor: '#C66C75', backgroundColor: '#3B2028' },
  optionText: { color: '#D5C9D5', fontSize: 11, lineHeight: 18, textAlign: 'right' },
  optionTextActive: { color: '#FFFFFF', fontWeight: '700' },
  feedback: { borderTopWidth: 1, borderTopColor: '#3D3041', paddingTop: 12, gap: 9, marginTop: 4 },
  feedbackTitle: { fontSize: 12, fontWeight: '800', textAlign: 'right' },
  explanation: { color: '#D0C5D0', fontSize: 11, lineHeight: 20, textAlign: 'right' },
  nextButton: { minHeight: 44, borderRadius: 13, backgroundColor: '#74365E', alignItems: 'center', justifyContent: 'center' },
  nextButtonText: { color: '#FFF3FA', fontSize: 12, fontWeight: '800' },
});
