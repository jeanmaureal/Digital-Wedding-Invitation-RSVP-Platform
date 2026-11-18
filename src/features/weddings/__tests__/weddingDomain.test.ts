import { describe, expect, it } from 'vitest';
import { translateWeddingError, WeddingDomainError } from '@/features/weddings/api/weddingErrors';
import {
  canArchiveOrRestoreWedding,
  canCreateOrEditWedding,
  canDuplicateWedding,
  canPermanentlyDeleteWedding,
} from '@/features/weddings/permissions/weddingPermissions';
import {
  buildDeleteWeddingConfirmationSchema,
  createWeddingSchema,
  duplicateWeddingSchema,
  resolveRsvpDeadlineUtcIso,
  suggestWeddingSlug,
  updateWeddingDetailsSchema,
} from '@/features/weddings/schemas/weddingSchemas';
import {
  isValidIanaTimezone,
  isValidIsoCalendarDate,
  localDateTimeInTimezoneToUtcIso,
  utcIsoToLocalDateTimeInTimezone,
} from '@/features/weddings/utils/weddingTimezone';
import { sanitizeOrganizerRedirect } from '@/features/auth/schemas/authSchemas';
import { buildOrganizerWeddingPath } from '@/lib/constants/routes';

describe('weddingTimezone utilities (P2-AC06)', () => {
  it('accepts canonical IANA timezones and rejects raw offsets or abbreviations', () => {
    expect(isValidIanaTimezone('UTC')).toBe(true);
    expect(isValidIanaTimezone('Asia/Manila')).toBe(true);
    expect(isValidIanaTimezone('America/New_York')).toBe(true);
    expect(isValidIanaTimezone('America/Argentina/Buenos_Aires')).toBe(true);

    expect(isValidIanaTimezone('GMT+8')).toBe(false);
    expect(isValidIanaTimezone('+08:00')).toBe(false);
    expect(isValidIanaTimezone('EST')).toBe(false);
    expect(isValidIanaTimezone('Invalid/Zone')).toBe(false);
  });

  it('converts wall-clock deadlines deterministically across UTC+8, US DST summer/winter, and UTC', () => {
    // Asia/Manila (UTC+8): May 15, 2027 23:59 -> May 15, 2027 15:59:00.000Z
    const manilaUtc = localDateTimeInTimezoneToUtcIso('2027-05-15', '23:59', 'Asia/Manila');
    expect(manilaUtc).toBe('2027-05-15T15:59:00.000Z');
    expect(utcIsoToLocalDateTimeInTimezone(manilaUtc, 'Asia/Manila')).toMatchObject({
      date: '2027-05-15',
      time: '23:59',
    });

    // America/New_York Summer EDT (UTC-4): Jun 1, 2027 18:30 -> Jun 1, 2027 22:30:00.000Z
    const nySummerUtc = localDateTimeInTimezoneToUtcIso('2027-06-01', '18:30', 'America/New_York');
    expect(nySummerUtc).toBe('2027-06-01T22:30:00.000Z');
    expect(utcIsoToLocalDateTimeInTimezone(nySummerUtc, 'America/New_York')).toMatchObject({
      date: '2027-06-01',
      time: '18:30',
    });

    // America/New_York Winter EST (UTC-5): Dec 1, 2027 18:30 -> Dec 1, 2027 23:30:00.000Z
    const nyWinterUtc = localDateTimeInTimezoneToUtcIso('2027-12-01', '18:30', 'America/New_York');
    expect(nyWinterUtc).toBe('2027-12-01T23:30:00.000Z');
    expect(utcIsoToLocalDateTimeInTimezone(nyWinterUtc, 'America/New_York')).toMatchObject({
      date: '2027-12-01',
      time: '18:30',
    });
  });

  it('rejects impossible calendar dates such as non-leap-year Feb 29', () => {
    expect(isValidIsoCalendarDate('2027-02-29')).toBe(false);
    expect(isValidIsoCalendarDate('2028-02-29')).toBe(true);
    expect(() => localDateTimeInTimezoneToUtcIso('2027-02-29', '12:00', 'UTC')).toThrow();
  });
});

describe('weddingSchemas validation (P2-AC03, P2-AC10)', () => {
  it('normalizes slugs, blocks reserved words, and defaults deadline time to 23:59 when date is set', () => {
    expect(suggestWeddingSlug('Elena', 'Mateo')).toBe('elena-mateo');
    expect(suggestWeddingSlug('a', '')).toBe('wedding-celebration');

    const parsed = createWeddingSchema.parse({
      partnerOneName: '  Elena ',
      partnerTwoName: ' Mateo  ',
      title: '  Elena & Mateo Celebration ',
      slug: '  ELENA-AND-MATEO-2027 ',
      eventDate: '2027-06-19',
      venueName: '  San Agustin Church ',
      venueLocation: ' Intramuros, Manila ',
      timezone: 'Asia/Manila',
      accessMode: 'invite_only',
      isRsvpOpen: true,
      rsvpDeadlineDate: '2027-05-15',
      rsvpDeadlineTime: '',
      allowPlusOnesDefault: true,
      showGuestDietaryNotes: true,
      contactEmail: '  RSVP@EXAMPLE.COM ',
    });

    expect(parsed.slug).toBe('elena-and-mateo-2027');
    expect(parsed.contactEmail).toBe('rsvp@example.com');
    expect(resolveRsvpDeadlineUtcIso(parsed)).toBe('2027-05-15T15:59:00.000Z');

    const reservedResult = updateWeddingDetailsSchema.safeParse({
      title: 'Reserved Slug Wedding',
      partnerOneName: 'Ava',
      partnerTwoName: 'Liam',
      slug: 'settings',
      eventDate: '',
      venueName: '',
      venueLocation: '',
    });
    expect(reservedResult.success).toBe(false);

    const timeWithoutDateResult = createWeddingSchema.safeParse({
      partnerOneName: 'Ava',
      partnerTwoName: 'Liam',
      title: 'Ava & Liam',
      slug: '',
      eventDate: '',
      venueName: '',
      venueLocation: '',
      timezone: 'UTC',
      accessMode: 'public',
      isRsvpOpen: true,
      rsvpDeadlineDate: '',
      rsvpDeadlineTime: '18:00',
      allowPlusOnesDefault: false,
      showGuestDietaryNotes: true,
      contactEmail: '',
    });
    expect(timeWithoutDateResult.success).toBe(false);
  });

  it('validates duplication and exact slug deletion confirmation', () => {
    const dup = duplicateWeddingSchema.parse({
      title: 'Copy of Elena & Mateo',
      slug: '',
      partnerOneName: '',
      partnerTwoName: 'Julian',
      eventDate: '',
    });
    expect(dup.slug).toBeUndefined();
    expect(dup.partnerOneName).toBeUndefined();
    expect(dup.partnerTwoName).toBe('Julian');
    expect(dup.eventDate).toBeNull();

    const delSchema = buildDeleteWeddingConfirmationSchema('elena-and-mateo-2027');
    expect(delSchema.safeParse({ confirmSlug: 'wrong-slug' }).success).toBe(false);
    expect(delSchema.safeParse({ confirmSlug: '  ELENA-AND-MATEO-2027 ' }).success).toBe(true);
  });

  it('preserves allowlisted /app/weddings/:weddingId deep-link redirects (P2-AC11)', () => {
    const path = buildOrganizerWeddingPath('11111111-2222-4333-8444-555555555555');
    expect(sanitizeOrganizerRedirect(path)).toBe(
      '/app/weddings/11111111-2222-4333-8444-555555555555',
    );
  });
});

describe('weddingPermissions & weddingErrors (P2-AC05)', () => {
  it('enforces UX RBAC split across owner, admin, editor, and viewer', () => {
    for (const role of ['owner', 'admin', 'editor'] as const) {
      expect(canCreateOrEditWedding(role)).toBe(true);
      expect(canDuplicateWedding(role)).toBe(true);
      expect(canArchiveOrRestoreWedding(role)).toBe(true);
    }

    expect(canCreateOrEditWedding('viewer')).toBe(false);
    expect(canDuplicateWedding('viewer')).toBe(false);
    expect(canArchiveOrRestoreWedding('viewer')).toBe(false);

    expect(canPermanentlyDeleteWedding('owner')).toBe(true);
    expect(canPermanentlyDeleteWedding('admin')).toBe(true);
    expect(canPermanentlyDeleteWedding('editor')).toBe(false);
    expect(canPermanentlyDeleteWedding('viewer')).toBe(false);
  });

  it('translates PostgreSQL domain prefixes and SQLSTATE codes into WeddingDomainError', () => {
    expect(
      translateWeddingError({
        code: '23505',
        message: 'WEDDING_SLUG_TAKEN: That public wedding URL slug is already in use.',
      }),
    ).toEqual(
      new WeddingDomainError(
        'WEDDING_SLUG_TAKEN',
        'That public wedding URL slug is already in use.',
      ),
    );

    expect(
      translateWeddingError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "weddings_slug_key"',
      }).code,
    ).toBe('WEDDING_SLUG_TAKEN');

    expect(
      translateWeddingError({
        code: 'P0002',
        message: 'WEDDING_NOT_FOUND: Source wedding project was not found in this workspace.',
      }).code,
    ).toBe('WEDDING_NOT_FOUND');

    expect(
      translateWeddingError({
        code: 'P0001',
        message: 'PUBLISHING_REQUIRES_SNAPSHOT: Weddings cannot transition to published.',
      }).code,
    ).toBe('PUBLISHING_REQUIRES_SNAPSHOT');

    expect(translateWeddingError({ code: '40P01', message: 'deadlock detected' }).code).toBe(
      'CONCURRENCY_RETRY',
    );
  });
});
