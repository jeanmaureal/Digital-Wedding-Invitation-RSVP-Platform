import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Safely generates `src/types/database.types.ts` via Supabase CLI v3 (`--remote`).
 * Supports passing `--remote=<project-ref>` via `SUPABASE_PROJECT_REF` when not yet linked locally.
 * Writes output to a temporary file first and replaces `src/types/database.types.ts`
 * only if the CLI exits with status 0 and emits valid TypeScript definitions.
 */
const targetPath = path.resolve(process.cwd(), 'src/types/database.types.ts');
const tempPath = path.join(os.tmpdir(), `supabase-db-types-${process.pid}-${Date.now()}.ts`);

const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
const remoteFlag = projectRef ? `--remote=${projectRef}` : '--remote';

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npxCmd, ['supabase', 'gen', 'types', '--lang=typescript', remoteFlag], {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error('Failed to invoke Supabase CLI:', result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    'Supabase type generation exited with non-zero status:',
    result.stderr || '(no stderr)',
  );
  process.exit(result.status ?? 1);
}

const generated = (result.stdout ?? '').trim();

if (!generated || !generated.includes('export type Database')) {
  console.error(
    'Supabase CLI returned empty or invalid TypeScript definitions. Keeping existing database.types.ts untouched.',
  );
  process.exit(1);
}

try {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(tempPath, `${generated}\n`, 'utf8');
  fs.copyFileSync(tempPath, targetPath);
  console.log(`Updated ${path.relative(process.cwd(), targetPath)} (${generated.length} bytes).`);
} finally {
  if (fs.existsSync(tempPath)) {
    fs.unlinkSync(tempPath);
  }
}
