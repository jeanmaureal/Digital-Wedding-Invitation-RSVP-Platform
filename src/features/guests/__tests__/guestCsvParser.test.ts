import { describe, expect, it } from 'vitest';
import {
  generateSampleGuestCsv,
  parseGuestImportCsv,
  partitionImportedHouseholdsByDuplicate,
  tokenizeRfc4180Csv,
} from '@/features/guests/utils/guestCsvParser';

describe('guestCsvParser — RFC-4180 Tokenization & Household Grouping (P6-AC08, P6-AC12)', () => {
  it('parses the downloadable sample CSV cleanly and groups multi-row households', () => {
    const sample = generateSampleGuestCsv();
    const parsed = parseGuestImportCsv(sample);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.totalRows).toBe(5);
    expect(parsed.households).toHaveLength(2);

    const rivera = parsed.households[0]!;
    expect(rivera.displayName).toBe('The Rivera Family');
    expect(rivera.maxAttendees).toBe(4);
    expect(rivera.notes).toBe('Bride college table');
    expect(rivera.guests).toHaveLength(3);
    expect(rivera.guests[2]?.isChild).toBe(true);

    const lee = parsed.households[1]!;
    expect(lee.displayName).toBe('Jordan & Sam Lee');
    expect(lee.maxAttendees).toBe(2);
    expect(lee.guests).toHaveLength(2);
  });

  it('handles UTF-8 BOM, CRLF line endings, quoted commas, and escaped double quotes', () => {
    const csv = [
      '\uFEFFhousehold_name,first_name,last_name,dietary_notes',
      '"The ""Gala"" Household, Jr.",Clara,"De La Cruz","No shellfish, no dairy"',
    ].join('\r\n');

    const tokenized = tokenizeRfc4180Csv(csv);
    expect(tokenized.unclosedQuote).toBe(false);

    const parsed = parseGuestImportCsv(csv);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.households[0]?.displayName).toBe('The "Gala" Household, Jr.');
    expect(parsed.households[0]?.maxAttendees).toBe(1);
    expect(parsed.households[0]?.guests[0]?.dietaryNotes).toBe('No shellfish, no dairy');
  });

  it('rejects conflicting max_attendees values within the same household and unsafe script markup', () => {
    const csv = [
      'household_name,max_attendees,first_name,email',
      '"The Santos Family",3,Marco,marco@example.com',
      '"The Santos Family",5,<script>alert(1)</script>,not-an-email',
    ].join('\n');

    const parsed = parseGuestImportCsv(csv);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;

    const fields = parsed.errors.map((err) => err.field);
    expect(fields).toContain('firstName');
    expect(fields).toContain('email');
  });

  it('rejects unclosed quotes and missing required headers', () => {
    const unclosed = parseGuestImportCsv('household_name,first_name\n"Unclosed Household,Elena');
    expect(unclosed.ok).toBe(false);

    const missingHeader = parseGuestImportCsv('first_name,last_name\nElena,Rivera');
    expect(missingHeader.ok).toBe(false);
    if (!missingHeader.ok) {
      expect(missingHeader.errors[0]?.field).toBe('household_name');
    }
  });

  it('partitions duplicate households case-insensitively against existing wedding households', () => {
    const parsed = parseGuestImportCsv(generateSampleGuestCsv());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const partial = partitionImportedHouseholdsByDuplicate(parsed.households, [
      '  the rivera family ',
    ]);
    expect(partial.duplicateHouseholds).toHaveLength(1);
    expect(partial.duplicateHouseholds[0]?.displayName).toBe('The Rivera Family');
    expect(partial.duplicateGuestCount).toBe(3);
    expect(partial.newHouseholds).toHaveLength(1);
    expect(partial.newHouseholds[0]?.displayName).toBe('Jordan & Sam Lee');
    expect(partial.newGuestCount).toBe(2);

    const allDuplicates = partitionImportedHouseholdsByDuplicate(parsed.households, [
      'THE RIVERA FAMILY',
      'jordan & sam lee',
    ]);
    expect(allDuplicates.newHouseholds).toHaveLength(0);
    expect(allDuplicates.duplicateHouseholds).toHaveLength(2);
    expect(allDuplicates.duplicateGuestCount).toBe(5);
  });
});
