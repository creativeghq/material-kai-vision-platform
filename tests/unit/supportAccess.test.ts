import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORKSPACE_ROLE_CAPABILITIES } from '@/auth/roleCapabilities';
import { formatTimeLeft, SUPPORT_ACCESS_DURATIONS, SUPPORT_PIN_VALIDITIES } from '@/services/supportAccessService';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const read = (...parts: string[]) => readFileSync(join(__dirname, '..', '..', ...parts), 'utf8');

describe('support access', () => {
  it('the support role cannot manage the team, so it cannot extend its own timer', () => {
    const caps = WORKSPACE_ROLE_CAPABILITIES.support;
    expect(caps).toBeTruthy();
    for (const cap of ['workspace.manage', 'network.manage', 'pricing.manage', 'platform.admin'] as const) {
      expect(caps).not.toContain(cap);
    }
  });

  it('offers only durations the SQL CHECKs accept', () => {
    for (const d of SUPPORT_ACCESS_DURATIONS) {
      expect(d.minutes).toBeGreaterThanOrEqual(15);
      expect(d.minutes).toBeLessThanOrEqual(43200);
    }
    for (const p of SUPPORT_PIN_VALIDITIES) {
      expect(p.minutes).toBeGreaterThanOrEqual(5);
      expect(p.minutes).toBeLessThanOrEqual(1440);
    }
  });

  it('a person cannot forge the request event', () => {
    expect(read('supabase', 'functions', 'flow-engine', 'index.ts'))
      .toMatch(/SERVER_ONLY_EVENTS[\s\S]*'workspace_access_requested'/);
  });

  it('the gate is mounted for every route', () => {
    expect(read('src', 'App.tsx')).toContain('<SupportAccessGate />');
  });

  it('formats time left', () => {
    expect(formatTimeLeft(-5)).toBe('0s');
    expect(formatTimeLeft(45)).toBe('45s');
    expect(formatTimeLeft(720)).toBe('12m');
    expect(formatTimeLeft(11520)).toBe('3h 12m');
    expect(formatTimeLeft(183600)).toBe('2d 3h');
  });
});
