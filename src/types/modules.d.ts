// Module declarations for external libraries
// Only used for things that genuinely lack types (CSS modules). Real library
// typings are preferred — do NOT stub them as `unknown` here; that overrides
// the real declarations and silently breaks downstream typechecking.

declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '@supabase/supabase-js' {
  export const createClient: unknown;
  export const SupabaseClient: unknown;
  export const AuthError: unknown;
  export const PostgrestError: unknown;
  export const StorageError: unknown;
  export const FunctionsError: unknown;
  export const RealtimeChannel: unknown;
  export const RealtimeClient: unknown;
  export const GoTrueClient: unknown;
  export const SupabaseAuthClient: unknown;
  export const SupabaseQueryBuilder: unknown;
  export const SupabaseStorageClient: unknown;
  export const SupabaseFunctionsClient: unknown;
  export const SupabaseRealtimeClient: unknown;
}
