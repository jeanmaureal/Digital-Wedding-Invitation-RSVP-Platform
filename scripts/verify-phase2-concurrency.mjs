import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

/**
 * Phase 2 Live Multi-Connection Concurrency Verification Harness (`P2-AC03`, `P2-AC07`)
 *
 * Uses independent Supabase HTTP clients (each executing in its own PostgreSQL
 * backend transaction via Supavisor) to test genuine concurrent race conditions:
 *   1. Parallel auto-generated wedding slug collisions (`create_wedding` x 6 simultaneous calls
 *      with identical partner names and `p_slug: null`), verifying bounded `unique_violation`
 *      subtransaction retries and 1:1 `wedding_settings` creation parity.
 *   2. Parallel project duplication bursts (`duplicate_wedding` x 6 simultaneous calls from
 *      one source wedding with identical `p_title` and `p_slug: null`), verifying all 6 clones
 *      succeed with unique slugs, `status = 'draft'`, `duplicated_from_wedding_id = source.id`,
 *      and cloned 1:1 `wedding_settings`.
 *   3. Clean teardown with zero leftover workspaces, weddings, or ephemeral organizer accounts.
 */

if (
  (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) &&
  existsSync('.env')
) {
  process.loadEnvFile('.env');
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !publishableKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.');
  process.exit(1);
}

const runTag = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const tempDir = mkdtempSync(join(tmpdir(), 'wedding-p2-conc-'));
const createdUserIds = [];
const trackedWorkspaces = [];

function runRemoteSqlFile(filename, sql) {
  const filePath = join(tempDir, filename);
  writeFileSync(filePath, sql, 'utf8');
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(
    npxCmd,
    ['supabase', 'db', 'query', '--remote', '--yes', '-f', filePath],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Remote SQL query (${filename}) failed:\n${result.stderr || result.stdout || 'unknown error'}`,
    );
  }
  return result.stdout;
}

function createIsolatedPublishableClient() {
  return createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function provisionConfirmedOrganizer(label) {
  const userId = crypto.randomUUID();
  const email = `p2.conc.${label}.${runTag}@example.com`;
  const password = `P2Conc!${runTag}#Aa1`;
  createdUserIds.push(userId);

  runRemoteSqlFile(
    `seed-${label}.sql`,
    `
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      '${userId}',
      'authenticated',
      'authenticated',
      '${email}',
      extensions.crypt('${password}', extensions.gen_salt('bf')),
      pg_catalog.now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"P2 Concurrency ${label}"}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now(),
      '',
      '',
      '',
      ''
    );
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      pg_catalog.gen_random_uuid(),
      '${userId}',
      pg_catalog.jsonb_build_object('sub', '${userId}', 'email', '${email}', 'email_verified', true),
      'email',
      '${userId}',
      pg_catalog.now(),
      pg_catalog.now(),
      pg_catalog.now()
    );
    `,
  );

  const client = createIsolatedPublishableClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`Failed signing in ${email}: ${error?.message ?? 'no user'}`);
  }
  return { userId: data.user.id, email, password };
}

async function createAuthedSessionClient(actor) {
  const client = createIsolatedPublishableClient();
  const { error } = await client.auth.signInWithPassword({
    email: actor.email,
    password: actor.password,
  });
  if (error) {
    throw new Error(`Failed signing in parallel session: ${error.message}`);
  }
  return client;
}

async function runParallelCreateWeddingBurst(actor, workspaceId) {
  const burstSize = 6;
  const sessionClients = await Promise.all(
    Array.from({ length: burstSize }, () => createAuthedSessionClient(actor)),
  );

  const results = await Promise.all(
    sessionClients.map((client, idx) =>
      client.rpc('create_wedding', {
        p_workspace_id: workspaceId,
        p_title: `Camila & Diego Celebration ${idx + 1}`,
        p_partner_one_name: `Camila ${runTag}`,
        p_partner_two_name: 'Diego',
        p_timezone: 'Asia/Manila',
      }),
    ),
  );

  const slugs = new Set();
  const weddingIds = [];
  for (const res of results) {
    if (res.error || !res.data) {
      throw new Error(
        `[P2-AC07] Parallel create_wedding failed: ${res.error?.message ?? 'no data'}`,
      );
    }
    slugs.add(res.data.slug);
    weddingIds.push(res.data.id);
  }

  if (slugs.size !== burstSize) {
    throw new Error(`[P2-AC07] Expected ${burstSize} unique wedding slugs, got ${slugs.size}`);
  }

  const { data: settingsRows, error: settingsErr } = await sessionClients[0]
    .from('wedding_settings')
    .select('wedding_id, timezone')
    .eq('workspace_id', workspaceId)
    .in('wedding_id', weddingIds);

  if (settingsErr || !settingsRows || settingsRows.length !== burstSize) {
    throw new Error(
      `[P2-AC02/AC07] Expected ${burstSize} 1:1 wedding_settings rows, got ${settingsRows?.length ?? 0}`,
    );
  }

  console.log(
    `PASS [P2-AC07]: ${burstSize}/${burstSize} simultaneous create_wedding calls succeeded with unique slugs (${[...slugs].join(', ')}) and 1:1 wedding_settings parity.`,
  );

  return weddingIds[0];
}

async function runParallelDuplicateWeddingBurst(actor, workspaceId, sourceWeddingId) {
  const burstSize = 6;
  const sessionClients = await Promise.all(
    Array.from({ length: burstSize }, () => createAuthedSessionClient(actor)),
  );

  const sharedDupTitle = `Copy of Camila & Diego ${runTag}`;
  const results = await Promise.all(
    sessionClients.map((client) =>
      client.rpc('duplicate_wedding', {
        p_workspace_id: workspaceId,
        p_source_wedding_id: sourceWeddingId,
        p_title: sharedDupTitle,
      }),
    ),
  );

  const slugs = new Set();
  const dupIds = [];
  for (const res of results) {
    if (res.error || !res.data) {
      throw new Error(
        `[P2-AC07] Parallel duplicate_wedding failed: ${res.error?.message ?? 'no data'}`,
      );
    }
    if (res.data.status !== 'draft' || res.data.duplicated_from_wedding_id !== sourceWeddingId) {
      throw new Error(
        `[P2-AC03/AC07] Unexpected duplicated wedding metadata: ${JSON.stringify(res.data)}`,
      );
    }
    slugs.add(res.data.slug);
    dupIds.push(res.data.id);
  }

  if (slugs.size !== burstSize) {
    throw new Error(`[P2-AC07] Expected ${burstSize} unique duplicated slugs, got ${slugs.size}`);
  }

  const { data: settingsRows, error: settingsErr } = await sessionClients[0]
    .from('wedding_settings')
    .select('wedding_id, timezone')
    .eq('workspace_id', workspaceId)
    .in('wedding_id', dupIds);

  if (settingsErr || !settingsRows || settingsRows.length !== burstSize) {
    throw new Error(
      `[P2-AC02/AC07] Expected ${burstSize} cloned wedding_settings rows, got ${settingsRows?.length ?? 0}`,
    );
  }

  console.log(
    `PASS [P2-AC07]: ${burstSize}/${burstSize} simultaneous duplicate_wedding calls succeeded with unique slugs (${[...slugs].join(', ')}) and cloned 1:1 wedding_settings.`,
  );
}

async function cleanup() {
  for (const ws of trackedWorkspaces.reverse()) {
    await ws.client.from('workspaces').delete().eq('id', ws.workspaceId);
  }

  if (createdUserIds.length > 0) {
    const idLiteralList = createdUserIds.map((id) => `'${id}'`).join(', ');
    try {
      runRemoteSqlFile(
        'cleanup-users.sql',
        `DELETE FROM auth.users WHERE id IN (${idLiteralList});`,
      );
    } catch (err) {
      console.error('Cleanup warning:', err);
    }
  }

  rmSync(tempDir, { recursive: true, force: true });
}

try {
  const owner = await provisionConfirmedOrganizer('owner');
  const ownerClient = await createAuthedSessionClient(owner);
  const { data: workspace, error: wsErr } = await ownerClient.rpc('create_workspace', {
    p_name: `P2 Concurrency Studio ${runTag}`,
  });

  if (wsErr || !workspace) {
    throw new Error(`Failed creating concurrency workspace: ${wsErr?.message ?? 'no data'}`);
  }
  trackedWorkspaces.push({ workspaceId: workspace.id, client: ownerClient });

  const sourceWeddingId = await runParallelCreateWeddingBurst(owner, workspace.id);
  await runParallelDuplicateWeddingBurst(owner, workspace.id, sourceWeddingId);

  console.log('ALL EXECUTED PHASE 2 CONCURRENCY VERIFICATIONS PASSED.');
} finally {
  await cleanup();
}
