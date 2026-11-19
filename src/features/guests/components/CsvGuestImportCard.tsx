import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { type ChangeEvent, type JSX, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ImportedHouseholdPayload } from '@/features/guests/schemas/guestSchemas';
import {
  generateSampleGuestCsv,
  parseGuestImportCsv,
} from '@/features/guests/utils/guestCsvParser';

export interface CsvGuestImportCardProps {
  readonly isImporting: boolean;
  readonly serverError: string | null;
  readonly onImportHouseholds: (households: readonly ImportedHouseholdPayload[]) => Promise<void>;
  readonly onClose: () => void;
}

export function CsvGuestImportCard({
  isImporting,
  serverError,
  onImportHouseholds,
  onClose,
}: CsvGuestImportCardProps): JSX.Element {
  const [csvText, setCsvText] = useState('');
  const [fileReadError, setFileReadError] = useState<string | null>(null);

  const parsedPreview = useMemo(() => {
    if (csvText.trim() === '') {
      return null;
    }
    return parseGuestImportCsv(csvText);
  }, [csvText]);

  function handleDownloadSampleCsv(): void {
    const sample = generateSampleGuestCsv();
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sample-wedding-guests.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    setFileReadError(null);
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const content = await file.text();
      setCsvText(content);
    } catch {
      setFileReadError('Unable to read the selected CSV file.');
    }
  }

  async function handleCommitImport(): Promise<void> {
    if (!parsedPreview || !parsedPreview.ok) {
      return;
    }
    await onImportHouseholds(parsedPreview.households);
  }

  const totalPreviewGuests =
    parsedPreview && parsedPreview.ok
      ? parsedPreview.households.reduce((acc, item) => acc + item.guests.length, 0)
      : 0;

  return (
    <Card data-testid="csv-guest-import-card">
      <CardHeader>
        <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileSpreadsheet className="text-primary size-5 shrink-0" aria-hidden="true" />
              <span>CSV Household &amp; Guest Bulk Import</span>
            </CardTitle>
            <CardDescription className="leading-relaxed">
              Rows sharing the same <code>household_name</code> group automatically into one
              household. Imports run inside a single PostgreSQL transaction — any invalid row stops
              the batch cleanly with zero partial writes.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadSampleCsv}
              data-testid="csv-download-sample-button"
            >
              <Download className="size-4" aria-hidden="true" />
              Sample CSV
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCsvText(generateSampleGuestCsv())}
              data-testid="csv-load-sample-inline-button"
            >
              Load Sample Rows
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="csv-guest-file-input">Upload .csv File</Label>
            <input
              id="csv-guest-file-input"
              data-testid="csv-guest-file-input"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void handleFileSelect(event)}
              disabled={isImporting}
              className="border-input bg-background file:bg-muted file:text-foreground block w-full rounded-md border px-3 py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:px-2.5 file:py-1 file:text-xs file:font-medium"
            />
          </div>
          <p className="text-muted-foreground self-end text-xs leading-relaxed">
            Supported columns: <code>household_name</code>, <code>max_attendees</code>,{' '}
            <code>first_name</code>, <code>last_name</code>, <code>email</code>, <code>phone</code>,{' '}
            <code>side</code>, <code>is_child</code>, <code>dietary_notes</code>,{' '}
            <code>household_notes</code>.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="csv-guest-textarea">CSV Content Preview &amp; Editor</Label>
          <Textarea
            id="csv-guest-textarea"
            data-testid="csv-guest-textarea"
            rows={6}
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            disabled={isImporting}
            placeholder='household_name,max_attendees,first_name,last_name,email&#10;"The Rivera Family",4,Elena,Rivera,elena@example.com'
            className="font-mono text-xs"
          />
        </div>

        {fileReadError ? (
          <p role="alert" className="text-destructive text-sm">
            {fileReadError}
          </p>
        ) : null}

        {serverError ? (
          <p
            role="alert"
            data-testid="csv-import-server-error"
            className="text-destructive text-sm"
          >
            {serverError}
          </p>
        ) : null}

        {parsedPreview && !parsedPreview.ok ? (
          <div
            role="alert"
            data-testid="csv-validation-errors"
            className="border-destructive/40 bg-destructive/5 space-y-2 rounded-lg border p-3"
          >
            <div className="text-destructive flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="size-4" aria-hidden="true" />
              <span>
                Fix {parsedPreview.errors.length}{' '}
                {parsedPreview.errors.length === 1 ? 'validation issue' : 'validation issues'}{' '}
                before importing:
              </span>
            </div>
            <ul className="max-h-40 list-inside list-disc space-y-1 overflow-y-auto text-xs">
              {parsedPreview.errors.map((err, index) => (
                <li key={`${err.rowNumber}-${err.field}-${index}`}>
                  <strong>Row {err.rowNumber}</strong> (<code>{err.field}</code>): {err.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {parsedPreview && parsedPreview.ok ? (
          <div
            data-testid="csv-validation-ready"
            className="space-y-3 rounded-lg border border-emerald-600/30 bg-emerald-500/5 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                <span>
                  Ready to import {parsedPreview.households.length}{' '}
                  {parsedPreview.households.length === 1 ? 'household' : 'households'} (
                  {totalPreviewGuests} {totalPreviewGuests === 1 ? 'guest' : 'guests'})
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={isImporting}
                onClick={() => void handleCommitImport()}
                data-testid="csv-commit-import-button"
              >
                <Upload className="size-4" aria-hidden="true" />
                {isImporting ? 'Importing…' : 'Import Households Atomically'}
              </Button>
            </div>

            <div className="max-h-44 overflow-y-auto rounded border bg-white/60 p-2 text-xs dark:bg-black/20">
              <ul className="space-y-1.5">
                {parsedPreview.households.map((household) => (
                  <li
                    key={household.displayName}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="font-medium">{household.displayName}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline">
                        {household.guests.length}{' '}
                        {household.guests.length === 1 ? 'member' : 'members'}
                      </Badge>
                      <Badge variant="secondary">Cap: {household.maxAttendees}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
