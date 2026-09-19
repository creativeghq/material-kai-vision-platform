import { spawn } from 'node:child_process';

const TASKS = {
  lint: ['run', 'lint'],
  typecheck: ['run', 'typecheck'],
  test: ['test'],
};

// vitest runs one worker per core; pairing it with anything else times its worker RPC out.
const PHASES = [['lint', 'typecheck'], ['test']];

const picked = process.argv.slice(2).filter((a) => a in TASKS);
const wanted = new Set(picked.length ? picked : Object.keys(TASKS));

const run = (name) =>
  new Promise((resolve) => {
    const started = Date.now();
    const child = spawn('npm', TASKS[name], {
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => resolve({ name, code: 1, out: String(e), ms: Date.now() - started }));
    child.on('close', (code) => {
      const ms = Date.now() - started;
      process.stderr.write(`  ${code === 0 ? 'PASS' : 'FAIL'}  ${name} (${(ms / 1000).toFixed(0)}s)\n`);
      resolve({ name, code: code ?? 1, out, ms });
    });
  });

const started = Date.now();
const results = [];
for (const phase of PHASES) {
  const names = phase.filter((n) => wanted.has(n));
  if (!names.length) continue;
  process.stderr.write(`${names.join(' + ')}…\n`);
  results.push(...(await Promise.all(names.map(run))));
}

const failed = results.filter((r) => r.code !== 0);
for (const r of failed) {
  process.stderr.write(`\n${'='.repeat(70)}\n${r.name}\n${'='.repeat(70)}\n${r.out}\n`);
}

process.stderr.write(
  `\n${((Date.now() - started) / 1000).toFixed(0)}s — ${results.length - failed.length}/${results.length} passed`
  + (failed.length ? `; failed: ${failed.map((r) => r.name).join(', ')}\n` : '\n'),
);

process.exit(failed.length ? 1 : 0);
