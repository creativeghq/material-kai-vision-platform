import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase client type that `createClient(url, key)` actually produces here.
 *
 * Use this for every parameter/field that receives a client. The two obvious
 * alternatives are both WRONG in this version of supabase-js, and both were in
 * use across the edge functions:
 *
 * 1. Bare `SupabaseClient`. Its default type arguments resolve to schema `never`
 *    (`SupabaseClient<unknown, { PostgrestVersion: string }, never, never, …>`),
 *    while `createClient()` output has schema `"public"`. `"public"` is not
 *    assignable to `never`, so call sites errored with TS2345
 *    "Types of property 'rest' are incompatible".
 *
 * 2. `ReturnType` of the `createClient` function. Looks authoritative, but
 *    `createClient` is OVERLOADED, so `ReturnType` resolves to the LAST overload's
 *    return type — which carries the same `never` schema. Identical problem, while
 *    reading as though it cannot drift.
 *
 * Spelling the arguments out is what actually matches. `any` for the Database
 * generic is deliberate: edge functions have no generated `Database` type
 * available (the generated types live in `src/`, which is not bundled with the
 * functions). If that ever changes, swap `any` for `Database` here — one edit,
 * and every function inherits real column checking.
 */
export type DbClient = SupabaseClient<any, 'public', 'public', any, any>;
