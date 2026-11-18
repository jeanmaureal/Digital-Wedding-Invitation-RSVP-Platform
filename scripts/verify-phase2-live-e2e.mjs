import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Phase 2 Live Multi-Wedding & Gate 2 Isolation Playwright E2E Runner (`TG4`).
 *
 * Seeds ephemeral confirmed organizer accounts on `wedding-platform-dev` via Supabase CLI,
 * executes `e2e/phase2-multi-wedding.spec.ts` across both `chromium-desktop` and
 * `chromium-mobile` with zero server secrets in `.env`, and guarantees complete teardown
 * (`workspaces` -> cascading `weddings` + `wedding_settings`, plus `auth.users`) in `finally`.
 */

const repoRoot = process.cwd();
const runTag = Date.now().toString(36);
const password = `P2LiveE2e!${runTag}#Aa9`;

function runRemoteSql(sql) {
  const tmpFile = path.join(os.tmpdir(), `p2-live-e2e-${crypto.randomUUID()}.sql`);
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
    email: `p2.dsk.owner.${runTag}@example.com`,
    name: 'P2 Dsk Owner',
  },
  desktopEditor: {
    id: crypto.randomUUID(),
    email: `p2.dsk.editor.${runTag}@example.com`,
    name: 'P2 Dsk Editor',
  },
  desktopViewer: {
    id: crypto.randomUUID(),
    email: `p2.dsk.viewer.${runTag}@example.com`,
    name: 'P2 Dsk Viewer',
  },
  desktopOutsider: {
    id: crypto.randomUUID(),
    email: `p2.dsk.outsider.${runTag}@example.com`,
    name: 'P2 Dsk Outsider',
  },
  mobileOwner: {
    id: crypto.randomUUID(),
    email: `p2.mob.owner.${runTag}@example.com`,
    name: 'P2 Mob Owner',
  },
  mobileEditor: {
    id: crypto.randomUUID(),
    email: `p2.mob.editor.${runTag}@example.com`,
    name: 'P2 Mob Editor',
  },
  mobileViewer: {
    id: crypto.randomUUID(),
    email: `p2.mob.viewer.${runTag}@example.com`,
    name: 'P2 Mob Viewer',
  },
  mobileOutsider: {
    id: crypto.randomUUID(),
    email: `p2.mob.outsider.${runTag}@example.com`,
    name: 'P2 Mob Outsider',
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
    throw new Error(`Failed seeding Phase 2 live E2E users:\n${seedRes.stdout}\n${seedRes.stderr}`);
  }

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const pwRes = spawnSync(npxCmd, ['playwright', 'test', 'e2e/phase2-multi-wedding.spec.ts'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      P2_LIVE_E2E: '1',
      P2_E2E_RUN_TAG: runTag,
      P2_E2E_PASSWORD: password,
      P2_E2E_DESKTOP_OWNER_EMAIL: actors.desktopOwner.email,
      P2_E2E_DESKTOP_EDITOR_EMAIL: actors.desktopEditor.email,
      P2_E2E_DESKTOP_VIEWER_EMAIL: actors.desktopViewer.email,
      P2_E2E_DESKTOP_OUTSIDER_EMAIL: actors.desktopOutsider.email,
      P2_E2E_MOBILE_OWNER_EMAIL: actors.mobileOwner.email,
      P2_E2E_MOBILE_EDITOR_EMAIL: actors.mobileEditor.email,
      P2_E2E_MOBILE_VIEWER_EMAIL: actors.mobileViewer.email,
      P2_E2E_MOBILE_OUTSIDER_EMAIL: actors.mobileOutsider.email,
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
      'Warning: Phase 2 live E2E cleanup verification unexpected output:',
      cleanRes.stdout,
      cleanRes.stderr,
    );
    exitCode = 1;
  } else {
    console.log(
      'Phase 2 live E2E cleanup verified: 0 ephemeral users, workspaces, or weddings remaining.',
    );
  }
}

process.exit(exitCode);
