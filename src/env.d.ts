/// <reference types="vite/client" />

/**
 * TypeScript definitions for environment variables
 * This ensures type safety when accessing import.meta.env
 */

interface ImportMetaEnv {
  // Environment
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;

  // Supabase
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_ANON_KEY?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;

  // MIVAA
  readonly VITE_MIVAA_API_URL?: string;
  readonly MIVAA_GATEWAY_URL?: string;
  readonly MIVAA_API_KEY?: string;

  // Stripe
  readonly VITE_STRIPE_PUBLIC_KEY?: string;
  readonly VITE_STRIPE_CREDITS_100_PRICE_ID?: string;
  readonly VITE_STRIPE_CREDITS_500_PRICE_ID?: string;
  readonly VITE_STRIPE_CREDITS_1000_PRICE_ID?: string;
  readonly VITE_STRIPE_CREDITS_5000_PRICE_ID?: string;
  readonly VITE_STRIPE_PRO_PRICE_ID?: string;
  readonly VITE_STRIPE_ENTERPRISE_PRICE_ID?: string;

  // WebSocket
  readonly NEXT_PUBLIC_WS_URL?: string;
  readonly VITE_WS_URL?: string;

  // Feature Flags
  readonly VITE_ENABLE_ANALYTICS?: string;
  readonly VITE_ENABLE_CACHING?: string;
  readonly VITE_ENABLE_LOGGING?: string;
  readonly VITE_ENABLE_WEBSOCKET?: string;

  // Build/Config
  readonly NODE_ENV?: string;
  readonly DISABLE_AUTO_INIT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Extend process.env for Node.js environments
declare namespace NodeJS {
  interface ProcessEnv extends ImportMetaEnv {
    [key: string]: string | undefined;
  }
}
