/**
 * Canonical FK-topological table order and integrity manifest helpers for
 * logical backups (`scripts/export-remote-backup.mjs`) and disaster-recovery drills.
 *
 * Security invariant: `public.invitations.token_hash` is never exported in logical
 * snapshots so offline backup archives cannot be used for offline hash-table Correlation
 * or accidental token-material exposure.
 */

export interface BackupTableSpec {
  readonly schema: 'public';
  readonly table: string;
  readonly orderBy: readonly string[];
  readonly excludedColumns: readonly string[];
}

export const PUBLIC_BACKUP_TABLE_SPECS: readonly BackupTableSpec[] = [
  { schema: 'public', table: 'profiles', orderBy: ['id'], excludedColumns: [] },
  { schema: 'public', table: 'workspaces', orderBy: ['id'], excludedColumns: [] },
  {
    schema: 'public',
    table: 'workspace_members',
    orderBy: ['workspace_id', 'user_id'],
    excludedColumns: [],
  },
  { schema: 'public', table: 'weddings', orderBy: ['id'], excludedColumns: [] },
  { schema: 'public', table: 'wedding_settings', orderBy: ['wedding_id'], excludedColumns: [] },
  { schema: 'public', table: 'wedding_themes', orderBy: ['wedding_id'], excludedColumns: [] },
  {
    schema: 'public',
    table: 'wedding_sections',
    orderBy: ['wedding_id', 'sort_order', 'id'],
    excludedColumns: [],
  },
  {
    schema: 'public',
    table: 'published_versions',
    orderBy: ['wedding_id', 'version_number'],
    excludedColumns: [],
  },
  {
    schema: 'public',
    table: 'guest_groups',
    orderBy: ['wedding_id', 'sort_order', 'id'],
    excludedColumns: [],
  },
  {
    schema: 'public',
    table: 'guests',
    orderBy: ['wedding_id', 'sort_order', 'id'],
    excludedColumns: [],
  },
  {
    schema: 'public',
    table: 'invitations',
    orderBy: ['wedding_id', 'created_at', 'id'],
    excludedColumns: ['token_hash'],
  },
  {
    schema: 'public',
    table: 'rsvp_questions',
    orderBy: ['wedding_id', 'sort_order', 'id'],
    excludedColumns: [],
  },
  {
    schema: 'public',
    table: 'rsvp_submissions',
    orderBy: ['wedding_id', 'group_id'],
    excludedColumns: [],
  },
  {
    schema: 'public',
    table: 'rsvp_attendees',
    orderBy: ['submission_id', 'id'],
    excludedColumns: [],
  },
  {
    schema: 'public',
    table: 'rsvp_answers',
    orderBy: ['submission_id', 'question_id'],
    excludedColumns: [],
  },
] as const;

export const EXCLUDED_SENSITIVE_BACKUP_COLUMNS = ['public.invitations.token_hash'] as const;

export interface LogicalBackupSnapshot {
  readonly formatVersion: 1;
  readonly exportedAt: string;
  readonly environmentLabel: string;
  readonly projectRef: string;
  readonly migrations: readonly string[];
  readonly tables: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>;
}

export interface LogicalBackupManifest {
  readonly formatVersion: 1;
  readonly exportedAt: string;
  readonly environmentLabel: string;
  readonly projectRef: string;
  readonly migrationCount: number;
  readonly latestMigration: string | null;
  readonly tableOrder: readonly string[];
  readonly tableRowCounts: Readonly<Record<string, number>>;
  readonly totalRows: number;
  readonly excludedSensitiveColumns: readonly string[];
  readonly snapshotSha256: string;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const fieldName of Object.keys(record).sort()) {
      sorted[fieldName] = sortJsonValue(record[fieldName]);
    }
    return sorted;
  }
  return value;
}

export function serializeCanonicalBackupJson(snapshot: LogicalBackupSnapshot): string {
  return `${JSON.stringify(sortJsonValue(snapshot), null, 2)}\n`;
}

export function stripExcludedTableColumns(
  tableName: string,
  rows: readonly Readonly<Record<string, unknown>>[],
): Readonly<Record<string, unknown>>[] {
  const spec = PUBLIC_BACKUP_TABLE_SPECS.find((entry) => entry.table === tableName);
  if (!spec || spec.excludedColumns.length === 0) {
    return rows.map((row) => ({ ...row }));
  }

  const excludedSet = new Set(spec.excludedColumns);
  return rows.map((row) => {
    const sanitized: Record<string, unknown> = {};
    for (const [columnName, columnValue] of Object.entries(row)) {
      if (!excludedSet.has(columnName)) {
        sanitized[columnName] = columnValue;
      }
    }
    return sanitized;
  });
}

export function assertBackupHasNoSensitiveColumns(snapshot: LogicalBackupSnapshot): void {
  const expectedTableNames = PUBLIC_BACKUP_TABLE_SPECS.map((spec) => spec.table);
  for (const tableName of expectedTableNames) {
    if (!Object.prototype.hasOwnProperty.call(snapshot.tables, tableName)) {
      throw new Error(`Missing required public table in backup snapshot: ${tableName}`);
    }
  }

  const invitationRows = snapshot.tables.invitations ?? [];
  for (const row of invitationRows) {
    if (Object.prototype.hasOwnProperty.call(row, 'token_hash')) {
      throw new Error('Security violation: public.invitations.token_hash must never be exported.');
    }
  }
}

export async function computeSha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const digestBuffer = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digestBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function buildLogicalBackupManifest(
  snapshot: LogicalBackupSnapshot,
  serializedSnapshotJson?: string,
): Promise<LogicalBackupManifest> {
  assertBackupHasNoSensitiveColumns(snapshot);

  const canonicalText = serializedSnapshotJson ?? serializeCanonicalBackupJson(snapshot);
  const snapshotSha256 = await computeSha256Hex(canonicalText);

  const tableOrder = PUBLIC_BACKUP_TABLE_SPECS.map((spec) => spec.table);
  const tableRowCounts: Record<string, number> = {};
  let totalRows = 0;

  for (const tableName of tableOrder) {
    const count = (snapshot.tables[tableName] ?? []).length;
    tableRowCounts[tableName] = count;
    totalRows += count;
  }

  const sortedMigrations = [...snapshot.migrations].sort();
  const latestMigration =
    sortedMigrations.length > 0 ? (sortedMigrations[sortedMigrations.length - 1] ?? null) : null;

  return {
    formatVersion: 1,
    exportedAt: snapshot.exportedAt,
    environmentLabel: snapshot.environmentLabel,
    projectRef: snapshot.projectRef,
    migrationCount: sortedMigrations.length,
    latestMigration,
    tableOrder,
    tableRowCounts,
    totalRows,
    excludedSensitiveColumns: [...EXCLUDED_SENSITIVE_BACKUP_COLUMNS],
    snapshotSha256,
  };
}
