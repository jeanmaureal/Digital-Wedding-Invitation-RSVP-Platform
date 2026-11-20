import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Zero-Docker logical backup exporter (`npm run db:backup` / `npm run db:backup:prod`).
 *
 * Uses `npx supabase db query --remote=<ref> --output=json` to capture a deterministic,
 * FK-topologically ordered JSON snapshot of all 15 `public` tables plus
 * `supabase_migrations.schema_migrations`, explicitly excluding `public.invitations.token_hash`.
 *
 * Usage:
 *   node scripts/export-remote-backup.mjs [--remote=<project-ref>] [--label=<dev|prod>] [--out-dir=<dir>]
 */

const DEFAULT_DEV_REF = 'tfwmbpvbfavugvokdych';
const DEFAULT_PROD_REF = 'ftmwcmsrfcgzmrowjudb';

const TABLE_SPECS = [
  { table: 'profiles', orderBy: ['id'], excludedColumns: [] },
  { table: 'workspaces', orderBy: ['id'], excludedColumns: [] },
  { table: 'workspace_members', orderBy: ['workspace_id', 'user_id'], excludedColumns: [] },
  { table: 'weddings', orderBy: ['id'], excludedColumns: [] },
  { table: 'wedding_settings', orderBy: ['wedding_id'], excludedColumns: [] },
  { table: 'wedding_themes', orderBy: ['wedding_id'], excludedColumns: [] },
  { table: 'wedding_sections', orderBy: ['wedding_id', 'sort_order', 'id'], excludedColumns: [] },
  {
    table: 'published_versions',
    orderBy: ['wedding_id', 'version_number'],
    excludedColumns: [],
  },
  { table: 'guest_groups', orderBy: ['wedding_id', 'sort_order', 'id'], excludedColumns: [] },
  { table: 'guests', orderBy: ['wedding_id', 'sort_order', 'id'], excludedColumns: [] },
  {
    table: 'invitations',
    orderBy: ['wedding_id', 'created_at', 'id'],
    excludedColumns: ['token_hash'],
  },
  { table: 'rsvp_questions', orderBy: ['wedding_id', 'sort_order', 'id'], excludedColumns: [] },
  { table: 'rsvp_submissions', orderBy: ['wedding_id', 'group_id'], excludedColumns: [] },
  { table: 'rsvp_attendees', orderBy: ['submission_id', 'id'], excludedColumns: [] },
  { table: 'rsvp_answers', orderBy: ['submission_id', 'question_id'], excludedColumns: [] },
];

function parseCliArgs(argv) {
  let remoteRef = process.env.SUPABASE_PROJECT_REF?.trim() || '';
  let environmentLabel = '';
  let baseOutDir = path.resolve(process.cwd(), 'backups');

  for (const arg of argv) {
    if (arg.startsWith('--remote=')) {
      remoteRef = arg.slice('--remote='.length).trim();
    } else if (arg === '--remote') {
      remoteRef = DEFAULT_DEV_REF;
    } else if (arg.startsWith('--label=')) {
      environmentLabel = arg.slice('--label='.length).trim();
    } else if (arg.startsWith('--out-dir=')) {
      baseOutDir = path.resolve(process.cwd(), arg.slice('--out-dir='.length).trim());
    }
  }

  if (!remoteRef) {
    remoteRef = DEFAULT_DEV_REF;
  }

  if (!/^[a-z0-9]{15,32}$/.test(remoteRef)) {
    throw new Error(`Invalid Supabase project ref: ${remoteRef}`);
  }

  if (!environmentLabel) {
    environmentLabel = remoteRef === DEFAULT_PROD_REF ? 'production' : 'development';
  }

  return { remoteRef, environmentLabel, baseOutDir };
}

function sortJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJsonValue(entry));
  }
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    for (const field of Object.keys(value).sort()) {
      sorted[field] = sortJsonValue(value[field]);
    }
    return sorted;
  }
  return value;
}

function parseSupabaseJsonEnvelope(stdoutText) {
  const firstBrace = stdoutText.indexOf('{');
  const lastBrace = stdoutText.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(`Unexpected supabase db query output:\n${stdoutText}`);
  }
  return JSON.parse(stdoutText.slice(firstBrace, lastBrace + 1));
}

function runRemoteReadOnlySql(remoteRef, sqlStatement) {
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(
    npxCmd,
    ['supabase', 'db', 'query', `--remote=${remoteRef}`, '--yes', '--output=json'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      input: sqlStatement,
      maxBuffer: 50 * 1024 * 1024,
      shell: process.platform === 'win32',
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `supabase db query failed on ${remoteRef} (${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  }

  const parsed = parseSupabaseJsonEnvelope(result.stdout ?? '');
  return Array.isArray(parsed.rows) ? parsed.rows : [];
}

function buildSingleRoundTripExportSql() {
  const tableExpressions = TABLE_SPECS.map((spec) => {
    const orderClause = spec.orderBy.map((col) => `t.${col} ASC`).join(', ');
    const rowExpr =
      spec.excludedColumns.length > 0
        ? `(to_jsonb(t) - ${spec.excludedColumns.map((col) => `'${col}'`).join(' - ')})`
        : 'to_jsonb(t)';
    return `'${spec.table}', COALESCE((SELECT jsonb_agg(${rowExpr} ORDER BY ${orderClause}) FROM public.${spec.table} AS t), '[]'::jsonb)`;
  });

  return `
    SELECT
      COALESCE(
        (SELECT jsonb_agg(sm.version ORDER BY sm.version ASC) FROM supabase_migrations.schema_migrations AS sm),
        '[]'::jsonb
      ) AS migrations,
      jsonb_build_object(
        ${tableExpressions.join(',\n        ')}
      ) AS tables;
  `;
}

export function exportRemoteLogicalBackup(options) {
  const { remoteRef, environmentLabel, baseOutDir } = options;
  const exportedAt = new Date().toISOString();
  const safeTimestamp = exportedAt.replace(/[:.]/g, '-');

  const rows = runRemoteReadOnlySql(remoteRef, buildSingleRoundTripExportSql());
  const payload = rows[0];
  if (!payload || typeof payload !== 'object') {
    throw new Error(`Empty backup query response from project ${remoteRef}.`);
  }

  const migrations = Array.isArray(payload.migrations) ? payload.migrations : [];
  const rawTables = payload.tables && typeof payload.tables === 'object' ? payload.tables : {};

  const sanitizedTables = {};
  const tableOrder = TABLE_SPECS.map((spec) => spec.table);
  const tableRowCounts = {};
  let totalRows = 0;

  for (const spec of TABLE_SPECS) {
    const tableRows = Array.isArray(rawTables[spec.table]) ? rawTables[spec.table] : [];
    const excludedSet = new Set(spec.excludedColumns);
    const cleanedRows = tableRows.map((row) => {
      const copy = {};
      for (const [col, val] of Object.entries(row)) {
        if (!excludedSet.has(col)) {
          copy[col] = val;
        }
      }
      return copy;
    });

    if (spec.table === 'invitations') {
      for (const invRow of cleanedRows) {
        if (Object.prototype.hasOwnProperty.call(invRow, 'token_hash')) {
          throw new Error('Security violation: invitations.token_hash appeared in backup rows.');
        }
      }
    }

    sanitizedTables[spec.table] = cleanedRows;
    tableRowCounts[spec.table] = cleanedRows.length;
    totalRows += cleanedRows.length;
  }

  const snapshot = {
    formatVersion: 1,
    exportedAt,
    environmentLabel,
    projectRef: remoteRef,
    migrations,
    tables: sanitizedTables,
  };

  const snapshotJson = `${JSON.stringify(sortJsonValue(snapshot), null, 2)}\n`;
  const snapshotSha256 = crypto.createHash('sha256').update(snapshotJson, 'utf8').digest('hex');

  const sortedMigrations = [...migrations].sort();
  const manifest = {
    formatVersion: 1,
    exportedAt,
    environmentLabel,
    projectRef: remoteRef,
    migrationCount: sortedMigrations.length,
    latestMigration:
      sortedMigrations.length > 0 ? sortedMigrations[sortedMigrations.length - 1] : null,
    tableOrder,
    tableRowCounts,
    totalRows,
    excludedSensitiveColumns: ['public.invitations.token_hash'],
    snapshotSha256,
  };

  const outputDirectory = path.join(
    baseOutDir,
    `${environmentLabel}-${remoteRef}-${safeTimestamp}`,
  );
  fs.mkdirSync(outputDirectory, { recursive: true });

  const snapshotPath = path.join(outputDirectory, 'snapshot.json');
  const manifestPath = path.join(outputDirectory, 'manifest.json');

  fs.writeFileSync(snapshotPath, snapshotJson, 'utf8');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return {
    outputDirectory,
    snapshotPath,
    manifestPath,
    manifest,
  };
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isDirectExecution) {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  const result = exportRemoteLogicalBackup(cliOptions);
  console.log(
    JSON.stringify(
      {
        status: 'BACKUP_EXPORTED',
        outputDirectory: result.outputDirectory,
        manifest: result.manifest,
      },
      null,
      2,
    ),
  );
}
