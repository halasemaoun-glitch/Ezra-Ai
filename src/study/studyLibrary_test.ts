import { DENTAL_QUIZ, DENTAL_REFERENCE_LIBRARY, DENTAL_STUDY_CARDS } from './studyLibrary.ts';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test('dental reference library contains unique, substantial topics', () => {
  assert(DENTAL_REFERENCE_LIBRARY.length >= 12, 'expected expanded reference library');
  assert(new Set(DENTAL_REFERENCE_LIBRARY.map(item => item.id)).size === DENTAL_REFERENCE_LIBRARY.length, 'reference IDs must be unique');
  for (const reference of DENTAL_REFERENCE_LIBRARY) {
    assert(reference.title.trim().length > 0 && reference.summary.trim().length > 80, 'incomplete reference: ' + reference.id);
    assert(reference.keyPoints.length >= 4, 'reference needs key points: ' + reference.id);
  }
});

Deno.test('evidence-linked topics use valid HTTPS sources', () => {
  const linked = DENTAL_REFERENCE_LIBRARY.filter(item => item.sources?.length);
  assert(linked.length >= 4, 'expected authoritative linked topics');
  for (const reference of linked) {
    for (const source of reference.sources ?? []) {
      assert(source.label.trim().length > 0, 'missing source label: ' + reference.id);
      assert(new URL(source.url).protocol === 'https:', 'source must use HTTPS: ' + reference.id);
    }
  }
});

Deno.test('study cards and quiz questions have unique IDs and valid answers', () => {
  assert(DENTAL_STUDY_CARDS.length >= 16, 'expected expanded flashcard set');
  assert(DENTAL_QUIZ.length >= 12, 'expected expanded quiz');
  assert(new Set(DENTAL_STUDY_CARDS.map(item => item.id)).size === DENTAL_STUDY_CARDS.length, 'flashcard IDs must be unique');
  assert(new Set(DENTAL_QUIZ.map(item => item.id)).size === DENTAL_QUIZ.length, 'quiz IDs must be unique');
  for (const question of DENTAL_QUIZ) {
    assert(question.options.length >= 3, 'question needs options: ' + question.id);
    assert(question.correctIndex >= 0 && question.correctIndex < question.options.length, 'invalid correct answer: ' + question.id);
    assert(question.explanation.trim().length > 0, 'missing explanation: ' + question.id);
  }
});
