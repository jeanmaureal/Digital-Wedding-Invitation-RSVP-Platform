import { z } from 'zod';
import {
  OrganizerRsvpDomainError,
  translateOrganizerRsvpError,
} from '@/features/rsvp/api/rsvpErrors';
import {
  type OrganizerHouseholdAnswerView,
  type OrganizerHouseholdAttendeeStatus,
  type OrganizerHouseholdRsvpEntry,
  type OrganizerParsedQuestion,
  parseQuestionOptionsText,
  type RsvpAnswerRow,
  type RsvpAttendeeRow,
  type RsvpQuestionFormValues,
  rsvpQuestionFormSchema,
  type RsvpQuestionRow,
  type RsvpSubmissionRow,
  type WeddingRsvpOverview,
} from '@/features/rsvp/schemas/organizerRsvpSchemas';
import { getOrganizerSupabaseClient } from '@/lib/supabase/organizerClient';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';
import type { Json, Tables } from '@/types/database.types';

const stringArraySchema = z.array(z.string());

function requireClient(override?: TypedSupabaseClient | null): TypedSupabaseClient {
  const resolved = override === undefined ? getOrganizerSupabaseClient() : override;
  if (!resolved) {
    throw new OrganizerRsvpDomainError(
      'UNCONFIGURED',
      'Supabase client is not configured in this environment.',
    );
  }
  return resolved;
}

function mapQuestionRow(row: RsvpQuestionRow): OrganizerParsedQuestion {
  const parsedOpts = stringArraySchema.safeParse(row.options);
  return {
    id: row.id,
    label: row.label,
    helpText: row.help_text,
    questionType: row.question_type,
    options: parsedOpts.success ? parsedOpts.data : [],
    isRequired: row.is_required,
    sortOrder: row.sort_order,
  };
}

export async function fetchWeddingRsvpOverview(params: {
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly client?: TypedSupabaseClient | null;
}): Promise<WeddingRsvpOverview> {
  const client = requireClient(params.client);

  const [groupsRes, guestsRes, questionsRes, submissionsRes, attendeesRes, answersRes] =
    await Promise.all([
      client
        .from('guest_groups')
        .select('id, display_name, max_attendees, sort_order, created_at')
        .eq('workspace_id', params.workspaceId)
        .eq('wedding_id', params.weddingId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      client
        .from('guests')
        .select(
          'id, group_id, first_name, last_name, is_child, dietary_notes, sort_order, created_at',
        )
        .eq('workspace_id', params.workspaceId)
        .eq('wedding_id', params.weddingId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      client
        .from('rsvp_questions')
        .select(
          'id, wedding_id, workspace_id, label, help_text, question_type, options, is_required, sort_order, created_at, updated_at',
        )
        .eq('workspace_id', params.workspaceId)
        .eq('wedding_id', params.weddingId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      client
        .from('rsvp_submissions')
        .select(
          'id, group_id, wedding_id, workspace_id, invitation_id, overall_status, attending_count, additional_guests_count, household_note, response_version, submitted_at, updated_at',
        )
        .eq('workspace_id', params.workspaceId)
        .eq('wedding_id', params.weddingId)
        .order('updated_at', { ascending: false }),
      client
        .from('rsvp_attendees')
        .select(
          'id, submission_id, group_id, guest_id, wedding_id, workspace_id, attendance_status, dietary_notes, created_at, updated_at',
        )
        .eq('workspace_id', params.workspaceId)
        .eq('wedding_id', params.weddingId)
        .order('group_id', { ascending: true })
        .order('submission_id', { ascending: true }),
      client
        .from('rsvp_answers')
        .select(
          'id, submission_id, group_id, question_id, wedding_id, workspace_id, answer_text, created_at, updated_at',
        )
        .eq('workspace_id', params.workspaceId)
        .eq('wedding_id', params.weddingId)
        .order('group_id', { ascending: true })
        .order('submission_id', { ascending: true }),
    ]);

  if (groupsRes.error) throw translateOrganizerRsvpError(groupsRes.error);
  if (guestsRes.error) throw translateOrganizerRsvpError(guestsRes.error);
  if (questionsRes.error) throw translateOrganizerRsvpError(questionsRes.error);
  if (submissionsRes.error) throw translateOrganizerRsvpError(submissionsRes.error);
  if (attendeesRes.error) throw translateOrganizerRsvpError(attendeesRes.error);
  if (answersRes.error) throw translateOrganizerRsvpError(answersRes.error);

  const questions = (questionsRes.data ?? []).map(mapQuestionRow);
  const questionLabelById = new Map<string, string>();
  for (const q of questions) {
    questionLabelById.set(q.id, q.label);
  }

  type PartialGuestRow = Pick<
    Tables<'guests'>,
    'id' | 'group_id' | 'first_name' | 'last_name' | 'is_child' | 'dietary_notes'
  >;
  const guestsByGroupId = new Map<string, PartialGuestRow[]>();
  for (const guest of guestsRes.data ?? []) {
    const bucket = guestsByGroupId.get(guest.group_id);
    if (bucket) {
      bucket.push(guest);
    } else {
      guestsByGroupId.set(guest.group_id, [guest]);
    }
  }

  const submissionByGroupId = new Map<string, RsvpSubmissionRow>();
  for (const sub of submissionsRes.data ?? []) {
    submissionByGroupId.set(sub.group_id, sub);
  }

  const attendeeByGuestId = new Map<string, RsvpAttendeeRow>();
  for (const att of attendeesRes.data ?? []) {
    attendeeByGuestId.set(att.guest_id, att);
  }

  const answersBySubmissionId = new Map<string, RsvpAnswerRow[]>();
  for (const ans of answersRes.data ?? []) {
    const bucket = answersBySubmissionId.get(ans.submission_id);
    if (bucket) {
      bucket.push(ans);
    } else {
      answersBySubmissionId.set(ans.submission_id, [ans]);
    }
  }

  let respondedHouseholdsCount = 0;
  let attendingHouseholdsCount = 0;
  let declinedHouseholdsCount = 0;
  let totalAttendingGuestsCount = 0;

  const households: OrganizerHouseholdRsvpEntry[] = (groupsRes.data ?? []).map((group) => {
    const submission = submissionByGroupId.get(group.id) ?? null;
    const groupGuests = guestsByGroupId.get(group.id) ?? [];

    let responseState: 'attending' | 'declined' | 'pending' = 'pending';
    if (submission) {
      respondedHouseholdsCount += 1;
      responseState = submission.overall_status;
      if (submission.overall_status === 'attending') {
        attendingHouseholdsCount += 1;
        totalAttendingGuestsCount += submission.attending_count;
      } else {
        declinedHouseholdsCount += 1;
      }
    }

    const attendees: OrganizerHouseholdAttendeeStatus[] = groupGuests.map((guest) => {
      const recorded = attendeeByGuestId.get(guest.id);
      return {
        guestId: guest.id,
        firstName: guest.first_name,
        lastName: guest.last_name,
        isChild: guest.is_child,
        attendanceStatus: recorded ? recorded.attendance_status : 'pending',
        dietaryNotes: recorded ? recorded.dietary_notes : guest.dietary_notes,
      };
    });

    const rawAnswers = submission ? (answersBySubmissionId.get(submission.id) ?? []) : [];
    const answers: OrganizerHouseholdAnswerView[] = rawAnswers.map((ans) => ({
      questionId: ans.question_id,
      questionLabel: questionLabelById.get(ans.question_id) ?? 'Custom Question',
      answerText: ans.answer_text,
    }));

    return {
      groupId: group.id,
      displayName: group.display_name,
      maxAttendees: group.max_attendees,
      responseState,
      submission,
      attendees,
      answers,
    };
  });

  const totalHouseholds = households.length;
  const pendingHouseholdsCount = totalHouseholds - respondedHouseholdsCount;

  return {
    questions,
    households,
    totalHouseholds,
    respondedHouseholdsCount,
    pendingHouseholdsCount,
    attendingHouseholdsCount,
    declinedHouseholdsCount,
    totalAttendingGuestsCount,
  };
}

export async function createOrganizerRsvpQuestion(params: {
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly values: RsvpQuestionFormValues;
  readonly sortOrder: number;
  readonly client?: TypedSupabaseClient | null;
}): Promise<OrganizerParsedQuestion> {
  const parsed = rsvpQuestionFormSchema.parse(params.values);
  const client = requireClient(params.client);

  const optionsJson: Json =
    parsed.questionType === 'single_select'
      ? [...parseQuestionOptionsText(parsed.optionsText)]
      : [];

  const { data, error } = await client
    .from('rsvp_questions')
    .insert({
      workspace_id: params.workspaceId,
      wedding_id: params.weddingId,
      label: parsed.label,
      help_text: parsed.helpText,
      question_type: parsed.questionType,
      options: optionsJson,
      is_required: parsed.isRequired,
      sort_order: params.sortOrder,
    })
    .select(
      'id, wedding_id, workspace_id, label, help_text, question_type, options, is_required, sort_order, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    throw translateOrganizerRsvpError(error);
  }
  return mapQuestionRow(data);
}

export async function updateOrganizerRsvpQuestion(params: {
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly questionId: string;
  readonly values: RsvpQuestionFormValues;
  readonly sortOrder: number;
  readonly client?: TypedSupabaseClient | null;
}): Promise<OrganizerParsedQuestion> {
  const parsed = rsvpQuestionFormSchema.parse(params.values);
  const client = requireClient(params.client);

  const optionsJson: Json =
    parsed.questionType === 'single_select'
      ? [...parseQuestionOptionsText(parsed.optionsText)]
      : [];

  const { data, error } = await client
    .from('rsvp_questions')
    .update({
      label: parsed.label,
      help_text: parsed.helpText,
      question_type: parsed.questionType,
      options: optionsJson,
      is_required: parsed.isRequired,
      sort_order: params.sortOrder,
    })
    .eq('workspace_id', params.workspaceId)
    .eq('wedding_id', params.weddingId)
    .eq('id', params.questionId)
    .select(
      'id, wedding_id, workspace_id, label, help_text, question_type, options, is_required, sort_order, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    throw translateOrganizerRsvpError(error);
  }
  return mapQuestionRow(data);
}

export async function deleteOrganizerRsvpQuestion(params: {
  readonly workspaceId: string;
  readonly weddingId: string;
  readonly questionId: string;
  readonly client?: TypedSupabaseClient | null;
}): Promise<void> {
  const client = requireClient(params.client);

  const { error } = await client
    .from('rsvp_questions')
    .delete()
    .eq('workspace_id', params.workspaceId)
    .eq('wedding_id', params.weddingId)
    .eq('id', params.questionId);

  if (error) {
    throw translateOrganizerRsvpError(error);
  }
}
