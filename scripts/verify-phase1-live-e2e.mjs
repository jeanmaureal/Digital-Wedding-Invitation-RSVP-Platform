import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Phase 1 Live Multi-User Playwright E2E Runner (`TG4`).
 *
 * Seeds ephemeral confirmed organizer accounts on the linked Supabase development
 * project (`wedding-platform-dev`) via Supabase CLI, runs `e2e/phase1-workspace-rbac.spec.ts`
 * across both `chromium-desktop` and `chromium-mobile` with zero server secrets in `.env`,
 * and guarantees complete database cleanup (`workspaces` + `auth.users`) in `finally`.
 */

const repoRoot = process.cwd();
const runTag = Date.now().toString(36);
const password = `LiveE2e!${runTag}#Aa9`;

function runRemoteSql(sql) {
  const tmpFile = path.join(os.tmpdir(), `p1-live-e2e-${crypto.randomUUID()}.sql`);
  fs.writeFileSync(tmpFile, sql, 'utf8');
  try {
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    return spawnSync(npxCmd, ['supabase', 'db', 'query', '--remote', '--yes', '-f', tmpFile], {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

function buildSeedAuthUserSql(userId, email, fullName) {
  return `
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      '${userId}',
      'authenticated',
      'authenticated',
      '${email}',
      extensions.crypt('${password}', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"${fullName}"}'::jsonb,
      now(),
      now(),
      '', '', '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      '${userId}',
      jsonb_build_object('sub', '${userId}', 'email', '${email}', 'email_verified', true),
      'email',
      '${userId}',
      now(),
      now(),
      now()
    );
  `;
}

const actors = {
  desktopOwner: {
    id: crypto.randomUUID(),
    email: `e2e.dsk.owner.${runTag}@example.com`,
    name: 'Dsk Owner',
  },
  desktopViewer: {
    id: crypto.randomUUID(),
    email: `e2e.dsk.viewer.${runTag}@example.com`,
    name: 'Dsk Viewer',
  },
  desktopEditor: {
    id: crypto.randomUUID(),
    email: `e2e.dsk.editor.${runTag}@example.com`,
    name: 'Dsk Editor',
  },
  mobileOwner: {
    id: crypto.randomUUID(),
    email: `e2e.mob.owner.${runTag}@example.com`,
    name: 'Mob Owner',
  },
  mobileViewer: {
    id: crypto.randomUUID(),
    email: `e2e.mob.viewer.${runTag}@example.com`,
    name: 'Mob Viewer',
  },
  mobileEditor: {
    id: crypto.randomUUID(),
    email: `e2e.mob.editor.${runTag}@example.com`,
    name: 'Mob Editor',
  },
};

const allUserIds = Object.values(actors).map((a) => a.id);

let exitCode = 0;

try {
  const seedSql = Object.values(actors)
    .map((a) => buildSeedAuthUserSql(a.id, a.email, a.name))
    .join('\n');

  const seedRes = runRemoteSql(seedSql);
  if (seedRes.status !== 0) {
    throw new Error(`Failed seeding live E2E users:\n${seedRes.stdout}\n${seedRes.stderr}`);
  }

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const pwRes = spawnSync(npxCmd, ['playwright', 'test', 'e2e/phase1-workspace-rbac.spec.ts'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      P1_LIVE_E2E: '1',
      P1_E2E_RUN_TAG: runTag,
      P1_E2E_PASSWORD: password,
      P1_E2E_DESKTOP_OWNER_EMAIL: actors.desktopOwner.email,
      P1_E2E_DESKTOP_VIEWER_EMAIL: actors.desktopViewer.email,
      P1_E2E_DESKTOP_EDITOR_EMAIL: actors.desktopEditor.email,
      P1_E2E_MOBILE_OWNER_EMAIL: actors.mobileOwner.email,
      P1_E2E_MOBILE_VIEWER_EMAIL: actors.mobileViewer.email,
      P1_E2E_MOBILE_EDITOR_EMAIL: actors.mobileEditor.email,
    },
  });

  if (pwRes.status !== 0) {
    exitCode = pwRes.status ?? 1;
  }
} finally {
  const idList = allUserIds.map((id) => `'${id}'`).join(', ');
  const cleanupSql = `
    DELETE FROM public.workspaces WHERE created_by IN (${idList});
    DELETE FROM auth.users WHERE id IN (${idList});
    SELECT count(*)::int AS remaining_ephemeral_users FROM auth.users WHERE id IN (${idList});
  `;
  const cleanRes = runRemoteSql(cleanupSql);
  if (cleanRes.status !== 0 || !cleanRes.stdout.includes('"remaining_ephemeral_users": 0')) {
    console.error(
      'Warning: Live E2E cleanup verification unexpected output:',
      cleanRes.stdout,
      cleanRes.stderr,
    );
    exitCode = 1;
  } else {
    console.log('Live E2E cleanup verified: 0 ephemeral users or workspaces remaining.');
  }
}

process.exit(exitCode);
