/**
 * Single source of truth for the MIVAA backend gateway URL.
 *
 * Why this file exists: 23 separate files were inlining the env var
 * lookup with the same `|| 'https://v1api.materialshub.gr'` fallback
 * string. Updating the host (e.g. for staging or a domain change)
 * meant editing 23 files. Now: import this constant.
 *
 * Both `VITE_MIVAA_GATEWAY_URL` and `VITE_MIVAA_API_URL` were used —
 * we honour either, preferring the more recent `_GATEWAY_URL` name.
 */

const ENV = import.meta.env;

export const MIVAA_API_URL: string =
  ENV.VITE_MIVAA_GATEWAY_URL ||
  ENV.VITE_MIVAA_API_URL ||
  'https://v1api.materialshub.gr';
