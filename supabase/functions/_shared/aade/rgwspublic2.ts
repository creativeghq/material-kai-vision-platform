/**
 * ΑΑΔΕ RgWsPublic2 — the business-lookup operation itself (envelope + basic_rec parse).
 *
 * This lives in `_shared` rather than inside the route because two unrelated callers need the
 * same answer from the same service:
 *   - `myaade-rgwspublic2` — an operator looking a business up by ΑΦΜ.
 *   - `resolve-issuer-names.ts` — the inbound sync filling in a supplier that myDATA identified
 *     by ΑΦΜ alone and that ΓΕΜΗ has never heard of.
 * One derivation, one place to fix when ΑΑΔΕ varies the shape.
 *
 * Cost of a call, which is why every caller gates it and this module never does: a live
 * RgWsPublic2 lookup writes an audit entry into the LOOKED-UP ΑΦΜ's TAXISnet inbox under the
 * caller's identity, and spends that workspace's monthly quota.
 */
import { pickAllTagBlocks, pickTag, xmlEscape } from './soap.ts';

export const RGWSPUBLIC2_ENDPOINT = 'https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2';

export interface BasicRec {
  afm: string | null;
  doy: string | null;
  doy_descr: string | null;
  i_ni_flag_descr: string | null;
  deactivation_flag: string | null;
  deactivation_flag_descr: string | null;
  firm_flag_descr: string | null;
  onomasia: string | null;
  commer_title: string | null;
  legal_status_descr: string | null;
  postal_address: string | null;
  postal_address_no: string | null;
  postal_zip_code: string | null;
  postal_area_description: string | null;
  regist_date: string | null;
  stop_date: string | null;
  normal_vat_system_flag: string | null;
}

export function buildRgWsPublic2Body(afmCalledBy: string, afmCalledFor: string): string {
  return `<srv:rgWsPublic2AfmMethod xmlns:srv="http://rgwspublic2/RgWsPublic2">
    <srv:INPUT_REC>
      <srv:afm_called_by>${xmlEscape(afmCalledBy)}</srv:afm_called_by>
      <srv:afm_called_for>${xmlEscape(afmCalledFor)}</srv:afm_called_for>
    </srv:INPUT_REC>
  </srv:rgWsPublic2AfmMethod>`;
}

export function parseBasicRec(xml: string): BasicRec | null {
  const block = pickAllTagBlocks(xml, 'basic_rec')[0] ?? pickAllTagBlocks(xml, 'BasicRec')[0];
  if (!block) return null;
  return {
    afm: pickTag(block, 'afm'),
    doy: pickTag(block, 'doy'),
    doy_descr: pickTag(block, 'doy_descr'),
    i_ni_flag_descr: pickTag(block, 'i_ni_flag_descr'),
    deactivation_flag: pickTag(block, 'deactivation_flag'),
    deactivation_flag_descr: pickTag(block, 'deactivation_flag_descr'),
    firm_flag_descr: pickTag(block, 'firm_flag_descr'),
    onomasia: pickTag(block, 'onomasia'),
    commer_title: pickTag(block, 'commer_title'),
    legal_status_descr: pickTag(block, 'legal_status_descr'),
    postal_address: pickTag(block, 'postal_address'),
    postal_address_no: pickTag(block, 'postal_address_no'),
    postal_zip_code: pickTag(block, 'postal_zip_code'),
    postal_area_description: pickTag(block, 'postal_area_description'),
    regist_date: pickTag(block, 'regist_date'),
    stop_date: pickTag(block, 'stop_date'),
    normal_vat_system_flag: pickTag(block, 'normal_vat_system_flag'),
  };
}

/**
 * What to call this business. `onomasia` is the registered name (for a sole trader, the
 * person's own name — which is exactly the case ΓΕΜΗ cannot answer); `commer_title` is the
 * trade name, used only when there is no registered name.
 */
export function displayNameFromBasicRec(rec: BasicRec | null): string | null {
  const name = (rec?.onomasia ?? rec?.commer_title ?? '').trim();
  return name || null;
}
