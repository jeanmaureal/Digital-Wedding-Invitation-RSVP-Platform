import { z } from 'zod';
import type { Database } from '@/types/database.types';

export type RsvpQuestionRow = Database['public']['Tables']['rsvp_questions']['Row'];
export type RsvpSubmissionRow = Database['public']['Tables']['rsvp_submissions']['Row'];
export type RsvpAttendeeRow = Database['public']['Tables']['rsvp_attendees']['Row'];
export type RsvpAnswerRow = Database['public']['Tables']['rsvp_answers']['Row'];
export type RsvpQuestionType = Database['public']['Enums']['rsvp_question_type'];
export type RsvpAttendanceStatus = Database['public']['Enums']['rsvp_attendance_status'];

export const RSVP_QUESTION_TYPE_OPTIONS = ['short_text', 'single_select', 'boolean'] as const;

export const RSVP_QUESTION_TYPE_LABELS: Readonly<Record<RsvpQuestionType, string>> = {
  short_text: 'Short Text Response',
  single_select: 'Single Choice (Dropdown)',
  boolean: 'Yes / No Question',
};

const UNSAFE_SCRIPT_OR_URI_PATTERN = /<\s*script\b|(?:javascript|vbscript):|data:\s*text\/html/i;

function hasSafeText(value: string): boolean {
  return !UNSAFE_SCRIPT_OR_URI_PATTERN.test(value);
}

export function parseQuestionOptionsText(rawOptionsText: string): readonly string[] {
  return rawOptionsText
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export const rsvpQuestionFormSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, 'Question prompt is required.')
      .max(160, 'Question prompt must be 160 characters or fewer.')
      .refine(hasSafeText, 'Unsafe script or URI markup is not permitted.'),
    helpText: z
      .string()
      .trim()
      .max(240, 'Help text must be 240 characters or fewer.')
      .refine(hasSafeText, 'Unsafe script or URI markup is not permitted.'),
    questionType: z.enum(RSVP_QUESTION_TYPE_OPTIONS),
    optionsText: z
      .string()
      .max(1200, 'Options list is too long.')
      .refine(hasSafeText, 'Unsafe script or URI markup is not permitted.'),
    isRequired: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.questionType !== 'single_select') {
      return;
    }

    const parsedOptions = parseQuestionOptionsText(values.optionsText);
    if (parsedOptions.length < 2 || parsedOptions.length > 10) {
      ctx.addIssue({
        code: 'custom',
        path: ['optionsText'],
        message: 'Provide between 2 and 10 choices (separated by commas or new lines).',
      });
      return;
    }

    const seen = new Set<string>();
    for (const opt of parsedOptions) {
      if (opt.length > 80) {
        ctx.addIssue({
          code: 'custom',
          path: ['optionsText'],
          message: 'Each option must be 80 characters or fewer.',
        });
        return;
      }
      const lower = opt.toLowerCase();
      if (seen.has(lower)) {
        ctx.addIssue({
          code: 'custom',
          path: ['optionsText'],
          message: 'Single-choice options must be distinct.',
        });
        return;
      }
      seen.add(lower);
    }
  });

export type RsvpQuestionFormValues = z.infer<typeof rsvpQuestionFormSchema>;

export interface OrganizerParsedQuestion {
  readonly id: string;
  readonly label: string;
  readonly helpText: string;
  readonly questionType: RsvpQuestionType;
  readonly options: readonly string[];
  readonly isRequired: boolean;
  readonly sortOrder: number;
}

export interface OrganizerHouseholdAttendeeStatus {
  readonly guestId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly isChild: boolean;
  readonly attendanceStatus: RsvpAttendanceStatus | 'pending';
  readonly dietaryNotes: string;
}

export interface OrganizerHouseholdAnswerView {
  readonly questionId: string;
  readonly questionLabel: string;
  readonly answerText: string;
}

export interface OrganizerHouseholdRsvpEntry {
  readonly groupId: string;
  readonly displayName: string;
  readonly maxAttendees: number;
  readonly responseState: 'attending' | 'declined' | 'pending';
  readonly submission: RsvpSubmissionRow | null;
  readonly attendees: readonly OrganizerHouseholdAttendeeStatus[];
  readonly answers: readonly OrganizerHouseholdAnswerView[];
}

export interface WeddingRsvpOverview {
  readonly questions: readonly OrganizerParsedQuestion[];
  readonly households: readonly OrganizerHouseholdRsvpEntry[];
  readonly totalHouseholds: number;
  readonly respondedHouseholdsCount: number;
  readonly pendingHouseholdsCount: number;
  readonly attendingHouseholdsCount: number;
  readonly declinedHouseholdsCount: number;
  readonly totalAttendingGuestsCount: number;
}
