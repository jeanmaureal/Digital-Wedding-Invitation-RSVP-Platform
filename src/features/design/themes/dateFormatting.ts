export function formatInvitationEventDate(eventDate: string | null): string {
  if (!eventDate) {
    return 'Celebration Date to Follow';
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate.trim());
  if (!match) {
    return eventDate;
  }
  const utcDate = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0),
  );
  if (Number.isNaN(utcDate.getTime())) {
    return eventDate;
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(utcDate);
}

export function formatInvitationDeadline(
  rsvpDeadline: string | null,
  timeZone: string,
): string | null {
  if (!rsvpDeadline) {
    return null;
  }
  const parsed = new Date(rsvpDeadline);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  let safeZone = 'UTC';
  try {
    const candidate = timeZone.trim();
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    safeZone = candidate;
  } catch {
    // Keep 'UTC' fallback when timezone identifier is invalid.
  }

  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone,
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(parsed);

  return `${formatted} (${safeZone})`;
}
