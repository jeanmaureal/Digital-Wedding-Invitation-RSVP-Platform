import { z } from 'zod';
import {
  isValidIanaTimezone,
  isValidIsoCalendarDate,
  isValidWallClockTime,
  localDateTimeInTimezoneToUtcIso,
} from '@/features/weddings/utils/weddingTimezone';
import type { Enums } from '@/types/database.types';

export type WeddingStatus = Enums<'wedding_status'>;
export type WeddingAccessMode = Enums<'wedding_access_mode'>;

export const WEDDING_STATUS_VALUES = [
  'draft',
  'published',
  'archived',
] as const satisfies readonly WeddingStatus[];

export const WEDDING_ACCESS_MODE_VALUES = [
  'public',
  'invite_only',
] as const satisfies readonly WeddingAccessMode[];

export const WEDDING_STATUS_LABELS: Readonly<Record<WeddingStatus, string>> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

export const WEDDING_ACCESS_MODE_LABELS: Readonly<Record<WeddingAccessMode, string>> = {
  public: 'Public Website + Token RSVP',
  invite_only: 'Invitation Link Only',
};

export const RESERVED_WEDDING_SLUGS = new Set<string>([
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'forgot-password',
  'health',
  'i',
  'internal',
  'login',
  'logout',
  'null',
  'public',
  'reset-password',
  'settings',
  'signup',
  'static',
  'support',
  'system',
  'undefined',
  'w',
  'webhook',
  'webhooks',
]);

const WEDDING_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRIMARY_LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;

export function suggestWeddingSlug(partnerOneName: string, partnerTwoName: string): string {
  const combined = `${partnerOneName.trim()} ${partnerTwoName.trim()}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 71)
    .replace(/-+$/g, '');

  if (combined.length < 3 || RESERVED_WEDDING_SLUGS.has(combined)) {
    return 'wedding-celebration';
  }
  return combined;
}

export const weddingTitleFieldSchema = z
  .string()
  .trim()
  .min(2, 'Wedding title must be at least 2 characters.')
  .max(120, 'Wedding title must be 120 characters or fewer.');

export const partnerNameFieldSchema = z
  .string()
  .trim()
  .min(1, 'Enter a partner name.')
  .max(80, 'Partner name must be 80 characters or fewer.');

export const weddingSlugRequiredSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(
    z
      .string()
      .min(3, 'URL slug must be at least 3 characters.')
      .max(80, 'URL slug must be 80 characters or fewer.')
      .regex(
        WEDDING_SLUG_PATTERN,
        'Use lowercase letters, numbers, and single hyphens only (for example, elena-mateo-2027).',
      )
      .refine(
        (slug) => !RESERVED_WEDDING_SLUGS.has(slug),
        'That URL slug is reserved by the platform.',
      ),
  );

export const optionalWeddingSlugFieldSchema = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value.toLowerCase()))
  .pipe(
    z
      .string()
      .min(3, 'URL slug must be at least 3 characters.')
      .max(80, 'URL slug must be 80 characters or fewer.')
      .regex(
        WEDDING_SLUG_PATTERN,
        'Use lowercase letters, numbers, and single hyphens only (for example, elena-mateo-2027).',
      )
      .refine(
        (slug) => !RESERVED_WEDDING_SLUGS.has(slug),
        'That URL slug is reserved by the platform.',
      )
      .optional(),
  );

export const optionalEventDateFieldSchema = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .refine(
    (value) => value === null || isValidIsoCalendarDate(value),
    'Enter a valid event date (YYYY-MM-DD).',
  );

export const venueNameFieldSchema = z
  .string()
  .trim()
  .max(120, 'Venue name must be 120 characters or fewer.');

export const venueLocationFieldSchema = z
  .string()
  .trim()
  .max(160, 'Venue location must be 160 characters or fewer.');

export const weddingTimezoneFieldSchema = z
  .string()
  .trim()
  .refine(isValidIanaTimezone, 'Choose a valid IANA timezone (for example, Asia/Manila or UTC).');

export const weddingAccessModeSchema = z.enum(WEDDING_ACCESS_MODE_VALUES);

export const optionalContactEmailFieldSchema = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value.toLowerCase()))
  .superRefine((value, ctx) => {
    if (value === null) {
      return;
    }
    if (value.length < 3 || value.length > 320 || !z.email().safeParse(value).success) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a valid contact email address.',
      });
    }
  });

export const createWeddingStepOneSchema = z.object({
  partnerOneName: partnerNameFieldSchema,
  partnerTwoName: partnerNameFieldSchema,
  title: weddingTitleFieldSchema,
  slug: optionalWeddingSlugFieldSchema,
  eventDate: optionalEventDateFieldSchema,
  venueName: venueNameFieldSchema,
  venueLocation: venueLocationFieldSchema,
});

function validateDeadlineFields(
  values: {
    readonly timezone: string;
    readonly rsvpDeadlineDate: string;
    readonly rsvpDeadlineTime: string;
  },
  ctx: z.RefinementCtx,
): void {
  const trimmedDate = values.rsvpDeadlineDate.trim();
  const trimmedTime = values.rsvpDeadlineTime.trim();

  if (trimmedTime.length > 0 && trimmedDate.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['rsvpDeadlineDate'],
      message: 'Select an RSVP deadline date when specifying a deadline time.',
    });
    return;
  }

  if (trimmedDate.length > 0 && !isValidIsoCalendarDate(trimmedDate)) {
    ctx.addIssue({
      code: 'custom',
      path: ['rsvpDeadlineDate'],
      message: 'Enter a valid RSVP deadline date (YYYY-MM-DD).',
    });
    return;
  }

  if (trimmedTime.length > 0 && !isValidWallClockTime(trimmedTime)) {
    ctx.addIssue({
      code: 'custom',
      path: ['rsvpDeadlineTime'],
      message: 'Enter a valid 24-hour time (HH:mm).',
    });
  }
}

export function resolveRsvpDeadlineUtcIso(params: {
  readonly timezone: string;
  readonly rsvpDeadlineDate: string;
  readonly rsvpDeadlineTime: string;
}): string | null {
  const cleanDate = params.rsvpDeadlineDate.trim();
  if (cleanDate.length === 0) {
    return null;
  }
  const effectiveTime =
    params.rsvpDeadlineTime.trim().length > 0 ? params.rsvpDeadlineTime.trim() : '23:59';
  return localDateTimeInTimezoneToUtcIso(cleanDate, effectiveTime, params.timezone);
}

export const createWeddingSchema = createWeddingStepOneSchema
  .extend({
    timezone: weddingTimezoneFieldSchema,
    accessMode: weddingAccessModeSchema,
    isRsvpOpen: z.boolean(),
    rsvpDeadlineDate: z.string().trim(),
    rsvpDeadlineTime: z.string().trim(),
    allowPlusOnesDefault: z.boolean(),
    showGuestDietaryNotes: z.boolean(),
    contactEmail: optionalContactEmailFieldSchema,
  })
  .superRefine(validateDeadlineFields);

export type CreateWeddingFormValues = z.input<typeof createWeddingSchema>;
export type CreateWeddingParsedValues = z.output<typeof createWeddingSchema>;

export const updateWeddingDetailsSchema = z.object({
  title: weddingTitleFieldSchema,
  partnerOneName: partnerNameFieldSchema,
  partnerTwoName: partnerNameFieldSchema,
  slug: weddingSlugRequiredSchema,
  eventDate: optionalEventDateFieldSchema,
  venueName: venueNameFieldSchema,
  venueLocation: venueLocationFieldSchema,
});

export type UpdateWeddingDetailsFormValues = z.input<typeof updateWeddingDetailsSchema>;
export type UpdateWeddingDetailsPayload = z.output<typeof updateWeddingDetailsSchema>;

export const updateWeddingSettingsSchema = z
  .object({
    timezone: weddingTimezoneFieldSchema,
    accessMode: weddingAccessModeSchema,
    isRsvpOpen: z.boolean(),
    rsvpDeadlineDate: z.string().trim(),
    rsvpDeadlineTime: z.string().trim(),
    allowPlusOnesDefault: z.boolean(),
    showGuestDietaryNotes: z.boolean(),
    primaryLocale: z
      .string()
      .trim()
      .regex(PRIMARY_LOCALE_PATTERN, 'Enter a valid locale such as en or en-US.'),
    contactEmail: optionalContactEmailFieldSchema,
    dressCode: z.string().trim().max(120, 'Dress code must be 120 characters or fewer.'),
    rsvpConfirmationMessage: z
      .string()
      .trim()
      .max(500, 'RSVP confirmation message must be 500 characters or fewer.'),
  })
  .superRefine(validateDeadlineFields);

export type UpdateWeddingSettingsFormValues = z.input<typeof updateWeddingSettingsSchema>;
export type UpdateWeddingSettingsParsedValues = z.output<typeof updateWeddingSettingsSchema>;

export const duplicateWeddingSchema = z.object({
  title: weddingTitleFieldSchema,
  slug: optionalWeddingSlugFieldSchema,
  partnerOneName: z
    .string()
    .trim()
    .max(80, 'Partner 1 name must be 80 characters or fewer.')
    .transform((value) => (value.length === 0 ? undefined : value)),
  partnerTwoName: z
    .string()
    .trim()
    .max(80, 'Partner 2 name must be 80 characters or fewer.')
    .transform((value) => (value.length === 0 ? undefined : value)),
  eventDate: optionalEventDateFieldSchema,
});

export type DuplicateWeddingFormValues = z.input<typeof duplicateWeddingSchema>;
export type DuplicateWeddingPayload = z.output<typeof duplicateWeddingSchema>;

export function buildDeleteWeddingConfirmationSchema(expectedSlug: string) {
  return z.object({
    confirmSlug: z
      .string()
      .trim()
      .transform((value) => value.toLowerCase())
      .refine(
        (value) => value === expectedSlug,
        `Type "${expectedSlug}" exactly to confirm permanent deletion.`,
      ),
  });
}
