import { createClient } from '@supabase/supabase-js';

/**
 * Phase 1 Live Multi-Connection Concurrency Verification Harness (P1-AC03, P1-AC11, P1-AC12)
 *
 * Uses independent Supabase HTTP clients (each executing in a separate PostgreSQL
 * backend transaction via Supavisor) to test genuine concurrent race conditions:
 *   1. Parallel auto-generated slug collisions (`create_workspace` x 6 simultaneous calls).
 *   2. Parallel dual-owner demotion + self-removal (`update_workspace_member_role` vs
 *      `remove_workspace_member` across 5 rounds) verifying parent-workspace
 *      `SELECT ... FOR UPDATE` serialization and `owner_count >= 1`.
 *   3. Optional parallel account-deletion vs owner-insertion race when `SUPABASE_SECRET_KEY`
 *      is supplied in non-bundled process memory (or paired with concurrent SQL delete).
 *
 * Supports two provisioning modes so server secrets never need to enter `.env`:
 *   - Mode A (Zero-Secret Publishable Key Mode):
 *       Provide `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
 *       `P1_TEST_OWNER_A_EMAIL`, `P1_TEST_OWNER_A_PASSWORD`,
 *       `P1_TEST_OWNER_B_EMAIL`, `P1_TEST_OWNER_B_PASSWORD`.
 *   - Mode B (Admin Ephemeral Provisioning Mode):
 *       Provide `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`.
 */

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const adminSecretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !publishableKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.');
  process.exit(1);
}

const adminClient = adminSecretKey
  ? createClient(supabaseUrl, adminSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

const createdAdminUserIds = new Set();
const trackedWorkspaces = [];
const runTag = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function createIsolatedPublishableClient() {
  return createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function signInExistingOrganizer(email, password, label) {
  const client = createIsolatedPublishableClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`Failed signing in ${label} (${email}): ${error?.message ?? 'no user'}`);
  }
  return {
    userId: data.user.id,
    email: email.trim().toLowerCase(),
    client,
  };
}

async function createConfirmedOrganizerViaAdmin(label) {
  if (!adminClient) {
    throw new Error('Admin client is not configured.');
  }
  const email = `p1.conc.${label}.${runTag}@example.com`;
  const password = `ConcTest!${runTag}#Aa1`;

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Concurrency ${label}` },
  });

  if (createErr || !created.user) {
    throw new Error(`Failed creating test user ${label}: ${createErr?.message ?? 'unknown'}`);
  }

  createdAdminUserIds.add(created.user.id);
  return signInExistingOrganizer(email, password, label);
}

async function resolveActors() {
  const emailA = process.env.P1_TEST_OWNER_A_EMAIL;
  const passA = process.env.P1_TEST_OWNER_A_PASSWORD;
  const emailB = process.env.P1_TEST_OWNER_B_EMAIL;
  const passB = process.env.P1_TEST_OWNER_B_PASSWORD;

  if (emailA && passA && emailB && passB) {
    const [ownerA, ownerB] = await Promise.all([
      signInExistingOrganizer(emailA, passA, 'owner-a'),
      signInExistingOrganizer(emailB, passB, 'owner-b'),
    ]);
    return { ownerA, ownerB };
  }

  if (adminClient) {
    const ownerA = await createConfirmedOrganizerViaAdmin('owner-a');
    const ownerB = await createConfirmedOrganizerViaAdmin('owner-b');
    return { ownerA, ownerB };
  }

  throw new Error(
    'Provide either P1_TEST_OWNER_A_*/P1_TEST_OWNER_B_* credentials (zero-secret mode) or SUPABASE_SECRET_KEY.',
  );
}

async function verifySurvivingOwnerAndRecordCleanup(workspaceId, ownerA, ownerB, contextLabel) {
  for (const candidate of [ownerA, ownerB]) {
    const { data: members, error } = await candidate.client.rpc('list_workspace_members', {
      p_workspace_id: workspaceId,
    });
    if (!error && Array.isArray(members)) {
      const owners = members.filter((m) => m.role === 'owner');
      if (owners.length < 1) {
        throw new Error(
          `INVARIANT_VIOLATED [${contextLabel}]: Workspace ${workspaceId} has 0 owners!`,
        );
      }
      trackedWorkspaces.push({ workspaceId, ownerClient: candidate.client });
      return owners.length;
    }
  }

  throw new Error(
    `INVARIANT_VIOLATED [${contextLabel}]: Neither Owner A nor Owner B retained access to workspace ${workspaceId}!`,
  );
}

async function runParallelSlugCollisionBurst(ownerA) {
  const burstSize = 6;
  const sharedName = `Concurrent Studio ${runTag}`;

  // Each client has an independent HTTP request pipeline into Supavisor / PostgreSQL
  const results = await Promise.all(
    Array.from({ length: burstSize }, () =>
      ownerA.client.rpc('create_workspace', {
        p_name: sharedName,
        p_slug: null,
      }),
    ),
  );

  const slugs = new Set();
  for (const res of results) {
    if (res.error || !res.data) {
      throw new Error(
        `[P1-AC03] Parallel create_workspace failed: ${res.error?.message ?? 'no data'}`,
      );
    }
    trackedWorkspaces.push({ workspaceId: res.data.id, ownerClient: ownerA.client });
    slugs.add(res.data.slug);
  }

  if (slugs.size !== burstSize) {
    throw new Error(`[P1-AC03] Expected ${burstSize} distinct slugs, got ${slugs.size}`);
  }

  console.log(
    `PASS [P1-AC03]: ${burstSize} simultaneous create_workspace calls produced unique slugs: ${[...slugs].join(', ')}`,
  );
}

async function runDualOwnerDemoteRemoveRace(ownerA, ownerB) {
  const rounds = 5;

  for (let round = 1; round <= rounds; round += 1) {
    const { data: ws, error: createErr } = await ownerA.client.rpc('create_workspace', {
      p_name: `Dual Owner Race ${round} ${runTag}`,
      p_slug: null,
    });
    if (createErr || !ws) {
      throw new Error(`Failed creating race workspace: ${createErr?.message ?? 'no data'}`);
    }

    const { error: addErr } = await ownerA.client.rpc('add_workspace_member_by_email', {
      p_workspace_id: ws.id,
      p_email: ownerB.email,
      p_role: 'owner',
    });
    if (addErr) {
      trackedWorkspaces.push({ workspaceId: ws.id, ownerClient: ownerA.client });
      throw new Error(`Failed adding second owner: ${addErr.message}`);
    }

    // Fire simultaneous competing owner-loss mutations across two independent sessions:
    //   Session A: Owner A demotes self to `admin`
    //   Session B: Owner B removes self from workspace
    const [demoteRes, removeRes] = await Promise.all([
      ownerA.client.rpc('update_workspace_member_role', {
        p_workspace_id: ws.id,
        p_member_user_id: ownerA.userId,
        p_new_role: 'admin',
      }),
      ownerB.client.rpc('remove_workspace_member', {
        p_workspace_id: ws.id,
        p_member_user_id: ownerB.userId,
      }),
    ]);

    const successes = [demoteRes, removeRes].filter((r) => !r.error).length;
    const failures = [demoteRes, removeRes].filter((r) => Boolean(r.error));

    if (successes !== 1 || failures.length !== 1) {
      await verifySurvivingOwnerAndRecordCleanup(ws.id, ownerA, ownerB, `Round-${round}`);
      throw new Error(
        `[P1-AC12] Round ${round}: Expected 1 success & 1 serialized rejection, got ${successes} successes.`,
      );
    }

    const errMsg = failures[0].error.message;
    if (!errMsg.includes('LAST_WORKSPACE_OWNER_REQUIRED')) {
      await verifySurvivingOwnerAndRecordCleanup(ws.id, ownerA, ownerB, `Round-${round}`);
      throw new Error(
        `[P1-AC12] Round ${round}: Expected LAST_WORKSPACE_OWNER_REQUIRED, got: ${errMsg}`,
      );
    }

    const ownerCount = await verifySurvivingOwnerAndRecordCleanup(
      ws.id,
      ownerA,
      ownerB,
      `DualOwnerRace-Round-${round}`,
    );
    if (ownerCount !== 1) {
      throw new Error(`[P1-AC12] Round ${round}: Expected 1 remaining owner, found ${ownerCount}`);
    }
  }

  console.log(
    `PASS [P1-AC12]: ${rounds}/${rounds} simultaneous dual-owner demote+remove races serialized cleanly via parent workspace FOR UPDATE lock.`,
  );
}

async function runAdminAccountDeleteRaceIfConfigured(ownerA) {
  if (!adminClient) {
    console.log(
      'INFO [P1-AC11]: Admin secret key not set in env (zero-secret mode); run SQL/admin parallel delete check separately in TG1-E.',
    );
    return;
  }

  const rounds = 4;
  for (let round = 1; round <= rounds; round += 1) {
    const ephemeralUser = await createConfirmedOrganizerViaAdmin(`delrace-${round}`);

    const { data: ws, error: wsErr } = await ownerA.client.rpc('create_workspace', {
      p_name: `Delete Race ${round} ${runTag}`,
      p_slug: null,
    });
    if (wsErr || !ws) {
      throw new Error(`Failed creating delete-race workspace: ${wsErr?.message ?? 'no data'}`);
    }

    const addAndDemoteFlow = (async () => {
      const addRes = await ownerA.client.rpc('add_workspace_member_by_email', {
        p_workspace_id: ws.id,
        p_email: ephemeralUser.email,
        p_role: 'owner',
      });
      if (!addRes.error) {
        await ownerA.client.rpc('update_workspace_member_role', {
          p_workspace_id: ws.id,
          p_member_user_id: ownerA.userId,
          p_new_role: 'admin',
        });
      }
      return addRes;
    })();

    const [, deleteRes] = await Promise.all([
      addAndDemoteFlow,
      adminClient.auth.admin.deleteUser(ephemeralUser.userId),
    ]);

    if (!deleteRes.error) {
      createdAdminUserIds.delete(ephemeralUser.userId);
    }

    const { data: owners, error: ownerCheckErr } = await adminClient
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', ws.id)
      .eq('role', 'owner');

    if (ownerCheckErr || !owners || owners.length < 1) {
      throw new Error(
        `INVARIANT_VIOLATED [P1-AC11/AC12]: Workspace ${ws.id} left with 0 owners during concurrent account deletion!`,
      );
    }

    await adminClient.from('workspaces').delete().eq('id', ws.id);
  }

  console.log(
    `PASS [P1-AC11 / P1-AC12]: ${rounds}/${rounds} concurrent account-deletion vs owner-insertion/demotion races preserved >= 1 owner.`,
  );
}

async function cleanup() {
  for (const item of trackedWorkspaces.reverse()) {
    await item.ownerClient.from('workspaces').delete().eq('id', item.workspaceId);
  }
  if (adminClient) {
    for (const userId of createdAdminUserIds) {
      await adminClient.auth.admin.deleteUser(userId);
    }
  }
}

try {
  const { ownerA, ownerB } = await resolveActors();
  await runParallelSlugCollisionBurst(ownerA);
  await runDualOwnerDemoteRemoveRace(ownerA, ownerB);
  await runAdminAccountDeleteRaceIfConfigured(ownerA);
  console.log('ALL EXECUTED PHASE 1 CONCURRENCY VERIFICATIONS PASSED.');
} finally {
  await cleanup();
}
