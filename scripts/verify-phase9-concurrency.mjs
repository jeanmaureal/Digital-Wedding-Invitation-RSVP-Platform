import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

/**
 * Phase 9 Cross-Subsystem Multi-Connection Concurrency & Reliability Harness (`P9-AC05`).
 *
 * Exercises independent stateless & authenticated Supabase HTTP clients concurrently
 * through Supavisor across 4 cross-subsystem contention scenarios:
 *   1. Burst 1: Simultaneous `publish_wedding` (x6) + `rollback_wedding_published_version` (x4)
 *      on the exact same wedding -> verifies `FOR UPDATE` on `weddings` prevents `23505`
 *      collisions on `(wedding_id, version_number)` and `published_versions_one_active_per_wedding_idx`,
 *      producing contiguous versions `1..8` and exact `1` active snapshot.
 *   2. Burst 2: Live publish + rollback storm running simultaneously with 6 anonymous
 *      `get_public_wedding_by_slug` reads and 6 guest `submit_household_rsvp` writes across
 *      3 households (14 parallel connections) -> verifies zero transient `unavailable` reads,
 *      zero deadlocks, and `response_version = 2` on all 3 households.
 *   3. Burst 3: Simultaneous `issue_household_invitation` token rotation (x6) on the same
 *      household -> verifies `invitations_one_active_per_group_idx` never violates, leaving
 *      exact `1` `'active'` token and `5` `'revoked'` tokens from the burst.
 *   4. Burst 4: Simultaneous `reorder_wedding_sections` (x4 permutations) + concurrent valid
 *      and failing `import_wedding_guests` batches -> verifies `DEFERRABLE` sort-order swaps
 *      (`0..6`) and 100% atomic rollback of the invalid multi-household import batch.
 */

for (const envFile of ['.env.local', '.env']) {
  if (
    (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) &&
    existsSync(envFile)
  ) {
    process.loadEnvFile(envFile);
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !publishableKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.');
  process.exit(1);
}

const runTag = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const tempDir = mkdtempSync(join(tmpdir(), 'wedding-p9-conc-'));
const createdUserIds = [];
const trackedWorkspaces = [];

function runRemoteSqlFile(filename, sql) {
  const filePath = join(tempDir, filename);
  writeFileSync(filePath, sql, 'utf8');
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  let lastRes = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    lastRes = spawnSync(npxCmd, ['supabase', 'db', 'query', '--remote', '--yes', '-f', filePath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (lastRes.status === 0) {
      return lastRes.stdout;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 1500);
  }
  throw new Error(
    `Remote SQL query (${filename}) failed:\n${lastRes?.stderr || lastRes?.stdout || 'unknown error'}`,
  );
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

async function signInFreshOrganizerSession(email, password) {
  const client = createIsolatedPublishableClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`Failed signing in ${email}: ${error?.message ?? 'no user'}`);
  }
  return client;
}

async function provisionConfirmedOrganizer(label) {
  const userId = crypto.randomUUID();
  const email = `p9.conc.${label}.${runTag}@example.com`;
  const password = `P9Conc!${runTag}#Aa1`;
  createdUserIds.push(userId);

  runRemoteSqlFile(
    `seed-${label}.sql`,
    `
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
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
      '{"full_name":"P9 Concurrency ${label}"}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now(),
      '', '', '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
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

  const client = await signInFreshOrganizerSession(email, password);
  return { userId, email, password, client };
}

async function cleanup() {
  for (const ws of trackedWorkspaces.reverse()) {
    await ws.client.from('workspaces').delete().eq('id', ws.workspaceId);
  }

  if (createdUserIds.length > 0) {
    const idLiteralList = createdUserIds.map((id) => `'${id}'::uuid`).join(', ');
    try {
      const cleanupOut = runRemoteSqlFile(
        'cleanup-users.sql',
        `
        DELETE FROM public.workspaces WHERE created_by IN (${idLiteralList});
        DELETE FROM auth.users WHERE id IN (${idLiteralList});
        SELECT count(*)::int AS remaining_ephemeral_users
          FROM auth.users
         WHERE email LIKE '%@example.com';
        `,
      );
      console.log('[Phase 9 Concurrency Teardown]:', cleanupOut.trim());
    } catch (err) {
      console.error('Cleanup warning:', err);
    }
  }

  rmSync(tempDir, { recursive: true, force: true });
}

try {
  const owner = await provisionConfirmedOrganizer('owner');
  const orgClient = owner.client;

  const { data: workspace, error: wsErr } = await orgClient.rpc('create_workspace', {
    p_name: `P9 Concurrency Studio ${runTag}`,
  });
  if (wsErr || !workspace) {
    throw new Error(`Failed creating workspace: ${wsErr?.message ?? 'no data'}`);
  }
  trackedWorkspaces.push({ workspaceId: workspace.id, client: orgClient });

  const weddingSlug = `p9-conc-${runTag}`.toLowerCase();
  const { data: wedding, error: wedErr } = await orgClient.rpc('create_wedding', {
    p_workspace_id: workspace.id,
    p_title: `Phase 9 Concurrency Gala ${runTag}`,
    p_partner_one_name: 'Elena',
    p_partner_two_name: 'Julian',
    p_slug: weddingSlug,
    p_timezone: 'Asia/Manila',
    p_rsvp_deadline: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
    p_access_mode: 'public',
    p_is_rsvp_open: true,
    p_allow_plus_ones_default: true,
    p_show_guest_dietary_notes: true,
  });
  if (wedErr || !wedding) {
    throw new Error(`Failed creating wedding: ${wedErr?.message ?? 'no data'}`);
  }

  // Publish baseline v1 and v2
  for (const expectedVersion of [1, 2]) {
    const { data: pv, error: pubErr } = await orgClient.rpc('publish_wedding', {
      p_workspace_id: workspace.id,
      p_wedding_id: wedding.id,
    });
    if (pubErr || !pv || pv.version_number !== expectedVersion) {
      throw new Error(`Failed seeding v${expectedVersion}: ${pubErr?.message ?? 'mismatch'}`);
    }
  }

  // --- Burst 1: Simultaneous `publish_wedding` (x6) + `rollback_wedding_published_version` (x4) ---
  const burst1Clients = await Promise.all(
    Array.from({ length: 10 }, () => signInFreshOrganizerSession(owner.email, owner.password)),
  );

  const burst1Results = await Promise.all(
    burst1Clients.map((client, idx) =>
      idx < 6
        ? client.rpc('publish_wedding', {
            p_workspace_id: workspace.id,
            p_wedding_id: wedding.id,
          })
        : client.rpc('rollback_wedding_published_version', {
            p_workspace_id: workspace.id,
            p_wedding_id: wedding.id,
            p_target_version_number: idx % 2 === 0 ? 1 : 2,
          }),
    ),
  );

  for (const res of burst1Results) {
    if (res.error || !res.data) {
      throw new Error(`[Burst 1] Concurrent publish/rollback failed: ${res.error?.message}`);
    }
  }

  const { data: historyAfterBurst1, error: histErr } = await orgClient.rpc(
    'list_wedding_published_versions',
    {
      p_workspace_id: workspace.id,
      p_wedding_id: wedding.id,
    },
  );
  if (histErr || !Array.isArray(historyAfterBurst1)) {
    throw new Error(`[Burst 1] Failed reading version history: ${histErr?.message}`);
  }

  const versionNums = historyAfterBurst1.map((item) => item.versionNumber);
  const activeItems = historyAfterBurst1.filter((item) => item.isActive === true);
  const expectedNums = [8, 7, 6, 5, 4, 3, 2, 1];

  if (JSON.stringify(versionNums) !== JSON.stringify(expectedNums) || activeItems.length !== 1) {
    throw new Error(
      `[Burst 1] Version invariant violated: versions=${JSON.stringify(versionNums)}, activeCount=${activeItems.length}`,
    );
  }

  console.log(
    `PASS [Phase 9 Burst 1]: 6 concurrent publish_wedding + 4 concurrent rollback calls serialized cleanly (versions 1..8 contiguous, exact 1 active snapshot = v${activeItems[0].versionNumber}).`,
  );

  // --- Seed 3 distinct households + custom question + active tokens for Burst 2 ---
  const { data: qCourse, error: qErr } = await orgClient
    .from('rsvp_questions')
    .insert({
      workspace_id: workspace.id,
      wedding_id: wedding.id,
      label: 'Dinner Selection',
      question_type: 'single_select',
      options: ['Salmon', 'Truffle Pasta'],
      is_required: true,
      sort_order: 0,
    })
    .select('id')
    .single();
  if (qErr || !qCourse) {
    throw new Error(`Failed creating custom question: ${qErr?.message}`);
  }

  const households = [];
  for (let h = 1; h <= 3; h += 1) {
    const { data: grp, error: grpErr } = await orgClient
      .from('guest_groups')
      .insert({
        workspace_id: workspace.id,
        wedding_id: wedding.id,
        display_name: `Concurrency Household ${h}`,
        max_attendees: 2,
      })
      .select('id')
      .single();
    if (grpErr || !grp) {
      throw new Error(`Failed creating household ${h}: ${grpErr?.message}`);
    }

    const { data: gRow, error: gErr } = await orgClient
      .from('guests')
      .insert({
        workspace_id: workspace.id,
        wedding_id: wedding.id,
        group_id: grp.id,
        first_name: `Guest${h}`,
        last_name: 'Rivera',
        sort_order: 0,
      })
      .select('id')
      .single();
    if (gErr || !gRow) {
      throw new Error(`Failed creating guest ${h}: ${gErr?.message}`);
    }

    const { data: issued, error: issErr } = await orgClient.rpc('issue_household_invitation', {
      p_workspace_id: workspace.id,
      p_wedding_id: wedding.id,
      p_group_id: grp.id,
    });
    if (issErr || !issued) {
      throw new Error(`Failed issuing invitation ${h}: ${issErr?.message}`);
    }

    households.push({
      groupId: grp.id,
      guestId: gRow.id,
      rawToken: issued.rawToken,
    });
  }

  // --- Burst 2: 2 organizer publish/rollback + 6 public slug reads + 6 guest RSVPs (14 parallel) ---
  const [pubOrgClient, rbOrgClient] = await Promise.all([
    signInFreshOrganizerSession(owner.email, owner.password),
    signInFreshOrganizerSession(owner.email, owner.password),
  ]);
  const slugReadClients = Array.from({ length: 6 }, () => createIsolatedPublishableClient());
  const rsvpWriteClients = Array.from({ length: 6 }, () => createIsolatedPublishableClient());

  const [pubStormRes, rbStormRes, ...publicAndGuestResults] = await Promise.all([
    pubOrgClient.rpc('publish_wedding', {
      p_workspace_id: workspace.id,
      p_wedding_id: wedding.id,
    }),
    rbOrgClient.rpc('rollback_wedding_published_version', {
      p_workspace_id: workspace.id,
      p_wedding_id: wedding.id,
      p_target_version_number: 1,
    }),
    ...slugReadClients.map((client) =>
      client.rpc('get_public_wedding_by_slug', { p_slug: weddingSlug }),
    ),
    ...rsvpWriteClients.map((client, idx) => {
      const targetHousehold = households[idx % 3];
      return client.rpc('submit_household_rsvp', {
        p_token: targetHousehold.rawToken,
        p_payload: {
          overallStatus: 'attending',
          additionalGuestsCount: idx % 2,
          householdNote: `Storm submission #${idx + 1}`,
          attendees: [
            {
              guestId: targetHousehold.guestId,
              attendanceStatus: 'attending',
              dietaryNotes: 'No peanuts',
            },
          ],
          answers: [
            {
              questionId: qCourse.id,
              answerText: idx % 2 === 0 ? 'Salmon' : 'Truffle Pasta',
            },
          ],
        },
      });
    }),
  ]);

  if (pubStormRes.error || rbStormRes.error) {
    throw new Error(
      `[Burst 2] Organizer storm mutation failed: ${pubStormRes.error?.message || rbStormRes.error?.message}`,
    );
  }

  const slugResults = publicAndGuestResults.slice(0, 6);
  const rsvpResults = publicAndGuestResults.slice(6);

  for (const res of slugResults) {
    if (res.error || !res.data || res.data.status !== 'published' || !res.data.snapshot) {
      throw new Error(
        `[Burst 2] Transient or failed public slug read during version swap: ${JSON.stringify(res)}`,
      );
    }
  }

  for (const res of rsvpResults) {
    if (res.error || !res.data) {
      throw new Error(`[Burst 2] Concurrent guest RSVP failed: ${res.error?.message}`);
    }
  }

  const { data: subsAfterBurst2, error: subsErr } = await orgClient
    .from('rsvp_submissions')
    .select('group_id, response_version')
    .eq('wedding_id', wedding.id);
  if (
    subsErr ||
    !subsAfterBurst2 ||
    subsAfterBurst2.length !== 3 ||
    subsAfterBurst2.some((s) => s.response_version !== 2)
  ) {
    throw new Error(
      `[Burst 2] Expected 3 household submissions each at response_version = 2, got: ${JSON.stringify(subsAfterBurst2)}`,
    );
  }

  console.log(
    'PASS [Phase 9 Burst 2]: 14 parallel organizer publish/rollback + public /w/:slug reads + 3-household /i/:token RSVPs completed with zero transient unavailable snapshots and exact response_version = 2 across all 3 households.',
  );

  // --- Burst 3: Simultaneous `issue_household_invitation` rotation x 6 on Household 1 ---
  const burst3Clients = await Promise.all(
    Array.from({ length: 6 }, () => signInFreshOrganizerSession(owner.email, owner.password)),
  );
  const targetGroupId = households[0].groupId;

  const burst3Results = await Promise.all(
    burst3Clients.map((client) =>
      client.rpc('issue_household_invitation', {
        p_workspace_id: workspace.id,
        p_wedding_id: wedding.id,
        p_group_id: targetGroupId,
      }),
    ),
  );

  const rotatedRawTokens = [];
  for (const res of burst3Results) {
    if (res.error || !res.data?.rawToken) {
      throw new Error(`[Burst 3] Parallel token rotation failed: ${res.error?.message}`);
    }
    rotatedRawTokens.push(res.data.rawToken);
  }

  const { data: invRows, error: invErr } = await orgClient
    .from('invitations')
    .select('id, status')
    .eq('group_id', targetGroupId);
  if (invErr || !invRows) {
    throw new Error(`[Burst 3] Failed querying invitations: ${invErr?.message}`);
  }

  const activeInvRows = invRows.filter((r) => r.status === 'active');
  const revokedInvRows = invRows.filter((r) => r.status === 'revoked');
  if (activeInvRows.length !== 1 || revokedInvRows.length !== 6) {
    throw new Error(
      `[Burst 3] Expected 1 active + 6 revoked rows in invitations, found active=${activeInvRows.length}, revoked=${revokedInvRows.length}.`,
    );
  }

  const probeClient = createIsolatedPublishableClient();
  const tokenResolutions = await Promise.all(
    rotatedRawTokens.map((tok) => probeClient.rpc('resolve_invitation_by_token', { p_token: tok })),
  );
  const activeTokenCount = tokenResolutions.filter((r) => r.data?.status === 'active').length;
  const unavailableTokenCount = tokenResolutions.filter(
    (r) => r.data?.status === 'unavailable',
  ).length;

  if (activeTokenCount !== 1 || unavailableTokenCount !== 5) {
    throw new Error(
      `[Burst 3] Expected 1 active + 5 unavailable tokens from rotation burst, got active=${activeTokenCount}, unavailable=${unavailableTokenCount}.`,
    );
  }

  console.log(
    'PASS [Phase 9 Burst 3]: 6 simultaneous issue_household_invitation calls serialized cleanly via FOR UPDATE (exact 1 winning active token, 5 revoked).',
  );

  // --- Burst 4: Simultaneous `reorder_wedding_sections` (x4) + valid vs. failing `import_wedding_guests` ---
  const { data: sectionRows, error: secErr } = await orgClient
    .from('wedding_sections')
    .select('id, sort_order')
    .eq('wedding_id', wedding.id)
    .order('sort_order', { ascending: true });
  if (secErr || !sectionRows || sectionRows.length !== 7) {
    throw new Error(`[Burst 4] Expected 7 starter sections, got ${sectionRows?.length}`);
  }

  const baseIds = sectionRows.map((s) => s.id);
  const permutations = [
    [...baseIds].reverse(),
    [...baseIds.slice(2), ...baseIds.slice(0, 2)],
    [...baseIds.slice(4), ...baseIds.slice(0, 4)],
    [...baseIds],
  ];

  const burst4Clients = await Promise.all(
    Array.from({ length: 6 }, () => signInFreshOrganizerSession(owner.email, owner.password)),
  );

  const [reord1, reord2, reord3, reord4, validImportRes, invalidImportRes] = await Promise.all([
    ...permutations.map((orderedIds, idx) =>
      burst4Clients[idx].rpc('reorder_wedding_sections', {
        p_workspace_id: workspace.id,
        p_wedding_id: wedding.id,
        p_ordered_section_ids: orderedIds,
      }),
    ),
    burst4Clients[4].rpc('import_wedding_guests', {
      p_workspace_id: workspace.id,
      p_wedding_id: wedding.id,
      p_households: [
        {
          displayName: 'Imported Valid Alpha',
          maxAttendees: 2,
          notes: '',
          guests: [{ firstName: 'Nora', lastName: 'Lim', side: 'mutual', isChild: false }],
        },
        {
          displayName: 'Imported Valid Beta',
          maxAttendees: 3,
          notes: '',
          guests: [{ firstName: 'Leo', lastName: 'Tan', side: 'partner_one', isChild: false }],
        },
      ],
    }),
    burst4Clients[5].rpc('import_wedding_guests', {
      p_workspace_id: workspace.id,
      p_wedding_id: wedding.id,
      p_households: [
        {
          displayName: 'Should Roll Back Atomic',
          maxAttendees: 2,
          notes: '',
          guests: [{ firstName: 'Ghost', lastName: 'Row', side: 'other', isChild: false }],
        },
        {
          displayName: 'Broken Second Household',
          maxAttendees: 0,
          notes: '',
          guests: [{ firstName: '', lastName: 'Invalid' }],
        },
      ],
    }),
  ]);

  for (const r of [reord1, reord2, reord3, reord4]) {
    if (r.error) {
      throw new Error(`[Burst 4] Concurrent reorder_wedding_sections failed: ${r.error.message}`);
    }
  }
  if (validImportRes.error) {
    throw new Error(
      `[Burst 4] Valid import_wedding_guests failed: ${validImportRes.error.message}`,
    );
  }
  if (!invalidImportRes.error) {
    throw new Error('[Burst 4] Invalid import_wedding_guests batch unexpectedly succeeded!');
  }

  const { data: finalSections } = await orgClient
    .from('wedding_sections')
    .select('sort_order')
    .eq('wedding_id', wedding.id)
    .order('sort_order', { ascending: true });
  const finalOrders = finalSections?.map((s) => s.sort_order) ?? [];

  const { data: finalGroups } = await orgClient
    .from('guest_groups')
    .select('display_name')
    .eq('wedding_id', wedding.id);
  const groupNames = new Set((finalGroups ?? []).map((g) => g.display_name));

  if (
    JSON.stringify(finalOrders) !== JSON.stringify([0, 1, 2, 3, 4, 5, 6]) ||
    !groupNames.has('Imported Valid Alpha') ||
    !groupNames.has('Imported Valid Beta') ||
    groupNames.has('Should Roll Back Atomic')
  ) {
    throw new Error(
      `[Burst 4] Post-burst invariant mismatch: sortOrders=${JSON.stringify(finalOrders)}, groups=${JSON.stringify([...groupNames])}`,
    );
  }

  console.log(
    'PASS [Phase 9 Burst 4]: 4 concurrent section reorders + valid/failing multi-household CSV imports completed cleanly (sort_order 0..6 intact, 100% atomic rollback on failing batch).',
  );

  console.log('ALL EXECUTED PHASE 9 CROSS-SUBSYSTEM CONCURRENCY VERIFICATIONS PASSED.');
} finally {
  await cleanup();
}
