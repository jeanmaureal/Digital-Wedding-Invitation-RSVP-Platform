import type { StoryMilestone } from '@/features/design/schemas/designSchemas';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatMilestoneDate(rawDate: string | undefined): string | null {
  const trimmed = rawDate?.trim() ?? '';
  if (!trimmed) {
    return null;
  }
  const match = ISO_DATE_PATTERN.exec(trimmed);
  if (match) {
    const year = Number.parseInt(match[1]!, 10);
    const month = Number.parseInt(match[2]!, 10);
    const day = Number.parseInt(match[3]!, 10);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
    }
  }
  return trimmed;
}

export function hasMilestoneContent(milestone: StoryMilestone): boolean {
  return Boolean(
    milestone.periodLabel.trim() ||
      milestone.dateLabel?.trim() ||
      milestone.title.trim() ||
      milestone.description.trim() ||
      (milestone.images && milestone.images.length > 0),
  );
}
