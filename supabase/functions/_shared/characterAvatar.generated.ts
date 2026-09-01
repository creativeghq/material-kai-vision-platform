// GENERATED MIRROR of src/utils/characterAvatar.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * The character avatar shown for a contact whose photo we cannot get.
 *
 * WhatsApp gives a business no customer profile picture — measured 2026-08-25 across every
 * endpoint that declares the field: `participantPicture` null on all 100 conversations,
 * `avatarUrl` absent from all 516 contact records. So this is not a placeholder waiting for a
 * real photo. It is the avatar, permanently.
 *
 * ── A cast, not a render per person ──
 * The characters are generated ONCE by `messaging-api generate-avatar-cast` (Gemini, 3D cartoon
 * style) into `generation-images/avatars/cast/NNN.png`, and each contact is assigned one by a
 * hash of their id. 516 contacts would otherwise be 516 generations to bill, wait for and store,
 * and the style would drift between calls. This way the cost is a few dollars once, assignment is
 * instant, and a contact keeps the same face forever.
 *
 * A hand-drawn SVG version was tried first and thrown away: flat vector shapes cannot reach the
 * soft-shaded 3D look this is for, and it read as a different product entirely.
 *
 * ── WHICH person, from the id. WHICH HALF of the cast, from the name. ──
 * The slot is still hashed off the contact's stable id, so the character is ASSIGNED rather than
 * inferred — a name is edited and re-capitalised, and hashing on it would hand people a new face
 * every time their record is tidied up.
 *
 * The hash alone, though, is a coin flip on a set that is half women and half men, and it loses
 * that flip half the time in front of the operator: `Desislava Slavova` — a name whose every
 * token is grammatically feminine — was drawn as a bearded man in glasses, beside her own
 * messages, for as long as the thread existed. "We do not guess" was the intent; a 50/50 guess
 * was the behaviour, just an unstated one.
 *
 * So the name narrows the POOL and the id still picks within it. `nameGender` answers only where
 * the answer is in the grammar of the name (a Slavic `-ova`, a Greek final `ς`, an honorific) or
 * in a curated given-name list, and returns null for everything else — a null pool is the whole
 * cast, i.e. exactly the old behaviour. It is never asked about ethnicity, which carries no such
 * signal and has no business being inferred.
 *
 * ── One person, one face: the verdict is derived ONCE, server-side ──
 * The inbox draws a counterparty in five places off four different name strings (`thread.subject`
 * in the list and the header, the WhatsApp profile name in the drawer, the CRM contact name in
 * the rail and on every message row). A pool resolved per screen would therefore give one person
 * two faces the moment those strings disagreed — the exact bug this module already carries a
 * regression test for, one input over. `inbox-api` resolves the slot from the participant row and
 * ships it as `counterparty_avatar_slot` / `avatar_slot`; the client renders the number it is
 * given, and only hashes a seed itself when the server sent none.
 */

/* ────────────────────────────── The cast ────────────────────────────── */

export type CastGender = 'female' | 'male';

export interface CastCharacter {
  /**
   * Which half of the cast this character belongs to. Read by `castSlotFor` to narrow the pool;
   * it describes the RENDERED PICTURE, and is not a claim about anybody assigned to it.
   */
  readonly gender: CastGender;
  /** The variation appended to the base prompt by `generate-avatar-cast`. */
  readonly look: string;
}

/**
 * The 24 rendered characters, in slot order — `avatars/cast/000.png` is `CAST[0]`.
 *
 * ONE roster: `generate-avatar-cast` builds its prompts from `look`, and the picker reads
 * `gender` off the same row. A hand-kept second list would let the generator render slot 7 as a
 * woman while the picker went on handing slot 7 to men, and every face would still be a 200.
 *
 * Diversity is spread across the cast deliberately — it is a set of characters, and a set that is
 * all one age or one hair length just looks broken. Nothing here is derived from a real contact.
 *
 * DO NOT REORDER OR REWORD an entry: the PNGs are already rendered against these strings, so
 * editing one silently makes the stored picture disagree with the roster describing it. Add to
 * the end and re-run `generate-avatar-cast` with `startIndex` at the old length.
 */
export const CAST: readonly CastCharacter[] = [
  { gender: 'female', look: 'young woman, long dark wavy hair, warm brown skin, small gold earrings' },
  { gender: 'male', look: 'older man, short grey hair, neat grey beard, glasses with dark rectangular frames, light skin' },
  { gender: 'male', look: 'young man, short black textured hair, deep brown skin, wide friendly smile' },
  { gender: 'female', look: 'woman in her thirties, blonde shoulder-length bob, fair skin, light freckles' },
  { gender: 'male', look: 'man in his forties, brown hair swept to one side, olive skin, clean shaven' },
  { gender: 'female', look: 'young woman, black hair in a high bun, East Asian features, round thin-rimmed glasses' },
  { gender: 'male', look: 'man with a shaved head, dark brown skin, short full beard, broad smile' },
  { gender: 'female', look: 'woman with curly auburn hair, pale skin, green eyes, small silver nose stud' },
  { gender: 'female', look: 'older woman, silver hair in a short crop, light skin, warm smile, pearl earrings' },
  { gender: 'male', look: 'young man, red hair, freckled fair skin, big grin, no facial hair' },
  { gender: 'female', look: 'woman wearing a deep purple headscarf, brown skin, dark eyes, subtle smile' },
  { gender: 'male', look: 'man with long black hair tied back, tan skin, thin moustache' },
  { gender: 'female', look: 'young woman, straight black hair with a blunt fringe, light tan skin, red lipstick' },
  { gender: 'male', look: 'man in his fifties, receding light brown hair, ruddy skin, thick eyebrows' },
  { gender: 'female', look: 'woman with tightly coiled black hair worn full, dark skin, round tortoiseshell glasses' },
  { gender: 'male', look: 'young man, dark blonde undercut, fair skin, small stud earring' },
  { gender: 'female', look: 'woman with straight brown hair past the shoulders, medium skin, hazel eyes' },
  { gender: 'male', look: 'man with a turban, dark full beard, brown skin, calm expression' },
  { gender: 'female', look: 'young woman, pink-dyed short hair, pale skin, cat-eye glasses' },
  { gender: 'male', look: 'older man, bald on top with grey at the sides, light skin, moustache' },
  { gender: 'female', look: 'woman with box braids gathered back, deep brown skin, bright smile' },
  { gender: 'male', look: 'man with wavy dark hair, Mediterranean skin, light stubble' },
  { gender: 'female', look: 'young woman, ash-brown ponytail, fair skin, dimples' },
  { gender: 'male', look: 'man with short salt-and-pepper hair, medium skin, rectangular glasses' },
];

/**
 * How many characters exist in the cast.
 *
 * Must match what `generate-avatar-cast` has actually rendered. Set too high, some contacts point
 * at a 404 — an avatar that silently fails to load, which is the exact state this feature exists
 * to end.
 */
export const CAST_SIZE = CAST.length;

/** The slots belonging to one half of the cast, in slot order. */
export function castPool(gender: CastGender): number[] {
  const pool: number[] = [];
  for (let i = 0; i < CAST.length; i++) if (CAST[i].gender === gender) pool.push(i);
  return pool;
}

/* ────────────────────── Reading a gender off a name ────────────────────── */

/**
 * Lower-cased, accent-stripped word tokens.
 *
 * Diacritics go because the same person arrives as `Ελένη` from WhatsApp and `ΕΛΕΝΗ` from a CRM
 * import. Greek keeps its script, because the Greek rules below are about Greek letters. Case is
 * folded BEFORE splitting so a trailing capital sigma folds to the final form `ς`, which is the
 * single most useful letter in this whole module.
 */
function tokenize(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((t) => t.length >= 2);
}

/** An explicit form of address settles it outright — nothing below gets a say. */
const HONORIFICS: Record<string, CastGender> = {
  mr: 'male', mister: 'male', sir: 'male', herr: 'male', signor: 'male', senor: 'male',
  monsieur: 'male', κος: 'male', κυριος: 'male',
  mrs: 'female', ms: 'female', miss: 'female', madam: 'female', madame: 'female', mme: 'female',
  frau: 'female', signora: 'female', senora: 'female', sra: 'female', κα: 'female', κυρια: 'female',
};

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

/**
 * Given names the morphology below cannot reach — chiefly English, Germanic and Romance, which
 * carry no grammatical gender in the name itself.
 *
 * Deliberately a curated list rather than a dependency: the packaged ones are trained on US
 * census data and answer confidently and wrongly for Greek and Bulgarian, which is most of this
 * inbox. Short and extendable beats broad and wrong here.
 */
const FEMALE_GIVEN = words(`
  maria mary marie marion miriam elizabeth elisabeth beth kate katie katherine catherine kathryn
  christine christina kristina helen ellen eleanor rachel rebecca sarah hannah abigail jessica
  jennifer nicole michelle danielle charlotte caroline claire clare louise lucy ellie emily megan
  meghan alison heather holly joyce judith karen sharon susan suzanne yvonne simone ingrid astrid
  heidi birgit kerstin ines iris esther naomi ruth rose jade faith grace hope june lauren
  brooke paige sydney sloane
  ελενη ελεωνορα αικατερινη κατερινα σοφια αννα ιωαννα γεωργια δεσποινα βασιλικη δημητρα χριστινα
  αγγελικη παρασκευη κωνσταντινα παναγιωτα σταυρουλα ευαγγελια ειρηνη καλλιοπη αθηνα νικολετα
  μαρινα ολγα ναταλια αλεξανδρα βικτωρια ευη ζωη θαλεια μυρτω αργυρω φωτεινη κυριακη στελλα
  ευτυχια ανθη χαρα ματινα ροζα
  eleni katerina aikaterini sofia sophia sophie anna ioanna georgia despina vasiliki dimitra
  angeliki paraskevi konstantina panagiota stavroula evangelia eirini irini kalliopi athina
  nikoleta marina olga natalia alexandra viktoria vicky efi zoi thalia myrto argyro fotini
  kyriaki stella matina chara
  desislava milena radostina tsvetelina gergana yordanka nadezhda snezhana boryana vesela petya
  ivanka biljana jelena tijana katarina dragana svetlana lyudmila oksana iryna olena
  kateryna anastasia anastasiya ekaterina tatiana tatyana yulia magdalena agnieszka katarzyna
  malgorzata joanna dorota ewa beata iwona karolina aleksandra
  fatima aisha zeynep elif ayse emine leyla rana dina hala mona salma yasmin
`);

const MALE_GIVEN = words(`
  john jonathan james jim robert bob william bill richard rick michael mike david dave daniel dan
  paul peter pete mark matthew andrew simon stephen steven philip phillip george charles
  edward edmund henry harry thomas tom timothy tim christopher alexander anthony tony
  brian kevin sean shaun ian colin craig derek gordon graham keith malcolm neil roger stuart trevor
  hans klaus jurgen dieter wolfgang friedrich heinrich ralf uwe bernd
  pierre michel philippe olivier laurent thierry vincent
  γιωργος γεωργιος κωστας κωνσταντινος νικος νικολαος δημητρης δημητριος ιωαννης γιαννης παναγιωτης
  βασιλης βασιλειος χρηστος αθανασιος θαναση θανασης σταυρος αντωνης αντωνιος μιχαλης μιχαηλ
  αποστολος στελιος στυλιανος ηλιας πετρος παυλος σπυρος σωτηρης φωτης χαραλαμπος λευτερης
  giorgos georgios kostas konstantinos nikos nikolaos dimitris dimitrios ioannis giannis yiannis
  panagiotis vasilis vasileios christos athanasios thanasis stavros antonis michalis apostolos
  stelios stylianos ilias petros pavlos spyros sotiris fotis charalampos lefteris manolis
  emmanouil evangelos vangelis kyriakos leonidas theodoros thodoris gerasimos
  ivan georgi dimitar stoyan todor rumen plamen krasimir svetoslav yordan borislav miroslav
  radoslav vladimir aleksandar aleksander sergei sergey andrei andrey pavel oleksandr mykola
  bogdan lucian catalin razvan
  mehmet mustafa ahmet ali hasan huseyin ibrahim omar khaled yusuf tarek amir samir
`);

/**
 * Names that genuinely go either way, or that a rule below would answer confidently and wrongly.
 * A hit here returns null — the whole cast — rather than a coin flip dressed up as a verdict.
 *
 * `andrea` is why this set exists: female almost everywhere, male in Italy, and it ends in `-a`,
 * so without an entry the suffix rule would answer it with no doubt at all.
 */
const AMBIGUOUS_GIVEN = words(`
  andrea alex sasha sacha misha jean robin jamie casey jordan taylor morgan riley avery
  kim chris sam charlie ashley dana lee noa nour may
`);

/** Male given names ending in `-a`, which the suffix rule would otherwise read as feminine. */
const MALE_ENDING_IN_A = words(`
  nikola никола ilia ilija elia luka luca kosta costa sava mustafa moustafa musa isa ezra attila
  akira kenta joshua yeshua aleksa hamza mostafa
  θωμα λουκα
`);

/** `[suffix, gender, minimum token length]` — grammatical endings, checked on the LAST token. */
const SURNAME_SUFFIXES: Array<[string, CastGender, number]> = [
  // Slavic feminine: the -ov/-ev/-ski surname declined for a woman. `Slavov` → `Slavova`.
  ['ova', 'female', 5], ['eva', 'female', 5], ['ева', 'female', 5], ['ова', 'female', 5],
  ['ska', 'female', 5], ['cka', 'female', 5], ['ская', 'female', 6], ['ска', 'female', 5],
  // ...and its masculine base.
  ['ov', 'male', 4], ['ev', 'male', 4], ['ов', 'male', 4], ['ев', 'male', 4],
  ['ski', 'male', 5], ['sky', 'male', 5], ['cki', 'male', 5], ['ски', 'male', 5],
  ['vic', 'male', 5], ['vich', 'male', 6], ['ич', 'male', 5],
  // Greek, in Greek script. A woman's surname is the genitive of the man's: `Παπαδόπουλος` →
  // `Παπαδοπούλου`. `-όγλου` is excluded below — it is indeclinable and worn by both.
  ['ου', 'female', 6], ['ς', 'male', 4],
  // Greek transliterated into Latin, which is how half of these arrive from WhatsApp.
  ['opoulou', 'female', 8], ['poulou', 'female', 7], ['idou', 'female', 6], ['adou', 'female', 6],
  ['opoulos', 'male', 8], ['poulos', 'male', 7], ['idis', 'male', 5], ['iadis', 'male', 6],
  ['akis', 'male', 5], ['atos', 'male', 5], ['os', 'male', 5],
];

/** Endings that disqualify every suffix rule above — indeclinable, or another language entirely. */
const SUFFIX_EXCEPTIONS = ['γλου', 'oglou', 'oglu'];

function suffixVerdict(token: string): CastGender | null {
  if (SUFFIX_EXCEPTIONS.some((e) => token.endsWith(e))) return null;
  for (const [suffix, gender, min] of SURNAME_SUFFIXES) {
    if (token.length >= min && token.endsWith(suffix)) return gender;
  }
  return null;
}

/** Greek given names decline: a final `ς` is masculine, a final vowel `α/η/ω` is feminine. */
function greekGivenVerdict(token: string): CastGender | null {
  if (!/^[\u0370-\u03ff]+$/.test(token)) return null;
  if (token.endsWith('ς')) return 'male';
  if (/[αηω]$/.test(token)) return 'female';
  return null;
}

/**
 * The gender the NAME states — never a guess about the person, and null wherever the name does
 * not state one.
 *
 * Every signal that fires has to agree. A single disagreement (a feminine given name beside a
 * masculine surname, which is how a couple sharing one number arrives) returns null: the whole
 * point of narrowing the pool is to be right more often than a coin, and a split name is a coin.
 */
export function nameGender(name: string | null | undefined): CastGender | null {
  if (!name) return null;
  const tokens = tokenize(name);
  if (!tokens.length) return null;

  // An honorific is a stated fact and outranks morphology.
  for (const t of tokens) {
    const h = HONORIFICS[t];
    if (h) return h;
  }

  const named = tokens.filter((t) => !(t in HONORIFICS));
  if (!named.length) return null;
  // A name we have been told not to answer for stops the whole resolution, not just its own rule.
  if (named.some((t) => AMBIGUOUS_GIVEN.has(t))) return null;

  const verdicts: CastGender[] = [];
  for (const t of named) {
    if (MALE_GIVEN.has(t) || MALE_ENDING_IN_A.has(t)) verdicts.push('male');
    else if (FEMALE_GIVEN.has(t)) verdicts.push('female');
    else {
      const greek = greekGivenVerdict(t);
      if (greek) verdicts.push(greek);
    }
  }
  const last = suffixVerdict(named[named.length - 1]);
  if (last) verdicts.push(last);
  // A lone latin token ending in `-a` is feminine across Greek, Slavic and Romance; the male
  // exceptions are listed above and were consumed before this ran.
  if (!verdicts.length && named[0].length >= 4 && /^[a-z]+a$/.test(named[0])) verdicts.push('female');

  if (!verdicts.length) return null;
  return verdicts.every((v) => v === verdicts[0]) ? verdicts[0] : null;
}

/* ────────────────────────── Assigning a character ────────────────────────── */

const BUCKET = 'generation-images';
const CAST_PREFIX = 'avatars/cast';

/** FNV-1a: small, stable across engines, well spread for picking from a short list. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Which character in the cast this seed gets. Stable for the life of the contact.
 *
 * `gender` narrows the pool the hash picks from; null (or an unreadable name) is the whole cast,
 * which is what every contact got before. The hash itself is unchanged either way — so a contact
 * only moves when the VERDICT on their name changes, not when the name is re-capitalised.
 */
export function castSlotFor(seed: string | null | undefined, gender?: CastGender | null): number {
  const h = hash(seed || '?');
  if (!gender) return h % CAST_SIZE;
  const pool = castPool(gender);
  return pool.length ? pool[h % pool.length] : h % CAST_SIZE;
}

/** The same, resolving the pool from a name. The server-side entry point — see the header. */
export function castSlotForName(
  seed: string | null | undefined,
  name: string | null | undefined,
): number {
  return castSlotFor(seed, nameGender(name));
}

/**
 * A slot the server sent, made safe to index with.
 *
 * The client is deployed separately from the edge functions, so a slot minted against a longer
 * cast can arrive at a build that has not heard of it. Wrapping beats 404ing on a face.
 */
export function normalizeCastSlot(slot: number | null | undefined): number | null {
  if (typeof slot !== 'number' || !Number.isFinite(slot)) return null;
  return ((Math.trunc(slot) % CAST_SIZE) + CAST_SIZE) % CAST_SIZE;
}

/** The storage object for a slot — bucket + path, never a baked-in URL. */
export function castObjectForSlot(slot: number): {
  storage_bucket: string;
  storage_object_path: string;
} {
  return {
    storage_bucket: BUCKET,
    storage_object_path: `${CAST_PREFIX}/${String(slot).padStart(3, '0')}.png`,
  };
}

/** The storage object for a seed's character — bucket + path, never a baked-in URL. */
export function castObjectFor(seed: string | null | undefined, gender?: CastGender | null): {
  storage_bucket: string;
  storage_object_path: string;
} {
  return castObjectForSlot(castSlotFor(seed, gender));
}

/**
 * ── One person, one seed ──
 *
 * The seed is the thing that decides WHICH of the 24 characters somebody gets, so two places
 * seeding the same person differently is two different people on screen — and it is completely
 * silent, because both faces load, both are from the cast, and both look designed.
 *
 * That is exactly what shipped: the conversation header seeded on the THREAD id and the message
 * rows seeded on the SENDER PARTICIPANT id, so the counterparty of thread
 * `d3a43bcd…` wore `cast/016` at the top of the screen and `cast/021` beside every one of his
 * messages — a woman in the header, a man in the transcript, for one man. Nothing could catch it:
 * a wrong seed is a valid string and a wrong face is a 200.
 *
 * So the seed is the COUNTERPARTY'S PARTICIPANT ROW, everywhere, and these two functions are the
 * only places that decide it. The participant id and not the contact id: a WhatsApp number is
 * filed into the CRM later, and seeding on `contact_id` would hand somebody a new face on the day
 * their record is tidied up — the failure this module's header warns about, one column over. Not
 * the thread id either: a thread can hold two customers (one does), and they must not share a
 * face.
 */

/** The seed for the face of a thread's counterparty — the header, the list row, the drawer, the rail. */
export function castSeedForThreadCounterparty(
  thread: { counterparty_participant_id?: string | null; id?: string | null } | null | undefined,
  fallback?: string | null,
): string | null {
  // `counterparty_participant_id` is attached by inbox-api (`list_threads` / `get_thread`). The
  // thread id remains the floor for an INTERNAL thread, which has no counterparty at all.
  return thread?.counterparty_participant_id || thread?.id || fallback || null;
}

/** The seed for the face beside one message — the same key, read off the message. */
export function castSeedForSender(
  message: { sender_participant_id?: string | null } | null | undefined,
  fallback?: string | null,
): string | null {
  return message?.sender_participant_id || fallback || null;
}

/**
 * A ready-to-render URL for a seed's character.
 *
 * `generation-images` is public-read, so this is a plain public URL rather than a signed one. It
 * never expires, which matters because the same face renders on every message row — a signed URL
 * would have to be re-minted constantly and would break the moment one expired mid-scroll.
 *
 * The storage base comes from the caller so this module needs no Supabase client and can be
 * tested without one.
 */
export function castAvatarUrl(
  seed: string | null | undefined,
  storageBaseUrl: string,
  gender?: CastGender | null,
): string {
  const { storage_bucket, storage_object_path } = castObjectFor(seed, gender);
  return `${storageBaseUrl.replace(/\/$/, '')}/object/public/${storage_bucket}/${storage_object_path}`;
}
