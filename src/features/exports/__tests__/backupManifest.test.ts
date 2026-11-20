import { describe, expect, it } from 'vitest';
import {
  EXCLUDED_SENSITIVE_BACKUP_COLUMNS,
  PUBLIC_BACKUP_TABLE_SPECS,
  assertBackupHasNoSensitiveColumns,
  buildLogicalBackupManifest,
  serializeCanonicalBackupJson,
  stripExcludedTableColumns,
  type LogicalBackupSnapshot,
} from '../backupManifest';

function createEmptyTablesRecord(): Record<string, Readonly<Record<string, unknown>>[]> {
  const record: Record<string, Readonly<Record<string, unknown>>[]> = {};
  for (const spec of PUBLIC_BACKUP_TABLE_SPECS) {
    record[spec.table] = [];
  }
  return record;
}

describe('backupManifest logical snapshot integrity & column redaction', () => {
  it('covers all 15 public tables in parent-before-child FK topological order', () => {
    const names = PUBLIC_BACKUP_TABLE_SPECS.map((spec) => spec.table);
    expect(names).toHaveLength(15);
    expect(names.indexOf('profiles')).toBeLessThan(names.indexOf('workspaces'));
    expect(names.indexOf('workspaces')).toBeLessThan(names.indexOf('workspace_members'));
    expect(names.indexOf('workspaces')).toBeLessThan(names.indexOf('weddings'));
    expect(names.indexOf('weddings')).toBeLessThan(names.indexOf('wedding_settings'));
    expect(names.indexOf('weddings')).toBeLessThan(names.indexOf('published_versions'));
    expect(names.indexOf('guest_groups')).toBeLessThan(names.indexOf('guests'));
    expect(names.indexOf('guest_groups')).toBeLessThan(names.indexOf('invitations'));
    expect(names.indexOf('rsvp_submissions')).toBeLessThan(names.indexOf('rsvp_attendees'));
    expect(names.indexOf('rsvp_questions')).toBeLessThan(names.indexOf('rsvp_answers'));
    expect(names.indexOf('rsvp_submissions')).toBeLessThan(names.indexOf('rsvp_answers'));
  });

  it('strips token_hash from invitations rows and rejects unredacted snapshots', () => {
    const sanitized = stripExcludedTableColumns('invitations', [
      {
        id: '00000000-0000-4000-8000-000000000010',
        status: 'active',
        token_hash: 'deadbeef00000000',
      },
    ]);

    expect(sanitized).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000010',
        status: 'active',
      },
    ]);

    const unsafeTables = createEmptyTablesRecord();
    unsafeTables.invitations = [
      {
        id: '00000000-0000-4000-8000-000000000010',
        token_hash: 'deadbeef00000000',
      },
    ];

    const unsafeSnapshot: LogicalBackupSnapshot = {
      formatVersion: 1,
      exportedAt: '2026-11-20T05:00:00.000Z',
      environmentLabel: 'production',
      projectRef: 'ftmwcmsrfcgzmrowjudb',
      migrations: ['20261111142432', '20261120012113'],
      tables: unsafeTables,
    };

    expect(() => assertBackupHasNoSensitiveColumns(unsafeSnapshot)).toThrow(
      /token_hash must never be exported/i,
    );
  });

  it('produces deterministic canonical JSON and matching SHA-256 manifest digests regardless of object key insertion order', async () => {
    const tablesA = createEmptyTablesRecord();
    tablesA.weddings = [{ title: 'Garden Celebration', id: 'w-1', status: 'published' }];

    const tablesB = createEmptyTablesRecord();
    tablesB.weddings = [{ id: 'w-1', status: 'published', title: 'Garden Celebration' }];

    const snapshotA: LogicalBackupSnapshot = {
      formatVersion: 1,
      exportedAt: '2026-11-20T05:00:00.000Z',
      environmentLabel: 'production',
      projectRef: 'ftmwcmsrfcgzmrowjudb',
      migrations: ['20261111142432', '20261120012113'],
      tables: tablesA,
    };

    const snapshotB: LogicalBackupSnapshot = {
      formatVersion: 1,
      exportedAt: '2026-11-20T05:00:00.000Z',
      environmentLabel: 'production',
      projectRef: 'ftmwcmsrfcgzmrowjudb',
      migrations: ['20261111142432', '20261120012113'],
      tables: tablesB,
    };

    const jsonA = serializeCanonicalBackupJson(snapshotA);
    const jsonB = serializeCanonicalBackupJson(snapshotB);
    expect(jsonA).toBe(jsonB);

    const manifest = await buildLogicalBackupManifest(snapshotA, jsonA);
    expect(manifest.migrationCount).toBe(2);
    expect(manifest.latestMigration).toBe('20261120012113');
    expect(manifest.totalRows).toBe(1);
    expect(manifest.tableRowCounts.weddings).toBe(1);
    expect(manifest.excludedSensitiveColumns).toEqual([...EXCLUDED_SENSITIVE_BACKUP_COLUMNS]);
    expect(manifest.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
