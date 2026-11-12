import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';

type ClinicalCase = {
  id: string;
  title: string;
  level: string;
  scenario: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  safetyNote: string;
};

const CASES: ClinicalCase[] = [
  {
    id: 'case-pulp-01',
    title: 'ألم يزداد مع البارد',
    level: 'حالة تعليمية · اللب السني',
    scenario: 'يصف شخص ألماً قصيراً عند شرب الماء البارد، يختفي سريعاً بعد إزالة المؤثر. لا توجد معلومات كافية عن الفحص أو التاريخ المرضي.',
    question: 'ما الخطوة التعليمية الأكثر منطقية قبل ترجيح أي تشخيص؟',
    options: ['اعتبارها حالة التهاب لب غير عكوس مباشرة', 'جمع قصة الألم وإجراء فحوص سريرية مناسبة ومقارنة الأسنان', 'بدء علاج عصب فوراً', 'وصف مضاد حيوي'],
    correctIndex: 1,
    explanation: 'مدة الألم ومحفزاته مهمة، لكنها لا تكفي وحدها. يلزم جمع التاريخ المرضي، والفحص، واختبارات الحساسية المقارنة، وربط النتائج ببقية المعطيات.',
    safetyNote: 'لا يمكن تحديد تشخيص أو خطة علاج لشخص حقيقي من وصف مختصر، ولا تُستخدم المضادات الحيوية لمجرد وجود ألم سني.',
  },
  {
    id: 'case-swelling-02',
    title: 'تورم مع صعوبة البلع',
    level: 'حالة تعليمية · علامات الخطر',
    scenario: 'يذكر شخص وجود تورم متزايد في الوجه مع صعوبة في البلع، وربما تغير في الصوت.',
    question: 'ما الأولوية الصحيحة؟',
    options: ['انتظار موعد أسنان روتيني', 'تجربة مسكن ومراقبة يومين', 'طلب رعاية طارئة فوراً بسبب احتمال امتداد عدوى وتهديد مجرى الهواء', 'الضغط على التورم لتفريغه'],
    correctIndex: 2,
    explanation: 'صعوبة البلع أو التنفس، وتغير الصوت، والتورم سريع الانتشار علامات إنذار. الأولوية تقييم طبي طارئ، وليس تأخير الرعاية أو محاولة تصريف التورم منزلياً.',
    safetyNote: 'إذا كانت هذه الأعراض موجودة الآن، اتصل بخدمات الطوارئ المحلية أو توجّه إلى قسم الطوارئ فوراً.',
  },
  {
    id: 'case-gum-03',
    title: 'نزف اللثة عند التفريش',
    level: 'حالة تعليمية · دواعم السن',
    scenario: 'يلاحظ شخص نزفاً متكرراً من اللثة عند تنظيف الأسنان، مع احمرار موضعي. لا تتوفر قياسات الجيوب أو صور شعاعية.',
    question: 'أي معلومة تساعد أكثر في التفريق بين التهاب اللثة والتهاب دواعم السن؟',
    options: ['لون فرشاة الأسنان', 'وجود فقدان ارتباط سريري وفقدان عظم داعم عند التقييم', 'عدد مرات شرب الماء', 'شدة النزف وحدها'],
    correctIndex: 1,
    explanation: 'التفريق يعتمد على تقييم دواعم السن، بما في ذلك مستوى الارتباط السريري والعظم الداعم. النزف وحده لا يثبت وجود Periodontitis.',
    safetyNote: 'النزف المستمر أو التورم أو الألم يستحق فحصاً لدى طبيب الأسنان، ولا يُستعاض عن الفحص بقياس منزلي.',
  },
  {
    id: 'case-xray-04',
    title: 'منطقة داكنة في صورة سنية',
    level: 'حالة تعليمية · الأشعة',
    scenario: 'تظهر منطقة شفافة شعاعياً قرب ذروة جذر في صورة ثنائية الأبعاد، لكن جودة الصورة وتاريخ السن غير معروفين.',
    question: 'ما الاستنتاج الأكثر دقة؟',
    options: ['الصورة وحدها تؤكد خراجاً سنياً', 'يمكن تجاهل الصورة إذا لم يوجد ألم', 'المظهر يحتاج إلى ربطه بالفحص والقصة المرضية وجودة الصورة وقد يلزم تصوير مناسب إضافي', 'كل منطقة داكنة تعني كيساً'],
    correctIndex: 2,
    explanation: 'الشفافية حول الذروة علامة تصويرية وليست تشخيصاً نهائياً بمفردها. يجب تقييم جودة الصورة، والأعراض، واختبارات السن، والسياق السريري.',
    safetyNote: 'قراءة الأشعة السنية مسؤولية سريرية تتطلب صورة مناسبة وسياقاً وفحصاً؛ هذه الحالة للتعلم فقط.',
  },
];

type Props = {
  completedCaseIds: string[];
  onCaseCompleted: (caseId: string) => void;
};

export default function ClinicalCaseSimulator({ completedCaseIds, onCaseCompleted }: Props) {
  const [caseIndex, setCaseIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const currentCase = CASES[caseIndex];
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

  const nextCase = () => chooseCase((caseIndex + 1) % CASES.length);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>محاكاة الحالات السريرية</Text>
      <Text style={styles.helper}>حلّل المعطيات واختر الخطوة التعليمية الأنسب. الحالات افتراضية وليست تشخيصاً لمريض.</Text>
      <View style={styles.casePicker}>
        {CASES.map((item, index) => (
          <TouchableOpacity key={item.id} onPress={() => chooseCase(index)} style={[styles.caseChip, index === caseIndex && styles.caseChipActive]}>
            <Text style={[styles.caseChipText, index === caseIndex && styles.caseChipTextActive]}>{index + 1}. {item.title}</Text>
            {completed.has(item.id) ? <Text style={styles.doneMark}>✓</Text> : null}
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.caseCard}>
        <Text style={styles.level}>{currentCase.level}</Text>
        <Text style={styles.caseTitle}>{currentCase.title}</Text>
        <Text style={styles.scenario}>{currentCase.scenario}</Text>
        <Text style={styles.question}>{currentCase.question}</Text>
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
            <Text style={styles.safety}>{currentCase.safetyNote}</Text>
            <TouchableOpacity onPress={nextCase} style={styles.nextButton}>
              <Text style={styles.nextButtonText}>الحالة التالية</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      <Text style={styles.progress}>أكملت {CASES.filter(item => completed.has(item.id)).length} من {CASES.length} حالات</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 11 },
  heading: { color: '#F5EAF3', fontSize: 15, fontWeight: '800', textAlign: 'right' },
  helper: { color: '#A99BAA', fontSize: 11, lineHeight: 18, textAlign: 'right' },
  casePicker: { gap: 7 },
  caseChip: { minHeight: 42, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#443447', backgroundColor: '#19141F', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  caseChipActive: { backgroundColor: '#46243D', borderColor: '#B75B91' },
  caseChipText: { color: '#C7B8C7', fontSize: 11, textAlign: 'right', flex: 1 },
  caseChipTextActive: { color: '#FFF0FA', fontWeight: '700' },
  doneMark: { color: '#8FD4AE', fontWeight: '900', paddingLeft: 8 },
  caseCard: { backgroundColor: '#19141F', borderRadius: 18, borderWidth: 1, borderColor: '#3B2C40', padding: 15, gap: 10 },
  level: { color: '#D28AB8', fontSize: 10, fontWeight: '800', textAlign: 'right' },
  caseTitle: { color: '#F8ECF5', fontSize: 16, fontWeight: '800', textAlign: 'right' },
  scenario: { color: '#D0C5D0', fontSize: 12, lineHeight: 22, textAlign: 'right' },
  question: { color: '#E9C4DD', fontSize: 12, lineHeight: 21, fontWeight: '800', textAlign: 'right', marginTop: 4 },
  option: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#493A4C', backgroundColor: '#211B27', justifyContent: 'center', paddingHorizontal: 12 },
  correct: { borderColor: '#5FAD86', backgroundColor: '#18382C' },
  incorrect: { borderColor: '#C66C75', backgroundColor: '#3B2028' },
  optionText: { color: '#D5C9D5', fontSize: 11, lineHeight: 18, textAlign: 'right' },
  optionTextActive: { color: '#FFFFFF', fontWeight: '700' },
  feedback: { borderTopWidth: 1, borderTopColor: '#3D3041', paddingTop: 12, gap: 9, marginTop: 4 },
  feedbackTitle: { fontSize: 12, fontWeight: '800', textAlign: 'right' },
  explanation: { color: '#D0C5D0', fontSize: 11, lineHeight: 20, textAlign: 'right' },
  safety: { color: '#E4B5C3', fontSize: 10, lineHeight: 18, textAlign: 'right', backgroundColor: '#2B1C28', padding: 10, borderRadius: 10 },
  nextButton: { minHeight: 44, borderRadius: 13, backgroundColor: '#74365E', alignItems: 'center', justifyContent: 'center' },
  nextButtonText: { color: '#FFF3FA', fontSize: 12, fontWeight: '800' },
  progress: { color: '#B9A7B8', fontSize: 10, textAlign: 'right' },
});
