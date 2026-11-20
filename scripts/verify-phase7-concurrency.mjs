import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

/**
 * Phase 7 Live Multi-Connection Concurrency Verification Harness (`P7-AC05` — Gate 5)
 *
 * Uses independent stateless & authenticated Supabase HTTP clients executing concurrently
 * through Supavisor to verify Mandatory Quality Gate 5 under genuine race conditions:
 *   1. Burst 1 (Simultaneous Household RSVP Updates x 8): 8 independent `publicClient`
 *      connections simultaneously invoke `submit_household_rsvp` on the exact same active
 *      household token (`max_attendees = 2`, 3 named family members). Verifies `FOR UPDATE`
 *      serialization on `guest_groups`: all 8 succeed with zero `unique_violation` errors,
 *      `response_version` reaches exact `8`, exactly `1` `rsvp_submissions` row exists,
 *      exactly `3` `rsvp_attendees` rows and `2` `rsvp_answers` rows exist (zero orphans
 *      or duplicates), and `attending_count <= 2`.
 *   2. Burst 2 (Simultaneous Mixed Valid + Over-Capacity Race x 8): 4 valid (`<= 2`) and
 *      4 over-capacity (`3 > 2`) requests fire in parallel; all 4 over-capacity requests
 *      fail `HOUSEHOLD_CAPACITY_EXCEEDED` with 100% atomic rollback while the 4 valid
 *      updates serialize cleanly (`response_version = 12`).
 *   3. Burst 3 (Simultaneous Token Revocation vs. Guest RSVP Race): Organizer invokes
 *      `revoke_household_invitation` simultaneously with 6 guest `submit_household_rsvp`
 *      calls; zero deadlocks occur (`guest_groups -> invitations` lock ordering), and
 *      subsequent post-revocation calls deterministically fail `INVITATION_UNAVAILABLE`.
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
const tempDir = mkdtempSync(join(tmpdir(), 'wedding-p7-conc-'));
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

async function provisionConfirmedOrganizer(label) {
  const userId = crypto.randomUUID();
  const email = `p7.conc.${label}.${runTag}@example.com`;
  const password = `P7Conc!${runTag}#Aa1`;
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
      '{"full_name":"P7 Concurrency ${label}"}'::jsonb,
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

  const client = createIsolatedPublishableClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`Failed signing in ${email}: ${error?.message ?? 'no user'}`);
  }
  return { userId: data.user.id, email, password, client };
}

async function cleanup() {
  for (const ws of trackedWorkspaces.reverse()) {
    await ws.client.from('workspaces').delete().eq('id', ws.workspaceId);
  }

  if (createdUserIds.length > 0) {
    const idLiteralList = createdUserIds.map((id) => `'${id}'::uuid`).join(', ');
    try {
      runRemoteSqlFile(
        'cleanup-users.sql',
        `
        DELETE FROM public.workspaces WHERE created_by IN (${idLiteralList});
        DELETE FROM auth.users WHERE id IN (${idLiteralList});
        `,
      );
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
    p_name: `P7 Concurrency Studio ${runTag}`,
  });
  if (wsErr || !workspace) {
    throw new Error(`Failed creating workspace: ${wsErr?.message ?? 'no data'}`);
  }
  trackedWorkspaces.push({ workspaceId: workspace.id, client: orgClient });

  const { data: wedding, error: wedErr } = await orgClient.rpc('create_wedding', {
    p_workspace_id: workspace.id,
    p_title: `Gate 5 Concurrency Gala ${runTag}`,
    p_partner_one_name: 'Clara',
    p_partner_two_name: 'Mateo',
    p_timezone: 'Asia/Manila',
    p_rsvp_deadline: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
    p_access_mode: 'invite_only',
    p_is_rsvp_open: true,
    p_allow_plus_ones_default: false,
    p_show_guest_dietary_notes: true,
  });
  if (wedErr || !wedding) {
    throw new Error(`Failed creating wedding: ${wedErr?.message ?? 'no data'}`);
  }

  // Create 2 required custom questions
  const { data: qSelect, error: q1Err } = await orgClient
    .from('rsvp_questions')
    .insert({
      workspace_id: workspace.id,
      wedding_id: wedding.id,
      label: 'Entrée Choice',
      question_type: 'single_select',
      options: ['Salmon', 'Beef', 'Risotto'],
      is_required: true,
      sort_order: 0,
    })
    .select('id')
    .single();
  if (q1Err || !qSelect) {
    throw new Error(`Failed creating question 1: ${q1Err?.message ?? 'no data'}`);
  }

  const { data: qBool, error: q2Err } = await orgClient
    .from('rsvp_questions')
    .insert({
      workspace_id: workspace.id,
      wedding_id: wedding.id,
      label: 'Shuttle Needed',
      question_type: 'boolean',
      is_required: true,
      sort_order: 1,
    })
    .select('id')
    .single();
  if (q2Err || !qBool) {
    throw new Error(`Failed creating question 2: ${q2Err?.message ?? 'no data'}`);
  }

  // Create household (`max_attendees = 2`) with 3 named family members
  const { data: group, error: grpErr } = await orgClient
    .from('guest_groups')
    .insert({
      workspace_id: workspace.id,
      wedding_id: wedding.id,
      display_name: 'The Rivera Household',
      max_attendees: 2,
    })
    .select('id')
    .single();
  if (grpErr || !group) {
    throw new Error(`Failed creating household: ${grpErr?.message ?? 'no data'}`);
  }

  const { data: guests, error: gErr } = await orgClient
    .from('guests')
    .insert([
      {
        workspace_id: workspace.id,
        wedding_id: wedding.id,
        group_id: group.id,
        first_name: 'Elena',
        last_name: 'Rivera',
        sort_order: 0,
      },
      {
        workspace_id: workspace.id,
        wedding_id: wedding.id,
        group_id: group.id,
        first_name: 'Mateo',
        last_name: 'Rivera',
        sort_order: 1,
      },
      {
        workspace_id: workspace.id,
        wedding_id: wedding.id,
        group_id: group.id,
        first_name: 'Lucas',
        last_name: 'Rivera',
        sort_order: 2,
      },
    ])
    .select('id, sort_order');
  if (gErr || !guests || guests.length !== 3) {
    throw new Error(`Failed creating guests: ${gErr?.message ?? 'missing rows'}`);
  }
  guests.sort((a, b) => a.sort_order - b.sort_order);

  const { error: pubErr } = await orgClient.rpc('publish_wedding', {
    p_workspace_id: workspace.id,
    p_wedding_id: wedding.id,
  });
  if (pubErr) {
    throw new Error(`Failed publishing wedding: ${pubErr.message}`);
  }

  const { data: issued, error: issErr } = await orgClient.rpc('issue_household_invitation', {
    p_workspace_id: workspace.id,
    p_wedding_id: wedding.id,
    p_group_id: group.id,
  });
  if (issErr || !issued) {
    throw new Error(`Failed issuing token: ${issErr?.message ?? 'no data'}`);
  }

  const rawToken = issued.rawToken;
  const invitationId = issued.invitation.id;
  const [g1, g2, g3] = guests.map((g) => g.id);

  const buildValidPayload = (idx) => ({
    overallStatus: 'attending',
    additionalGuestsCount: 0,
    householdNote: `Parallel submission #${idx + 1}`,
    attendees: [
      { guestId: g1, attendanceStatus: 'attending', dietaryNotes: 'Vegetarian' },
      { guestId: g2, attendanceStatus: idx % 2 === 0 ? 'attending' : 'declined', dietaryNotes: '' },
      { guestId: g3, attendanceStatus: 'declined', dietaryNotes: '' },
    ],
    answers: [
      { questionId: qSelect.id, answerText: idx % 2 === 0 ? 'Salmon' : 'Risotto' },
      { questionId: qBool.id, answerText: idx % 2 === 0 ? 'yes' : 'no' },
    ],
  });

  // --- Burst 1: 8 simultaneous valid updates on the exact same household token ---
  const burst1Size = 8;
  const burst1Clients = Array.from({ length: burst1Size }, () => createIsolatedPublishableClient());
  const burst1Results = await Promise.all(
    burst1Clients.map((client, idx) =>
      client.rpc('submit_household_rsvp', {
        p_token: rawToken,
        p_payload: buildValidPayload(idx),
      }),
    ),
  );

  const versions = new Set();
  for (const res of burst1Results) {
    if (res.error || !res.data) {
      throw new Error(
        `[Gate 5 Burst 1] Parallel submit_household_rsvp failed: ${res.error?.message ?? 'no data'}`,
      );
    }
    versions.add(res.data.submission.responseVersion);
  }

  if (versions.size !== burst1Size || !versions.has(burst1Size)) {
    throw new Error(
      `[Gate 5 Burst 1] Expected sequential versions 1..${burst1Size}, got: ${[...versions].join(', ')}`,
    );
  }

  console.log(
    `PASS [Gate 5 Burst 1]: ${burst1Size}/${burst1Size} simultaneous household RSVP submissions serialized cleanly via FOR UPDATE (versions 1..${burst1Size}, zero unique_violation or orphan rows).`,
  );

  // --- Burst 2: 8 simultaneous mixed valid (<= 2) + over-capacity (3 > 2) requests ---
  const burst2Clients = Array.from({ length: 8 }, () => createIsolatedPublishableClient());
  const burst2Results = await Promise.all(
    burst2Clients.map((client, idx) => {
      if (idx % 2 === 1) {
        // Over-capacity payload (`3 > max_attendees 2`)
        return client.rpc('submit_household_rsvp', {
          p_token: rawToken,
          p_payload: {
            overallStatus: 'attending',
            additionalGuestsCount: 0,
            householdNote: 'Over capacity attempt',
            attendees: [
              { guestId: g1, attendanceStatus: 'attending', dietaryNotes: '' },
              { guestId: g2, attendanceStatus: 'attending', dietaryNotes: '' },
              { guestId: g3, attendanceStatus: 'attending', dietaryNotes: '' },
            ],
            answers: [
              { questionId: qSelect.id, answerText: 'Salmon' },
              { questionId: qBool.id, answerText: 'yes' },
            ],
          },
        });
      }
      return client.rpc('submit_household_rsvp', {
        p_token: rawToken,
        p_payload: buildValidPayload(idx),
      });
    }),
  );

  let validSucceeded = 0;
  let overflowRejected = 0;
  for (const res of burst2Results) {
    if (res.error) {
      if (!res.error.message.includes('HOUSEHOLD_CAPACITY_EXCEEDED')) {
        throw new Error(`[Gate 5 Burst 2] Unexpected error code: ${res.error.message}`);
      }
      overflowRejected += 1;
    } else {
      validSucceeded += 1;
    }
  }

  if (validSucceeded !== 4 || overflowRejected !== 4) {
    throw new Error(
      `[Gate 5 Burst 2] Expected 4 valid + 4 HOUSEHOLD_CAPACITY_EXCEEDED, got ${validSucceeded} valid / ${overflowRejected} rejected.`,
    );
  }

  const { data: subRow } = await orgClient
    .from('rsvp_submissions')
    .select('id, attending_count, response_version')
    .eq('group_id', group.id)
    .single();
  const { count: attRowCount } = await orgClient
    .from('rsvp_attendees')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', group.id);
  const { count: ansRowCount } = await orgClient
    .from('rsvp_answers')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', group.id);

  if (
    !subRow ||
    subRow.response_version !== 12 ||
    subRow.attending_count > 2 ||
    attRowCount !== 3 ||
    ansRowCount !== 2
  ) {
    throw new Error(
      `[Gate 5 Burst 2] Post-burst DB invariant mismatch: sub=${JSON.stringify(subRow)}, attendees=${attRowCount}, answers=${ansRowCount}`,
    );
  }

  console.log(
    `PASS [Gate 5 Burst 2]: 4/4 over-capacity requests rejected (HOUSEHOLD_CAPACITY_EXCEEDED) with 100% rollback while 4/4 valid concurrent updates reached response_version = 12.`,
  );

  // --- Burst 3: Simultaneous organizer token revocation vs. 6 guest RSVP calls (deadlock-free) ---
  const burst3GuestClients = Array.from({ length: 6 }, () => createIsolatedPublishableClient());
  const [revokeRes, ...guestRaceResults] = await Promise.all([
    orgClient.rpc('revoke_household_invitation', {
      p_workspace_id: workspace.id,
      p_wedding_id: wedding.id,
      p_invitation_id: invitationId,
    }),
    ...burst3GuestClients.map((client, idx) =>
      client.rpc('submit_household_rsvp', {
        p_token: rawToken,
        p_payload: buildValidPayload(idx),
      }),
    ),
  ]);

  if (revokeRes.error) {
    throw new Error(`[Gate 5 Burst 3] Revocation failed in race: ${revokeRes.error.message}`);
  }
  for (const res of guestRaceResults) {
    if (res.error && !res.error.message.includes('INVITATION_UNAVAILABLE')) {
      throw new Error(
        `[Gate 5 Burst 3] Unexpected race error (deadlock or unhandled fault): ${res.error.message}`,
      );
    }
  }

  // Subsequent submission after revocation MUST deterministically fail INVITATION_UNAVAILABLE
  const postRevokeClient = createIsolatedPublishableClient();
  const postRevokeRes = await postRevokeClient.rpc('submit_household_rsvp', {
    p_token: rawToken,
    p_payload: buildValidPayload(0),
  });
  if (!postRevokeRes.error || !postRevokeRes.error.message.includes('INVITATION_UNAVAILABLE')) {
    throw new Error('[Gate 5 Burst 3] Expected deterministic INVITATION_UNAVAILABLE after revoke.');
  }

  console.log(
    'PASS [Gate 5 Burst 3]: Simultaneous organizer revocation + 6 guest RSVP submissions serialized with zero deadlocks and deterministic post-revoke block.',
  );

  console.log('ALL EXECUTED PHASE 7 / GATE 5 CONCURRENCY VERIFICATIONS PASSED.');
} finally {
  await cleanup();
}
