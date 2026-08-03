import { describe, expect, it } from 'vitest';

import { detectScript, transliterateToLatin } from '../../supabase/functions/_shared/transliterate.ts';

describe('detectScript', () => {
  it('identifies the scripts VIES actually returns', () => {
    expect(detectScript('Виваком България - ЕАД')).toBe('cyrillic');
    expect(detectScript('ΤΡΑΠΕΖΑ ΕΘΝΙΚΗ')).toBe('greek');
    expect(detectScript('ACME Trading Ltd')).toBe('latin');
    expect(detectScript('')).toBe('none');
    expect(detectScript(null)).toBe('none');
  });

  it('prefers the non-Latin script in a mixed string, because that is the part needing conversion', () => {
    expect(detectScript('ЕАД Vivacom')).toBe('cyrillic');
  });
});

describe('transliterateToLatin — Bulgarian (Transliteration Act 2009)', () => {
  it('converts the live VIES responses captured on 2026-08-03', () => {
    // BG831642181
    expect(transliterateToLatin('Виваком България - ЕАД')).toBe('Vivakom Bulgaria - EAD');
    // BG831641791
    expect(transliterateToLatin('ИНФОРМАЦИОННО ОБСЛУЖВАНЕ - АД')).toBe('INFORMATSIONNO OBSLUZHVANE - AD');
    // BG121817309
    expect(transliterateToLatin('ПРОКУРАТУРА НА РЕПУБЛИКА БЪЛГАРИЯ - ГЛАВЕН ПРОКУРОР'))
      .toBe('PROKURATURA NA REPUBLIKA BULGARIA - GLAVEN PROKUROR');
    // BG175074752
    expect(transliterateToLatin('ПРОФИ КРЕДИТ  БЪЛГАРИЯ - ЕООД')).toBe('PROFI KREDIT BULGARIA - EOOD');
  });

  it('applies the multi-character letters', () => {
    expect(transliterateToLatin('жзщчшю')).toBe('zhzshtchshyu');
    expect(transliterateToLatin('Щастие')).toBe('Shtastie');
  });

  it('applies Art. 5 — word-final "ия" renders "ia", not the mechanical "iya"', () => {
    expect(transliterateToLatin('София')).toBe('Sofia');
    expect(transliterateToLatin('Технология')).toBe('Tehnologia');
    // …but only word-finally
    expect(transliterateToLatin('Мияу')).toBe('Miyau');
  });

  it('applies Art. 6 — the country name is "Bulgaria", never "Balgariya"', () => {
    expect(transliterateToLatin('България')).toBe('Bulgaria');
    expect(transliterateToLatin('БЪЛГАРИЯ')).toBe('BULGARIA');
  });

  it('maps ъ to "a" outside the country-name exception', () => {
    expect(transliterateToLatin('Пътя')).toBe('Patya');
  });

  it('keeps casing per word rather than per character', () => {
    // "ж" is two Latin characters — an all-caps word must not yield "ZhIVKOV"
    expect(transliterateToLatin('ЖИВКОВ')).toBe('ZHIVKOV');
    expect(transliterateToLatin('Живков')).toBe('Zhivkov');
    expect(transliterateToLatin('живков')).toBe('zhivkov');
  });

  it('leaves punctuation, digits and Latin fragments alone', () => {
    expect(transliterateToLatin('бул. "Цариградско шосе" №115и, 1784'))
      .toBe('bul. "Tsarigradsko shose" №115i, 1784');
    expect(transliterateToLatin('ЕАД Vivacom')).toBe('EAD Vivacom');
  });
});

describe('transliterateToLatin — Greek (ELOT 743)', () => {
  it('converts the live VIES response captured on 2026-08-03', () => {
    expect(transliterateToLatin('ΤΡΑΠΕΖΑ ΕΘΝΙΚΗ ΤΗΣ ΕΛΛΑΔΟΣ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ'))
      .toBe('TRAPEZA ETHNIKI TIS ELLADOS ANONYMI ETAIREIA');
  });

  it('handles the vowel pairs', () => {
    expect(transliterateToLatin('Λουκάς')).toBe('Loukas');
    expect(transliterateToLatin('παιδί')).toBe('paidi');
    expect(transliterateToLatin('οικία')).toBe('oikia');
  });

  it('voices αυ/ευ before a vowel or voiced consonant, devoices before a voiceless one or word-end', () => {
    expect(transliterateToLatin('αύριο')).toBe('avrio');     // before ρ → v
    expect(transliterateToLatin('ευλογία')).toBe('evlogia'); // before λ → v
    expect(transliterateToLatin('αυτός')).toBe('aftos');     // before τ → f
    expect(transliterateToLatin('ευχή')).toBe('efchi');      // before χ → f
  });

  it('handles the consonant digraphs and word-initial μπ', () => {
    expect(transliterateToLatin('μπύρα')).toBe('byra');      // word-initial μπ → b
    expect(transliterateToLatin('λάμπα')).toBe('lampa');     // medial μπ → mp
    expect(transliterateToLatin('άγγελος')).toBe('angelos'); // γγ → ng
    expect(transliterateToLatin('πάντα')).toBe('panta');     // ντ → nt
  });

  it('renders final sigma the same as medial sigma', () => {
    expect(transliterateToLatin('σοφός')).toBe('sofos');
  });
});

describe('transliterateToLatin — when NOT to store a copy', () => {
  it('returns null for text that is already Latin, so a populated column always means real conversion', () => {
    expect(transliterateToLatin('ACME Trading Ltd')).toBeNull();
    expect(transliterateToLatin('Société Générale')).toBeNull();
  });

  it('returns null for empty input and the VIES "no data" sentinel', () => {
    expect(transliterateToLatin(null)).toBeNull();
    expect(transliterateToLatin(undefined)).toBeNull();
    expect(transliterateToLatin('   ')).toBeNull();
    expect(transliterateToLatin('---')).toBeNull();
  });
});
