export type Folder = { id: string; name: string };

export type FolderMatch = {
  folder: Folder;
  confidence: 1.0 | 0.85 | 0.75;
  method: 'exact' | 'levenshtein' | 'word-set';
};

/**
 * NFD decompose → drop combining marks → uppercase → remove non-alphanumeric →
 * collapse whitespace → trim. Resilient to accents, punctuation, case, and
 * stray whitespace from OCR.
 */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Classic dynamic-programming Levenshtein distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Tries to find the best matching folder for an extracted patient name.
 * Strategy:
 *   1. Exact normalized match → confidence 1.0
 *   2. Levenshtein distance ≤ 3 → confidence 0.85 (typo-tolerant)
 *   3. Word-set inclusion (extracted ⊆ folder or vice-versa) → confidence 0.75
 *   4. Returns null when nothing reasonable matched.
 */
export function matchFolder(extracted: string, folders: Folder[]): FolderMatch | null {
  const ex = normalize(extracted);
  if (!ex) return null;

  // 1. Exact match (preferred).
  for (const f of folders) {
    if (normalize(f.name) === ex) {
      return { folder: f, confidence: 1.0, method: 'exact' };
    }
  }

  // 2. Levenshtein ≤ 3 — best of all candidates.
  // For long names, distance 3 is a typo tolerance, not a "different name".
  let best: { folder: Folder; distance: number } | null = null;
  for (const f of folders) {
    const norm = normalize(f.name);
    // Skip names that differ in length by more than 3 (cheap prefilter).
    if (Math.abs(norm.length - ex.length) > 3) continue;
    const d = levenshtein(ex, norm);
    if (d <= 3 && (best === null || d < best.distance)) {
      best = { folder: f, distance: d };
    }
  }
  if (best) {
    return { folder: best.folder, confidence: 0.85, method: 'levenshtein' };
  }

  // 3. Word-set inclusion. "MARIA SILVA" vs "MARIA DA SILVA":
  //    extracted words ⊆ folder words → match.
  //    Also accept inverse: folder words ⊆ extracted words (extracted has more).
  const exWords = new Set(ex.split(' ').filter(Boolean));
  if (exWords.size < 2) return null; // Single-word matches too risky here.

  for (const f of folders) {
    const fwSet = new Set(normalize(f.name).split(' ').filter(Boolean));
    if (fwSet.size < 2) continue;
    const exSubsetFw = [...exWords].every((w) => fwSet.has(w));
    const fwSubsetEx = [...fwSet].every((w) => exWords.has(w));
    if (exSubsetFw || fwSubsetEx) {
      return { folder: f, confidence: 0.75, method: 'word-set' };
    }
  }

  return null;
}

/**
 * Builds the final file name following the project convention:
 *   Guia_internação_<NOME>.pdf
 *   Descrição_cirúrgica_<NOME>.pdf
 *   Guia_honorários_assinada_<NOME>.pdf
 */
export function buildFileName(
  documentType: 'guia_internacao' | 'descricao_cirurgica' | 'guia_honorarios_assinada',
  patientName: string
): string {
  const prefix =
    documentType === 'guia_internacao' ? 'Guia_internação' :
    documentType === 'descricao_cirurgica' ? 'Descrição_cirúrgica' :
    'Guia_honorários_assinada';
  // Trim and replace any path-hostile characters; keep accents.
  const clean = patientName
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${prefix}_${clean}.pdf`;
}
