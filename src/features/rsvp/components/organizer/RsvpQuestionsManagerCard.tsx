import { zodResolver } from '@hookform/resolvers/zod';
import { HelpCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { type JSX, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  type OrganizerParsedQuestion,
  RSVP_QUESTION_TYPE_LABELS,
  RSVP_QUESTION_TYPE_OPTIONS,
  type RsvpQuestionFormValues,
  rsvpQuestionFormSchema,
  type RsvpQuestionType,
} from '@/features/rsvp/schemas/organizerRsvpSchemas';

interface QuestionFormProps {
  readonly mode: 'create' | 'edit';
  readonly initialValues?: RsvpQuestionFormValues;
  readonly isSubmitting: boolean;
  readonly errorMessage: string | null;
  readonly onSubmitValues: (values: RsvpQuestionFormValues) => Promise<void>;
  readonly onCancel: () => void;
}

const DEFAULT_QUESTION_VALUES: RsvpQuestionFormValues = {
  label: '',
  helpText: '',
  questionType: 'short_text',
  optionsText: '',
  isRequired: false,
};

function RsvpQuestionEditorForm({
  mode,
  initialValues = DEFAULT_QUESTION_VALUES,
  isSubmitting,
  errorMessage,
  onSubmitValues,
  onCancel,
}: QuestionFormProps): JSX.Element {
  const [selectedType, setSelectedType] = useState<RsvpQuestionType>(initialValues.questionType);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RsvpQuestionFormValues>({
    resolver: zodResolver(rsvpQuestionFormSchema),
    defaultValues: initialValues,
  });

  const typeRegistration = register('questionType');

  return (
    <form
      noValidate
      data-testid={mode === 'create' ? 'create-rsvp-question-form' : 'edit-rsvp-question-form'}
      onSubmit={(event) => void handleSubmit(onSubmitValues)(event)}
      className="bg-muted/30 space-y-4 rounded-lg border p-4"
    >
      <h3 className="text-sm font-semibold">
        {mode === 'create' ? 'Add Custom RSVP Question' : 'Edit Custom RSVP Question'}
      </h3>

      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
        <div className="space-y-1.5">
          <Label htmlFor={`rsvp-q-label-${mode}`}>Question Prompt</Label>
          <Input
            id={`rsvp-q-label-${mode}`}
            data-testid="rsvp-question-label-input"
            placeholder="e.g., Reception Entrée Preference"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.label)}
            {...register('label')}
          />
          {errors.label ? (
            <p role="alert" className="text-destructive text-xs">
              {errors.label.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`rsvp-q-type-${mode}`}>Answer Type</Label>
          <NativeSelect
            id={`rsvp-q-type-${mode}`}
            data-testid="rsvp-question-type-select"
            disabled={isSubmitting}
            {...typeRegistration}
            onChange={(event) => {
              void typeRegistration.onChange(event);
              setSelectedType(event.target.value as RsvpQuestionType);
            }}
          >
            {RSVP_QUESTION_TYPE_OPTIONS.map((typeOpt) => (
              <option key={typeOpt} value={typeOpt}>
                {RSVP_QUESTION_TYPE_LABELS[typeOpt]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {selectedType === 'single_select' ? (
        <div className="space-y-1.5">
          <Label htmlFor={`rsvp-q-options-${mode}`}>Choices (2–10, comma or line separated)</Label>
          <Textarea
            id={`rsvp-q-options-${mode}`}
            data-testid="rsvp-question-options-input"
            rows={3}
            placeholder="Herb-Crusted Salmon, Braised Short Rib, Truffle Risotto"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.optionsText)}
            {...register('optionsText')}
          />
          {errors.optionsText ? (
            <p role="alert" className="text-destructive text-xs">
              {errors.optionsText.message}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor={`rsvp-q-help-${mode}`}>Helper Note (optional)</Label>
        <Input
          id={`rsvp-q-help-${mode}`}
          data-testid="rsvp-question-help-input"
          placeholder="Optional instructions shown beneath the prompt"
          disabled={isSubmitting}
          aria-invalid={Boolean(errors.helpText)}
          {...register('helpText')}
        />
        {errors.helpText ? (
          <p role="alert" className="text-destructive text-xs">
            {errors.helpText.message}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`rsvp-q-required-${mode}`}
          data-testid="rsvp-question-required-checkbox"
          type="checkbox"
          disabled={isSubmitting}
          className="size-4 rounded border"
          {...register('isRequired')}
        />
        <Label htmlFor={`rsvp-q-required-${mode}`} className="text-xs font-normal">
          Required when household responds Attending
        </Label>
      </div>

      {errorMessage ? (
        <p role="alert" className="text-destructive text-xs">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting}
          data-testid="save-rsvp-question-button"
        >
          {isSubmitting ? 'Saving…' : mode === 'create' ? 'Add Question' : 'Save Question Changes'}
        </Button>
      </div>
    </form>
  );
}

export interface RsvpQuestionsManagerCardProps {
  readonly questions: readonly OrganizerParsedQuestion[];
  readonly isWritable: boolean;
  readonly isMutating: boolean;
  readonly mutationError: string | null;
  readonly onCreateQuestion: (values: RsvpQuestionFormValues) => Promise<void>;
  readonly onUpdateQuestion: (
    questionId: string,
    sortOrder: number,
    values: RsvpQuestionFormValues,
  ) => Promise<void>;
  readonly onDeleteQuestion: (questionId: string) => Promise<void>;
}

export function RsvpQuestionsManagerCard({
  questions,
  isWritable,
  isMutating,
  mutationError,
  onCreateQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
}: RsvpQuestionsManagerCardProps): JSX.Element {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  return (
    <Card data-testid="rsvp-questions-manager-card">
      <CardHeader>
        <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <HelpCircle className="text-primary size-5 shrink-0" aria-hidden="true" />
              <span>Custom RSVP Questions ({questions.length})</span>
            </CardTitle>
            <CardDescription>
              Configure meal choices, shuttle logistics, or song prompts asked when invited
              households respond Attending on <code>/i/:token</code>.
            </CardDescription>
          </div>

          {isWritable ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setShowCreateForm((prev) => !prev);
                setEditingQuestionId(null);
              }}
              data-testid="open-create-rsvp-question-button"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add Question
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isWritable && showCreateForm ? (
          <RsvpQuestionEditorForm
            mode="create"
            isSubmitting={isMutating}
            errorMessage={mutationError}
            onSubmitValues={async (values) => {
              await onCreateQuestion(values);
              setShowCreateForm(false);
            }}
            onCancel={() => setShowCreateForm(false)}
          />
        ) : null}

        {questions.length === 0 ? (
          <p
            data-testid="rsvp-questions-empty"
            className="text-muted-foreground py-4 text-center text-xs"
          >
            No custom RSVP questions configured yet. Standard household attendance &amp; dietary
            fields remain active automatically.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {questions.map((question) => {
              const isEditingThis = editingQuestionId === question.id;

              return (
                <li
                  key={question.id}
                  data-testid={`rsvp-question-row-${question.id}`}
                  className="p-3.5"
                >
                  {isWritable && isEditingThis ? (
                    <RsvpQuestionEditorForm
                      mode="edit"
                      initialValues={{
                        label: question.label,
                        helpText: question.helpText,
                        questionType: question.questionType,
                        optionsText: question.options.join(', '),
                        isRequired: question.isRequired,
                      }}
                      isSubmitting={isMutating}
                      errorMessage={mutationError}
                      onSubmitValues={async (values) => {
                        await onUpdateQuestion(question.id, question.sortOrder, values);
                        setEditingQuestionId(null);
                      }}
                      onCancel={() => setEditingQuestionId(null)}
                    />
                  ) : (
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{question.label}</span>
                          <Badge variant="outline" className="text-[11px]">
                            {RSVP_QUESTION_TYPE_LABELS[question.questionType]}
                          </Badge>
                          {question.isRequired ? (
                            <Badge variant="secondary" className="text-[11px]">
                              Required
                            </Badge>
                          ) : null}
                        </div>
                        {question.helpText ? (
                          <p className="text-muted-foreground text-xs">{question.helpText}</p>
                        ) : null}
                        {question.options.length > 0 ? (
                          <p className="text-muted-foreground text-xs">
                            Choices: {question.options.join(' · ')}
                          </p>
                        ) : null}
                      </div>

                      {isWritable ? (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingQuestionId(question.id)}
                            data-testid={`edit-rsvp-question-${question.id}`}
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isMutating}
                            onClick={() => void onDeleteQuestion(question.id)}
                            data-testid={`delete-rsvp-question-${question.id}`}
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            Delete
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
