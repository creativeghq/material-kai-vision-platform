/**
 * Single source of truth for the MIVAA backend gateway URL.
 *
 * Three historical env var names refer to the same backend; we honour
 * any of them, preferring the most recent (`_GATEWAY_URL`). Falls
 * back to the production host so local dev without a `.env` file
 * still hits the live API.
 */

const ENV = import.meta.env;

export const MIVAA_API_URL: string =
  ENV.VITE_MIVAA_GATEWAY_URL ||
  ENV.VITE_MIVAA_API_URL ||
  ENV.VITE_MIVAA_SERVICE_URL ||
  'https://v1api.materialshub.gr';
