import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Phase 3 Live Invitation Design System & <InvitationRenderer /> Playwright E2E Runner (`TG4`).
 *
 * Seeds ephemeral confirmed organizer accounts on `wedding-platform-dev` via Supabase CLI,
 * executes `e2e/phase3-design-engine.spec.ts` across both `chromium-desktop` and
 * `chromium-mobile` with zero server secrets in `.env`, and guarantees complete teardown
 * (`workspaces` -> cascading `weddings`, `wedding_settings`, `wedding_themes`, and
 * `wedding_sections`, plus `auth.users`) in `finally`.
 */

const repoRoot = process.cwd();
const runTag = Date.now().toString(36);
const password = `P3LiveE2e!${runTag}#Aa9`;

function runRemoteSql(sql) {
  const tmpFile = path.join(os.tmpdir(), `p3-live-e2e-${crypto.randomUUID()}.sql`);
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
    email: `p3.dsk.owner.${runTag}@example.com`,
    name: 'P3 Dsk Owner',
  },
  desktopViewer: {
    id: crypto.randomUUID(),
    email: `p3.dsk.viewer.${runTag}@example.com`,
    name: 'P3 Dsk Viewer',
  },
  mobileOwner: {
    id: crypto.randomUUID(),
    email: `p3.mob.owner.${runTag}@example.com`,
    name: 'P3 Mob Owner',
  },
  mobileViewer: {
    id: crypto.randomUUID(),
    email: `p3.mob.viewer.${runTag}@example.com`,
    name: 'P3 Mob Viewer',
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
    throw new Error(`Failed seeding Phase 3 live E2E users:\n${seedRes.stdout}\n${seedRes.stderr}`);
  }

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const pwRes = spawnSync(npxCmd, ['playwright', 'test', 'e2e/phase3-design-engine.spec.ts'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      P3_LIVE_E2E: '1',
      P3_E2E_RUN_TAG: runTag,
      P3_E2E_PASSWORD: password,
      P3_E2E_DESKTOP_OWNER_EMAIL: actors.desktopOwner.email,
      P3_E2E_DESKTOP_VIEWER_EMAIL: actors.desktopViewer.email,
      P3_E2E_MOBILE_OWNER_EMAIL: actors.mobileOwner.email,
      P3_E2E_MOBILE_VIEWER_EMAIL: actors.mobileViewer.email,
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
      'Warning: Phase 3 live E2E cleanup verification unexpected output:',
      cleanRes.stdout,
      cleanRes.stderr,
    );
    exitCode = 1;
  } else {
    console.log(
      'Phase 3 live E2E cleanup verified: 0 ephemeral users, workspaces, weddings, themes, or sections remaining.',
    );
  }
}

process.exit(exitCode);
