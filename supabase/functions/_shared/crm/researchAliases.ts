import { transliterateGreek } from './greekTransliteration.generated.ts';
import { foldForSearch } from '../searchFold.ts';
import { detectScript, transliterateToLatin } from '../transliterate.ts';
import { splitTradeNames } from './identityCheck.ts';

const latinOf = (s: string): string =>
  detectScript(s) === 'cyrillic' ? (transliterateToLatin(s) ?? '') : transliterateGreek(foldForSearch(s));

/** Best key first. ΑΑΔΕ stores a trade name phonetically in Greek (ΦΕΡΝΙΜΠΑΘ) while the business
 *  trades in Latin (furnibath.gr), so only the SEARCH transliteration finds it — formal ELOT gives
 *  "FERNIMPATH". The legal name is never transliterated: ντ→d renders ΑΝΤΩΝΙΟΥ as "adoniou".
 *  One ΑΑΔΕ field can hold several trade names, and each is searched on its own. */
export function researchAliases(name: string, tradeName: string | null): string[] {
  const legal = name.trim();
  const trade = (tradeName ?? '').trim();
  if (!trade || foldForSearch(trade) === foldForSearch(legal)) return legal ? [legal] : [];
  const out: string[] = [];
  const push = (s: string) => { if (s && !out.some((o) => foldForSearch(o) === foldForSearch(s))) out.push(s); };
  for (const piece of splitTradeNames(trade)) {
    if (foldForSearch(piece) === foldForSearch(legal)) continue;
    const latin = latinOf(piece);
    if (foldForSearch(latin) !== foldForSearch(piece)) push(latin);
    push(piece);
  }
  const kept = out.slice(0, 6);
  if (legal && !kept.some((o) => foldForSearch(o) === foldForSearch(legal))) kept.push(legal);
  return kept;
}
