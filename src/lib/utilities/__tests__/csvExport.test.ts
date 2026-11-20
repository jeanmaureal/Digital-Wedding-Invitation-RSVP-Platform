import { describe, expect, it, vi } from 'vitest';
import {
  buildSafeCsvFilename,
  downloadCsvFile,
  escapeRfc4180Cell,
  sanitizeCsvFormulaCell,
  serializeCsvDocument,
} from '@/lib/utilities/csvExport';

describe('csvExport — RFC-4180 Serialization & OWASP Formula-Injection Defense (P8-AC09)', () => {
  it('neutralizes spreadsheet formula-injection prefixes and leading-whitespace formula payloads', () => {
    expect(sanitizeCsvFormulaCell('')).toBe('');
    expect(sanitizeCsvFormulaCell('Vegetarian, no nuts')).toBe('Vegetarian, no nuts');
    expect(sanitizeCsvFormulaCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(sanitizeCsvFormulaCell('+1-555-0199')).toBe("'+1-555-0199");
    expect(sanitizeCsvFormulaCell('-2+3+cmd')).toBe("'-2+3+cmd");
    expect(sanitizeCsvFormulaCell('@IMPORTXML("https://example.com")')).toBe(
      '\'@IMPORTXML("https://example.com")',
    );
    expect(sanitizeCsvFormulaCell('\t=1+1')).toBe("'\t=1+1");
    expect(sanitizeCsvFormulaCell('\r=1+1')).toBe("'\r=1+1");
    expect(sanitizeCsvFormulaCell('   =HYPERLINK("https://evil.example")')).toBe(
      '\'   =HYPERLINK("https://evil.example")',
    );
  });

  it('escapes commas, double quotes, booleans, numbers, and CRLF line breaks per RFC-4180', () => {
    expect(escapeRfc4180Cell(null)).toBe('');
    expect(escapeRfc4180Cell(undefined)).toBe('');
    expect(escapeRfc4180Cell(true)).toBe('Yes');
    expect(escapeRfc4180Cell(false)).toBe('No');
    expect(escapeRfc4180Cell(42)).toBe('42');
    expect(escapeRfc4180Cell(-5)).toBe("'-5");
    expect(escapeRfc4180Cell('Rivera, Elena "Chef"')).toBe('"Rivera, Elena ""Chef"""');
    expect(escapeRfc4180Cell('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
  });

  it('prepends UTF-8 BOM and joins rows with CRLF', () => {
    const csv = serializeCsvDocument({
      headers: ['Household', 'Dietary Notes', 'Attending'],
      rows: [
        ['Élodie & José', '=1+1, Vegan', true],
        ['The Lee Family', 'None', false],
      ],
    });

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toBe(
      '\uFEFFHousehold,Dietary Notes,Attending\r\nÉlodie & José,"\'=1+1, Vegan",Yes\r\nThe Lee Family,None,No\r\n',
    );
  });

  it('builds safe lowercase CSV filenames and revokes Blob URLs after download', () => {
    expect(buildSafeCsvFilename('  Clara & Mateo 2027! ', 'RSVP Attendance.csv')).toBe(
      'clara-mateo-2027-rsvp-attendance.csv',
    );

    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:https://example.test/csv-1');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    downloadCsvFile('wedding-export.csv', '\uFEFFColA\r\nValA\r\n');

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:https://example.test/csv-1');

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    clickSpy.mockRestore();
  });
});
