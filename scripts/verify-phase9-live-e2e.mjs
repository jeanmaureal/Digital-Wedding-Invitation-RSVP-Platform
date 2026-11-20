import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Phase 9 Live 3-Context Cross-Tenant Security, Stored-XSS & Token Lifecycle E2E Runner (`P9-AC12`).
 *
 * Seeds ephemeral confirmed organizer accounts (`Tenant A` & `Tenant B Outsider`) on
 * `wedding-platform-dev` via Supabase CLI, runs `e2e/phase9-live-cross-tenant-security.spec.ts`
 * across both `chromium-desktop` and `chromium-mobile` with zero server secrets in `.env`,
 * and guarantees complete teardown (`workspaces` + explicit `auth.users` IDs) in `finally`.
 */

const repoRoot = process.cwd();
const runTag = Date.now().toString(36);
const password = `P9LiveE2e!${runTag}#Aa9`;

function runRemoteSql(sql) {
  const tmpFile = path.join(os.tmpdir(), `p9-live-e2e-${crypto.randomUUID()}.sql`);
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
  desktopTenantA: {
    id: crypto.randomUUID(),
    email: `p9.dsk.tenanta.${runTag}@example.com`,
    name: 'P9 Dsk Tenant A',
  },
  desktopTenantB: {
    id: crypto.randomUUID(),
    email: `p9.dsk.tenantb.${runTag}@example.com`,
    name: 'P9 Dsk Tenant B',
  },
  mobileTenantA: {
    id: crypto.randomUUID(),
    email: `p9.mob.tenanta.${runTag}@example.com`,
    name: 'P9 Mob Tenant A',
  },
  mobileTenantB: {
    id: crypto.randomUUID(),
    email: `p9.mob.tenantb.${runTag}@example.com`,
    name: 'P9 Mob Tenant B',
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
    throw new Error(`Failed seeding Phase 9 live E2E users:\n${seedRes.stdout}\n${seedRes.stderr}`);
  }

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const pwRes = spawnSync(
    npxCmd,
    ['playwright', 'test', 'e2e/phase9-live-cross-tenant-security.spec.ts'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        P9_LIVE_E2E: '1',
        P9_E2E_RUN_TAG: runTag,
        P9_E2E_PASSWORD: password,
        P9_E2E_DESKTOP_TENANT_A_EMAIL: actors.desktopTenantA.email,
        P9_E2E_DESKTOP_TENANT_B_EMAIL: actors.desktopTenantB.email,
        P9_E2E_MOBILE_TENANT_A_EMAIL: actors.mobileTenantA.email,
        P9_E2E_MOBILE_TENANT_B_EMAIL: actors.mobileTenantB.email,
      },
    },
  );

  if (pwRes.status !== 0) {
    exitCode = pwRes.status ?? 1;
  }
} finally {
  const quotedIds = allUserIds.map((id) => `'${id}'`).join(', ');
  const cleanupSql = `
    DELETE FROM public.workspaces
     WHERE created_by IN (${quotedIds});

    DELETE FROM auth.users
     WHERE id IN (${quotedIds});

    SELECT count(*)::int AS remaining_ephemeral_users
      FROM auth.users
     WHERE email LIKE '%@example.com';
  `;

  const cleanupRes = runRemoteSql(cleanupSql);
  console.log('\n[Phase 9 Live E2E Teardown]:');
  console.log(cleanupRes.stdout || cleanupRes.stderr);
  if (cleanupRes.status !== 0) {
    exitCode = 1;
  }
}

process.exit(exitCode);
