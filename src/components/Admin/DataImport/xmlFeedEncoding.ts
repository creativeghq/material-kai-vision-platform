/**
 * The feed's RAW bytes as base64. The orchestrator decodes them by BOM / XML declaration, so a
 * Windows-1253 feed arrives intact; `File.text()` would have forced UTF-8 and garbled it first.
 */
export function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export interface AttributeTarget {
  field_name: string;
  label: string;
  destination: string;
}

export interface DetectedField {
  xml_field: string;
  sample_values: string[];
  suggested_mapping: string;
  confidence: number;
  data_type: string;
  total_rows?: number;
  present_count?: number;
  coverage_pct?: number;
  distinct_values?: number;
}
