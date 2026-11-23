import {
  type GuestSide,
  guestMemberFormSchema,
  guestSideSchema,
  householdFormSchema,
  type ImportedGuestPayload,
  type ImportedHouseholdPayload,
} from '@/features/guests/schemas/guestSchemas';

export const MAX_CSV_IMPORT_BYTES = 262_144;
export const MAX_CSV_IMPORT_ROWS = 500;
export const MAX_CSV_IMPORT_HOUSEHOLDS = 200;

export interface CsvImportValidationError {
  readonly rowNumber: number;
  readonly field: string;
  readonly message: string;
}

export interface CsvDuplicateAnalysis {
  readonly newHouseholds: readonly ImportedHouseholdPayload[];
  readonly duplicateHouseholds: readonly ImportedHouseholdPayload[];
  readonly newGuestCount: number;
  readonly duplicateGuestCount: number;
  readonly duplicateKeys: ReadonlySet<string>;
}

export function normalizeHouseholdNameKey(displayName: string): string {
  return displayName.trim().toLowerCase();
}

export function partitionImportedHouseholdsByDuplicate(
  households: readonly ImportedHouseholdPayload[],
  existingHouseholdNames: readonly string[],
): CsvDuplicateAnalysis {
  const existingKeys = new Set<string>(
    existingHouseholdNames.map((name) => normalizeHouseholdNameKey(name)).filter(Boolean),
  );

  const newHouseholds: ImportedHouseholdPayload[] = [];
  const duplicateHouseholds: ImportedHouseholdPayload[] = [];
  const duplicateKeys = new Set<string>();
  let newGuestCount = 0;
  let duplicateGuestCount = 0;

  for (const household of households) {
    const key = normalizeHouseholdNameKey(household.displayName);
    if (existingKeys.has(key)) {
      duplicateHouseholds.push(household);
      duplicateKeys.add(key);
      duplicateGuestCount += household.guests.length;
    } else {
      newHouseholds.push(household);
      newGuestCount += household.guests.length;
    }
  }

  return {
    newHouseholds,
    duplicateHouseholds,
    newGuestCount,
    duplicateGuestCount,
    duplicateKeys,
  };
}

export type CsvGuestParseResult =
  | {
      readonly ok: true;
      readonly households: readonly ImportedHouseholdPayload[];
      readonly totalRows: number;
    }
  | {
      readonly ok: false;
      readonly errors: readonly CsvImportValidationError[];
      readonly totalRows: number;
    };

const REQUIRED_CSV_HEADERS = ['household_name', 'first_name'] as const;

const KNOWN_CSV_HEADERS = new Set<string>([
  'household_name',
  'max_attendees',
  'first_name',
  'last_name',
  'email',
  'phone',
  'side',
  'is_child',
  'dietary_notes',
  'household_notes',
]);

export function generateSampleGuestCsv(): string {
  return [
    'household_name,max_attendees,first_name,last_name,email,phone,side,is_child,dietary_notes,household_notes',
    '"The Rivera Family",4,Elena,Rivera,elena@example.com,+63 917 555 0101,partner_one,false,Vegetarian,"Bride college table"',
    '"The Rivera Family",4,Mateo,Rivera,,+63 917 555 0102,partner_one,false,,',
    '"The Rivera Family",4,Lucas,Rivera,,,partner_one,true,"No peanuts",',
    '"Jordan & Sam Lee",2,Jordan,Lee,jordan@example.com,,mutual,false,,',
    '"Jordan & Sam Lee",2,Sam,Lee,sam@example.com,,mutual,false,Gluten-free,',
  ].join('\n');
}

/**
 * Pure RFC-4180 compliant CSV tokenizer supporting quoted fields, escaped quotes (`""`),
 * CRLF/LF line endings, and UTF-8 BOM stripping.
 */
export function tokenizeRfc4180Csv(rawText: string): {
  readonly rows: readonly (readonly string[])[];
  readonly unclosedQuote: boolean;
} {
  const normalized = rawText.startsWith('\uFEFF') ? rawText.slice(1) : rawText;
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];

    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (ch === '\r') {
      if (normalized[i + 1] === '\n') {
        i += 1;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else if (ch === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return { rows, unclosedQuote: inQuotes };
}

function parseOptionalBoolean(
  rawValue: string,
): { readonly ok: true; readonly value: boolean } | { readonly ok: false } {
  const trimmed = rawValue.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'false' || trimmed === 'no' || trimmed === '0') {
    return { ok: true, value: false };
  }
  if (trimmed === 'true' || trimmed === 'yes' || trimmed === '1') {
    return { ok: true, value: true };
  }
  return { ok: false };
}

function parseOptionalSide(
  rawValue: string,
): { readonly ok: true; readonly value: GuestSide } | { readonly ok: false } {
  const trimmed = rawValue.trim().toLowerCase();
  if (trimmed === '') {
    return { ok: true, value: 'mutual' };
  }
  const parsed = guestSideSchema.safeParse(trimmed);
  if (!parsed.success) {
    return { ok: false };
  }
  return { ok: true, value: parsed.data };
}

interface MutableHouseholdAccumulator {
  displayName: string;
  explicitMaxAttendees: number | null;
  explicitMaxRow: number | null;
  notes: string;
  firstSeenRow: number;
  guests: ImportedGuestPayload[];
}

export function parseGuestImportCsv(rawCsvText: string): CsvGuestParseResult {
  const byteLength = new TextEncoder().encode(rawCsvText).byteLength;
  if (byteLength > MAX_CSV_IMPORT_BYTES) {
    return {
      ok: false,
      totalRows: 0,
      errors: [
        {
          rowNumber: 1,
          field: 'file',
          message: 'CSV file exceeds the 256 KB per-import limit.',
        },
      ],
    };
  }

  const { rows, unclosedQuote } = tokenizeRfc4180Csv(rawCsvText);
  if (unclosedQuote) {
    return {
      ok: false,
      totalRows: 0,
      errors: [
        {
          rowNumber: rows.length || 1,
          field: 'csv',
          message: 'CSV contains an unclosed double-quoted field.',
        },
      ],
    };
  }

  const nonEmptyIndexedRows: Array<{
    readonly rowNumber: number;
    readonly cells: readonly string[];
  }> = [];
  for (let idx = 0; idx < rows.length; idx += 1) {
    const cells = rows[idx];
    if (!cells) {
      continue;
    }
    const isBlank = cells.every((cell) => cell.trim() === '');
    if (!isBlank) {
      nonEmptyIndexedRows.push({ rowNumber: idx + 1, cells });
    }
  }

  if (nonEmptyIndexedRows.length < 2) {
    return {
      ok: false,
      totalRows: 0,
      errors: [
        {
          rowNumber: 1,
          field: 'header',
          message: 'CSV must include a header row and at least one guest row.',
        },
      ],
    };
  }

  const headerEntry = nonEmptyIndexedRows[0]!;
  const normalizedHeaders = headerEntry.cells.map((header) => header.trim().toLowerCase());
  const errors: CsvImportValidationError[] = [];

  for (const required of REQUIRED_CSV_HEADERS) {
    if (!normalizedHeaders.includes(required)) {
      errors.push({
        rowNumber: headerEntry.rowNumber,
        field: required,
        message: `Missing required CSV header "${required}".`,
      });
    }
  }

  const seenHeaders = new Set<string>();
  for (const header of normalizedHeaders) {
    if (!header) {
      errors.push({
        rowNumber: headerEntry.rowNumber,
        field: 'header',
        message: 'CSV header row contains an empty column name.',
      });
      continue;
    }
    if (seenHeaders.has(header)) {
      errors.push({
        rowNumber: headerEntry.rowNumber,
        field: header,
        message: `Duplicate CSV header "${header}".`,
      });
    }
    seenHeaders.add(header);
    if (!KNOWN_CSV_HEADERS.has(header)) {
      errors.push({
        rowNumber: headerEntry.rowNumber,
        field: header,
        message: `Unrecognized CSV column "${header}". Download the sample template for supported columns.`,
      });
    }
  }

  const dataRows = nonEmptyIndexedRows.slice(1);
  if (dataRows.length > MAX_CSV_IMPORT_ROWS) {
    errors.push({
      rowNumber: headerEntry.rowNumber,
      field: 'rows',
      message: `CSV contains ${dataRows.length} guest rows (maximum ${MAX_CSV_IMPORT_ROWS} per import).`,
    });
  }

  if (errors.length > 0) {
    return { ok: false, totalRows: dataRows.length, errors };
  }

  const headerIndexMap = new Map<string, number>();
  normalizedHeaders.forEach((header, index) => {
    headerIndexMap.set(header, index);
  });

  const getCell = (cells: readonly string[], column: string): string => {
    const colIndex = headerIndexMap.get(column);
    if (colIndex === undefined) {
      return '';
    }
    return cells[colIndex] ?? '';
  };

  const householdsByKey = new Map<string, MutableHouseholdAccumulator>();

  for (const dataRow of dataRows) {
    const { rowNumber, cells } = dataRow;

    if (cells.length > normalizedHeaders.length) {
      errors.push({
        rowNumber,
        field: 'csv',
        message: `Row has ${cells.length} values, expected at most ${normalizedHeaders.length} columns.`,
      });
      continue;
    }

    const rawHouseholdName = getCell(cells, 'household_name').trim();
    const rawMaxAttendees = getCell(cells, 'max_attendees').trim();
    const rawHouseholdNotes = getCell(cells, 'household_notes').trim();
    const rawFirstName = getCell(cells, 'first_name');
    const rawLastName = getCell(cells, 'last_name');
    const rawEmail = getCell(cells, 'email');
    const rawPhone = getCell(cells, 'phone');
    const rawSide = getCell(cells, 'side');
    const rawIsChild = getCell(cells, 'is_child');
    const rawDietaryNotes = getCell(cells, 'dietary_notes');

    let parsedMax: number | null = null;
    if (rawMaxAttendees !== '') {
      if (!/^[0-9]+$/.test(rawMaxAttendees)) {
        errors.push({
          rowNumber,
          field: 'max_attendees',
          message: 'max_attendees must be a whole number between 1 and 50.',
        });
      } else {
        const numericMax = Number.parseInt(rawMaxAttendees, 10);
        if (numericMax < 1 || numericMax > 50) {
          errors.push({
            rowNumber,
            field: 'max_attendees',
            message: 'max_attendees must be between 1 and 50.',
          });
        } else {
          parsedMax = numericMax;
        }
      }
    }

    const sideResult = parseOptionalSide(rawSide);
    if (!sideResult.ok) {
      errors.push({
        rowNumber,
        field: 'side',
        message: 'side must be partner_one, partner_two, mutual, or other.',
      });
    }

    const childResult = parseOptionalBoolean(rawIsChild);
    if (!childResult.ok) {
      errors.push({
        rowNumber,
        field: 'is_child',
        message: 'is_child must be true, false, yes, no, 1, or 0.',
      });
    }

    const guestValidation = guestMemberFormSchema.safeParse({
      firstName: rawFirstName,
      lastName: rawLastName,
      email: rawEmail,
      phone: rawPhone,
      side: sideResult.ok ? sideResult.value : 'mutual',
      isChild: childResult.ok ? childResult.value : false,
      dietaryNotes: rawDietaryNotes,
    });

    if (!guestValidation.success) {
      for (const issue of guestValidation.error.issues) {
        errors.push({
          rowNumber,
          field: issue.path.join('.') || 'guest',
          message: issue.message,
        });
      }
    }

    const householdPreviewValidation = householdFormSchema.safeParse({
      displayName: rawHouseholdName,
      maxAttendees: parsedMax ?? 1,
      notes: rawHouseholdNotes,
    });

    if (!householdPreviewValidation.success) {
      for (const issue of householdPreviewValidation.error.issues) {
        if (issue.path[0] === 'maxAttendees' && rawMaxAttendees !== '') {
          continue;
        }
        errors.push({
          rowNumber,
          field:
            issue.path[0] === 'displayName'
              ? 'household_name'
              : String(issue.path[0] ?? 'household'),
          message: issue.message,
        });
      }
      continue;
    }

    if (!guestValidation.success || !sideResult.ok || !childResult.ok) {
      continue;
    }

    const householdKey = normalizeHouseholdNameKey(householdPreviewValidation.data.displayName);
    let accumulator = householdsByKey.get(householdKey);

    if (!accumulator) {
      accumulator = {
        displayName: householdPreviewValidation.data.displayName,
        explicitMaxAttendees: parsedMax,
        explicitMaxRow: parsedMax !== null ? rowNumber : null,
        notes: householdPreviewValidation.data.notes,
        firstSeenRow: rowNumber,
        guests: [],
      };
      householdsByKey.set(householdKey, accumulator);
    } else {
      if (
        parsedMax !== null &&
        accumulator.explicitMaxAttendees !== null &&
        parsedMax !== accumulator.explicitMaxAttendees
      ) {
        errors.push({
          rowNumber,
          field: 'max_attendees',
          message: `Conflicting max_attendees (${parsedMax} vs ${accumulator.explicitMaxAttendees} on row ${accumulator.explicitMaxRow}) for household "${accumulator.displayName}".`,
        });
      } else if (parsedMax !== null && accumulator.explicitMaxAttendees === null) {
        accumulator.explicitMaxAttendees = parsedMax;
        accumulator.explicitMaxRow = rowNumber;
      }

      if (householdPreviewValidation.data.notes && !accumulator.notes) {
        accumulator.notes = householdPreviewValidation.data.notes;
      }
    }

    accumulator.guests.push(guestValidation.data);
    if (accumulator.guests.length > 50) {
      errors.push({
        rowNumber,
        field: 'household_name',
        message: `Household "${accumulator.displayName}" exceeds the 50-guest household limit.`,
      });
    }
  }

  if (householdsByKey.size > MAX_CSV_IMPORT_HOUSEHOLDS) {
    errors.push({
      rowNumber: headerEntry.rowNumber,
      field: 'household_name',
      message: `CSV groups into ${householdsByKey.size} households (maximum ${MAX_CSV_IMPORT_HOUSEHOLDS} per import).`,
    });
  }

  if (errors.length > 0) {
    return { ok: false, totalRows: dataRows.length, errors };
  }

  const households: ImportedHouseholdPayload[] = Array.from(householdsByKey.values()).map(
    (entry) => ({
      displayName: entry.displayName,
      maxAttendees: entry.explicitMaxAttendees ?? entry.guests.length,
      notes: entry.notes,
      guests: entry.guests,
    }),
  );

  return {
    ok: true,
    totalRows: dataRows.length,
    households,
  };
}
