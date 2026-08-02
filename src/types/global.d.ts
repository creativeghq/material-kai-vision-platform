// Global type declarations.
// Only add a module declaration here for a library that genuinely ships no types.
// Do NOT stub a third-party library — that overrides its real typings and silently breaks every
// downstream consumer. If a library has a DefinitelyTyped package (@types/foo) installed, trust it.
// This file used to break its own rule. It declared:
//     declare module '@tanstack/react-query' { export * from 'react-query'; }
// which pointed @tanstack/react-query (v5) at `react-query` — a DIFFERENT package, and one that is
// not even installed. The only thing resolving that name was @types/react-query@1.2.8: typings for
// v1 of the predecessor library, against a v5 runtime. Anyone writing useQuery would have been
// type-checked against `useQuery('key', fn)` (v1) while the runtime expected
// `useQuery({ queryKey, queryFn })` (v5). That is very likely WHY nothing ever used it — the first
// person to try would have hit nonsense errors and reached for useEffect instead.
// React Query has since been removed entirely (it was mounted app-wide with zero call sites), so
// the declaration, the two @tanstack packages and @types/react-query are all gone.
// Also removed: 28 empty `declare module 'x' {}` stubs for transitive @types packages. They were
// suppressing errors that no longer occur — verified by deleting them and running the full
// typecheck clean. An empty stub that suppresses nothing is indistinguishable from one that is
// load-bearing, which is exactly how this file accumulated a rule-breaking declaration in the
// middle of it without anyone noticing.

export {};
