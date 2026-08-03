import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

/**
 * A service-role client, built fresh on each call.
 *
 * Twenty agent-tool modules declared this identical function themselves, each over a pair of
 * module-level `const SUPABASE_URL = Deno.env.get(...)` captures. That capture is the thing
 * CLAUDE.md forbids: the secrets bootstrap populates the environment at HANDLER ENTRY, so a
 * module-load read can see `undefined` and bake it into a client that then fails to authenticate —
 * with a credentials error rather than anything pointing back at load order.
 *
 * Reading the env inside the function is the whole point. Do not hoist these back out to module
 * scope for a micro-optimisation; `createClient` is cheap and the ordering is not negotiable.
 *
 * Service-role bypasses RLS. Every caller therefore still owes the tenancy check itself —
 * `userCanAccessWorkspace` / `assert_workspace_member` (CLAUDE.md invariant 1). Using this
 * function does not exempt anyone from that; it makes the manual check mandatory.
 */
export function serviceClient(): DbClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  ) as DbClient;
}
