/// <reference types="vite/client" />

/**
 * Type definitions for environment variables used in the Material-KAI Vision Platform
 * 
 * @description This file provides TypeScript type safety for environment variables
 * accessed through import.meta.env (Vite) and process.env (Node.js)
 */

interface ImportMetaEnv {
  /** Supabase project URL */
  readonly VITE_SUPABASE_URL: string;
  
  /** Supabase anonymous/public API key */
  readonly VITE_SUPABASE_ANON_KEY: string;
  
  /** MIVAA API base URL (default: https://v1api.materialshub.gr) */
  readonly VITE_MIVAA_API_URL?: string;
  
  /** Stripe price ID for 100 credits package */
  readonly VITE_STRIPE_CREDITS_100_PRICE_ID?: string;
  
  /** Stripe price ID for 500 credits package */
  readonly VITE_STRIPE_CREDITS_500_PRICE_ID?: string;
  
  /** Stripe price ID for 1000 credits package */
  readonly VITE_STRIPE_CREDITS_1000_PRICE_ID?: string;
  
  /** Stripe price ID for 5000 credits package */
  readonly VITE_STRIPE_CREDITS_5000_PRICE_ID?: string;
  
  /** Stripe price ID for Pro subscription plan */
  readonly VITE_STRIPE_PRO_PRICE_ID?: string;
  
  /** Stripe price ID for Enterprise subscription plan */
  readonly VITE_STRIPE_ENTERPRISE_PRICE_ID?: string;
  
  /** Current application mode (development, production, test) */
  readonly MODE: 'development' | 'production' | 'test';
  
  /** Whether the app is running in development mode */
  readonly DEV: boolean;
  
  /** Whether the app is running in production mode */
  readonly PROD: boolean;
  
  /** Whether the app is running in SSR mode */
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Node.js process environment variables
 * Used in server-side code and configuration files
 */
declare namespace NodeJS {
  interface ProcessEnv {
    /** Node environment (development, production, test) */
    NODE_ENV?: 'development' | 'production' | 'test';
    
    /** Supabase project URL (server-side) */
    SUPABASE_URL?: string;
    
    /** Supabase anonymous key (server-side) */
    SUPABASE_ANON_KEY?: string;
    
    /** MIVAA Gateway URL for server-side integration */
    MIVAA_GATEWAY_URL?: string;
    
    /** MIVAA API key for authentication */
    MIVAA_API_KEY?: string;
    
    /** WebSocket server URL for real-time features */
    NEXT_PUBLIC_WS_URL?: string;
  }
}
