import {
  GUEST_SIDE_LABELS,
  INVITATION_DELIVERY_LABELS,
  type WeddingGuestDirectory,
} from '@/features/guests/schemas/guestSchemas';
import { type CsvPrimitiveCell, serializeCsvDocument } from '@/lib/utilities/csvExport';

/**
 * Exports the Organizer Guest & Household Directory as a formula-safe RFC-4180 CSV (`P8-AC09`, `P8-AC10`).
 * Never exports `token_hash` or raw invitation tokens.
 */
export function buildGuestDirectoryCsv(
  directory: WeddingGuestDirectory,
  referenceTimestampMs: number,
): string {
  const headers: readonly string[] = [
    'Household',
    'Household Max Attendees',
    'Named Members Count',
    'Guest First Name',
    'Guest Last Name',
    'Celebration Side',
    'Child Guest',
    'Dietary Notes',
    'Email',
    'Phone',
    'Invitation Link Status',
    'Delivery Status',
    'Link Expires At (UTC)',
    'Revoked Links Count',
    'Organizer Notes',
  ];

  const rows: Array<readonly CsvPrimitiveCell[]> = [];

  for (const { group, guests, activeInvitation, revokedCount } of directory.households) {
    let linkStatus = 'Not Issued';
    let deliveryStatus = '';
    let expiresAt = '';

    if (activeInvitation) {
      const isExpired =
        activeInvitation.expires_at !== null &&
        referenceTimestampMs > 0 &&
        Date.parse(activeInvitation.expires_at) <= referenceTimestampMs;
      linkStatus = isExpired ? 'Expired' : 'Active';
      deliveryStatus = INVITATION_DELIVERY_LABELS[activeInvitation.delivery_status];
      expiresAt = activeInvitation.expires_at ?? '';
    } else if (revokedCount > 0) {
      linkStatus = 'Revoked';
    }

    if (guests.length === 0) {
      rows.push([
        group.display_name,
        group.max_attendees,
        0,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        linkStatus,
        deliveryStatus,
        expiresAt,
        revokedCount,
        group.notes,
      ]);
      continue;
    }

    for (const guest of guests) {
      rows.push([
        group.display_name,
        group.max_attendees,
        guests.length,
        guest.first_name,
        guest.last_name,
        GUEST_SIDE_LABELS[guest.side],
        guest.is_child,
        guest.dietary_notes,
        guest.email,
        guest.phone,
        linkStatus,
        deliveryStatus,
        expiresAt,
        revokedCount,
        group.notes,
      ]);
    }
  }

  return serializeCsvDocument({ headers, rows });
}
