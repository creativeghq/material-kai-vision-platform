import { transliterateGreek } from './greekTransliteration.generated.ts';
import { foldForSearch } from '../searchFold.ts';
import { detectScript, transliterateToLatin } from '../transliterate.ts';

/** Best key first. ΑΑΔΕ stores a trade name phonetically in Greek (ΦΕΡΝΙΜΠΑΘ) while the business
 *  trades in Latin (furnibath.gr), so only the SEARCH transliteration finds it — formal ELOT gives
 *  "FERNIMPATH". The legal name is never transliterated: ντ→d renders ΑΝΤΩΝΙΟΥ as "adoniou". */
export function researchAliases(name: string, tradeName: string | null): string[] {
  const out = name.trim() ? [name.trim()] : [];
  const trade = (tradeName ?? '').trim();
  if (!trade || foldForSearch(trade) === foldForSearch(name)) return out;
  out.unshift(trade);
  const latin = detectScript(trade) === 'cyrillic'
    ? (transliterateToLatin(trade) ?? '')
    : transliterateGreek(foldForSearch(trade));
  if (latin && foldForSearch(latin) !== foldForSearch(trade)) out.unshift(latin);
  return out;
}
