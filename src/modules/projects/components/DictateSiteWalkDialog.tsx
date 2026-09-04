/**
 * Dictate a site walk.
 *
 * Speak while walking; the transcript is structured into a diary entry and the defects mentioned
 * in it, and NOTHING is written until the person has looked at the proposal. A transcription
 * mishears — "the ensuite tile is cracked" and "the ensuite tiler is back" differ by one sound —
 * and a defect filed straight off a mishearing is a job somebody gets sent to do.
 *
 * Everything the reader could not place is shown rather than dropped: an unmatched room, a
 * mangled sentence, a defect that arrived with no title. A dictation that quietly loses one of
 * the six faults somebody just walked past is worse than no dictation, because they believe it
 * was recorded.
 *
 * Speech recognition is the browser's, so it can simply be absent (Firefox, older WebViews). That
 * is stated plainly with the way out — type the note instead — rather than rendering a dead
 * button.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Mic, Square, Check, AlertTriangle, ClipboardList, CalendarDays } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { humanizeLabel } from '@/utils/humanize';
import { todayLocalISO } from '@/utils/datetime';
import { siteService, type SnagSeverity } from '../services/siteService';

/** What the reader proposed, plus whether the person wants each part kept. */
interface Proposal {
  log: { notes: string; weather: string | null; attendance: string | null } | null;
  snags: Array<{
    title: string;
    description: string | null;
    severity: SnagSeverity | null;
    room_id: string | null;
    room_unmatched: string | null;
  }>;
  unclear: string | null;
  dropped: string[];
}

interface Props {
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * The dictation language. English is the platform default and stays the default here; a Greek
 * foreman switches once and the browser remembers nothing, so it is a visible control rather than
 * a guess from `navigator.language` — which on a Greek phone with an English UI would be wrong
 * either way round.
 */
const LANGUAGES = [
  { code: 'en-US', label: 'English' },
  { code: 'el-GR', label: 'Ελληνικά' },
] as const;

export const DictateSiteWalkDialog: React.FC<Props> = ({ projectId, onClose, onSaved }) => {
  const { toast } = useToast();
  const [language, setLanguage] = useState<string>(LANGUAGES[0].code);
  const [logDate, setLogDate] = useState(todayLocalISO());
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [keepLog, setKeepLog] = useState(true);
  const [keepSnags, setKeepSnags] = useState<boolean[]>([]);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  const voice = useVoiceInput({ language, continuous: true, interimResults: true });
  const [typed, setTyped] = useState('');

  // The transcript the person will actually send: what they dictated, plus anything they typed or
  // corrected afterwards. Seeded from the recogniser but editable, because the fastest fix for a
  // misheard word is to correct it before the model reads it, not after.
  useEffect(() => {
    if (voice.transcript) setTyped(voice.transcript);
  }, [voice.transcript]);

  const spoken = `${typed}${voice.interimTranscript ? ` ${voice.interimTranscript}` : ''}`.trim();

  const read = async () => {
    const text = typed.trim();
    if (!text) { toast({ title: 'Nothing to read yet', variant: 'destructive' }); return; }
    if (voice.isRecording) voice.stopRecording();
    setReading(true);
    try {
      const res = await siteService.structureDictation(projectId, text);
      setProposal(res);
      setKeepLog(!!res.log);
      setKeepSnags(res.snags.map(() => true));
      if (!res.log && res.snags.length === 0) {
        toast({
          title: 'Nothing to record',
          description: 'The reader found no diary entry and no defects in that. Try saying more.',
        });
      }
    } catch (err: any) {
      toast({ title: 'Could not read the dictation', description: err?.message, variant: 'destructive' });
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    if (!proposal) return;
    const snags = proposal.snags.filter((_, i) => keepSnags[i]);
    const wantLog = keepLog && !!proposal.log;
    if (!wantLog && snags.length === 0) {
      toast({ title: 'Nothing selected', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // ONE statement. This used to be a log insert followed by one insert per defect, on the
      // argument that honest sequential writes beat a half-atomic loop. True — but the choice was
      // never between those two. When the log committed and the first defect failed, Save
      // re-armed with the same proposal and the retry wrote a SECOND identical log entry before
      // trying the defects again. `record_site_walk` creates everything or nothing, so a retry
      // is safe and "Some records were not created" is now literally true when it appears.
      await siteService.recordSiteWalk({
        project_id: projectId,
        log: wantLog && proposal.log
          ? {
              log_date: logDate,
              notes: proposal.log.notes,
              weather: proposal.log.weather,
              attendance: proposal.log.attendance,
            }
          : null,
        snags: snags.map((s) => ({
          title: s.title,
          description: s.description,
          // A severity the person did not indicate stays unset so the create default stands.
          ...(s.severity ? { severity: s.severity } : {}),
          room_id: s.room_id ?? null,
        })),
      });
      toast({
        title: 'Recorded',
        description: [
          wantLog ? '1 site log entry' : null,
          snags.length ? `${snags.length} defect${snags.length === 1 ? '' : 's'}` : null,
        ].filter(Boolean).join(' and '),
      });
      onSaved();
    } catch (err: any) {
      toast({ title: 'Some records were not created', description: err?.message, variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dictate a site walk</DialogTitle>
          <DialogDescription>
            Talk through the day and any defects. Nothing is saved until you have checked what it heard.
          </DialogDescription>
        </DialogHeader>

        {!proposal ? (
          <div className="space-y-3">
            {!voice.isSupported && (
              <div className="flex items-start gap-2 rounded-sm border border-hairline bg-surface-sunken p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-800 dark:text-amber-400" aria-hidden />
                <p className="text-muted-foreground">
                  This browser cannot listen. Type the note below instead — everything after that
                  works the same.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={voice.isRecording ? 'secondary' : 'default'}
                onClick={() => voice.toggleRecording()}
                disabled={!voice.isSupported || reading}
              >
                {voice.isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {voice.isRecording ? 'Stop' : 'Start talking'}
              </Button>
              <select
                className="h-9 rounded-sm border border-hairline bg-background px-2 text-sm"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={voice.isRecording}
                aria-label="Dictation language"
              >
                {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
              {voice.isRecording && (
                <span className="text-xs text-muted-foreground">Listening…</span>
              )}
            </div>

            {voice.error && <p className="text-xs text-destructive">{voice.error}</p>}

            <div className="space-y-1">
              <Label className="text-xs">What you said</Label>
              <textarea
                className="min-h-40 w-full rounded-sm border border-hairline bg-background p-2 text-sm"
                value={spoken}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Press Start talking, or type the note here."
              />
              <p className="text-[11px] text-muted-foreground">
                Correct anything it misheard before reading it — a wrong word here becomes a wrong
                record.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={() => void read()} disabled={reading || !typed.trim()}>
                {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Read it
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {proposal.log && (
              <div className="rounded-sm border border-hairline p-3">
                <label className="flex items-start gap-2">
                  <Checkbox checked={keepLog} onCheckedChange={(v) => setKeepLog(!!v)} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Site log entry
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{proposal.log.notes}</p>
                    {(proposal.log.weather || proposal.log.attendance) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[proposal.log.weather, proposal.log.attendance].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <Label className="text-[11px] text-muted-foreground">Date</Label>
                      <Input
                        type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)}
                        className="h-8 w-40"
                      />
                    </div>
                  </div>
                </label>
              </div>
            )}

            {proposal.snags.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                  <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                  {proposal.snags.length} defect{proposal.snags.length === 1 ? '' : 's'}
                </p>
                <div className="divide-y divide-hairline rounded-sm border border-hairline">
                  {proposal.snags.map((s, i) => (
                    <label key={`${s.title}-${i}`} className="flex items-start gap-2 p-3">
                      <Checkbox
                        checked={keepSnags[i] ?? false}
                        onCheckedChange={(v) => setKeepSnags((k) => k.map((b, j) => (j === i ? !!v : b)))}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{s.title}</span>
                          {s.severity && <Badge variant="neutral">{humanizeLabel(s.severity)}</Badge>}
                        </div>
                        {s.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
                        )}
                        {s.room_unmatched && (
                          <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                            You said “{s.room_unmatched}” — no room on this project matched, so it is
                            filed without one.
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {(proposal.unclear || proposal.dropped.length > 0) && (
              <div className="rounded-sm border border-hairline bg-surface-sunken p-3 text-xs">
                <p className="font-medium">Heard but not recorded</p>
                {proposal.unclear && <p className="mt-1 text-muted-foreground">{proposal.unclear}</p>}
                {proposal.dropped.map((d, i) => (
                  <p key={i} className="mt-1 text-muted-foreground">Could not make a defect from: {d}</p>
                ))}
                <p className="mt-1 text-muted-foreground">Add anything that matters by hand.</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setProposal(null)} disabled={saving}>
                Back
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Create records
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
