/**
 * #183 acceptance guard — the master AADE key must be UNREACHABLE from any tenant
 * inbound operation. `finance-inbound-sync` pulls received documents per-workspace using
 * each tenant's OWN myDATA credentials (`workspace_inbound_credentials`); it must never
 * fall back to the platform master AADE Special-Access-Codes (`AADE_USERNAME` /
 * `AADE_PASSWORD`, used only by the myaade-rgwspublic2 lookup), nor the shared SOAP
 * credential resolver. This is a source-level guard: it fails loudly if a future change
 * introduces a master-key fallback into the inbound path.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const INBOUND_SRC = join(process.cwd(), 'supabase/functions/finance-inbound-sync/index.ts');

describe('#183 inbound credential isolation', () => {
  const src = readFileSync(INBOUND_SRC, 'utf8');

  it('reads per-tenant inbound credentials (workspace_inbound_credentials)', () => {
    expect(src).toContain('workspace_inbound_credentials');
    // Each request must send the workspace's own creds.
    expect(src).toMatch(/aade-user-id/i);
    expect(src).toMatch(/Ocp-Apim-Subscription-Key/i);
  });

  it('NEVER references the platform master AADE credentials', () => {
    expect(src).not.toMatch(/AADE_USERNAME/);
    expect(src).not.toMatch(/AADE_PASSWORD/);
  });

  it('NEVER uses the shared master-credential resolver (resolveAadeCredentials)', () => {
    // resolveAadeCredentials reads the platform master AADE Special-Access-Codes — it is
    // the myaade-rgwspublic2 lookup path and must never appear in the tenant inbound flow.
    // (Importing the XML parse helpers `pickTag`/`pickAllTagBlocks` from _shared/aade/soap
    // is fine — those carry no credentials.)
    expect(src).not.toMatch(/resolveAadeCredentials/);
  });

  it('only resolves the non-credential base URL as a platform secret', () => {
    // The single resolveSecret call in this file is for the base URL, not a credential.
    const secretCalls = src.match(/resolveSecret\([^)]*\)/g) ?? [];
    for (const call of secretCalls) {
      expect(call).not.toMatch(/AADE_USERNAME|AADE_PASSWORD/);
    }
  });
});
