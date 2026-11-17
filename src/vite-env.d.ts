/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_MIVAA_API_URL: string;
  readonly VITE_MIVAA_SERVICE_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_STRIPE_PRO_PRICE_ID: string;
  readonly VITE_STRIPE_ENTERPRISE_PRICE_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
