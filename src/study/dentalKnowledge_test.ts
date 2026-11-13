import { DENTAL_REFERENCE_LIBRARY } from './studyLibrary.ts';
import { normalizeDentalQuery, retrieveDentalReferences, tokenizeDentalQuery } from './dentalKnowledge.ts';

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
