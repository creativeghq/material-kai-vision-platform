import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8'));

describe('a recording is transcribed on the server, paid for first, inside the caller’s own workspace', () => {
  const fn = read('supabase/functions/structure-site-note/index.ts');

  it('reserves credits before the transcription call and refunds when it fails', () => {
    const reserve = fn.indexOf('reserveCredits(admin, uid, workspaceId');
    const call = fn.indexOf('transcribeAudioWithGemini(audio');
    expect(reserve).toBeGreaterThan(-1);
    expect(reserve).toBeLessThan(call);
    expect(fn.slice(call)).toMatch(/catch \(err\) \{\s*await refundCredits\(/);
  });

  it('a dictation with no project checks the workspace against the caller before anything runs', () => {
    const plain = fn.slice(fn.indexOf('if (plainDictation) {'));
    expect(plain.slice(0, 400)).toMatch(/userHasWorkspaceCapability\(admin, uid, workspaceId, /);
    expect(fn.indexOf('if (plainDictation) {')).toBeLessThan(fn.indexOf('reserveCredits(admin'));
  });

  it('a transcript-only request never reaches the structuring model or its debit', () => {
    const only = fn.indexOf("if (body.transcribe_only) return json(");
    expect(only).toBeGreaterThan(-1);
    expect(only).toBeLessThan(fn.indexOf('debitOrRefuse('));
  });

  it('both transcription prompts come from the database', () => {
    expect(fn).toContain("const TRANSCRIBE_TASK = 'site_note_transcription'");
    expect(fn).toContain("const DICTATION_TASK = 'voice_dictation_transcription'");
    expect(fn).toMatch(/getToolPrompt\(admin, task\)/);
  });

  it('the site walk and the agent composer both fall back to recording where live captions do not exist', () => {
    expect(read('src/modules/projects/components/DictateSiteWalkDialog.tsx')).toMatch(/recorder\.isSupported && \(preferRecording \|\| !voice\.isSupported\)/);
    expect(read('src/components/features/ai/AgentHub.tsx')).toMatch(/const voiceAvailable = isVoiceSupported \|\| recorder\.isSupported/);
  });
});
