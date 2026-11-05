const SMALL = new Set('a an and as at but by for from if in into of on or per than the to up via vs with without'.split(' '));
const SMALL_INSIDE_A_HYPHENATED_WORD = new Set(['to', 'and', 'of', 'the', 'a']);
const KEEP_AS_WRITTEN = new Set(['kg', 'cm', 'mm', 'km', 'ms', 'px', 'pcs', 'kw', 'kwh', 'mb', 'gb', 'sqm', 'art.', 'par.', 'a.', 'vs.', 'e.g.', 'i.e.', 'incl.', 'excl.', 'etc.', 'no.', 'optional', 'required', 'https', 'http']);

const capWord = (word, first) => {
  const m = /^([^A-Za-z0-9]*)([a-z][a-z']*\.?)([^A-Za-z0-9]*)$/.exec(word);
  if (!m) return word;
  const [, pre, core, post] = m;
  if (core.length === 1 || KEEP_AS_WRITTEN.has(core)) return word;
  if (!first && !pre && SMALL.has(core)) return word;
  return pre + core[0].toUpperCase() + core.slice(1) + post;
};

export function toTitleCase(label) {
  let first = true;
  const tokens = label.split(/(\s+)/);
  const lastIndex = tokens.findLastIndex((tok) => !/^\s*$/.test(tok));
  return tokens.map((tok, tokIndex) => {
    if (/^\s*$/.test(tok)) return tok;
    const edge = first || tokIndex === lastIndex;
    const out = tok.split(/([-/–])/).map((p, i) => (i % 2 ? p : capWord(p, edge || (i > 0 && !SMALL_INSIDE_A_HYPHENATED_WORD.has(p))))).join('');
    first = /[—–:]$|^[·|]$/.test(tok);
    return out;
  }).join('');
}

const NOT_A_NAME_START = new Set(('Add Create New Remove Delete Edit Find Record Set Save Send Show Hide Open Copy Upload Download Import Export Connect Disconnect Enable Disable Generate Run Track Browse View Start Stop Apply Clear Select Pick Choose Use Mark Move Invite Revoke Correct Notify Remind Cancel Approve Decline Reject Resend Retry Refresh Sync Test Check Keep Only Close Print Share Book Pay Request Update Build Compare Analyze Analyse Scan Search Get Make Write Convert Merge Link Unlink Assign Attach Detach Back Go See Try Reset Restore Replace Rename Duplicate Clone Publish Unpublish Archive Submit Confirm Sign Log Fill Paste Drop Turn Switch Tell Ask Help Let Plan Rank Monitor Audit Explain Summarise Summarize Suggest Reply Forward Fetch Load Pull Push Place Pin Unpin Extract Process Reopen Rebuild Recompute Reconcile Transfer Receive Ship Deliver Return Refund Issue Transmit File Schedule Enter Change Include Exclude Skip Allow Block Require Prevent Always Never Adjust Manage List Expand Retire Could Many ' +
  'No Not Nothing None What Who Which How Why When Where Is Are Do Does Can Should Will Would There This That These Those It If Please').split(' '));
const SENTENCE_WORD = /\b(is|are|was|were|be|been|has|have|had|will|can|cannot|must|should|does|do|did|this|that|these|those|it|they|their|them|we|our|you|your|when|where|which|who|what|how|why|find|finds|returns)\b/;

export function isNameLabel(text) {
  const t = text.trim();
  const words = t.split(/\s+/);
  if (words.length < 2 || words.length > 6) return false;
  if (!/^[A-Z][a-z]/.test(t) || /[.!?…:;,]$/.test(t) || /[,;]/.test(t)) return false;
  if (/[$`{}<>_=\\]/.test(t)) return false;
  if (NOT_A_NAME_START.has(words[0]) || /^Re-/.test(words[0])) return false;
  if (/^(a|an|the)$/.test(words[1]) && !/^(About|In|Has|From|On|For)$/.test(words[0])) return false;
  return !SENTENCE_WORD.test(words.slice(1).join(' '));
}

export const NAME_SITES = [
  /(?<![-\w])label=["']([^"'{}<>\n]+)["']/g,
  /<(?:FormSection|SectionHeader|PageHeader)\b[^>]*?\btitle=["']([^"'{}<>\n]+)["']/g,
  /<Label\b[^>]*>\s*([^<>{}\n]+?)\s*<\/Label>/g,
  /<SelectItem\b[^>]*>\s*([^<>{}\n]+?)\s*<\/SelectItem>/g,
  /<(?:TableHead|th)\b[^>]*>\s*([^<>{}\n]+?)\s*<\/(?:TableHead|th)>/g,
  /<TabsTrigger\b[^>]*>\s*([^<>{}\n]+?)\s*<\/TabsTrigger>/g,
  /<CardTitle\b[^>]*>\s*([^<>{}\n]+?)\s*<\/CardTitle>/g,
  /<Badge\b[^>]*>\s*([^<>{}\n]+?)\s*<\/Badge>/g,
  /(?<![-\w.])(?:label|header):\s*["']([^"'{}<>\n]+)["']/g,
  /(?:^|[{,\s])['"]?(?!p_|user-agent|[a-z_-]*(?:message|reason|description|label|prompt|hint)['"]?:)[a-z]+(?:[_.-][a-z0-9]+)+['"]?:\s*["']([^"'{}<>\n]+)["']/gm,
];
