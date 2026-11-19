import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Phase 5 Live Public Wedding Website & Snapshot Publishing Playwright E2E Runner (`TG4` — Gate 4).
 *
 * Seeds ephemeral confirmed organizer accounts on `wedding-platform-dev` via Supabase CLI,
 * executes `e2e/phase5-public-website.spec.ts` across both `chromium-desktop` and
 * `chromium-mobile` with zero server secrets in `.env`, and guarantees complete teardown
 * (`workspaces` -> cascading `weddings`, `wedding_settings`, `wedding_themes`,
 * `wedding_sections`, and `published_versions`, plus `auth.users`) in `finally`.
 */

const repoRoot = process.cwd();
const runTag = Date.now().toString(36);
const password = `P5LiveE2e!${runTag}#Aa9`;

function runRemoteSql(sql) {
  const tmpFile = path.join(os.tmpdir(), `p5-live-e2e-${crypto.randomUUID()}.sql`);
  fs.writeFileSync(tmpFile, sql, 'utf8');
  try {
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    let lastRes = null;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      lastRes = spawnSync(npxCmd, ['supabase', 'db', 'query', '--remote', '--yes', '-f', tmpFile], {
        cwd: repoRoot,
        encoding: 'utf8',
        shell: process.platform === 'win32',
      });
      if (lastRes.status === 0) {
        return lastRes;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 1500);
    }
    return lastRes;
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
    email: `p5.dsk.owner.${runTag}@example.com`,
    name: 'P5 Dsk Owner',
  },
  desktopViewer: {
    id: crypto.randomUUID(),
    email: `p5.dsk.viewer.${runTag}@example.com`,
    name: 'P5 Dsk Viewer',
  },
  mobileOwner: {
    id: crypto.randomUUID(),
    email: `p5.mob.owner.${runTag}@example.com`,
    name: 'P5 Mob Owner',
  },
  mobileViewer: {
    id: crypto.randomUUID(),
    email: `p5.mob.viewer.${runTag}@example.com`,
    name: 'P5 Mob Viewer',
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
    throw new Error(`Failed seeding Phase 5 live E2E users:\n${seedRes.stdout}\n${seedRes.stderr}`);
  }

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const pwRes = spawnSync(npxCmd, ['playwright', 'test', 'e2e/phase5-public-website.spec.ts'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      P5_LIVE_E2E: '1',
      P5_E2E_RUN_TAG: runTag,
      P5_E2E_PASSWORD: password,
      P5_E2E_DESKTOP_OWNER_EMAIL: actors.desktopOwner.email,
      P5_E2E_DESKTOP_VIEWER_EMAIL: actors.desktopViewer.email,
      P5_E2E_MOBILE_OWNER_EMAIL: actors.mobileOwner.email,
      P5_E2E_MOBILE_VIEWER_EMAIL: actors.mobileViewer.email,
    },
  });

  if (pwRes.status !== 0) {
    exitCode = pwRes.status ?? 1;
  }
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  const idListSql = allUserIds.map((id) => `'${id}'::uuid`).join(', ');
  const cleanupSql = `
    DELETE FROM public.workspaces
     WHERE created_by IN (${idListSql})
        OR id IN (
          SELECT wm.workspace_id
            FROM public.workspace_members wm
           WHERE wm.user_id IN (${idListSql})
        );

    DELETE FROM auth.users
     WHERE id IN (${idListSql});

    SELECT count(*)::int AS remaining_ephemeral_users
      FROM auth.users
     WHERE id IN (${idListSql});
  `;
  const cleanupRes = runRemoteSql(cleanupSql);
  if (cleanupRes.status !== 0) {
    console.error('Phase 5 live E2E teardown warning:', cleanupRes.stderr || cleanupRes.stdout);
    exitCode = 1;
  } else {
    console.log('Phase 5 live E2E teardown complete:', cleanupRes.stdout.trim());
  }
}

process.exit(exitCode);
