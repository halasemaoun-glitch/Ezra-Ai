import { DENTAL_REFERENCE_LIBRARY } from './studyLibrary.ts';
import { DENTAL_CLINICAL_CASES } from './clinicalCases.ts';
import { normalizeDentalQuery, retrieveDentalReferences, retrieveDentalClinicalCases, tokenizeDentalQuery } from './dentalKnowledge.ts';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test('Arabic normalization removes diacritics and normalizes alif', () => {
  assert(normalizeDentalQuery('أَلْتِسَوُّس') === 'التسوس', 'normalization should handle Arabic marks');
  assert(tokenizeDentalQuery('ما هو تسوس الأسنان؟').includes('تسوس'), 'meaningful Arabic token expected');
});

Deno.test('pulp symptoms retrieve relevant endodontic references first', () => {
  const matches = retrieveDentalReferences('التهاب اللب pulpitis وألم العصب', DENTAL_REFERENCE_LIBRARY);
  assert(matches.length > 0, 'expected matches');
  assert(['pulp','pulp-diagnosis'].includes(matches[0].reference.id), 'pulp reference should rank first');
});

Deno.test('English and Arabic caries terms retrieve the same topic', () => {
  const matches = retrieveDentalReferences('caries تسوس', DENTAL_REFERENCE_LIBRARY, { limit: 5 });
  assert(matches.some(match => match.reference.id === 'caries'), 'caries reference should be included');
  assert(matches.length <= 5, 'limit should be respected');
});

Deno.test('generic queries do not retrieve arbitrary references', () => {
  assert(retrieveDentalReferences('ما هو هذا؟', DENTAL_REFERENCE_LIBRARY).length === 0, 'generic query should be empty');
});

Deno.test('trauma retrieval preserves authoritative source links', () => {
  const matches = retrieveDentalReferences('إصابة سنية ورضوض الأسنان', DENTAL_REFERENCE_LIBRARY);
  const trauma = matches.find(match => match.reference.id === 'dental-trauma');
  assert(!!trauma?.reference.sources?.some(source => source.url.startsWith('https://')), 'trauma reference should include HTTPS source');
});

Deno.test('clinical case bank is broad, structured, unique and evidence-linked', () => {
  assert(DENTAL_CLINICAL_CASES.length >= 18, 'expected at least 18 structured clinical cases');
  assert(new Set(DENTAL_CLINICAL_CASES.map(item => item.id)).size === DENTAL_CLINICAL_CASES.length, 'clinical case IDs must be unique');
  for (const item of DENTAL_CLINICAL_CASES) {
    assert(item.presentation.length > 80, 'case presentation is too short: ' + item.id);
    assert(item.historyToCollect.length >= 3, 'missing history checklist: ' + item.id);
    assert(item.clinicalFindings.length >= 3, 'missing clinical findings: ' + item.id);
    assert(item.redFlags.length >= 2, 'missing red flags: ' + item.id);
    assert(item.differentials.length >= 2, 'case needs differential diagnoses: ' + item.id);
    assert(item.investigations.length >= 2, 'case needs investigation guidance: ' + item.id);
    assert(item.management.length >= 2, 'case needs management options: ' + item.id);
    assert(item.complications.length >= 1 && item.followUp.length >= 1, 'case needs complications and follow-up: ' + item.id);
    assert(item.options.length >= 3 && item.correctIndex >= 0 && item.correctIndex < item.options.length, 'invalid case question: ' + item.id);
    assert(item.sources.length > 0 && item.sources.every(source => source.url.startsWith('https://')), 'case must cite HTTPS references: ' + item.id);
  }
});

Deno.test('clinical retrieval ranks matching cases and respects limits', () => {
  const abscess = retrieveDentalClinicalCases('تورم خراج سني وصعوبة بلع', DENTAL_CLINICAL_CASES, { limit: 3 });
  assert(abscess.length > 0, 'expected abscess-related clinical cases');
  assert(abscess[0].clinicalCase.id === 'clinical-deep-space-05' || abscess[0].clinicalCase.id === 'clinical-abscess-local-04', 'urgent abscess case should rank first');
  const trauma = retrieveDentalClinicalCases('انخلاع سن دائم بعد رض trauma avulsion', DENTAL_CLINICAL_CASES, { limit: 2 });
  assert(trauma.length > 0 && trauma[0].clinicalCase.id === 'clinical-avulsion-12', 'avulsion case should rank first');
  assert(retrieveDentalClinicalCases('ما هو هذا؟', DENTAL_CLINICAL_CASES).length === 0, 'generic query must not return arbitrary cases');
  assert(retrieveDentalClinicalCases('periodontitis', DENTAL_CLINICAL_CASES, { limit: 1 }).length <= 1, 'limit must be respected');
});
