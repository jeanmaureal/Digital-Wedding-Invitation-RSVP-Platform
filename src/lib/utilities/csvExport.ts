/**
 * Foundational RFC-4180 CSV serializer & OWASP Spreadsheet Formula-Injection
 * (CWE-1236) sanitizer (`P8-AC09`).
 *
 * Security invariants:
 *   1. String cells starting with `=`, `+`, `-`, `@`, `\t` (`0x09`), or `\r` (`0x0D`),
 *      or leading whitespace followed by `=`, `+`, `-`, `@`, are prefixed with a single
 *      apostrophe (`'`) so Excel, Google Sheets, and LibreOffice Calc treat them as
 *      literal text rather than executable formulas.
 *   2. Output prepends UTF-8 BOM (`\uFEFF`) so spreadsheet applications on Windows/macOS
 *      preserve international/accented UTF-8 characters cleanly.
 *   3. Pure foundational module (`src/lib/utilities/`) with zero feature/portal imports.
 */

export type CsvPrimitiveCell = string | number | boolean | null | undefined;

const FORMULA_LEADING_CHAR_PATTERN = /^[=+\-@\t\r]/;
const WHITESPACE_THEN_FORMULA_CHAR_PATTERN = /^\s+[=+\-@]/;
const RFC4180_NEEDS_QUOTES_PATTERN = /[",\r\n]/;

export function sanitizeCsvFormulaCell(value: string): string {
  if (value.length === 0) {
    return '';
  }

  if (
    FORMULA_LEADING_CHAR_PATTERN.test(value) ||
    WHITESPACE_THEN_FORMULA_CHAR_PATTERN.test(value)
  ) {
    return `'${value}`;
  }

  return value;
}

export function escapeRfc4180Cell(value: CsvPrimitiveCell): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return '';
    }
    const numericString = String(value);
    return sanitizeCsvFormulaCell(numericString);
  }

  const safeText = sanitizeCsvFormulaCell(value);
  if (RFC4180_NEEDS_QUOTES_PATTERN.test(safeText)) {
    return `"${safeText.replaceAll('"', '""')}"`;
  }

  return safeText;
}

export function serializeCsvDocument(params: {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly CsvPrimitiveCell[])[];
  readonly includeUtf8Bom?: boolean;
}): string {
  const headerLine = params.headers.map((header) => escapeRfc4180Cell(header)).join(',');
  const dataLines = params.rows.map((row) => row.map((cell) => escapeRfc4180Cell(cell)).join(','));
  const body = [headerLine, ...dataLines].join('\r\n');
  const bom = params.includeUtf8Bom === false ? '' : '\uFEFF';
  return `${bom}${body}\r\n`;
}

export function buildSafeCsvFilename(slugOrPrefix: string, suffix: string): string {
  const normalizedPrefix = slugOrPrefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

  const normalizedSuffix = suffix
    .trim()
    .toLowerCase()
    .replace(/\.csv$/i, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

  const safeBase = [normalizedPrefix || 'wedding', normalizedSuffix || 'export'].join('-');
  return `${safeBase}.csv`;
}

export function downloadCsvFile(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}
