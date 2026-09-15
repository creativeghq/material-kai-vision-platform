# Utilities

Hand-run tools. Nothing here is on a gate or a CI job — if a script belongs in the build, it goes
in `scripts/` proper and gets an npm script.

## Files

- `generate-keys.ps1` — PowerShell. Generates Material Kai API keys, workspace ids, client
  credentials, webhook secrets and encryption keys to the platform's naming conventions.

```powershell
.\scripts\utilities\generate-keys.ps1
```

## What used to be here

`investigate-docs-regression.js` and `error-handling-diagnostic.cjs` were listed for a long time
after they stopped existing; `generate-mivaa-key.cjs`, `rebuild-product-knowledge-kb.mjs` and
`split-kb-collections.mjs` existed and were listed nowhere. All five are gone — the key generator
was one line of `crypto`, and the two KB scripts read a `kb/` directory that is not in the repo.

**Keep this list exact.** A README that names a file nobody can run is worse than no README: it
sends the next person looking for a tool that was deleted years ago.
