import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('supabase/functions/inbox-api/index.ts', 'utf8');
const literal = /const EMAIL_ADDRESS = \/(.+)\/;/.exec(src)?.[1];

describe('inbox-api EMAIL_ADDRESS', () => {
  it('is the regex it reads as, not one with its backslashes eaten', () => {
    expect(literal).toBeDefined();
    const re = new RegExp(literal!);
    for (const ok of ['basiliskan@gmail.com', 'sales@stones.gr', 'first.last@mail.materialshub.gr']) {
      expect(re.test(ok), ok).toBe(true);
    }
    for (const bad of ['two words@x.gr', 'a@b', 'a@bcom', '<a@b.gr>']) {
      expect(re.test(bad), bad).toBe(false);
    }
  });
});
