import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { exportRemoteLogicalBackup } from './export-remote-backup.mjs';

/**
 * Phase 10 Gate 6 Verification Harness (`npm run test:ops:phase10:backup`):
 *   1. Exports zero-Docker logical snapshots for both `wedding-platform-dev` (`tfwmbpvbfavugvokdych`)
 *      and `wedding-platform-prod` (`ftmwcmsrfcgzmrowjudb`) into temporary folders, validating
 *      SHA-256 checksums, 15/15 public tables, 12/12 migrations, and 0 `token_hash` fields.
 *   2. Executes the self-contained `BEGIN ... ROLLBACK` relational disaster-recovery drill
 *      (`supabase/tests/phase10_disaster_recovery_drill.sql`) on both Dev and Production DBs.
 *   3. Verifies live anonymous `@supabase/supabase-js` connectivity against `wedding-platform-prod`
 *      using the Production publishable key (`health_check`, `get_public_wedding_by_slug`,
 *      `resolve_invitation_by_token`) and confirms `0` `@example.com` test accounts exist in Prod.
 */

const DEV_PROJECT_REF = 'tfwmbpvbfavugvokdych';
const PROD_PROJECT_REF = 'ftmwcmsrfcgzmrowjudb';
const EXPECTED_PROD_SUPABASE_URL = `https://${PROD_PROJECT_REF}.supabase.co`;
const EXPECTED_MIGRATION_COUNT = 12;
const EXPECTED_LATEST_MIGRATION = '20261120012113';

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function resolveProductionFrontendEnvFromVercel(tempDir) {
  if (process.env.PROD_SUPABASE_URL && process.env.PROD_SUPABASE_PUBLISHABLE_KEY) {
    return {
      supabaseUrl: process.env.PROD_SUPABASE_URL.trim(),
      publishableKey: process.env.PROD_SUPABASE_PUBLISHABLE_KEY.trim(),
    };
  }

  const tempEnvPath = path.join(tempDir, 'vercel-prod-verify.env');
  const pullResult = spawnSync(
    npxCmd,
    ['vercel', 'env', 'pull', tempEnvPath, '--environment=production', '--yes'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  );

  if (pullResult.status !== 0 || !fs.existsSync(tempEnvPath)) {
    throw new Error(
      `Failed to pull Vercel Production env for verification:\n${pullResult.stdout}\n${pullResult.stderr}`,
    );
  }

  try {
    const rawEnv = fs.readFileSync(tempEnvPath, 'utf8');
    const parsed = {};
    for (const line of rawEnv.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
      if (match) {
        parsed[match[1]] = match[2];
      }
    }

    if (parsed.VITE_APP_ENV !== 'production') {
      throw new Error(
        `Expected Vercel Production VITE_APP_ENV=production, got ${parsed.VITE_APP_ENV}`,
      );
    }
    if (parsed.VITE_SUPABASE_URL !== EXPECTED_PROD_SUPABASE_URL) {
      throw new Error(
        `Expected Vercel Production VITE_SUPABASE_URL=${EXPECTED_PROD_SUPABASE_URL}, got ${parsed.VITE_SUPABASE_URL}`,
      );
    }
    if (!parsed.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) {
      throw new Error('Vercel Production VITE_SUPABASE_PUBLISHABLE_KEY is missing or malformed.');
    }

    return {
      supabaseUrl: parsed.VITE_SUPABASE_URL,
      publishableKey: parsed.VITE_SUPABASE_PUBLISHABLE_KEY,
    };
  } finally {
    if (fs.existsSync(tempEnvPath)) {
      fs.unlinkSync(tempEnvPath);
    }
  }
}

function parseJsonEnvelope(stdoutText) {
  const firstBrace = stdoutText.indexOf('{');
  const lastBrace = stdoutText.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(`Unexpected CLI JSON output:\n${stdoutText}`);
  }
  return JSON.parse(stdoutText.slice(firstBrace, lastBrace + 1));
}

function runSupabaseQueryArgs(remoteRef, extraArgs, stdinSql) {
  const result = spawnSync(
    npxCmd,
    ['supabase', 'db', 'query', `--remote=${remoteRef}`, '--yes', '--output=json', ...extraArgs],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      input: stdinSql,
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === 'win32',
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `supabase db query failed on ${remoteRef} (${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  }
  return parseJsonEnvelope(result.stdout ?? '');
}

function verifyExportedArtifact(exportResult, expectedRef, expectedLabel) {
  const snapshotRaw = fs.readFileSync(exportResult.snapshotPath, 'utf8');
  const manifestRaw = fs.readFileSync(exportResult.manifestPath, 'utf8');
  const snapshot = JSON.parse(snapshotRaw);
  const manifest = JSON.parse(manifestRaw);

  const computedDigest = crypto.createHash('sha256').update(snapshotRaw, 'utf8').digest('hex');
  if (computedDigest !== manifest.snapshotSha256) {
    throw new Error(
      `Manifest SHA-256 mismatch for ${expectedRef}: expected ${manifest.snapshotSha256}, computed ${computedDigest}`,
    );
  }

  if (manifest.projectRef !== expectedRef || manifest.environmentLabel !== expectedLabel) {
    throw new Error(`Unexpected manifest metadata for ${expectedRef}.`);
  }

  if (
    manifest.migrationCount !== EXPECTED_MIGRATION_COUNT ||
    manifest.latestMigration !== EXPECTED_LATEST_MIGRATION
  ) {
    throw new Error(
      `Migration parity failure on ${expectedRef}: count=${manifest.migrationCount}, latest=${manifest.latestMigration}`,
    );
  }

  if (!Array.isArray(manifest.tableOrder) || manifest.tableOrder.length !== 15) {
    throw new Error(`Expected 15 public tables in manifest for ${expectedRef}.`);
  }

  if (snapshotRaw.includes('"token_hash"')) {
    throw new Error(`Security failure: snapshot.json for ${expectedRef} contains token_hash.`);
  }

  for (const tableName of manifest.tableOrder) {
    if (!Array.isArray(snapshot.tables[tableName])) {
      throw new Error(`Missing table array ${tableName} in snapshot for ${expectedRef}.`);
    }
  }

  return manifest;
}

async function verifyProductionLiveClientAndCleanState(tempDir) {
  const { supabaseUrl, publishableKey } = resolveProductionFrontendEnvFromVercel(tempDir);
  const prodClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: healthData, error: healthError } = await prodClient.rpc('health_check');
  if (healthError || !healthData || healthData.status !== 'ok') {
    throw new Error(
      `Production health_check RPC failed: ${healthError?.message ?? JSON.stringify(healthData)}`,
    );
  }

  const { data: slugData, error: slugError } = await prodClient.rpc('get_public_wedding_by_slug', {
    p_slug: 'non-existent-phase10-launch-probe',
  });
  if (slugError || !slugData || slugData.status !== 'unavailable') {
    throw new Error(
      `Production get_public_wedding_by_slug probe failed: ${slugError?.message ?? JSON.stringify(slugData)}`,
    );
  }

  const { data: inviteData, error: inviteError } = await prodClient.rpc(
    'resolve_invitation_by_token',
    {
      p_token: 'launch-probe-1111111111111111111111111111',
    },
  );
  if (inviteError || !inviteData || inviteData.status !== 'unavailable') {
    throw new Error(
      `Production resolve_invitation_by_token probe failed: ${inviteError?.message ?? JSON.stringify(inviteData)}`,
    );
  }

  const cleanCheck = runSupabaseQueryArgs(
    PROD_PROJECT_REF,
    [],
    "SELECT count(*)::int AS ephemeral_users FROM auth.users WHERE email LIKE '%@example.com';",
  );
  const ephemeralUsers = cleanCheck.rows?.[0]?.ephemeral_users ?? -1;
  if (ephemeralUsers !== 0) {
    throw new Error(
      `Expected 0 @example.com ephemeral accounts on wedding-platform-prod, found ${ephemeralUsers}`,
    );
  }

  return {
    healthStatus: healthData.status,
    publicSlugProbe: slugData.status,
    invitationProbe: inviteData.status,
    productionEphemeralUsers: ephemeralUsers,
  };
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wedding-platform-p10-backup-'));

  try {
    console.log('1/3 Exporting & verifying zero-Docker logical snapshots (Dev + Prod)...');
    const devExport = exportRemoteLogicalBackup({
      remoteRef: DEV_PROJECT_REF,
      environmentLabel: 'development',
      baseOutDir: tempRoot,
    });
    const devManifest = verifyExportedArtifact(devExport, DEV_PROJECT_REF, 'development');

    const prodExport = exportRemoteLogicalBackup({
      remoteRef: PROD_PROJECT_REF,
      environmentLabel: 'production',
      baseOutDir: tempRoot,
    });
    const prodManifest = verifyExportedArtifact(prodExport, PROD_PROJECT_REF, 'production');

    console.log(
      '2/3 Running transactional BEGIN...ROLLBACK disaster-recovery drill (Dev + Prod)...',
    );
    const devDr = runSupabaseQueryArgs(DEV_PROJECT_REF, [
      '-f',
      'supabase/tests/phase10_disaster_recovery_drill.sql',
    ]);
    const devDrStatus = devDr.rows?.[0]?.dr_verification_result?.status;
    if (devDrStatus !== 'ALL_PHASE10_DISASTER_RECOVERY_VERIFICATIONS_PASSED') {
      throw new Error(`Dev DR drill failed: ${JSON.stringify(devDr)}`);
    }

    const prodDr = runSupabaseQueryArgs(PROD_PROJECT_REF, [
      '-f',
      'supabase/tests/phase10_disaster_recovery_drill.sql',
    ]);
    const prodDrStatus = prodDr.rows?.[0]?.dr_verification_result?.status;
    if (prodDrStatus !== 'ALL_PHASE10_DISASTER_RECOVERY_VERIFICATIONS_PASSED') {
      throw new Error(`Prod DR drill failed: ${JSON.stringify(prodDr)}`);
    }

    console.log(
      '3/3 Verifying live Vercel Production env isolation, Production RPCs & clean Auth state...',
    );
    const prodReadiness = await verifyProductionLiveClientAndCleanState(tempRoot);

    console.log(
      JSON.stringify(
        {
          status: 'ALL_PHASE10_BACKUP_DR_AND_PROD_READINESS_CHECKS_PASSED',
          devBackupSummary: {
            projectRef: devManifest.projectRef,
            migrationCount: devManifest.migrationCount,
            totalRows: devManifest.totalRows,
            snapshotSha256: devManifest.snapshotSha256,
          },
          prodBackupSummary: {
            projectRef: prodManifest.projectRef,
            migrationCount: prodManifest.migrationCount,
            totalRows: prodManifest.totalRows,
            snapshotSha256: prodManifest.snapshotSha256,
          },
          disasterRecoveryDrill: {
            dev: devDrStatus,
            production: prodDrStatus,
            restoredCounts: prodDr.rows[0].dr_verification_result.restored_counts,
            restoredMetrics: prodDr.rows[0].dr_verification_result.restored_metrics,
          },
          productionReadiness: prodReadiness,
        },
        null,
        2,
      ),
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
