import { z } from 'zod';
import type { Database } from '@/types/database.types';

export type GuestGroupRow = Database['public']['Tables']['guest_groups']['Row'];
export type GuestRow = Database['public']['Tables']['guests']['Row'];
export type SafeInvitationRow = Omit<
  Database['public']['Tables']['invitations']['Row'],
  'token_hash'
>;
export type GuestSide = Database['public']['Enums']['guest_side'];
export type InvitationStatus = Database['public']['Enums']['invitation_status'];
export type InvitationDeliveryStatus = Database['public']['Enums']['invitation_delivery_status'];

export const GUEST_SIDE_OPTIONS = ['partner_one', 'partner_two', 'mutual', 'other'] as const;

export const GUEST_SIDE_LABELS: Readonly<Record<GuestSide, string>> = {
  partner_one: 'Partner 1 Side',
  partner_two: 'Partner 2 Side',
  mutual: 'Mutual Friends & Family',
  other: 'Other / VIP',
};

export const INVITATION_DELIVERY_LABELS: Readonly<Record<InvitationDeliveryStatus, string>> = {
  not_shared: 'Not Shared Yet',
  shared: 'Shared with Household',
};

const UNSAFE_SCRIPT_OR_URI_PATTERN = /<\s*script\b|(?:javascript|vbscript):|data:\s*text\/html/i;

function hasSafeText(value: string): boolean {
  return !UNSAFE_SCRIPT_OR_URI_PATTERN.test(value);
}

export const guestSideSchema = z.enum(GUEST_SIDE_OPTIONS);
export const invitationDeliveryStatusSchema = z.enum(['not_shared', 'shared']);

export const householdFormSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Household name is required.')
    .max(120, 'Household name must be 120 characters or fewer.')
    .refine(hasSafeText, 'Unsafe script or URI markup is not permitted.'),
  maxAttendees: z
    .number({ message: 'Max attendees must be a whole number between 1 and 50.' })
    .int('Max attendees must be a whole number.')
    .min(1, 'Household attendance limit must be at least 1.')
    .max(50, 'Household attendance limit must be 50 or fewer.'),
  notes: z
    .string()
    .trim()
    .max(500, 'Organizer notes must be 500 characters or fewer.')
    .refine(hasSafeText, 'Unsafe script or URI markup is not permitted.'),
});

export type HouseholdFormValues = z.infer<typeof householdFormSchema>;

const optionalGuestEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320, 'Email address must be 320 characters or fewer.')
  .refine(
    (value) => value === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
    'Enter a valid email address or leave blank.',
  )
  .refine(hasSafeText, 'Unsafe script or URI markup is not permitted.');

export const guestMemberFormSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'First name is required.')
    .max(80, 'First name must be 80 characters or fewer.')
    .refine(hasSafeText, 'Unsafe script or URI markup is not permitted.'),
  lastName: z
    .string()
    .trim()
    .max(80, 'Last name must be 80 characters or fewer.')
    .refine(hasSafeText, 'Unsafe script or URI markup is not permitted.'),
  email: optionalGuestEmailSchema,
  phone: z
    .string()
    .trim()
    .max(40, 'Phone number must be 40 characters or fewer.')
    .refine(hasSafeText, 'Unsafe script or URI markup is not permitted.'),
  side: guestSideSchema,
  isChild: z.boolean(),
  dietaryNotes: z
    .string()
    .trim()
    .max(300, 'Dietary notes must be 300 characters or fewer.')
    .refine(hasSafeText, 'Unsafe script or URI markup is not permitted.'),
});

export type GuestMemberFormValues = z.infer<typeof guestMemberFormSchema>;

export interface ImportedGuestPayload {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly side: GuestSide;
  readonly isChild: boolean;
  readonly dietaryNotes: string;
}

export interface ImportedHouseholdPayload {
  readonly displayName: string;
  readonly maxAttendees: number;
  readonly notes: string;
  readonly guests: readonly ImportedGuestPayload[];
}

export interface IssuedHouseholdInvitationPayload {
  readonly rawToken: string;
  readonly invitation: SafeInvitationRow;
}

export interface HouseholdWithDetails {
  readonly group: GuestGroupRow;
  readonly guests: readonly GuestRow[];
  readonly activeInvitation: SafeInvitationRow | null;
  readonly revokedCount: number;
}

export interface WeddingGuestDirectory {
  readonly households: readonly HouseholdWithDetails[];
  readonly totalHouseholds: number;
  readonly totalGuests: number;
  readonly totalCapacity: number;
  readonly activeLinksCount: number;
  readonly sharedLinksCount: number;
}
