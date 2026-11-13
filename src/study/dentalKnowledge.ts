import type { DentalReference } from './studyLibrary.ts';

export type DentalReferenceMatch = { reference: DentalReference; score: number };

const DIACRITICS = /[\u064B-\u065F\u0670\u0640]/g;
const STOP_WORDS = new Set(['the','and','for','with','this','that','from','what','when','where','which','does','have','about','كيف','ماذا','هذا','هذه','على','الى','إلى','من','عن','هل','ما','لماذا','متى','اين','أين','انا','أنا','انت','أنت','هو','هي','كان','كانت','يكون','تكون']);
const SYNONYMS: Record<string, string[]> = {
  'تسوس':['caries','decay','نخر','cavity'], 'نخر':['تسوس','caries','decay'],
  'لثة':['gingiva','gingivitis','periodontitis','دواعم'], 'التهاب':['inflammation','pulpitis','gingivitis','periodontitis'],
  'عصب':['لب','pulp','pulpitis'], 'لب':['pulp','pulpitis','عصب'], 'جذر':['root','apical','ذروي','قناة'],
  'ذروة':['apical','periapical','ذروي'], 'اشعة':['أشعة','radiograph','radiology','xray','x-ray'],
  'أشعة':['اشعة','radiograph','radiology','xray','x-ray'], 'اطفال':['أطفال','pediatric','paediatric','طفل'],
  'أطفال':['اطفال','pediatric','paediatric','طفل'], 'تقويم':['orthodontics','orthodontic'],
  'زراعة':['implant','implantology'], 'خلع':['extraction','avulsion'], 'رض':['trauma','traumatic','injury','إصابة'],
  'الميناء':['enamel'], 'العاج':['dentin','dentine'], 'حساسية':['sensitivity','hypersensitivity'],
  'خراج':['abscess'], 'نزيف':['bleeding','hemorrhage']
};

export function normalizeDentalQuery(value: string): string {
  return value.toLowerCase().normalize('NFKC').replace(DIACRITICS, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').trim();
}

export function tokenizeDentalQuery(value: string): string[] {
  return [...new Set(normalizeDentalQuery(value).split(/\s+/)
    .filter(token => token.length >= 2 && !STOP_WORDS.has(token)))];
}

function countOccurrences(text: string, term: string): number {
  let count = 0, index = -1;
  while ((index = text.indexOf(term, index + 1)) !== -1) count++;
  return count;
}

export function retrieveDentalReferences(
  query: string, references: DentalReference[],
  options: { limit?: number; minScore?: number } = {},
): DentalReferenceMatch[] {
  const limit = Math.max(1, Math.min(10, Math.floor(options.limit ?? 5)));
  const minScore = Math.max(0, options.minScore ?? 1);
  const tokens = tokenizeDentalQuery(query);
  if (!tokens.length) return [];
  const expanded = new Set(tokens);
  for (const token of tokens) for (const synonym of SYNONYMS[token] ?? []) {
    const normalized = normalizeDentalQuery(synonym);
    if (normalized) expanded.add(normalized);
  }
  return references.map(reference => {
    const title = normalizeDentalQuery(reference.title);
    const category = normalizeDentalQuery(reference.category);
    const summary = normalizeDentalQuery(reference.summary);
    const points = normalizeDentalQuery(reference.keyPoints.join(' '));
    const content = [title, category, summary, points].join(' ');
    let score = 0;
    for (const term of expanded) score += countOccurrences(title, term) * 8
      + countOccurrences(category, term) * 5 + countOccurrences(summary, term) * 2
      + countOccurrences(points, term);
    const phrase = normalizeDentalQuery(query);
    if (phrase.length >= 5 && content.includes(phrase)) score += 12;
    return { reference, score };
  }).filter(match => match.score >= minScore)
    .sort((a,b) => b.score-a.score || a.reference.title.localeCompare(b.reference.title))
    .slice(0, limit);
}


import type { DentalClinicalCase } from './clinicalCases.ts';

export type DentalClinicalCaseMatch = { clinicalCase: DentalClinicalCase; score: number };

export function retrieveDentalClinicalCases(
  query: string,
  cases: DentalClinicalCase[],
  options: { limit?: number; minScore?: number } = {},
): DentalClinicalCaseMatch[] {
  const limit = Math.max(1, Math.min(8, Math.floor(options.limit ?? 3)));
  const minScore = Math.max(0, options.minScore ?? 2);
  const tokens = tokenizeDentalQuery(query);
  if (!tokens.length) return [];
  const phrase = normalizeDentalQuery(query);
  return cases.map(clinicalCase => {
    const differentialText = clinicalCase.differentials
      .map(item => [item.diagnosis, ...item.supportingClues, ...item.opposingOrMissingClues].join(' ')).join(' ');
    const content = normalizeDentalQuery([
      clinicalCase.title, clinicalCase.specialty, clinicalCase.presentation,
      ...clinicalCase.historyToCollect, ...clinicalCase.clinicalFindings,
      ...clinicalCase.redFlags, differentialText, ...clinicalCase.investigations,
      ...clinicalCase.management, ...clinicalCase.complications, ...clinicalCase.followUp,
    ].join(' '));
    const title = normalizeDentalQuery(clinicalCase.title);
    let score = 0;
    for (const token of tokens) {
      if (title.includes(token)) score += 7;
      const occurrences = countOccurrences(content, token);
      score += Math.min(occurrences, 5) * 2;
      for (const synonym of SYNONYMS[token] ?? []) {
        const normalized = normalizeDentalQuery(synonym);
        if (normalized && content.includes(normalized)) score += 2;
      }
    }
    if (phrase.length >= 7 && content.includes(phrase)) score += 10;
    return { clinicalCase, score };
  }).filter(match => match.score >= minScore)
    .sort((a, b) => b.score - a.score || a.clinicalCase.title.localeCompare(b.clinicalCase.title))
    .slice(0, limit);
}
