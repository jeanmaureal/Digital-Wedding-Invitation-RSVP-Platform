/**
 * Deterministic IANA Timezone & UTC `timestamptz` Utilities (`P2-AC06`).
 *
 * Architectural rule (`docs/database-design.md` §2):
 *   PostgreSQL stores `rsvp_deadline` as an absolute UTC `timestamptz`.
 *   Organizer inputs and display labels always convert through the wedding's
 *   explicit `wedding_settings.timezone` (never silently through the organizer's
 *   local browser timezone).
 */

const CANONICAL_TIMEZONE_PATTERN = /^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)+$/;
const NUMERIC_OFFSET_PREFIX = /^[+-]/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIME_PATTERN = /^(\d{2}):(\d{2})$/;

export const FEATURED_WEDDING_TIMEZONES: readonly string[] = [
  'Asia/Manila',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'UTC',
];

let cachedSupportedTimezones: readonly string[] | null = null;

export function isValidIanaTimezone(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 80) {
    return false;
  }

  const matchesFormat =
    trimmed === 'UTC' ||
    (CANONICAL_TIMEZONE_PATTERN.test(trimmed) && !NUMERIC_OFFSET_PREFIX.test(trimmed));

  if (!matchesFormat) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

export function getSupportedWeddingTimezones(): readonly string[] {
  if (cachedSupportedTimezones) {
    return cachedSupportedTimezones;
  }

  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const featured of FEATURED_WEDDING_TIMEZONES) {
    if (isValidIanaTimezone(featured) && !seen.has(featured)) {
      seen.add(featured);
      ordered.push(featured);
    }
  }

  if (typeof Intl.supportedValuesOf === 'function') {
    const runtimeZones = Intl.supportedValuesOf('timeZone');
    for (const zone of runtimeZones) {
      if (isValidIanaTimezone(zone) && !seen.has(zone)) {
        seen.add(zone);
        ordered.push(zone);
      }
    }
  }

  cachedSupportedTimezones = ordered;
  return ordered;
}

export function getBrowserDefaultIanaTimezone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved && isValidIanaTimezone(resolved)) {
      return resolved;
    }
  } catch {
    // Fall back deterministically to UTC in restricted environments.
  }
  return 'UTC';
}

export function isValidIsoCalendarDate(dateInput: string): boolean {
  const match = ISO_DATE_PATTERN.exec(dateInput.trim());
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export function isValidWallClockTime(timeInput: string): boolean {
  const match = ISO_TIME_PATTERN.exec(timeInput.trim());
  if (!match) {
    return false;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function getWallClockUtcEquivalentMs(epochMs: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(new Date(epochMs));
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const part of parts) {
    switch (part.type) {
      case 'year':
        year = Number(part.value);
        break;
      case 'month':
        month = Number(part.value);
        break;
      case 'day':
        day = Number(part.value);
        break;
      case 'hour':
        hour = Number(part.value);
        break;
      case 'minute':
        minute = Number(part.value);
        break;
      case 'second':
        second = Number(part.value);
        break;
      default:
        break;
    }
  }

  return Date.UTC(year, month - 1, day, hour, minute, second);
}

/**
 * Converts a wall-clock `YYYY-MM-DD` and `HH:mm` in `timeZone` into an exact UTC ISO string.
 * Uses a two-pass `Intl.DateTimeFormat` offset calculation so DST boundaries resolve cleanly
 * regardless of the organizer's browser timezone.
 */
export function localDateTimeInTimezoneToUtcIso(
  dateInput: string,
  timeInput: string,
  timeZone: string,
): string {
  const cleanDate = dateInput.trim();
  const cleanTime = timeInput.trim();
  const cleanZone = timeZone.trim();

  if (!isValidIsoCalendarDate(cleanDate)) {
    throw new Error('Enter a valid calendar date (YYYY-MM-DD).');
  }
  if (!isValidWallClockTime(cleanTime)) {
    throw new Error('Enter a valid 24-hour time (HH:mm).');
  }
  if (!isValidIanaTimezone(cleanZone)) {
    throw new Error('Choose a valid IANA timezone.');
  }

  const [yearStr, monthStr, dayStr] = cleanDate.split('-');
  const [hourStr, minuteStr] = cleanTime.split(':');

  const desiredWallMs = Date.UTC(
    Number(yearStr),
    Number(monthStr) - 1,
    Number(dayStr),
    Number(hourStr),
    Number(minuteStr),
    0,
    0,
  );

  const offsetGuess1 = getWallClockUtcEquivalentMs(desiredWallMs, cleanZone) - desiredWallMs;
  const candidate1 = desiredWallMs - offsetGuess1;

  const offsetGuess2 = getWallClockUtcEquivalentMs(candidate1, cleanZone) - candidate1;
  const finalEpochMs = desiredWallMs - offsetGuess2;

  return new Date(finalEpochMs).toISOString();
}

export interface DecomposedZonedDateTime {
  readonly date: string;
  readonly time: string;
  readonly formatted: string;
}

export function utcIsoToLocalDateTimeInTimezone(
  utcIso: string,
  timeZone: string,
): DecomposedZonedDateTime {
  const parsed = new Date(utcIso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid UTC timestamp.');
  }

  const effectiveZone = isValidIanaTimezone(timeZone) ? timeZone.trim() : 'UTC';
  const partsFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: effectiveZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  let year = '';
  let month = '';
  let day = '';
  let hour = '';
  let minute = '';

  for (const part of partsFormatter.formatToParts(parsed)) {
    switch (part.type) {
      case 'year':
        year = part.value;
        break;
      case 'month':
        month = part.value;
        break;
      case 'day':
        day = part.value;
        break;
      case 'hour':
        hour = part.value;
        break;
      case 'minute':
        minute = part.value;
        break;
      default:
        break;
    }
  }

  const humanFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: effectiveZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    formatted: `${humanFormatter.format(parsed)} (${effectiveZone})`,
  };
}

export function formatCalendarDateDisplay(eventDate: string | null): string {
  if (!eventDate || !isValidIsoCalendarDate(eventDate)) {
    return 'Date TBD';
  }
  const [yearStr, monthStr, dayStr] = eventDate.split('-');
  const utcDate = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr)));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(utcDate);
}
